'use strict';

console.log('🚀 Assessor\'s Atlas - D3 Interactive Version');

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

let showAllParcels = { residential: false, condo: false, commercial: false, vacant: false };
// Active category filter per tab (null = no filter)
let activeFilter = { residential: null, condo: null, commercial: null, vacant: null };
// Track selected parcel per tab for persistent highlight
let selectedParcelId = { residential: null, condo: null, commercial: null, vacant: null };
// Map initialized flags for lazy init
let mapInitialized = { residential: true, condo: false, commercial: false, vacant: false };

const scatterAxes = {
  residential: { x: 'sqft', y: 'assessed2022' },
  condo:       { x: 'sqft', y: 'assessed2022' },
  commercial:  { x: 'sqft', y: 'assessed2022' },
  vacant:      { x: 'acreage', y: 'assessed2022' },
};

const STAT_PREFIX = {
  residential: 'res', condo: 'condo', commercial: 'commercial', vacant: 'vacant'
};

const COLORS = {
  residential: '#EE7733', condo: '#0077BB', commercial: '#33BBEE', vacant: '#009988'
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
const YEAR_RAMP    = ['#ffffcc','#a1dab4','#41b6c4','#2c7fb8','#253494'];
const ACREAGE_RAMP = ['#edf8fb','#b3cde3','#8c96c6','#8856a7','#810f7c'];

const PCT_CHANGE_RAMP = ['#648FFF','#785EF0','#DC267F','#FE6100','#FFB000'];

const SYMBOLIZATION_OPTIONS = [
  { value:'Zone',                    type:'categorical', colors:ZONE_COLORS },
  { value:'Property Type',           type:'categorical', colors:PROP_TYPE_COLORS },
  { value:'Assessed Total',          type:'continuous',  colorRamp:VALUE_RAMP },
  { value:'Pre Year Assessed Total', type:'continuous',  colorRamp:VALUE_RAMP },
  { value:'Pct Change 2020-2022',    type:'pct_change',  colorRamp:PCT_CHANGE_RAMP },
  { value:'Effective Year Built',    type:'continuous',  colorRamp:YEAR_RAMP },
  { value:'Neighborhood',            type:'categorical' },
  { value:'Style Description',       type:'categorical' },
  { value:'State Use Description',   type:'categorical' },
  { value:'Land Acres',              type:'continuous',  colorRamp:ACREAGE_RAMP },
];

const mapSymbolization = { residential:'Zone', condo:'Zone', commercial:'Zone', vacant:'Zone' };
// Per-type color cache for dynamic categorical fields (Neighborhood, Style Description, etc.)
// Keyed as `type:field` → colors object. Keeps palette assignments stable per type.
const categoricalColorCache = {};
// Stores the last resolved opt object per type for use by the scatter legend
const mapSymbolizationOpt = { residential:null, condo:null, commercial:null, vacant:null };

const AXIS_LABELS = {
  sqft:'Living Area (sf)', acreage:'Acreage (ac)', yearBuilt:'Effective Year Built',
  assessed2020:'2020 Assessment', assessed2022:'2022 Assessment'
};

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a,b) => a-b);
  const idx = (p/100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

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
    // Only initialize the residential map eagerly; others are lazy-initialized on first tab visit
    residentialMap = new maplibregl.Map({ ...mapConfig, container:'residentialMap' });
    await new Promise(r => residentialMap.once('load', r));
    addMapLayers(residentialMap, sourceLayerName);
    attachMapHandlers(residentialMap, 'residential', sourceLayerName);

    // Store for lazy init of other maps
    _mapConfig = { ...mapConfig };
    _sourceLayerName = sourceLayerName;

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
    paint:{
      'fill-color': colorExpr('Zone', SYMBOLIZATION_OPTIONS.find(o => o.value==='Zone')),
      'fill-opacity': ['case', ['boolean',['feature-state','hover'],false], 0.9, 0.7]
    }
  });
  map.addLayer({ id:'parcels-outline', type:'line', source:'parcels', 'source-layer':sourceLayer,
    paint:{
      'line-color': ['case', ['boolean',['feature-state','selected'],false], '#FFD700',
                    ['case', ['boolean',['feature-state','hover'],false], '#fff', '#fff']],
      'line-width':  ['case', ['boolean',['feature-state','selected'],false], 3, 1],
      'line-opacity':['case', ['boolean',['feature-state','selected'],false], 1.0, 0.4]
    }
  });
}

function attachMapHandlers(map, type, sourceLayer) {
  let hoveredId = null;
  const hoverPopup = new maplibregl.Popup({ closeButton:false, closeOnClick:false, className:'map-hover-popup' });

  map.on('mousemove','parcels-fill', e => {
    if (!e.features.length) return;
    map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    const fid = f.id;
    if (hoveredId !== null && hoveredId !== fid) {
      map.setFeatureState({ source:'parcels', sourceLayer, id:hoveredId }, { hover:false });
    }
    hoveredId = fid;
    if (hoveredId !== null) map.setFeatureState({ source:'parcels', sourceLayer, id:hoveredId }, { hover:true });
    const p = f.properties;
    const fmt = v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${Math.round(v/1e3)}K`:`$${Math.round(v)}`;
    const val = parseFloat(p['Assessed Total'])||0;
    hoverPopup.setLngLat(e.lngLat)
      .setHTML(`<div class="map-popup"><strong>${p['Property Address']||'Unknown'}</strong><br><span>${p['Neighborhood']||''} · ${p['Zone']||''}</span><br><span class="popup-val">${fmt(val)}</span></div>`)
      .addTo(map);
  });

  map.on('mouseleave','parcels-fill', () => {
    map.getCanvas().style.cursor = '';
    if (hoveredId !== null) map.setFeatureState({ source:'parcels', sourceLayer, id:hoveredId }, { hover:false });
    hoveredId = null;
    hoverPopup.remove();
  });

  map.on('click','parcels-fill', e => {
    const props = e.features[0].properties;
    const pid = props['Parcel ID'] || '';
    showParcelDetail(props, type);
    setSelectedParcelHighlight(map, sourceLayer, pid, type);
    selectedParcelId[type] = pid;
  });

}

function setSelectedParcelHighlight(map, sourceLayer, parcelId, type) {
  // Clear old selected state via feature-state (need parcel feature id)
  // We use a GeoJSON overlay layer instead since pmtiles feature IDs may not be stable
  if (map.getLayer('parcel-selected')) map.removeLayer('parcel-selected');
  if (map.getSource('parcel-selected')) map.removeSource('parcel-selected');
  if (!parcelId) return;
  const features = map.querySourceFeatures('parcels',{ sourceLayer, filter:['==',['get','Parcel ID'],parcelId] });
  if (!features.length) return;
  map.addSource('parcel-selected',{ type:'geojson', data:{ type:'Feature', geometry:features[0].geometry, properties:{} }});
  map.addLayer({ id:'parcel-selected', type:'line', source:'parcel-selected',
    paint:{ 'line-color':'#FFD700', 'line-width':3, 'line-opacity':1 }});
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
    if      (pt === 'Residential' || pt.includes('Residential'))               buckets.residential.push(f.properties);
    else if (pt === 'Condo' || pt === 'Condominium')                            buckets.condo.push(f.properties);
    else if (pt === 'Commercial')                                                buckets.commercial.push(f.properties);
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
      // 'style' is the canonical key for Style Description
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
      frame:       p['Frame Type'] || 'Unknown',
    }));
    parcelData[type] = parcels;
    dataCollected[type] = true;
    const total2022 = parcels.reduce((s,p) => s + p.assessed2022, 0);
    const total2020 = parcels.reduce((s,p) => s + p.assessed2020, 0);
    const vals2022 = parcels.map(p=>p.assessed2022).filter(v=>v>0).sort((a,b)=>a-b);
    const mid = Math.floor(vals2022.length/2);
    const median2022 = vals2022.length ? (vals2022.length%2===0 ? (vals2022[mid-1]+vals2022[mid])/2 : vals2022[mid]) : 0;
    statsData[type] = { count:parcels.length, total2022, total2020, median2022 };
    updateStatsUI(type);
  });

  setTimeout(() => {
    // Initialize mapSymbolizationOpt for each loaded type with default Zone symbolization
    Object.keys(dataCollected).forEach(t => {
      if (dataCollected[t]) {
        const zoneOpt = SYMBOLIZATION_OPTIONS.find(o => o.value === 'Zone');
        if (zoneOpt) mapSymbolizationOpt[t] = { ...zoneOpt };
      }
    });
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
  // Median value
  if (s.median2022 !== undefined) setText(p+'-median', fmt(s.median2022));
  const deltaEl = document.getElementById(p+'-delta');
  if (deltaEl && pct !== null) {
    deltaEl.textContent = `${up?'▲':'▼'} ${Math.abs(pct)}% vs 2020`;
    deltaEl.className = 'stat-delta ' + (up ? 'up' : 'down');
  }
  // Update tab dot indicator
  const tabEl = document.querySelector(`.nav-tab[data-tab="${type}"]`);
  if (tabEl) tabEl.classList.add('data-ready');
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
  // Scroll detail panel into view and briefly flash it
  setTimeout(() => {
    el.scrollIntoView({ behavior:'smooth', block:'nearest' });
    el.classList.add('detail-flash');
    setTimeout(() => el.classList.remove('detail-flash'), 600);
  }, 50);
}

function colorExpr(field, opt, type) {
  if (!opt) return '#94a3b8';
  if (opt.type === 'categorical' && opt.colors) {
    const cases = [];
    // Keys in our color map are always strings. Tile properties may be numeric (e.g. neighborhood codes),
    // so coerce the feature property to string before matching.
    Object.entries(opt.colors).forEach(([val,color]) => { if (val!=='default') cases.push(val,color); });
    return ['match', ['to-string', ['get', field]], ...cases, opt.colors.default||'#94a3b8'];
  }
  if (opt.type === 'pct_change' && opt.colorRamp) {
    const ramp = opt.colorRamp;
    // Compute quantile breakpoints from actual pct-change distribution
    let thresholds = [-15, -8, -2, 2, 8, 15]; // fallback
    if (type && parcelData[type]?.length) {
      const parcels = parcelData[type];
      const pctVals = parcels
        .map(p => p.assessed2020 > 0 ? (p.assessed2022 - p.assessed2020) / p.assessed2020 * 100 : null)
        .filter(v => v !== null)
        .sort((a, b) => a - b);
      if (pctVals.length >= ramp.length) {
        const n = ramp.length;
        const raw = [];
        for (let i = 1; i < n; i++) {
          const idx = Math.floor(i / n * pctVals.length);
          raw.push(Math.round(pctVals[idx] * 10) / 10);
        }
        // Enforce strictly ascending (step expression requires it)
        thresholds = [];
        let prev = -Infinity;
        for (const t of raw) {
          const v = t > prev ? t : prev + 0.1;
          thresholds.push(Math.round(v * 10) / 10);
          prev = thresholds[thresholds.length - 1];
        }
      }
      console.log(`[PctChange] type=${type} parcels=${parcels.length} valid=${pctVals.length} thresholds=`, thresholds);
    }
    opt._thresholds = thresholds;
    opt._isPctChange = true;
    // MapLibre expression: compute (assessed2022 - assessed2020) / assessed2020 * 100
    // Only color parcels where Pre Year Assessed Total > 0; others go gray
    const a22Expr = ['to-number', ['coalesce', ['get', 'Assessed Total'], 0]];
    const a20Expr = ['to-number', ['coalesce', ['get', 'Pre Year Assessed Total'], 0]];
    const pctExpr = ['*', 100, ['/', ['-', a22Expr, a20Expr], a20Expr]];
    const stepArgs = [ramp[0]];
    thresholds.forEach((t, i) => { stepArgs.push(t, ramp[i + 1] || ramp[ramp.length - 1]); });
    const stepExpr = ['step', pctExpr, ...stepArgs];
    // Guard: if a20 == 0, return gray; otherwise use the step color
    return ['case', ['>', a20Expr, 0], stepExpr, '#cccccc'];
  }
  if (opt.type === 'continuous' && opt.colorRamp) {
    const ramp = opt.colorRamp;
    // Compute quantile breakpoints so each bin contains ~equal parcel count
    const quantileBreaks = (vals, n) => {
      const s = vals.slice().sort((a,b)=>a-b);
      const breaks = [];
      for (let i = 1; i < n; i++) breaks.push(s[Math.floor(i/n * s.length)]);
      return breaks; // n-1 thresholds → n bins
    };
    let thresholds = [];
    if (type && parcelData[type]?.length) {
      const parcels = parcelData[type];
      if (field.includes('Year Built')) {
        const years = parcels.map(p=>p.yearBuilt).filter(y=>y>0);
        thresholds = years.length ? quantileBreaks(years, ramp.length) : [1930,1950,1970,1990,2010];
      } else if (field==='Land Acres') {
        const acres = parcels.map(p=>p.acreage).filter(a=>a>0);
        thresholds = acres.length ? quantileBreaks(acres, ramp.length) : [0.1,0.25,0.5,1,2];
      } else {
        const isPreYear = field === 'Pre Year Assessed Total';
        const vals = parcels.map(p => isPreYear ? p.assessed2020 : p.assessed2022).filter(v=>v>0);
        thresholds = vals.length ? quantileBreaks(vals, ramp.length) : [100000,250000,400000,600000,1000000];
      }
    } else {
      if (field.includes('Year Built')) thresholds=[1930,1950,1970,1990,2010];
      else if (field==='Land Acres') thresholds=[0.1,0.25,0.5,1,2];
      else thresholds=[100000,250000,400000,600000,1000000];
    }
    // Store on opt so buildLegend can read them without recomputing
    opt._thresholds = thresholds;
    opt._field = field;
    // MapLibre 'step': ['step', input, color_for_< t0, t0, color_for_>= t0, t1, color_for_>= t1, ...]
    const stepArgs = [ramp[0]];
    thresholds.forEach((t, i) => { stepArgs.push(Math.round(t), ramp[i+1] || ramp[ramp.length-1]); });
    return ['step', ['to-number', ['coalesce',['get',field],0]], ...stepArgs];
  }
  return '#94a3b8';
}

window.changeMapSymbolization = function(map, type, field) {
  mapSymbolization[type] = field;
  // Work with a shallow copy so we never mutate the shared SYMBOLIZATION_OPTIONS entry
  let baseOpt = SYMBOLIZATION_OPTIONS.find(o => o.value === field);
  let opt = baseOpt ? { ...baseOpt } : { value: field, type: 'categorical' };
  if (opt.type === 'categorical') {
    const cacheKey = type + ':' + field;
    if (!categoricalColorCache[cacheKey]) {
      // Build fresh color map from this type's actual tile property values
      categoricalColorCache[cacheKey] = generateCategoricalColors(getUniqueValuesForField(type, field));
    }
    // Always use per-type cache; pre-built colors (Zone, Property Type) take precedence
    if (!opt.colors) opt.colors = categoricalColorCache[cacheKey];
  }
  if (map && map.getLayer('parcels-fill')) map.setPaintProperty('parcels-fill','fill-color',colorExpr(field,opt,type));
  buildLegend(field, opt, type);
  // Link: if symbolization field matches an Aggregate By option, switch the bar chart too
  const barSelectId = `${type === 'residential' ? 'res' : type}-bar-field`;
  const barSel = document.getElementById(barSelectId);
  if (barSel) {
    const symToBar = { 'Neighborhood':'neighborhood', 'Style Description':'style', 'Zone':'zone', 'State Use Description':'stateUse' };
    const barKey = symToBar[field];
    if (barKey && Array.from(barSel.options).some(o => o.value === barKey)) {
      barSel.value = barKey;
      updateRightBarChart(type, barKey);
    }
  }
  // Re-render scatter so dot colors reflect the new symbolization
  if (type === activeTab) updateScatter(type);
  // Expose opt on the symbolization state so scatter legend can read colors
  mapSymbolizationOpt[type] = opt;
  // Re-render beeswarms so dot colors stay in sync
  if (type === 'residential' || type === 'condo') {
    const parcels = parcelData[type];
    if (parcels?.length) {
      if (type === 'residential') {
        if (activeBeeswarm.residential === 'style') updateResBeeswarm(parcels);
        else updateResBedroomBeeswarm(parcels);
      } else {
        if (activeBeeswarm.condo === 'style') updateCondoBeeswarm(parcels);
        else updateCondoBedroomBeeswarm(parcels);
      }
    }
  }
};

function getUniqueValuesForField(type, field) {
  // Primary source: parcel data objects (complete dataset, type-filtered)
  // We use these as the canonical value set for color assignment.
  // The match expression in colorExpr uses the raw tile property name (field),
  // so values from parcel data must equal the tile property values exactly.
  // The tile property names map directly to parcel data like so:
  const fieldMap = { 'Neighborhood':'neighborhood', 'Style Description':'style', 'State Use Description':'stateUse', 'Zone':'zone', 'Property Type':'type', 'Frame Type':'frame' };
  const dataField = fieldMap[field] || field;
  const parcels = parcelData[type] || [];
  const values = new Set();
  parcels.forEach(p => {
    const v = p[dataField];
    if (v && v !== 'Unknown' && v !== '') values.add(String(v));
  });
  // Also pull from tile features in viewport — supplements with exact-casing from tiles
  // in case parcel data strings differ subtly from tile property strings
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map = maps[type];
  if (map && map.getSource('parcels')) {
    const features = map.querySourceFeatures('parcels', { sourceLayer: _sourceLayerName });
    features.forEach(f => {
      const v = f.properties[field];
      if (v && v !== 'Unknown' && v !== '') values.add(String(v));
    });
  }
  return Array.from(values).sort();
}

function generateCategoricalColors(values) {
  const colors = {};
  values.forEach((val, i) => {
    if (i < CATEGORICAL_PALETTE.length) {
      colors[val] = CATEGORICAL_PALETTE[i];
    } else {
      // Generate additional distinct colors via golden-ratio hue spacing
      const hue = Math.round((i * 137.508) % 360);
      const sat = 55 + (i % 3) * 12;
      const lit = 42 + (i % 2) * 10;
      colors[val] = `hsl(${hue},${sat}%,${lit}%)`;
    }
  });
  colors['default'] = '#BBBBBB';
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
    const parcels  = parcelData[type]||[];
    const fieldMap = {'Neighborhood':'neighborhood','Style Description':'style','State Use Description':'stateUse','Zone':'zone','Property Type':'type'};
    const dataField= fieldMap[field]||field;
    const counts={};
    parcels.forEach(p=>{ const v=p[dataField]; if(v&&v!=='Unknown') counts[String(v)]=(counts[String(v)]||0)+1; });
    const sorted = entries.map(([val,color])=>({val,color,count:counts[val]||0})).sort((a,b)=>b.count-a.count);
    sorted.forEach(({val,color,count})=>{
      const item=document.createElement('div'); item.className='legend-item';
      item.innerHTML=`<div class="legend-swatch" style="background:${color}"></div><span>${val}</span>`;
      el.appendChild(item);
    });
  } else if (opt.type === 'pct_change') {
    const ramp = opt.colorRamp || PCT_CHANGE_RAMP;
    const thresholds = opt._thresholds || [-15, -8, -2, 2, 8, 15];
    const edges = [-Infinity, ...thresholds, Infinity];
    const fmtP = v => v >= 0 ? `+${v}%` : `${v}%`;
    ramp.forEach((color, i) => {
      const lo = edges[i];
      const hi = edges[i + 1];
      let label;
      if (lo === -Infinity) label = `< ${fmtP(thresholds[0])}`;
      else if (hi === Infinity) label = `> ${fmtP(thresholds[thresholds.length - 1])}`;
      else label = `${fmtP(lo)} – ${fmtP(hi)}`;
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><span>${label}</span>`;
      el.appendChild(item);
    });
  } else if (opt.type === 'continuous') {
    const ramp = opt.colorRamp || VALUE_RAMP;
    const thresholds = opt._thresholds || [];
    const parcels = parcelData[type] || [];
    const isYear   = opt.value && opt.value.includes('Year Built');
    const isAcres  = opt.value === 'Land Acres';
    const isPreYear = opt.value === 'Pre Year Assessed Total';
    // Format a threshold value for display
    const fmtThresh = v => {
      if (isYear)  return Math.round(v).toString();
      if (isAcres) return v < 1 ? v.toFixed(2)+' ac' : v.toFixed(1)+' ac';
      return v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${Math.round(v/1e3)}K` : `$${Math.round(v)}`;
    };
    // Build min/max from parcel data for first/last bin labels
    let dataMin = 0, dataMax = 0;
    if (isYear) {
      const years = parcels.map(p=>p.yearBuilt).filter(y=>y>0);
      dataMin = years.length ? Math.min(...years) : 1900;
      dataMax = years.length ? Math.max(...years) : 2024;
    } else if (isAcres) {
      const acres = parcels.map(p=>p.acreage).filter(a=>a>0);
      dataMin = 0;
      dataMax = acres.length ? Math.max(...acres) : 5;
    } else {
      const vals = parcels.map(p => isPreYear ? p.assessed2020 : p.assessed2022).filter(v=>v>0);
      dataMin = vals.length ? Math.min(...vals) : 0;
      dataMax = vals.length ? Math.max(...vals) : 2000000;
    }
    // Build bin edges: [dataMin, t0, t1, ..., dataMax]
    const edges = [dataMin, ...thresholds, dataMax];
    // Render one swatch row per bin
    ramp.forEach((color, i) => {
      const lo = edges[i] !== undefined ? edges[i] : 0;
      const hi = edges[i+1] !== undefined ? edges[i+1] : dataMax;
      const rangeLabel = i === ramp.length - 1
        ? `${fmtThresh(lo)}+`
        : `${fmtThresh(lo)} – ${fmtThresh(hi)}`;
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><span>${rangeLabel}</span>`;
      el.appendChild(item);
    });
  }
}

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
  searchInput.setAttribute('role','combobox');
  searchInput.setAttribute('aria-autocomplete','list');
  searchResults.setAttribute('role','listbox');
  // Keyboard nav: ↑↓ move, Enter selects, Escape dismisses
  searchInput.addEventListener('keydown', e => {
    const items = Array.from(searchResults.querySelectorAll('.search-result-item'));
    const focused = searchResults.querySelector('.search-result-item.kb-focus');
    const idx = focused ? items.indexOf(focused) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (focused) focused.classList.remove('kb-focus');
      const next = items[Math.min(idx+1, items.length-1)];
      if (next) { next.classList.add('kb-focus'); next.scrollIntoView({block:'nearest'}); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (focused) focused.classList.remove('kb-focus');
      const prev = items[Math.max(idx-1, 0)];
      if (prev) { prev.classList.add('kb-focus'); prev.scrollIntoView({block:'nearest'}); }
    } else if (e.key === 'Enter') {
      const target = focused || items[0];
      if (target) { target.click(); }
    } else if (e.key === 'Escape') {
      searchResults.classList.remove('show');
      searchInput.blur();
    }
  });
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
    'Frame Type':parcel.frame,
    'Effective Year Built':parcel.yearBuilt,'Gross Area of Primary Building':parcel.sqft,
    'Land Acres':parcel.acreage,'Number of Bedroom':parcel.bedrooms,'Number of Bathrooms':parcel.bathrooms,
    'Assessed Total':parcel.assessed2022,'Pre Year Assessed Total':parcel.assessed2020
  }, type);
  highlightParcelOnMap(parcelId, type);
}

function highlightParcelOnMap(parcelId, type) {
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const sourceLayerName = 'parcels';
  const map  = maps[type];
  if (!map) return;
  setSelectedParcelHighlight(map, sourceLayerName, parcelId, type);
  selectedParcelId[type] = parcelId;
  const features = map.querySourceFeatures('parcels',{ sourceLayer:sourceLayerName, filter:['==',['get','Parcel ID'],parcelId] });
  if (!features.length) return;
  map.fitBounds(getBBox(features[0].geometry),{ padding:100, duration:1000 });
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

// sourceLayerName captured at module scope for lazy init
let _sourceLayerName = 'parcels';
let _mapConfig = null;

async function lazyInitMap(type) {
  if (mapInitialized[type]) return;
  mapInitialized[type] = true;
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const containers = { condo:'condoMap', commercial:'commercialMap', vacant:'vacantMap' };
  if (!_mapConfig) return;
  const map = new maplibregl.Map({ ..._mapConfig, container:containers[type] });
  await new Promise(r => map.once('load', r));
  if (type === 'condo')      condoMap      = map;
  if (type === 'commercial') commercialMap = map;
  if (type === 'vacant')     vacantMap     = map;
  addMapLayers(map, _sourceLayerName);
  attachMapHandlers(map, type, _sourceLayerName);
  // Re-apply symbolization if already set — this also populates mapSymbolizationOpt[type]
  window.changeMapSymbolization(map, type, mapSymbolization[type]||'Zone');
  map.resize();
}

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
    // Restore selected parcel highlight
    if (selectedParcelId[tab] && maps[tab]) {
      setSelectedParcelHighlight(maps[tab], _sourceLayerName, selectedParcelId[tab], tab);
    }
    // Update filter chip
    renderFilterChip(tab);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════════════════

function updateChartsForType(type) {
  const parcels = parcelData[type];
  if (!parcels?.length) return;
  setTimeout(() => {
    // Residential left panel: only render the currently active beeswarm
    if (type === 'residential') {
      if (activeBeeswarm.residential === 'style') updateResBeeswarm(parcels);
      else updateResBedroomBeeswarm(parcels);
    }
    // Condo left panel: only render the currently active beeswarm
    if (type === 'condo') {
      if (activeBeeswarm.condo === 'style') updateCondoBeeswarm(parcels);
      else updateCondoBedroomBeeswarm(parcels);
    }
    // Commercial left panel: zone bar chart
    if (type === 'commercial') updateCommercialZoneChart(parcels);
    // Right panel: read current dropdown and render
    const selectId = `${type === 'residential' ? 'res' : type}-bar-field`;
    const sel = document.getElementById(selectId);
    const field = sel ? sel.value : Object.keys(RIGHT_BAR_FIELDS[type])[0];
    updateRightBarChart(type, field);
    if (type === activeTab) updateScatter(type);
    else scatterPending[type] = true;
  }, 100);
}

// Beeswarm toggle handlers
const activeBeeswarm = { residential: 'style', condo: 'style' };

window.switchResBeeswarm = function(mode, btn) {
  activeBeeswarm.residential = mode;
  btn.parentElement.querySelectorAll('.scatter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const labelEl = document.getElementById('res-beeswarm-label');
  if (labelEl) labelEl.textContent = mode === 'style' ? 'by Style' : 'by Bedrooms';
  const styleDiv   = document.getElementById('resBeeswarm');
  const bedroomDiv = document.getElementById('resBeeswarmBedroom');
  if (styleDiv)   styleDiv.style.display   = mode === 'style'    ? '' : 'none';
  if (bedroomDiv) bedroomDiv.style.display = mode === 'bedrooms' ? '' : 'none';
  // Render on demand — if container has no SVG yet, call the update function directly
  const parcels = parcelData['residential'];
  if (parcels?.length) {
    if (mode === 'style') { if (!styleDiv?.querySelector('svg')) updateResBeeswarm(parcels); else styleDiv._renderFn?.(); }
    else { if (!bedroomDiv?.querySelector('svg')) updateResBedroomBeeswarm(parcels); else bedroomDiv._renderFn?.(); }
  }
};

window.switchCondoBeeswarm = function(mode, btn) {
  activeBeeswarm.condo = mode;
  btn.parentElement.querySelectorAll('.scatter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const labelEl = document.getElementById('condo-beeswarm-label');
  if (labelEl) labelEl.textContent = mode === 'style' ? 'by Style' : 'by Bedrooms';
  const styleDiv   = document.getElementById('condoBeeswarm');
  const bedroomDiv = document.getElementById('condoBeeswarmBedroom');
  if (styleDiv)   styleDiv.style.display   = mode === 'style'    ? '' : 'none';
  if (bedroomDiv) bedroomDiv.style.display = mode === 'bedrooms' ? '' : 'none';
  const cparcels = parcelData['condo'];
  if (cparcels?.length) {
    if (mode === 'style') { if (!styleDiv?.querySelector('svg')) updateCondoBeeswarm(cparcels); else styleDiv._renderFn?.(); }
    else { if (!bedroomDiv?.querySelector('svg')) updateCondoBedroomBeeswarm(cparcels); else bedroomDiv._renderFn?.(); }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// BEESWARM — residential left panel
// Each dot = one parcel. Groups by architectural style along Y.
// X axis = 2022 assessed value. Dots jitter vertically within their band
// using d3.forceSimulation to avoid overlap.
// ═══════════════════════════════════════════════════════════════════════════
function updateResBeeswarm(parcels) {
  const container = document.getElementById('resBeeswarm');
  if (!container) return;
  const MAX_GROUPS = 10;
  const counts = {};
  parcels.forEach(p => { if (p.style && p.style !== 'Unknown' && p.assessed2022 > 0) counts[p.style] = (counts[p.style]||0) + 1; });
  const topStyles = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, MAX_GROUPS).map(([s]) => s);
  const filtered = parcels.filter(p => topStyles.includes(p.style) && p.assessed2022 > 0);
  const step = Math.max(1, Math.ceil(filtered.length / 600));
  const sample = filtered.filter((_,i) => i % step === 0);
  if (!sample.length) return;
  const _beeOpt_res = mapSymbolizationOpt['residential'];
  const _beeColorFn_res = buildBeeswarmColorFn(_beeOpt_res, 'residential');
  watchAndRender(container, () => renderBeeswarmInto(container, sample, topStyles, COLORS.residential, 'style', _beeColorFn_res));
}
function updateResBedroomBeeswarm(parcels) {
  const container = document.getElementById('resBeeswarmBedroom');
  if (!container) return;
  const MAX_GROUPS = 10;
  const counts = {};
  parcels.forEach(p => { if (p.bedrooms > 0 && p.assessed2022 > 0) counts[p.bedrooms] = (counts[p.bedrooms]||0) + 1; });
  const topBeds = Object.entries(counts).sort((a,b) => parseInt(a[0])-parseInt(b[0])).slice(0, MAX_GROUPS).map(([s]) => parseInt(s));
  const filtered = parcels.filter(p => topBeds.includes(p.bedrooms) && p.assessed2022 > 0);
  const step = Math.max(1, Math.ceil(filtered.length / 600));
  const sample = filtered.filter((_,i) => i % step === 0);
  if (!sample.length) return;
  const _beeOpt_resBed = mapSymbolizationOpt['residential'];
  const _beeColorFn_resBed = buildBeeswarmColorFn(_beeOpt_resBed, 'residential');
  watchAndRender(container, () => renderBeeswarmInto(container, sample, topBeds, COLORS.residential, 'bedrooms', _beeColorFn_resBed));
}
function updateCondoBeeswarm(parcels) {
  const container = document.getElementById('condoBeeswarm');
  if (!container) return;
  const MAX_GROUPS = 10;
  const counts = {};
  parcels.forEach(p => { if (p.style && p.style !== 'Unknown' && p.assessed2022 > 0) counts[p.style] = (counts[p.style]||0) + 1; });
  const topStyles = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, MAX_GROUPS).map(([s]) => s);
  const filtered = parcels.filter(p => topStyles.includes(p.style) && p.assessed2022 > 0);
  const step = Math.max(1, Math.ceil(filtered.length / 600));
  const sample = filtered.filter((_,i) => i % step === 0);
  if (!sample.length) return;
  const _beeOpt_condo = mapSymbolizationOpt['condo'];
  const _beeColorFn_condo = buildBeeswarmColorFn(_beeOpt_condo, 'condo');
  watchAndRender(container, () => renderBeeswarmInto(container, sample, topStyles, COLORS.condo, 'style', _beeColorFn_condo));
}
function updateCondoBedroomBeeswarm(parcels) {
  const container = document.getElementById('condoBeeswarmBedroom');
  if (!container) return;
  const MAX_GROUPS = 10;
  const counts = {};
  parcels.forEach(p => { if (p.bedrooms > 0 && p.assessed2022 > 0) counts[p.bedrooms] = (counts[p.bedrooms]||0) + 1; });
  const topBeds = Object.entries(counts).sort((a,b) => parseInt(a[0])-parseInt(b[0])).slice(0, MAX_GROUPS).map(([s]) => parseInt(s));
  const filtered = parcels.filter(p => topBeds.includes(p.bedrooms) && p.assessed2022 > 0);
  const step = Math.max(1, Math.ceil(filtered.length / 600));
  const sample = filtered.filter((_,i) => i % step === 0);
  if (!sample.length) return;
  const _beeOpt_condoBed = mapSymbolizationOpt['condo'];
  const _beeColorFn_condoBed = buildBeeswarmColorFn(_beeOpt_condoBed, 'condo');
  watchAndRender(container, () => renderBeeswarmInto(container, sample, topBeds, COLORS.condo, 'bedrooms', _beeColorFn_condoBed));
}

function buildBeeswarmColorFn(symOpt, type) {
  if (!symOpt) return null;
  // Categorical
  if (symOpt.type === 'categorical' && symOpt.colors) {
    const fieldMap = { 'Zone':'zone', 'Property Type':'propertyType', 'Neighborhood':'neighborhood',
      'Style Description':'style', 'State Use Description':'stateUse' };
    const df = fieldMap[symOpt.value];
    if (!df) return null;
    return d => {
      const key = d[df];
      return (key && symOpt.colors[key]) ? symOpt.colors[key] : (symOpt.colors['default'] || COLORS[type]);
    };
  }
  // Continuous
  if (symOpt.type === 'continuous' && symOpt.colorRamp && symOpt._thresholds?.length) {
    const contFieldMap = { 'Assessed Total':'assessed2022', 'Pre Year Assessed Total':'assessed2020',
      'Effective Year Built':'yearBuilt', 'Land Acres':'acreage' };
    const df = contFieldMap[symOpt.value];
    if (!df) return null;
    const scale = d3.scaleThreshold().domain(symOpt._thresholds).range(symOpt.colorRamp);
    return d => { const v = d[df]; return (v > 0) ? scale(v) : '#ccc'; };
  }
  // Pct change
  if (symOpt.type === 'pct_change' && symOpt.colorRamp && symOpt._thresholds?.length) {
    const scale = d3.scaleThreshold().domain(symOpt._thresholds).range(symOpt.colorRamp);
    return d => {
      if (d.assessed2020 > 0) return scale((d.assessed2022 - d.assessed2020) / d.assessed2020 * 100);
      return '#ccc';
    };
  }
  return null;
}

function renderBeeswarmInto(container, data, categories, color, groupKey, colorFn) {
  groupKey = groupKey || 'style';
  d3.select(container).selectAll('*').remove();
  const width  = container.clientWidth  || 340;
  const height = container.clientHeight || 340;
  const fs = Math.max(8, Math.min(11, width / 32));
  const labelW = Math.min(width * 0.38, fs * 13);
  const margin = { top: 10, right: 12, bottom: Math.round(fs * 4.5), left: labelW };
  const iW = Math.max(width  - margin.left - margin.right,  40);
  const iH = Math.max(height - margin.top  - margin.bottom, 40);

  // Clip to 97th pct to suppress extreme outliers
  const vals = data.map(d => d.assessed2022);
  const xMax = percentile(vals, 97) * 1.05;

  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, iW]);
  const yScale = d3.scaleBand().domain(categories).range([0, iH]).padding(0.3);

  const fmtX = v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v/1e3)}K` : `$${Math.round(v)}`;
  const xAxis = d3.axisBottom(xScale).ticks(Math.max(3, Math.floor(iW/55))).tickFormat(fmtX);

  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Subtle band backgrounds
  categories.forEach((cat, i) => {
    g.append('rect')
      .attr('x', 0).attr('y', yScale(cat))
      .attr('width', iW).attr('height', yScale.bandwidth())
      .attr('fill', i % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent');
  });

  // X axis
  const xAxisG = g.append('g').attr('class','axis').attr('transform',`translate(0,${iH})`).call(xAxis);
  xAxisG.selectAll('text').style('font-size', fs+'px');

  // Y axis — category labels
  categories.forEach(cat => {
    const y = yScale(cat) + yScale.bandwidth() / 2;
    const maxChars = Math.floor(labelW / (fs * 0.58));
    const label = String(cat).length > maxChars ? String(cat).slice(0, maxChars - 1) + '…' : String(cat);
    g.append('text')
      .attr('x', -6).attr('y', y).attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .style('font-size', fs + 'px')
      .style('fill', '#5a5a7a')
      .text(label);
  });

  // Median tick per category
  const bandwidth = yScale.bandwidth();
  const dotR = Math.max(2, Math.min(3.5, bandwidth / 7));

  // Prepare node positions: start x at scale, y at band center
  const nodes = data.map(d => ({
    ...d,
    _x: Math.min(d.assessed2022, xMax),
    _ty: yScale(d[groupKey]) + bandwidth / 2,
  }));

  // Use force simulation to jitter Y within band, keeping X fixed
  const halfBand = bandwidth / 2 - dotR - 1;
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => xScale(d._x)).strength(1))
    .force('y', d3.forceY(d => d._ty).strength(0.8))
    .force('collide', d3.forceCollide(dotR + 0.5))
    .stop();

  // Run simulation ticks synchronously (no animation needed)
  for (let i = 0; i < 120; i++) sim.tick();

  // Clamp y to stay within band
  nodes.forEach(d => {
    d.y = Math.max(d._ty - halfBand, Math.min(d._ty + halfBand, d.y));
  });

  // Draw mean line per category
  categories.forEach(cat => {
    const catVals = data.filter(d => String(d[groupKey]) === String(cat)).map(d => d.assessed2022);
    if (!catVals.length) return;
    const mean = catVals.reduce((a,b) => a+b, 0) / catVals.length;
    const mx = xScale(Math.min(mean, xMax));
    const by = yScale(cat);
    g.append('line')
      .attr('x1', mx).attr('x2', mx)
      .attr('y1', by + 2).attr('y2', by + bandwidth - 2)
      .attr('stroke', '#1a1a2e').attr('stroke-width', 1.5).attr('stroke-opacity', 0.5)
      .attr('stroke-dasharray', '3,2');
  });

  // Draw dots with neighborhood color if available
  const useNeighborhoodColor = (groupKey === 'neighborhood');
  const neighborhoodValues = useNeighborhoodColor ? [...new Set(data.map(d => d.neighborhood).filter(Boolean))] : [];
  const neighborhoodColorMap = {};
  neighborhoodValues.forEach((n, i) => { neighborhoodColorMap[n] = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]; });

  g.selectAll('.bee-dot')
    .data(nodes)
    .enter().append('circle')
    .attr('class', 'bee-dot')
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('r', dotR)
    .attr('fill', d => colorFn ? colorFn(d) : (useNeighborhoodColor ? (neighborhoodColorMap[d.neighborhood] || color) : color))
    .attr('fill-opacity', 0.45)
    .attr('stroke', d => colorFn ? colorFn(d) : (useNeighborhoodColor ? (neighborhoodColorMap[d.neighborhood] || color) : color))
    .attr('stroke-width', 0.5)
    .attr('stroke-opacity', 0.6)
    .style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      d3.select(this).attr('r', dotR + 2).attr('fill-opacity', 0.9).attr('stroke-width', 1.5);
      const groupLabel = groupKey === 'bedrooms' ? `Bedrooms: ${d[groupKey]}` : `${groupKey.charAt(0).toUpperCase()+groupKey.slice(1)}: ${d[groupKey]}`;
      tooltip.style('left', (event.pageX+10)+'px').style('top', (event.pageY-10)+'px').classed('show', true)
        .html(`<strong>${d.address}</strong><br>${groupLabel}<br>Neighborhood: ${d.neighborhood}<br>2022 Value: ${fmtX(d.assessed2022)}`);
    })
    .on('mouseout', function() {
      d3.select(this).attr('r', dotR).attr('fill-opacity', 0.45).attr('stroke-width', 0.5);
      tooltip.classed('show', false);
    });

  // X axis label
  svg.append('text').attr('text-anchor','middle')
    .attr('x', margin.left + iW/2).attr('y', height - 2)
    .style('font-size', fs+'px').style('fill','#5a5a7a').style('font-weight','600')
    .text('2022 Assessment Value');

  // Legend: dashed line = mean
  svg.append('line')
    .attr('x1', margin.left).attr('x2', margin.left + 18)
    .attr('y1', height - fs * 2.2).attr('y2', height - fs * 2.2)
    .attr('stroke', '#1a1a2e').attr('stroke-width', 1.5).attr('stroke-opacity', 0.5)
    .attr('stroke-dasharray', '3,2');
  svg.append('text')
    .attr('x', margin.left + 22).attr('y', height - fs * 2.2)
    .attr('dy', '0.35em')
    .style('font-size', (fs - 1)+'px').style('fill','#5a5a7a')
    .text('mean');
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMERCIAL ZONE CHART (left panel)
// ═══════════════════════════════════════════════════════════════════════════
function updateCommercialZoneChart(parcels) {
  const container = document.getElementById('commercialClassChart');
  if (!container) return;
  const grouped = {};
  parcels.forEach(p => {
    if (!p.zone || p.zone === 'Unknown' || p.assessed2022 <= 0) return;
    if (!grouped[p.zone]) grouped[p.zone] = { sum: 0, count: 0 };
    grouped[p.zone].sum   += p.assessed2022;
    grouped[p.zone].count += 1;
  });
  const data = Object.entries(grouped).map(([label,{sum,count}]) => ({label, count, mean: sum/count})).sort((a,b) => b.mean - a.mean);
  if (!data.length) return;
  watchAndRender(container, () => renderBarInto(container, data, COLORS.commercial, 'commercial', 'zone', activeFilter['commercial']?.field === 'zone' ? activeFilter['commercial']?.value : null));
}

// ═══════════════════════════════════════════════════════════════════════════
// RIGHT PANEL BAR CHART (field-switchable via dropdown)
// ═══════════════════════════════════════════════════════════════════════════
// Maps dropdown option values → parcel data field keys
const RIGHT_BAR_FIELDS = {
  residential: { style:'Style Description', neighborhood:'Neighborhood', zone:'Zone', stateUse:'State Use', frame:'Frame Type' },
  condo:       { stateUse:'State Use', style:'Style Description', zone:'Zone', frame:'Frame Type' },
  commercial:  { stateUse:'State Use', style:'Style Description', zone:'Zone', neighborhood:'Neighborhood', frame:'Frame Type' },
  vacant:      { stateUse:'State Use', zone:'Zone', neighborhood:'Neighborhood' },
};

window.updateRightBarChart = function(type, field) {
  const containerId = `${type === 'residential' ? 'res' : type}RightBarChart`;
  const container   = document.getElementById(containerId);
  if (!container) return;
  const parcels = parcelData[type];
  if (!parcels?.length) return;
  const grouped = {};
  parcels.forEach(p => {
    const val = p[field];
    if (!val || val === 'Unknown' || p.assessed2022 <= 0) return;
    if (!grouped[val]) grouped[val] = { sum: 0, count: 0 };
    grouped[val].sum   += p.assessed2022;
    grouped[val].count += 1;
  });
  const data = Object.entries(grouped)
    .map(([label, { sum, count }]) => ({ label, count, mean: sum / count }))
    .sort((a, b) => b.mean - a.mean);
  if (!data.length) return;
  // Update heading to clarify what bars measure
  const headingId = `${type === 'residential' ? 'res' : type}-bar-heading`;
  const headEl = document.getElementById(headingId);
  if (headEl) headEl.textContent = 'Mean 2022 Assessment';
  watchAndRender(container, () => renderBarInto(container, data, COLORS[type], type, field));
};

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
  if (side==='left'  && leftPanel)  leftPanel.style.marginLeft   = state.left  ? `-${leftPanel.offsetWidth}px`  : '0';
  if (side==='right' && rightPanel) rightPanel.style.marginRight = state.right ? `-${rightPanel.offsetWidth}px` : '0';
  const btn = side==='left' ? dashboard.querySelector('.dash-left .sidebar-toggle') : dashboard.querySelector('.dash-right .sidebar-toggle');
  if (btn) {
    const label = state[side] ? (side==='left'?'›':'‹') : (side==='left'?'‹':'›');
    btn.textContent = label;
    btn.setAttribute('aria-label', state[side] ? `Expand ${side} panel` : `Collapse ${side} panel`);
  }
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
  const typeLabel = type.charAt(0).toUpperCase()+type.slice(1);
  if (btn) {
    btn.textContent = showAllParcels[type] ? 'Showing all types' : 'Filter to '+typeLabel+' only';
    btn.classList.toggle('active', showAllParcels[type]);
  }
  // If a bar filter is active, combine it with the type filter
  applyMapFilter(type);
};

// ─── Resize handles ────────────────────────────────────────────────────────
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

// ─── ResizeObserver wrapper ────────────────────────────────────────────────
function watchAndRender(container, renderFn) {
  if (!container) return;
  container._renderFn = renderFn;
  if (container._ro) container._ro.disconnect();
  const ro = new ResizeObserver(() => { if (container.clientWidth > 20 && container.clientHeight > 20) renderFn(); });
  ro.observe(container);
  container._ro = ro;
  renderFn();
}

// ─── Scatter ───────────────────────────────────────────────────────────────
function updateScatter(type) {
  const parcels = getFilteredParcels(type);
  const ax      = scatterAxes[type];
  const p       = STAT_PREFIX[type];
  const container = document.getElementById(p+'Scatter');
  if (!container || !parcels?.length) return;
  const raw    = parcels.filter(q => q[ax.x]>0 && q[ax.y]>0);
  const step   = Math.max(1, Math.ceil(raw.length/1000));
  const sample = raw.filter((_,i) => i%step===0);
  const countEl = document.getElementById(p+'-scatter-count');
  if (countEl) countEl.textContent = ` (${sample.length.toLocaleString()} sampled)`;
  watchAndRender(container, () => renderScatterInto(container, type, sample, ax));
  scatterPending[type] = false;
}

function renderScatterInto(container, type, sample, ax) {
  d3.select(container).selectAll('*').remove();
  const width  = container.clientWidth  || 300;
  const height = container.clientHeight || 260;
  const fs = Math.max(9, Math.min(13, width / 28));
  const margin = { top:12, right:12, bottom:Math.round(fs*4.2), left:Math.round(fs*5.2) };
  const iW = Math.max(width  - margin.left - margin.right,  60);
  const iH = Math.max(height - margin.top  - margin.bottom, 60);
  const isYearX = ax.x === 'yearBuilt';
  const xVals = sample.map(d=>d[ax.x]);
  const yVals = sample.map(d=>d[ax.y]);
  const xMax = isYearX ? d3.max(xVals) * 1.001 : percentile(xVals, 95) * 1.05;
  const yMax = percentile(yVals, 95) * 1.05;
  const xMin = isYearX ? d3.min(xVals) - 2 : 0;
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
  // ── Color encoding setup ──────────────────────────────────────────────────
  const symField = mapSymbolization[type];
  const symOpt   = mapSymbolizationOpt[type] || SYMBOLIZATION_OPTIONS.find(o => o.value === symField);
  // Categorical fields → color by category value
  const dotFieldMap = { 'Neighborhood':'neighborhood','Style Description':'style',
    'State Use Description':'stateUse','Zone':'zone','Property Type':'type' };
  const dataField   = dotFieldMap[symField] || null;
  const isCat       = symOpt && symOpt.type === 'categorical' && symOpt.colors && dataField;
  // Continuous fields → color by quantile bin (same bins as map)
  const isCont      = symOpt && symOpt.type === 'continuous' && symOpt.colorRamp;
  const isPctChange = symOpt && symOpt.type === 'pct_change' && symOpt.colorRamp;
  const contFieldMap = {
    'Assessed Total':'assessed2022', 'Pre Year Assessed Total':'assessed2020',
    'Effective Year Built':'yearBuilt', 'Land Acres':'acreage'
  };
  const contDataField = contFieldMap[symField] || null;
  // Build a D3 threshold scale from the same quantile breaks used for the map
  let contScale = null;
  if (isCont && contDataField && symOpt._thresholds?.length) {
    contScale = d3.scaleThreshold()
      .domain(symOpt._thresholds)
      .range(symOpt.colorRamp);
  }
  let pctScale = null;
  if (isPctChange && symOpt._thresholds?.length) {
    pctScale = d3.scaleThreshold()
      .domain(symOpt._thresholds)
      .range(symOpt.colorRamp);
  }

  function dotColor(d) {
    if (d._outlier) return '#aaa';
    if (isCat) {
      const v = d[dataField];
      const key = v !== undefined && v !== null ? String(v) : null;
      return (key && symOpt.colors[key]) ? symOpt.colors[key] : (symOpt.colors['default'] || COLORS[type]);
    }
    if (isCont && contScale && contDataField) {
      const v = d[contDataField];
      return (v !== undefined && v !== null && v > 0) ? contScale(v) : '#ccc';
    }
    if (isPctChange && pctScale) {
      if (d.assessed2020 > 0) {
        const pct = (d.assessed2022 - d.assessed2020) / d.assessed2020 * 100;
        return pctScale(pct);
      }
      return '#ccc';
    }
    return COLORS[type];
  }

  const dotR = Math.max(2,Math.min(4,width/80));

  // Clip path keeps dots inside the plot area while axes render freely outside it
  const clipId = 'scatter-clip-' + Math.random().toString(36).slice(2,7);
  svg.append('defs').append('clipPath').attr('id', clipId)
    .append('rect').attr('x',-dotR).attr('y',-dotR).attr('width',iW+dotR*2).attr('height',iH+dotR*2);

  const dots = g.append('g').attr('class','dots').attr('clip-path',`url(#${clipId})`);
  dots.selectAll('circle').data(clipped).enter().append('circle')
    .attr('class','dot').attr('cx',d=>xScale(d._cx)).attr('cy',d=>yScale(d._cy))
    .attr('r',d=>d._outlier ? dotR*0.7 : dotR)
    .attr('fill',d=>dotColor(d))
    .attr('fill-opacity',d=>d._outlier ? 0.25 : 0.5)
    .attr('stroke',d=>dotColor(d)).attr('stroke-width',1)
    .on('mouseover', function(event,d) {
      d3.select(this).attr('r',dotR+2).attr('fill-opacity',0.9).attr('stroke-width',2);
      const xVal = isYearX ? d[ax.x].toString() : ax.x.includes('assessed') ? `$${Math.round(d[ax.x]).toLocaleString()}` : Math.round(d[ax.x]).toLocaleString();
      const yVal = ax.y.includes('assessed') ? `$${Math.round(d[ax.y]).toLocaleString()}` : Math.round(d[ax.y]).toLocaleString();
      const outlierNote = d._outlier ? '<br><em style="color:#aaa">outlier — clipped to edge</em>' : '';
      let colorInfo = '';
      if (isCat && dataField && d[dataField] !== undefined) colorInfo = `<br>${symField}: ${d[dataField]}`;
      else if (isCont && contDataField && d[contDataField] > 0) {
        const fmtV = symField.includes('Year') ? d[contDataField] :
          symField.includes('Acres') ? d[contDataField].toFixed(2)+' ac' :
          '$'+Math.round(d[contDataField]).toLocaleString();
        colorInfo = `<br>${symField}: ${fmtV}`;
      }
      tooltip.style('left',(event.pageX+10)+'px').style('top',(event.pageY-10)+'px').classed('show',true)
        .html(`<strong>${d.address}</strong><br>${AXIS_LABELS[ax.x]||ax.x}: ${xVal}<br>${AXIS_LABELS[ax.y]||ax.y}: ${yVal}${colorInfo}${outlierNote}`);
    })
    .on('mouseout', function() {
      d3.select(this).attr('r',d=>d._outlier?dotR*0.7:dotR).attr('fill-opacity',d=>d._outlier?0.25:0.5).attr('stroke-width',1);
      tooltip.classed('show',false);
    });

  // ── Zoom ──────────────────────────────────────────────────────────────────
  // Reset button — appears when zoomed
  const resetBtn = d3.select(container).append('button')
    .attr('class','scatter-reset-btn')
    .style('display','none')
    .text('⟳ Reset')
    .on('click', () => { svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); });

  const zoom = d3.zoom().scaleExtent([0.5,20]).extent([[0,0],[iW,iH]])
    .on('zoom', event => {
      const t  = event.transform;
      const nx = t.rescaleX(xScale);
      const ny = t.rescaleY(yScale);
      // Clamp domains so axes don't go negative
      const xLo = isYearX ? Math.max(1800, nx.domain()[0]) : Math.max(0, nx.domain()[0]);
      const cx  = nx.copy().domain([xLo, Math.max(xLo+1, nx.domain()[1])]);
      const yLo = Math.max(0, ny.domain()[0]);
      const cy  = ny.copy().domain([yLo, Math.max(yLo+1, ny.domain()[1])]);
      // Redraw axes with updated tick count based on current pixel size
      xAxisG.call(xAxis.scale(cx).ticks(Math.max(3, Math.floor(iW/55))));
      xAxisG.selectAll('text').style('font-size',fs+'px');
      yAxisG.call(yAxis.scale(cy).ticks(Math.max(3, Math.floor(iH/40))));
      yAxisG.selectAll('text').style('font-size',fs+'px');
      dots.selectAll('circle')
        .attr('cx', d => cx(Math.min(Math.max(d[ax.x], cx.domain()[0]), cx.domain()[1])))
        .attr('cy', d => cy(Math.min(Math.max(d[ax.y], cy.domain()[0]), cy.domain()[1])));
      resetBtn.style('display', t.k !== 1 || t.x !== 0 || t.y !== 0 ? 'block' : 'none');
    });
  svg.call(zoom);
  svg.on('dblclick.zoom', () => {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    resetBtn.style('display','none');
  });

  // ── Inline color legend ───────────────────────────────────────────────────
  let legendDiv = container.querySelector('.scatter-color-legend');
  if (!legendDiv) {
    legendDiv = document.createElement('div');
    legendDiv.className = 'scatter-color-legend';
    container.appendChild(legendDiv);
  }
  if (isCat && symOpt.colors) {
    const catCounts = {};
    sample.forEach(d => {
      const v = d[dataField];
      if (v !== undefined && v !== null) catCounts[String(v)] = (catCounts[String(v)]||0)+1;
    });
    const entries = Object.entries(symOpt.colors)
      .filter(([k]) => k !== 'default' && catCounts[k])
      .sort((a,b) => (catCounts[b[0]]||0) - (catCounts[a[0]]||0));
    const MAX_LEGEND = 8;
    const visible = entries.slice(0, MAX_LEGEND);
    const overflow = entries.length - MAX_LEGEND;
    const items = visible.map(([label,color]) =>
      `<span class="sc-leg-item"><span class="sc-leg-dot" style="background:${color}"></span>${label}</span>`
    ).join('');
    const more = overflow > 0 ? `<span class="sc-leg-more">+${overflow} more</span>` : '';
    legendDiv.innerHTML = `<span class="sc-leg-title">Color: ${symField}</span>${items}${more}`;
    legendDiv.style.display = 'flex';
  } else if (isCont && symOpt._thresholds?.length) {
    // Show gradient ramp with bin labels
    const ramp = symOpt.colorRamp;
    const fmtT = v => symField.includes('Year') ? Math.round(v) :
      symField.includes('Acres') ? v.toFixed(2)+' ac' :
      v>=1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${Math.round(v/1e3)}K`;
    const swatches = ramp.map((color,i) => {
      const lo = i === 0 ? null : symOpt._thresholds[i-1];
      const hi = symOpt._thresholds[i];
      const label = hi === undefined ? `${fmtT(symOpt._thresholds[i-1])}+` :
                    lo === null     ? `< ${fmtT(hi)}` :
                    `${fmtT(lo)}–${fmtT(hi)}`;
      return `<span class="sc-leg-item"><span class="sc-leg-dot" style="background:${color}"></span>${label}</span>`;
    }).join('');
    legendDiv.innerHTML = `<span class="sc-leg-title">Color: ${symField}</span>${swatches}`;
    legendDiv.style.display = 'flex';
  } else if (isPctChange && symOpt._thresholds?.length) {
    const ramp = symOpt.colorRamp;
    const fmtP = v => v >= 0 ? `+${v}%` : `${v}%`;
    const swatches = ramp.map((color, i) => {
      const lo = i === 0 ? null : symOpt._thresholds[i-1];
      const hi = symOpt._thresholds[i];
      const label = hi === undefined ? `${fmtP(symOpt._thresholds[i-1])}+` :
                    lo === null      ? `< ${fmtP(hi)}` :
                    `${fmtP(lo)}–${fmtP(hi)}`;
      return `<span class="sc-leg-item"><span class="sc-leg-dot" style="background:${color}"></span>${label}</span>`;
    }).join('');
    legendDiv.innerHTML = `<span class="sc-leg-title">Color: 2020–2022 Δ%</span>${swatches}`;
    legendDiv.style.display = 'flex';
  } else {
    legendDiv.style.display = 'none';
  }
}

// ─── Bar chart renderer ────────────────────────────────────────────────────
function renderBarInto(container, data, color, type, field, activeVal) {
  d3.select(container).selectAll('*').remove();
  if (!data.length) return;
  const width  = container.clientWidth  || 280;
  const barHeight = 24;
  const svgHeight = Math.max(160, data.length * barHeight + 60);
  const fs = Math.max(9, Math.min(13, width / 22));
  const margin = { top:6, right:Math.round(fs*5.5), bottom:Math.round(fs*5.5), left:Math.round(Math.min(width*0.4, fs*12)) };
  const iW = Math.max(width  - margin.left - margin.right, 30);
  const iH = Math.max(svgHeight - margin.top - margin.bottom, 30);
  const fmtVal = v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${Math.round(v/1e3)}K`:`$${Math.round(v)}`;
  const xScale = d3.scaleLinear().domain([0, d3.max(data,d=>d.mean)]).range([0,iW]);
  const yScale = d3.scaleBand().domain(data.map(d=>d.label)).range([0,iH]).padding(0.2);
  const fmtAxis = v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${Math.round(v/1e3)}K`:`$${Math.round(v)}`;
  const xAxis = d3.axisBottom(xScale).ticks(Math.max(3,Math.floor(iW/50))).tickFormat(fmtAxis);
  const yAxis = d3.axisLeft(yScale).tickSize(0);
  const svg = d3.select(container).append('svg').attr('width',width).attr('height',svgHeight);
  const g   = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
  const xAxisG = g.append('g').attr('class','axis').attr('transform',`translate(0,${iH})`).call(xAxis);
  xAxisG.selectAll('text').style('font-size',fs+'px');
  const yAxisG = g.append('g').attr('class','axis').call(yAxis);
  yAxisG.selectAll('text').style('font-size',fs+'px').style('text-anchor','end').each(function(d) {
    const maxChars = Math.floor(margin.left / (fs*0.6));
    if (d && d.length > maxChars) d3.select(this).text(d.slice(0,maxChars-1)+'…');
  });
  const bars = g.selectAll('.bar').data(data).enter().append('rect').attr('class','bar')
    .attr('x',0).attr('y',d=>yScale(d.label))
    .attr('width',d=>Math.max(0,xScale(d.mean)))
    .attr('height',yScale.bandwidth())
    .attr('fill',d => d.label === activeVal ? d3.color(color).darker(0.5).formatHex() : color)
    .attr('fill-opacity', d => activeVal && d.label !== activeVal ? 0.35 : 1)
    .attr('rx',2);
  // Full-row hover zone (covers label area too)
  const totalRowW = margin.left + iW;
  g.selectAll('.bar-hover').data(data).enter().append('rect').attr('class','bar-hover')
    .attr('x',-margin.left).attr('y',d=>yScale(d.label))
    .attr('width',totalRowW).attr('height',yScale.bandwidth())
    .attr('fill','transparent')
    .style('cursor', type ? 'pointer' : 'default')
    .on('mouseover', function(event,d) {
      tooltip.style('left',(event.pageX+10)+'px').style('top',(event.pageY-10)+'px').classed('show',true)
        .html(`<strong>${d.label}</strong><br>Parcels: ${d.count.toLocaleString()}<br>Mean 2022 Assessment: ${fmtVal(d.mean)}`);
      d3.select(this).attr('fill','rgba(0,0,0,0.04)');
    })
    .on('mouseout', function() { tooltip.classed('show',false); d3.select(this).attr('fill','transparent'); })
    .on('click', function(event,d) {
      if (!type || !field) return;
      applyBarFilter(type, field, d.label);
    });
  // Y axis label tooltips
  yAxisG.selectAll('text').on('mouseover', function(event,d) {
    tooltip.style('left',(event.pageX+10)+'px').style('top',(event.pageY-10)+'px').classed('show',true)
      .html(`<strong>${d}</strong>`);
  }).on('mouseout', () => tooltip.classed('show',false));
  // X axis label
  svg.append('text').attr('text-anchor','middle').attr('x',margin.left+iW/2).attr('y',svgHeight-4)
    .style('font-size',(fs-1)+'px').style('fill','#5a5a7a').text('Mean 2022 Assessed Value');
  const zoom = d3.zoom().scaleExtent([1,5]).translateExtent([[0,0],[iW,iH]])
    .on('zoom', event => {
      const nx = event.transform.rescaleX(xScale);
      xAxisG.call(d3.axisBottom(nx).ticks(Math.max(3,Math.floor(iW/50))));
      xAxisG.selectAll('text').style('font-size',fs+'px');
      bars.attr('width',d=>Math.max(0,nx(d.mean)));
    });
  svg.call(zoom);
}

// ─────────────────────────────────────────────────────────────────────────────
// LINKED VIEWS — bar click → filter map + charts
// ─────────────────────────────────────────────────────────────────────────────
function applyBarFilter(type, field, value) {
  // Toggle: clicking active filter clears it
  const current = activeFilter[type];
  const isSame = current && current.field === field && current.value === value;
  activeFilter[type] = isSame ? null : { field, value };
  renderFilterChip(type);
  applyMapFilter(type);
  // Re-run charts with filtered data
  const parcels = getFilteredParcels(type);
  if (type === 'residential') {
    if (activeBeeswarm.residential === 'style') updateResBeeswarm(parcels);
    else updateResBedroomBeeswarm(parcels);
  }
  if (type === 'condo') {
    if (activeBeeswarm.condo === 'style') updateCondoBeeswarm(parcels);
    else updateCondoBedroomBeeswarm(parcels);
  }
  if (type === 'commercial') updateCommercialZoneChart(parcels);
  updateScatter(type);
}

function getFilteredParcels(type) {
  const all = parcelData[type] || [];
  const f = activeFilter[type];
  if (!f) return all;
  const fieldMap = { neighborhood:'neighborhood', style:'style', zone:'zone', stateUse:'stateUse', frame:'frame' };
  // f.field is the bar dropdown key (e.g. 'neighborhood'), map to parcel object key
  const key = fieldMap[f.field] || f.field;
  return all.filter(p => String(p[key]) === String(f.value));
}

function applyMapFilter(type) {
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map = maps[type];
  if (!map || !map.getLayer('parcels-fill')) return;
  const f = activeFilter[type];
  if (!f) {
    // Restore type-only filter
    window.toggleParcelFilter && applyTypeFilter(type, map);
    return;
  }
  // Map the bar field key to the raw tile property name
  const tileField = { neighborhood:'Neighborhood', style:'Style Description', zone:'Zone', stateUse:'State Use Description', frame:'Frame Type' };
  const tf = tileField[f.field];
  if (!tf) return;
  const typeFilter = getTypeFilterExpr(type);
  const catFilter = ['==', ['get', tf], f.value];
  const combined = typeFilter ? ['all', typeFilter, catFilter] : catFilter;
  map.setFilter('parcels-fill', combined);
  map.setFilter('parcels-outline', combined);
}

function applyTypeFilter(type, map) {
  if (showAllParcels[type]) { map.setFilter('parcels-fill',null); map.setFilter('parcels-outline',null); return; }
  const expr = getTypeFilterExpr(type);
  if (expr) { map.setFilter('parcels-fill',expr); map.setFilter('parcels-outline',expr); }
}

function getTypeFilterExpr(type) {
  if (showAllParcels[type]) return null;
  if (type==='vacant')  return ['any',['==',['get','Property Type'],'Vacant'],['==',['get','Property Type'],'Vacant Land']];
  if (type==='condo')   return ['any',['==',['get','Property Type'],'Condo'],['==',['get','Property Type'],'Condominium']];
  return ['==',['get','Property Type'],type.charAt(0).toUpperCase()+type.slice(1)];
}

function renderFilterChip(type) {
  const chipId = `${type === 'residential' ? 'res' : type}-filter-chip`;
  const el = document.getElementById(chipId);
  if (!el) return;
  const f = activeFilter[type];
  if (!f) { el.style.display='none'; el.innerHTML=''; return; }
  const fieldLabels = { neighborhood:'Neighborhood', style:'Style', zone:'Zone', stateUse:'State Use', frame:'Frame Type' };
  el.style.display = 'flex';
  el.innerHTML = `<span class="filter-chip-label">${fieldLabels[f.field]||f.field}: <strong>${f.value}</strong></span><button class="filter-chip-clear" onclick="clearBarFilter('${type}')" aria-label="Clear filter">×</button>`;
}

window.clearBarFilter = function(type) {
  activeFilter[type] = null;
  renderFilterChip(type);
  applyMapFilter(type);
  // Re-run charts with all data
  updateChartsForType(type);
};

// Override updateRightBarChart to use filtered parcels for chart but highlight active bar
window.updateRightBarChart = function(type, field) {
  const containerId = `${type === 'residential' ? 'res' : type}RightBarChart`;
  const container   = document.getElementById(containerId);
  if (!container) return;
  const parcels = parcelData[type]; // always use all parcels for the bar chart
  if (!parcels?.length) return;
  const grouped = {};
  parcels.forEach(p => {
    const val = p[field];
    if (!val || val === 'Unknown' || p.assessed2022 <= 0) return;
    if (!grouped[val]) grouped[val] = { sum: 0, count: 0 };
    grouped[val].sum   += p.assessed2022;
    grouped[val].count += 1;
  });
  const data = Object.entries(grouped)
    .map(([label, { sum, count }]) => ({ label, count, mean: sum / count }))
    .sort((a, b) => b.mean - a.mean);
  if (!data.length) return;
  const headingId = `${type === 'residential' ? 'res' : type}-bar-heading`;
  const headEl = document.getElementById(headingId);
  if (headEl) headEl.textContent = 'Mean 2022 Assessment';
  const activeVal = activeFilter[type]?.field === field ? activeFilter[type]?.value : null;
  watchAndRender(container, () => renderBarInto(container, data, COLORS[type], type, field, activeVal));
};

// ─── Loading / Error UI ────────────────────────────────────────────────────
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