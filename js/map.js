'use strict';

// ─── Map layer setup ──────────────────────────────────────────────────────────

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

// ─── Map event handlers ───────────────────────────────────────────────────────

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
  if (map.getLayer('parcel-selected')) map.removeLayer('parcel-selected');
  if (map.getSource('parcel-selected')) map.removeSource('parcel-selected');
  if (!parcelId) return;
  const features = map.querySourceFeatures('parcels',{ sourceLayer, filter:['==',['get','Parcel ID'],parcelId] });
  if (!features.length) return;
  map.addSource('parcel-selected',{ type:'geojson', data:{ type:'Feature', geometry:features[0].geometry, properties:{} }});
  map.addLayer({ id:'parcel-selected', type:'line', source:'parcel-selected',
    paint:{ 'line-color':'#FFD700', 'line-width':3, 'line-opacity':1 }});
}

// ─── Map initialization ───────────────────────────────────────────────────────

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
    await new Promise(r => residentialMap.once('load', r));
    addMapLayers(residentialMap, sourceLayerName);
    attachMapHandlers(residentialMap, 'residential', sourceLayerName);

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

// ─── Lazy map init for non-active tabs ───────────────────────────────────────

async function lazyInitMap(type) {
  if (mapInitialized[type]) return;
  mapInitialized[type] = true;
  const containers = { condo:'condoMap', commercial:'commercialMap', vacant:'vacantMap' };
  if (!_mapConfig) return;
  const map = new maplibregl.Map({ ..._mapConfig, container:containers[type] });
  await new Promise(r => map.once('load', r));
  if (type === 'condo')      condoMap      = map;
  if (type === 'commercial') commercialMap = map;
  if (type === 'vacant')     vacantMap     = map;
  addMapLayers(map, _sourceLayerName);
  attachMapHandlers(map, type, _sourceLayerName);
  window.changeMapSymbolization(map, type, mapSymbolization[type]||'Zone');
  map.resize();
}

// ─── Parcel data collection from tile features ────────────────────────────────

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

// ─── Map filter helpers ───────────────────────────────────────────────────────

function applyMapFilter(type) {
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map = maps[type];
  if (!map || !map.getLayer('parcels-fill')) return;
  const f = activeFilter[type];
  if (!f) {
    applyTypeFilter(type, map);
    return;
  }
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

function highlightParcelOnMap(parcelId, type) {
  const maps = { residential:residentialMap, condo:condoMap, commercial:commercialMap, vacant:vacantMap };
  const map  = maps[type];
  if (!map) return;
  setSelectedParcelHighlight(map, _sourceLayerName, parcelId, type);
  selectedParcelId[type] = parcelId;
  const features = map.querySourceFeatures('parcels',{ sourceLayer:_sourceLayerName, filter:['==',['get','Parcel ID'],parcelId] });
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
