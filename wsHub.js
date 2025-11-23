// src/wsHub.js
// WebSocket hub for minute-candle streaming
// Protocol (JSON):
//  - client -> server:
//      { "type":"subscribe", "ticker":"005930", "interval":1 }
//      { "type":"unsubscribe", "ticker":"005930" }
//  - server -> client:
//      { "type":"snapshot", "ticker":"005930", "interval":1, "candles":[...] }
//      { "type":"candle", "ticker":"005930", "interval":1, "candle":{ t,o,h,l,c,v } }
//      { "type":"error", "message":"..." }

const WebSocket = require('ws');
const url = require('url');

const clients = new Map(); // socket -> { tickers:Set<string>, interval:number, isAlive:boolean }
const subsByTicker = new Map(); // ticker -> Set<WebSocket>

/**
 * attachWs
 * @param {import('http').Server} server - http.Server (app.listen(...)이 반환)
 * @param {object} deps
 * @param {(ticker:string, interval:number)=>Promise<Array<{t:string,o:number,h:number,l:number,c:number,v:number}>>} [deps.getCandles]
 *        초기 구독 시 스냅샷을 내려줄 함수 (선택)
 * @returns {{ wss: import('ws').Server, pushCandle: (ticker:string, candle:object)=>void }}
 */
function attachWs(server, deps = {}) {
  const wss = new WebSocket.Server({ server, path: '/ws/candles' });

  wss.on('connection', async (socket, req) => {
    // 기본 상태
    clients.set(socket, { tickers: new Set(), interval: 1, isAlive: true });

    // URL 쿼리로 초기 구독 지원  e.g. ws://host/ws/candles?ticker=005930&interval=1
    const { query } = url.parse(req.url || '', true);
    const initialTicker = query?.ticker;
    const initialInterval = Number.parseInt(query?.interval || '1', 10) || 1;

    const info = clients.get(socket);
    info.interval = initialInterval;

    // heartbeat
    socket.on('pong', () => {
      const s = clients.get(socket);
      if (s) s.isAlive = true;
    });

    // 메시지 처리
    socket.on('message', async (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg?.type === 'subscribe') {
          const ticker = String(msg.ticker || '').trim();
          const interval = Number.parseInt(msg.interval || info.interval || '1', 10) || 1;
          if (!ticker) return sendErr(socket, 'ticker is required');

          subscribe(socket, ticker);
          info.interval = interval;

          // 스냅샷 내려주기 (옵션)
          if (typeof deps.getCandles === 'function') {
            try {
              const candles = await deps.getCandles(ticker, interval);
              safeSend(socket, {
                type: 'snapshot',
                ticker,
                interval,
                candles: Array.isArray(candles) ? candles : [],
              });
            } catch (e) {
              sendErr(socket, `snapshot failed: ${e?.message || e}`);
            }
          }
          return;
        }

        if (msg?.type === 'unsubscribe') {
          const ticker = String(msg.ticker || '').trim();
          if (!ticker) return sendErr(socket, 'ticker is required');
          unsubscribe(socket, ticker);
          return;
        }

        sendErr(socket, 'unknown message type');
      } catch (e) {
        sendErr(socket, `invalid JSON: ${e?.message || e}`);
      }
    });

    socket.on('close', () => cleanupSocket(socket));
    socket.on('error', () => cleanupSocket(socket));

    // 쿼리로 넘어온 초기 구독 처리
    if (initialTicker) {
      subscribe(socket, String(initialTicker));
      if (typeof deps.getCandles === 'function') {
        try {
          const candles = await deps.getCandles(String(initialTicker), initialInterval);
          safeSend(socket, {
            type: 'snapshot',
            ticker: String(initialTicker),
            interval: initialInterval,
            candles: Array.isArray(candles) ? candles : [],
          });
        } catch (e) {
          sendErr(socket, `snapshot failed: ${e?.message || e}`);
        }
      }
    }
  });

  // 서버 단 ping/pong
  const interval = setInterval(() => {
    for (const [socket, state] of clients.entries()) {
      if (!state.isAlive) {
        cleanupSocket(socket);
        try { socket.terminate(); } catch { /* noop */ }
        continue;
      }
      state.isAlive = false;
      try { socket.ping(); } catch { /* noop */ }
    }
  }, 30_000);

  wss.on('close', () => clearInterval(interval));

  // 외부에서 틱/분봉이 집계될 때 사용: 구독자에게 푸시
  function pushCandle(ticker, candle, intervalMinutes) {
    const subs = subsByTicker.get(ticker);
    if (!subs || subs.size === 0) return;
    for (const socket of subs) {
      const info = clients.get(socket);
      if (!info) continue;
      // interval 필터(선택): 클라별 다른 interval을 쓰면 서버에서 재집계가 필요
      // 여기선 간단히 동일 interval만 내려줌
      if (intervalMinutes && info.interval !== intervalMinutes) continue;
      safeSend(socket, { type: 'candle', ticker, interval: info.interval, candle });
    }
  }

  function subscribe(socket, ticker) {
    const state = clients.get(socket);
    if (!state) return;

    // socket -> ticker
    state.tickers.add(ticker);
    clients.set(socket, state);

    // ticker -> socket
    if (!subsByTicker.has(ticker)) subsByTicker.set(ticker, new Set());
    subsByTicker.get(ticker).add(socket);
  }

  function unsubscribe(socket, ticker) {
    const state = clients.get(socket);
    if (state) {
      state.tickers.delete(ticker);
      clients.set(socket, state);
    }
    const set = subsByTicker.get(ticker);
    if (set) {
      set.delete(socket);
      if (set.size === 0) subsByTicker.delete(ticker);
    }
  }

  function cleanupSocket(socket) {
    const state = clients.get(socket);
    if (!state) return;
    for (const t of state.tickers) {
      const set = subsByTicker.get(t);
      if (set) {
        set.delete(socket);
        if (set.size === 0) subsByTicker.delete(t);
      }
    }
    clients.delete(socket);
  }

  function sendErr(socket, message) {
    safeSend(socket, { type: 'error', message });
  }

  function safeSend(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify(payload)); } catch { /* noop */ }
    }
  }

  return { wss, pushCandle };
}

module.exports = { attachWs };
