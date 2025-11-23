// //로컬용
// import dotenv from 'dotenv';
// dotenv.config();
import express from 'express';
import axios from 'axios';
import dayjs from 'dayjs';
import https from 'https';
import Bottleneck from 'bottleneck';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import cron from 'node-cron';
dayjs.extend(isSameOrBefore);
const router = express.Router();
const KIS_API_BASE = 'https://openapi.koreainvestment.com:9443';
const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let accessToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ0b2tlbiIsImF1ZCI6ImIzNDBlZTBjLWM3ZjQtNDdmZC1iMmE4LWFmZGFlNjFkYjk0OCIsInByZHRfY2QiOiIiLCJpc3MiOiJ1bm9ndyIsImV4cCI6MTc1MTI2NTU2NiwiaWF0IjoxNzUxMTc5MTY2LCJqdGkiOiJQUzIwS1FaRHNiTTc5M3NqalBjOXE0THEzQzJmbnJ1Vm93WHgifQ.dtQcEcb5t-DO7BeZ9tSAfAbpjjektH6CdUvGe2GPxmKPu9kFyXIuZBNRjRMLEklP0j0iPCgK2iSHKZI3ynlmNg';
// let accessToken = '';
let tokenExpiresAt = null; // 타임스탬프로 저장
async function retryRequest(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`🔁 재시도 ${i + 1}/${retries} 후 딜레이 ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

//Swagger에 노출된 /kis/token 경로는 테스트용으로만 쓰고, 서비스에서는 내부 함수로만 사용하세요.

export async function getAccessToken() {
  const now = Date.now();

  // 1. 유효한 토큰이 있으면 그대로 사용
  if (accessToken && tokenExpiresAt && now < tokenExpiresAt) {
    console.log('🔑 기존 토큰 사용:', accessToken);
    return accessToken;
  }

  // 2. 기존 토큰이 있다면 먼저 revoke
  if (accessToken) {
    try {
      console.log('🚫 기존 토큰 폐기 요청');
      const revokeUrl = `${KIS_API_BASE}/oauth2/revokeP`;
      await axios.post(
        revokeUrl,
        {
          appkey: APP_KEY,
          appsecret: APP_SECRET,
          token: accessToken,
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
      console.log('✅ 토큰 폐기 성공');
    } catch (error) {
      console.warn('⚠️ 토큰 폐기 실패:', error?.response?.data || error.message);
    }
  }

  // 3. 토큰 새로 발급
  console.log('🔄 새로운 토큰 발급 요청');
  const tokenUrl = `${KIS_API_BASE}/oauth2/tokenP`;
  const response = await axios.post(
    tokenUrl,
    {
      grant_type: 'client_credentials',
      appkey: APP_KEY,
      appsecret: APP_SECRET,
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  accessToken = response.data.access_token;
  tokenExpiresAt = now + 23 * 60 * 60 * 1000; // 23시간 유효
  console.log('✅ 새 토큰 발급 완료:', accessToken);

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
/**
 * @swagger
 * /api/kis/itemchart-price:
 *   get:
 *     summary: 기간별 주가 차트 데이터 조회 (실전 계좌 전용)
 *     tags: [KIS]
 *     parameters:
 *       - in: query
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *           example: "005930"
 *         description: 종목 코드 (단축 코드)
 *       - in: query
 *         name: fromDate
 *         required: true
 *         schema:
 *           type: string
 *           example: "20240101"
 *         description: 조회 시작일 (YYYYMMDD)
 *       - in: query
 *         name: toDate
 *         required: true
 *         schema:
 *           type: string
 *           example: "20240623"
 *         description: 조회 종료일 (YYYYMMDD)
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [D, W, M]
 *           default: D
 *         description: 조회 주기 코드 D 일간 W 주간 M 월간
 *       - in: query
 *         name: adjust
 *         required: false
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *           default: "0"
 *         description: "수정주가 여부 (0: 반영, 1: 미반영)"
 *     responses:
 *       200:
 *         description: 기간별 주가 차트 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   stck_bsop_date:
 *                     type: string
 *                     example: "20240620"
 *                   stck_oprc:
 *                     type: string
 *                     example: "80200"
 *                   stck_hgpr:
 *                     type: string
 *                     example: "80800"
 *                   stck_lwpr:
 *                     type: string
 *                     example: "79800"
 *                   stck_clpr:
 *                     type: string
 *                     example: "80500"
 *                   acml_vol:
 *                     type: string
 *                     example: "10438212"
 *                   acml_tr_pbmn:
 *                     type: string
 *                     example: "837720000000"
 *       400:
 *         description: 필수 파라미터 누락
 *       500:
 *         description: 서버 오류 또는 KIS API 실패
 */
router.get('/itemchart-price', async (req, res) => {
  const { ticker, fromDate, toDate, period = 'D', adjust = '0' } = req.query;

  if (!ticker || !fromDate || !toDate) {
    return res.status(400).json({ error: 'ticker, fromDate, toDate는 필수입니다.' });
  }

  try {
    const accessToken = await getAccessToken();

    const response = await axios.get(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${accessToken}`,
          appkey: APP_KEY,
          appsecret: APP_SECRET,
          tr_id: 'FHKST03010100',
          custtype: 'P',
        },
        params: {
          fid_cond_mrkt_div_code: 'J',      // 'J' = 코스피. 종목코드로 자동 판별되긴 함
          fid_input_iscd: ticker,
          fid_input_date_1: fromDate,
          fid_input_date_2: toDate,
          fid_period_div_code: period,      // 'D', 'W', 'M'
          fid_org_adj_prc: adjust           // '0' = 수정주가 반영, '1' = 미반영
        },
      }
    );

    const output = response.data.output2;

    // if (!Array.isArray(output)) {
    //   console.warn('❗ 응답 데이터 이상:', response.data);
    //   return res.status(500).json({ error: 'KIS API 응답 형식 오류', raw: response.data });
    // }
    /*------------------------각 리턴 값 의미------------------------*/
// stck_bsop_date	주식 영업일자 (거래일)	"20240126"
// stck_clpr	종가 (Close Price)	"73400"
// stck_oprc	시가 (Open Price)	"73700"
// stck_hgpr	고가 (High Price)	"74500"
// stck_lwpr	저가 (Low Price)	"73300"
// acml_vol	누적 거래량 (Volume)	"11160062"
// acml_tr_pbmn	누적 거래대금 (Transaction Amount, 원)	"824499022832"
// flng_cls_code	정리매매 구분코드	"00" (정상)
// prtt_rate	분할비율 (Split Rate)	"0.00"
// mod_yn	수정 여부 (Y/N)	"N"
// prdy_vrss_sign	전일 대비 부호 (상승/하락)	"5" = 하락
// prdy_vrss	전일 대비 등락 가격 (가격 차)	"-700"
// revl_issu_reas	수정사유(예: 액면분할 등)	""
    res.json(output);
  } catch (err) {
    console.error('📛 KIS 주가 차트 조회 실패:', err.response?.data || err.message);
    res.status(500).json({
      error: '주가 차트 데이터 조회 실패',
      details: err.message,
    });
  }
});

/**
 * @swagger
 * /api/kis/itemchart-price/multi:
 *   post:
 *     summary: 섹터별 종목들의 기간별 종가(종가) 데이터 조회
 *     tags: [KIS]
 *     description: 섹터명을 키로 갖는 종목 리스트와 기간을 받아, 날짜별 섹터/종목 종가 테이블을 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tickers:
 *                 type: object
 *                 additionalProperties:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "삼성전자"
 *                       code:
 *                         type: string
 *                         example: "005930"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-06-13"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-06-15"
 *     responses:
 *       200:
 *         description: 날짜별 섹터별 종목 종가 데이터 배열 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     format: date
 *                     example: "2025-06-13"
 *                   stocks:
 *                     type: object
 *                     description: 섹터별 종가 데이터
 *                     additionalProperties:
 *                       type: object
 *                       additionalProperties:
 *                         type: number
 *                         description: 종가 (정수, 원 단위)
 *                         example: 58300
 *       400:
 *         description: 필수 파라미터 누락
 *       500:
 *         description: 서버 내부 오류
 */

// const httpsAgent = new https.Agent({ keepAlive: true });

// const api = axios.create({
//   httpsAgent,
//   timeout: 10000,
// });
router.post('/itemchart-price/multi', async (req, res) => {
  const { tickers, startDate, endDate } = req.body;

  if (!tickers || typeof tickers !== 'object' || !startDate || !endDate) {
    return res.status(400).json({ error: 'tickers (객체), startDate, endDate는 필수입니다.' });
  }

  try {
    const accessToken = await getAccessToken();
    const resultMap = {}; // { date: { sector: { stock: price } } }

    // 요청 제한 설정: 동시에 최대 5개, 최소 250ms 간격
    const limiter = new Bottleneck({
      maxConcurrent: 5,
      minTime: 250,
    });

    const tasks = [];

    for (const [sector, stocks] of Object.entries(tickers)) {
      for (const { name: stockName, code: tickerCode } of stocks) {
        tasks.push(
          limiter.schedule(async () => {
            try {
              const response = await api.get(
                `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
                {
                  headers: {
                    'content-type': 'application/json; charset=utf-8',
                    authorization: `Bearer ${accessToken}`,
                    appkey: APP_KEY,
                    appsecret: APP_SECRET,
                    tr_id: 'FHKST03010100',
                    custtype: 'P',
                  },
                  params: {
                    fid_cond_mrkt_div_code: 'J',
                    fid_input_iscd: tickerCode,
                    fid_input_date_1: startDate.replaceAll('-', ''),
                    fid_input_date_2: endDate.replaceAll('-', ''),
                    fid_period_div_code: 'D',
                    fid_org_adj_prc: '0',
                  },
                }
              );

              const output = response.data.output2;

              output.forEach((day) => {
                const date = `${day.stck_bsop_date.slice(0, 4)}-${day.stck_bsop_date.slice(4, 6)}-${day.stck_bsop_date.slice(6, 8)}`;
                if (!resultMap[date]) resultMap[date] = {};
                if (!resultMap[date][sector]) resultMap[date][sector] = {};
                resultMap[date][sector][stockName] = parseInt(day.stck_clpr, 10);
              });
            } catch (err) {
              console.warn(`⚠️ ${sector} / ${stockName} 조회 실패`, err.response?.data || err.message);
            }
          })
        );
      }
    }

    await Promise.all(tasks);

    // 날짜 리스트 생성 (최신순 정렬)
    const dates = [];
    let current = dayjs(startDate);
    const end = dayjs(endDate);

    while (current.isSameOrBefore(end)) {
      dates.push(current.format('YYYY-MM-DD'));
      current = current.add(1, 'day');
    }

    const final = dates
      .reverse() // 최신순 정렬
      .filter((date) => resultMap[date] && Object.keys(resultMap[date]).length > 0)
      .map((date) => ({
        date,
        stocks: resultMap[date],
      }));

    res.json(final);
  } catch (err) {
    console.error('📛 전체 주가 데이터 조회 실패:', err.message || err);
    res.status(500).json({ error: '전체 데이터 조회 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/kis/top-foreign-netbuy-repeat:
 *   get:
 *     summary: 외국인 순매수 Top 20 조회 (KIS API 반복 조회 방식, 전체 시장)
 *     tags: [KIS]
 *     description: DB에 저장된 KOSPI와 KOSDAQ 종목 전체를 기반으로 단일 종목 KIS API를 반복 호출하여 외국인 순매수 상위 20개 종목을 반환합니다.
 *     responses:
 *       200:
 *         description: 외국인 순매수 상위 20 종목 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   rank:
 *                     type: number
 *                     example: 1
 *                   code:
 *                     type: string
 *                     example: "005930"
 *                   name:
 *                     type: string
 *                     example: "삼성전자"
 *                   foreignNetBuy:
 *                     type: number
 *                     example: 123456
 *                     description: 외국인 순매수 수량
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */

const httpsAgent = new https.Agent({ keepAlive: true });

const api = axios.create({
  httpsAgent,
  timeout: 10000,
});

router.get('/top-foreign-netbuy-repeat', async (req, res) => {
  try {
    // ✅ 1. KOSPI + KOSDAQ 종목 전체 조회
    const tickers = await prisma.tickerInfo.findMany({
      // where: {
      //   market: { in: ['KOSPI', 'KOSDAQ'] },
      // },
      select: {
        code: true,
        name: true,
      },
    });

    if (!tickers.length) {
      return res.status(404).json({ error: 'DB에 저장된 종목이 없습니다.' });
    }

    // ✅ 2. 토큰 및 제한 설정
    const accessToken = await getAccessToken();
    const limiter = new Bottleneck({ maxConcurrent: 5, minTime: 300 });

    const results = [];

    // ✅ 3. 종목별 반복 요청
    const tasks = tickers.map((stock) =>
      limiter.schedule(async () => {
        try {
          const response = await api.get(
            `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor`,
            {
              headers: {
                'content-type': 'application/json; charset=utf-8',
                authorization: `Bearer ${accessToken}`,
                appkey: APP_KEY,
                appsecret: APP_SECRET,
                tr_id: 'FHKST01010900',
                custtype: 'P',
              },
              params: {
                fid_cond_mrkt_div_code: 'J', // 반드시 'J'로 고정해도 되지만 종목마다 Q일 수도 있음
                fid_input_iscd: stock.code,
              },
            }
          );

          const out = response.data.output;
          const last = out[out.length - 1];
          const foreignBuy = parseInt(last.frgn_ntby_qty || '0', 10);
console.log(`🔍 ${stock.name}(${stock.code}) 외국인 순매수: ${foreignBuy}`);
          results.push({
            code: stock.code,
            name: stock.name,
            foreignNetBuy: foreignBuy,
          });
        } catch (e) {
          console.warn(`⚠️ ${stock.name}(${stock.code}) 조회 실패`, e.response?.data || e.message);
        }
      })
    );

    await Promise.all(tasks);

    // ✅ 4. 정렬 및 응답
    const sorted = results
      .sort((a, b) => b.foreignNetBuy - a.foreignNetBuy)
      .slice(0, 20)
      .map((item, i) => ({ rank: i + 1, ...item }));

    res.json(sorted);
  } catch (err) {
    console.error('📛 외국인 순매수 Top20 전체 시장 반복조회 실패:', err.message);
    res.status(500).json({ error: '외국인 순매수 Top20 전체 조회 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/kis/top-market-cap:
 *   get:
 *     summary: 시가총액 상위 30 종목 조회
 *     tags: [KIS]
 *     description: KIS Open API를 사용해 시가총액 상위 30종목을 조회합니다.
 *     responses:
 *       200:
 *         description: 시가총액 상위 종목 배열 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   rank:
 *                     type: number
 *                     example: 1
 *                   code:
 *                     type: string
 *                     example: "005930"
 *                   name:
 *                     type: string
 *                     example: "삼성전자"
 *                   marketCap:
 *                     type: number
 *                     example: 450000000000
 *                   price:
 *                     type: number
 *                     example: 72500
 *       500:
 *         description: 서버 오류
 */
/**
 * @route GET /api/kis/top-market-cap
 * @desc KIS API를 사용하여 시가총액 상위 30 종목 반환
 */

router.get('/top-market-cap', async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    const response = await axios.get(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/ranking/market-cap`,
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${accessToken}`,
          appkey: APP_KEY,
          appsecret: APP_SECRET,
          tr_id: 'FHKST03010100',
          custtype: 'P',
        },
        params: {
          // fid_org_adj_prc: '0', // 원본 기준가 사용 여부 (보통 '0')
             fid_cond_mrkt_div_code: "J",
            fid_input_date_1: "20250411",
            fid_input_date_2: "20250509",
            fid_input_iscd: "",
            fid_org_adj_prc: "0",
            fid_period_div_code: "D"

        },
      }
    );
console.log('📡 시가총액 조회 응답:', response.data);
  const summary = response.data.output1 || {};
const rawList = response.data.output2 || [];

const result = [
  {
    rank: 1,
    code: summary.stck_shrn_iscd,
    name: summary.hts_kor_isnm,
    closePrice: parseInt(summary.stck_prpr || '0', 10),
    marketCap: parseInt(summary.hts_avls || '0', 10),
    volume: parseInt(summary.acml_vol || '0', 10),
  },
  ...rawList.slice(0, 29).map((item, i) => ({
    rank: i + 2,
    code: item.stck_shrn_iscd || '',
    name: item.hts_kor_isnm || '',
    closePrice: parseInt(item.stck_clpr || '0', 10),
    marketCap: parseInt(item.acml_tr_pbmn || '0', 10),
    volume: parseInt(item.acml_vol || '0', 10),
  })),
];

    res.json(result);
  } catch (err) {
    console.error('📛 시가총액 조회 실패:', err.message || err);
    res.status(500).json({ error: '시가총액 조회 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/kis/top-100-market-cap:
 *   get:
 *     summary: 전체 종목 시가총액 상위 100 조회
 *     tags: [KIS]
 *     description: DB에 저장된 전체 종목을 기준으로 개별 조회 후 시가총액 상위 100개 종목을 반환합니다.
 *     responses:
 *       200:
 *         description: 시가총액 기준 상위 100 종목
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   rank:
 *                     type: number
 *                   code:
 *                     type: string
 *                   name:
 *                     type: string
 *                   price:
 *                     type: number
 *                   marketCap:
 *                     type: number
 *       500:
 *         description: 서버 오류
 */
router.get('/top-100-market-cap', async (req, res) => {
  const startTime = Date.now(); // 수집 시작 시점
  console.log(`⏱️ 전체 수집 시작!: ${startTime}초`);
  try {
    const accessToken = await getAccessToken();

    const tickers = await prisma.tickerInfo.findMany();

    const limiter = new Bottleneck({ maxConcurrent: 5, minTime: 250 });
    const result = [];

    const tasks = tickers.map((ticker) =>
      limiter.schedule(async () => {
        try {
          const response = await api.get(
            `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-price`,
            {
              headers: {
                'content-type': 'application/json; charset=utf-8',
                authorization: `Bearer ${accessToken}`,
                appkey: APP_KEY,
                appsecret: APP_SECRET,
                tr_id: 'FHKST01010100',
                custtype: 'P',
              },
              params: {
                fid_cond_mrkt_div_code: 'J',
                fid_input_iscd: ticker.code,
              },
            }
          );

          const data = response.data.output;
          result.push({
            code: ticker.code,
            name: data.hts_kor_isnm,
            marketCap: parseInt(data.hts_avls || '0', 10),
            price: parseInt(data.stck_prpr || '0', 10),
          });
        } catch (e) {
          console.warn(`⚠️ ${ticker.name}(${ticker.code}) 실패:`, e.response?.data || e.message);
        }
      })
    );

    await Promise.all(tasks);

    const endTime = Date.now(); // 수집 완료 시점
    const elapsed = ((endTime - startTime) / 1000).toFixed(2); // 초 단위

    console.log(`⏱️ 전체 수집 완료! 총 소요 시간: ${elapsed}초`);

    const sorted = result
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 100)
      .map((item, i) => ({ rank: i + 1, ...item }));

    res.json({ elapsedSeconds: Number(elapsed), data: sorted });
  } catch (err) {
    console.error('📛 전체 시가총액 조회 실패:', err.message);
    res.status(500).json({ error: '전체 시가총액 조회 실패', details: err.message });
  }
});
/*------------- 제대로 되는거 => 시가총액 -------------*/

/**
 * @swagger
 * /api/kis/save-market-cap:
 *   post:
 *     summary: 시가총액과 등락률 등 티커코드에 있는 기업목록대로 저장
 *     tags: [KIS]
 *     description: DB에 저장된 전체 종목 기준 시가총액을 KIS API로 조회하고 MarketCapRanking 테이블에 저장합니다.
 *     responses:
 *       200:
 *         description: 저장 완료 및 소요 시간 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "상위 100 저장 완료"
 *                 elapsedSeconds:
 *                   type: number
 *                   example: 685.31
 *       500:
 *         description: 서버 오류
 */
router.post('/save-market-cap', async (req, res) => {
  const startTime = Date.now();
  console.log(`⏱️ 저장 수집 시작!: ${startTime}`);

  const safeBigInt = (val) => {
    try {
      return BigInt(val ?? '0');
    } catch {
      return BigInt(0);
    }
  };

  try {
    const accessToken = await getAccessToken();
    const tickers = await prisma.tickerInfo.findMany();

    const limiter = new Bottleneck({ maxConcurrent: 5, minTime: 250 });
    const result = [];

    // const testTickers = tickers.slice(0, 20);
    // console.log(`⏱️ 테스트용 수집 대상: ${testTickers.length} 종목`);
    console.log(`⏱️ 수집 대상: ${tickers.length} 종목`);

    const tasks = tickers.map((ticker) =>
      limiter.schedule(async () => {
        try {
          const response = await retryRequest(() =>
            api.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-price`, {
              headers: {
                'content-type': 'application/json; charset=utf-8',
                authorization: `Bearer ${accessToken}`,
                appkey: APP_KEY,
                appsecret: APP_SECRET,
                tr_id: 'FHKST01010100',
                custtype: 'P',
              },
              params: {
                fid_cond_mrkt_div_code: 'J',
                fid_input_iscd: ticker.code,
              },
            }), 3, 1000
          );//

          const data = response.data.output;
          console.log(`🔍 ${ticker.name}(${ticker.code}) 시가총액: ${data.hts_avls || '0'}`);

          result.push({
            code: ticker.code,
            name: ticker.name,
            market: data.rprs_mrkt_kor_name ?? 'UNKNOWN',
            closePrice: parseInt(data.stck_prpr ?? '0', 10),
            diffPrice: parseInt(data.prdy_vrss ?? '0', 10),
            diffRate: parseFloat(data.prdy_ctrt ?? '0'),
            volume: parseInt(data.acml_vol ?? '0', 10),
            tradeAmount: safeBigInt(data.acml_tr_pbmn),
            marketCap: safeBigInt(data.hts_avls),
            marketCapRatio: parseFloat(data.mrkt_tot_amt_rate ?? '0'),
            sharesOutstanding: safeBigInt(data.lstn_stcn),
            date: new Date(),
          });
        } catch (e) {
          console.warn(`⚠️ ${ticker.name}(${ticker.code}) 실패:`, e.response?.data || e.message);
        }
      })
    );

    await Promise.all(tasks);

    const sorted = result
      .sort((a, b) => a.marketCap > b.marketCap ? -1 : 1)
      // .slice(0, 100)
      .map((item, i) => ({
        code: item.code,
        name: item.name,
        market: item.market,
        closePrice: item.closePrice,
        diffPrice: item.diffPrice,
        diffRate: item.diffRate,
        volume: item.volume,
        tradeAmount: item.tradeAmount.toString(),
        marketCap: item.marketCap.toString(),
        marketCapRatio: item.marketCapRatio,
        sharesOutstanding: item.sharesOutstanding.toString(),
        date: item.date,
      }));

    await prisma.marketCapRanking.createMany({ data: sorted });

    const endTime = Date.now();
    const elapsed = ((endTime - startTime) / 1000).toFixed(2);

    res.json({ message: '시가총액,등락률 등 순위 화면에서 필요한 것 저장 완료', elapsedSeconds: Number(elapsed) });
  } catch (err) {
    console.error('📛 저장 실패:', err.message);
    res.status(500).json({ error: '저장 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/kis/search-market-cap:
 *   get:
 *     summary: 시가총액 검색
 *     tags: [KIS]
 *     description: 특정 날짜와 시장 타입(전체, KOSPI, KOSDAQ)에 따라 시가총액 데이터를 조회합니다.
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "검색할 날짜 (예: 2025-06-23)"
 *       - in: query
 *         name: market
 *         required: false
 *         schema:
 *           type: string
 *           enum: [전체, KOSPI, KOSDAQ]
 *         description: 시장 타입 (전체는 필터 없음)
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 페이지 번호
 *       - in: query
 *         name: pageSize
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 페이지당 항목 수
 *     responses:
 *       200:
 *         description: 검색된 시가총액 데이터
 *       500:
 *         description: 서버 오류
 */
router.get('/search-market-cap', async (req, res) => {
  try {
    const { date, market = '전체', page = 1, pageSize = 20 } = req.query;
    if (!date) return res.status(400).json({ error: '날짜(date) 파라미터는 필수입니다.' });

    const dateObj = new Date(date);
    const nextDateObj = new Date(dateObj);
    nextDateObj.setDate(dateObj.getDate() + 1);

    const whereClause = {
      date: {
        gte: dateObj,
        lt: nextDateObj,
      },
      ...(market === 'KOSPI' && { market: { contains: 'KOSPI' } }),
      ...(market === 'KOSDAQ' && { market: { contains: 'KSQ' } }),
    };

    const allData = await prisma.marketCapRanking.findMany({
      where: whereClause,
    });

    // 문자열 marketCap을 BigInt로 정렬
    const sortedData = allData
      .sort((a, b) => parseInt(b.marketCap) - parseInt(a.marketCap))
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const paginated = sortedData.slice(skip, skip + parseInt(pageSize));

    res.json({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalCount: sortedData.length,
      totalPages: Math.ceil(sortedData.length / parseInt(pageSize)),
      data: paginated,
    });
  } catch (err) {
    console.error('📛 시가총액 검색 실패:', err.message);
    res.status(500).json({ error: '시가총액 검색 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/kis/top-gainers:
 *   get:
 *     summary: 오늘의 급등 종목 Top 20
 *     tags: [KIS]
 *     description: 등락률 기준으로 가장 많이 상승한 20개 종목을 반환합니다.
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "검색할 날짜 (예: 2025-06-23)"
 *       - in: query
 *         name: market
 *         required: false
 *         schema:
 *           type: string
 *           enum: [전체, KOSPI, KOSDAQ]
 *         description: 시장 필터
 *     responses:
 *       200:
 *         description: 등락률 기준 상위 20개 종목
 *       500:
 *         description: 서버 오류
 */
router.get('/top-gainers', async (req, res) => {
  try {
    const { date, market = '전체' , pageSize = 20} = req.query;
    if (!date) return res.status(400).json({ error: '날짜(date) 파라미터는 필수입니다.' });

    const dateObj = new Date(date);
    const nextDateObj = new Date(dateObj);
    nextDateObj.setDate(dateObj.getDate() + 1);

    const whereClause = {
      date: {
        gte: dateObj,
        lt: nextDateObj,
      },
      ...(market === 'KOSPI' && { market: { contains: 'KOSPI' } }),
      ...(market === 'KOSDAQ' && { market: { contains: 'KSQ' } }),
    };

    const allData = await prisma.marketCapRanking.findMany({
      where: whereClause,
    });

    const topGainers = allData
      .sort((a, b) => b.diffRate - a.diffRate) // 등락률 내림차순
      .slice(0, pageSize) // 상위 20개만
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    res.json({ data: topGainers });
  } catch (err) {
    console.error('📛 급등 종목 조회 실패:', err.message);
    res.status(500).json({ error: '급등 종목 조회 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/kis/top-trade-amount:
 *   get:
 *     summary: 오늘의 거래대금 상위 20 종목
 *     tags: [KIS]
 *     description: 거래대금 기준으로 가장 높은 20개 종목을 반환합니다.
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "검색할 날짜 (예: 2025-06-23)"
 *       - in: query
 *         name: market
 *         required: false
 *         schema:
 *           type: string
 *           enum: [전체, KOSPI, KOSDAQ]
 *         description: 시장 필터
 *     responses:
 *       200:
 *         description: 거래대금 기준 상위 20개 종목
 *       500:
 *         description: 서버 오류
 */
router.get('/top-trade-amount', async (req, res) => {
  try {
    const { date, market = '전체',pageSize=20 } = req.query;
    if (!date) return res.status(400).json({ error: '날짜(date) 파라미터는 필수입니다.' });

    const dateObj = new Date(date);
    const nextDateObj = new Date(dateObj);
    nextDateObj.setDate(dateObj.getDate() + 1);

    const whereClause = {
      date: {
        gte: dateObj,
        lt: nextDateObj,
      },
      ...(market === 'KOSPI' && { market: { contains: 'KOSPI' } }),
      ...(market === 'KOSDAQ' && { market: { contains: 'KSQ' } }),
    };

    const allData = await prisma.marketCapRanking.findMany({
      where: whereClause,
    });

    const topByTradeAmount = allData
      .sort((a, b) => {
        const aVal = BigInt(typeof a.tradeAmount === 'string' ? a.tradeAmount : a.tradeAmount.toString());
        const bVal = BigInt(typeof b.tradeAmount === 'string' ? b.tradeAmount : b.tradeAmount.toString());
        return bVal > aVal ? 1 : -1;
      })
      .slice(0, pageSize)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    res.json({ data: topByTradeAmount });
  } catch (err) {
    console.error('📛 거래대금 상위 종목 조회 실패:', err.message);
    res.status(500).json({ error: '거래대금 상위 종목 조회 실패', details: err.message });
  }
});
// cron 매일 오후 5시 실행
cron.schedule('0 18 * * *', async () => {
  console.log('🕔 [CRON 18:00 PM] collect start : daily marketCap');
  try {
    const response = await fetch('http://localhost:4000/api/kis/save-market-cap', {
      method: 'POST',
    });

    const result = await response.json();
    console.log('✅ 수집 완료:', result);
  } catch (err) {
    console.error('🕔 [CRON 18:00 PM] collect fail : daily marketCap', err.message);
  }
});
// 기관매수

/**
 * @swagger
 * /api/kis/save-investor-netbuy:
 *   post:
 *     summary: KIS API로부터 투자자별 순매수 종목 저장
 *     tags: [KIS]
 *     description: 특정 일자 기준으로 투자자(개인, 외국인, 기관) 순매수 데이터를 외부 API에서 수집해 DB에 저장합니다. 매일 18시에 실행 권장.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2025-07-25"
 *     responses:
 *       200:
 *         description: 저장된 종목 리스트
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                 saved:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank:
 *                         type: integer
 *                       code:
 *                         type: string
 *                       name:
 *                         type: string
 *                       stckClpr:
 *                         type: integer
 *                         description: 종가
 *                       prdyVrss:
 *                         type: integer
 *                         description: 전일대비 가격차이
 *                       individualNetBuy:
 *                         type: integer
 *                         description: 개인 순매수량
 *                       foreignerNetBuy:
 *                         type: integer
 *                         description: 외국인 순매수량
 *                       institutionNetBuy:
 *                         type: integer
 *                         description: 기관 순매수량
 */
router.post('/save-investor-netbuy', async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date는 필수입니다. 예: 2025-07-25' });

  const parsedDate = dayjs(date);
  if (!parsedDate.isValid()) return res.status(400).json({ error: '유효한 날짜 형식이 아닙니다.' });

  const targetDateStr = parsedDate.format('YYYYMMDD');
  const targetDate = parsedDate.toDate();

  try {
    const tickers = await prisma.tickerInfo.findMany({ select: { code: true, name: true } });
    const accessToken = await getAccessToken();
    const limiter = new Bottleneck({ maxConcurrent: 5, minTime: 300 });

    const results = [];

    const tasks = tickers.map((ticker) =>
      limiter.schedule(async () => {
        try {
          const response = await api.get(
            `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor`,
            {
              headers: {
                'content-type': 'application/json; charset=utf-8',
                authorization: `Bearer ${accessToken}`,
                appkey: APP_KEY,
                appsecret: APP_SECRET,
                tr_id: 'FHKST01010900',
                custtype: 'P',
              },
              params: {
                fid_cond_mrkt_div_code: 'J',
                fid_input_iscd: ticker.code,
              },
            }
          );

          const data = response.data.output;
          const match = data.find((d) => d.stck_bsop_date === targetDateStr);
          console.log(`🔍 ${ticker.name}(${ticker.code}) 순매수 데이터:`);
console.log({
              code: ticker.code,
              name: ticker.name,
              individualNetBuy: parseInt(match.prsn_ntby_qty || '0', 10),
              foreignerNetBuy: parseInt(match.frgn_ntby_qty || '0', 10),
              institutionNetBuy: parseInt(match.orgn_ntby_qty || '0', 10),
              stckClpr: parseInt(match.stck_clpr || '0', 10),
              prdyVrss: parseInt(match.prdy_vrss || '0', 10),
            })
          if (match) {
            results.push({
              code: ticker.code,
              name: ticker.name,
              individualNetBuy: parseInt(match.prsn_ntby_qty || '0', 10),
              foreignerNetBuy: parseInt(match.frgn_ntby_qty || '0', 10),
              institutionNetBuy: parseInt(match.orgn_ntby_qty || '0', 10),
              stckClpr: parseInt(match.stck_clpr || '0', 10),
              prdyVrss: parseInt(match.prdy_vrss || '0', 10),
            });
          }
        } catch (err) {
          console.warn(`⚠️ ${ticker.name}(${ticker.code}) 실패`, err?.response?.data || err.message);
        }
      })
    );

    await Promise.all(tasks);

    const ranked = results
      .sort((a, b) => b.institutionNetBuy - a.institutionNetBuy)
      .map((item, idx) => ({ rank: idx + 1, ...item }));

    await prisma.investorNetBuy.deleteMany({ where: { date: targetDate } });

    await prisma.investorNetBuy.createMany({
      data: ranked.map((item) => ({
        ...item,
        date: targetDate,
      })),
    });

    res.json({ count: ranked.length, saved: ranked });
  } catch (err) {
    console.error('📛 저장 실패:', err.message);
    res.status(500).json({ error: '투자자별 순매수 저장 실패', details: err.message });
  }
});

cron.schedule('0 18 * * *', async () => {
  const today = dayjs().format('YYYY-MM-DD');
  await axios.post('http://localhost:4000/api/kis/save-investor-netbuy', { date: today });
});
/**
 * @swagger
 * /api/kis/top-netbuy:
 *   get:
 *     summary: 특정 날짜와 주체별 순매수 상위 20종목 조회
 *     tags: [KIS]
 *     description: 특정 날짜와 투자 주체를 기준으로 순매수 상위 20개 종목을 조회합니다.
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-07-28"
 *         description: 조회할 날짜 (YYYY-MM-DD)
 *       - in: query
 *         name: investorType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [
 *             institutionNetBuy, foreignerNetBuy, individualNetBuy,
 *             corpNetBuy, etcForeignerNetBuy,
 *             insurance, bank, investmentTrust,
 *             etcFinance, privateEquity, pensionFund,
 *             financeInvestment, etcInstitution
 *           ]
 *           example: institutionNetBuy
 *         description: 순매수 주체 필드명
 *     responses:
 *       200:
 *         description: 주체 기준 순매수 상위 종목 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date:
 *                   type: string
 *                   example: "2025-07-28"
 *                 investorType:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/InvestorNetBuy'
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 *
 * components:
 *   schemas:
 *     InvestorNetBuy:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         rank:
 *           type: integer
 *         stckClpr:
 *           type: integer
 *         prdyVrss:
 *           type: integer
 *         individualNetBuy:
 *           type: integer
 *         foreignerNetBuy:
 *           type: integer
 *         institutionNetBuy:
 *           type: integer
 *         corpNetBuy:
 *           type: integer
 *         etcForeignerNetBuy:
 *           type: integer
 *         insurance:
 *           type: integer
 *         bank:
 *           type: integer
 *         investmentTrust:
 *           type: integer
 *         etcFinance:
 *           type: integer
 *         privateEquity:
 *           type: integer
 *         pensionFund:
 *           type: integer
 *         financeInvestment:
 *           type: integer
 *         etcInstitution:
 *           type: integer
 *         date:
 *           type: string
 *           format: date-time
 */
router.get('/top-netbuy', async (req, res) => {
  const { date, investorType } = req.query;

  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'date는 YYYY-MM-DD 형식의 문자열이어야 합니다.' });
  }

  if (!investorType || typeof investorType !== 'string') {
    return res.status(400).json({ error: 'investorType 파라미터는 필수입니다.' });
  }

  const validFields = [
    'institutionNetBuy',
    'foreignerNetBuy',
    'individualNetBuy',
    'corpNetBuy',
    'etcForeignerNetBuy',
    'insurance',
    'bank',
    'investmentTrust',
    'etcFinance',
    'privateEquity',
    'pensionFund',
    'financeInvestment',
    'etcInstitution',
  ];

  if (!validFields.includes(investorType)) {
    return res.status(400).json({ error: `investorType은 다음 중 하나여야 합니다: ${validFields.join(', ')}` });
  }

  const parsedDate = dayjs(date);
  if (!parsedDate.isValid()) {
    return res.status(400).json({ error: '유효하지 않은 날짜 형식입니다.' });
  }

  try {
    const top20 = await prisma.investorNetBuy.findMany({
      where: {
        date: parsedDate.toDate(),
      },
      orderBy: {
        [investorType]: 'desc',
      },
      take: 20,
    });

    res.json({
      date: parsedDate.format('YYYY-MM-DD'),
      investorType,
      count: top20.length,
      items: top20,
    });
  } catch (err) {
    console.error('📛 순매수 상위 조회 실패:', err.message);
    res.status(500).json({ error: '순매수 상위 조회 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/kis/candles:
 *   get:
 *     summary: 기간별 캔들(시가/고가/저가/종가/거래량) 데이터
 *     tags: [KIS]
 *     description: KIS 일/주/월 차트 API 응답을 차트용 형태로 정규화하여 반환합니다.
 *     parameters:
 *       - in: query
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *           example: "000660"
 *         description: 단축 종목코드 SK하이닉스 000660
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[0-9]{8}$"
 *           example: "20240101"
 *         description: 조회 시작일 (YYYYMMDD)
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[0-9]{8}$"
 *           example: "20250131"
 *         description: 조회 종료일 (YYYYMMDD)
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [D, W, M]
 *           default: D
 *         description: 조회 주기 (D=일봉, W=주봉, M=월봉)
 *       - in: query
 *         name: adjust
 *         required: false
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *           default: "0"
 *         description: 수정주가 반영 여부 (0=반영, 1=미반영)
 *     responses:
 *       200:
 *         description: 차트용 캔들 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticker:
 *                   type: string
 *                   example: "000660"
 *                 period:
 *                   type: string
 *                   example: "D"
 *                 adjust:
 *                   type: boolean
 *                   description: true면 수정주가 반영됨
 *                   example: true
 *                 candles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       t:
 *                         type: string
 *                         description: 날짜 (YYYY-MM-DD)
 *                         example: "2024-06-20"
 *                       o:
 *                         type: number
 *                         description: 시가
 *                         example: 150000
 *                       h:
 *                         type: number
 *                         description: 고가
 *                         example: 154500
 *                       l:
 *                         type: number
 *                         description: 저가
 *                         example: 148500
 *                       c:
 *                         type: number
 *                         description: 종가
 *                         example: 153200
 *                       v:
 *                         type: number
 *                         description: 거래량
 *                         example: 10438212
 *       400:
 *         description: 필수 파라미터 누락 또는 형식 오류
 *       500:
 *         description: 서버 오류 또는 KIS API 실패
 */

router.get('/candles', async (req, res) => {
  console.log("여기 타나")
  const { ticker, from, to, period = 'D', adjust = '0' } = req.query;
  if (!ticker || !from || !to) {
    return res.status(400).json({ error: 'ticker, from, to 필요 (YYYYMMDD)' });
  }
  try {
    const token = await getAccessToken();
    const r = await axios.get(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: APP_KEY,
          appsecret: APP_SECRET,
          tr_id: 'FHKST03010100',
          custtype: 'P',
        },
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd: ticker,
          fid_input_date_1: String(from),
          fid_input_date_2: String(to),
          fid_period_div_code: period,   // D/W/M
          fid_org_adj_prc: adjust,       // 0 수정주가
        },
      }
    );

    const rows = (r.data.output2 ?? []);
    // 주의: KIS는 최신→과거 순서가 섞여올 수 있으니 날짜 오름차순으로 정렬
    rows.sort((a, b) => a.stck_bsop_date.localeCompare(b.stck_bsop_date));

    const candles = rows.map((d) => ({
      t: `${d.stck_bsop_date.slice(0,4)}-${d.stck_bsop_date.slice(4,6)}-${d.stck_bsop_date.slice(6,8)}`, // YYYY-MM-DD
      o: Number(d.stck_oprc),
      h: Number(d.stck_hgpr),
      l: Number(d.stck_lwpr),
      c: Number(d.stck_clpr),
      v: Number(d.acml_vol),
    }));
console.log(candles)
    res.json({ ticker, period, adjust: adjust === '0', candles });
  } catch (e) {
    console.error('candles 실패:', e.response?.data || e.message);
    res.status(500).json({ error: 'candles 조회 실패', details: e.message });
  }
});
/**
 * @swagger
 * /api/kis/minutes:
 *   get:
 *     summary: 단일 종목 당일 1분봉 조회 (차트용 정규화)
 *     tags: [KIS]
 *     description: KIS 당일 1분봉 API(FHKST03010200)를 사용해 { t,o,h,l,c,v } 형식으로 반환합니다.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: "005930"
 *         description: 단축 종목코드(6자리)
 *       - in: query
 *         name: end
 *         required: false
 *         schema:
 *           type: string
 *           pattern: "^[0-9]{6}$"
 *           example: "153000"
 *         description: 기준 시각(HHMMSS). 해당 시각 "이전" 30개 분봉을 조회하며, 미지정 시 현재(서울시간) 기준.
 *       - in: query
 *         name: max
 *         required: false
 *         schema:
 *           type: integer
 *           default: 360
 *         description: 최대 수집 분봉 개수(루프 상한). 09:00에 도달하거나 이 개수 중 먼저 만족되면 종료.
 *       - in: query
 *         name: all
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: 장시간 체크를 무시하고 강제 조회(정규장 외에도 호출).
 *       - in: query
 *         name: session
 *         required: false
 *         schema:
 *           type: string
 *           enum: [regular, pre, after, all]
 *           default: regular
 *         description: 조회할 세션 (0=정규, 1=장전, 2=장후, all=전체)
 *     responses:
 *       200:
 *         description: 시간 오름차순의 분봉 배열
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   t:
 *                     type: string
 *                     example: "2025-11-10 09:01"
 *                     description: "YYYY-MM-DD HH:mm (Asia/Seoul)"
 *                   o:
 *                     type: number
 *                     example: 98600
 *                   h:
 *                     type: number
 *                     example: 98700
 *                   l:
 *                     type: number
 *                     example: 98000
 *                   c:
 *                     type: number
 *                     example: 98200
 *                   v:
 *                     type: number
 *                     example: 123456
 *       400:
 *         description: 파라미터 오류
 *       500:
 *         description: 서버 오류 또는 KIS API 실패
 */
router.get('/minutes', async (req, res) => {
  const { code, end, max = 360, all = 'false', session = 'regular' } = req.query;

  if (!code || String(code).length !== 6) {
    return res
      .status(400)
      .json({ error: 'code(6자리 종목코드)가 필요합니다.' });
  }

  // 서울 시각 헬퍼
  const nowSeoul = () => {
    const d = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })
    );
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return { d, hhmmss: `${hh}${mm}${ss}` };
  };

  const isRegular = () => {
    const { d } = nowSeoul();
    const wd = d.getDay(); // 0=일, 6=토
    if (wd === 0 || wd === 6) return false;
    const hhmm = d.getHours() * 100 + d.getMinutes();
    return hhmm >= 900 && hhmm <= 1530;
  };

  // 🔧 정규장 기준 cursor 계산 (장 마감 이후에는 15:30 고정)
  const computeCursor0 = () => {
    // 사용자가 end를 직접 지정했으면 그걸 우선
    if (end && /^[0-9]{6}$/.test(String(end))) {
      return String(end);
    }

    const { d, hhmmss } = nowSeoul();
    const hhmm = d.getHours() * 100 + d.getMinutes();

    if (session === 'regular') {
      // 장 마감 이후(15:30 이후)에는 15:30 기준으로 "오늘 장 전체"를 조회
      if (hhmm > 1530) {
        return '153000';
      }
      // 장중이면 현재 시각 기준으로
      return hhmmss;
    }

    // 장전/장후/전체 세션은 일단 현재 시각 기준 유지
    return hhmmss;
  };

  try {
    const token = await getAccessToken();
    const out = [];
    const cursor0 = computeCursor0();

    // 어떤 세션을 조회할지 결정
    let etcList = [];
    if (session === 'regular') etcList = [0];
    else if (session === 'pre') etcList = [1];
    else if (session === 'after') etcList = [2];
    else if (session === 'all') etcList = [0, 1, 2];
    else etcList = [0];

    // 정규장 외 시간에 all=false & session=regular면 안내만
    if (String(all) !== 'true' && session === 'regular' && !isRegular()) {
      console.log('[SERVER] 정규장이 아님');
      return res.status(200).json({
        note: '정규장이 아닙니다(평일 09:00~15:30). session=after 또는 session=all 사용 가능.',
      });
    }

    // 세션별로 조회 → 누적
    for (const ETC of etcList) {
      let fetched = 0;
      let cursor = cursor0;

      for (let i = 0; i < 20; i++) {
        const r = await axios.get(
          `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice`,
          {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              authorization: `Bearer ${token}`,
              appkey: APP_KEY,
              appsecret: APP_SECRET,
              tr_id: 'FHKST03010200',
              custtype: 'P',
            },
            params: {
              FID_COND_MRKT_DIV_CODE: 'J', // 주식
              FID_ETC_CLS_CODE: String(ETC), // 0=정규, 1=장전, 2=장후
              FID_INPUT_ISCD: code,
              FID_INPUT_HOUR_1: cursor, // 이 시각 "이전" 30개 반환
              FID_PW_DATA_INCU_YN: 'N',
            },
          }
        );

        const rows = r.data?.output2 || r.data?.output || [];
        console.log('[minutes] ETC=', ETC, 'cursor=', cursor, 'rows.len=', rows.length);

        if (!rows.length) break;

        for (const row of rows) {
          const date = row.stck_bsop_date; // YYYYMMDD
          const time = row.stck_cntg_hour; // HHMMSS
          const t = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(
            6,
            8
          )} ${time.slice(0, 2)}:${time.slice(2, 4)}`;

          out.push({
            t,
            o: Number(row.stck_oprc),
            h: Number(row.stck_hgpr),
            l: Number(row.stck_lwpr),
            c: Number(row.stck_prpr),
            v: Number(row.cntg_vol ?? 0),
          });

          fetched++;
          if (fetched >= Number(max)) break;
        }
        if (fetched >= Number(max)) break;

        // 다음 청크 커서 (가장 오래된 시각 - 1초)
        const oldest = rows[rows.length - 1];
        const base = new Date(
          `${oldest.stck_bsop_date.slice(0, 4)}-${oldest.stck_bsop_date.slice(
            4,
            6
          )}-${oldest.stck_bsop_date.slice(6, 8)}T${oldest.stck_cntg_hour.slice(
            0,
            2
          )}:${oldest.stck_cntg_hour.slice(2, 4)}:${oldest.stck_cntg_hour.slice(
            4,
            6
          )}+09:00`
        );
        const prev = new Date(base.getTime() - 1000);
        const pH = String(prev.getHours()).padStart(2, '0');
        const pM = String(prev.getMinutes()).padStart(2, '0');
        const pS = String(prev.getSeconds()).padStart(2, '0');
        cursor = `${pH}${pM}${pS}`;
        if (Number(cursor) < 90000 && ETC === 0) break; // 정규장은 09:00 이전이면 종료
      }
    }

    // 병합: 같은 시각(t)이 중복될 수 있으니 마지막 기준으로 덮어쓰기
    const map = new Map();
    for (const b of out) map.set(b.t, b);
    const merged = Array.from(map.values()).sort((a, b) =>
      a.t < b.t ? -1 : 1
    );

    return res.json(merged);
  } catch (e) {
    console.error('❌ minutes 실패:', e?.response?.data || e.message);
    return res.status(500).json({
      error: '분봉 조회 실패',
      details: e?.response?.data || e.message,
    });
  }
});

/**
 * @swagger
 * /api/kis/ticks:
 *   get:
 *     summary: 단일 종목 N틱 캔들 조회 (체결내역 기반)
 *     tags: [KIS]
 *     description: |
 *       KIS 주식현재가 체결 API(FHKST01010300)를 사용해 체결내역을 조회하고,
 *       지정한 개수(unit)만큼의 체결을 묶어서 OHLCV 캔들 형태로 반환합니다.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: "005930"
 *         description: 단축 종목코드(6자리)
 *       - in: query
 *         name: unit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 15
 *           example: 15
 *         description: 한 캔들을 구성하는 틱 체결 개수 (예 15 = 15틱 캔들)
 *       - in: query
 *         name: max
 *         required: false
 *         schema:
 *           type: integer
 *           default: 600
 *         description: 최대 생성 캔들 개수 (실제 반환 개수는 보유 체결 수에 따라 달라질 수 있음)
 *     responses:
 *       200:
 *         description: 시간 오름차순의 N틱 캔들 배열
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   t:
 *                     type: string
 *                     example: "2025-11-10 09:01:30"
 *                     description: "YYYY-MM-DD HH:mm:ss (Asia/Seoul)"
 *                   o:
 *                     type: number
 *                     example: 98600
 *                   h:
 *                     type: number
 *                     example: 98700
 *                   l:
 *                     type: number
 *                     example: 98000
 *                   c:
 *                     type: number
 *                     example: 98200
 *                   v:
 *                     type: number
 *                     example: 123456
 *       400:
 *         description: 파라미터 오류
 *       500:
 *         description: 서버 오류 또는 KIS API 실패
 */
router.get('/ticks', async (req, res) => {
  const { code, unit = '15', max = '600' } = req.query;

  if (!code || String(code).length !== 6) {
    return res.status(400).json({ error: 'code(6자리 종목코드)가 필요합니다.' });
  }

  const unitN = Math.max(1, parseInt(String(unit), 10) || 15);    // 틱 개수(단위)
  const maxCandles = Math.max(1, parseInt(String(max), 10) || 600); // 최대 캔들 수

  // 서울 기준 오늘 날짜(체결 API는 당일 체결이라 날짜가 따로 안 와서 여기서 붙여줌)
  const nowSeoul = () => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { d, ymd: `${yyyy}-${mm}-${dd}` };
  };

  try {
    const token = await getAccessToken();

    // 1) KIS 체결내역 호출
    //    - FHKST01010300 / inquire-ccnl
    //    - output: [{ stck_cntg_hour: "HHMMSS", stck_prpr: "가격", cntg_vol: "체결수량", ... }, ...]
    const r = await axios.get(
      `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-ccnl`,
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${token}`,
          appkey: APP_KEY,
          appsecret: APP_SECRET,
          tr_id: 'FHKST01010300',
        },
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',      // 주식
          FID_INPUT_ISCD: String(code),     // 6자리 종목코드
          // ※ 단순 사용이면 추가 FID/CTX 파라미터는 생략(최신 체결 N개만)
        },
      }
    );

    const rows = r.data?.output || [];
    if (!rows.length) {
      return res.status(200).json([]);
    }

    const { ymd } = nowSeoul();

    // 2) 로우 틱 데이터 정규화
   

    const ticks = rows
      .map((row) => {
        const time = String(row.stck_cntg_hour || '').padStart(6, '0'); // HHMMSS
        const hh = time.slice(0, 2);
        const mm = time.slice(2, 4);
        const ss = time.slice(4, 6);

        return {
          t: `${ymd} ${hh}:${mm}:${ss}`,
          price: Number(row.stck_prpr),
          vol: Number(row.cntg_vol ?? 0),
        };
      })
      .filter((t) => !Number.isNaN(t.price));

    if (!ticks.length) {
      return res.status(200).json([]);
    }

    // KIS 체결은 보통 "최신 → 과거" 순으로 오기 때문에 시간 오름차순으로 정렬
    ticks.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

    // 3) N틱 단위로 캔들(OHLCV) 생성


    const candles = [];
    const maxRawTicks = unitN * maxCandles;
    const usableTicks = ticks.slice(-maxRawTicks); // 너무 많으면 뒤쪽(최근)만 사용

    for (let i = 0; i < usableTicks.length; i += unitN) {
      if (candles.length >= maxCandles) break;
      const slice = usableTicks.slice(i, i + unitN);
      if (!slice.length) break;

      const first = slice[0];
      const last = slice[slice.length - 1];

      const prices = slice.map((x) => x.price);
      const vols = slice.map((x) => x.vol);

      candles.push({
        t: first.t,
        o: first.price,
        h: Math.max(...prices),
        l: Math.min(...prices),
        c: last.price,
        v: vols.reduce((sum, v) => sum + v, 0),
      });
    }

    // 4) 시간 오름차순 그대로 반환 (이미 asc)
    return res.status(200).json(candles);
  } catch (e) {
    console.error('❌ ticks 실패:', e?.response?.data || e.message);
    return res
      .status(500)
      .json({ error: '틱 캔들 조회 실패', details: e?.response?.data || e.message });
  }
});


export default router;
