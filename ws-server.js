// ws-server.js
import https from 'https';
import { URL } from 'url';
import axios from 'axios';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * 환경변수
 *  - KIS_API_BASE:   https://openapi.koreainvestment.com:9443  (REST)
 *  - KIS_WS_URL:     wss://ops.koreainvestment.com:21000       (WS 전용 도메인/포트! 문서 기준으로 수정)
 *  - KIS_APP_KEY, KIS_APP_SECRET
 *  - (옵션) KIS_TR_ID, KIS_TR_KEY  → 서버 기동 시 자동구독 하고 싶을 때
 */
const API_BASE   = (process.env.KIS_API_BASE || '').trim().replace(/\.$/, '');
const WS_URL     = (process.env.KIS_WS_URL   || '').trim().replace(/\.$/, '');
const APP_KEY    = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
const DEFAULT_TR_ID  = process.env.KIS_TR_ID  || 'H0IFASP0'; // 예: 'H0IFASP0'
const DEFAULT_TR_KEY = process.env.KIS_TR_KEY || '101S12'; // 예: '101S12'

let kisSocket = null;
let kisConnected = false;
let APPROVAL_KEY = null;

const clients = new Set();
let lastKisMessage = null;

// ───────────────────────────────────────────────────────────────────────────────

function requireEnv() {
  if (!API_BASE || !WS_URL) {
    throw new Error('KIS_API_BASE / KIS_WS_URL 환경변수를 확인하세요. (WS 전용 도메인/포트!)');
  }
  if (!APP_KEY || !APP_SECRET) {
    throw new Error('KIS_APP_KEY / KIS_APP_SECRET 환경변수를 확인하세요.');
  }
}

/** 실시간(웹소켓) 접속키 발급 */
export async function fetchApprovalKey() {
  requireEnv();
  const url  = `${API_BASE}/oauth2/Approval`;
  const host = new URL(API_BASE).hostname;

  const payload = {
    grant_type: 'client_credentials',
    appkey: APP_KEY,
    secretkey: APP_SECRET, // 문서의 필드명이 secretkey
  };

  const { data } = await axios.post(url, payload, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    httpsAgent: new https.Agent({ servername: host }), // SNI 고정
    timeout: 10000,
  });

  if (!data?.approval_key) {
    throw new Error(`approval_key가 없습니다: ${JSON.stringify(data)}`);
  }
  return data.approval_key;
}

// 구독/해제 프레임 생성기
function buildFrame({ tr_type, tr_id, tr_key, approvalKey }) {
  return {
    header: {
      approval_key: approvalKey,
      custtype: 'P',          // 개인: P (법인: B)
      tr_type: String(tr_type),// 1: 등록, 2: 해제
      'content-type': 'utf-8',
    },
    body: {
      tr_id,                  // 예: 'H0IFASP0'
      tr_key,                 // 예: '101S12'
    },
  };
}

async function ensureApprovalKey() {
  if (!APPROVAL_KEY) {
    APPROVAL_KEY = await fetchApprovalKey();
    // KIS 문서 기준: 따로 만료 응답 오기 전까지는 재사용
    console.log('✅ approval_key fetched : ', APPROVAL_KEY);
  }
  return APPROVAL_KEY;
}

/** KIS 웹소켓 연결 */
function connectKIS() {
  requireEnv();

  if (kisSocket && kisSocket.readyState === WebSocket.OPEN) return;





const wsURL = new URL(process.env.KIS_WS_URL);
const origin = `https://${new URL(API_BASE).host}`; // 예: https://openapi.koreainvestment.com:9443
  console.log('🔗 KIS_WS_URL:', WS_URL);
  console.log('🔗 Origin    :', origin);
kisSocket = new WebSocket(process.env.KIS_WS_URL, {
  origin,                 // 중요 (https + host:port)
  perMessageDeflate: false,
  handshakeTimeout: 25000 // 여유 증가
});

  kisSocket.on('upgrade', (res) => {
    console.log('🔁 upgrade =>', res.statusCode, res.statusMessage, res.headers.upgrade);
  });

  kisSocket.on('unexpected-response', async (_req, res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      console.error('❌ unexpected-response', res.statusCode, res.statusMessage);
      console.error('↩ headers:', res.headers);
      if (body) console.error('↩ body:', body.slice(0, 800));
    });
  });

  kisSocket.on('open', async () => {
    console.log('✅ KIS WS connected');
    kisConnected = true;

    try {
      const ak = await ensureApprovalKey();

      // 서버 기동 시 자동 구독하고 싶으면 .env 로 설정
      if (DEFAULT_TR_ID && DEFAULT_TR_KEY) {
        const frame = buildFrame({
          tr_type: 1,
          tr_id: DEFAULT_TR_ID,
          tr_key: DEFAULT_TR_KEY,
          approvalKey: ak,
        });
        kisSocket.send(JSON.stringify(frame));
        console.log('➡️ auto subscribed', frame.body);
      } else {
        console.log('ℹ️ 자동구독 생략 (KIS_TR_ID / KIS_TR_KEY 미설정)');
      }
    } catch (e) {
      console.error('❌ approval/subscribe failed:', e?.response?.data || e.message);
      kisSocket.close(4000, 'approval_failed');
    }
  });

  kisSocket.on('message', (buf) => {
    const msg = buf.toString();
    lastKisMessage = msg;
    // 모든 브라우저 클라이언트에게 브로드캐스트
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
  });

  kisSocket.on('close', (code, reason) => {
    console.warn('⚠️ KIS WS closed', code, reason?.toString?.() || '');
    kisConnected = false;
    setTimeout(connectKIS, 5000);
  });

  kisSocket.on('error', (err) => {
    console.error('❌ KIS WS error:', err.message);
  });
}

// 브라우저 ↔ 서버 WS (중계)
export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('🟢 client connected:', clients.size);
    if (lastKisMessage) try { ws.send(lastKisMessage); } catch {}

    // 프론트에서 raw 프레임을 보내면 그대로 KIS로 전달 (원하면 REST 대신 WS로 구독 제어)
    ws.on('message', (data) => {
      if (kisSocket?.readyState === WebSocket.OPEN) kisSocket.send(data);
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('🔴 client disconnected:', clients.size);
    });
  });

  connectKIS();

  // 필요한 컨트롤을 노출 (원하면 라우터에서 호출)
  return {
    getStatus: () => ({ kisConnected, clients: clients.size }),
    getLast:   () => lastKisMessage,
    async subscribe(tr_id, tr_key) {
      const ak = await ensureApprovalKey();
      const frame = buildFrame({ tr_type: 1, tr_id, tr_key, approvalKey: ak });
      if (kisSocket?.readyState !== WebSocket.OPEN) throw new Error('KIS WS not connected');
      kisSocket.send(JSON.stringify(frame));
      return frame;
    },
    async unsubscribe(tr_id, tr_key) {
      const ak = await ensureApprovalKey();
      const frame = buildFrame({ tr_type: 2, tr_id, tr_key, approvalKey: ak });
      if (kisSocket?.readyState !== WebSocket.OPEN) throw new Error('KIS WS not connected');
      kisSocket.send(JSON.stringify(frame));
      return frame;
    },
  };
}
