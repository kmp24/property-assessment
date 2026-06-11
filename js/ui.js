'use strict';

// ─── Parcel detail panel ──────────────────────────────────────────────────────

function showParcelDetail(props, type) {
  const p  = STAT_PREFIX[type];
  const el = document.getElementById(p+'-detail');
  if (!el) return;
  const a25 = parseFloat(props['Assessed Total']) || 0;
  const a20 = parseFloat(props['Pre Year Assessed Total']) || 0;
  const pct = a20 > 0 ? ((a25-a20)/a20*100).toFixed(1) : null;
  const up  = pct !== null && parseFloat(pct) >= 0;
  const fmt = v => v > 0 ? '$'+Math.round(v).toLocaleString() : '—';
  const FIELD_TIPS = {
    'Frame Type': 'Structural framing material',
    'State Use':  'Use category',
    'Style':      'Architectural style',
    'Zone':       'Zoning district',
    'Eff. Year Built': 'Effective year built/renovated',
  };
  const changeFmt = v => v > 0 ? '+$'+Math.round(v).toLocaleString() : '-$'+Math.round(Math.abs(v)).toLocaleString();
  const rows = [
    ['Owner',          props['Owner']],
    ['Zone',           props['Zone']],
    ['Neighborhood',   props['Neighborhood']],
    ['Style',          props['Style Description']],
    ['Frame Type',     props['Frame Type']],
    ['Eff. Year Built',props['Effective Year Built']],
    ['Living Area',    props['Living Area'] ? Math.round(parseFloat(props['Living Area'])).toLocaleString()+' sf' : null],
    ['Acres',          props['Land Acres'] ? parseFloat(props['Land Acres']).toFixed(2)+' ac' : null],
    ['Bedrooms',       props['Number of Bedroom']],
    ['Bathrooms',      props['Number of Bathrooms']],
    ['2022 Assessment',fmt(a25)],
    ['2020 Assessment',fmt(a20)],
    pct !== null ? ['Change', `${changeFmt(a25-a20)} (${up?'▲':'▼'}${Math.abs(pct)}%)`] : null,
  ].filter(r => r && r[1] && r[1] !== '0' && r[1] !== '—');

  el.innerHTML = `<div class="prop-detail">
    <div class="prop-addr">${props['Property Address']||'Unknown'}</div>
    ${pct!==null?`<div style="margin-bottom:.6rem"><span class="prop-change ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct)}%</span></div>`:''}
    ${rows.map(([l,v])=>{
      const tip = FIELD_TIPS[l];
      const lbl = tip ? `<span class="prop-row-label" title="${tip}">${l} <span class="field-tip">ⓘ</span></span>` : `<span class="prop-row-label">${l}</span>`;
      return `<div class="prop-row">${lbl}<span class="prop-row-value">${v}</span></div>`;
    }).join('')}
  </div>`;

  setTimeout(() => {
    el.scrollIntoView({ behavior:'smooth', block:'nearest' });
    el.classList.add('detail-flash');
    setTimeout(() => el.classList.remove('detail-flash'), 600);
  }, 50);
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.dashboard').forEach(d => d.classList.remove('active'));
  document.getElementById(`dash-${tab}`).classList.add('active');

  lazyInitMap(tab).then(() => {
    const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
    const map  = maps[tab];
    if (map) setTimeout(() => map.resize(), 100);
    if (dataCollected[tab]) {
      updateChartsForType(tab);
      if (scatterPending[tab]) { updateScatter(tab); scatterPending[tab]=false; }
    }
    if (selectedParcelId[tab] && maps[tab]) {
      setSelectedParcelHighlight(maps[tab], _sourceLayerName, selectedParcelId[tab], tab);
    }
    renderFilterChip(tab);
  });
}

// ─── Dashboard entry ──────────────────────────────────────────────────────────

function enterDashboard() {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  setTimeout(() => {
    residentialMap.resize();
    if (dataCollected['residential']) updateChartsForType('residential');
  }, 300);
}

// ─── Sidebar toggle ───────────────────────────────────────────────────────────

window.toggleSidebar = function(type, side) {
  const state = sidebarState[type];
  state[side] = !state[side];
  const dashboard  = document.getElementById(`dash-${type}`);
  if (!dashboard) return;
  const leftPanel  = dashboard.querySelector('.dash-left');
  const rightPanel = dashboard.querySelector('.dash-right');
  if (side==='left'  && leftPanel)  leftPanel.style.marginLeft   = state.left  ? `-${leftPanel.offsetWidth}px`  : '0';
  if (side==='right' && rightPanel) rightPanel.style.marginRight = state.right ? `-${rightPanel.offsetWidth}px` : '0';
  const btn = side==='left' ? dashboard.querySelector('.dash-left .sidebar-toggle') : dashboard.querySelector('.dash-right .sidebar-toggle');
  if (btn) {
    const label = state[side] ? (side==='left'?'›':'‹') : (side==='left'?'‹':'›');
    btn.textContent = label;
    btn.setAttribute('aria-label', state[side] ? `Expand ${side} panel` : `Collapse ${side} panel`);
  }
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  if (maps[type]) setTimeout(() => maps[type].resize(), 350);
};

// ─── Parcel type filter toggle ────────────────────────────────────────────────

window.toggleParcelFilter = function(type) {
  showAllParcels[type] = !showAllParcels[type];
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map  = maps[type];
  if (!map || !map.getLayer('parcels-fill')) return;
  const btn = document.getElementById(`${type}-filter-btn`);
  const typeLabel = type.charAt(0).toUpperCase()+type.slice(1);
  if (btn) {
    btn.textContent = showAllParcels[type] ? 'Showing all types' : 'Filter to '+typeLabel+' only';
    btn.classList.toggle('active', showAllParcels[type]);
  }
  applyMapFilter(type);
};

// ─── Scatter axis switcher ────────────────────────────────────────────────────

window.setScatterAxes = function(type, x, y, btn) {
  scatterAxes[type] = { x, y };
  btn.parentElement.querySelectorAll('.scatter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateScatter(type);
};

// ─── Inline text helper ───────────────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── Resizable sidebars ───────────────────────────────────────────────────────

(function initResizableSidebars() {
  var isResizing=false, currentHandle=null, startX=0, startWidth=0;
  // Use event delegation on document so handles work even inside hidden/lazy-init panels
  document.addEventListener('mousedown', e => {
    const handle = e.target.closest('.resize-handle');
    if (!handle) return;
    isResizing=true; currentHandle=handle; startX=e.clientX;
    startWidth=handle.parentElement.offsetWidth;
    handle.classList.add('resizing');
    document.body.style.cursor='ew-resize'; document.body.style.userSelect='none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isResizing||!currentHandle) return;
    const sidebar=currentHandle.parentElement, dashboard=sidebar.parentElement;
    const side=currentHandle.dataset.side;
    let newWidth = side==='left' ? startWidth+(e.clientX-startX) : startWidth-(e.clientX-startX);
    newWidth = Math.max(200,Math.min(600,newWidth));
    dashboard.style.setProperty(side==='left'?'--left-width':'--right-width', newWidth+'px');
    const dashId=dashboard.id.replace('dash-','');
    const maps={residential:residentialMap,condo:condoMap,commercial:commercialMap,vacant:vacantMap};
    const map=maps[dashId]; if(map) map.resize();
  });
  document.addEventListener('mouseup', () => {
    if (currentHandle) currentHandle.classList.remove('resizing');
    document.body.style.cursor=''; document.body.style.userSelect='';
    isResizing=false; currentHandle=null;
  });
})();

// ─── Loading / error UI ───────────────────────────────────────────────────────

function showLoading(msg) {
  const el=document.getElementById('loading-overlay'); if(el) el.style.display='flex';
  const m=document.getElementById('loading-message'); if(m) m.textContent=msg;
}

function hideLoading() {
  const el=document.getElementById('loading-overlay');
  if(el){ el.style.opacity='0'; el.style.transition='opacity .4s'; setTimeout(()=>{ el.style.display='none'; el.style.opacity='1'; },400); }
  document.getElementById('landing').style.display='flex';
}

function showError(msg) {
  const el=document.getElementById('loading-overlay'); if(!el) return;
  el.innerHTML=`<div style="background:#1a1a2e;border:1px solid rgba(200,75,49,.3);padding:2rem;border-radius:10px;max-width:600px;text-align:center;color:#f7f4ef;">
    <div style="font-size:1.8rem;margin-bottom:1rem">⚠️</div>
    <p style="font-weight:600;color:#e8865a;margin-bottom:.5rem">Error Loading Application</p>
    <p style="font-size:.85rem;color:rgba(247,244,239,.6);margin-bottom:1rem">${msg}</p>
    <button onclick="location.reload()" style="padding:.6rem 1.5rem;background:#c84b31;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:600">Reload Page</button>
  </div>`;
}

function showPMTilesError(msg) {
  const el=document.getElementById('loading-overlay'); if(!el) return;
  el.innerHTML=`<div style="background:#1a1a2e;border:1px solid rgba(200,75,49,.25);padding:2rem;border-radius:10px;max-width:520px;color:#f7f4ef;">
    <h3 style="color:#e8865a;margin-bottom:.75rem;text-align:center">⚠️ parcels.pmtiles not found</h3>
    <p style="color:rgba(247,244,239,.6);font-size:.82rem;margin-bottom:1rem;line-height:1.6">
      Make sure <code>parcels.pmtiles</code> is in the same folder as index.html and you're running a local server at <code>http://localhost:8000</code>.
    </p>
    <div style="display:flex;gap:.5rem;justify-content:center">
      <button onclick="location.reload()" style="padding:.5rem 1.25rem;background:#c84b31;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:600">Retry</button>
    </div>
  </div>`;
}