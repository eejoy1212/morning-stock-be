// kis-ws-client.js
// import dotenv from 'dotenv';
// dotenv.config();
import fetch from 'node-fetch';
import WebSocket from 'ws';

// ----- 설정 -----
const KIS_BASE = process.env.KIS_API_BASE || 'https://openapi.koreainvestment.com:9443';
const KIS_WS   = process.env.KIS_WS_URL   || 'wss://openapi.koreainvestment.com:9443/websocket';
const ORIGIN = process.env.KIS_ORIGIN;
const APPKEY   = process.env.KIS_APP_KEY;
const APPSECRET= process.env.KIS_APP_SECRET;
console.log(">>>APPSECRET : ",APPSECRET)
console.log(">>>APPKEY : ",APPKEY)
console.log(">>>KIS_BASE : ",KIS_BASE)
const CUSTTYPE = process.env.KIS_CUSTTYPE || 'P'; // 개인: P
const TR_TYPE  = process.env.KIS_TR_TYPE  || '1'; // 실시간

if (!APPKEY || !APPSECRET) {
  console.error('[KIS] APPKEY/APPSECRET 환경변수 필요');
}

// ----- approval_key 발급 -----

async function getApprovalKey() {
    // return "eac688bc-5d8a-4fa5-9f2e-9917dda5364c";
  const base = process.env.KIS_API_BASE || 'https://openapi.koreainvestment.com:9443'; // 실전
  // 모의면: process.env.KIS_BASE='https://openapivts.koreainvestment.com:29443'

  const res = await fetch(`${base}/oauth2/Approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' }, // ✅ charset 꼭 포함
    body: JSON.stringify({
      grant_type: 'P',      // ✅ 이 값
      appkey: process.env.KIS_APP_KEY,        // ✅ 키 이름: appkey
      secretkey: process.env.KIS_APP_SECRET,  // ✅ 키 이름: secretkey (소문자)
    }),
  });

  const j = await res.json().catch(() => ({}));
  console.log(j)
  if (!res.ok) {
    throw new Error(`[KIS] Approval 실패: ${res.status} ${JSON.stringify(j)}`);
  }
  if (!j?.approval_key) {
    throw new Error(`[KIS] approval_key 없음: ${JSON.stringify(j)}`);
  }
  return j.approval_key;
}


// ----- 틱 → 분봉 집계기 -----
function createAggregator(intervalMin = 1) {
  // key = floorToMinute(ts) (YYYY-MM-DDTHH:mm:00Z) / 또는 숫자 ts(초)로 해도 됨
  let currentBar = null;

  function floorToIntervalSec(epochSec) {
    const iv = intervalMin * 60;
    return Math.floor(epochSec / iv) * iv; // 구간 시작(초)
  }

  return {
    onTick: (tick, pushBar) => {
      // tick에서 체결가/체결량/시각 추출
      // KIS 틱 메시지 구조는 tr_id별로 조금씩 다르지만,
      // 통상 body, rt_time(또는 stime), stck_prpr(체결가), acml_vol(거래량) 등이 들어옵니다.
      // 실제 필드는 콘솔로 한 번 찍어보며 맞추세요.
      const price = Number(tick.stck_prpr || tick.trade_price || tick.p || tick.PRPR);
      const vol   = Number(tick.acml_vol || tick.trade_volume || tick.v || tick.ACML_VOL);
      const iso   = tick.stck_cntg_hour ? // HHMMSSmmm 형태일 수 있음
                    parseTickTimeToISO(tick.stck_cntg_hour) :
                    (tick.rt_time_iso || new Date().toISOString());

      const tsSec = Math.floor(new Date(iso).getTime() / 1000);
      const bucket = floorToIntervalSec(tsSec);

      if (!currentBar || currentBar.bucket !== bucket) {
        // 이전 바가 있으면 마감 푸시
        if (currentBar) pushBar(toCandle(currentBar));
        // 새 바 시작
        currentBar = {
          bucket,
          o: price, h: price, l: price, c: price,
          v: 0,
          lastIso: iso
        };
      } else {
        currentBar.h = Math.max(currentBar.h, price);
        currentBar.l = Math.min(currentBar.l, price);
        currentBar.c = price;
        currentBar.lastIso = iso;
      }
      // 체결량은 증분이 오기도, 누적이 오기도 합니다.
      // 누적이면 이전 틱의 누적 대비 증가분만 더해야 합니다.
      // 여기서는 간단히 vol를 그대로 쓰되, 실제 필드가 '누적'이면 delta 처리하세요.
      currentBar.v = (isNaN(currentBar.v) ? 0 : currentBar.v) + (isNaN(vol) ? 0 : vol);
    },
    // 분이 넘어갈 때 확정 바를 한 번 더 밀어주고 싶다면 타이머를 둬도 됩니다.
    flush: (pushBar) => {
      if (currentBar) { pushBar(toCandle(currentBar)); currentBar = null; }
    }
  };

  function toCandle(bar) {
    // KST를 그대로 쓰면 타임스탬프 해석이 꼬일 수 있으니 ISO로 맞춰줍니다.
    const iso = new Date(bar.bucket * 1000).toISOString();
    return { t: iso, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v };
  }

  function parseTickTimeToISO(hhmmssmmm) {
    // 예: "134501000" → 오늘 날짜 + 13:45:01.000 (KST) → ISO
    const s = String(hhmmssmmm).padStart(9, '0');
    const hh = s.slice(0,2), mm = s.slice(2,4), ss = s.slice(4,6), ms = s.slice(6,9);
    const now = new Date();
    // KIS는 한국시간 기반. 여기서는 KST로 가정 후 ISO 변환.
    const kst = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hh), Number(mm), Number(ss), Number(ms));
    return new Date(kst.getTime() - (new Date().getTimezoneOffset()*60000)).toISOString();
  }
}

// ----- 구독 메시지 만들기 (체결: H0STCNT0) -----
function buildSubMsg(approvalKey, trId, ticker) {
  return JSON.stringify({
    header: {
      approval_key: approvalKey,
      custtype: CUSTTYPE,       // 개인 P
      tr_type: TR_TYPE,         // 1: 실시간
      'content-type': 'utf-8',
    },
    body: {
      input: {
        tr_id: trId,            // 예: 'H0STCNT0' (국내주식 체결)
        tr_key: ticker,         // 예: '000660'
      }
    }
  });
}

// ----- 외부에서 호출해 WS 시작 -----
export async function startKisRealtimeStreamer({ wsBridge, ticker, interval = 1, trId = 'H0STCNT0' }) {
  const approvalKey = await getApprovalKey();
  const agg = createAggregator(interval);

  const ws = new WebSocket(KIS_WS);
  const flushTimer = setInterval(() => agg.flush((c) => wsBridge.pushCandle(ticker, c, interval)), 60_000);

  ws.on('open', () => {
    ws.send(buildSubMsg(approvalKey, trId, ticker));
    console.log('[KIS] ws open & subscribed:', ticker, trId);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const tick = msg?.body?.output || msg?.body || msg?.data || msg;
      console.log("socket message : ",msg)
      if (tick) {
        agg.onTick(tick, (candle) => wsBridge.pushCandle(ticker, candle, interval));
      }
    } catch {}
  });

  ws.on('close', () => console.log('[KIS] ws close'));
  ws.on('error', (e) => console.error('[KIS] ws error', e));

  // ⬅️ 호출 측에서 스트리머 종료할 수 있도록 stop 반환
  return () => {
    try { clearInterval(flushTimer); } catch {}
    try { ws.close(); } catch {}
  };
}
