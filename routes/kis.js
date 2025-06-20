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
let accessToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ0b2tlbiIsImF1ZCI6IjE0OTQ1NDI1LTEwOGUtNDkyMC05YTEyLTA5MDZiMzIzZDI0ZSIsInByZHRfY2QiOiIiLCJpc3MiOiJ1bm9ndyIsImV4cCI6MTc1MDUxNjU5MywiaWF0IjoxNzUwNDMwMTkzLCJqdGkiOiJQUzIwS1FaRHNiTTc5M3NqalBjOXE0THEzQzJmbnJ1Vm93WHgifQ.b8mfZBh-ZhVK7pMlQSCvodQvgKcaIbiBIgQrtz59-HH2w0OZXJL6lV5-WTg2hAbhEKA1azGLDweepQN58znS7A';
// let accessToken = '';
let tokenExpiresAt = null; // 타임스탬프로 저장
//Swagger에 노출된 /kis/token 경로는 테스트용으로만 쓰고, 서비스에서는 내부 함수로만 사용하세요.
export async function getAccessToken() {
//   const now = Date.now();
//   if (accessToken && tokenExpiresAt && now < tokenExpiresAt) {
//     return accessToken;
//   }

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
// /**
//  * @swagger
//  * /api/kis/revoke-token:
//  *   post:
//  *     summary: KIS OpenAPI Access Token 폐기
//  *     tags: [KIS]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - token
//  *             properties:
//  *               token:
//  *                 type: string
//  *                 description: 폐기할 access_token
//  *                 example: eyJhbGciOiJIUz...
//  *     responses:
//  *       200:
//  *         description: 토큰 폐기 성공
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 code:
//  *                   type: string
//  *                   example: "200"
//  *                 msg:
//  *                   type: string
//  *                   example: "SUCCESS"
//  *       400:
//  *         description: 요청 오류
//  *       500:
//  *         description: 서버 오류
//  */
// router.post('/revoke-token', async (req, res) => {
//   const { token } = req.body;

//   if (!token) {
//     return res.status(400).json({ error: '토큰이 필요합니다.' });
//   }

//   try {
//     const result = await axios.post(
//       `${KIS_API_BASE}/oauth2/revokeP`,
//       {
//         appkey: APP_KEY,
//         appsecret: APP_SECRET,
//         token: token,
//       },
//       {
//         headers: {
//           'Content-Type': 'application/json; charset=UTF-8',
//         }
//       }
//     );

//     res.json(result.data);
//   } catch (err) {
//     console.error('❌ 토큰 폐기 실패:', err.response?.data || err.message);
//     res.status(500).json({
//       error: '토큰 폐기 실패',
//       details: err.response?.data || err.message,
//     });
//   }
// });
/**
//  * @swagger
//  * /api/kis/token:
//  *   get:
//  *     summary: KIS OpenAPI Access Token 발급
//  *     tags: [KIS]
//  *     responses:
//  *       200:
//  *         description: Access token 문자열 반환
//  */
// router.get('/token', async (req, res) => {
//   try {
//     const token = await getAccessToken();
//     res.json({ access_token: token });
//   } catch (err) {
//     res.status(500).json({ error: '토큰 발급 실패', details: err.message });
//   }
// });

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
 *         description: 시장 구분 코드 J 코스피 Q 코스닥
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
 *                     example: 005930
 *                   hts_kor_isnm:
 *                     type: string
 *                     description: 종목명
 *                     example: 삼성전자
 *                   prdy_ctrt:
 *                     type: string
 *                     description: 전일 대비 등락률 (%)
 *                     example: "4.23"
 *       500:
 *         description: 등락률 순위 조회 실패
 */
router.get('/top-fluctuation', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
   
    const marketCode = req.query.market || 'J';
 console.log('Access Token:', accessToken);
 console.log('marketCode:', marketCode);
    const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/ranking/fluctuation`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: 'FHPST01710000',
        custtype: 'P'
      },
      params: {
        FID_COND_MRKT_DIV_CODE: marketCode,
      }
    });

    const output = response.data.output;

    if (!output || !Array.isArray(output)) {
      console.log('⚠️ API 응답 이상:', response.data);
      return res.status(500).json({ error: 'KIS API 응답이 유효하지 않음', raw: response.data });
    }

    // 로그 및 응답
    console.log('Top 5 등락률 종목:');
    output.slice(0, 5).forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.hts_kor_isnm} (${item.stck_shrn_iscd}) - ${item.prdy_ctrt}%`);
    });

    res.json(output);
  } catch (err) {
    console.error('등락률 순위 조회 실패:', err.response?.data || err.message);
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
 *         description: 시장 구분 코드 J 코스피 Q 코스닥    
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
 *                     example: "005930"
 *                   hts_kor_isnm:
 *                     type: string
 *                     example: "삼성전자"
 *                   mrkt_tot_amt:
 *                     type: string
 *                     description: 시가총액 단위 원
 *                     example: "489000000000000"
 *       500:
 *         description: 시가총액 순위 조회 실패
 */

router.get('/top-marketcap', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const marketCode = req.query.market || 'J'; // J: 코스피, Q: 코스닥

  const response = await axios.get(`${KIS_API_BASE}/uapi/domestic-stock/v1/ranking/market-value`, {
  headers: {
    'content-type': 'application/json; charset=utf-8',
    authorization: `Bearer ${accessToken}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: 'FHPST01790000',
    custtype: 'P',
  },
  params: {
    fid_cond_mrkt_div_code: 'J', // or 'Q'
  }
});
console.log('🔍 전체 응답:', JSON.stringify(response.data, null, 2));


    const output = response.data.output;

    if (!output || !Array.isArray(output)) {
      console.warn('❗ 시가총액 순위 응답 이상:', response.data);
      return res.status(500).json({ error: '응답 이상', raw: response.data });
    }

    console.log('✅ 시총 상위 5 종목:');
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
 *         required: false
 *         schema:
 *           type: string
 *           enum: [J, Q]
 *           default: J
 *         description: 시장 구분 코드 J 코스피, Q 코스닥
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
    const accessToken = await getAccessToken();
    const marketCode = req.query.market || 'J'; // 'J': 코스피, 'Q': 코스닥

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
        FID_COND_MRKT_DIV_CODE: marketCode.padEnd(2, ' ') // "J" → "J "
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

export default router;
