// lib/exportExcel.js
import * as XLSX from 'xlsx';

export function exportToExcel(rows, filename = 'printer_report.xlsx') {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Detail ─────────────────────────────────────────
  const detail = rows.map((r, i) => ({
    'ลำดับ': i + 1,
    'Serial Number': r.serial || 'N/A',
    'รุ่นเครื่องพิมพ์': r.model || 'N/A',
    'A5 Impressions': Number(r.a5_impressions) || 0,
    'Grand Total': Number(r.grand_total) || 0,
  }));

  const ws1 = XLSX.utils.json_to_sheet(detail);
  ws1['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 14 }];

  // Bold header row styling
  const headerRange = XLSX.utils.decode_range(ws1['!ref']);
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (ws1[cellRef]) {
      ws1[cellRef].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E3A5F' } },
        alignment: { horizontal: 'center' },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws1, 'Printer Report');

  // ── Sheet 2: Summary ─────────────────────────────────────────
  const totalGrand = rows.reduce((s, r) => s + (Number(r.grand_total) || 0), 0);
  const totalA5 = rows.reduce((s, r) => s + (Number(r.a5_impressions) || 0), 0);

  const summary = [
    { 'รายการ': 'จำนวนเครื่องทั้งหมด', 'ค่า': rows.length },
    { 'รายการ': 'Grand Total รวม (ทุกเครื่อง)', 'ค่า': totalGrand },
    { 'รายการ': 'A5 Impressions รวม', 'ค่า': totalA5 },
    { 'รายการ': 'วันที่ Export', 'ค่า': new Date().toLocaleString('th-TH') },
  ];

  const ws2 = XLSX.utils.json_to_sheet(summary);
  ws2['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

  XLSX.writeFile(wb, filename);
}
