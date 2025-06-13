// routes/stock.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

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

export default router;
