// ╔══════════════════════════════════════════════════════════════╗
// ║     GOOGLE APPS SCRIPT — CHẤM CÔNG NGÀY HỘI VIỆC LÀM       ║
// ║  Ghi thẳng vào cột In/Out của sheet gốc DS_DiemDanh         ║
// ╚══════════════════════════════════════════════════════════════╝

// ── CẤU HÌNH ──────────────────────────────────────────────────
// Thay bằng ID Google Sheet của bạn
// (lấy từ URL: docs.google.com/spreadsheets/d/[SHEET_ID]/edit)
const SHEET_ID   = '1hQCr_mKo1zYTOUX5rRd_rdbXIxZkZiXnHnWH_yuk-vU';
const SHEET_NAME = 'Final';

// Mapping cột (1-indexed: A=1, B=2, ...)
const COL_MSSV       = 3;   // Cột C
const COL_NAME       = 2;   // Cột B
const DATA_START_ROW = 3;   // Dòng đầu tiên có dữ liệu (bỏ qua 2 dòng header)

// Cột In/Out theo ngày (H=8, I=9, J=10, K=11, L=12, M=13)
const DATE_COL_MAP = {
  '8/4':  { in: 8,  out: 9  },   // H, I — TEST
  '9/4':  { in: 10, out: 11 },   // J, K
  '10/4': { in: 12, out: 13 },   // L, M
  '11/4': { in: 14, out: 15 },   // N, O
};

const SHEET_LOG = 'Log_ChấmCông'; // Sheet log phụ, tự tạo

// ─────────────────────────────────────────────────────────────

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: '✅ API chấm công đang hoạt động' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) throw new Error('Không có dữ liệu POST');

    const data = JSON.parse(e.postData.contents);
    if (!data.mssv || !data.type || !data.date) throw new Error('Thiếu mssv / type / date');

    // Xác định ngày — chuyển "9/4/2026" → "9/4"
    const dateKey = parseDateKey(data.date);
    if (!DATE_COL_MAP[dateKey]) {
      return jsonResponse({
        status: 'error',
        message: `Ngày ${dateKey} không nằm trong sự kiện (${Object.keys(DATE_COL_MAP).join(', ')})`
      });
    }

    const targetCol = data.type === 'Vào' ? DATE_COL_MAP[dateKey].in : DATE_COL_MAP[dateKey].out;

    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error(`Không tìm thấy sheet "${SHEET_NAME}"`);

    // Tìm row theo MSSV
    const lastRow    = sheet.getLastRow();
    const mssvValues = sheet.getRange(DATA_START_ROW, COL_MSSV, lastRow - DATA_START_ROW + 1, 1).getValues();
    const mssvStr    = String(data.mssv).trim();

    let targetRow = -1;
    for (let i = 0; i < mssvValues.length; i++) {
      if (String(mssvValues[i][0]).trim() === mssvStr) {
        targetRow = DATA_START_ROW + i;
        break;
      }
    }

    if (targetRow === -1) {
      return jsonResponse({ status: 'error', message: `Không tìm thấy MSSV ${data.mssv}` });
    }

    // Kiểm tra đã chấm chưa
    const existing = sheet.getRange(targetRow, targetCol).getValue();
    const isOverwrite = existing !== null && existing !== '';

    // Ghi giờ + định dạng màu
    writeCell(sheet, targetRow, targetCol, data.time, data.type);
    writeLog(ss, data, dateKey, targetRow, isOverwrite);

    if (isOverwrite) {
      return jsonResponse({
        status: 'warn',
        message: `⚠️ Ghi đè: ${data.name} — ${data.type} ${dateKey} lúc ${data.time} (cũ: ${existing})`
      });
    }

    return jsonResponse({
      status: 'ok',
      message: `✅ Đã chấm: ${data.name} — ${data.type} ngày ${dateKey} lúc ${data.time}`
    });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
//  Ghi ô + tô màu
// ─────────────────────────────────────────────────────────────
function writeCell(sheet, row, col, timeStr, type) {
  const cell = sheet.getRange(row, col);
  cell.setValue(timeStr);
  cell.setHorizontalAlignment('center');
  if (type === 'Vào') {
    cell.setBackground('#e6f4ea').setFontColor('#137333').setFontWeight('bold');
  } else {
    cell.setBackground('#fce8e6').setFontColor('#c5221f').setFontWeight('bold');
  }
}

// ─────────────────────────────────────────────────────────────
//  Ghi log phụ
// ─────────────────────────────────────────────────────────────
function writeLog(ss, data, dateKey, row, isOverwrite) {
  let log = ss.getSheetByName(SHEET_LOG);
  if (!log) {
    log = ss.insertSheet(SHEET_LOG);
    log.appendRow(['Timestamp', 'MSSV', 'Họ Tên', 'Nhiệm Vụ', 'Loại', 'Ngày', 'Giờ', 'Ghi đè', 'Row Sheet']);
    log.getRange('1:1').setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
    log.setFrozenRows(1);
  }
  log.appendRow([
    new Date().toLocaleString('vi-VN'),
    data.mssv,
    data.name,
    data.role || '',
    data.type,
    dateKey,
    data.time,
    isOverwrite ? 'CÓ' : 'Không',
    row
  ]);
}

// ─────────────────────────────────────────────────────────────
//  Helper: "9/4/2026" hoặc "09/04/2026" → "9/4"
// ─────────────────────────────────────────────────────────────
function parseDateKey(dateStr) {
  const parts = String(dateStr).split('/');
  if (parts.length >= 2) {
    return `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}`;
  }
  return dateStr;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
//  Test thủ công: Run → testWrite để kiểm tra kết nối
// ─────────────────────────────────────────────────────────────
function testWrite() {
  const mockData = {
    mssv: '24134035',
    name: 'Nguyễn Khắc Minh Khôi',
    type: 'Vào',
    date: '9/4/2026',
    time: '08:30:00',
    role: 'PHỤ TRÁCH CHUNG'
  };

  const ss      = SpreadsheetApp.openById(SHEET_ID);
  const sheet   = ss.getSheetByName(SHEET_NAME);
  const dateKey = parseDateKey(mockData.date);
  const col     = DATE_COL_MAP[dateKey].in;
  const last    = sheet.getLastRow();
  const mssv    = sheet.getRange(DATA_START_ROW, COL_MSSV, last - DATA_START_ROW + 1, 1).getValues();

  let targetRow = -1;
  for (let i = 0; i < mssv.length; i++) {
    if (String(mssv[i][0]).trim() === mockData.mssv) { targetRow = DATA_START_ROW + i; break; }
  }

  if (targetRow > 0) {
    writeCell(sheet, targetRow, col, mockData.time, mockData.type);
    SpreadsheetApp.getUi().alert(`✅ Test OK! Ghi vào row ${targetRow}, col ${col} (${SHEET_NAME})`);
  } else {
    SpreadsheetApp.getUi().alert('❌ Không tìm thấy MSSV test: ' + mockData.mssv);
  }
}
