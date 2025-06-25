// routes/sector.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs'
import axios from 'axios';
import * as cheerio from 'cheerio'
const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

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
    req.userId = decoded.id;
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
// 🔍 og:image 파싱 함수
async function getOgImage(url) {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 3000,
      headers: {
        'User-Agent': 'Mozilla/5.0', // 크롤링 차단 방지
      },
    })

    const $ = cheerio.load(html)

    // 1순위: og:image
    const ogImage = $('meta[property="og:image"]').attr('content')
    if (ogImage) return ogImage

    // 2순위: 가장 큰 <img> 찾기 (폭 또는 높이 큰 순서)
    const images = $('img')
      .map((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src')
        const width = parseInt($(el).attr('width')) || 0
        const height = parseInt($(el).attr('height')) || 0
        return { src, width, height, area: width * height }
      })
      .get()
      .filter(img => img.src && img.src.startsWith('http')) // 절대 경로만
      .sort((a, b) => b.area - a.area) // 가장 큰 이미지 우선

    if (images.length > 0) return images[0].src

    // 3순위: 첫 번째 <img>라도
    const fallback = $('img').first().attr('src')
    if (fallback && fallback.startsWith('http')) return fallback

    // 4순위: 기본 썸네일
    return 'https://yourcdn.com/default-thumbnail.png'
  } catch (err) {
    console.warn(`이미지 추출 실패 (${url}):`, err.message)
    return 'https://yourcdn.com/default-thumbnail.png'
  }
}


// 📡 뉴스 라우터
router.get('/news', authenticateTokenOptional, async (req, res) => {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    const allArticles = [];

    // 1. 기본 키워드
    let keywords = ['주식',"KOSPI","KOSDAQ"];

    // 2. 로그인한 경우에만 관심종목 키워드로 대체
    if (req.userId) {
      const sectors = await prisma.sector.findMany({
        where: { userId: req.userId },
        include: { stocks: true },
      });

      const extracted = [
        ...new Set(sectors.flatMap(sector => sector.stocks.map(stock => stock.name)))
      ];

      if (extracted.length > 0) keywords = extracted;
    }

    for (const keyword of keywords) {
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=5&sort=date`;

      const { data } = await axios.get(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (data.items?.length) {
        for (const item of data.items) {
          const ogImage = await getOgImage(item.link);
          allArticles.push({
            ...item,
            image: ogImage,
          });
        }
      }

      if (allArticles.length > 24) break;
    }

    res.json({ success: true, articles: allArticles.slice(0, 24) });
  } catch (err) {
    console.error('Naver 뉴스 수집 실패:', err.message);
    res.status(500).json({ error: '뉴스 수집 실패', details: err.message });
  }
});



export default router;
