// Property Assessment Dashboard - MapLibre GL JS Version
// With dynamic data aggregation and chart population

let residentialMap, condoMap, commercialMap, vacantMap;
let parcelData = { residential: [], condo: [], commercial: [], vacant: [] };
let statsData = { residential: {}, condo: {}, commercial: {}, vacant: {} };
let dataCollected = { residential: false, condo: false, commercial: false, vacant: false };

const COLORS = {
    residential: '#e55d75',
    condo:       '#f59e0b',
    commercial:  '#6b8cae',
    vacant:      '#10b981'
};

// ─── Startup ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, waiting for libraries...');
    showLoading('Loading map libraries...');
    
    try {
        // Wait for libraries with longer timeout for slow connections
        const librariesLoaded = await waitForLibraries(30000); // 30 second timeout
        
        if (!librariesLoaded) {
            throw new Error('Libraries took too long to load. This might be due to a slow internet connection or CDN issues. Please try:\n1. Refreshing the page\n2. Checking your internet connection\n3. Trying again in a few minutes');
        }
        
        console.log('✓ Libraries loaded');
        showLoading('Initializing maps...');
        await initializeMaps();
        
    } catch (err) {
        console.error('Startup error:', err);
        showError(`Startup failed: ${err.message}`);
    }
});

function waitForLibraries(timeout = 10000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const loadingMsg = document.getElementById('loading-message');
        
        const checkLibraries = () => {
            const elapsed = Date.now() - startTime;
            
            // Check if libraries are loaded
            if (typeof maplibregl !== 'undefined' && typeof pmtiles !== 'undefined') {
                console.log('✓ MapLibre and PMTiles loaded');
                if (loadingMsg) loadingMsg.textContent = 'Libraries loaded!';
                resolve(true);
                return;
            }
            
            // Check for timeout
            if (elapsed > timeout) {
                console.error('Timeout waiting for libraries');
                if (loadingMsg) loadingMsg.textContent = 'Loading timed out. Please refresh.';
                resolve(false);
                return;
            }
            
            // Update progress message
            const missing = [];
            if (typeof maplibregl === 'undefined') missing.push('MapLibre GL JS');
            if (typeof pmtiles === 'undefined') missing.push('PMTiles');
            
            if (loadingMsg && missing.length > 0) {
                const seconds = Math.round(elapsed / 1000);
                loadingMsg.textContent = `Loading ${missing.join(' & ')}... (${seconds}s)`;
            }
            
            // Log every 2 seconds
            if (missing.length > 0 && elapsed % 2000 < 100) {
                console.log(`Still waiting for: ${missing.join(', ')}...`);
            }
            
            // Check again
            setTimeout(checkLibraries, 100);
        };
        
        checkLibraries();
    });
}

// ─── Maps ─────────────────────────────────────────────────────────────────────
async function initializeMaps() {
    try {
        const center = [-72.75, 41.76];
        const zoom = 13;

        // Create maps
        residentialMap = createBasicMap('residentialMap', center, zoom);
        condoMap       = createBasicMap('condoMap', center, zoom);
        commercialMap  = createBasicMap('commercialMap', center, zoom);
        vacantMap      = createBasicMap('vacantMap', center, zoom);

        console.log('✓ Base maps created');
        
        // Try to load PMTiles
        showLoading('Loading parcel data...');
        
        try {
            await loadPMTiles();
            console.log('✓ PMTiles loaded');
        } catch (pmErr) {
            console.warn('PMTiles error:', pmErr.message);
            showPMTilesError(pmErr.message);
        }
        
        hideLoading();
        console.log('✓ Initialization complete');
        
    } catch (err) {
        console.error('Error initializing maps:', err);
        showError(`Failed to load maps: ${err.message}`);
    }
}

function createBasicMap(containerId, center, zoom) {
    const map = new maplibregl.Map({
        container: containerId,
        style: {
            version: 8,
            sources: {
                'osm': {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors'
                }
            },
            layers: [{
                id: 'osm',
                type: 'raster',
                source: 'osm',
                paint: {
                    'raster-opacity': 0.8
                }
            }]
        },
        center: center,
        zoom: zoom,
        fadeDuration: 0  // Disable fade to speed up rendering
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    // Add error handling
    map.on('error', (e) => {
        console.warn(`Map error in ${containerId}:`, e.error);
    });
    
    // Force load event after timeout if it doesn't fire
    setTimeout(() => {
        if (!map.loaded()) {
            console.log(`Forcing load event for ${containerId}`);
            map.fire('load');
        }
    }, 3000);
    
    return map;
}

async function loadPMTiles() {
    try {
        // Check if file exists
        console.log('Checking for parcels.pmtiles...');
        const response = await fetch('parcels.pmtiles', { method: 'HEAD' });
        
        if (!response.ok) {
            throw new Error(`parcels.pmtiles not found (HTTP ${response.status}). Please place parcels.pmtiles in the same folder as index.html`);
        }
        
        console.log('parcels.pmtiles found, setting up protocol...');
        
        // Set up PMTiles protocol
        // Note: Browser cache errors are normal on GitHub Pages and can be ignored
        const protocol = new pmtiles.Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
        
        console.log('Protocol configured, adding layers...');
        
        // Add layers to each map - they'll load data as needed
        await Promise.all([
            addPMTilesLayer(residentialMap, 'residential'),
            addPMTilesLayer(condoMap, 'condo'),
            addPMTilesLayer(commercialMap, 'commercial'),
            addPMTilesLayer(vacantMap, 'vacant')
        ]);
        
        console.log('✓ Layers added successfully');
        
    } catch (err) {
        console.error('PMTiles loading failed:', err);
        throw err;
    }
}

// Remove the problematic loadParcelData function - we don't need it
// Data will be collected when features render on the map

function addPMTilesLayer(map, propertyType) {
    return new Promise((resolve) => {
        const color = COLORS[propertyType];
        
        const addLayers = () => {
            console.log(`Adding layer for ${propertyType}...`);
            
            try {
                // Check if source already exists
                if (map.getSource('parcels')) {
                    console.log(`Source already exists for ${propertyType}, skipping...`);
                    resolve();
                    return;
                }
                
                // Add PMTiles source
                map.addSource('parcels', {
                    type: 'vector',
                    url: 'pmtiles://./parcels.pmtiles'
                });

                // Determine color expression based on assessment value
                const fillColorExpression = [
                    'interpolate',
                    ['linear'],
                    ['to-number', ['get', 'Assessed Total'], 0],
                    0, lightenColor(color, 0.7),      // Very light for low values
                    100000, lightenColor(color, 0.4),  // Medium light
                    300000, color,                      // Base color
                    500000, darkenColor(color, 0.3),   // Darker for high values
                    1000000, darkenColor(color, 0.5)   // Very dark for very high values
                ];

                // Add fill layer with value-based coloring
                map.addLayer({
                    id: 'parcels-fill',
                    type: 'fill',
                    source: 'parcels',
                    'source-layer': 'parcels',
                    paint: {
                        'fill-color': fillColorExpression,
                        'fill-opacity': 0.6
                    },
                    filter: createPropertyFilter(propertyType)
                });

                // Add outline layer
                map.addLayer({
                    id: 'parcels-outline',
                    type: 'line',
                    source: 'parcels',
                    'source-layer': 'parcels',
                    paint: {
                        'line-color': '#ffffff',
                        'line-width': 0.5
                    },
                    filter: createPropertyFilter(propertyType)
                });

                // Collect data when features are rendered
                map.on('data', (e) => {
                    if (e.sourceId === 'parcels' && e.isSourceLoaded) {
                        collectParcelData(map, propertyType);
                    }
                });
                
                // Also try collecting after a delay (backup)
                setTimeout(() => {
                    if (!dataCollected[propertyType]) {
                        console.log(`Retry collecting data for ${propertyType}...`);
                        collectParcelData(map, propertyType);
                    }
                }, 2000);

                // Add click handler
                map.on('click', 'parcels-fill', (e) => {
                    if (e.features && e.features.length > 0) {
                        const props = e.features[0].properties;
                        showPopup(map, e.lngLat, props, color, propertyType);
                    }
                });

                // Change cursor on hover
                map.on('mouseenter', 'parcels-fill', () => {
                    map.getCanvas().style.cursor = 'pointer';
                });

                map.on('mouseleave', 'parcels-fill', () => {
                    map.getCanvas().style.cursor = '';
                });
                
                console.log(`✓ ${propertyType} layer added`);
                resolve();
                
            } catch (err) {
                console.error(`Error adding ${propertyType} layer:`, err);
                resolve();
            }
        };
        
        // Try multiple times to add layers
        const tryAddLayers = () => {
            if (map.loaded()) {
                console.log(`Map loaded for ${propertyType}, adding layers immediately`);
                addLayers();
            } else if (map.isStyleLoaded && map.isStyleLoaded()) {
                console.log(`Style loaded for ${propertyType}, adding layers now`);
                addLayers();
            } else {
                console.log(`Waiting for ${propertyType} map to load...`);
                // Try on both 'load' and 'style.load' events
                const onLoad = () => {
                    map.off('load', onLoad);
                    map.off('style.load', onLoad);
                    addLayers();
                };
                map.once('load', onLoad);
                map.once('style.load', onLoad);
                
                // Timeout fallback - force it after 5 seconds
                setTimeout(() => {
                    if (!map.getSource('parcels')) {
                        console.log(`Timeout for ${propertyType}, forcing layer add...`);
                        map.off('load', onLoad);
                        map.off('style.load', onLoad);
                        addLayers();
                    }
                }, 5000);
            }
        };
        
        tryAddLayers();
    });
}

function createPropertyFilter(propertyType) {
    // For now, show ALL parcels on each map
    // The data collection will still categorize them correctly
    // This ensures parcels are visible even if Property Type field has unexpected values
    return ['all'];
    
    /* Original strict filter - disabled for now
    const typeMap = {
        residential: ['Residential', 'RESIDENTIAL', 'Single Family', 'SINGLE FAMILY', 'Res', 'RES'],
        condo: ['Condominium', 'CONDOMINIUM', 'Condo', 'CONDO', 'Townhouse', 'TOWNHOUSE'],
        commercial: ['Commercial', 'COMMERCIAL', 'Business', 'BUSINESS', 'Industrial', 'INDUSTRIAL'],
        vacant: ['Vacant Land', 'VACANT LAND', 'Vacant', 'VACANT', 'Land', 'LAND']
    };
    const matches = typeMap[propertyType] || [];
    return ['any', ...matches.map(match => ['==', ['get', 'Property Type'], match])];
    */
}

function collectParcelData(map, propertyType) {
    // Only collect once per property type
    if (dataCollected[propertyType]) return;
    
    const features = map.querySourceFeatures('parcels', {
        sourceLayer: 'parcels'
    });
    
    if (features.length === 0) {
        console.log(`No features loaded yet for ${propertyType}, waiting...`);
        return;
    }
    
    console.log(`Collecting data for ${propertyType}: ${features.length} features found`);
    
    // DEBUG: Log unique property types in the data
    if (propertyType === 'residential') {
        const uniqueTypes = new Set();
        features.slice(0, 100).forEach(f => {
            if (f.properties['Property Type']) {
                uniqueTypes.add(f.properties['Property Type']);
            }
        });
        console.log('Sample Property Type values in data:', Array.from(uniqueTypes));
    }
    
    let total2020 = 0;
    let total2025 = 0;
    let count = 0;
    const parcels = [];
    
    features.forEach(feature => {
        const props = feature.properties;
        
        // Check if this parcel matches our property type
        const propType = normalizePropertyType(props['Property Type']);
        if (propType !== propertyType) return;
        
        const val2020 = parseFloat(props['Pre Year Assessed Total']) || 0;
        const val2025 = parseFloat(props['Assessed Total']) || 0;
        
        if (val2025 > 0) {
            total2020 += val2020;
            total2025 += val2025;
            count++;
            
            parcels.push({
                address: props['Property Address'],
                parcelId: props['Parcel ID'],
                assessed2020: val2020,
                assessed2025: val2025,
                acreage: parseFloat(props['Acreage']) || 0,
                style: props['Style'] || 'Unknown',
                location: props['Location'] || 'Unknown',
                zone: props['Zone'] || 'Unknown'
            });
        }
    });
    
    // Only mark as collected if we got a reasonable amount of data
    if (count > 0) {
        dataCollected[propertyType] = true;
        
        // Store the data
        parcelData[propertyType] = parcels;
        statsData[propertyType] = {
            total2020,
            total2025,
            count,
            avgChange: total2020 > 0 ? ((total2025 - total2020) / total2020 * 100).toFixed(1) : 0
        };
        
        console.log(`✓ ${propertyType} data collected:`, {
            count,
            total2020: `$${total2020.toLocaleString()}`,
            total2025: `$${total2025.toLocaleString()}`
        });
        
        // Update UI
        updateStatsUI();
        updateChartsForType(propertyType);
    }
}

function normalizePropertyType(type) {
    if (!type) return 'residential';
    const s = type.toString().toUpperCase();
    if (s.includes('RES') || s.includes('SINGLE') || s.includes('FAMILY')) return 'residential';
    if (s.includes('CONDO') || s.includes('TOWN')) return 'condo';
    if (s.includes('COMM') || s.includes('BUS') || s.includes('IND')) return 'commercial';
    if (s.includes('VAC') || s.includes('LAND')) return 'vacant';
    return 'residential';
}

// Color helpers
function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent * 100);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255))
        .toString(16).slice(1);
}

function darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent * 100);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R > 0 ? R : 0) * 0x10000 +
        (G > 0 ? G : 0) * 0x100 +
        (B > 0 ? B : 0))
        .toString(16).slice(1);
}

function showPopup(map, lngLat, props, color, propertyType) {
    const assessment2020 = parseFloat(props['Pre Year Assessed Total']) || 0;
    const assessment2025 = parseFloat(props['Assessed Total']) || 0;
    const pct = assessment2020 > 0 
        ? ((assessment2025 - assessment2020) / assessment2020 * 100).toFixed(1)
        : '–';
    const pctColor = parseFloat(pct) > 0 ? '#16a34a' : '#dc2626';

    new maplibregl.Popup()
        .setLngLat(lngLat)
        .setHTML(`
            <div style="min-width:200px;font-size:13px;font-family:sans-serif;">
                <div style="font-weight:700;margin-bottom:6px;">
                    ${props['Property Address'] || 'Unknown'}
                </div>
                <div style="color:${color};font-weight:600;font-size:11px;
                     text-transform:uppercase;margin-bottom:8px;">
                    ${propertyType}
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="color:#666;padding:2px 0;">Parcel</td>
                        <td style="text-align:right;">${props['Parcel ID'] || 'Unknown'}</td></tr>
                    <tr><td style="color:#666;padding:2px 0;">2020</td>
                        <td style="text-align:right;">$${assessment2020.toLocaleString()}</td></tr>
                    <tr><td style="color:#666;padding:2px 0;">2025</td>
                        <td style="text-align:right;font-weight:600;">$${assessment2025.toLocaleString()}</td></tr>
                    <tr><td style="color:#666;padding:2px 0;">Change</td>
                        <td style="text-align:right;font-weight:700;color:${pctColor};">
                            ${parseFloat(pct) > 0 ? '+' : ''}${pct}%</td></tr>
                </table>
            </div>
        `)
        .addTo(map);
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStatsUI() {
    console.log('Updating stats UI...');
    
    ['residential', 'condo', 'commercial', 'vacant'].forEach(type => {
        const stats = statsData[type];
        if (!stats || !stats.count || stats.count === 0) return;
        
        const tab = document.getElementById(`${type}-content`);
        if (!tab) return;
        
        const cards = tab.querySelectorAll('.stat-value');
        if (cards.length >= 3) {
            const total2020 = stats.total2020 || 0;
            const total2025 = stats.total2025 || 0;
            const count = stats.count || 0;
            
            cards[0].textContent = '$' + Math.round(total2020).toLocaleString();
            cards[1].textContent = '$' + Math.round(total2025).toLocaleString();
            cards[2].textContent = count.toLocaleString();
            
            console.log(`✓ Updated ${type} stats: ${count} parcels`);
        }
    });
}

// ─── Charts ───────────────────────────────────────────────────────────────────
let charts = {};

function initializeCharts() {
    console.log('Initializing charts...');
    // Charts will be created when we have data
}

function updateChartsForType(propertyType) {
    console.log(`Updating charts for ${propertyType}...`);
    
    const parcels = parcelData[propertyType];
    if (!parcels || parcels.length === 0) return;
    
    if (propertyType === 'residential') {
        updateResidentialCharts(parcels);
    } else if (propertyType === 'condo') {
        updateCondoCharts(parcels);
    } else if (propertyType === 'commercial') {
        updateCommercialCharts(parcels);
    } else if (propertyType === 'vacant') {
        updateVacantCharts(parcels);
    }
}

function updateResidentialCharts(parcels) {
    // Value Distribution Chart
    const valueRanges = {
        '<$200K': 0, '$200-300K': 0, '$300-400K': 0, 
        '$400-500K': 0, '>$500K': 0
    };
    
    parcels.forEach(p => {
        if (p.assessed2025 < 200000) valueRanges['<$200K']++;
        else if (p.assessed2025 < 300000) valueRanges['$200-300K']++;
        else if (p.assessed2025 < 400000) valueRanges['$300-400K']++;
        else if (p.assessed2025 < 500000) valueRanges['$400-500K']++;
        else valueRanges['>$500K']++;
    });
    
    createOrUpdateChart('residentialValueChart', {
        type: 'bar',
        data: {
            labels: Object.keys(valueRanges),
            datasets: [{
                label: 'Number of Properties',
                data: Object.values(valueRanges),
                backgroundColor: COLORS.residential
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
    
    // Style Distribution
    const styleCount = {};
    parcels.forEach(p => {
        styleCount[p.style] = (styleCount[p.style] || 0) + 1;
    });
    
    const topStyles = Object.entries(styleCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    createOrUpdateChart('residentialStyleChart', {
        type: 'bar',
        data: {
            labels: topStyles.map(s => s[0]),
            datasets: [{
                label: 'Count',
                data: topStyles.map(s => s[1]),
                backgroundColor: COLORS.residential
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } }
        }
    });
    
    // Scatter plot
    createScatterPlot('residentialScatter', parcels, 'acreage', 'assessed2025', 
        'Acreage', 'Assessment Value', COLORS.residential);
}

function updateCondoCharts(parcels) {
    // Similar to residential
    const avgByStyle = {};
    const countByStyle = {};
    
    parcels.forEach(p => {
        if (!avgByStyle[p.style]) {
            avgByStyle[p.style] = 0;
            countByStyle[p.style] = 0;
        }
        avgByStyle[p.style] += p.assessed2025;
        countByStyle[p.style]++;
    });
    
    Object.keys(avgByStyle).forEach(style => {
        avgByStyle[style] = avgByStyle[style] / countByStyle[style];
    });
    
    const topStyles = Object.entries(avgByStyle)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    
    createOrUpdateChart('condoStyleChart', {
        type: 'bar',
        data: {
            labels: topStyles.map(s => s[0]),
            datasets: [{
                label: 'Average Value',
                data: topStyles.map(s => s[1]),
                backgroundColor: COLORS.condo
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
    
    // Location distribution
    const locationCount = {};
    parcels.forEach(p => {
        locationCount[p.location] = (locationCount[p.location] || 0) + 1;
    });
    
    createOrUpdateChart('condoLocationChart', {
        type: 'doughnut',
        data: {
            labels: Object.keys(locationCount),
            datasets: [{
                data: Object.values(locationCount),
                backgroundColor: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function updateCommercialCharts(parcels) {
    // Zone distribution
    const zoneCount = {};
    parcels.forEach(p => {
        zoneCount[p.zone] = (zoneCount[p.zone] || 0) + 1;
    });
    
    createOrUpdateChart('commercialClassChart', {
        type: 'bar',
        data: {
            labels: Object.keys(zoneCount),
            datasets: [{
                label: 'Count',
                data: Object.values(zoneCount),
                backgroundColor: COLORS.commercial
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
    
    // Scatter
    createScatterPlot('commercialScatter', parcels, 'acreage', 'assessed2025',
        'Area', 'Assessment', COLORS.commercial);
}

function updateVacantCharts(parcels) {
    const zoneCount = {};
    parcels.forEach(p => {
        zoneCount[p.zone] = (zoneCount[p.zone] || 0) + 1;
    });
    
    createOrUpdateChart('vacantUseChart', {
        type: 'bar',
        data: {
            labels: Object.keys(zoneCount),
            datasets: [{
                label: 'Count',
                data: Object.values(zoneCount),
                backgroundColor: COLORS.vacant
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
    
    createScatterPlot('vacantScatter', parcels, 'acreage', 'assessed2025',
        'Acreage', 'Value', COLORS.vacant);
}

function createOrUpdateChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    charts[canvasId] = new Chart(canvas, config);
}

function createScatterPlot(canvasId, parcels, xField, yField, xLabel, yLabel, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const data = parcels.map(p => ({ x: p[xField], y: p[yField] }));
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    charts[canvasId] = new Chart(canvas, {
        type: 'scatter',
        data: {
            datasets: [{
                data: data,
                backgroundColor: color + '80'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: xLabel } },
                y: { title: { display: true, text: yLabel } }
            }
        }
    });
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
window.switchTab = function(event, tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(`${tabName}-content`);
    if (target) target.classList.add('active');
    const maps = { 
        residential: residentialMap, 
        condo: condoMap,
        commercial: commercialMap, 
        vacant: vacantMap 
    };
    setTimeout(() => { 
        if (maps[tabName]) maps[tabName].resize(); 
    }, 50);
};

// ─── UI ───────────────────────────────────────────────────────────────────────
function showLoading(msg) {
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    el.style.display = 'flex';
    const m = document.getElementById('loading-message');
    if (m) m.textContent = msg;
}

function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = 'none';
}

function showWarning(msg) {
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    el.style.display = 'flex';
    el.innerHTML = `
        <div style="background:white;padding:2rem;border-radius:8px;max-width:500px;text-align:center;">
            <div style="font-size:2rem;margin-bottom:1rem;">⚠️</div>
            <p style="color:#f59e0b;font-weight:600;margin-bottom:.5rem;">Notice</p>
            <p style="color:#666;font-size:.9rem;margin-bottom:1rem;">${msg}</p>
            <button onclick="hideLoading()"
                style="padding:.5rem 1.5rem;background:#6b8cae;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500;">
                Continue Anyway
            </button>
        </div>`;
}

function showError(msg) {
    hideLoading();
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    el.style.display = 'flex';
    el.innerHTML = `
        <div style="background:white;padding:2rem;border-radius:8px;max-width:400px;text-align:center;">
            <div style="font-size:2rem;margin-bottom:1rem;">❌</div>
            <p style="color:#dc2626;font-weight:600;margin-bottom:.5rem;">Error</p>
            <p style="color:#666;font-size:.9rem;margin-bottom:1rem;">${msg}</p>
            <button onclick="location.reload()"
                style="padding:.5rem 1rem;background:#6b8cae;color:white;border:none;border-radius:4px;cursor:pointer;">
                Try Again
            </button>
        </div>`;
}

function showPMTilesError(errorMsg) {
    hideLoading();
    const el = document.getElementById('loading-overlay');
    if (!el) return;
    el.style.display = 'flex';
    el.innerHTML = `
        <div style="background:white;padding:2rem;border-radius:8px;max-width:550px;text-align:left;">
            <div style="text-align:center;font-size:2rem;margin-bottom:1rem;">📦</div>
            <h3 style="color:#dc2626;font-weight:600;margin-bottom:.5rem;text-align:center;">PMTiles File Not Found</h3>
            <p style="color:#666;font-size:.9rem;margin-bottom:1rem;">
                The app cannot find <code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;">parcels.pmtiles</code> file.
            </p>
            <div style="background:#f9fafb;border-left:3px solid #6b8cae;padding:1rem;margin-bottom:1rem;">
                <p style="font-size:.875rem;margin-bottom:.75rem;"><strong>Troubleshooting:</strong></p>
                <ol style="font-size:.875rem;line-height:1.6;color:#666;padding-left:1.25rem;">
                    <li>Make sure <code>parcels.pmtiles</code> is in the same folder as <code>index.html</code></li>
                    <li>Check the filename is exactly: <code>parcels.pmtiles</code> (lowercase)</li>
                    <li>If using Python server, make sure it's running in the correct directory</li>
                    <li>Try a different server like <code>npx http-server -p 8000</code></li>
                </ol>
            </div>
            <details style="margin-bottom:1rem;">
                <summary style="cursor:pointer;color:#6b8cae;font-size:.875rem;">Error Details</summary>
                <pre style="background:#f3f4f6;padding:.75rem;border-radius:4px;font-size:.75rem;overflow-x:auto;margin-top:.5rem;">${errorMsg}</pre>
            </details>
            <div style="display:flex;gap:.5rem;justify-content:center;">
                <button onclick="hideLoading()"
                    style="padding:.5rem 1rem;background:#e5e7eb;color:#374151;border:none;border-radius:4px;cursor:pointer;font-size:.875rem;">
                    View Maps Only
                </button>
                <button onclick="location.reload()"
                    style="padding:.5rem 1rem;background:#6b8cae;color:white;border:none;border-radius:4px;cursor:pointer;font-size:.875rem;">
                    Try Again
                </button>
            </div>
        </div>`;
}
