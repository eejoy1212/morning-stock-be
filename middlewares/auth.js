// middlewares/auth.js
const jwt = require('jsonwebtoken');

/**
 * Authorization: Bearer <access_token> 검증 미들웨어
 * - 성공 시 req.userId, req.userPayload 세팅
 * - 실패 시 401
 */
function requireAccessToken(req, res, next) {
  try {
    // 1) 헤더에서 Bearer 토큰 추출
    const auth = req.headers.authorization;
    let token = null;

    if (auth && auth.startsWith('Bearer ')) {
      token = auth.split(' ')[1];
    }

    // (선택) 2) 쿠키에서 access 토큰을 받는 경우 사용하려면 주석 해제
    // if (!token && req.cookies && req.cookies.access_token) {
    //   token = req.cookies.access_token;
    // }

    if (!token) {
      return res.status(401).json({ error: '토큰이 필요합니다' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');

    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
    }

    req.userId = decoded.id;
    req.userPayload = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
  }
}

/**
 * (옵션) 역할 기반 권한 체크
 * access 토큰 payload에 { role: 'admin' } 같은 값이 있을 때 사용
 */
function requireRole(role) {
  return (req, res, next) => {
    const userRole = req.userPayload && req.userPayload.role;
    if (userRole !== role) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }
    next();
  };
}

module.exports = {
  requireAccessToken,
  requireRole, // 옵션
};
