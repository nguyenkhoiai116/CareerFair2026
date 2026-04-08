// ── STATE ────────────────────────────────────────────────────
let students   = {};   // { mssv: { mssv, name, role } }
let log        = [];
let mode       = 'in'; // 'in' | 'out'
let cfg        = {};
let codeReader = null;
let scanning   = false;

// Ngày sự kiện → key ghi sheet
const EVENT_DATES = { '8/4':'8/4', '9/4':'9/4', '10/4':'10/4', '11/4':'11/4' };
const COL_LABEL   = {
  '8/4':  { in:'H (In 8/4)',  out:'I (Out 8/4)'  },
  '9/4':  { in:'J (In 9/4)',  out:'K (Out 9/4)'  },
  '10/4': { in:'L (In 10/4)', out:'M (Out 10/4)' },
  '11/4': { in:'N (In 11/4)', out:'O (Out 11/4)' },
};

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCfg();
  loadLog();
  tick();
  setInterval(tick, 1000);
  switchInput('camera');
  checkCfg();
});

function tick() {
  const n = new Date();
  document.getElementById('clockTime').textContent =
    n.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  document.getElementById('clockDate').textContent =
    n.toLocaleDateString('vi-VN', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });

  // Cập nhật day badge
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

// ── CONFIG ───────────────────────────────────────────────────
function loadCfg() {
  try { cfg = JSON.parse(localStorage.getItem('bskdn_cfg') || '{}'); } catch(e) { cfg = {}; }
  if (cfg.url)     document.getElementById('inUrl').value  = cfg.url;
  if (cfg.cont !== undefined) document.getElementById('swCont').checked  = cfg.cont;
  if (cfg.sound!== undefined) document.getElementById('swSound').checked = cfg.sound;
  if (cfg.students) students = cfg.students;
}

function saveCfg() {
  cfg.url   = document.getElementById('inUrl').value.trim();
  cfg.cont  = document.getElementById('swCont').checked;
  cfg.sound = document.getElementById('swSound').checked;
  localStorage.setItem('bskdn_cfg', JSON.stringify(cfg));
  checkCfg();
}

function checkCfg() {
  const banner = document.getElementById('cfgBanner');
  const missing = [];
  if (!cfg.url || !cfg.url.startsWith('https://')) missing.push('URL Google Sheet');
  if (!Object.keys(students).length) missing.push('file danh sách CTV');
  if (missing.length) {
    banner.style.display = 'block';
    banner.textContent   = `⚠️ Chưa cấu hình: ${missing.join(', ')}`;
  } else {
    banner.style.display = 'none';
  }
}

async function testConnection() {
  const url = document.getElementById('inUrl').value.trim();
  if (!url) return showToast('❌ Chưa nhập URL');
  showToast('🔗 Đang kiểm tra...');
  try {
    const res = await fetch(url);
    const json = await res.json();
    showToast(json.status === 'ok' ? '✅ Kết nối thành công!' : '⚠️ ' + json.message, 3000);
  } catch(e) {
    showToast('❌ Không kết nối được: ' + e.message, 3500);
  }
}

// ── EXCEL LOADER ─────────────────────────────────────────────
function loadExcel(e) {
  const file = e.target.files[0]; if (!file) return;
  const st = document.getElementById('uploadStatus');
  st.style.display = 'block'; st.className = ''; st.textContent = '⏳ Đang đọc...';

  const fr = new FileReader();
  fr.onload = ev => {
    try {
      const wb  = XLSX.read(new Uint8Array(ev.target.result), { type:'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1 });

      students = {};
      let n = 0;
      // Bỏ 2 dòng header, đọc từ index 2
      for (let i = 2; i < rows.length; i++) {
        const r    = rows[i];
        const mssv = String(r[2] || '').trim(); // Cột C (index 2)
        const name = String(r[1] || '').trim(); // Cột B (index 1)
        const role = String(r[4] || '').trim(); // Cột E (index 4)
        if (mssv && name) { students[mssv] = { mssv, name, role }; n++; }
      }

      cfg.students = students;
      saveCfg();
      st.className = 'ok';
      st.textContent = `✅ Đã tải ${n} CTV từ "${file.name}"`;
      checkCfg();
    } catch(err) {
      st.className = 'err';
      st.textContent = '❌ Lỗi: ' + err.message;
    }
  };
  fr.readAsArrayBuffer(file);
}

// ── SCANNER ──────────────────────────────────────────────────
// ── SCANNER ──────────────────────────────────────────────────
let html5QrCode = null; // Dùng biến này thay cho codeReader cũ

function switchInput(m) {
  document.getElementById('tabCam').classList.toggle('active',  m === 'camera');
  document.getElementById('tabHand').classList.toggle('active', m === 'manual');
  document.getElementById('secCam').style.display  = m === 'camera' ? 'block' : 'none';
  document.getElementById('secHand').style.display = m === 'manual' ? 'block' : 'none';
  if (m === 'manual') { 
    stopScan(); 
    setTimeout(()=> document.getElementById('manInput').focus(), 100); 
  }
}

async function startScan() {
  if (scanning) return;
  try {
    document.getElementById('btnStart').style.display = 'none';
    scanning = true;

    // Khởi tạo thư viện Html5Qrcode gắn vào div id="reader"
    html5QrCode = new Html5Qrcode("reader");

    // Cấu hình quét: Quét 10 khung hình/giây
    const config = { fps: 10 };

    // Bắt đầu mở camera sau (environment)
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText, decodedResult) => {
        // Quét thành công
        processCode(decodedText);
        // Nếu không bật "Quét liên tục", dừng camera
        if (!document.getElementById('swCont').checked) {
          stopScan();
        }
      },
      (errorMessage) => {
        // Lỗi khung hình (chưa thấy mã), bỏ qua để không in ra log rác
      }
    );
  } catch(err) {
    showToast('❌ Không mở được camera: ' + err.message);
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
      document.getElementById('btnStart').style.display = 'block';
    }).catch(err => {
      console.error("Lỗi khi dừng camera:", err);
    });
  } else {
    scanning = false;
    document.getElementById('btnStart').style.display = 'block';
  }
}

// ── PROCESS BARCODE ──────────────────────────────────────────
function processCode(code) {
  code = String(code || '').trim();
  if (!code) return;
  document.getElementById('manInput').value = '';

  const now     = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const dateStr = now.toLocaleDateString('vi-VN');  // "9/4/2026"
  const dateKey = todayKey();                        // "9/4"

  const student = students[code];
  const card    = document.getElementById('resultCard');

  card.style.display = 'block';
  card.className     = '';
  document.getElementById('rMSSV').textContent = code;
  document.getElementById('rTime').textContent = timeStr;
  document.getElementById('rDate').textContent = dateStr;
  document.getElementById('rType').textContent = mode === 'in' ? '🟢 Vào' : '🔴 Ra';

  // MSSV không tồn tại
  if (!student) {
    document.getElementById('rAva').textContent  = '❓';
    document.getElementById('rName').textContent = 'Không tìm thấy';
    document.getElementById('rRole').textContent = '';
    document.getElementById('rCol').textContent  = '—';
    card.className = 'err';
    setStatus('err', `❌ MSSV "${code}" không có trong danh sách CTV`);
    beep(false); return;
  }

  // Ngày ngoài sự kiện
  if (!EVENT_DATES[dateKey]) {
    document.getElementById('rAva').textContent  = '⚠️';
    document.getElementById('rName').textContent = student.name;
    document.getElementById('rRole').textContent = student.role;
    document.getElementById('rCol').textContent  = '—';
    card.className = 'wrn';
    setStatus('wrn', `⚠️ Hôm nay (${dateStr}) không nằm trong 3 ngày sự kiện`);
    return;
  }

  const colLabel = COL_LABEL[dateKey][mode];
  document.getElementById('rAva').textContent  = mode === 'in' ? '🟢' : '🔴';
  document.getElementById('rName').textContent = student.name;
  document.getElementById('rRole').textContent = student.role;
  document.getElementById('rCol').textContent  = colLabel;
  card.className = 'ok';
  setStatus('ok', `<span class="spin"></span>Đang ghi vào Sheet...`);

  const entry = { mssv: code, name: student.name, role: student.role,
                  type: mode === 'in' ? 'Vào' : 'Ra', date: dateStr, time: timeStr };

  sendSheet(entry).then(res => {
    if (res.status === 'ok') {
      setStatus('ok', `✅ Đã ghi: ${student.name} — ${mode === 'in' ? 'Vào' : 'Ra'} ${dateKey} lúc ${timeStr}`);
      beep(true);
    } else if (res.status === 'warn') {
      card.className = 'wrn';
      setStatus('wrn', `⚠️ ${res.message}`);
      beep(true);
    } else {
      card.className = 'wrn';
      setStatus('wrn', `⚠️ Lỗi Sheet: ${res.message || 'Không gửi được'}`);
      beep(false);
    }
    addLog(entry);
  });
}

// ── API ──────────────────────────────────────────────────────
async function sendSheet(entry) {
  if (!cfg.url || !cfg.url.startsWith('https://')) return { status:'error', message:'Chưa cấu hình URL' };
  try {
    // Apps Script với no-cors không trả về body → dùng fetch thường (cần CORS enabled)
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    return await res.json();
  } catch(e) {
    // Nếu CORS chặn (thường xảy ra), thử no-cors (không đọc được response)
    try {
      await fetch(cfg.url, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body: JSON.stringify(entry) });
      return { status:'ok', message:'Đã gửi (no-cors)' };
    } catch(e2) {
      return { status:'error', message: e2.message };
    }
  }
}

// ── LOG ──────────────────────────────────────────────────────
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
  const today = new Date().toLocaleDateString('vi-VN');
  const td = log.filter(e => e.date === today);
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
        <div class="log-sub">${e.mssv}${e.role ? ' · ' + e.role : ''}</div>
      </div>
      <div class="log-t">${e.time}<span>${e.type} · ${e.date}</span></div>
    </div>`).join('');
}
function clearLog() {
  if (!confirm('Xóa lịch sử cục bộ?')) return;
  log = []; localStorage.removeItem('bskdn_log');
  updateStats(); renderLog(); showToast('🗑 Đã xóa');
}

// ── UTILS ────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('btnIn').classList.toggle('active',  m === 'in');
  document.getElementById('btnOut').classList.toggle('active', m === 'out');
}
function setStatus(cls, html) {
  const el = document.getElementById('rStatus');
  el.className = 'res-status ' + cls;
  el.innerHTML = html;
}
function goPage(name, idx) {
  ['pgScan','pgLog','pgSettings'].forEach((id,i) => {
    document.getElementById(id).style.display = i === idx ? 'block' : 'none';
    document.getElementById('nb'+i).classList.toggle('active', i === idx);
  });
  if (name === 'log') { updateStats(); renderLog(); }
}
function todayKey() {
  const n = new Date();
  return `${n.getDate()}/${n.getMonth()+1}`;
}
function showToast(msg, ms=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms);
}
function beep(ok=true) {
  if (!document.getElementById('swSound').checked) return;
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220; o.type = 'sine';
    g.gain.setValueAtTime(.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+.3);
    o.start(); o.stop(ctx.currentTime+.3);
  } catch(e) {}
}