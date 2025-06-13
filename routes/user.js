// routes/user.js
import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

/**
 * @swagger
 * tags:
 *   name: User
 *   description: 유저 관련 API
 */

/**
 * @swagger
 * /api/user/register:
 *   post:
 *     summary: 회원가입
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email:
 *                 type: string
 *                 example: test@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *               name:
 *                 type: string
 *                 example: 홍길동
 *     responses:
 *       200:
 *         description: 회원가입 성공
 *       400:
 *         description: 이미 가입된 이메일
 *       500:
 *         description: 서버 오류
 */
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: '이미 가입된 이메일입니다' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: '회원가입 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: 로그인
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: test@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: 로그인 성공 (토큰 발급)
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸습니다' });
    }
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: '로그인 실패', details: err.message });
  }
});

/**
 * @swagger
 * /api/user/me:
 *   get:
 *     summary: 내 정보 조회
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 유저 정보 반환
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 유저 없음
 */
router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '토큰이 필요합니다' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, name: true } });
    if (!user) return res.status(404).json({ error: '유저를 찾을 수 없습니다' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다' });
  }
});

/**
 * @swagger
 * /api/user/delete:
 *   delete:
 *     summary: 내 계정 삭제
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 삭제 성공
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.delete('/delete', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '토큰이 필요합니다' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    await prisma.user.delete({ where: { id: decoded.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '유저 삭제 실패', details: err.message });
  }
});
/**
 * @swagger
 * /api/user/logout:
 *   post:
 *     summary: 로그아웃 (클라이언트에서 토큰 삭제)
 *     tags: [User]
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 */
router.post('/logout', (req, res) => {
  res.json({ success: true, message: '클라이언트에서 토큰을 삭제해주세요.' });
});
export default router;
