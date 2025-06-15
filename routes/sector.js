// routes/sector.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dayjs from 'dayjs'
import axios from 'axios';
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
 * /api/sector:
 *   get:
 *     summary: 섹터 목록 조회
 *     tags: [Sector]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 섹터 리스트 반환
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sectors = await prisma.sector.findMany({
      where: { userId: req.userId },
      include: { stocks: true },
    });
    res.json({ success: true, sectors });
  } catch (err) {
    res.status(500).json({ error: '섹터 조회 실패', details: err.message });
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
router.get('/news', authenticateToken, async (req, res) => {
  try {
    const sectors = await prisma.sector.findMany({
      where: { userId: req.userId },
      include: { stocks: true },
    });

    const keywords = [
      ...new Set(sectors.flatMap(sector => sector.stocks.map(stock => stock.name)))
    ];

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    const allArticles = [];

    for (const keyword of keywords) {
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=5&sort=date`;

      const { data } = await axios.get(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (data.items && data.items.length > 0) {
        allArticles.push(...data.items);
      }

      if (allArticles.length > 10) break; // 필요 시 개수 제한
    }

    res.json({ success: true, articles: allArticles.slice(0, 10) });
  } catch (err) {
    console.error('Naver 뉴스 수집 실패:', err.message);
    res.status(500).json({ error: '뉴스 수집 실패', details: err.message });
  }
});

export default router;
