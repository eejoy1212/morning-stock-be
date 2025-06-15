// routes/dailyPrice.js
import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import axios from 'axios';
import fetch from 'node-fetch';
dayjs.extend(utc)
dayjs.extend(timezone)
const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key'

function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: '토큰이 필요합니다' })

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.id
    next()
  } catch (err) {
    return res.status(403).json({ error: '유효하지 않은 토큰입니다' })
  }
}

/**
 * @swagger
 * /api/daily-price/upload:
 *   post:
 *     summary: 일별 종가 데이터를 엑셀로 업로드
 *     tags: [DailyPrice]
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 업로드된 종가 데이터 저장 완료
 *       500:
 *         description: 서버 오류
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const dailyPrices = rows.map(row => ({
      date: new Date(row['날짜']),
      name: row['회사명'],
      close: parseInt(row['종가'], 10)
    }));

    await prisma.dailyPrice.createMany({ data: dailyPrices });
    res.json({ success: true, count: dailyPrices.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '엑셀 업로드 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/daily-price/generate:
 *   get:
 *     summary: 섹터별 종가 데이터 생성
 *     tags: [DailyPrice]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 섹터별 종목과 종가 데이터를 반환
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.get('/generate', authenticateToken, async (req, res) => {
  try {
    const sectors = await prisma.sector.findMany({
      where: { userId: req.userId },
      include: { stocks: true },
    });

    const response = [];

    for (const sector of sectors) {
      const stockNames = sector.stocks.map((s) => s.name);

      // 모든 관련 가격 데이터 가져오기
      const allPrices = await prisma.dailyPrice.findMany({
        where: { name: { in: stockNames } },
        orderBy: { date: 'desc' },
      });

      // 중복 제거: name + date 기준으로 Map을 사용
      const uniqueMap = new Map();
      for (const price of allPrices) {
        const key = `${price.name}_${price.date.toISOString().split('T')[0]}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, {
            name: price.name,
            close: price.close,
            date: price.date,
          });
        }
      }

      response.push({
        sectorName: sector.name,
        sectorId: sector.id,
        stocks: Array.from(uniqueMap.values()),
      });
    }

    res.json({ success: true, data: response });
  } catch (err) {
    res.status(500).json({ error: '데이터 생성 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/daily-price/collect:
 *   post:
 *     summary: 전체 TickerInfo 기준 종가 수집 (cron용)
 *     tags: [DailyPrice]
 *     responses:
 *       200:
 *         description: 종가 수집 성공
 *       500:
 *         description: 서버 오류
 */
router.post('/collect', async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  try {
    const tickers = await prisma.tickerInfo.findMany();
    const created = [];

    for (const ticker of tickers) {
        console.log(`${ticker.name} 수집 시작`)
      const suffixes = ['.KS', '.KQ'];
      let success = false;

      for (const suffix of suffixes) {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.code}${suffix}?interval=1d&range=1d`;
          const { data } = await axios.get(url);
          const result = data?.chart?.result?.[0];

          const closePrice = result?.indicators?.quote?.[0]?.close?.[0];
          const timestamp = result?.timestamp?.[0];

          if (closePrice !== undefined && timestamp !== undefined) {
         const formattedDate =dayjs.unix(timestamp).tz('Asia/Seoul').toDate()

            await prisma.dailyPrice.create({
              data: {
                name: ticker.name,
                code: ticker.code,
                close: Math.round(closePrice),
                date: formattedDate,
              },
            });
            created.push(ticker.name);
            success = true;
            break;
          }
        } catch (err) {
          continue;
        }
      }

      if (!success) {
        console.error(`⚠️ ${ticker.code} 종가 수집 실패 (KS/KQ 모두 실패)`);
      }
    }

    res.json({ success: true, count: created.length });
  } catch (err) {
    res.status(500).json({ error: '종가 수집 실패', details: err.message });
  }
});


// cron 매일 오후 5시 실행
cron.schedule('0 17 * * *', async () => {
  console.log('🕔 [CRON] 일별 종가 수집 시작');
  try {
    const response = await fetch('http://localhost:4000/api/daily-price/collect', {
      method: 'POST',
    });

    const result = await response.json();
    console.log('✅ 수집 완료:', result);
  } catch (err) {
    console.error('CRON 요청 실패:', err.message);
  }
});

export default router;
