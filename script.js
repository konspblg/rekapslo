/* ═══════════════════════════════════════════════
   Dashboard Rekap SLO — UPT Probolinggo PLN
   script.js
   ═══════════════════════════════════════════════ */

// ─── CONFIG ─────────────────────────────────────
const SHEET_ID = '1fSqtiexbkkH8Fmyr5M-TEHXmclfWIlVbbSv2e-nSEs8';
const GID_GI   = '957972427';   // Mon GI
const GID_TRS  = '233827604';   // Mon TRS

const CSV_GI  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID_GI}`;
const CSV_TRS = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID_TRS}`;

const ROWS_PER_PAGE = 15;

// ─── STATE ───────────────────────────────────────
const state = {
  giRaw:   [],
  trsRaw:  [],
  giData:  [],
  trsData: [],
  filtered: [],
  page: 1,
  sortCol: -1,
  sortAsc: true,
  activeCategory: 'all',  // all | gi | trs
  filters: {
    search: '',
    status: '',
    lokasi: '',
    tahun: '',
  },
  chartStatus: null,
  chartProgress: null,
  lastUpdate: null,
};

// ─── COLUMN MAPS ─────────────────────────────────
// GI: A-R (0-17)
const GI_COLS = {
  no:        0,
  ultg:      1,
  namaGi:    2,
  noSlo:     3,
  tglTerbit: 4,
  masaBerlaku: 5,
  status:    6,
  keterangan:7,
  jenisAset: 8,
  tegangan:  9,
  kapasitas: 10,
  merk:      11,
  tahunPasang:12,
  noSeri:    13,
  kondisi:   14,
  pemeriksaan:15,
  catatan:   16,
  expired:   17,
};

// TRS: A-X (0-23)
const TRS_COLS = {
  no:        0,
  ultg:      1,
  ruas:      2,
  noTower:   3,
  noSlo:     4,
  tglTerbit: 5,
  masaBerlaku: 6,
  status:    7,
  keterangan:8,
  jenisAset: 9,
  tegangan:  10,
  panjang:   11,
  merk:      12,
  tahunPasang:13,
  kondisi:   14,
  pemeriksaan:15,
  catatan:   16,
  lokasi:    17,
  koordinat: 18,
  desa:      19,
  kecamatan: 20,
  kabupaten: 21,
  provinsi:  22,
  expired:   23,
};

// ─── CSV PARSER ───────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    result.push(row);
  }
  return result;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// ─── STATUS NORMALIZATION ─────────────────────────
function normalizeStatus(raw) {
  if (!raw) return 'pending';
  const r = raw.toLowerCase().trim();
  if (r.includes('selesai') || r.includes('terbit') || r.includes('berlaku')) return 'selesai';
  if (r.includes('proses') || r.includes('pengajuan') || r.includes('diproses')) return 'proses';
  if (r.includes('expired') || r.includes('kadaluarsa') || r.includes('habis')) return 'expired';
  if (r.includes('belum')) return 'pending';
  return 'pending';
}

function statusLabel(s) {
  const map = {selesai:'Selesai', proses:'Proses', expired:'Expired', pending:'Belum'};
  return map[s] || 'Belum';
}

function statusBadge(raw) {
  const s = normalizeStatus(raw);
  return `<span class="badge ${s}"><span class="badge-dot" style="background:currentColor"></span>${statusLabel(s)}</span>`;
}

// ─── DATE UTILS ───────────────────────────────────
function parseDateID(str) {
  if (!str) return null;
  // Try YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  // Try DD/MM/YYYY or DD-MM-YYYY
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  // Try D Month YYYY (Indonesian)
  const months = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des',
                   'jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  m = str.toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m) {
    const mi = months.indexOf(m[2].substring(0,3));
    if (mi >= 0) return new Date(+m[3], mi % 12, +m[1]);
  }
  return null;
}

function daysUntil(str) {
  const d = parseDateID(str);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

function daysBadge(str) {
  const days = daysUntil(str);
  if (days === null) return '<span class="days-badge exp">–</span>';
  if (days < 0) return `<span class="days-badge exp">Expired ${Math.abs(days)}h</span>`;
  if (days <= 30) return `<span class="days-badge crit">${days}h lagi</span>`;
  if (days <= 90) return `<span class="days-badge warn">${days}h lagi</span>`;
  return `<span class="days-badge ok">${days}h lagi</span>`;
}

function getYear(str) {
  const d = parseDateID(str);
  return d ? d.getFullYear() : null;
}

// ─── FETCH DATA ───────────────────────────────────
async function fetchCSV(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

async function loadData() {
  showToast('Memuat data...', 'info');
  setRefreshSpin(true);
  try {
    const [giText, trsText] = await Promise.all([fetchCSV(CSV_GI), fetchCSV(CSV_TRS)]);

    const giRows = parseCSV(giText);
    const trsRows = parseCSV(trsText);

    // GI: skip rows until we find a data row (row with number in col A)
    // Header is typically row 1, data starts row 2+
    state.giRaw = giRows.slice(1).filter(r => r[0] && r[0].trim() !== '' && r[0].trim() !== 'No');
    state.trsRaw = trsRows.slice(1).filter(r => r[0] && r[0].trim() !== '' && r[0].trim() !== 'No');

    state.giData  = state.giRaw.map(processGIRow);
    state.trsData = state.trsRaw.map(processTRSRow);

    state.lastUpdate = new Date();
    document.getElementById('last-update').textContent = 'Diperbarui: ' + formatTime(state.lastUpdate);

    populateFilters();
    applyFilters();
    renderStats();
    renderCharts();
    showToast('Data berhasil dimuat', 'success');
  } catch (e) {
    console.error(e);
    showToast('Gagal memuat data: ' + e.message, 'error');
    // Load with empty data so UI still works
    state.giData = [];
    state.trsData = [];
    applyFilters();
    renderStats();
    renderCharts();
  } finally {
    setRefreshSpin(false);
    hideLoader();
  }
}

function processGIRow(r) {
  const raw_status = r[GI_COLS.status] || '';
  return {
    category: 'GI',
    no:          r[GI_COLS.no] || '',
    ultg:        r[GI_COLS.ultg] || '',
    nama:        r[GI_COLS.namaGi] || '',
    noSlo:       r[GI_COLS.noSlo] || '',
    tglTerbit:   r[GI_COLS.tglTerbit] || '',
    masaBerlaku: r[GI_COLS.masaBerlaku] || '',
    status:      normalizeStatus(raw_status),
    statusRaw:   raw_status,
    keterangan:  r[GI_COLS.keterangan] || '',
    jenisAset:   r[GI_COLS.jenisAset] || '',
    tegangan:    r[GI_COLS.tegangan] || '',
    kapasitas:   r[GI_COLS.kapasitas] || '',
    merk:        r[GI_COLS.merk] || '',
    tahunPasang: r[GI_COLS.tahunPasang] || '',
    kondisi:     r[GI_COLS.kondisi] || '',
    catatan:     r[GI_COLS.catatan] || '',
    raw: r,
  };
}

function processTRSRow(r) {
  const raw_status = r[TRS_COLS.status] || '';
  return {
    category: 'Transmisi',
    no:          r[TRS_COLS.no] || '',
    ultg:        r[TRS_COLS.ultg] || '',
    nama:        r[TRS_COLS.ruas] || '',
    noSlo:       r[TRS_COLS.noSlo] || '',
    tglTerbit:   r[TRS_COLS.tglTerbit] || '',
    masaBerlaku: r[TRS_COLS.masaBerlaku] || '',
    status:      normalizeStatus(raw_status),
    statusRaw:   raw_status,
    keterangan:  r[TRS_COLS.keterangan] || '',
    jenisAset:   r[TRS_COLS.jenisAset] || '',
    tegangan:    r[TRS_COLS.tegangan] || '',
    noTower:     r[TRS_COLS.noTower] || '',
    panjang:     r[TRS_COLS.panjang] || '',
    merk:        r[TRS_COLS.merk] || '',
    tahunPasang: r[TRS_COLS.tahunPasang] || '',
    kondisi:     r[TRS_COLS.kondisi] || '',
    lokasi:      r[TRS_COLS.lokasi] || '',
    kabupaten:   r[TRS_COLS.kabupaten] || '',
    catatan:     r[TRS_COLS.catatan] || '',
    raw: r,
  };
}

// ─── FILTERS ─────────────────────────────────────
function getSourceData() {
  if (state.activeCategory === 'gi') return state.giData;
  if (state.activeCategory === 'trs') return state.trsData;
  return [...state.giData, ...state.trsData];
}

function applyFilters() {
  let data = getSourceData();
  const { search, status, lokasi, tahun } = state.filters;

  if (search) {
    const s = search.toLowerCase();
    data = data.filter(r =>
      (r.nama||'').toLowerCase().includes(s) ||
      (r.noSlo||'').toLowerCase().includes(s) ||
      (r.ultg||'').toLowerCase().includes(s) ||
      (r.jenisAset||'').toLowerCase().includes(s) ||
      (r.keterangan||'').toLowerCase().includes(s)
    );
  }
  if (status) data = data.filter(r => r.status === status);
  if (lokasi) data = data.filter(r =>
    (r.ultg||'').toLowerCase().includes(lokasi.toLowerCase()) ||
    (r.kabupaten||'').toLowerCase().includes(lokasi.toLowerCase()) ||
    (r.lokasi||'').toLowerCase().includes(lokasi.toLowerCase())
  );
  if (tahun) data = data.filter(r => {
    const y = getYear(r.tglTerbit) || getYear(r.masaBerlaku);
    return y && y.toString() === tahun;
  });

  state.filtered = data;
  state.page = 1;
  renderTable();
  updateTableInfo();
}

function populateFilters() {
  const all = [...state.giData, ...state.trsData];

  // ULTG / Lokasi
  const lokasiSet = new Set();
  all.forEach(r => { if (r.ultg) lokasiSet.add(r.ultg); });
  const selLokasi = document.getElementById('filter-lokasi');
  selLokasi.innerHTML = '<option value="">Semua ULTG</option>';
  [...lokasiSet].sort().forEach(l => {
    const o = document.createElement('option');
    o.value = l; o.textContent = l;
    selLokasi.appendChild(o);
  });

  // Tahun
  const tahunSet = new Set();
  all.forEach(r => {
    const y = getYear(r.tglTerbit) || getYear(r.masaBerlaku);
    if (y) tahunSet.add(y);
  });
  const selTahun = document.getElementById('filter-tahun');
  selTahun.innerHTML = '<option value="">Semua Tahun</option>';
  [...tahunSet].sort((a,b)=>b-a).forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    selTahun.appendChild(o);
  });
}

// ─── STATS ───────────────────────────────────────
function renderStats() {
  const all = [...state.giData, ...state.trsData];
  const total     = all.length;
  const selesai   = all.filter(r => r.status === 'selesai').length;
  const proses    = all.filter(r => r.status === 'proses').length;
  const pending   = all.filter(r => r.status === 'pending').length;
  const expired   = all.filter(r => r.status === 'expired').length;

  // Mendekati expired: berlaku < 90 hari
  const nearExp = all.filter(r => {
    const d = daysUntil(r.masaBerlaku);
    return d !== null && d >= 0 && d <= 90;
  }).length;

  const pct = total ? Math.round(selesai / total * 100) : 0;

  setText('stat-total',   total);
  setText('stat-selesai', selesai);
  setText('stat-proses',  proses);
  setText('stat-expired', expired + nearExp);
  setText('stat-gi',      state.giData.length);
  setText('stat-trs',     state.trsData.length);

  // Progress
  setText('progress-pct', pct + '%');
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct + '%';

  // Nav badges
  const badgeWarn = document.getElementById('badge-warn');
  if (badgeWarn) badgeWarn.textContent = expired + nearExp;

  // Update sidebar stats
  setText('sb-gi-count',  state.giData.length);
  setText('sb-trs-count', state.trsData.length);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── CHARTS ──────────────────────────────────────
function renderCharts() {
  renderStatusChart();
  renderProgressChart();
}

function renderStatusChart() {
  const all = [...state.giData, ...state.trsData];
  const counts = {
    selesai: all.filter(r=>r.status==='selesai').length,
    proses:  all.filter(r=>r.status==='proses').length,
    pending: all.filter(r=>r.status==='pending').length,
    expired: all.filter(r=>r.status==='expired').length,
  };

  const ctx = document.getElementById('chart-status');
  if (!ctx) return;

  if (state.chartStatus) state.chartStatus.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#8b949e' : '#64748b';

  state.chartStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Selesai','Proses','Belum','Expired'],
      datasets: [{
        data: [counts.selesai, counts.proses, counts.pending, counts.expired],
        backgroundColor: ['#16a34a','#d97706','#94a3b8','#dc2626'],
        borderWidth: 2,
        borderColor: isDark ? '#161b22' : '#ffffff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: {family:'Plus Jakarta Sans', size:11, weight:'600'},
            padding: 14,
            boxWidth: 10,
            boxHeight: 10,
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw/(counts.selesai+counts.proses+counts.pending+counts.expired)*100)||0}%)`
          }
        }
      }
    }
  });
}

function renderProgressChart() {
  const ctx = document.getElementById('chart-progress');
  if (!ctx) return;

  if (state.chartProgress) state.chartProgress.destroy();

  const all = [...state.giData, ...state.trsData];
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#8b949e' : '#64748b';
  const gridColor = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)';

  // Group by ULTG
  const ultgMap = {};
  all.forEach(r => {
    const u = r.ultg || 'Lainnya';
    if (!ultgMap[u]) ultgMap[u] = {selesai:0,total:0};
    ultgMap[u].total++;
    if (r.status === 'selesai') ultgMap[u].selesai++;
  });

  const labels = Object.keys(ultgMap);
  const pctData = labels.map(u => Math.round(ultgMap[u].selesai/ultgMap[u].total*100));

  state.chartProgress = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Progress SLO (%)',
        data: pctData,
        backgroundColor: 'rgba(29,78,216,.7)',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          max: 100,
          grid: {color: gridColor},
          ticks: {color:textColor, font:{size:10}, callback: v => v+'%'},
        },
        y: {
          grid: {display:false},
          ticks: {color:textColor, font:{size:10, weight:'600'}},
        }
      },
      plugins: {
        legend: {display:false},
        tooltip: {
          callbacks: {label: ctx => ` ${ctx.raw}%`}
        }
      }
    }
  });
}

// ─── TABLE ────────────────────────────────────────
const TABLE_COLS = [
  {key:'no',        label:'No',        w:'50px'},
  {key:'category',  label:'Kategori',  w:'90px'},
  {key:'ultg',      label:'ULTG',      w:'100px'},
  {key:'nama',      label:'Nama Aset', w:'180px'},
  {key:'jenisAset', label:'Jenis',     w:'100px'},
  {key:'noSlo',     label:'No. SLO',   w:'130px'},
  {key:'tglTerbit', label:'Tgl Terbit',w:'110px'},
  {key:'masaBerlaku',label:'Masa Berlaku',w:'120px'},
  {key:'status',    label:'Status',    w:'100px'},
  {key:'detail',    label:'',          w:'60px'},
];

function renderTable() {
  const tbody = document.getElementById('tbl-body');
  const thead = document.getElementById('tbl-head');
  if (!tbody) return;

  // Render header
  thead.innerHTML = TABLE_COLS.map((c, i) => {
    let cls = '';
    if (state.sortCol === i) cls = state.sortAsc ? 'sort-asc' : 'sort-desc';
    const icon = c.key !== 'detail' ? `<span class="sort-icon">${state.sortCol===i ? (state.sortAsc?'↑':'↓') : '↕'}</span>` : '';
    const click = c.key !== 'detail' ? `onclick="sortTable(${i})"` : '';
    return `<th style="width:${c.w}" class="${cls}" ${click}>${c.label}${icon}</th>`;
  }).join('');

  // Sort
  let data = [...state.filtered];
  if (state.sortCol >= 0) {
    const key = TABLE_COLS[state.sortCol].key;
    data.sort((a, b) => {
      let va = a[key] || '';
      let vb = b[key] || '';
      if (!isNaN(va) && !isNaN(vb)) { va = +va; vb = +vb; }
      else { va = va.toString().toLowerCase(); vb = vb.toString().toLowerCase(); }
      return state.sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }

  // Paginate
  const start = (state.page - 1) * ROWS_PER_PAGE;
  const page  = data.slice(start, start + ROWS_PER_PAGE);

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="${TABLE_COLS.length}">
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/></svg></div>
        <div class="empty-title">Data tidak ditemukan</div>
        <div class="empty-sub">Coba ubah filter atau kata kunci pencarian</div>
      </div>
    </td></tr>`;
  } else {
    tbody.innerHTML = page.map((r, idx) => {
      const globalIdx = start + idx + 1;
      const catBadge = r.category === 'GI'
        ? `<span class="badge" style="background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-bd)">GI</span>`
        : `<span class="badge" style="background:var(--purple-bg);color:var(--purple);border:1px solid rgba(124,58,237,.15)">TRS</span>`;
      const rowData = encodeURIComponent(JSON.stringify({
        nama: r.nama, noSlo: r.noSlo, tglTerbit: r.tglTerbit,
        masaBerlaku: r.masaBerlaku, statusRaw: r.statusRaw,
        ultg: r.ultg, jenisAset: r.jenisAset, kategori: r.category,
        keterangan: r.keterangan, tegangan: r.tegangan,
        kapasitas: r.kapasitas||r.panjang||'', merk: r.merk,
        tahunPasang: r.tahunPasang, kondisi: r.kondisi, catatan: r.catatan,
        noTower: r.noTower||'', kabupaten: r.kabupaten||'', lokasi: r.lokasi||'',
      }));
      return `<tr>
        <td style="color:var(--text-4);font-size:11px">${globalIdx}</td>
        <td>${catBadge}</td>
        <td><span style="font-weight:600">${r.ultg||'—'}</span></td>
        <td style="font-weight:600;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.nama||'—'}</td>
        <td style="color:var(--text-3);font-size:11px">${r.jenisAset||'—'}</td>
        <td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.noSlo||'—'}</td>
        <td style="font-size:11px;color:var(--text-3)">${r.tglTerbit||'—'}</td>
        <td>${r.masaBerlaku ? daysBadge(r.masaBerlaku) + `<span style="font-size:10px;color:var(--text-4);display:block;margin-top:2px">${r.masaBerlaku}</span>` : '—'}</td>
        <td>${statusBadge(r.statusRaw)}</td>
        <td><button class="btn-detail" onclick='openDetail(${rowData})'>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
        </button></td>
      </tr>`;
    }).join('');
  }

  renderPagination(data.length);
}

function sortTable(colIdx) {
  if (state.sortCol === colIdx) state.sortAsc = !state.sortAsc;
  else { state.sortCol = colIdx; state.sortAsc = true; }
  renderTable();
}

function updateTableInfo() {
  const el = document.getElementById('tbl-info');
  if (el) el.innerHTML = `Menampilkan <strong>${state.filtered.length}</strong> dari <strong>${getSourceData().length}</strong> data`;
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / ROWS_PER_PAGE);
  const container = document.getElementById('pagination');
  if (!container) return;

  const start = (state.page - 1) * ROWS_PER_PAGE + 1;
  const end   = Math.min(state.page * ROWS_PER_PAGE, total);

  let btns = '';
  btns += `<button class="page-btn" onclick="gotoPage(${state.page-1})" ${state.page<=1?'disabled':''}>‹</button>`;

  const range = pageRange(state.page, totalPages);
  range.forEach(p => {
    if (p === '…') btns += `<button class="page-btn" disabled>…</button>`;
    else btns += `<button class="page-btn ${p===state.page?'active':''}" onclick="gotoPage(${p})">${p}</button>`;
  });

  btns += `<button class="page-btn" onclick="gotoPage(${state.page+1})" ${state.page>=totalPages?'disabled':''}>›</button>`;

  container.innerHTML = `
    <div class="page-info">Baris ${total?start:0}–${end} dari ${total}</div>
    <div class="page-btns">${btns}</div>`;
}

function pageRange(cur, total) {
  if (total <= 7) return Array.from({length:total},(_,i)=>i+1);
  if (cur <= 4) return [1,2,3,4,5,'…',total];
  if (cur >= total-3) return [1,'…',total-4,total-3,total-2,total-1,total];
  return [1,'…',cur-1,cur,cur+1,'…',total];
}

function gotoPage(p) {
  const totalPages = Math.ceil(state.filtered.length / ROWS_PER_PAGE);
  if (p < 1 || p > totalPages) return;
  state.page = p;
  renderTable();
  document.getElementById('main-content').scrollTop = 0;
}

// ─── DETAIL MODAL ─────────────────────────────────
function openDetail(dataEncoded) {
  let d;
  try { d = typeof dataEncoded === 'string' ? JSON.parse(decodeURIComponent(dataEncoded)) : dataEncoded; }
  catch(e) { return; }

  const modal = document.getElementById('modal');
  const body  = document.getElementById('modal-body');

  body.innerHTML = `
    <div class="mfields">
      <div class="mf full">
        <div class="mf-lbl">Nama Aset</div>
        <div class="mf-val" style="font-family:'Lexend',sans-serif;font-size:16px;font-weight:700;color:var(--text)">${d.nama||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Kategori</div>
        <div class="mf-val">${d.kategori||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">ULTG</div>
        <div class="mf-val">${d.ultg||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">No. SLO</div>
        <div class="mf-val" style="font-family:monospace;color:var(--accent)">${d.noSlo||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Status</div>
        <div class="mf-val">${statusBadge(d.statusRaw)}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Tgl Terbit</div>
        <div class="mf-val">${d.tglTerbit||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Masa Berlaku</div>
        <div class="mf-val">${d.masaBerlaku||'—'} ${d.masaBerlaku ? daysBadge(d.masaBerlaku) : ''}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Jenis Aset</div>
        <div class="mf-val">${d.jenisAset||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Tegangan</div>
        <div class="mf-val">${d.tegangan||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Kapasitas/Panjang</div>
        <div class="mf-val">${d.kapasitas||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Merk/Produsen</div>
        <div class="mf-val">${d.merk||'—'}</div>
      </div>
      <div class="mf">
        <div class="mf-lbl">Tahun Pasang</div>
        <div class="mf-val">${d.tahunPasang||'—'}</div>
      </div>
      ${d.noTower ? `<div class="mf"><div class="mf-lbl">No. Tower</div><div class="mf-val">${d.noTower}</div></div>` : ''}
      ${d.kabupaten ? `<div class="mf"><div class="mf-lbl">Kabupaten</div><div class="mf-val">${d.kabupaten}</div></div>` : ''}
      <div class="mf">
        <div class="mf-lbl">Kondisi</div>
        <div class="mf-val">${d.kondisi||'—'}</div>
      </div>
      ${d.keterangan ? `<div class="mf full"><div class="mf-lbl">Keterangan</div><div class="mf-val">${d.keterangan}</div></div>` : ''}
      ${d.catatan ? `<div class="mf full"><div class="mf-lbl">Catatan</div><div class="mf-val">${d.catatan}</div></div>` : ''}
    </div>
  `;

  modal.classList.remove('hide');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.add('hide');
  document.body.style.overflow = '';
}

// ─── EXPORT ───────────────────────────────────────
function exportExcel() {
  const data = state.filtered;
  if (!data.length) { showToast('Tidak ada data untuk diekspor', 'error'); return; }

  const header = ['No','Kategori','ULTG','Nama Aset','Jenis Aset','No. SLO','Tgl Terbit','Masa Berlaku','Status','Keterangan'];
  const rows   = data.map((r,i) => [i+1, r.category, r.ultg, r.nama, r.jenisAset, r.noSlo, r.tglTerbit, r.masaBerlaku, statusLabel(r.status), r.keterangan]);

  const wsData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap SLO');
  XLSX.writeFile(wb, `Rekap_SLO_UPT_Probolinggo_${formatDate(new Date())}.xlsx`);
  showToast('File Excel berhasil diunduh', 'success');
}

function exportPDF() {
  if (!state.filtered.length) { showToast('Tidak ada data untuk diekspor', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica','bold');
  doc.text('Dashboard Rekap SLO UPT Probolinggo', 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.setTextColor(100);
  doc.text('PT PLN (Persero) UIT JBM  |  Dicetak: ' + formatDate(new Date()), 14, 22);

  const head = [['No','Kategori','ULTG','Nama Aset','No. SLO','Tgl Terbit','Masa Berlaku','Status']];
  const body = state.filtered.map((r,i) => [i+1,r.category,r.ultg,r.nama,r.noSlo,r.tglTerbit,r.masaBerlaku,statusLabel(r.status)]);

  doc.autoTable({
    head, body,
    startY: 28,
    styles: {fontSize:8, cellPadding:2},
    headStyles: {fillColor:[29,78,216], textColor:255, fontStyle:'bold'},
    alternateRowStyles: {fillColor:[240,246,255]},
    columnStyles: {0:{cellWidth:10}, 1:{cellWidth:20}, 2:{cellWidth:25}, 3:{cellWidth:50}},
  });

  doc.save(`Rekap_SLO_UPT_Probolinggo_${formatDate(new Date())}.pdf`);
  showToast('File PDF berhasil diunduh', 'success');
}

// ─── TOAST ────────────────────────────────────────
function showToast(msg, type = 'info', sub = '') {
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]||icons.info}</div>
    <div><div class="toast-msg">${msg}</div>${sub?`<div class="toast-sub">${sub}</div>`:''}</div>`;
  container.prepend(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ─── DARK MODE ────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
  localStorage.setItem('slo-theme', isDark ? 'light' : 'dark');
  updateThemeBtn();
  renderCharts(); // Redraw charts for new theme
}

function updateThemeBtn() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  btn.innerHTML = isDark
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light Mode`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark Mode`;
}

// ─── NAV ─────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  closeSidebar();

  if (page === 'dashboard') { renderStats(); renderCharts(); }
  if (page === 'data') { applyFilters(); }
}

function setCategoryFilter(cat) {
  state.activeCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.cat-tab[data-cat="${cat}"]`)?.classList.add('active');
  applyFilters();
  populateFilters();
}

// ─── SIDEBAR MOBILE ───────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
  document.body.style.overflow = '';
}

// ─── REFRESH ─────────────────────────────────────
function setRefreshSpin(on) {
  const btn = document.getElementById('btn-refresh');
  if (btn) on ? btn.classList.add('spinning') : btn.classList.remove('spinning');
}

function hideLoader() {
  const loader = document.getElementById('loading-overlay');
  if (loader) {
    loader.classList.add('hide');
    setTimeout(() => loader.remove(), 500);
  }
}

// ─── UTILS ───────────────────────────────────────
function formatTime(d) {
  return d.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}) + ' WIB';
}
function formatDate(d) {
  return d.toISOString().slice(0,10).replace(/-/g,'');
}

// ─── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  const saved = localStorage.getItem('slo-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  updateThemeBtn();

  // Scroll to top
  const goTop = document.getElementById('go-top');
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.addEventListener('scroll', () => {
      goTop.classList.toggle('vis', mainContent.scrollTop > 300);
    });
  }

  // Real-time search
  document.getElementById('filter-search')?.addEventListener('input', e => {
    state.filters.search = e.target.value;
    applyFilters();
  });

  // Load data
  loadData();

  // Auto refresh setiap 5 menit
  setInterval(() => {
    loadData();
  }, 5 * 60 * 1000);

  // Navigate to dashboard
  navigate('dashboard');
});

// expose globals
window.openDetail = openDetail;
window.sortTable  = sortTable;
window.gotoPage   = gotoPage;
