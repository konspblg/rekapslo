/* ═══════════════════════════════════════════════
   Dashboard Rekap SLO — UPT Probolinggo PLN
   script.js v2 — kolom sesuai struktur aktual sheet
   ═══════════════════════════════════════════════

   MON GI (header row1, blank row2, data dari row3)
   idx  Kolom  Header
    0    A     NO
    1    B     JENIS (GI/GITET)
    2    C     LOKASI             ← dipakai
    3    D     NAMA BAY           ← dipakai
    4    E     BAY                ← dipakai
    5    F     KAPASITAS PMT/TRF
    6    G     STATUS             ← dipakai (SLO/BELUM/PROSES)
    7    H     SISA MASA BERLAKU  ← dipakai
    8    I     NIDI SIUJANG GATRIK← dipakai
   13    N     NO. REG            ← dipakai
   14    O     NO. SLO            ← dipakai
   15    P     DATE               ← dipakai
   16    Q     EXP. DATE          ← dipakai
   17    R     RENCANA RE-SLO     ← dipakai

   MON TRS (header row1, blank row2, data dari row3)
   Ada kolom KOSONG di index 5 antara E dan F:
    0    A     No
    1    B     JENIS              ← dipakai
    2    C     GI ASAL            ← dipakai
    3    D     GI TUJUAN          ← dipakai
    4    E     SIRKUIT            ← dipakai
    5    [blank col]
    6    F     KMS                ← dipakai
    7    G     JML TOWER          ← dipakai
    8    H     ULTG PBL
    9    I     ULTG JBR
   10    J     ULTG BGL
   11    K     KONDISI
   12    L     STATUS             ← dipakai (SLO/SLO PART/BELUM)
   13    M     SISA MASA BERLAKU  ← dipakai
   14    N     NIDI SIUJANG GATRIK← dipakai
   19    S     NO. REG            ← dipakai
   20    T     NO. SLO            ← dipakai
   21    U     DATE               ← dipakai
   22    V     EXP. DATE          ← dipakai
   23    W     TAHUN EXP          ← dipakai
   24    X     RENC. RE-SLO       ← dipakai
   25    Y     LINGKUP            ← dipakai
   ═══════════════════════════════════════════════ */

const SHEET_ID = '1fSqtiexbkkH8Fmyr5M-TEHXmclfWIlVbbSv2e-nSEs8';
const GID_GI   = '957972427';
const GID_TRS  = '233827604';
const CSV_GI   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID_GI}`;
const CSV_TRS  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID_TRS}`;
const ROWS_PER_PAGE = 15;

const state = {
  giData:[], trsData:[], filtered:[],
  page:1, sortCol:-1, sortAsc:true,
  activeCategory:'all',
  filters:{search:'',status:'',lokasi:'',tahun:''},
  chartStatus:null, chartProgress:null, lastUpdate:null,
};

const GI_COL = {
  jenis:1, lokasi:2, namaBay:3, bay:4, kapasitas:5,
  statusRaw:6, sisaBerlaku:7, nidi:8,
  noReg:13, noSlo:14, tglTerbit:15, expDate:16, rencReSlo:17,
};

const TRS_COL = {
  jenis:1, giAsal:2, giTujuan:3, sirkuit:4,
  kms:6, jmlTower:7,
  ultgPbl:8, ultgJbr:9, ultgBgl:10, kondisi:11,
  statusRaw:12, sisaBerlaku:13, nidi:14,
  noReg:19, noSlo:20, tglTerbit:21, expDate:22,
  tahunExp:23, rencReSlo:24, lingkup:25,
};

/* ── CSV Parser ────────────────────────────────── */
function parseCSV(text){return text.split('\n').map(parseCSVLine);}
function parseCSVLine(line){
  const res=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(c===','&&!inQ){res.push(cur.trim());cur='';}
    else cur+=c;
  }
  res.push(cur.trim());
  return res;
}
const g=(r,i)=>(r[i]||'').trim();

/* ── Status ────────────────────────────────────── */
function normalizeStatus(raw){
  if(!raw)return'pending';
  const r=raw.toLowerCase().trim();
  if(r==='slo'||r==='slo part'||r.startsWith('slo'))return'selesai';
  if(r.includes('proses')||r.includes('pengajuan'))return'proses';
  if(r.includes('expired')||r.includes('kadaluarsa'))return'expired';
  if(r.includes('belum'))return'pending';
  return'pending';
}
function statusLabel(s){return{selesai:'SLO Terbit',proses:'Proses',expired:'Expired',pending:'Belum'}[s]||'Belum';}
function statusBadge(raw){
  const s=normalizeStatus(raw);
  const lbl={selesai:'SLO Terbit',proses:'Proses',expired:'Expired',pending:'Belum'}[s]||'Belum';
  return`<span class="badge ${s}"><span class="badge-dot" style="background:currentColor"></span>${lbl}</span>`;
}

/* ── Date Utils ─────────────────────────────────── */
function parseDateID(str){
  if(!str||str==='N/A'||str==='-')return null;
  let m=str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  m=str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  const MON={jan:0,feb:1,mar:2,apr:3,mei:4,jun:5,jul:6,agu:7,sep:8,okt:9,nov:10,des:11,may:4,aug:7,oct:9,dec:11};
  m=str.toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if(m){const mi=MON[m[2].substring(0,3)];if(mi!==undefined)return new Date(+m[3],mi,+m[1]);}
  return null;
}
function daysUntil(str){
  const d=parseDateID(str);if(!d)return null;
  const t=new Date();t.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
function daysBadge(str){
  const d=daysUntil(str);
  if(d===null)return'';
  if(d<0)return`<span class="days-badge exp">Exp ${Math.abs(d)}h lalu</span>`;
  if(d<=30)return`<span class="days-badge crit">${d}h lagi</span>`;
  if(d<=90)return`<span class="days-badge warn">${d}h lagi</span>`;
  return`<span class="days-badge ok">${d}h lagi</span>`;
}
function getYear(str){const d=parseDateID(str);return d?d.getFullYear():null;}

/* ── Process Rows ───────────────────────────────── */
function processGIRow(r){
  const statusRaw=g(r,GI_COL.statusRaw),expDate=g(r,GI_COL.expDate);
  let status=normalizeStatus(statusRaw);
  if(status==='selesai'&&expDate){const d=daysUntil(expDate);if(d!==null&&d<0)status='expired';}
  const lokasi=g(r,GI_COL.lokasi),namaBay=g(r,GI_COL.namaBay);
  return{
    category:'GI',no:g(r,0),jenis:g(r,GI_COL.jenis),
    lokasi,namaBay,bay:g(r,GI_COL.bay),kapasitas:g(r,GI_COL.kapasitas),
    sisaBerlaku:g(r,GI_COL.sisaBerlaku),nidi:g(r,GI_COL.nidi),
    noReg:g(r,GI_COL.noReg),noSlo:g(r,GI_COL.noSlo),
    tglTerbit:g(r,GI_COL.tglTerbit),expDate,rencReSlo:g(r,GI_COL.rencReSlo),
    statusRaw,status,nama:`${lokasi} — ${namaBay}`,ultg:lokasi,masaBerlaku:expDate,
  };
}
function processTRSRow(r){
  const statusRaw=g(r,TRS_COL.statusRaw),expDate=g(r,TRS_COL.expDate);
  let status=normalizeStatus(statusRaw);
  if(status==='selesai'&&expDate){const d=daysUntil(expDate);if(d!==null&&d<0)status='expired';}
  const jenis=g(r,TRS_COL.jenis),giAsal=g(r,TRS_COL.giAsal),
        giTujuan=g(r,TRS_COL.giTujuan),sirkuit=g(r,TRS_COL.sirkuit);
  const nama=`${jenis} ${giAsal}–${giTujuan}${sirkuit?' S'+sirkuit:''}`;
  const ultgParts=[g(r,TRS_COL.ultgPbl),g(r,TRS_COL.ultgJbr),g(r,TRS_COL.ultgBgl)].filter(u=>u&&u!=='-');
  return{
    category:'Transmisi',no:g(r,0),jenis,giAsal,giTujuan,sirkuit,
    kms:g(r,TRS_COL.kms),jmlTower:g(r,TRS_COL.jmlTower),kondisi:g(r,TRS_COL.kondisi),
    sisaBerlaku:g(r,TRS_COL.sisaBerlaku),nidi:g(r,TRS_COL.nidi),
    noReg:g(r,TRS_COL.noReg),noSlo:g(r,TRS_COL.noSlo),
    tglTerbit:g(r,TRS_COL.tglTerbit),expDate,tahunExp:g(r,TRS_COL.tahunExp),
    rencReSlo:g(r,TRS_COL.rencReSlo),lingkup:g(r,TRS_COL.lingkup),
    statusRaw,status,nama,ultg:ultgParts.length?ultgParts.join('/'):'—',masaBerlaku:expDate,
  };
}

/* ── Fetch Data ─────────────────────────────────── */
async function loadData(){
  showToast('Memuat data dari Google Sheets...','info');
  setRefreshSpin(true);
  try{
    const[giText,trsText]=await Promise.all([
      fetch(CSV_GI).then(r=>{if(!r.ok)throw new Error('GI: HTTP '+r.status);return r.text();}),
      fetch(CSV_TRS).then(r=>{if(!r.ok)throw new Error('TRS: HTTP '+r.status);return r.text();}),
    ]);
    // Slice 2 baris awal (header + baris kosong), lalu filter baris data valid
    const giRows=parseCSV(giText).slice(2).filter(r=>
      r.length>14&&g(r,GI_COL.noSlo)&&g(r,GI_COL.lokasi)
    );
    const trsRows=parseCSV(trsText).slice(2).filter(r=>
      r.length>20&&g(r,TRS_COL.jenis)&&g(r,TRS_COL.noSlo)
    );
    state.giData=giRows.map(processGIRow);
    state.trsData=trsRows.map(processTRSRow);
    state.lastUpdate=new Date();
    setText('last-update','Diperbarui: '+formatTime(state.lastUpdate));
    populateFilters();
    applyFilters();
    renderStats();
    renderCharts();
    renderPreviewTable();
    renderCategoryPage('gi');
    renderCategoryPage('trs');
    const warn=countWarnings();
    const bw=document.getElementById('badge-warn');
    if(bw){bw.textContent=warn;bw.style.display=warn>0?'':'none';}
    showToast(`Berhasil dimuat — ${state.giData.length} GI, ${state.trsData.length} Transmisi`,'success');
  }catch(e){
    console.error(e);
    showToast('Gagal memuat: '+e.message,'error');
    state.giData=[];state.trsData=[];
    applyFilters();renderStats();renderCharts();
  }finally{
    setRefreshSpin(false);
    hideLoader();
  }
}
function countWarnings(){
  return[...state.giData,...state.trsData].filter(r=>{
    if(r.status==='expired')return true;
    const d=daysUntil(r.masaBerlaku);return d!==null&&d>=0&&d<=90;
  }).length;
}

/* ── Filters ────────────────────────────────────── */
function getSourceData(){
  if(state.activeCategory==='gi')return state.giData;
  if(state.activeCategory==='trs')return state.trsData;
  return[...state.giData,...state.trsData];
}
function applyFilters(){
  let data=getSourceData();
  const{search,status,lokasi,tahun}=state.filters;
  if(search){
    const s=search.toLowerCase();
    data=data.filter(r=>
      (r.nama||'').toLowerCase().includes(s)||
      (r.noSlo||'').toLowerCase().includes(s)||
      (r.noReg||'').toLowerCase().includes(s)||
      (r.jenis||'').toLowerCase().includes(s)||
      (r.giAsal||'').toLowerCase().includes(s)||
      (r.giTujuan||'').toLowerCase().includes(s)||
      (r.lokasi||'').toLowerCase().includes(s)||
      (r.namaBay||'').toLowerCase().includes(s)
    );
  }
  if(status)data=data.filter(r=>r.status===status);
  if(lokasi){
    const lc=lokasi.toLowerCase();
    data=data.filter(r=>
      (r.lokasi||'').toLowerCase().includes(lc)||
      (r.giAsal||'').toLowerCase().includes(lc)||
      (r.giTujuan||'').toLowerCase().includes(lc)
    );
  }
  if(tahun)data=data.filter(r=>{
    const y=getYear(r.tglTerbit)||getYear(r.expDate);
    return y&&y.toString()===tahun;
  });
  state.filtered=data;state.page=1;
  renderTable();updateTableInfo();
}
function populateFilters(){
  const lokasiSet=new Set();
  state.giData.forEach(r=>{if(r.lokasi)lokasiSet.add(r.lokasi);});
  state.trsData.forEach(r=>{if(r.giAsal)lokasiSet.add(r.giAsal);if(r.giTujuan)lokasiSet.add(r.giTujuan);});
  const sel=document.getElementById('filter-lokasi');
  sel.innerHTML='<option value="">Semua Lokasi/GI</option>';
  [...lokasiSet].sort().forEach(l=>{const o=document.createElement('option');o.value=l;o.textContent=l;sel.appendChild(o);});
  const tahunSet=new Set();
  [...state.giData,...state.trsData].forEach(r=>{const y=getYear(r.tglTerbit);if(y)tahunSet.add(y);});
  const sel2=document.getElementById('filter-tahun');
  sel2.innerHTML='<option value="">Semua Tahun</option>';
  [...tahunSet].sort((a,b)=>b-a).forEach(y=>{const o=document.createElement('option');o.value=y;o.textContent=y;sel2.appendChild(o);});
}

/* ── Stats ──────────────────────────────────────── */
function renderStats(){
  const all=[...state.giData,...state.trsData],total=all.length;
  const selesai=all.filter(r=>r.status==='selesai').length;
  const proses=all.filter(r=>r.status==='proses').length;
  const expired=all.filter(r=>r.status==='expired').length;
  const nearExp=all.filter(r=>{const d=daysUntil(r.masaBerlaku);return d!==null&&d>=0&&d<=90&&r.status==='selesai';}).length;
  const pct=total?Math.round(selesai/total*100):0;
  setText('stat-total',total);setText('stat-selesai',selesai);
  setText('stat-proses',proses);setText('stat-expired',expired+nearExp);
  setText('stat-gi',state.giData.length);setText('stat-trs',state.trsData.length);
  setText('progress-pct',pct+'%');setText('sb-gi-count',state.giData.length);setText('sb-trs-count',state.trsData.length);
  const fill=document.getElementById('progress-fill');
  if(fill)setTimeout(()=>fill.style.width=pct+'%',100);
}
function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}

/* ── Charts ─────────────────────────────────────── */
function renderCharts(){renderStatusChart();renderProgressChart();}
function renderStatusChart(){
  const all=[...state.giData,...state.trsData];
  const c={selesai:all.filter(r=>r.status==='selesai').length,
           proses:all.filter(r=>r.status==='proses').length,
           pending:all.filter(r=>r.status==='pending').length,
           expired:all.filter(r=>r.status==='expired').length};
  const ctx=document.getElementById('chart-status');if(!ctx)return;
  if(state.chartStatus)state.chartStatus.destroy();
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const tc=dark?'#8b949e':'#64748b';
  const total=Object.values(c).reduce((a,b)=>a+b,0);
  state.chartStatus=new Chart(ctx,{type:'doughnut',
    data:{labels:['SLO Terbit','Proses','Belum','Expired'],
      datasets:[{data:[c.selesai,c.proses,c.pending,c.expired],
        backgroundColor:['#16a34a','#d97706','#94a3b8','#dc2626'],
        borderWidth:2,borderColor:dark?'#161b22':'#ffffff',hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',
      plugins:{legend:{position:'bottom',labels:{color:tc,font:{family:'Plus Jakarta Sans',size:11,weight:'600'},padding:12,boxWidth:10,boxHeight:10}},
        tooltip:{callbacks:{label:ctx=>`  ${ctx.label}: ${ctx.raw} (${total?Math.round(ctx.raw/total*100):0}%)`}}}}
  });
}
function renderProgressChart(){
  const ctx=document.getElementById('chart-progress');if(!ctx)return;
  if(state.chartProgress)state.chartProgress.destroy();
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const tc=dark?'#8b949e':'#64748b',gc=dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)';
  const map={};
  state.giData.forEach(r=>{const k=r.lokasi||'Lain';if(!map[k])map[k]={s:0,t:0};map[k].t++;if(r.status==='selesai')map[k].s++;});
  const labels=Object.keys(map).slice(0,12);
  const pcts=labels.map(k=>map[k].t?Math.round(map[k].s/map[k].t*100):0);
  state.chartProgress=new Chart(ctx,{type:'bar',
    data:{labels,datasets:[{label:'Progress SLO GI (%)',data:pcts,
      backgroundColor:pcts.map(p=>p>=80?'#16a34a':p>=50?'#d97706':'#dc2626'),
      borderRadius:5,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      scales:{x:{max:100,grid:{color:gc},ticks:{color:tc,font:{size:10},callback:v=>v+'%'}},
              y:{grid:{display:false},ticks:{color:tc,font:{size:9,weight:'600'}}}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.raw}%`}}}}
  });
}

/* ── Table ──────────────────────────────────────── */
const TABLE_COLS=[
  {key:'no',w:'44px',label:'No'},
  {key:'category',w:'65px',label:'Tipe'},
  {key:'jenis',w:'105px',label:'Jenis'},
  {key:'nama',w:'195px',label:'Nama / Ruas'},
  {key:'noSlo',w:'145px',label:'No. SLO'},
  {key:'tglTerbit',w:'100px',label:'Tgl Terbit'},
  {key:'expDate',w:'100px',label:'Exp. Date'},
  {key:'sisaBerlaku',w:'120px',label:'Sisa Masa'},
  {key:'status',w:'95px',label:'Status'},
  {key:'detail',w:'46px',label:''},
];
function renderTable(){
  const tbody=document.getElementById('tbl-body'),thead=document.getElementById('tbl-head');
  if(!tbody)return;
  thead.innerHTML=TABLE_COLS.map((c,i)=>{
    const cls=state.sortCol===i?(state.sortAsc?'sort-asc':'sort-desc'):'';
    const icon=c.key!=='detail'?`<span class="sort-icon">${state.sortCol===i?(state.sortAsc?'↑':'↓'):'↕'}</span>`:'';
    const clk=c.key!=='detail'?`onclick="sortTable(${i})"`:'';
    return`<th style="width:${c.w}" class="${cls}" ${clk}>${c.label}${icon}</th>`;
  }).join('');
  let data=[...state.filtered];
  if(state.sortCol>=0){
    const key=TABLE_COLS[state.sortCol].key;
    data.sort((a,b)=>{
      let va=a[key]||'',vb=b[key]||'';
      if(!isNaN(+va)&&!isNaN(+vb)){va=+va;vb=+vb;}else{va=va.toString().toLowerCase();vb=vb.toString().toLowerCase();}
      return state.sortAsc?(va>vb?1:-1):(va<vb?1:-1);
    });
  }
  const start=(state.page-1)*ROWS_PER_PAGE;
  const page=data.slice(start,start+ROWS_PER_PAGE);
  if(!page.length){
    tbody.innerHTML=`<tr><td colspan="${TABLE_COLS.length}"><div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>
      <div class="empty-title">Data tidak ditemukan</div><div class="empty-sub">Coba ubah filter atau kata kunci</div>
    </div></td></tr>`;
  }else{
    tbody.innerHTML=page.map((r,idx)=>{
      const gi=start+idx+1;
      const catBadge=r.category==='GI'
        ?`<span class="badge" style="background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-bd)">GI</span>`
        :`<span class="badge" style="background:var(--purple-bg);color:var(--purple);border:1px solid rgba(124,58,237,.15)">TRS</span>`;
      const pl=encodeURIComponent(JSON.stringify({
        nama:r.nama,noSlo:r.noSlo,noReg:r.noReg,tglTerbit:r.tglTerbit,
        expDate:r.expDate,statusRaw:r.statusRaw,kategori:r.category,
        jenis:r.jenis,sisaBerlaku:r.sisaBerlaku,nidi:r.nidi,
        kms:r.kms||'',jmlTower:r.jmlTower||'',kondisi:r.kondisi||'',
        bay:r.bay||'',kapasitas:r.kapasitas||'',rencReSlo:r.rencReSlo||'',
        lingkup:r.lingkup||'',giAsal:r.giAsal||'',giTujuan:r.giTujuan||'',
        sirkuit:r.sirkuit||'',ultg:r.ultg||'',
      }));
      return`<tr>
        <td style="color:var(--text-4);font-size:11px">${gi}</td>
        <td>${catBadge}</td>
        <td style="font-size:11px;color:var(--text-3)">${r.jenis||'—'}</td>
        <td style="font-weight:600;font-size:12px;max-width:195px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${(r.nama||'').replace(/"/g,'&quot;')}">${r.nama||'—'}</td>
        <td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.noSlo||'—'}</td>
        <td style="font-size:11px;color:var(--text-3)">${r.tglTerbit||'—'}</td>
        <td style="font-size:11px">${r.expDate||'—'}</td>
        <td>${r.masaBerlaku?daysBadge(r.masaBerlaku):'<span style="color:var(--text-4);font-size:11px">—</span>'}</td>
        <td>${statusBadge(r.statusRaw)}</td>
        <td><button class="btn-detail" onclick='openDetail("${pl}")'>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
        </button></td>
      </tr>`;
    }).join('');
  }
  renderPagination(data.length);
}
function sortTable(i){if(state.sortCol===i)state.sortAsc=!state.sortAsc;else{state.sortCol=i;state.sortAsc=true;}renderTable();}
function updateTableInfo(){const el=document.getElementById('tbl-info');if(el)el.innerHTML=`Menampilkan <strong>${state.filtered.length}</strong> dari <strong>${getSourceData().length}</strong> data`;}
function renderPagination(total){
  const tp=Math.ceil(total/ROWS_PER_PAGE);
  const c=document.getElementById('pagination');if(!c)return;
  const s=(state.page-1)*ROWS_PER_PAGE+1,e=Math.min(state.page*ROWS_PER_PAGE,total);
  let btns=`<button class="page-btn" onclick="gotoPage(${state.page-1})" ${state.page<=1?'disabled':''}>&#8249;</button>`;
  pageRange(state.page,tp).forEach(p=>{btns+=p==='...'?`<button class="page-btn" disabled>…</button>`:`<button class="page-btn ${p===state.page?'active':''}" onclick="gotoPage(${p})">${p}</button>`;});
  btns+=`<button class="page-btn" onclick="gotoPage(${state.page+1})" ${state.page>=tp?'disabled':''}>&#8250;</button>`;
  c.innerHTML=`<div class="page-info">Baris ${total?s:0}–${e} dari ${total}</div><div class="page-btns">${btns}</div>`;
}
function pageRange(cur,total){
  if(total<=7)return Array.from({length:total},(_,i)=>i+1);
  if(cur<=4)return[1,2,3,4,5,'...',total];
  if(cur>=total-3)return[1,'...',total-4,total-3,total-2,total-1,total];
  return[1,'...',cur-1,cur,cur+1,'...',total];
}
function gotoPage(p){const tp=Math.ceil(state.filtered.length/ROWS_PER_PAGE);if(p<1||p>tp)return;state.page=p;renderTable();}

/* ── Preview Table (Dashboard) ──────────────────── */
function renderPreviewTable(){
  const all=[...state.giData,...state.trsData].slice(0,8);
  const thead=document.getElementById('tbl-head-preview'),tbody=document.getElementById('tbl-body-preview');
  if(!thead||!tbody)return;
  thead.innerHTML=`<tr><th>No</th><th>Tipe</th><th>Jenis</th><th>Nama / Ruas</th><th>No. SLO</th><th>Sisa Masa</th><th>Status</th></tr>`;
  tbody.innerHTML=all.map((r,i)=>{
    const cb=r.category==='GI'
      ?`<span class="badge" style="background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-bd)">GI</span>`
      :`<span class="badge" style="background:var(--purple-bg);color:var(--purple);border:1px solid rgba(124,58,237,.15)">TRS</span>`;
    return`<tr>
      <td style="color:var(--text-4);font-size:11px">${i+1}</td><td>${cb}</td>
      <td style="font-size:11px;color:var(--text-3)">${r.jenis||'—'}</td>
      <td style="font-size:12px;font-weight:600;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.nama||'—'}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.noSlo||'—'}</td>
      <td>${r.masaBerlaku?daysBadge(r.masaBerlaku):'—'}</td>
      <td>${statusBadge(r.statusRaw)}</td>
    </tr>`;
  }).join('');
}

/* ── Category Pages ─────────────────────────────── */
function renderCategoryPage(cat){
  const data=cat==='gi'?state.giData:state.trsData,p=cat,total=data.length;
  setText(`${p}-total`,total);
  setText(`${p}-selesai`,data.filter(r=>r.status==='selesai').length);
  setText(`${p}-proses`,data.filter(r=>r.status==='proses').length);
  setText(`${p}-expired`,data.filter(r=>r.status==='expired').length);
  const thead=document.getElementById(`${p}-tbl-head`),tbody=document.getElementById(`${p}-tbl-body`);
  if(!thead||!tbody)return;
  if(cat==='gi'){
    thead.innerHTML=`<tr><th>No</th><th>Jenis</th><th>Lokasi (GI)</th><th>Nama Bay</th><th>Bay</th><th>No. REG</th><th>No. SLO</th><th>Tgl Terbit</th><th>Exp. Date</th><th>Sisa</th><th>Status</th></tr>`;
    tbody.innerHTML=data.slice(0,30).map((r,i)=>`<tr>
      <td style="color:var(--text-4);font-size:11px">${i+1}</td>
      <td style="font-size:11px;color:var(--text-3)">${r.jenis||'—'}</td>
      <td style="font-weight:600;font-size:12px">${r.lokasi||'—'}</td>
      <td style="font-size:12px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${(r.namaBay||'').replace(/"/g,'')}">${r.namaBay||'—'}</td>
      <td style="font-size:11px;color:var(--text-3)">${r.bay||'—'}</td>
      <td style="font-family:monospace;font-size:10px;color:var(--text-3)">${r.noReg||'—'}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.noSlo||'—'}</td>
      <td style="font-size:11px;color:var(--text-3)">${r.tglTerbit||'—'}</td>
      <td style="font-size:11px">${r.expDate||'—'}</td>
      <td>${r.masaBerlaku?daysBadge(r.masaBerlaku):'—'}</td>
      <td>${statusBadge(r.statusRaw)}</td>
    </tr>`).join('');
  }else{
    thead.innerHTML=`<tr><th>No</th><th>Jenis</th><th>GI Asal</th><th>GI Tujuan</th><th>S</th><th>KMS</th><th>Tower</th><th>No. SLO</th><th>Tgl Terbit</th><th>Exp. Date</th><th>Sisa</th><th>Status</th></tr>`;
    tbody.innerHTML=data.slice(0,30).map((r,i)=>`<tr>
      <td style="color:var(--text-4);font-size:11px">${i+1}</td>
      <td style="font-size:10px;color:var(--text-3)">${r.jenis||'—'}</td>
      <td style="font-weight:600;font-size:12px">${r.giAsal||'—'}</td>
      <td style="font-weight:600;font-size:12px">${r.giTujuan||'—'}</td>
      <td style="font-size:11px;text-align:center">${r.sirkuit||'—'}</td>
      <td style="font-size:11px;color:var(--text-3)">${r.kms||'—'}</td>
      <td style="font-size:11px;text-align:center">${r.jmlTower||'—'}</td>
      <td style="font-family:monospace;font-size:10px;color:var(--accent)">${r.noSlo||'—'}</td>
      <td style="font-size:11px;color:var(--text-3)">${r.tglTerbit||'—'}</td>
      <td style="font-size:11px">${r.expDate||'—'}</td>
      <td>${r.masaBerlaku?daysBadge(r.masaBerlaku):'—'}</td>
      <td>${statusBadge(r.statusRaw)}</td>
    </tr>`).join('');
  }
  setText(`${p}-tbl-info`,`Menampilkan ${Math.min(30,total)} dari ${total} data`);
}

/* ── Detail Modal ───────────────────────────────── */
function openDetail(pl){
  let d;try{d=typeof pl==='string'?JSON.parse(decodeURIComponent(pl)):pl;}catch(e){return;}
  const body=document.getElementById('modal-body'),isGI=d.kategori==='GI';
  body.innerHTML=`<div class="mfields">
    <div class="mf full"><div class="mf-lbl">Nama / Ruas</div>
      <div class="mf-val" style="font-family:'Lexend',sans-serif;font-size:15px;font-weight:700;color:var(--text)">${d.nama||'—'}</div>
    </div>
    <div class="mf"><div class="mf-lbl">Kategori</div><div class="mf-val">${d.kategori||'—'}</div></div>
    <div class="mf"><div class="mf-lbl">Jenis Aset</div><div class="mf-val">${d.jenis||'—'}</div></div>
    ${isGI?`
      <div class="mf"><div class="mf-lbl">Bay</div><div class="mf-val">${d.bay||'—'}</div></div>
      <div class="mf"><div class="mf-lbl">Kapasitas</div><div class="mf-val">${d.kapasitas||'—'}</div></div>
    `:`
      <div class="mf"><div class="mf-lbl">GI Asal</div><div class="mf-val">${d.giAsal||'—'}</div></div>
      <div class="mf"><div class="mf-lbl">GI Tujuan</div><div class="mf-val">${d.giTujuan||'—'}</div></div>
      <div class="mf"><div class="mf-lbl">Sirkuit</div><div class="mf-val">${d.sirkuit||'—'}</div></div>
      <div class="mf"><div class="mf-lbl">Panjang (KMS)</div><div class="mf-val">${d.kms||'—'}</div></div>
      <div class="mf"><div class="mf-lbl">Jumlah Tower</div><div class="mf-val">${d.jmlTower||'—'}</div></div>
      <div class="mf"><div class="mf-lbl">Kondisi</div><div class="mf-val">${d.kondisi||'—'}</div></div>
    `}
    <div class="mf"><div class="mf-lbl">No. REG</div><div class="mf-val" style="font-family:monospace;font-size:12px">${d.noReg||'—'}</div></div>
    <div class="mf"><div class="mf-lbl">No. SLO</div><div class="mf-val" style="font-family:monospace;color:var(--accent);font-size:12px">${d.noSlo||'—'}</div></div>
    <div class="mf"><div class="mf-lbl">Status</div><div class="mf-val">${statusBadge(d.statusRaw)}</div></div>
    <div class="mf"><div class="mf-lbl">Sisa Masa Berlaku</div><div class="mf-val">${d.sisaBerlaku||'—'}</div></div>
    <div class="mf"><div class="mf-lbl">Tgl Terbit</div><div class="mf-val">${d.tglTerbit||'—'}</div></div>
    <div class="mf"><div class="mf-lbl">Exp. Date</div>
      <div class="mf-val">${d.expDate||'—'} ${d.expDate?daysBadge(d.expDate):''}</div>
    </div>
    <div class="mf"><div class="mf-lbl">Rencana Re-SLO</div><div class="mf-val">${d.rencReSlo||'—'}</div></div>
    <div class="mf"><div class="mf-lbl">NIDI SIUJANG GATRIK</div><div class="mf-val" style="font-family:monospace;font-size:12px">${d.nidi||'N/A'}</div></div>
    ${d.lingkup?`<div class="mf full"><div class="mf-lbl">Lingkup SLO</div><div class="mf-val" style="font-size:12px;line-height:1.6">${d.lingkup}</div></div>`:''}
  </div>`;
  document.getElementById('modal').style.display='flex';
  document.body.style.overflow='hidden';
}
function closeModal(){document.getElementById('modal').style.display='none';document.body.style.overflow='';}

/* ── Export ─────────────────────────────────────── */
function exportExcel(){
  if(!state.filtered.length){showToast('Tidak ada data','error');return;}
  const hdr=['No','Tipe','Jenis','Nama/Ruas','No.REG','No.SLO','Tgl Terbit','Exp.Date','Sisa Berlaku','Status','Renc.Re-SLO'];
  const rows=state.filtered.map((r,i)=>[i+1,r.category,r.jenis,r.nama,r.noReg,r.noSlo,r.tglTerbit,r.expDate,r.sisaBerlaku,statusLabel(r.status),r.rencReSlo||'']);
  const ws=XLSX.utils.aoa_to_sheet([hdr,...rows]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Rekap SLO');
  XLSX.writeFile(wb,`Rekap_SLO_UPT_Probolinggo_${formatDate(new Date())}.xlsx`);
  showToast('Excel berhasil diunduh','success');
}
function exportPDF(){
  if(!state.filtered.length){showToast('Tidak ada data','error');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFontSize(14);doc.setFont('helvetica','bold');
  doc.text('Dashboard Rekap SLO UPT Probolinggo',14,16);
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(100);
  doc.text('PT PLN (Persero) UIT JBM  |  Dicetak: '+formatDate(new Date()),14,22);
  doc.autoTable({
    head:[['No','Tipe','Jenis','Nama/Ruas','No.SLO','Tgl Terbit','Exp.Date','Sisa Berlaku','Status']],
    body:state.filtered.map((r,i)=>[i+1,r.category,r.jenis,r.nama,r.noSlo,r.tglTerbit,r.expDate,r.sisaBerlaku,statusLabel(r.status)]),
    startY:28,styles:{fontSize:7,cellPadding:2},
    headStyles:{fillColor:[29,78,216],textColor:255,fontStyle:'bold'},
    alternateRowStyles:{fillColor:[240,246,255]},
    columnStyles:{0:{cellWidth:8},1:{cellWidth:12},2:{cellWidth:22},3:{cellWidth:55}},
  });
  doc.save(`Rekap_SLO_UPT_Probolinggo_${formatDate(new Date())}.pdf`);
  showToast('PDF berhasil diunduh','success');
}
function exportCategoryExcel(cat){
  const data=cat==='gi'?state.giData:state.trsData;
  if(!data.length){showToast('Tidak ada data','error');return;}
  let hdr,rows;
  if(cat==='gi'){
    hdr=['No','Jenis','Lokasi GI','Nama Bay','Bay','Kapasitas','No.REG','No.SLO','Tgl Terbit','Exp.Date','Sisa Berlaku','Status','Renc.Re-SLO'];
    rows=data.map((r,i)=>[i+1,r.jenis,r.lokasi,r.namaBay,r.bay,r.kapasitas,r.noReg,r.noSlo,r.tglTerbit,r.expDate,r.sisaBerlaku,statusLabel(r.status),r.rencReSlo]);
  }else{
    hdr=['No','Jenis','GI Asal','GI Tujuan','Sirkuit','KMS','Jml Tower','No.REG','No.SLO','Tgl Terbit','Exp.Date','Sisa Berlaku','Status','Renc.Re-SLO'];
    rows=data.map((r,i)=>[i+1,r.jenis,r.giAsal,r.giTujuan,r.sirkuit,r.kms,r.jmlTower,r.noReg,r.noSlo,r.tglTerbit,r.expDate,r.sisaBerlaku,statusLabel(r.status),r.rencReSlo]);
  }
  const ws=XLSX.utils.aoa_to_sheet([hdr,...rows]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,cat==='gi'?'Gardu Induk':'Transmisi');
  XLSX.writeFile(wb,`SLO_${cat==='gi'?'GarduInduk':'Transmisi'}_${formatDate(new Date())}.xlsx`);
  showToast('Excel berhasil diunduh','success');
}

/* ── Toast ──────────────────────────────────────── */
function showToast(msg,type='info'){
  const icons={
    success:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');t.className=`toast ${type}`;
  t.innerHTML=`<div class="toast-icon">${icons[type]||icons.info}</div><div class="toast-msg">${msg}</div>`;
  c.prepend(t);setTimeout(()=>{t.classList.add('hide');setTimeout(()=>t.remove(),250);},3500);
}

/* ── Theme ──────────────────────────────────────── */
function toggleTheme(){
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',dark?'':'dark');
  localStorage.setItem('slo-theme',dark?'light':'dark');
  updateThemeBtn();renderCharts();
}
function updateThemeBtn(){
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const btn=document.getElementById('btn-theme');if(!btn)return;
  btn.innerHTML=dark
    ?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light Mode`
    :`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark Mode`;
}

/* ── Nav ────────────────────────────────────────── */
function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  closeSidebar();
  if(page==='dashboard'){renderStats();renderCharts();renderPreviewTable();}
  if(page==='data')applyFilters();
  if(page==='gi')renderCategoryPage('gi');
  if(page==='trs')renderCategoryPage('trs');
}
function setCategoryFilter(cat){
  state.activeCategory=cat;
  document.querySelectorAll('.cat-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(`.cat-tab[data-cat="${cat}"]`)?.classList.add('active');
  applyFilters();
}
function onFilterChange(){
  state.filters.status=document.getElementById('filter-status').value;
  state.filters.lokasi=document.getElementById('filter-lokasi').value;
  state.filters.tahun=document.getElementById('filter-tahun').value;
  applyFilters();
}
function resetFilters(){
  state.filters={search:'',status:'',lokasi:'',tahun:''};
  ['filter-search','filter-status','filter-lokasi','filter-tahun'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  applyFilters();
}

/* ── Sidebar ─────────────────────────────────────── */
function openSidebar(){document.getElementById('sidebar').classList.add('open');document.getElementById('sidebar-overlay').classList.add('show');document.body.style.overflow='hidden';}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('show');document.body.style.overflow='';}

/* ── Helpers ────────────────────────────────────── */
function setRefreshSpin(on){document.getElementById('btn-refresh')?.classList.toggle('spinning',on);}
function hideLoader(){const l=document.getElementById('loading-overlay');if(l){l.classList.add('hide');setTimeout(()=>l.remove(),500);}}
function formatTime(d){return d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})+' WIB';}
function formatDate(d){return d.toISOString().slice(0,10).replace(/-/g,'');}

/* ── Init ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('slo-theme');
  if(saved==='dark')document.documentElement.setAttribute('data-theme','dark');
  updateThemeBtn();
  const main=document.getElementById('main-content'),goTop=document.getElementById('go-top');
  if(main)main.addEventListener('scroll',()=>goTop?.classList.toggle('vis',main.scrollTop>300));
  document.getElementById('filter-search')?.addEventListener('input',e=>{state.filters.search=e.target.value;applyFilters();});
  loadData();
  setInterval(loadData,5*60*1000);
  navigate('dashboard');
});

Object.assign(window,{openDetail,closeModal,sortTable,gotoPage,navigate,setCategoryFilter,
  onFilterChange,resetFilters,exportExcel,exportPDF,exportCategoryExcel,
  toggleTheme,loadData,openSidebar,closeSidebar});
