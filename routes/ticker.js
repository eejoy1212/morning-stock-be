import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
/**
 * @swagger
 * tags:
 *   - name: Ticker
 *     description: 티커 정보 관리
 */

/**
 * @swagger
 * /api/ticker/upload:
 *   post:
 *     summary: 티커 정보 엑셀 업로드
 *     tags: [Ticker]
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
 *         description: 업로드 성공
 *       500:
 *         description: 서버 오류
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    if (!buffer) return res.status(400).json({ error: '파일이 없습니다.' });

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[2]];
    const json = XLSX.utils.sheet_to_json(sheet);

    const data = json
      .filter(row => row['회사명'] && row['티커코드'])
      .map(row => ({
        name: String(row['회사명']),
        code: String(row['티커코드']),
      }));

    await prisma.tickerInfo.createMany({
      data,
      skipDuplicates: true,
    });

    res.json({ success: true, count: data.length });
  } catch (err) {
    res.status(500).json({ error: '업로드 실패', details: err.message });
  }
});

export default router;
