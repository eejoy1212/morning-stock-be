
import { WebSocketServer } from 'ws';
import url from 'url';

/**
 * 서버에 WS 허브를 붙인다.
 * - path: /ws
 * - 구독 프로토콜:
 *   client -> server:
 *     { "type":"subscribe", "ticker":"005930", "interval":1 }
 *     { "type":"unsubscribe", "ticker":"005930" }
 *   server -> client:
 *     { "type":"snapshot", "ticker":"005930", "interval":1, "candles":[...] }
 *     { "type":"candle", "ticker":"005930", "interval":1, "candle":{ t,o,h,l,c,v } }
 *     { "type":"error", "message":"..." }
 */
export function attachWebSocket(server, deps = {}) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // socket 상태/구독 관리
  const clients = new Map();           // socket -> { tickers:Set<string>, interval:number, isAlive:boolean }
  const subsByTicker = new Map();      // ticker -> Set<WebSocket>

  wss.on('connection', async (socket, req) => {
    console.log("웹소켓 연결")
    clients.set(socket, { tickers: new Set(), interval: 1, isAlive: true });

    // 쿼리로 초기 구독: ws://host/ws?ticker=005930&interval=1
    const { query } = url.parse(req.url || '', true);
    const qTicker = query?.ticker && String(query.ticker);
    const qInterval = Number.parseInt(query?.interval || '1', 10) || 1;

    const info = clients.get(socket);
    info.interval = qInterval;

    socket.on('pong', () => {
        console.log("퐁")
      const s = clients.get(socket);
      if (s) s.isAlive = true;
    });

    socket.on('message', async (buf) => {
      let msg;
   
      try { msg = JSON.parse(buf.toString()); } catch (e) {
        return sendErr(socket, 'invalid JSON');
      }

      if (msg.type === 'subscribe') {   
        console.log("메시지",msg.type)
        const ticker = String(msg.ticker || '').trim();
        const interval = Number.parseInt(msg.interval || info.interval || '1', 10) || 1;
        if (!ticker) return sendErr(socket, 'ticker is required');

        subscribe(socket, ticker);
        info.interval = interval;
       // ✅ 구독 콜백
       if (typeof deps.onSubscribe === 'function') {
         try { deps.onSubscribe(ticker, interval); } catch {}
       }

        if (typeof deps.getCandles === 'function') {
          try {
            const candles = await deps.getCandles(ticker, interval);
            safeSend(socket, { type: 'snapshot', ticker, interval, candles: Array.isArray(candles) ? candles : [] });
          } catch (e) {
            sendErr(socket, `snapshot failed: ${e?.message || e}`);
          }
        }
        return;
      }

      if (msg.type === 'unsubscribe') {
        const ticker = String(msg.ticker || '').trim();
        if (!ticker) return sendErr(socket, 'ticker is required');
        unsubscribe(socket, ticker);
               if (typeof deps.onUnsubscribe === 'function') {
         try { deps.onUnsubscribe(ticker); } catch {}
       }
        return;
      }

      sendErr(socket, 'unknown message type');
    });

    socket.on('close', () => cleanup(socket));
    socket.on('error', () => cleanup(socket));

    // 초기 구독 처리
    if (qTicker) {
      subscribe(socket, qTicker);
           if (typeof deps.onSubscribe === 'function') {
       try { deps.onSubscribe(qTicker, qInterval); } catch {}
     }
      if (typeof deps.getCandles === 'function') {
        try {
          const candles = await deps.getCandles(qTicker, qInterval);
        console.log("푸시 전송:", ticker, candle);
          safeSend(socket, { type: 'snapshot', ticker: qTicker, interval: qInterval, candles: candles ?? [] });
        } catch (e) {
          sendErr(socket, `snapshot failed: ${e?.message || e}`);
        }
      }
    }
  });

  // ping/pong keep-alive
  const hb = setInterval(() => {
    for (const [socket, state] of clients.entries()) {
      if (!state.isAlive) {
        cleanup(socket);
        try { socket.terminate(); } catch {}
        continue;
      }
      state.isAlive = false;
      try { socket.ping(); } catch {}
    }
  }, 30_000);

  wss.on('close', () => clearInterval(hb));

  // 외부에서 분봉 완료 시 호출해 구독자에게 푸시
  function pushCandle(ticker, candle, intervalMinutes = 1) {
    const subs = subsByTicker.get(ticker);
    if (!subs || subs.size === 0) return;
    for (const socket of subs) {
      const info = clients.get(socket);
      if (!info) continue;
      if (info.interval !== intervalMinutes) continue; // 간단 필터
      safeSend(socket, { type: 'candle', ticker, interval: intervalMinutes, candle });
    }
  }

  // 내부 유틸

  function subscribe(socket, ticker) {
    const s = clients.get(socket);
    if (!s) return;
    s.tickers.add(ticker);
    if (!subsByTicker.has(ticker)) {
      subsByTicker.set(ticker, new Set());
      // 🔔 최초 구독 발생
      deps.onSubscribe?.(ticker, s.interval);
    }
    subsByTicker.get(ticker).add(socket);
  }

  function unsubscribe(socket, ticker) {
    const s = clients.get(socket);
    if (s) s.tickers.delete(ticker);
    const set = subsByTicker.get(ticker);
    if (set) {
      set.delete(socket);
      if (set.size === 0) {
        subsByTicker.delete(ticker);
        // 🔔 마지막 구독 해제
        deps.onUnsubscribe?.(ticker);
      }
    }
  }


  function cleanup(socket) {
    const s = clients.get(socket);
    if (!s) return;
    for (const t of s.tickers) {
      const set = subsByTicker.get(t);
      if (set) {
        set.delete(socket);
        if (set.size === 0) subsByTicker.delete(t);
      }
    }
    clients.delete(socket);
  }

  function safeSend(socket, payload) {
    if (socket.readyState === 1) { // WebSocket.OPEN
      try { socket.send(JSON.stringify(payload)); } catch {}
    }
  }

  function sendErr(socket, message) {
    console.log("send err :",message)
    safeSend(socket, { type: 'error', message });
  }

  return { wss, pushCandle };
}
