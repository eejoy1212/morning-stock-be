// utils/createExcelBuffer.js
import XLSX from 'xlsx';

export function createExcelBufferFromGroupedStocks(data) {
  const sectorMap = new Map();

  // 섹터 - 종목 매핑 구성
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

  // 헤더 구성
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

  // 데이터 행 구성
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

    if (stocks.length > 1) {
      merges.push({ s: { r: 0, c: col }, e: { r: 0, c: endCol } });
    }

    // 평균 인상률 병합
    merges.push({ s: { r: 3, c: col }, e: { r: 3, c: endCol } });

    col += stocks.length;
  });
  worksheet['!merges'] = merges;

  // 수식 적용
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
      };
    }

    colIdx += stocks.length;
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '일자별 종가');
  (workbook).Workbook = { CalcPr: { fullCalcOnLoad: true } };

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
    cellStyles: true,
  });

  return buffer;
}