// // 로컬용
// import dotenv from 'dotenv';
// dotenv.config();
import express from 'express';
import cors from 'cors';

import userRoutes from './routes/user.js';
import sectorRoutes from './routes/sector.js';
import stockRoutes from './routes/stock.js';
import dailyPriceRoutes from './routes/dailyPrice.js';
import tickerRoutes from './routes/ticker.js';
import kisRoutes from './routes/kis.js';
import dailyReportRoutes from './routes/dailyReport.js';
import { swaggerUi, specs } from './swagger.js';


const app = express();
const FRONTEND_ORIGIN = 'https://morning-stock-web.vercel.app';
// 프론트 주소

const allowedOrigins = [
  'http://localhost:3000',
  'https://morning-stock-web.vercel.app',
   'https://ju-sung.com',
   'https://www.ju-sung.com',
    'http://localhost:4000',
];
const PORT = process.env.PORT || 4000;
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());

app.get('/api/test', (req, res) => {
  res.send('backend start test!');
});

app.use('/api/user', userRoutes);
app.use('/api/sector', sectorRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/daily-price', dailyPriceRoutes);
app.use('/api/ticker', tickerRoutes);
app.use('/api/kis', kisRoutes);
app.use('/api/dailyReport', dailyReportRoutes);

// ⚠️ 반드시 라우터 등록 후에 swagger 설정
// app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.listen(PORT, () => {
  console.log(` 시작됨: http://localhost:${PORT}`);
});
