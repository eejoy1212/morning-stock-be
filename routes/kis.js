import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const router = express.Router();
const KIS_API_BASE = 'https://openapi.koreainvestment.com:9443';
const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
let accessToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ0b2tlbiIsImF1ZCI6ImIxMjI2Y2UyLWEzZGEtNDQwNy04M2RmLWIzYjE4YTJhYzcyNCIsInByZHRfY2QiOiIiLCJpc3MiOiJ1bm9ndyIsImV4cCI6MTc1MDU0MDMwNiwiaWF0IjoxNzUwNDUzOTA2LCJqdGkiOiJQUzIwS1FaRHNiTTc5M3NqalBjOXE0THEzQzJmbnJ1Vm93WHgifQ.Noo2AFrEVm21q7FagKWilgmJ8q0Hil8AfyZ92z6kpnh6ezkAqkarUlO5FzILUVXid0hX3MCvkbTfN-U5nqOykg';
// let accessToken = '';
let tokenExpiresAt = null; // 타임스탬프로 저장
//Swagger에 노출된 /kis/token 경로는 테스트용으로만 쓰고, 서비스에서는 내부 함수로만 사용하세요.
export async function getAccessToken() {
//   const now = Date.now();
//   if (accessToken && tokenExpiresAt && now < tokenExpiresAt) {
//     console.log('🔑 기존 토큰 사용:', accessToken);
//     return accessToken;
//   }
//  console.log('🔄 새로운 토큰 발급 요청');
//   const url = `${KIS_API_BASE}/oauth2/tokenP`;
//   const response = await axios.post(
//     url,
//     {
//       grant_type: 'client_credentials',
//       appkey: APP_KEY,
//       appsecret: APP_SECRET,
//     },
//     { headers: { 'Content-Type': 'application/json' } }
//   );

//   accessToken = response.data.access_token;
//   tokenExpiresAt = now + 23 * 60 * 60 * 1000; // 23시간 후로 만료 시간 설정 (안전마진)
  return accessToken;
}
/**
 * @swagger
 * /api/kis/revoke-token:
 *   post:
 *     summary: KIS OpenAPI Access Token 폐기
 *     tags: [KIS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 폐기할 access_token
 *                 example: eyJhbGciOiJIUz...
 *     responses:
 *       200:
 *         description: 토큰 폐기 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *                   example: "200"
 *                 msg:
 *                   type: string
 *                   example: "SUCCESS"
 *       400:
 *         description: 요청 오류
 *       500:
 *         description: 서버 오류
 */
router.post('/revoke-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: '토큰이 필요합니다.' });
  }

  try {
    const result = await axios.post(
      `${KIS_API_BASE}/oauth2/revokeP`,
      {
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        token: token,
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        }
      }
    );

    res.json(result.data);
  } catch (err) {
    console.error('❌ 토큰 폐기 실패:', err.response?.data || err.message);
    res.status(500).json({
      error: '토큰 폐기 실패',
      details: err.response?.data || err.message,
    });
  }
});
/**
  * @swagger
  * /api/kis/token:
  *   get:
  *     summary: KIS OpenAPI Access Token 발급
  *     tags: [KIS]
  *     responses:
  *       200:
  *         description: Access token 문자열 반환
  */
 router.get('/token', async (req, res) => {
   try {
     const token = await getAccessToken();
     res.json({ access_token: token });
   } catch (err) {
     res.status(500).json({ error: '토큰 발급 실패', details: err.message });
   }
 });

/**
 * @swagger
 * /api/kis/top-fluctuation:
 *   get:
 *     summary: 국내주식 등락률 상위 종목 조회 (실전계좌 전용)
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: market
 *         required: false
 *         schema:
 *           type: string
 *           enum: [J, Q]
 *           default: J
 *         description: "시장 구분 코드 (J: 코스피, Q: 코스닥)"
 *       - in: query
 *         name: screenCode
 *         schema:
 *           type: string
 *           default: "20170"
 *         description: "스크리닝 코드 (20170: 등락률 기준)"
 *       - in: query
 *         name: rankSort
 *         schema:
 *           type: string
 *           default: "0"
 *         description: "정렬 기준 코드 (0: 등락률순)"
 *     responses:
 *       200:
 *         description: 등락률 상위 종목 리스트 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   stck_shrn_iscd:
 *                     type: string
 *                     description: 단축 종목코드
 *                     example: "005930"
 *                   hts_kor_isnm:
 *                     type: string
 *                     description: 종목명
 *                     example: "삼성전자"
 *                   prdy_ctrt:
 *                     type: string
 *                     description: "전일 대비 등락률 (%)"
 *                     example: "4.23"
 *       500:
 *         description: 등락률 순위 조회 실패
 */

router.get('/top-fluctuation', async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    // 쿼리에서 동적으로 받기 (기본값 설정 포함)
    const {
      market = 'J',
      screenCode = '20170',
      rankSort = '0',
    } = req.query;

    const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/ranking/fluctuation`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${accessToken}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: 'FHPST01710000',
        custtype: 'P'
      },
      params: {
        fid_cond_mrkt_div_code: market,       // 시장 코드 (J: 코스피, Q: 코스닥)
        fid_cond_scr_div_code: screenCode,    // 스크리닝 코드 (20170: 등락률 기준)
        fid_input_iscd: '0000',               // 전체 종목 대상
        fid_rank_sort_cls_code: rankSort,     // 정렬 기준 (0: 등락률순)
        fid_input_cnt_1: '0',
        fid_prc_cls_code: '0',
        fid_input_price_1: '',
        fid_input_price_2: '',
        fid_vol_cnt: '',
        fid_trgt_cls_code: '0',
        fid_trgt_exls_cls_code: '0',
        fid_div_cls_code: '0',
        fid_rsfl_rate1: '',
        fid_rsfl_rate2: ''
      }
    });
console.log('🔍 전체 응답:', response.data);
    const output = response.data.output;

    if (!output || !Array.isArray(output)) {
      console.warn('⚠️ KIS API 응답 이상:', response.data);
      return res.status(500).json({ error: 'KIS API 응답이 유효하지 않음', raw: response.data });
    }

    console.log('📈 Top 5 등락률 종목:');
    output.slice(0, 5).forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.hts_kor_isnm} (${item.stck_shrn_iscd}) - ${item.prdy_ctrt}%`);
    });

    res.json(output);
  } catch (err) {
    console.error('❌ 등락률 순위 조회 실패:', err.response?.data || err.message);
    res.status(500).json({ error: '등락률 순위 조회 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/kis/top-marketcap:
 *   get:
 *     summary: 국내주식 시가총액 상위 종목 조회 (실전 계좌 전용)
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: market
 *         required: false
 *         schema:
 *           type: string
 *           enum: [J, Q]
 *           default: J
 *         description: "시장 구분 코드 (J: 코스피, Q: 코스닥)"
 *     responses:
 *       200:
 *         description: 시가총액 상위 종목 리스트 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   stck_shrn_iscd:
 *                     type: string
 *                     description: 단축 종목코드
 *                     example: "005930"
 *                   hts_kor_isnm:
 *                     type: string
 *                     description: 종목명
 *                     example: "삼성전자"
 *                   mrkt_tot_amt:
 *                     type: string
 *                     description: "시가총액 (단위: 원)"
 *                     example: "489000000000000"
 *       500:
 *         description: 시가총액 순위 조회 실패
 */

router.get('/top-marketcap', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const marketCode = req.query.market || 'J'; // 'J': 코스피, 'Q': 코스닥

    const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/ranking/market-value`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${accessToken}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: 'FHPST01790000', // 실전계좌용 시가총액 랭킹 조회
        custtype: 'P',
      },
      params: {
        fid_cond_mrkt_div_code: marketCode,     // 시장 구분 (J: 코스피, Q: 코스닥)
        fid_cond_scr_div_code: '20174',         // 시가총액 기준 코드
        fid_div_cls_code: '0',                  // 분할 구분 (0: 전체)
        fid_input_iscd: '0000',                 // 종목코드 (전체)
        fid_trgt_cls_code: '0',                 // 대상 분류 (0: 전체)
        fid_trgt_exls_cls_code: '0',            // 제외대상 분류 (0: 없음)
        fid_input_price_1: '',                  // 가격범위 시작값 (선택)
        fid_input_price_2: '',                  // 가격범위 종료값 (선택)
        fid_vol_cnt: '',                        // 거래량 기준 필터 (선택)
      }
    });

    const output = response.data.output;

    if (!Array.isArray(output)) {
      console.warn('❗ 시가총액 순위 응답 이상:', response.data);
      return res.status(500).json({ error: 'KIS 응답 이상', raw: response.data });
    }

    console.log('✅ 시가총액 Top 5:');
    output.slice(0, 5).forEach((item, i) => {
      console.log(`${i + 1}. ${item.hts_kor_isnm} (${item.stck_shrn_iscd}) - 시총: ${item.mrkt_tot_amt}`);
    });

    res.json(output);
  } catch (err) {
    console.error('시가총액 순위 조회 실패:', err.response?.data || err.message);
    res.status(500).json({ error: '시가총액 순위 조회 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/kis/price:
 *   get:
 *     summary: 단일 종목 현재가 조회
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: 종목 코드 005930
 *     responses:
 *       200:
 *         description: 현재가 정보 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hts_kor_isnm:
 *                   type: string
 *                   example: 삼성전자
 *                 stck_prpr:
 *                   type: string
 *                   example: "78200"
 *                 prdy_vrss:
 *                   type: string
 *                   example: "700"
 *                 prdy_ctrt:
 *                   type: string
 *                   example: "0.90"
 *       500:
 *         description: 조회 실패
 */
router.get('/price', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ error: 'code 파라미터가 필요합니다' });
  }

  try {
    const token = await getAccessToken();

    const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-price`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: 'FHKST01010100',
        custtype: 'P',
      },
      params: {
        fid_cond_mrkt_div_code: 'J',
        fid_input_iscd: code
      }
    });

    const out = response.data.output;
    console.log('종목 현재가 조회 응답:', out);
    res.json({
      hts_kor_isnm: out.hts_kor_isnm,
      stck_prpr: out.stck_prpr,
      prdy_vrss: out.prdy_vrss,
      prdy_ctrt: out.prdy_ctrt
    });
  } catch (err) {
    console.error('시세 조회 실패:', err.response?.data || err.message);
    res.status(500).json({ error: '시세 조회 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/kis/top-volume:
 *   get:
 *     summary: 국내주식 거래량 상위 종목 조회 (실전 계좌 전용)
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *           enum: [J, Q]
 *           default: J
 *         description: "시장 구분 코드 (J: 코스피, Q: 코스닥)"
 *       - in: query
 *         name: screenCode
 *         schema:
 *           type: string
 *           default: '20171'
 *         description: "스크리닝 코드 (예: 20171 - 상승률 기준)"
 *       - in: query
 *         name: inputIscd
 *         schema:
 *           type: string
 *           default: '0000'
 *         description: "종목코드 (0000이면 전체 대상)"
 *       - in: query
 *         name: divClsCode
 *         schema:
 *           type: string
 *           default: '0'
 *         description: "구분 코드 (0: 전체)"
 *       - in: query
 *         name: blngClsCode
 *         schema:
 *           type: string
 *           default: '0'
 *         description: "0 : 평균거래량 1:거래증가율 2:평균거래회전율 3:거래금액순 4:평균거래금액회전율"
 *       - in: query
 *         name: trgtClsCode
 *         schema:
 *           type: string
 *           default: '111111111'
 *         description: 대상 포함 조건
 *       - in: query
 *         name: trgtExlsClsCode
 *         schema:
 *           type: string
 *           default: '000000'
 *         description: 대상 제외 조건
 *       - in: query
 *         name: price1
 *         schema:
 *           type: string
 *           default: '0'
 *         description: 가격 조건 1
 *       - in: query
 *         name: price2
 *         schema:
 *           type: string
 *           default: '0'
 *         description: 가격 조건 2
 *       - in: query
 *         name: volCnt
 *         schema:
 *           type: string
 *           default: '0'
 *         description: 거래량 조건
 *       - in: query
 *         name: date1
 *         schema:
 *           type: string
 *           default: '0'
 *         description: "기준 일자 (형식: YYYYMMDD)"
 *     responses:
 *       200:
 *         description: 거래량 상위 종목 리스트 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   stck_shrn_iscd:
 *                     type: string
 *                     description: 종목 코드
 *                     example: "005930"
 *                   hts_kor_isnm:
 *                     type: string
 *                     description: 종목명
 *                     example: "삼성전자"
 *                   acml_vol:
 *                     type: string
 *                     description: 누적 거래량
 *                     example: "20498712"
 *       500:
 *         description: 거래량 순위 조회 실패
 */
router.get('/top-volume', async (req, res) => {
  try {
    /*-------------제대로 되는거-------------*/
    const accessToken = await getAccessToken();

    // 쿼리 파라미터 수신 (기본값 지정)
    const {
      market = 'J', // FID_COND_MRKT_DIV_CODE: 시장 구분 (J: 코스피, Q: 코스닥)
      screenCode = '20171', // FID_COND_SCR_DIV_CODE: 스크리닝 코드 (20171: 상승률, 20172: 하락률 등)
      inputIsCd = '0000', // FID_INPUT_ISCD: 종목코드 (0000이면 전체 대상)
      divClsCode = '0', // FID_DIV_CLS_CODE: 구분 코드 (0: 전체)
      blngClsCode = '0', // FID_BLNG_CLS_CODE: 소속부 코드 (0: 전체)
      trgtClsCode = '111111111', // FID_TRGT_CLS_CODE: 대상 포함 조건
      trgtExlsClsCode = '000000', // FID_TRGT_EXLS_CLS_CODE: 대상 제외 조건
      price1 = '0', // FID_INPUT_PRICE_1: 가격 조건1
      price2 = '0', // FID_INPUT_PRICE_2: 가격 조건2
      volCnt = '0', // FID_VOL_CNT: 거래량 조건
      date1 = '0' // FID_INPUT_DATE_1: 기준 일자 (형식: YYYYMMDD)
    } = req.query;

    const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/volume-rank`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${accessToken}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: 'FHPST01710000',
        custtype: 'P',
      },
      params: {
        FID_COND_MRKT_DIV_CODE: market,
        FID_COND_SCR_DIV_CODE: screenCode,
        FID_INPUT_ISCD: inputIsCd,
        FID_DIV_CLS_CODE: divClsCode,
        FID_BLNG_CLS_CODE: blngClsCode,
        FID_TRGT_CLS_CODE: trgtClsCode,
        FID_TRGT_EXLS_CLS_CODE: trgtExlsClsCode,
        FID_INPUT_PRICE_1: price1,
        FID_INPUT_PRICE_2: price2,
        FID_VOL_CNT: volCnt,
        FID_INPUT_DATE_1: date1,
      }
    });

    const output = response.data.output;

    if (!output || !Array.isArray(output)) {
      console.warn('⚠️ 거래량 순위 응답 이상:', response.data);
      return res.status(500).json({ error: '응답 이상', raw: response.data });
    }

    console.log('📊 거래량 상위 5 종목:');
    output.slice(0, 5).forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.hts_kor_isnm} (${item.stck_shrn_iscd}) - 거래량: ${item.acml_vol}`);
    });

    res.json(output);
  } catch (err) {
    console.error('거래량 순위 조회 실패:', err.response?.data || err.message);
    res.status(500).json({ error: '거래량 순위 조회 실패', details: err.message });
  }
});

async function getRankingList(type = 'up') {
const token = await getAccessToken();
const scrCode = type === 'up' ? '20171' : '20172'; // 상승/하락
const trId = 'HHKUP03200300'; // 실전

const res = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice-ranking`, {
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: trId,
    custtype: 'P',
  },
  params: {
    FID_COND_MRKT_DIV_CODE: 'J', // 'J': 코스피, 'Q': 코스닥
    FID_COND_SCR_DIV_CODE: scrCode,
    FID_INPUT_ISCD: '0000'
  }
});


console.log('📡 응답 전문:', JSON.stringify(res.data, null, 2));
  return res.data.output;
}
/**
 * @swagger
 * /api/kis/ranking/{type}:
 *   get:
 *     summary: 등락률 순위 조회 (상승 or 하락)
 *     description: 상승률 또는 하락률 기준으로 주식 TOP 10 정보를 가져옵니다.
 *     tags: [KIS]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [up, down]
 *         description: up = 상승률 순위, down = 하락률 순위
 *     responses:
 *       200:
 *         description: 종목 리스트
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: 종목명
 *                   code:
 *                     type: string
 *                     description: 종목 코드
 *                   price:
 *                     type: string
 *                     description: 현재가
 *                   rate:
 *                     type: string
 *                     description: 등락률 (%)
 *       500:
 *         description: 서버 오류
 */
router.get('/ranking/:type', async (req, res) => {
  try {
    const type = req.params.type === 'down' ? 'down' : 'up';
    const list = await getRankingList(type);
    const formatted = list.slice(0, 10).map(item => ({
      name: item.hts_kor_isnm,
      code: item.shrn_iscd,
      price: item.stck_prpr,
      rate: item.prdy_ctrt + '%'
    }));
    console.log(`🔍 ${type === 'up' ? '상승' : '하락'}률 상위 10 종목:`, formatted);
    res.json(formatted);
  } catch (err) {
    console.error('등락률 순위 조회 실패:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});
/**
 * @swagger
 * /api/kis/industry-daily-index:
 *   get:
 *     summary: 국내 업종 일자별 지수 조회 (실전 전용)
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: sectorCode
 *         required: true
 *         schema:
 *           type: string
 *           example: "0001"
 *         description: "업종 코드 (예: 0001 - 업종별 코드 참조 필요)"
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "20240125"
 *         description: "조회 기준 일자 (YYYYMMDD)"
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [D, W, M, Y]
 *           default: D
 *         description: "조회 주기 구분 코드 (D: 일간, W: 주간, M: 월간, Y: 연간)"
 *     responses:
 *       200:
 *         description: 업종별 지수 조회 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   stck_bsop_date:
 *                     type: string
 *                     example: "20240125"
 *                   idx_indx:
 *                     type: string
 *                     example: "2432.77"
 *                   prdy_vrss:
 *                     type: string
 *                     example: "-32.1"
 *                   prdy_ctrt:
 *                     type: string
 *                     example: "-1.3"
 *       400:
 *         description: 필수 파라미터 누락
 *       500:
 *         description: 서버 오류 또는 KIS API 실패
 */

router.get('/industry-daily-index', async (req, res) => {
  /*------------작동됨-------------*/
  const { sectorCode, date, period = 'D' } = req.query;

  // 필수 파라미터 체크
  if (!sectorCode || !date) {
    return res.status(400).json({
      error: 'sectorCode (업종 코드)와 date (조회일자)는 필수입니다.',
    });
  }

  try {
    const token = await getAccessToken();

    const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-index-daily-price`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: 'FHPUP02120000',
        custtype: 'P',
      },
      params: {
        fid_cond_mrkt_div_code: 'U',   // 업종지수 조회용 고정값
        fid_input_iscd: sectorCode,    // 업종 코드
        fid_input_date_1: date,        // 조회 기준 시작일
        fid_period_div_code: period,   // 주기: D(일간), W(주간), M(월간), Y(연간)
      }
    });

    const output = response.data.output1;

    // if (!Array.isArray(output)) {
    //   console.warn('⚠️ 업종지수 응답 이상:', response.data);
    //   return res.status(500).json({
    //     error: 'KIS API 응답이 유효하지 않음',
    //     raw: response.data,
    //   });
    // }
console.log('업종 지수 조회 응답:', response.data);
    res.json(output);
  } catch (err) {
    console.error('❌ 업종 지수 조회 실패:', err.response?.data || err.message);
    res.status(500).json({
      error: '업종 지수 조회 실패',
      details: err.message,
    });
  }
});

/**
 * @swagger
 * /api/kis/price-depth:
 *   get:
 *     summary: 주식 현재가 호가 및 예상체결 정보 조회
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: "005930"
 *         description: 종목 코드 6자리, 예 삼성전자 = 005930
 *       - in: query
 *         name: market
 *         required: false
 *         schema:
 *           type: string
 *           enum: [J, Q]
 *           default: J
 *         description: 시장 코드 J 코스피, Q 코스닥
 *     responses:
 *       200:
 *         description: 호가 및 예상체결 정보 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 askp1:
 *                   type: string
 *                   example: "78300"
 *                   description: 1호가 매도호가
 *                 bidp1:
 *                   type: string
 *                   example: "78200"
 *                   description: 1호가 매수호가
 *                 total_askp_rsqn:
 *                   type: string
 *                   example: "189202"
 *                   description: 총 매도호가 잔량
 *                 total_bidp_rsqn:
 *                   type: string
 *                   example: "142382"
 *                   description: 총 매수호가 잔량
 *       400:
 *         description: 필수 파라미터 누락
 *       500:
 *         description: 서버 오류
 */
router.get('/price-depth', async (req, res) => {
  const { code, market = 'J' } = req.query;

  if (!code) {
    return res.status(400).json({ error: '종목 코드 (code) 파라미터가 필요합니다.' });
  }

  try {
    const token = await getAccessToken();

    const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn`, {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: 'FHKST01010200', // 실전용 TR_ID
        custtype: 'P',
        'content-type': 'application/json; charset=utf-8'
      },
      params: {
        fid_cond_mrkt_div_code: market,
        fid_input_iscd: code
      }
    });

    const data = response.data.output;
console.log('호가 및 예상체결 조회 응답:', response);
    res.json({
      askp1: data.askp1,                  // 매도호가 1
      bidp1: data.bidp1,                  // 매수호가 1
      total_askp_rsqn: data.total_askp_rsqn, // 총 매도호가 잔량
      total_bidp_rsqn: data.total_bidp_rsqn  // 총 매수호가 잔량
    });
  } catch (err) {
    console.error('📛 호가 조회 실패:', err.response?.data || err.message);
    res.status(500).json({
      error: '호가 및 예상체결 조회 실패',
      details: err.message
    });
  }
});
/**
 * @swagger
 * /api/kis/price-history:
 *   get:
 *     summary: 주식 일자별 시세 조회 (일/주/월 주가)
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: "005930"
 *         description: 종목 코드 6자리, 예 삼성전자 = 005930
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [D, W, M]
 *           default: D
 *         description: 기간 타입 D 일, W 주, M 월
 *     responses:
 *       200:
 *         description: 일자별 시세 데이터 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   stck_bsop_date:
 *                     type: string
 *                     example: "20240517"
 *                   stck_clpr:
 *                     type: string
 *                     example: "78500"
 *                   prdy_vrss:
 *                     type: string
 *                     example: "-200"
 *                   prdy_ctrt:
 *                     type: string
 *                     example: "-0.26"
 *       400:
 *         description: 필수 파라미터 누락
 *       500:
 *         description: 조회 실패
 */

router.get('/price-history', async (req, res) => {
  //연습용,, api개별문서보고 수정하자
  const { code, period = 'D' } = req.query;

  if (!code) {
    return res.status(400).json({ error: '종목 코드(code)가 필요합니다.' });
  }

  try {
    const token = await getAccessToken();

    const response = await axios.get(
  'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-price',
  {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'FHKST01010400',
      custtype: 'P',
    },
    params: {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: '005930', // 삼성전자 예시
      FID_PERIOD_DIV_CODE: period, // D: 일, W: 주, M: 월
      FID_ORG_ADJ_PRC: '0', // 0: 수정주가, 1: 비수정주가
    },
  }
);
console.log('📡 응답:', response.data);
    const output = response.data.output;
console.log('일자별 시세 조회 응답:', output);
    if (!Array.isArray(output)) {
      return res.status(500).json({ error: '응답 데이터 형식이 잘못되었습니다', raw: response.data });
    }

    res.json(output);
  } catch (err) {
    console.error('❌ 일자별 시세 조회 실패:', err.response?.data || err.message);
    res.status(500).json({ error: '일자별 시세 조회 실패', details: err.message });
  }
});

export default router;
