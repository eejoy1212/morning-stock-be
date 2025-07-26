// //로컬용
// import dotenv from 'dotenv';
// dotenv.config();
import axios from 'axios';
import express from 'express';
import cron from 'node-cron';
import dayjs from 'dayjs';
import { PrismaClient } from '@prisma/client';
// import XLSX from 'xlsx-style';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { authenticateToken } from './sector.js';
import Bottleneck from 'bottleneck';
import { getAccessToken } from './kis.js';
const KIS_API_BASE = 'https://openapi.koreainvestment.com:9443';
const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
const prisma = new PrismaClient();
const router = express.Router();

function createExcelBufferFromGroupedStocks(data) {
  const sectorMap = new Map();

  data.forEach((row) => {
    Object.entries(row.stocks).forEach(([sector, stocks]) => {
      if (!sectorMap.has(sector)) sectorMap.set(sector, []);
      const list = sectorMap.get(sector);
      for (const stock in stocks) {
        if (!list.includes(stock)) list.push(stock);
      }
    });
  });

  const sectors = Array.from(sectorMap.keys());

  const header1 = [''];
  const header2 = [''];
  const increaseRateRow = ['인상률'];
  const averageRateRow = ['평균 인상률'];

  sectors.forEach((sector) => {
    const stocks = sectorMap.get(sector);
    header1.push(...Array(stocks.length).fill(sector));
    header2.push(...stocks);
    increaseRateRow.push(...Array(stocks.length).fill(''));
    averageRateRow.push(...Array(stocks.length).fill(''));
  });

  const rows = data.map((row) => {
    const result = [row.date];
    sectors.forEach((sector) => {
      const stocks = sectorMap.get(sector);
      stocks.forEach((stock) => {
        result.push(row.stocks?.[sector]?.[stock] ?? '');
      });
    });
    return result;
  });

  const worksheetData = [header1, header2, increaseRateRow, averageRateRow, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  const merges = [];
  let col = 1;
  sectors.forEach((sector) => {
    const stocks = sectorMap.get(sector);
    const endCol = col + stocks.length - 1;
    if (stocks.length > 1) merges.push({ s: { r: 0, c: col }, e: { r: 0, c: endCol } });
    merges.push({ s: { r: 3, c: col }, e: { r: 3, c: endCol } });
    col += stocks.length;
  });
  worksheet['!merges'] = merges;

  const increaseRow = 2;
  const averageRow = 3;
  const dataStartRow = 4;
  const totalRows = rows.length;

  let colIdx = 1;
  sectors.forEach((sector) => {
    const stocks = sectorMap.get(sector);
    const rateCells = [];

    stocks.forEach((_, i) => {
      const c = colIdx + i;
      const first = XLSX.utils.encode_cell({ r: dataStartRow, c });
      const last = XLSX.utils.encode_cell({ r: dataStartRow + totalRows - 1, c });
      const rateCell = XLSX.utils.encode_cell({ r: increaseRow, c });

      worksheet[rateCell] = {
        f: `(${first}-${last})/${last}*100`,
        v: 0,
        t: 'n',
        z: '0.00"%"',
        s: {
          alignment: { horizontal: 'center' },
          fill: { fgColor: { rgb: 'FFFF00' } },
        },
      };

      rateCells.push(rateCell);
    });

    if (rateCells.length > 0) {
      const avgCell = XLSX.utils.encode_cell({ r: averageRow, c: colIdx });
      worksheet[avgCell] = {
        f: `AVERAGE(${rateCells.join(',')})`,
        v: 0,
        t: 'n',
        z: '0.00"%"',
        s: {
          alignment: { horizontal: 'center' },
          fill: { fgColor: { rgb: 'FF00FF' } },
          font: { color: { rgb: 'FFFFFF' } },
        },
      };
    }

    colIdx += stocks.length;
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '일자별 종가');
  workbook.Workbook = { CalcPr: { fullCalcOnLoad: true } };

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
    cellStyles: true,
  });
}

export async function generateAndSendDailyReport(userId) {
  const today = dayjs().startOf('day');
  const startDate = dayjs('2025-06-01');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const email = user?.email;
  //임시
  // if (email!=="sunbun2179@daum.net")return;
  // if (email!=="lwh961212@gmail.com")return;
  if (!email) throw new Error('유저 이메일을 찾을 수 없습니다');
  const sectors = await prisma.sector.findMany({
    where: { userId },
    include: { stocks: true },
  });
  const tickers = {};
  for (const sector of sectors) {
    tickers[sector.name] = sector.stocks.map((s) => ({ name: s.name, code: s.code }));
  }

  const accessToken = await getAccessToken();
  const resultMap = {}; // { date: { sector: { stock: price } } }
  const limiter = new Bottleneck({ maxConcurrent: 5, minTime: 250 });
  const tasks = [];

  for (const [sector, stocks] of Object.entries(tickers)) {
    for (const { name: stockName, code: tickerCode } of stocks) {
      tasks.push(
        limiter.schedule(async () => {
          try {
            const response = await axios.get(
              `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
              {
                headers: {
                  'content-type': 'application/json; charset=utf-8',
                  authorization: `Bearer ${accessToken}`,
                  appkey: APP_KEY,
                  appsecret: APP_SECRET,
                  tr_id: 'FHKST03010100',
                  custtype: 'P',
                },
                params: {
                  fid_cond_mrkt_div_code: 'J',
                  fid_input_iscd: tickerCode,
                  fid_input_date_1: startDate.format('YYYYMMDD'),
                  fid_input_date_2: today.format('YYYYMMDD'),
                  fid_period_div_code: 'D',
                  fid_org_adj_prc: '0',
                },
              }
            );

            const output = response.data.output2;

            output.forEach((day) => {
              const date = `${day.stck_bsop_date.slice(0, 4)}-${day.stck_bsop_date.slice(4, 6)}-${day.stck_bsop_date.slice(6, 8)}`;
              if (!resultMap[date]) resultMap[date] = {};
              if (!resultMap[date][sector]) resultMap[date][sector] = {};
              resultMap[date][sector][stockName] = parseInt(day.stck_clpr, 10);
            });
          } catch (err) {
            console.warn(`⚠️ ${sector} / ${stockName} 조회 실패`, err.response?.data || err.message);
          }
        })
      );
    }
  }

  await Promise.all(tasks);

  const dates = [];
  let current = startDate;
  while (current.isSameOrBefore(today)) {
    dates.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  const rows = dates
    .reverse()
    .filter((date) => resultMap[date] && Object.keys(resultMap[date]).length > 0)
    .map((date) => ({
      date,
      stocks: resultMap[date],
    }));

  const buffer = createExcelBufferFromGroupedStocks(rows);
  const filePath = path.resolve('./', `일자별_종가_데이터_${today.format('YYYYMMDD')}.xlsx`);
  fs.writeFileSync(filePath, buffer);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to:email,
    subject: `[자동 보고서] 일자별 종가 데이터 (${today.format('YYYY-MM-DD')})`,
    text: '첨부된 엑셀 파일을 확인해주세요.',
    attachments: [
      {
        filename: `일자별_종가_데이터_${today.format('YYYYMMDD')}.xlsx`,
        path: filePath,
      },
    ],
  });

  fs.unlinkSync(filePath);
}

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    await generateAndSendDailyReport(req.userId);
    res.status(200).send({ message: '이메일 전송 완료' });
  } catch (err) {
    console.error('[API] 리포트 전송 실패:', err);
    res.status(500).send({ error: '서버 오류' });
  }
});
// cron.schedule(
//   '0 6 * * *', // 오전 6시 (KST)
//   async () => {
//     console.log('🕕 [CRON 06:00 KST] daily report start');
//     try {
//       const users = await prisma.user.findMany();
//       for (const user of users) {
//         await generateAndSendDailyReport(user.id);
//       }
//       console.log('✅ 전체 리포트 전송 완료');
//     } catch (err) {
//       console.error('📛 CRON 리포트 전송 실패:', err);
//     }
//   },
//   {
//     timezone: 'Asia/Seoul',
//   }
// );

export default router;
