// ── STATE ────────────────────────────────────────────────────
let students   = {};   
let log        = [];
let mode       = 'in'; // 'in' | 'out'
let html5QrCode = null;
let scanning   = false;
let lastScannedCode = '';
let lastScanTime    = 0;
let audioCtx = null;

// Ngày sự kiện → key ghi sheet (Đã phục hồi)
const EVENT_DATES = { '8/4':'8/4', '9/4':'9/4', '10/4':'10/4', '11/4':'11/4' };
const COL_LABEL   = {
  '8/4':  { in:'H (In 8/4)',  out:'I (Out 8/4)'  },
  '9/4':  { in:'J (In 9/4)',  out:'K (Out 9/4)'  },
  '10/4': { in:'L (In 10/4)', out:'M (Out 10/4)' },
  '11/4': { in:'N (In 11/4)', out:'O (Out 11/4)' },
};

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadStudentData(); // Tự động đọc file CSV ngầm
  loadLog();
  tick();
  setInterval(tick, 1000);
  switchInput('camera');
});

// ── ĐỌC FILE CSV NGẦM ─────────────────────────────────────────
async function loadStudentData() {
  try {
    const response = await fetch('thanhVienCeer.csv');
    if (!response.ok) throw new Error('Không tìm thấy file');
    
    const text = await response.text();
    const lines = text.split('\n');
    let count = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length >= 2) {
        const name = parts[0].trim(); 
        const id   = parts[1].trim();
        const role = parts[2] ? parts[2].trim() : "Thành viên";
        
        if (id) {
          students[id] = { mssv: id, name: name, role: role };
          count++;
        }
      }
    }
    showToast(`✅ Đã tải ${count} CTV từ file CSV!`);
  } catch (err) {
    showToast('❌ Lỗi đọc CSV. Hãy chắc chắn đang chạy trên server (localhost).', 4000);
  }
}



// ── QUẢN LÝ CAMERA (html5-qrcode) ─────────────────────────────
function switchInput(m) {
  document.getElementById('tabCam').classList.toggle('active',  m === 'camera');
  document.getElementById('tabHand').classList.toggle('active', m === 'manual');
  document.getElementById('secCam').style.display  = m === 'camera' ? 'block' : 'none';
  document.getElementById('secHand').style.display = m === 'manual' ? 'block' : 'none';
  if (m === 'manual') stopScan();
}

async function startScan() {
  if (scanning) return;
  try {
    document.getElementById('btnStart').style.display = 'none';
    scanning = true;
    
    // Xóa bộ nhớ đệm mã cũ để lần quét sau nhạy hơn
    lastScannedCode = '';
    lastScanTime = 0;

    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10 },
      (decodedText) => { 
        // 1. Tự động tắt camera NGAY LẬP TỨC khi bắt được mã
        stopScan(); 
        
        // 2. Sau đó mới xử lý dữ liệu (để tránh camera chạy ngầm lúc hiện bảng hỏi tên)
        processCode(decodedText); 
      },
      () => {} // Bỏ qua log lỗi khung hình
    );
  } catch(err) {
    showToast('❌ Không mở được camera');
    document.getElementById('btnStart').style.display = 'block';
    scanning = false;
  }
}

function stopScan() {
  if (html5QrCode && scanning) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear(); 
      html5QrCode = null; 
      scanning = false;
      
      // Hiện lại nút và đổi tên thành "Quét tiếp" cho hợp lý
      const btnStart = document.getElementById('btnStart');
      btnStart.style.display = 'block';
      btnStart.innerHTML = '📷 Quét mã tiếp theo'; 
      
    }).catch(e=>{});
  } else {
    scanning = false;
    document.getElementById('btnStart').style.display = 'block';
  }
}

// ── UI / LOGIC KHÁC ──────────────────────────────────────────
function tick() {
  const n = new Date();
  document.getElementById('clockTime').textContent =
    n.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  document.getElementById('clockDate').textContent =
    n.toLocaleDateString('vi-VN', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });

  // Cập nhật day badge (Đã phục hồi)
  const dk = todayKey();
  const badge = document.getElementById('dayBadge');
  if (EVENT_DATES[dk]) {
    badge.textContent = `📅 Ngày ${dk} — ${COL_LABEL[dk] ? 'Sự kiện đang diễn ra' : ''}`;
    badge.style.color = 'var(--green)';
  } else {
    badge.textContent = `📅 ${n.toLocaleDateString('vi-VN')} — Ngoài ngày sự kiện`;
    badge.style.color = 'var(--yellow)';
  }
}

function todayKey() {
  const n = new Date();
  return `${n.getDate()}/${n.getMonth()+1}`;
}

function addLog(entry) {
  log.unshift(entry);
  try { localStorage.setItem('bskdn_log', JSON.stringify(log.slice(0,300))); } catch(e){}
  updateStats(); renderLog();
}

function loadLog() {
  try { log = JSON.parse(localStorage.getItem('bskdn_log') || '[]'); } catch(e){ log = []; }
  updateStats(); renderLog();
}

function updateStats() {
  const td = log.filter(e => e.date === new Date().toLocaleDateString('vi-VN'));
  document.getElementById('stTotal').textContent = td.length;
  document.getElementById('stIn').textContent    = td.filter(e => e.type==='Vào').length;
  document.getElementById('stOut').textContent   = td.filter(e => e.type==='Ra').length;
}

function renderLog() {
  const el = document.getElementById('logList');
  if (!log.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:14px">Chưa có dữ liệu</div>'; return; }
  el.innerHTML = log.slice(0,60).map(e => `
    <div class="log-item">
      <div class="log-dot ${e.type==='Vào'?'in':'out'}">${e.type==='Vào'?'🟢':'🔴'}</div>
      <div class="log-info">
        <div class="log-name">${e.name}</div>
        <div class="log-sub">${e.mssv} · ${e.role}</div>
      </div>
      <div class="log-t">${e.time}<span>${e.type}</span></div>
    </div>`).join('');
}

function clearLog() {
  if (!confirm('Xóa lịch sử cục bộ?')) return;
  log = []; localStorage.removeItem('bskdn_log');
  updateStats(); renderLog(); showToast('🗑 Đã xóa');
}

function setMode(m) {
  mode = m;
  document.getElementById('btnIn').classList.toggle('active',  m === 'in');
  document.getElementById('btnOut').classList.toggle('active', m === 'out');
}

function goPage(name, idx) {
  ['pgScan','pgLog'].forEach((id,i) => {
    const el = document.getElementById(id);
    if (el) el.style.display = i === idx ? 'block' : 'none';
    const btn = document.getElementById('nb'+i);
    if (btn) btn.classList.toggle('active', i === idx);
  });
}

function setStatus(cls, html) {
  const el = document.getElementById('rStatus');
  el.className = 'res-status ' + cls; 
  el.innerHTML = html;
}

function showToast(msg, ms=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms);
}

function beep(ok=true) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = ok ? 880 : 220; o.type = 'sine';
    g.gain.setValueAtTime(.3, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime+.3);
    o.start(audioCtx.currentTime); o.stop(audioCtx.currentTime+.3);
  } catch(e) {}
}

// ── GỬI & ĐỌC PHẢN HỒI TỪ GOOGLE SHEET (DÙNG JSONP) ──────────
async function sendToSheet(entry) {
  if (!GOOGLE_APP_SCRIPT_URL || GOOGLE_APP_SCRIPT_URL === "https://script.google.com/macros/s/AKfycbxu5JAigr1fAroWG12_uW_iMwgousbLHKweInajFxCcMnGHJ9zfWlOFoAYlpbUS8Oga0A/exec") {
    return { status: 'error', message: 'Chưa cấu hình link Google Sheet' };
  }

  const payload = {
    mssv: entry.mssv,
    name: entry.name,
    type: entry.type,
    date: entry.date,
    time: entry.time
  };
  
  return new Promise((resolve) => {
    // 1. Tạo một ID ngẫu nhiên cho hàm callback
    const callbackName = 'jsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    
    // 2. Tạo hàm hứng dữ liệu trả về từ Google
    window[callbackName] = function(data) {
      delete window[callbackName]; // Nhận xong thì xóa hàm đi cho nhẹ máy
      resolve(data);
    };

    // 3. Nhúng thẻ <script> để gọi API (Cách này lách 100% lỗi CORS)
    const script = document.createElement('script');
    script.src = GOOGLE_APP_SCRIPT_URL + "?callback=" + callbackName + "&data=" + encodeURIComponent(JSON.stringify(payload));
    
    script.onerror = () => {
      delete window[callbackName];
      resolve({ status: 'error', message: 'Mất mạng hoặc link Google Sheet bị sai!' });
    };

    // 4. Gắn vào web để chạy
    document.body.appendChild(script);
    
    // Xóa thẻ script ngay sau khi load xong để giao diện HTML không bị rác
    script.onload = () => {
      setTimeout(() => script.remove(), 100);
    };
  });
}

// ── XỬ LÝ QUÉT VÀ KIỂM TRA TRÙNG LẶP ──────────────────────────
async function processCode(code) {
  code = String(code || '').trim();
  if (!code) return;

  const nowMs = Date.now();
  if (code === lastScannedCode && (nowMs - lastScanTime < 3000)) return;
  lastScannedCode = code;
  lastScanTime = nowMs;

  document.getElementById('manInput').value = '';
  
  const now     = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const dateStr = now.toLocaleDateString('vi-VN');
  const dateKey = todayKey(); 

  let student = students[code];

  if (!student) {
    beep(false); 
    const inputName = prompt(`⚠️ MSSV ${code} chưa có trong danh sách!\nVui lòng nhập họ và tên:`);
    if (!inputName || !inputName.trim()) {
      setStatus('err', `❌ Đã hủy điểm danh cho MSSV ${code}`);
      return; 
    }
    student = { mssv: code, name: inputName.trim(), role: "Thêm mới" };
    students[code] = student;
  }

  // 1. HIỂN THỊ THẺ KẾT QUẢ LOCAL TRƯỚC
  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  
  document.getElementById('rMSSV').textContent = code;
  document.getElementById('rTime').textContent = timeStr;
  document.getElementById('rDate').textContent = dateStr;
  document.getElementById('rType').textContent = mode === 'in' ? '🟢 Check In' : '🔴 Check Out';
  
  let colLabel = EVENT_DATES[dateKey] ? COL_LABEL[dateKey][mode] : '—';
  document.getElementById('rAva').textContent  = mode === 'in' ? '🟢' : '🔴';
  document.getElementById('rName').textContent = student.name;
  document.getElementById('rRole').textContent = student.role;
  document.getElementById('rCol').textContent  = colLabel;

  card.className = 'ok';
  setStatus('ok', `Ghi nhận Local thành công!`);

  // Đóng gói data
  const entry = { mssv: code, name: student.name, role: student.role, type: mode === 'in' ? 'Vào' : 'Ra', date: dateStr, time: timeStr, col: colLabel };
  addLog(entry);

  // 2. HIỂN THỊ THẺ TRẠNG THÁI API ĐANG TẢI
  const apiDiv = document.getElementById('apiStatus');
  apiDiv.style.display = 'block';
  apiDiv.className = 'loading';
  apiDiv.innerHTML = `<span class="spin"></span> Đang đẩy lên Google Sheet...`;
  
  // GỌI SHEET VÀ CHỜ KẾT QUẢ
  const sheetResult = await sendToSheet(entry);

  // 3. CẬP NHẬT THẺ TRẠNG THÁI API KHI CÓ KẾT QUẢ
  if (sheetResult.status === 'ok') {
    apiDiv.className = 'success';
    apiDiv.innerHTML = `✅ ${sheetResult.message}`;
    beep(true);
    
  } else if (sheetResult.status === 'duplicate') {
    apiDiv.className = 'error';
    apiDiv.innerHTML = `⚠️ Từ chối: ${sheetResult.message}`;
    beep(false); 
    
  } else {
    apiDiv.className = 'error';
    apiDiv.innerHTML = `❌ Lỗi API: ${sheetResult.message}`;
    beep(false);
  }
}