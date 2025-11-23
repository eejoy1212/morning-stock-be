// routes/sector.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs'
import axios from 'axios';
import * as cheerio from 'cheerio'
import pLimit from "p-limit";
import http from "http";
import https from "https";
import axiosRetry from "axios-retry";
import NodeCache from "node-cache";
import Bottleneck from "bottleneck";
// import dotenv from 'dotenv';
// dotenv.config(); 
const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
// ── 동시성 제한 (뉴스 키워드 병렬 호출)
// ── Axios 공통 설정 (KeepAlive + Timeout + 재시도 1회)
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = 2500;
axiosRetry(axios, { retries: 1, retryDelay: () => 200 });
const cache = new NodeCache({ stdTTL: 60 * 15, checkperiod: 60 * 2 });

const limit = pLimit(5);
/**
 * @swagger
 * tags:
 *   name: Sector
 *   description: 관심 종목 섹터 관리
 */

// 토큰에서 유저 ID 추출 미들웨어
export function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '토큰이 필요합니다' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("decoded>>>",decoded.id)
    req.userId = decoded.id;
       console.log("decoded>>>",decoded)
    next();
  } catch (err) {
    return res.status(403).json({ error: '유효하지 않은 토큰입니다' });
  }
}
export function authenticateTokenOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next(); // 로그인 안 한 경우

  const token = authHeader.split(' ')[1];
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
  } catch (err) {
    // 유효하지 않으면 무시하고 넘어감
  }
  next();
}

/**
 * @swagger
 * /api/sector:
 *   post:
 *     summary: 섹터 생성
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: 생성된 섹터 반환
 */
router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body;
  try {
    const sector = await prisma.sector.create({
      data: {
        name,
        userId: req.userId,
      },
    });
    res.json({ success: true, sector });
  } catch (err) {
    res.status(500).json({ error: '섹터 생성 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/sector/full:
 *   post:
 *     summary: 섹터 생성 + 종목들 등록
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, stocks]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "2차전지"
 *               stocks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, code]
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "엘앤에프"
 *                     code:
 *                       type: string
 *                       example: "066970"
 *     responses:
 *       200:
 *         description: 생성된 섹터 + 등록된 종목들 반환
 */
router.post('/full', authenticateToken, async (req, res) => {
  const { name, stocks } = req.body;

  if (!name || !Array.isArray(stocks)) {
    return res.status(400).json({ error: 'name과 stocks 배열이 필요합니다.' });
  }

  try {
    const sector = await prisma.sector.create({
      data: {
        name,
        userId: req.userId,
        stocks: {
          create: stocks.map((stock) => ({
            name: stock.name,
            code: stock.code,
          })),
        },
      },
      include: { stocks: true },
    });

    res.json({ success: true, sector });
  } catch (err) {
    console.error('섹터 생성 실패:', err);
    res.status(500).json({ error: '섹터 생성 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/sector:
 *   get:
 *     summary: 섹터 목록 조회 (검색 및 페이지네이션 지원)
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: 검색어 (섹터명, 종목명 또는 종목코드)
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 현재 페이지 번호
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 한 페이지당 항목 수
 *     responses:
 *       200:
 *         description: 필터링된 섹터 리스트 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 sectors:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/', authenticateToken, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const q = req.query.q?.toString().trim() || '';

  try {
const loweredQuery = q.toLowerCase(); // q는 .trim() 처리한 상태

// Prisma 쿼리
const whereCondition = {
  userId: req.userId,
  ...(q && {
    OR: [
      { name: { contains: loweredQuery } },
      {
        stocks: {
          some: {
            OR: [
              { name: { contains: loweredQuery } },
              { code: { contains: loweredQuery } }
            ]
          }
        }
      }
    ]
  })
};


    const [sectors, total] = await Promise.all([
      prisma.sector.findMany({
        where: whereCondition,
        include: { stocks: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sector.count({ where: whereCondition })
    ]);

    res.json({
      success: true,
      total,
      page,
      limit,
      sectors,
    });
  } catch (err) {
    console.error('섹터 조회 실패:', err);
    res.status(500).json({ error: '섹터 조회 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/sector/name-only:
 *   get:
 *     summary: 섹터명으로만 검색 (단순 검색용)
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: 섹터명 검색어
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: 섹터명으로 검색된 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 sectors:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/name-only', authenticateToken, async (req, res) => {
  const q = req.query.q?.toString().trim() || '';

  try {
    const loweredQuery = q.toLowerCase();

    const whereCondition = {
      userId: req.userId,
      ...(q && {
        name: {
          contains: loweredQuery,
        }
      })
    };

    const sectors = await prisma.sector.findMany({
      where: whereCondition,
      include: {
        stocks: true, // 필요 시 주석 제거
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      total: sectors.length,
      sectors,
    });
  } catch (err) {
    console.error('섹터명 검색 실패:', err);
    res.status(500).json({ error: '섹터명 검색 실패', details: err.message });
  }
});


/**
 * @swagger
 * /api/sector/{id}:
 *   put:
 *     summary: 섹터 이름 및 포함 종목 수정
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 수정할 섹터 ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               stocks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     code:
 *                       type: string
 *     responses:
 *       200:
 *         description: 수정된 섹터 반환
 */
router.put('/:id', authenticateToken, async (req, res) => {
  const sectorId = req.params.id;
  const { name, stocks } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name 값이 필요합니다.' });
  }

  try {
    // 0. 소유자 확인
    const sector = await prisma.sector.findFirst({
      where: { id: sectorId, userId: req.userId },
    });

    if (!sector) {
      return res.status(404).json({ error: '섹터를 찾을 수 없습니다.' });
    }

    // 1. 섹터 이름 수정
    await prisma.sector.update({
      where: { id: sectorId },
      data: { name },
    });

    // 2. 기존 종목 삭제
    await prisma.stock.deleteMany({
      where: { sectorId },
    });

    // 3. 새로운 종목 추가
    if (Array.isArray(stocks) && stocks.length > 0) {
      const stockData = stocks.map((s) => ({
        name: s.name,
        code: s.code,
        sectorId,
      }));

      await prisma.stock.createMany({
        data: stockData,
      });
    }

    // ✅ 4. 다시 조회하여 최신 정보 반환 (name 포함)
    const fullSector = await prisma.sector.findUnique({
      where: { id: sectorId },
      include: { stocks: true },
    });

    res.json({ success: true, sector: fullSector });
  } catch (err) {
    console.error('섹터 수정 실패:', err);
    res.status(500).json({ error: '섹터 수정 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/sector/monthly-top-sector-trend:
 *   get:
 *     summary: 이번 달 가장 많이 오른 섹터의 캔들스틱 데이터
 *     tags: [Sector]
 *     responses:
 *       200:
 *         description: 주가 추이 반환 (캔들스틱용)
 */
router.get('/monthly-top-sector-trend', async (req, res) => {
  try {
    console.log("monthly-top-sector-trend>>>")
    const today = dayjs().startOf('day')
    const oneMonthAgo = today.subtract(1, 'month')

    // 1. 섹터 중 수익률 높은 섹터 찾기
    const sectors = await prisma.sector.findMany({
      include: { stocks: true },
    })

    const sectorWithRate = []

    for (const sector of sectors) {
      const rates = []

      for (const stock of sector.stocks) {
      
        const prices = await prisma.dailyPrice.findMany({
          where: {
            code: stock.code,
            date: {
              gte: oneMonthAgo.toDate(),
              lte: today.toDate(),
            },
          },
          orderBy: { date: 'asc' },
        })

 //임시로 주석
        if (prices.length >= 2) {
          const start = prices[0].close
          const end = prices[prices.length - 1].close
          const change = ((end - start) / start) * 100
          rates.push(change)
        }
      }

      if (rates.length > 0) {
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
        sectorWithRate.push({ ...sector, avgRate })
      }
    }

    // if (sectorWithRate.length === 0) {
    //   return res.status(404).json({ error: '분석 가능한 섹터가 없습니다' })
    // }
if (sectorWithRate.length === 0) {
  return res.json({
    success: true,
    sectorName: null,
    candles: [],
    max: null,
    min: null,
  });
}

    const topSector = sectorWithRate.sort((a, b) => b.avgRate - a.avgRate)[0]
 
    // 2. 종목별 날짜별 OHLC 평균 구하기
    const dateMap = new Map()

    for (const stock of topSector.stocks) {
      const prices = await prisma.dailyPrice.findMany({
        where: {
          code: stock.code,
          date: {
            gte: oneMonthAgo.toDate(),
            lte: today.toDate(),
          },
        },
        orderBy: { date: 'asc' },
      })

      for (const p of prices) {
        const key = dayjs(p.date).format('YYYY-MM-DD')
        if (!dateMap.has(key)) {
          dateMap.set(key, { open: [], high: [], low: [], close: [] })
        }
        const entry = dateMap.get(key)
        entry.open.push(p.open)
        entry.high.push(p.high)
        entry.low.push(p.low)
        entry.close.push(p.close)
      }
    }

    const candleList = Array.from(dateMap.entries()).map(([date, values]) => ({
      time: date,
      open: Math.round(values.open.reduce((a, b) => a + b, 0) / values.open.length),
      high: Math.round(values.high.reduce((a, b) => a + b, 0) / values.high.length),
      low: Math.round(values.low.reduce((a, b) => a + b, 0) / values.low.length),
      close: Math.round(values.close.reduce((a, b) => a + b, 0) / values.close.length),
    }))

    candleList.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

    const max = candleList.reduce((acc, cur) => (cur.close > acc.close ? cur : acc), candleList[0])
    const min = candleList.reduce((acc, cur) => (cur.close < acc.close ? cur : acc), candleList[0])

    res.json({
      success: true,
      sectorName: topSector.name,
      candles: candleList,
      max,
      min,
    })
  } catch (err) {
    console.error('섹터 캔들 트렌드 실패:', err)
    res.status(500).json({ error: '섹터 트렌드 조회 실패', details: err.message })
  }
})

/**
 * @swagger
 * /api/sector/{id}:
 *   delete:
 *     summary: 섹터 삭제
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공 여부 반환
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    await prisma.sector.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '섹터 삭제 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/sector/monthly-gainers:
 *   get:
 *     summary: 최근 한 달 간 가장 많이 오른 섹터 Top N 조회
 *     tags: [Sector]
 *     responses:
 *       200:
 *         description: 섹터 상승률 리스트 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sectors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sectorName:
 *                         type: string
 *                       rate:
 *                         type: number
 *       500:
 *         description: 서버 오류
 */
router.get('/monthly-gainers', async (req, res) => {
  try {
    const today = dayjs().startOf('day')
    const oneMonthAgo = today.subtract(1, 'month')

    const sectors = await prisma.sector.findMany({
      include: { stocks: true },
    })

    const sectorResults = []

    for (const sector of sectors) {
      const rates = []

      for (const stock of sector.stocks) {
        const prices = await prisma.dailyPrice.findMany({
          where: {
            code: stock.code,
            date: {
              gte: oneMonthAgo.toDate(),
              lte: today.toDate(),
            },
          },
          orderBy: { date: 'asc' },
        })

        if (prices.length >= 2) {
          console.log(prices)
          const start = prices[0].close
          const end = prices[prices.length - 1].close
          const change = ((end - start) / start) * 100
          rates.push(change)
        }
      }

      if (rates.length > 0) {
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
        sectorResults.push({
          sectorName: sector.name,
          rate: parseFloat(avgRate.toFixed(2)),
        })
      }
    }

    const sorted = sectorResults.sort((a, b) => b.rate - a.rate).slice(0, 8)

    res.json({ success: true, sectors: sorted })
  } catch (err) {
    console.error('섹터 상승률 계산 실패:', err)
    res.status(500).json({ error: '섹터 상승률 계산 실패', details: err.message })
  }
})
/**
 * @swagger
 * /api/sector/og:
 *   get:
 *     summary: 주어진 URL에서 OG(Open Graph) 이미지 추출
 *     tags: [Sector]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: OG 이미지를 가져올 대상 페이지의 URL
 *     responses:
 *       200:
 *         description: OG 이미지 URL 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 image:
 *                   type: string
 *       400:
 *         description: URL이 제공되지 않음
 *       500:
 *         description: 이미지 추출 실패
 */
router.get("/og", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL이 필요합니다." });
  }

  try {

    // ✅ 원본 HTML 가져오기
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OGFetcher/1.0; +https://yourdomain.com)",
        Accept: "text/html",
      },
      timeout: 3500,
    });

    const $ = cheerio.load(data);

    // ✅ 1순위: og:image
    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");

    // ✅ 2순위: 첫 번째 <img> 태그
    if (!image) {
      const firstImg = $("img").first().attr("src");
      if (firstImg && /^https?:\/\//.test(firstImg)) {
        image = firstImg;
      }
    }

    // ✅ 3순위: 기본 썸네일
    if (!image) {
      image = "https://yourcdn.com/default-thumbnail.png";
    }

    // ⚙️ protocol 없는 경우 보정 (예: //img.naver.net/...)
    if (image.startsWith("//")) {
      image = "https:" + image;
    }

    return res.json({ image });
  } catch (err) {
    console.error("❌ OG 이미지 추출 실패:", err.message);
    return res.json({ image: "https://yourcdn.com/default-thumbnail.png" });
  }
});
/**
 * @swagger
 * /api/sector/keyword-news:
 *   get:
 *     summary: 키워드별 주식 뉴스 3건씩 조회 (Naver Search API)
 *     tags: [Sector]
 *     description: |
 *       사전에 정한(또는 동적으로 생성한) 키워드 목록을 기준으로
 *       네이버 뉴스 API에서 각 키워드당 최신 기사 3건을 가져와 반환합니다.
 *       응답은 배열 1개 요소에 키워드-기사목록 맵을 담은 형태입니다.
 *       예: `[ { "삼성전자": [...3개], "현대차": [...3개] } ]`
 *     responses:
 *       200:
 *         description: 키워드별 뉴스 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 keywords:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 사용된 키워드 목록
 *                 result:
 *                   type: array
 *                   minItems: 1
 *                   maxItems: 1
 *                   items:
 *                     type: object
 *                     additionalProperties:
 *                       type: array
 *                       description: 해당 키워드로 수집된 기사 3건
 *                       items:
 *                         type: object
 *                         properties:
 *                           title:
 *                             type: string
 *                             description: 기사 제목(HTML 태그 제거)
 *                           originallink:
 *                             type: string
 *                             nullable: true
 *                           link:
 *                             type: string
 *                             nullable: true
 *                           pubDate:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *       500:
 *         description: 서버 오류
 */
const limiter = new Bottleneck({
  minTime: 400,        // 요청 간 0.4초 간격 (초당 ~2~3회)
  maxConcurrent: 1,    // 직렬화(보수적으로)
});

const perKeywordCache = new NodeCache({ stdTTL: 60 * 5, checkperiod: 60 }); // 5분

async function searchNewsByKeyword(keyword, per, clientId, clientSecret) {
  const cacheKey = `kw:${keyword}:per:${per}`;
  const hit = perKeywordCache.get(cacheKey);
  if (hit) return hit;

  const run = async () => {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
      keyword
    )}&display=${Math.max(per * 2, per)}&sort=date`;

    try {
      const { data } = await axios.get(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
        timeout: 8000,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      const uniq = new Map();
      for (const it of items) {
        const key =
          (typeof it.originallink === "string" && it.originallink) ||
          `${stripTag(it.title ?? "")}_${it.pubDate ?? ""}`;
        if (!uniq.has(key)) uniq.set(key, it);
      }

      const top = Array.from(uniq.values())
        .sort(
          (a, b) =>
            new Date(b.pubDate ?? 0).getTime() - new Date(a.pubDate ?? 0).getTime()
        )
        .slice(0, per)
        .map((it) => ({
          title: stripTag(it.title ?? ""),
          originallink: it.originallink ?? null,
          link: it.link ?? null,
          pubDate: it.pubDate ?? null,
        }));

      perKeywordCache.set(cacheKey, top);
      return top;
    } catch (err) {
      // 429 핸들링: Retry-After or 지수 백오프 후 1회 재시도
      if (err?.response?.status === 429) {
        const ra = parseInt(err.response.headers?.["retry-after"] || "1", 10);
        const waitMs = Math.max(ra, 1) * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        // 한 번만 재시도
        const { data } = await axios.get(url, {
          headers: {
            "X-Naver-Client-Id": clientId,
            "X-Naver-Client-Secret": clientSecret,
          },
          timeout: 8000,
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        console.log("뉴스 결과 : ",items)
        const uniq = new Map();
        for (const it of items) {
          const key =
            (typeof it.originallink === "string" && it.originallink) ||
            `${stripTag(it.title ?? "")}_${it.pubDate ?? ""}`;
          if (!uniq.has(key)) uniq.set(key, it);
        }
        const top = Array.from(uniq.values())
          .sort(
            (a, b) =>
              new Date(b.pubDate ?? 0).getTime() -
              new Date(a.pubDate ?? 0).getTime()
          )
          .slice(0, per)
          .map((it) => ({
            title: stripTag(it.title ?? ""),
            originallink: it.originallink ?? null,
            link: it.link ?? null,
            pubDate: it.pubDate ?? null,
          }));
        perKeywordCache.set(cacheKey, top);
        console.log("top : ",top)
        return top;
      }
      console.log(err)
      throw err;
    }
  };

  // limiter로 속도 제한 적용
  return limiter.schedule(run);
}

// 라우터
router.get("/keyword-news", async (req, res) => {
  try {
    console.log("키워드 검색")
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "NAVER API 키 미설정" });
    }

    const raw = (req.query.keywords) || "";
    const perRaw = Number(req.query.per) || 3;
    const per = Math.min(Math.max(perRaw, 1), 5);

    let keywords = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      keywords = await fetchTrendingKeywords(); // 너가 만든 크롤링+캐싱
    }
    keywords = keywords.slice(0, 12); // 안전한 상한선

    const results = await Promise.all(
      keywords.map(async (k) => ({
        keyword: k,
        articles: await searchNewsByKeyword(k, per, clientId, clientSecret),
      }))
    );

    const bucket= {};
    for (const r of results) bucket[r.keyword] = r.articles;
console.log(bucket)
    return res.json({ success: true, keywords, per, result: [bucket] });
  } catch (err) {
    console.error("키워드별 뉴스 수집 실패:", err?.message ?? err);
    return res
      .status(err?.response?.status || 500)
      .json({ error: "뉴스 수집 실패", details: err?.message ?? String(err) });
  }
});





/**
 * @swagger
 * /api/sector/news:
 *   get:
 *     summary: 내 섹터에 포함된 종목 관련 뉴스 조회 (Naver API 기반)
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 종목 이름 기반 뉴스 기사 목록 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 articles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       originallink:
 *                         type: string
 *                       link:
 *                         type: string
 *                       pubDate:
 *                         type: string
 */
// 📡 뉴스 라우터
router.get("/news", authenticateTokenOptional, async (req, res) => {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "NAVER API 키 미설정" });
    }
    // 기본 키워드/섹터명
    let keywords = ["KOSPI", "KOSDAQ","화제","속보"];
    let sectorNames = [];
    // 네이버 뉴스 병렬 호출(키워드별 상위 5건)
    const tasks = keywords.map((keyword) =>
      limit(async () => {
        const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
          keyword
        )}&display=5&sort=date`;

        const { data } = await axios.get(url, {
          headers: {
            "X-Naver-Client-Id": clientId,
            "X-Naver-Client-Secret": clientSecret,
          },
        });

        return Array.isArray(data?.items) ? data.items : [];
      })
    );

    const fetchedArrays = await Promise.all(tasks);
    const items = fetchedArrays.flat();

    // 중복 제거 (originallink 우선, 없으면 title+pubDate 조합)
    const uniqMap = new Map();
    for (const it of items) {
      const key =
        (typeof it.originallink === "string" && it.originallink) ||
        `${it.title ?? ""}_${it.pubDate ?? ""}`;
      if (!uniqMap.has(key)) uniqMap.set(key, it);
    }
    const articles = Array.from(uniqMap.values()).slice(0, 60);

    return res.json({
      success: true,
      articles,     // 이미지 없음(프론트에서 /api/og로 지연 로딩)
      sectorNames,  // 로그인 안 했으면 []
    });
  } catch (err) {
    console.error("Naver 뉴스 수집 실패:", err?.message ?? err);
    return res.status(500).json({ error: "뉴스 수집 실패", details: err?.message ?? String(err) });
  }
});

// 인기 뉴스 
// 트렌드 키워드 캐시: 15분 유지

/**
 * 네이버 '랭킹뉴스' 페이지에서 섹션/언론사 타이틀 + 기사 제목을 긁어서
 * 주식 관련 상위 키워드를 추출한다.
 */
export async function fetchTrendingKeywords(){
  const CACHE_KEY = "trending_keywords";
  const cached = cache.get(CACHE_KEY);
  if (cached && cached.length) return cached;

  try {
    const { data } = await axios.get("https://news.naver.com/main/ranking/popularDay.naver", {
      headers: {
        // UA 지정: 일부 사이트에서 봇 트래픽 거부 방지
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(data);

    // 후보 키워드 수집: 섹션명, 언론사명, 기사 제목에서 뽑음
    const raw= [];

    // 섹션 이름 (예: 경제, IT/과학 등)
    $(".rankingnews_box .rankingnews_name").each((_, el) => {
      raw.push($(el).text().trim());
    });

    // 기사 제목
    $(".rankingnews_box .list_content a").each((_, el) => {
      const title = $(el).text().trim();
      if (title) raw.push(title);
    });

    // 언론사 이름 (보조)
    $(".rankingnews_box .press_name").each((_, el) => {
      const press = $(el).text().trim();
      if (press) raw.push(press);
    });

    // 타이틀에서 단어 분해 → 국내 증시 관련 단어 위주로 정규화
    const tokens = raw
      .flatMap((t) =>
        t
          .replace(/[^\w가-힣\s]/g, " ")
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
      // 흔한 불용어/짧은 단어 제거
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

    // 자주 등장하는 단어 상위 N + 도메인 키워드 가중치
    const freq = new Map();
    for (const tok of tokens) {
      const base = normalize(tok);
      const score = (freq.get(base) ?? 0) + 1;
      freq.set(base, score);
    }

    // 주식/금융 도메인 가중치
    for (const key of DOMAIN_BONUS) {
      if (freq.has(key)) freq.set(key, (freq.get(key) ?? 0) + 5);
    }

    // 점수순 정렬
    const ranked = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    // 주식 관련 기본 프롬프트와 합치되 중복 제거
    const seed = ["주식", "증시", "코스피", "코스닥", "금리", "환율", "반도체", "2차전지"];
    const uniq = dedupe([...ranked, ...seed])
      // 뉴스 검색에 유용한 조합 몇 개 추가
      .map((k) => mapToUsefulQuery(k))
      .filter(Boolean);

    const top = uniq.slice(0, 30); // 상위 10개
    cache.set(CACHE_KEY, top);
    return top;
  } catch (err) {
    console.error("트렌드 키워드 수집 실패:", err?.message ?? err);
    // 실패 시 안전한 기본 세트
    return ["주식", "증시", "코스피", "코스닥", "반도체", "2차전지", "엔비디아"];
  }
}

const STOP_WORDS = new Set([
  "단독",
  "속보",
  "기자",
  "종합",
  "영상",
  "포토",
  "인터뷰",
  "오늘",
  "내일",
  "정부",
  "대통령",
  "의원",
  "국회",
  "서울",
  "한국",
  "경제",
  "사회",
  "정치",
  "국제",
  "IT",
  "과학",
  "스포츠",
]);

const DOMAIN_BONUS = [
  "주식",
  "증시",
  "코스피",
  "코스닥",
  "삼성전자",
  "현대차",
  "LG",
  "SK",
  "NVIDIA",
  "엔비디아",
  "반도체",
  "2차전지",
  "배터리",
  "환율",
  "금리",
];

function normalize(s) {
  // 간단 정규화 (대문자 → 소문자; 영문만 소문자 처리)
  return /[A-Za-z]/.test(s) ? s.toLowerCase() : s;
}

function dedupe(arr) {
  return [...new Set(arr)];
}

function mapToUsefulQuery(k) {
  // 뉴스 검색에서 유용하도록 몇 가지 매핑
  if (k === "반도체") return "반도체 주가";
  if (k === "배터리" || k === "2차전지") return "2차전지 주가";
  if (k === "nvidia") return "엔비디아";
  if (k === "it") return null; // 너무 일반적이면 제거
  return k;
}



/**
 * @swagger
 * /api/sector/news/popular:
 *   get:
 *     summary: 주식 관련 인기 뉴스 조회 (크롤링 키워드 + Naver 뉴스 검색)
 *     tags: [Sector]
 *     responses:
 *       200:
 *         description: 주식 시장 인기 기사 목록
 */
router.get("/news/popular", async (req, res) => {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "NAVER API 키 미설정" });
    }

    // 1) 캐시 히트 체크
    const CACHE_KEY = "popular_news_v1";
    const cached = cache.get<any>(CACHE_KEY);
    if (cached) return res.json(cached);

    // 2) 트렌드 키워드 가져오기 (크롤링 + 15분 캐시)
    const keywords = await fetchTrendingKeywords();

    // 3) 키워드별 네이버 뉴스 검색 (최신순 5건씩)
    const tasks = keywords.map((keyword) =>
      limit(async () => {
        const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
          keyword
        )}&display=5&sort=date`;

        const { data } = await axios.get(url, {
          headers: {
            "X-Naver-Client-Id": clientId,
            "X-Naver-Client-Secret": clientSecret,
          },
          timeout: 10000,
        });

        const items = Array.isArray(data?.items) ? data.items : [];
        // 키워드 메타정보를 남기면 프론트에서 "이 키워드로 찾은 기사" 배지 표기가능
        return items.map((it) => ({ ...it, _keyword: keyword }));
      })
    );

    const arrays = await Promise.all(tasks);
    const all = arrays.flat();

    // 4) 중복 제거 (originallink 우선, 없으면 title+pubDate)
    const uniqMap = new Map();
    for (const it of all) {
      const key =
        (typeof it.originallink === "string" && it.originallink) ||
        `${stripTag(it.title ?? "")}_${it.pubDate ?? ""}`;
      if (!uniqMap.has(key)) uniqMap.set(key, it);
    }

    // 5) 최신순 정렬 후 상위 20개
    const articles = Array.from(uniqMap.values())
      .sort(
        (a, b) => new Date(b.pubDate ?? 0).getTime() - new Date(a.pubDate ?? 0).getTime()
      )
      .slice(0, 20);

    const payload = {
      success: true,
      keywords,  // 사용된 트렌드 키워드(디버그/배지용)
      count: articles.length,
      articles,
    };

    // 6) 캐시에 저장 (5분)
    cache.set(CACHE_KEY, payload);

    return res.json(payload);
  } catch (err) {
    console.error("인기 뉴스 수집 실패:", err?.message ?? err);
    return res.status(500).json({
      error: "인기 뉴스 수집 실패",
      details: err?.message ?? String(err),
    });
  }
});

function stripTag(html) {
  return html.replace(/<[^>]*>/g, "");
}
export default router;
