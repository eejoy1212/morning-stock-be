
// //로컬용
// import dotenv from 'dotenv';
// dotenv.config();
import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'your_refresh_secret';

// ===== 토큰 유틸 =====
const signAccessToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' }); // 15분

const signRefreshToken = (payload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: '30d' }); // 30일

const setRefreshCookie = (res, refreshToken) => {
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS에서만
    sameSite: 'lax',
    path: '/api/user',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

// ===== 스웨거 태그 =====
/**
 * @swagger
 * tags:
 *   name: User
 *   description: 유저 관련 API
 */

// ===== 회원가입 =====
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
 *               email: { type: string, example: test@example.com }
 *               password: { type: string, example: password123 }
 *               name: { type: string, example: 홍길동 }
 *     responses:
 *       200: { description: 회원가입 성공 }
 *       400: { description: 이미 가입된 이메일 }
 *       500: { description: 서버 오류 }
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

// ===== 로그인 (Access + Refresh) =====
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
 *               email: { type: string, example: test@example.com }
 *               password: { type: string, example: password123 }
 *     responses:
 *       200: { description: 로그인 성공 (토큰 발급) }
 *       401: { description: 인증 실패 }
 *       500: { description: 서버 오류 }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸습니다' });
    }

    const accessToken = signAccessToken({ id: user.id });
    const refreshToken = signRefreshToken({ id: user.id });

    const refreshHash = await bcrypt.hash(refreshToken, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    setRefreshCookie(res, refreshToken);

    res.json({ success: true, token: accessToken });
  } catch (err) {
    res.status(500).json({ error: '로그인 실패', details: err.message });
  }
});

// ===== 내 정보 =====
/**
 * @swagger
 * /api/user/me:
 *   get:
 *     summary: 내 정보 조회
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: 유저 정보 반환 }
 *       401: { description: 인증 실패 }
 *       404: { description: 유저 없음 }
 */
router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '토큰이 필요합니다' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) ;
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true },
    });
    if (!user) return res.status(404).json({ error: '유저를 찾을 수 없습니다' });
    res.json({ success: true, user });
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다' });
  }
});

// ===== 계정 삭제 =====
/**
 * @swagger
 * /api/user/delete:
 *   delete:
 *     summary: 내 계정 삭제
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: 삭제 성공 }
 *       401: { description: 인증 실패 }
 *       500: { description: 서버 오류 }
 */
router.delete('/delete', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '토큰이 필요합니다' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) ;
    await prisma.user.delete({ where: { id: decoded.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '유저 삭제 실패', details: err.message });
  }
});

// ===== 로그아웃 (쿠키 삭제 + 해시 제거) =====
/**
 * @swagger
 * /api/user/logout:
 *   post:
 *     summary: 로그아웃
 *     tags: [User]
 *     responses:
 *       200: { description: 로그아웃 성공 }
 */
router.post('/logout', async (req, res) => {
  try {
    const token = (req ).cookies?.refresh_token;
    if (token) {
      try {
        const decoded = jwt.verify(token, REFRESH_SECRET) ;
        await prisma.user.update({
          where: { id: decoded.id },
          data: { refreshTokenHash: null },
        });
      } catch { /* 토큰 만료/위조면 무시 */ }
    }
    res.clearCookie('refresh_token', { path: '/api/user' });
    res.json({ success: true, message: '로그아웃 완료(쿠키 삭제됨)' });
  } catch (err) {
    res.status(500).json({ error: '로그아웃 실패', details: err.message });
  }
});

// ===== 카카오 로그인 (Access + Refresh) =====
/**
 * @swagger
 * /api/user/kakao-login:
 *   post:
 *     summary: 카카오 로그인
 *     tags: [User]
 *     responses:
 *       200: { description: 카카오 로그인 성공 }
 */
router.post('/kakao-login', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code가 필요합니다.' });

  try {
    const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
    const REDIRECT_URI = process.env.REDIRECT_URI;

    // 1) Access Token
    const tokenRes = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_REST_API_KEY,
        redirect_uri: REDIRECT_URI,
        code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    // 2) 사용자 정보
    const userRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const kakaoAccount = userRes.data.kakao_account;
    if (!kakaoAccount.email) {
      return res.status(400).json({ error: '이메일 제공이 필요합니다 (카카오 설정 확인).' });
    }

    const email = kakaoAccount.email;
    const name = kakaoAccount.profile?.nickname || '카카오유저';
    const profileImage = kakaoAccount.profile?.profile_image_url || null;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: await bcrypt.hash('kakao-login', 10),
          type: 'kakao',
        },
      });
    }

    // Access + Refresh 발급/저장
    const accessToken = signAccessToken({ id: user.id });
    const refreshToken = signRefreshToken({ id: user.id });
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });
    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      token: accessToken,
      user: { id: user.id, email: user.email, name: user.name, profileImage },
    });
  } catch (err) {
    console.error('카카오 로그인 실패:', err.message);
    res.status(500).json({ error: '카카오 로그인 실패', details: err.message });
  }
});

// ===== 자동로그인(토큰 리프레시) =====
/**
 * @swagger
 * /api/user/refresh:
 *   post:
 *     summary: 리프레시 토큰으로 Access 토큰 재발급
 *     tags: [User]
 *     responses:
 *       200: { description: 재발급 성공 }
 *       401: { description: 리프레시 토큰 없음/만료/불일치 }
 */
router.post('/refresh', async (req, res) => {
  const token = (req ).cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: '리프레시 토큰이 없습니다' });

  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) ;
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.refreshTokenHash) {
      return res.status(401).json({ error: '리프레시 토큰 불일치' });
    }

    const ok = await bcrypt.compare(token, user.refreshTokenHash);
    if (!ok) return res.status(401).json({ error: '리프레시 토큰 검증 실패' });

    // 회전: 새 Refresh 발급/저장/쿠키 교체
    const newRefresh = signRefreshToken({ id: user.id });
    const newHash = await bcrypt.hash(newRefresh, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newHash },
    });
    setRefreshCookie(res, newRefresh);

    // 새 Access 발급
    const newAccess = signAccessToken({ id: user.id });
    res.json({ success: true, token: newAccess });
  } catch {
    return res.status(401).json({ error: '리프레시 토큰 만료 또는 유효하지 않음' });
  }
});

/**
 * @swagger
 * /api/user/change-password:
 *   post:
 *     summary: (로그인 필요) 비밀번호 변경
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: oldPass123!
 *               newPassword:
 *                 type: string
 *                 example: NewPass!234
 *     responses:
 *       200:
 *         description: 비밀번호 변경 성공 (모든 기기에서 로그아웃됨)
 *       400:
 *         description: 입력값 또는 정책 오류
 *       401:
 *         description: 인증 실패 (토큰 없음/유효하지 않음)
 *       404:
 *         description: 유저 없음
 *       422:
 *         description: 현재 비밀번호 불일치
 *       500:
 *         description: 서버 오류
 */
router.post("/change-password", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "토큰이 필요합니다" });
  }
  const token = auth.split(" ")[1];
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: "currentPassword와 newPassword는 필수입니다" });
  if (newPassword.length < 8)
    return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: "유저를 찾을 수 없습니다" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(422).json({ error: "현재 비밀번호가 올바르지 않습니다" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, refreshTokenHash: null },
    });

    res.clearCookie("refresh_token", { path: "/api/user" });
    res.json({
      success: true,
      message: "비밀번호가 변경되었습니다. 다시 로그인해주세요.",
    });
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "유효하지 않은 토큰입니다" });
    }
    res.status(500).json({ error: "비밀번호 변경 실패", details: err.message });
  }
});


export default router;