// routes/sector.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

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

export default router;
