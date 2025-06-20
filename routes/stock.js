// routes/stock.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import xlsx from 'xlsx';
import axios from 'axios';
import iconv from 'iconv-lite';
const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

// 유저 인증 미들웨어
function authenticateToken(req, res, next) {
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
 * tags:
 *   name: Stock
 *   description: 섹터에 종목 등록/삭제/조회
 */
/**
 * @swagger
 * /api/stock/search-company:
 *   get:
 *     summary: 회사명 또는 종목코드로 주식 검색
 *     tags: [Stock]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 검색어 (회사명 또는 종목코드 일부)
 *     responses:
 *       200:
 *         description: 검색 결과 리스트
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stocks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       market:
 *                         type: string
 */
router.get('/search-company', async (req, res) => {
  const { q } = req.query;

  console.log('✅ 요청 도착:', q);

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ success: false, error: '검색어(q)가 필요합니다.' });
  }

  try {
    const results = await prisma.tickerInfo.findMany({
      where: {
        OR: [
          { name: { contains: q, } },
          { code: { contains: q } }
        ]
      },
      take: 50,
      orderBy: { name: 'asc' },
    });

    console.log('📦 검색 결과:', results.length);

    res.json({ success: true, stocks: results });
  } catch (err) {
    console.error('❌ 검색 실패:', err);
    res.status(500).json({ success: false, error: '검색 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/stock:
 *   post:
 *     summary: 종목 추가
 *     tags: [Stock]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sectorId, name]
 *             properties:
 *               sectorId:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: 종목 추가 성공
 */
router.post('/', authenticateToken, async (req, res) => {
  const { sectorId, name,code } = req.body;
  try {
    const stock = await prisma.stock.create({
      data: {
        name,
        code,
        sectorId,
      },
    });
    res.json({ success: true, stock });
  } catch (err) {
    res.status(500).json({ error: '종목 추가 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/stock/{id}:
 *   delete:
 *     summary: 종목 삭제
 *     tags: [Stock]
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
 *         description: 종목 삭제 성공
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    await prisma.stock.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '종목 삭제 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/stock/{sectorId}:
 *   get:
 *     summary: 섹터별 종목 목록 조회
 *     tags: [Stock]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sectorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 종목 목록 반환
 */
router.get('/:sectorId', authenticateToken, async (req, res) => {
  const { sectorId } = req.params;
  try {
    const stocks = await prisma.stock.findMany({ where: { sectorId } });
    res.json({ success: true, stocks });
  } catch (err) {
    res.status(500).json({ error: '종목 조회 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/stock/fetch-from-krx:
 *   post:
 *     summary: KRX에서 기업리스트를 가져와 TickerInfo 테이블에 저장 (XLSX 기반)
 *     tags: [Stock]
 *     responses:
 *       200:
 *         description: 저장된 기업 수 반환
 *       500:
 *         description: 서버 오류
 */
router.post('/fetch-from-krx', async (req, res) => {
  try {
    const response = await axios.get(
      'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download',
      { responseType: 'arraybuffer' }
    );

    const decodedBuffer = iconv.decode(Buffer.from(response.data), 'EUC-KR');
    const workbook = xlsx.read(decodedBuffer, { type: 'string' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);
console.log(rows)
    let count = 0;
    for (const row of rows) {
      const name = row['회사명'];
      const code = String(row['종목코드']).padStart(6, '0');
      const market = row['시장구분'];

      if (!name || !code || !market) continue;

      const exists = await prisma.tickerInfo.findFirst({ where: { code } });
      if (!exists) {
        await prisma.tickerInfo.create({ data: { name, code, market } });
        count++;
      }
    }

    res.json({ success: true, count });
  } catch (err) {
    console.error('KRX 수집 오류:', err);
    res.status(500).json({ error: 'KRX 수집 실패', details: err.message });
  }
});


export default router;
