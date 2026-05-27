// ═══════════════════════════════════════════════════════════════════════════
// ASSESSOR'S ATLAS - D3 INTERACTIVE CHARTS VERSION
// All charts support zoom and pan with responsive font sizing
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

console.log('🚀 Assessor\'s Atlas - D3 Interactive Version');

// ───────────────────────────────────────────────────────────────────────────
// STATE
// ───────────────────────────────────────────────────────────────────────────
let residentialMap, condoMap, commercialMap, vacantMap;
let parcelData = { residential: [], condo: [], commercial: [], vacant: [] };
let statsData = { residential: {}, condo: {}, commercial: {}, vacant: {} };
let dataCollected = { residential: false, condo: false, commercial: false, vacant: false };
let charts = {};
let activeTab = 'residential';
let scatterPending = { residential: false, condo: false, commercial: false, vacant: false };
let collectionDone = false;

let sidebarState = {
  residential: { left: false, right: false },
  condo: { left: false, right: false },
  commercial: { left: false, right: false },
  vacant: { left: false, right: false }
};

let showAllParcels = {
  residential: false,
  condo: false,
  commercial: false,
  vacant: false
};

const scatterAxes = {
  residential: { x: 'sqft', y: 'assessed2022' },
  condo: { x: 'sqft', y: 'assessed2022' },
  commercial: { x: 'sqft', y: 'assessed2022' },
  vacant: { x: 'acreage', y: 'assessed2022' },
};

const STAT_PREFIX = {
  residential: 'res',
  condo: 'condo',
  commercial: 'commercial',
  vacant: 'vacant'
};

const COLORS = {
  residential: '#EE7733',
  condo: '#0077BB',
  commercial: '#33BBEE',
  vacant: '#009988'
};

const ZONE_COLORS = {
  'R-13': '#EE7733', 'R-20': '#0077BB', 'R-40': '#CC3311',
  'R-80': '#009988', 'B': '#EE3377', 'I': '#BBBBBB', 'default': '#33BBEE'
};

const PROP_TYPE_COLORS = {
  'Residential': '#EE7733', 'Condo': '#0077BB', 'Commercial': '#33BBEE',
  'Vacant': '#009988', 'default': '#BBBBBB'
};

const CATEGORICAL_PALETTE = [
  '#EE7733','#0077BB','#33BBEE','#EE3377','#CC3311','#009988',
  '#BBBBBB','#AA3377','#228833','#CCBB44','#AA7744','#4477AA',
];

const VALUE_RAMP   = ['#ffffb2','#fecc5c','#fd8d3c','#f03b20','#bd0026'];
const YEAR_RAMP    = ['#f0f0f0','#bdc9e1','#74a9cf','#2b8cbe','#045a8d'];
const ACREAGE_RAMP = ['#edf8fb','#b3cde3','#8c96c6','#8856a7','#810f7c'];

const SYMBOLIZATION_OPTIONS = [
  { value:'Zone',                    type:'categorical', colors:ZONE_COLORS },
  { value:'Property Type',           type:'categorical', colors:PROP_TYPE_COLORS },
  { value:'Assessed Total',          type:'continuous',  colorRamp:VALUE_RAMP },
  { value:'Pre Year Assessed Total', type:'continuous',  colorRamp:VALUE_RAMP },
  { value:'Effective Year Built',    type:'continuous',  colorRamp:YEAR_RAMP },
  { value:'Neighborhood',            type:'categorical' },
  { value:'Style Description',       type:'categorical' },
  { value:'State Use Description',   type:'categorical' },
  { value:'Land Acres',              type:'continuous',  colorRamp:ACREAGE_RAMP },
];

const mapSymbolization = { residential:'Zone', condo:'Zone', commercial:'Zone', vacant:'Zone' };

const AXIS_LABELS = {
  sqft:'Living Area', acreage:'Acreage (ac)', yearBuilt:'Year Built',
  assessed2020:'2020 Assessment', assessed2022:'2022 Assessment'
};

// ── Percentile helper for outlier clipping ──────────────────────────────
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a,b) => a-b);
  const idx = (p/100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Global tooltip
const tooltip = d3.select('body').append('div')
  .attr('class', 'd3-tooltip')
  .style('position','absolute')
  .style('pointer-events','none');

// ───────────────────────────────────────────────────────────────────────────
// STARTUP
// ───────────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  showLoading('Loading libraries…');
  try {
    await waitForLibraries(20000);
    showLoading('Initializing maps…');
    await initializeMaps();
  } catch (err) {
    showError(err.message);
    return;
  }
  document.getElementById('enter-btn').addEventListener('click', enterDashboard);
});

function waitForLibraries(timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (typeof maplibregl !== 'undefined' && typeof pmtiles !== 'undefined' && typeof d3 !== 'undefined') resolve();
      else if (Date.now() - start > timeout) reject(new Error('Library loading timeout'));
      else setTimeout(check, 100);
    };
    check();
  });
}

async function initializeMaps() {
  let protocol;
  try {
    protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  } catch (err) { console.error('PMTiles protocol error:', err); }

  const pmtilesUrl = 'pmtiles://parcels.pmtiles';
  let pmtilesCenter = [-71.0589, 42.3601];
  let pmtilesZoom = 12;
  let sourceLayerName = 'parcels';

  try {
    const pmtilesFile = new pmtiles.PMTiles('parcels.pmtiles');
    const header   = await pmtilesFile.getHeader();
    const metadata = await pmtilesFile.getMetadata();
    pmtilesCenter = [header.centerLon, header.centerLat];
    pmtilesZoom   = Math.max(header.minZoom + 2, 12);
    if (metadata?.vector_layers?.[0]) sourceLayerName = metadata.vector_layers[0].id;
  } catch (err) { console.warn('Could not inspect PMTiles:', err.message); }

  const baseStyle = {
    version: 8,
    sources: {
      'carto-light': {
        type:'raster',
        tiles:[
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        ],
        tileSize:256, attribution:'© OpenStreetMap contributors, © CARTO'
      },
      parcels:{ type:'vector', url:pmtilesUrl, attribution:'© Property Assessment Data' }
    },
    layers:[{ id:'basemap', type:'raster', source:'carto-light', minzoom:0, maxzoom:22 }]
  };

  const mapConfig = { style:baseStyle, center:pmtilesCenter, zoom:pmtilesZoom, minZoom:10, maxZoom:18, attributionControl:true };

  try {
    residentialMap = new maplibregl.Map({ ...mapConfig, container:'residentialMap' });
    condoMap       = new maplibregl.Map({ ...mapConfig, container:'condoMap' });
    commercialMap  = new maplibregl.Map({ ...mapConfig, container:'commercialMap' });
    vacantMap      = new maplibregl.Map({ ...mapConfig, container:'vacantMap' });

    await Promise.all([
      new Promise(r => residentialMap.once('load', r)),
      new Promise(r => condoMap.once('load', r)),
      new Promise(r => commercialMap.once('load', r)),
      new Promise(r => vacantMap.once('load', r))
    ]);

    addMapLayers(residentialMap, sourceLayerName);
    addMapLayers(condoMap,       sourceLayerName);
    addMapLayers(commercialMap,  sourceLayerName);
    addMapLayers(vacantMap,      sourceLayerName);

    residentialMap.on('click','parcels-fill', e => showParcelDetail(e.features[0].properties,'residential'));
    condoMap.on(      'click','parcels-fill', e => showParcelDetail(e.features[0].properties,'condo'));
    commercialMap.on( 'click','parcels-fill', e => showParcelDetail(e.features[0].properties,'commercial'));
    vacantMap.on(     'click','parcels-fill', e => showParcelDetail(e.features[0].properties,'vacant'));

    [residentialMap,condoMap,commercialMap,vacantMap].forEach(m => {
      m.on('mouseenter','parcels-fill', () => m.getCanvas().style.cursor = 'pointer');
      m.on('mouseleave','parcels-fill', () => m.getCanvas().style.cursor = '');
    });

    showLoading('Loading parcel data…');

    await new Promise(resolve => {
      let attempts = 0;
      const checkData = () => {
        attempts++;
        const features = residentialMap.querySourceFeatures('parcels', { sourceLayer: sourceLayerName });
        if (features && features.length > 0) { resolve(); }
        else if (attempts < 10) { setTimeout(checkData, 1000); residentialMap.triggerRepaint(); }
        else { console.warn('Timeout waiting for tiles'); resolve(); }
      };
      setTimeout(checkData, 1500);
    });

    await collectParcelData(sourceLayerName);
    hideLoading();
  } catch (err) {
    if (err.message?.includes('404') || err.message?.includes('parcels.pmtiles')) showPMTilesError(err.message);
    else showError(err.message);
  }
}

function addMapLayers(map, sourceLayer = 'parcels') {
  map.addLayer({ id:'parcels-fill', type:'fill', source:'parcels', 'source-layer':sourceLayer,
    paint:{ 'fill-color': colorExpr('Zone', SYMBOLIZATION_OPTIONS.find(o => o.value==='Zone')), 'fill-opacity':0.7 }});
  map.addLayer({ id:'parcels-outline', type:'line', source:'parcels', 'source-layer':sourceLayer,
    paint:{ 'line-color':'#fff', 'line-width':1, 'line-opacity':0.4 }});
}

async function collectParcelData(sourceLayer = 'parcels') {
  if (collectionDone) return;
  const features = residentialMap.querySourceFeatures('parcels', { sourceLayer });
  if (!features || features.length === 0) { showError('No features found in PMTiles file.'); return; }
  console.log(`✓ Loaded ${features.length} features`);
  collectionDone = true;

  const buckets = { residential:[], condo:[], commercial:[], vacant:[] };
  features.forEach(f => {
    const pt = (f.properties['Property Type'] || '').trim();
    if      (pt === 'Residential' || pt.includes('Residential'))           buckets.residential.push(f.properties);
    else if (pt === 'Condo' || pt === 'Condominium')                        buckets.condo.push(f.properties);
    else if (pt === 'Commercial')                                            buckets.commercial.push(f.properties);
    else if (pt === 'Vacant' || pt === 'Vacant Land' || pt.includes('Vacant')) buckets.vacant.push(f.properties);
  });

  Object.entries(buckets).forEach(([type, props]) => {
    if (!props.length) return;
    const parcels = props.map(p => ({
      parcelId:    p['Parcel ID'] || '',
      address:     p['Property Address'] || 'Unknown',
      owner:       p['Owner'] || '',
      type:        p['Property Type'] || '',
      neighborhood:p['Neighborhood'] || 'Unknown',
      style:       p['Style Description'] || 'Unknown',
      zone:        p['Zone'] || 'Unknown',
      sqft:        parseFloat(p['Living Area']) || 0,
      acreage:     parseFloat(p['Land Acres']) || 0,
      bedrooms:    parseInt(p['Number of Bedroom']) || 0,
      bathrooms:   parseFloat(p['Number of Bathrooms']) || 0,
      yearBuilt:   parseInt(p['Effective Year Built']) || 0,
      assessed2020:parseFloat(p['Pre Year Assessed Total']) || 0,
      assessed2022:parseFloat(p['Assessed Total']) || 0,
      stateUse:    p['State Use Description'] || 'Unknown',
    }));
    parcelData[type] = parcels;
    dataCollected[type] = true;
    const total2022 = parcels.reduce((s,p) => s + p.assessed2022, 0);
    const total2020 = parcels.reduce((s,p) => s + p.assessed2020, 0);
    statsData[type] = { count:parcels.length, total2022, total2020 };
    updateStatsUI(type);
    // Don't call updateChartsForType here — wait until dashboard is visible
  });

  setTimeout(() => {
    if (activeTab && parcelData[activeTab]?.length) updateScatter(activeTab);
    initializeSearch();
  }, 1500);

  updateLandingStats();
}

function updateStatsUI(type) {
  const s = statsData[type];
  if (!s || !s.count) return;
  const p = STAT_PREFIX[type];
  const fmt = v => v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString()}`;
  const pct = s.total2020 > 0 ? ((s.total2022-s.total2020)/s.total2020*100).toFixed(1) : null;
  const up  = pct !== null && parseFloat(pct) >= 0;
  setText(p+'-total25', fmt(s.total2022));
  setText(p+'-total20', fmt(s.total2020));
  setText(p+'-count',   s.count.toLocaleString());
  setText(p+'-avg',     fmt(s.total2022/s.count));
  const deltaEl = document.getElementById(p+'-delta');
  if (deltaEl && pct !== null) {
    deltaEl.textContent = `${up?'▲':'▼'} ${Math.abs(pct)}% vs 2020`;
    deltaEl.className = 'stat-delta ' + (up ? 'up' : 'down');
  }
}

function updateLandingStats() {
  const fmt = v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : '—';
  const ids = { residential:'res', condo:'condo', commercial:'comm', vacant:'vac' };
  ['residential','condo','commercial','vacant'].forEach(t => {
    const s = statsData[t];
    if (s && s.count) setText('ls-'+ids[t]+'-total', fmt(s.total2022));
  });
  const total = Object.values(statsData).reduce((a,s) => a+(s.count||0), 0);
  if (total > 0) setText('ls-total-parcels', total.toLocaleString()+' parcels');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showParcelDetail(props, type) {
  const p  = STAT_PREFIX[type];
  const el = document.getElementById(p+'-detail');
  if (!el) return;
  const a25 = parseFloat(props['Assessed Total']) || 0;
  const a20 = parseFloat(props['Pre Year Assessed Total']) || 0;
  const pct = a20 > 0 ? ((a25-a20)/a20*100).toFixed(1) : null;
  const up  = pct !== null && parseFloat(pct) >= 0;
  const fmt = v => v > 0 ? '$'+Math.round(v).toLocaleString() : '—';
  const rows = [
    ['Owner',      props['Owner']],
    ['Zone',       props['Zone']],
    ['Neighborhood',props['Neighborhood']],
    ['Style',      props['Style Description']],
    ['Year Built', props['Effective Year Built']],
    ['Living Area',props['Gross Area of Primary Building'] ? Math.round(parseFloat(props['Gross Area of Primary Building'])).toLocaleString()+' sf' : null],
    ['Acres',      props['Land Acres'] ? parseFloat(props['Land Acres']).toFixed(2)+' ac' : null],
    ['Bedrooms',   props['Number of Bedroom']],
    ['Bathrooms',  props['Number of Bathrooms']],
    ['2022',       fmt(a25)],
    ['2020',       fmt(a20)],
  ].filter(([,v]) => v && v !== '0' && v !== '—');
  el.innerHTML = `<div class="prop-detail">
    <div class="prop-addr">${props['Property Address']||'Unknown'}</div>
    ${pct!==null?`<div style="margin-bottom:.6rem"><span class="prop-change ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct)}%</span></div>`:''}
    ${rows.map(([l,v])=>`<div class="prop-row"><span class="prop-row-label">${l}</span><span class="prop-row-value">${v}</span></div>`).join('')}
  </div>`;
}

function colorExpr(field, opt, type) {
  if (!opt) return '#94a3b8';
  if (opt.type === 'categorical' && opt.colors) {
    const cases = [];
    Object.entries(opt.colors).forEach(([val,color]) => { if (val!=='default') cases.push(val,color); });
    return ['match',['get',field],...cases, opt.colors.default||'#94a3b8'];
  }
  if (opt.type === 'continuous' && opt.colorRamp) {
    const ramp = opt.colorRamp;
    let stops = [];
    if (type && parcelData[type]?.length) {
      const parcels = parcelData[type];
      if (field.includes('Year')) {
        const years = parcels.map(p=>p.yearBuilt).filter(y=>y>0);
        if (years.length) {
          const min=Math.min(...years), max=Math.max(...years), step=(max-min)/5;
          stops=[min]; for(let i=1;i<5;i++) stops.push(Math.floor(min+step*i)); stops.push(max);
        } else stops=[1900,1940,1960,1980,2000,2020];
      } else if (field==='Land Acres') {
        const acres=parcels.map(p=>p.acreage).filter(a=>a>0);
        if (acres.length) { const s=acres.sort((a,b)=>a-b); stops=[0,s[Math.floor(s.length*.2)],s[Math.floor(s.length*.4)],s[Math.floor(s.length*.6)],s[Math.floor(s.length*.8)],s[s.length-1]]; }
        else stops=[0,.25,.5,1,2,5];
      } else {
        const vals=parcels.map(p=>p.assessed2022).filter(v=>v>0);
        if (vals.length) { const s=vals.sort((a,b)=>a-b); stops=[0,s[Math.floor(s.length*.2)],s[Math.floor(s.length*.4)],s[Math.floor(s.length*.6)],s[Math.floor(s.length*.8)],s[s.length-1]]; }
        else stops=[0,100000,300000,600000,1000000,2000000];
      }
    } else {
      if (field.includes('Year')) stops=[1900,1940,1960,1980,2000,2020];
      else if (field==='Land Acres') stops=[0,.25,.5,1,2,5];
      else stops=[0,100000,300000,600000,1000000,2000000];
    }
    return ['interpolate',['linear'],['coalesce',['get',field],0],...stops.flatMap((s,i)=>[s,ramp[Math.min(i,ramp.length-1)]])];
  }
  return '#94a3b8';
}

window.changeMapSymbolization = function(map, type, field) {
  mapSymbolization[type] = field;
  const opt = SYMBOLIZATION_OPTIONS.find(o => o.value===field);
  if (opt && opt.type==='categorical' && !opt.colors) opt.colors = generateCategoricalColors(getUniqueValuesForField(type,field));
  if (map.getLayer('parcels-fill')) map.setPaintProperty('parcels-fill','fill-color',colorExpr(field,opt,type));
  buildLegend(field, opt, type);
};

function getUniqueValuesForField(type, field) {
  const parcels = parcelData[type]||[];
  const values  = new Set();
  const fieldMap = { 'Neighborhood':'neighborhood','Style Description':'style','State Use Description':'stateUse' };
  const dataField = fieldMap[field]||field;
  parcels.forEach(p => { const v=p[dataField]; if(v && v!=='Unknown' && v!=='') values.add(v); });
  return Array.from(values).sort();
}

function generateCategoricalColors(values) {
  const colors = {};
  values.forEach((val,i) => { colors[val]=CATEGORICAL_PALETTE[i%CATEGORICAL_PALETTE.length]; });
  colors['default']='#BBBBBB';
  return colors;
}

function buildLegend(field, opt, type) {
  const p  = STAT_PREFIX[type];
  const el = document.getElementById(p+'-legend');
  if (!el) return;
  el.innerHTML = '';
  if (!opt) return;
  if (opt.type==='categorical' && opt.colors) {
    const entries = Object.entries(opt.colors).filter(([k])=>k!=='default');
    if (entries.length>10) {
      const parcels  = parcelData[type]||[];
      const fieldMap = {'Neighborhood':'neighborhood','Style Description':'style','State Use Description':'stateUse','Zone':'zone','Property Type':'type'};
      const dataField= fieldMap[field]||field;
      const counts={};
      parcels.forEach(p=>{ const v=p[dataField]; if(v&&v!=='Unknown') counts[v]=(counts[v]||0)+1; });
      entries.map(([val,color])=>({val,color,count:counts[val]||0})).sort((a,b)=>b.count-a.count).slice(0,10)
        .forEach(({val,color})=>{ const item=document.createElement('div'); item.className='legend-item'; item.innerHTML=`<div class="legend-swatch" style="background:${color}"></div><span>${val}</span>`; el.appendChild(item); });
      if (entries.length>10) { const item=document.createElement('div'); item.className='legend-item'; item.innerHTML=`<span style="color:var(--ink-3);font-style:italic">...and ${entries.length-10} more</span>`; el.appendChild(item); }
    } else {
      entries.forEach(([val,color])=>{ const item=document.createElement('div'); item.className='legend-item'; item.innerHTML=`<div class="legend-swatch" style="background:${color}"></div><span>${val}</span>`; el.appendChild(item); });
    }
  } else if (opt.type==='continuous') {
    const ramp=opt.colorRamp||VALUE_RAMP;
    const rampDiv=document.createElement('div'); rampDiv.className='legend-ramp';
    ramp.forEach(color=>{ const seg=document.createElement('div'); seg.className='legend-ramp-seg'; seg.style.background=color; rampDiv.appendChild(seg); });
    el.appendChild(rampDiv);
    const parcels=parcelData[type]||[]; let labels;
    if (opt.value.includes('Year')) {
      const years=parcels.map(p=>p.yearBuilt).filter(y=>y>0);
      labels=years.length?[Math.min(...years).toString(),Math.max(...years).toString()]:['1900','2020'];
    } else if (opt.value==='Land Acres') {
      const acres=parcels.map(p=>p.acreage).filter(a=>a>0);
      labels=acres.length?['0 ac',acres.sort((a,b)=>a-b).slice(-1)[0].toFixed(1)+' ac']:['0 ac','5+ ac'];
    } else {
      const vals=parcels.map(p=>p.assessed2022).filter(v=>v>0);
      if (vals.length) { const max=vals.sort((a,b)=>a-b).slice(-1)[0]; labels=['$0',max>=1e6?`$${(max/1e6).toFixed(1)}M`:`$${Math.round(max/1000)}K`]; }
      else labels=['$0','$2M+'];
    }
    const scaleDiv=document.createElement('div'); scaleDiv.className='legend-scale'; scaleDiv.innerHTML=`<span>${labels[0]}</span><span>${labels[1]}</span>`; el.appendChild(scaleDiv);
  }
}

function enterDashboard() {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  setTimeout(() => {
    [residentialMap,condoMap,commercialMap,vacantMap].forEach(m => m.resize());
    // Now the dashboard is visible — render all charts that have data
    ['residential','condo','commercial','vacant'].forEach(t => {
      if (dataCollected[t]) updateChartsForType(t);
    });
  }, 300);
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════
let searchTimeout;

function initializeSearch() {
  const searchInput   = document.getElementById('parcel-search');
  const searchResults = document.getElementById('search-results');
  if (!searchInput || !searchResults) return;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) { searchResults.classList.remove('show'); return; }
    searchTimeout = setTimeout(() => performSearch(query), 300);
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-container')) searchResults.classList.remove('show'); });
  searchInput.addEventListener('click', e => { e.stopPropagation(); if (searchResults.children.length>0) searchResults.classList.add('show'); });
}

function performSearch(query) {
  const searchResults = document.getElementById('search-results');
  if (!searchResults) return;
  const queryLower = query.toLowerCase();
  const results = [];
  Object.entries(parcelData).forEach(([type,parcels]) => {
    parcels.forEach(parcel => {
      if (parcel.address.toLowerCase().includes(queryLower) || parcel.parcelId.toLowerCase().includes(queryLower))
        results.push({...parcel, type});
    });
  });
  const limited = results.slice(0,20);
  if (!limited.length) { searchResults.innerHTML='<div class="search-no-results">No parcels found matching "'+query+'"</div>'; searchResults.classList.add('show'); return; }
  const fmt = v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${Math.round(v/1e3)}K`:`$${Math.round(v)}`;
  searchResults.innerHTML = limited.map(p => `
    <div class="search-result-item" data-parcel-id="${p.parcelId}" data-type="${p.type}">
      <div class="search-result-address">${p.address}</div>
      <div class="search-result-details">
        <span class="search-result-badge">${p.type}</span>
        <span>${p.zone||'N/A'}</span><span>${fmt(p.assessed2022)}</span>
        ${p.sqft>0?`<span>${Math.round(p.sqft).toLocaleString()} sf</span>`:''}
      </div>
    </div>`).join('');
  searchResults.classList.add('show');
  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      selectParcel(item.dataset.parcelId, item.dataset.type);
      searchResults.classList.remove('show');
      document.getElementById('parcel-search').value = '';
    });
  });
}

function selectParcel(parcelId, type) {
  if (activeTab !== type) switchTab(type);
  const parcel = parcelData[type].find(p => p.parcelId===parcelId);
  if (!parcel) return;
  showParcelDetail({
    'Property Address':parcel.address,'Parcel ID':parcel.parcelId,'Owner':parcel.owner,
    'Zone':parcel.zone,'Neighborhood':parcel.neighborhood,'Style Description':parcel.style,
    'Effective Year Built':parcel.yearBuilt,'Gross Area of Primary Building':parcel.sqft,
    'Land Acres':parcel.acreage,'Number of Bedroom':parcel.bedrooms,'Number of Bathrooms':parcel.bathrooms,
    'Assessed Total':parcel.assessed2022,'Pre Year Assessed Total':parcel.assessed2020
  }, type);
  highlightParcelOnMap(parcelId, type);
}

function highlightParcelOnMap(parcelId, type) {
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map  = maps[type];
  if (!map) return;
  if (map.getLayer('parcel-highlight')) map.removeLayer('parcel-highlight');
  if (map.getSource('parcel-highlight')) map.removeSource('parcel-highlight');
  const features = map.querySourceFeatures('parcels',{ sourceLayer:'parcels', filter:['==',['get','Parcel ID'],parcelId] });
  if (!features.length) return;
  const feature = features[0];
  map.addSource('parcel-highlight',{ type:'geojson', data:{ type:'Feature', geometry:feature.geometry, properties:feature.properties }});
  map.addLayer({ id:'parcel-highlight', type:'line', source:'parcel-highlight', paint:{ 'line-color':'#FFD700','line-width':4,'line-opacity':1 }});
  map.fitBounds(getBBox(feature.geometry),{ padding:100, duration:1000 });
  setTimeout(() => {
    if (map.getLayer('parcel-highlight'))  map.removeLayer('parcel-highlight');
    if (map.getSource('parcel-highlight')) map.removeSource('parcel-highlight');
  }, 5000);
}

function getBBox(geometry) {
  if (geometry.type==='Polygon') {
    const coords=geometry.coordinates[0], lngs=coords.map(c=>c[0]), lats=coords.map(c=>c[1]);
    return [[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]];
  } else if (geometry.type==='MultiPolygon') {
    const all=geometry.coordinates.flat(2), lngs=all.filter((_,i)=>i%2===0), lats=all.filter((_,i)=>i%2===1);
    return [[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]];
  }
  return [[-180,-90],[180,90]];
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.dashboard').forEach(d => d.classList.remove('active'));
  document.getElementById(`dash-${tab}`).classList.add('active');
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map  = maps[tab];
  if (map) setTimeout(() => map.resize(), 100);
  if (dataCollected[tab]) {
    updateChartsForType(tab);
    if (scatterPending[tab]) { updateScatter(tab); scatterPending[tab]=false; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════════════════

function updateChartsForType(type) {
  const parcels = parcelData[type];
  if (!parcels?.length) return;
  setTimeout(() => {
    if (type==='residential') updateResStyleMeanChart(parcels);
    if (type==='condo')       { updateCondoNeighborhoodChart(parcels); updateStateUseChart(type,parcels); }
    if (type==='commercial')  { updateCommercialZoneChart(parcels); updateCommercialUseChart(parcels); updateStateUseChart(type,parcels); updateCommercialStyleChart(parcels); }
    if (type==='vacant')      { updateVacantUseChart(parcels); updateStateUseChart(type,parcels); }
    if (type===activeTab) updateScatter(type);
    else scatterPending[type] = true;
  }, 100);
}

// ─── Shared chart renderer — called directly AND by ResizeObserver ──────────
function renderScatterInto(container, type, sample, ax) {
  d3.select(container).selectAll('*').remove();
  const width  = container.clientWidth  || 300;
  const height = container.clientHeight || 260;
  const fs = Math.max(9, Math.min(13, width / 28));
  const margin = { top:12, right:12, bottom:Math.round(fs*4.2), left:Math.round(fs*5.2) };
  const iW = Math.max(width  - margin.left - margin.right,  60);
  const iH = Math.max(height - margin.top  - margin.bottom, 60);
  const isYearX = ax.x === 'yearBuilt';

  // Clip to 95th percentile on each axis to suppress outliers
  const xVals = sample.map(d=>d[ax.x]);
  const yVals = sample.map(d=>d[ax.y]);
  const xMax = isYearX ? d3.max(xVals) * 1.001 : percentile(xVals, 95) * 1.05;
  const yMax = percentile(yVals, 95) * 1.05;
  const xMin = isYearX ? d3.min(xVals) - 2 : 0;
  // Keep outliers in data (visible as clipped dots at edge) but don't let them blow the scale
  const clipped = sample.map(d => ({
    ...d,
    _cx: Math.min(d[ax.x], xMax),
    _cy: Math.min(d[ax.y], yMax),
    _outlier: d[ax.x] > xMax || d[ax.y] > yMax
  }));

  const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0,iW]);
  const yScale = d3.scaleLinear().domain([0, yMax]).range([iH,0]);

  const fmtX = d => isYearX ? Math.round(d).toString() : ax.x.includes('assessed') ? (d>=1e6?`$${(d/1e6).toFixed(1)}M`:d>=1e3?`$${Math.round(d/1e3)}K`:`$${Math.round(d)}`) : (d>=1e3?`${Math.round(d/1e3)}K`:Math.round(d));
  const fmtY = d => ax.y.includes('assessed') ? (d>=1e6?`$${(d/1e6).toFixed(1)}M`:d>=1e3?`$${Math.round(d/1e3)}K`:`$${Math.round(d)}`) : (d>=1e3?`${Math.round(d/1e3)}K`:Math.round(d));
  const xAxis = d3.axisBottom(xScale).ticks(Math.max(3,Math.floor(iW/55))).tickFormat(fmtX);
  const yAxis = d3.axisLeft(yScale).ticks(Math.max(3,Math.floor(iH/40))).tickFormat(fmtY);

  const svg = d3.select(container).append('svg').attr('width',width).attr('height',height);
  const g   = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);

  const xAxisG = g.append('g').attr('class','axis').attr('transform',`translate(0,${iH})`).call(xAxis);
  xAxisG.selectAll('text').style('font-size',fs+'px');
  const yAxisG = g.append('g').attr('class','axis').call(yAxis);
  yAxisG.selectAll('text').style('font-size',fs+'px');

  svg.append('text').attr('text-anchor','middle').attr('x',margin.left+iW/2).attr('y',height-2)
    .style('font-size',fs+'px').style('fill','#5a5a7a').style('font-weight','600').text(AXIS_LABELS[ax.x]||ax.x);
  svg.append('text').attr('text-anchor','middle').attr('transform','rotate(-90)').attr('x',-(margin.top+iH/2)).attr('y',fs+1)
    .style('font-size',fs+'px').style('fill','#5a5a7a').style('font-weight','600').text(AXIS_LABELS[ax.y]||ax.y);

  const dotR = Math.max(2,Math.min(4,width/80));
  const dots = g.append('g').attr('class','dots');
  dots.selectAll('circle').data(clipped).enter().append('circle')
    .attr('class','dot').attr('cx',d=>xScale(d._cx)).attr('cy',d=>yScale(d._cy))
    .attr('r',d=>d._outlier ? dotR*0.7 : dotR)
    .attr('fill',d=>d._outlier ? '#aaa' : COLORS[type])
    .attr('fill-opacity',d=>d._outlier ? 0.25 : 0.5)
    .attr('stroke',d=>d._outlier ? '#aaa' : COLORS[type]).attr('stroke-width',1)
    .on('mouseover', function(event,d) {
      d3.select(this).attr('r',dotR+2).attr('fill-opacity',0.9).attr('stroke-width',2);
      const xVal = isYearX ? d[ax.x].toString() : ax.x.includes('assessed') ? `$${Math.round(d[ax.x]).toLocaleString()}` : Math.round(d[ax.x]).toLocaleString();
      const yVal = ax.y.includes('assessed') ? `$${Math.round(d[ax.y]).toLocaleString()}` : Math.round(d[ax.y]).toLocaleString();
      const outlierNote = d._outlier ? '<br><em style="color:#aaa">outlier — clipped to edge</em>' : '';
      tooltip.style('left',(event.pageX+10)+'px').style('top',(event.pageY-10)+'px').classed('show',true)
        .html(`<strong>${d.address}</strong><br>${AXIS_LABELS[ax.x]||ax.x}: ${xVal}<br>${AXIS_LABELS[ax.y]||ax.y}: ${yVal}${outlierNote}`);
    })
    .on('mouseout', function() { d3.select(this).attr('r',d=>d._outlier?dotR*0.7:dotR).attr('fill-opacity',d=>d._outlier?0.25:0.5).attr('stroke-width',1); tooltip.classed('show',false); });

  const zoom = d3.zoom().scaleExtent([0.5,20]).extent([[0,0],[iW,iH]]).translateExtent([[0,0],[iW,iH]])
    .on('zoom', event => {
      const nx=event.transform.rescaleX(xScale), ny=event.transform.rescaleY(yScale);
      const cx=nx.copy().domain([Math.max(isYearX?1800:0,nx.domain()[0]),Math.max(0,nx.domain()[1])]);
      const cy=ny.copy().domain([Math.max(0,ny.domain()[0]),Math.max(0,ny.domain()[1])]);
      xAxisG.call(xAxis.scale(cx)); xAxisG.selectAll('text').style('font-size',fs+'px');
      yAxisG.call(yAxis.scale(cy)); yAxisG.selectAll('text').style('font-size',fs+'px');
      dots.selectAll('circle').attr('cx',d=>cx(Math.min(d[ax.x],cx.domain()[1]))).attr('cy',d=>cy(Math.min(d[ax.y],cy.domain()[1])));
    });
  svg.call(zoom);
  svg.on('dblclick.zoom', () => svg.transition().duration(750).call(zoom.transform,d3.zoomIdentity));
}

// renderBarInto: data items have { label, count, mean }
// One bar per row (count), mean assessment shown as text label at bar end
function renderBarInto(container, data, color) {
  d3.select(container).selectAll('*').remove();
  if (!data.length) return;
  const width  = container.clientWidth  || 280;
  const height = container.clientHeight || 160;
  const fs = Math.max(9, Math.min(13, width / 22));
  // Right margin wide enough for mean label e.g. "$312K"
  const margin = { top:6, right:Math.round(fs*5.5), bottom:Math.round(fs*2.8), left:Math.round(Math.min(width*0.4, fs*12)) };
  const iW = Math.max(width  - margin.left - margin.right, 30);
  const iH = Math.max(height - margin.top  - margin.bottom, 30);

  const fmtVal = v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${Math.round(v/1e3)}K`:`$${Math.round(v)}`;

  const xScale = d3.scaleLinear().domain([0, d3.max(data,d=>d.mean)]).range([0,iW]);
  const yScale = d3.scaleBand().domain(data.map(d=>d.label)).range([0,iH]).padding(0.2);

  const fmtAxis = v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${Math.round(v/1e3)}K`:`$${Math.round(v)}`;
  const xAxis = d3.axisBottom(xScale).ticks(Math.max(3,Math.floor(iW/50))).tickFormat(fmtAxis);
  const yAxis = d3.axisLeft(yScale).tickSize(0);

  const svg = d3.select(container).append('svg').attr('width',width).attr('height',height);
  const g   = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);

  const xAxisG = g.append('g').attr('class','axis').attr('transform',`translate(0,${iH})`).call(xAxis);
  xAxisG.selectAll('text').style('font-size',fs+'px');

  const yAxisG = g.append('g').attr('class','axis').call(yAxis);
  yAxisG.selectAll('text').style('font-size',fs+'px').style('text-anchor','end').each(function(d) {
    const maxChars = Math.floor(margin.left / (fs*0.6));
    if (d && d.length > maxChars) d3.select(this).text(d.slice(0,maxChars-1)+'…');
  });

  // Single bar per row, width = count
  const bars = g.selectAll('.bar').data(data).enter().append('rect').attr('class','bar')
    .attr('x',0).attr('y',d=>yScale(d.label))
    .attr('width',d=>Math.max(0,xScale(d.mean)))
    .attr('height',yScale.bandwidth())
    .attr('fill',color).attr('rx',2);

  // Invisible full-row hover target
  g.selectAll('.bar-hover').data(data).enter().append('rect').attr('class','bar-hover')
    .attr('x',0).attr('y',d=>yScale(d.label))
    .attr('width',iW).attr('height',yScale.bandwidth())
    .attr('fill','transparent')
    .on('mouseover', function(event,d) {
      tooltip.style('left',(event.pageX+10)+'px').style('top',(event.pageY-10)+'px').classed('show',true)
        .html(`<strong>${d.label}</strong><br>Count: ${d.count.toLocaleString()}<br>Mean Assessment: ${fmtVal(d.mean)}`);
    })
    .on('mouseout', () => tooltip.classed('show',false));

  // Zoom pans the count axis, labels follow
  const zoom = d3.zoom().scaleExtent([1,5]).translateExtent([[0,0],[iW,iH]])
    .on('zoom', event => {
      const nx = event.transform.rescaleX(xScale);
      xAxisG.call(d3.axisBottom(nx).ticks(Math.max(3,Math.floor(iW/50))));
      xAxisG.selectAll('text').style('font-size',fs+'px');
      bars.attr('width',d=>Math.max(0,nx(d.mean)));
    });
  svg.call(zoom);
}


// ─── ResizeObserver wrapper — attaches to a container, re-renders on resize ──
function watchAndRender(container, renderFn) {
  if (!container) return;
  // Store the render function so we can call it manually too
  container._renderFn = renderFn;
  if (container._ro) container._ro.disconnect();
  const ro = new ResizeObserver(() => { if (container.clientWidth > 20 && container.clientHeight > 20) renderFn(); });
  ro.observe(container);
  container._ro = ro;
  // Render immediately (works if container is already visible with real size)
  renderFn();
}

// ─── Scatter ───────────────────────────────────────────────────────────────
function updateScatter(type) {
  const parcels = parcelData[type];
  const ax      = scatterAxes[type];
  const p       = STAT_PREFIX[type];
  const container = document.getElementById(p+'Scatter');
  if (!container || !parcels?.length) return;

  const raw    = parcels.filter(q => q[ax.x]>0 && q[ax.y]>0);
  const step   = Math.max(1, Math.ceil(raw.length/1000));
  const sample = raw.filter((_,i) => i%step===0);

  const countEl = document.getElementById(p+'-scatter-count');
  if (countEl) countEl.textContent = ' ('+sample.length.toLocaleString()+' pts)';

  watchAndRender(container, () => renderScatterInto(container, type, sample, ax));
  scatterPending[type] = false;
}

// ─── Bar charts ────────────────────────────────────────────────────────────
function updateResStyleMeanChart(parcels) {
  const container = document.getElementById('resStyleMeanChart');
  if (!container) return;
  const grouped = {};
  parcels.forEach(p => {
    if (!p.style || p.style==='Unknown' || p.assessed2022<=0) return;
    if (!grouped[p.style]) grouped[p.style]={sum:0,count:0};
    grouped[p.style].sum   += p.assessed2022;
    grouped[p.style].count += 1;
  });
  const data = Object.entries(grouped).map(([label,{sum,count}])=>({label,count,mean:sum/count}))
    .sort((a,b)=>b.mean-a.mean).slice(0,8);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS.residential));
}

function updateCondoNeighborhoodChart(parcels) {
  const container = document.getElementById('condoNeighborhoodChart');
  if (!container) return;
  const grouped={};
  parcels.forEach(p=>{ if(p.neighborhood&&p.neighborhood!=='Unknown'&&p.assessed2022>0){
    if(!grouped[p.neighborhood]) grouped[p.neighborhood]={sum:0,count:0};
    grouped[p.neighborhood].sum+=p.assessed2022; grouped[p.neighborhood].count+=1;
  }});
  const data=Object.entries(grouped).map(([label,{sum,count}])=>({label,count,mean:sum/count}))
    .sort((a,b)=>b.mean-a.mean).slice(0,8);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS.condo));
}

function updateStateUseChart(type, parcels) {
  const ids = { condo:'condoStateUseChart', commercial:'commercialStateUseChart', vacant:'vacantStateUseChart' };
  const container = document.getElementById(ids[type]);
  if (!container) return;
  const grouped={};
  parcels.forEach(p=>{ if(p.stateUse&&p.stateUse!=='Unknown'&&p.assessed2022>0){
    if(!grouped[p.stateUse]) grouped[p.stateUse]={sum:0,count:0};
    grouped[p.stateUse].sum+=p.assessed2022; grouped[p.stateUse].count+=1;
  }});
  const data=Object.entries(grouped).map(([label,{sum,count}])=>({label,count,mean:sum/count}))
    .sort((a,b)=>b.mean-a.mean).slice(0,8);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS[type]));
}

function updateCommercialZoneChart(parcels) {
  const container = document.getElementById('commercialClassChart');
  if (!container) return;
  const grouped={};
  parcels.forEach(p=>{ if(p.zone&&p.zone!=='Unknown'&&p.assessed2022>0){
    if(!grouped[p.zone]) grouped[p.zone]={sum:0,count:0};
    grouped[p.zone].sum+=p.assessed2022; grouped[p.zone].count+=1;
  }});
  const data=Object.entries(grouped).map(([label,{sum,count}])=>({label,count,mean:sum/count}))
    .sort((a,b)=>b.mean-a.mean).slice(0,10);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS.commercial));
}
function updateCommercialStyleChart(parcels) {
  const container = document.getElementById('commercialStyleChart');
  if (!container) return;
  const grouped = {};
  parcels.forEach(p => {
    if (!p.style || p.style === 'Unknown' || p.assessed2022 <= 0) return;
    if (!grouped[p.style]) grouped[p.style] = { sum: 0, count: 0 };
    grouped[p.style].sum   += p.assessed2022;
    grouped[p.style].count += 1;
  });
  const data = Object.entries(grouped)
    .map(([label, { sum, count }]) => ({ label, count, mean: sum / count }))
    .sort((a, b) => b.mean - a.mean).slice(0, 8);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS.condo));
}
function updateCommercialUseChart(parcels) {
  const container = document.getElementById('commercialUseChart');
  if (!container) return;
  const grouped={};
  parcels.forEach(p=>{ if(p.stateUse&&p.stateUse!=='Unknown'&&p.assessed2022>0){
    if(!grouped[p.stateUse]) grouped[p.stateUse]={sum:0,count:0};
    grouped[p.stateUse].sum+=p.assessed2022; grouped[p.stateUse].count+=1;
  }});
  const data=Object.entries(grouped).map(([label,{sum,count}])=>({label,count,mean:sum/count}))
    .sort((a,b)=>b.mean-a.mean).slice(0,8);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS.commercial));
}

function updateVacantUseChart(parcels) {
  const container = document.getElementById('vacantUseChart');
  if (!container) return;
  const grouped={};
  parcels.forEach(p=>{ if(p.stateUse&&p.stateUse!=='Unknown'&&p.assessed2022>0){
    if(!grouped[p.stateUse]) grouped[p.stateUse]={sum:0,count:0};
    grouped[p.stateUse].sum+=p.assessed2022; grouped[p.stateUse].count+=1;
  }});
  const data=Object.entries(grouped).map(([label,{sum,count}])=>({label,count,mean:sum/count}))
    .sort((a,b)=>b.mean-a.mean).slice(0,8);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS.vacant));
}

window.setScatterAxes = function(type, x, y, btn) {
  scatterAxes[type] = { x, y };
  btn.parentElement.querySelectorAll('.scatter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateScatter(type);
};

window.toggleSidebar = function(type, side) {
  const state = sidebarState[type];
  state[side] = !state[side];
  const dashboard  = document.getElementById(`dash-${type}`);
  if (!dashboard) return;
  const leftPanel  = dashboard.querySelector('.dash-left');
  const rightPanel = dashboard.querySelector('.dash-right');
  if (side==='left'  && leftPanel)  leftPanel.style.marginLeft   = state.left  ? '-320px' : '0';
  if (side==='right' && rightPanel) rightPanel.style.marginRight = state.right ? '-280px' : '0';
  const btn = side==='left' ? dashboard.querySelector('.dash-left .sidebar-toggle') : dashboard.querySelector('.dash-right .sidebar-toggle');
  if (btn) btn.textContent = state[side] ? (side==='left'?'›':'‹') : (side==='left'?'‹':'›');
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map  = maps[type];
  if (map) setTimeout(() => map.resize(), 350);
};

window.toggleParcelFilter = function(type) {
  showAllParcels[type] = !showAllParcels[type];
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map  = maps[type];
  if (!map || !map.getLayer('parcels-fill')) return;
  const btn = document.getElementById(`${type}-filter-btn`);
  if (btn) { btn.textContent=showAllParcels[type]?'Show Only '+type.charAt(0).toUpperCase()+type.slice(1):'Show All Parcels'; btn.classList.toggle('active',showAllParcels[type]); }
  let filterExpr;
  if (showAllParcels[type]) { filterExpr=['all']; }
  else if (type==='vacant')  filterExpr=['any',['==',['get','Property Type'],'Vacant'],['==',['get','Property Type'],'Vacant Land']];
  else if (type==='condo')   filterExpr=['any',['==',['get','Property Type'],'Condo'],['==',['get','Property Type'],'Condominium']];
  else                       filterExpr=['==',['get','Property Type'],type.charAt(0).toUpperCase()+type.slice(1)];
  map.setFilter('parcels-fill',filterExpr);
  map.setFilter('parcels-outline',filterExpr);
};

// Sidebar resize handles
(function initResizableSidebars() {
  let isResizing=false, currentHandle=null, startX=0, startWidth=0;
  document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      isResizing=true; currentHandle=handle; startX=e.clientX;
      startWidth=handle.parentElement.offsetWidth;
      handle.classList.add('resizing');
      document.body.style.cursor='ew-resize'; document.body.style.userSelect='none';
      e.preventDefault();
    });
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

console.log('✅ D3 Interactive Charts Ready');