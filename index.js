import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/user.js';
import sectorRoutes from './routes/sector.js';
import stockRoutes from './routes/stock.js';
import dailyPriceRoutes from './routes/dailyPrice.js';
import tickerRoutes from './routes/ticker.js';
import { swaggerUi, specs } from './swagger.js';

dotenv.config();
const app = express();
const FRONTEND_ORIGIN = 'http://localhost:3000'; // 프론트 주소


const PORT = process.env.PORT || 4000;
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.send('모닝스탁 백엔드 서버 실행 중!');
});

app.use('/api/user', userRoutes);
app.use('/api/sector', sectorRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/daily-price', dailyPriceRoutes);
app.use('/api/ticker', tickerRoutes);

// ⚠️ 반드시 라우터 등록 후에 swagger 설정
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.listen(PORT, () => {
  console.log(`🚀 서버 시작됨: http://localhost:${PORT}`);
});
