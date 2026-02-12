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
        
        // Store property type on map for legend filtering
        map._propertyType = propertyType;
        
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

                // Get current symbolization
                const currentSymbol = mapSymbolization[propertyType] || 'Zone';
                const symbolOption = SYMBOLIZATION_OPTIONS.find(opt => opt.value === currentSymbol);
                const fillColorExpression = createColorExpression(currentSymbol, symbolOption);

                // Add fill layer with dynamic coloring
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

                // Add legend to the map (get containerId from map's container)
                const containerId = map.getContainer().id;
                addMapLegend(map, containerId);

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
    return ['all'];
    // Filter by Property Type field to show only relevant parcels on each tab
    //const typeMap = {
    //    residential: ['Residential', 'RESIDENTIAL', 'Single Family', 'SINGLE FAMILY', 'Res', 'RES'],
    //    condo: ['Condominium', 'CONDOMINIUM', 'Condo', 'CONDO', 'Townhouse', 'TOWNHOUSE'],
    //    commercial: ['Commercial', 'COMMERCIAL', 'Business', 'BUSINESS', 'Industrial', 'INDUSTRIAL', 'Comm', 'COMM'],
    //    vacant: ['Vacant Land', 'VACANT LAND', 'Vacant', 'VACANT', 'Land', 'LAND']
    //};
    
    //const matches = typeMap[propertyType] || [];
    
    // Create filter that matches any of the property type variations
    //if (matches.length === 0) return ['all'];
    
    //return ['any', ...matches.map(match => ['==', ['get', 'Property Type'], match])];
}

// Get unique zones from data for color mapping
const ZONE_COLORS = {
    'R-13': '#3b82f6',   // Blue
    'R-20': '#10b981',   // Green  
    'R-40': '#f59e0b',   // Orange
    'R-80': '#ef4444',   // Red
    'B': '#8b5cf6',      // Purple - Business
    'I': '#64748b',      // Gray - Industrial
    'default': '#a73097' // Light gray - Unknown
};

// Color schemes for different property types
const PROPERTY_TYPE_COLORS = {
    'Residential': '#3b82f6',
    'Condominium': '#f59e0b',
    'Commercial': '#8b5cf6',
    'Vacant Land': '#10b981',
    'default': '#94a3b8'
};

// Color ramps for continuous values (assessment values, year built, etc.)
const VALUE_COLOR_RAMP = ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'];
const YEAR_COLOR_RAMP = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'];

// Available symbolization options
const SYMBOLIZATION_OPTIONS = [
    { value: 'Zone', label: 'Zone', type: 'categorical', colors: ZONE_COLORS },
    { value: 'Property Type', label: 'Property Type', type: 'categorical', colors: PROPERTY_TYPE_COLORS },
    { value: 'Assessed Total', label: '2025 Assessment Value', type: 'continuous', colorRamp: VALUE_COLOR_RAMP },
    { value: 'Pre Year Assessed Total', label: '2020 Assessment Value', type: 'continuous', colorRamp: VALUE_COLOR_RAMP },
    { value: 'Effective Year Built', label: 'Year Built', type: 'continuous', colorRamp: YEAR_COLOR_RAMP },
    { value: 'State Use Description', label: 'State Use', type: 'categorical' },
    { value: 'Neighborhood', label: 'Neighborhood', type: 'categorical' },
    { value: 'Style Description', label: 'Building Style', type: 'categorical' }
];

// Track current symbolization for each map
const mapSymbolization = {
    residential: 'Zone',
    condo: 'Zone',
    commercial: 'Zone',
    vacant: 'Zone'
};

function getZoneColor(zone) {
    return ZONE_COLORS[zone] || ZONE_COLORS['default'];
}

// Create color expression based on field and type
function createColorExpression(field, symbolizationOption) {
    if (!symbolizationOption) {
        // Default to zone coloring
        return createZoneColorExpression();
    }

    if (symbolizationOption.type === 'categorical') {
        // Use predefined colors if available, otherwise generate
        const colors = symbolizationOption.colors || {};
        const expression = ['match', ['get', field]];
        
        // Add known colors
        Object.entries(colors).forEach(([value, color]) => {
            if (value !== 'default') {
                expression.push(value, color);
            }
        });
        
        // Default color
        expression.push(colors['default'] || '#94a3b8');
        
        return expression;
    } else if (symbolizationOption.type === 'continuous') {
        // Continuous data (assessment values, years, etc.)
        const colorRamp = symbolizationOption.colorRamp;
        
        // Create interpolation expression
        const expression = [
            'interpolate',
            ['linear'],
            ['to-number', ['get', field], 0]
        ];
        
        // Add color stops based on field
        if (field.includes('Assessed')) {
            // Assessment value stops
            expression.push(
                0, colorRamp[0],
                100000, colorRamp[1],
                300000, colorRamp[2],
                500000, colorRamp[3],
                1000000, colorRamp[4]
            );
        } else if (field.includes('Year')) {
            // Year built stops
            expression.push(
                1800, colorRamp[0],
                1900, colorRamp[1],
                1950, colorRamp[2],
                1980, colorRamp[3],
                2000, colorRamp[4],
                2010, colorRamp[5],
                2025, colorRamp[6]
            );
        } else {
            // Generic continuous scale
            expression.push(
                0, colorRamp[0],
                25, colorRamp[1],
                50, colorRamp[2],
                75, colorRamp[3],
                100, colorRamp[4]
            );
        }
        
        return expression;
    }
    
    // Fallback
    return createZoneColorExpression();
}

// Create zone-based color expression for map
function createZoneColorExpression() {
    const zoneKeys = Object.keys(ZONE_COLORS).filter(k => k !== 'default');
    const expression = ['match', ['get', 'Zone']];
    
    zoneKeys.forEach(zone => {
        expression.push(zone, ZONE_COLORS[zone]);
    });
    
    expression.push(ZONE_COLORS['default']); // default color
    
    return expression;
}

// Add interactive legend to map with toggle functionality
function addMapLegend(map, containerId) {
    // Check if legend already exists
    const existingLegend = document.querySelector(`#${containerId} .map-legend`);
    if (existingLegend) {
        existingLegend.remove();
    }

    // Get property type from container ID
    const propertyType = containerId.replace('Map', '');

    // Create symbolization dropdown
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'symbolization-dropdown';
    dropdownContainer.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: white;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        font-family: 'IBM Plex Sans', sans-serif;
        font-size: 12px;
        z-index: 1;
        padding: 8px 10px;
    `;

    const label = document.createElement('label');
    label.textContent = 'Color by: ';
    label.style.cssText = `
        font-weight: 500;
        color: #333;
        margin-right: 6px;
    `;

    const select = document.createElement('select');
    select.style.cssText = `
        padding: 4px 8px;
        border: 1px solid #ddd;
        border-radius: 3px;
        font-size: 12px;
        cursor: pointer;
        background: white;
    `;

    // Add options
    SYMBOLIZATION_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === mapSymbolization[propertyType]) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Handle change
    select.addEventListener('change', (e) => {
        const newField = e.target.value;
        changeMapSymbolization(map, propertyType, newField, containerId);
    });

    dropdownContainer.appendChild(label);
    dropdownContainer.appendChild(select);

    // Create legend container
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.style.cssText = `
        position: absolute;
        bottom: 30px;
        right: 10px;
        background: white;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        font-family: 'IBM Plex Sans', sans-serif;
        font-size: 12px;
        z-index: 1;
        max-width: 180px;
        overflow: hidden;
    `;

    // Add header with collapse/expand button
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 10px 12px;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
    `;

    const title = document.createElement('div');
    const currentField = mapSymbolization[propertyType] || 'Zone';
    const currentOption = SYMBOLIZATION_OPTIONS.find(opt => opt.value === currentField);
    title.textContent = currentOption ? currentOption.label : 'Legend';
    title.style.cssText = `
        font-weight: 600;
        font-size: 13px;
        color: #333;
    `;

    const toggleIcon = document.createElement('div');
    toggleIcon.textContent = '▼';
    toggleIcon.style.cssText = `
        font-size: 10px;
        color: #666;
        transition: transform 0.2s;
    `;

    header.appendChild(title);
    header.appendChild(toggleIcon);
    legend.appendChild(header);

    // Create content container
    const content = document.createElement('div');
    content.className = 'legend-content';
    content.style.cssText = `
        padding: 12px;
        max-height: 300px;
        overflow-y: auto;
    `;

    // Build legend based on symbolization type
    if (currentOption && currentOption.type === 'categorical') {
        buildCategoricalLegend(content, currentField, currentOption, map, propertyType);
    } else if (currentOption && currentOption.type === 'continuous') {
        buildContinuousLegend(content, currentField, currentOption);
    } else {
        // Default to zone legend
        buildCategoricalLegend(content, 'Zone', SYMBOLIZATION_OPTIONS[0], map, propertyType);
    }

    legend.appendChild(content);

    // Toggle expand/collapse
    let isExpanded = true;
    header.addEventListener('click', () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            content.style.display = 'block';
            toggleIcon.style.transform = 'rotate(0deg)';
        } else {
            content.style.display = 'none';
            toggleIcon.style.transform = 'rotate(-90deg)';
        }
    });

    // Add dropdown and legend to map container
    const mapContainer = document.getElementById(containerId);
    if (mapContainer) {
        mapContainer.appendChild(dropdownContainer);
        mapContainer.appendChild(legend);
    }
}

// Change map symbolization
function changeMapSymbolization(map, propertyType, field, containerId) {
    // Update tracking
    mapSymbolization[propertyType] = field;
    
    // Get symbolization option
    const symbolOption = SYMBOLIZATION_OPTIONS.find(opt => opt.value === field);
    if (!symbolOption) return;
    
    // Create new color expression
    const newColorExpression = createColorExpression(field, symbolOption);
    
    // Update map paint property
    if (map.getLayer('parcels-fill')) {
        map.setPaintProperty('parcels-fill', 'fill-color', newColorExpression);
    }
    
    // Rebuild legend
    addMapLegend(map, containerId);
}

// Build categorical legend (zones, property types, etc.)
function buildCategoricalLegend(content, field, symbolOption, map, propertyType) {
    const colors = symbolOption.colors || {};
    
    // Get categories dynamically from colors
    const categories = Object.entries(colors)
        .filter(([key]) => key !== 'default')
        .map(([value, color]) => ({
            value,
            color,
            label: value === 'B' ? 'Business' : value === 'I' ? 'Industrial' : value
        }));
    
    // Add 'Other' at the end
    if (colors['default']) {
        categories.push({ value: 'default', color: colors['default'], label: 'Other' });
    }

    // Track visibility state
    const visibility = {};

    categories.forEach(({ value, color, label }) => {
        visibility[value] = true;

        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            align-items: center;
            margin-bottom: 6px;
            cursor: pointer;
            padding: 4px;
            border-radius: 3px;
            transition: background 0.15s;
        `;

        item.addEventListener('mouseenter', () => item.style.background = '#f8f9fa');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.style.cssText = 'margin-right: 8px; cursor: pointer;';

        const colorBox = document.createElement('div');
        colorBox.style.cssText = `
            width: 20px;
            height: 14px;
            background: ${color};
            margin-right: 8px;
            border-radius: 2px;
            border: 1px solid rgba(0,0,0,0.1);
            flex-shrink: 0;
        `;

        const labelText = document.createElement('span');
        labelText.textContent = label;
        labelText.style.cssText = 'color: #666; font-size: 12px; flex: 1;';

        const toggleItem = () => {
            visibility[value] = !visibility[value];
            checkbox.checked = visibility[value];
            
            if (!visibility[value]) {
                colorBox.style.opacity = '0.3';
                labelText.style.opacity = '0.5';
            } else {
                colorBox.style.opacity = '1';
                labelText.style.opacity = '1';
            }
            
            updateCategoricalMapFilter(map, field, visibility, propertyType);
        };

        checkbox.addEventListener('change', toggleItem);
        item.addEventListener('click', (e) => {
            if (e.target !== checkbox) toggleItem();
        });

        item.appendChild(checkbox);
        item.appendChild(colorBox);
        item.appendChild(labelText);
        content.appendChild(item);
    });
}

// Build continuous legend (gradients for values)
function buildContinuousLegend(content, field, symbolOption) {
    const colorRamp = symbolOption.colorRamp;
    
    const gradientBar = document.createElement('div');
    gradientBar.style.cssText = `
        width: 100%;
        height: 20px;
        background: linear-gradient(to right, ${colorRamp.join(', ')});
        border-radius: 3px;
        margin-bottom: 8px;
        border: 1px solid rgba(0,0,0,0.1);
    `;
    content.appendChild(gradientBar);
    
    const labelsContainer = document.createElement('div');
    labelsContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #666;
    `;
    
    let minLabel, maxLabel;
    if (field.includes('Assessed')) {
        minLabel = '$0';
        maxLabel = '$1M+';
    } else if (field.includes('Year')) {
        minLabel = '1800';
        maxLabel = '2025';
    } else {
        minLabel = 'Low';
        maxLabel = 'High';
    }
    
    const minSpan = document.createElement('span');
    minSpan.textContent = minLabel;
    const maxSpan = document.createElement('span');
    maxSpan.textContent = maxLabel;
    
    labelsContainer.appendChild(minSpan);
    labelsContainer.appendChild(maxSpan);
    content.appendChild(labelsContainer);
}

// Update map filter for categorical fields
function updateCategoricalMapFilter(map, field, visibility, propertyType) {
    const visibleValues = Object.entries(visibility)
        .filter(([value, visible]) => visible && value !== 'default')
        .map(([value]) => value);
    
    let categoryFilter;
    if (visibleValues.length === 0) {
        categoryFilter = ['==', ['get', field], 'NONE'];
    } else {
        categoryFilter = ['any', 
            ...visibleValues.map(value => ['==', ['get', field], value])
        ];
        
        if (visibility['default']) {
            const knownValues = Object.keys(visibility).filter(v => v !== 'default');
            categoryFilter = ['any',
                ...visibleValues.map(value => ['==', ['get', field], value]),
                ['!', ['in', ['get', field], ['literal', knownValues]]]
            ];
        }
    }
    
    const propertyTypeFilter = createPropertyFilter(propertyType);
    const combinedFilter = propertyTypeFilter[0] === 'all' 
        ? categoryFilter 
        : ['all', propertyTypeFilter, categoryFilter];
    
    if (map.getLayer('parcels-fill')) {
        map.setFilter('parcels-fill', combinedFilter);
    }
    if (map.getLayer('parcels-outline')) {
        map.setFilter('parcels-outline', combinedFilter);
    }
}

// Update map filter based on zone visibility
function updateMapFilter(map, zoneVisibility) {
    // Get visible zones
    const visibleZones = Object.entries(zoneVisibility)
        .filter(([zone, visible]) => visible && zone !== 'default')
        .map(([zone]) => zone);
    
    // Build filter expression
    let zoneFilter;
    if (visibleZones.length === 0) {
        // If no zones selected, show nothing
        zoneFilter = ['==', ['get', 'Zone'], 'NONE'];
    } else if (visibleZones.length === Object.keys(zoneVisibility).length - 1) {
        // If all zones selected (except default), show all
        zoneFilter = ['all'];
    } else {
        // Show only selected zones
        zoneFilter = ['any', 
            ...visibleZones.map(zone => ['==', ['get', 'Zone'], zone])
        ];
        
        // Include 'Other' if selected
        if (zoneVisibility['default']) {
            const knownZones = Object.keys(ZONE_COLORS).filter(z => z !== 'default');
            zoneFilter = ['any',
                ...visibleZones.map(zone => ['==', ['get', 'Zone'], zone]),
                ['!', ['in', ['get', 'Zone'], ['literal', knownZones]]]
            ];
        }
    }
    
    // Combine with property type filter
    const propertyTypeFilter = createPropertyFilter(map._propertyType || 'residential');
    const combinedFilter = propertyTypeFilter[0] === 'all' 
        ? zoneFilter 
        : ['all', propertyTypeFilter, zoneFilter];
    
    // Update both layers
    if (map.getLayer('parcels-fill')) {
        map.setFilter('parcels-fill', combinedFilter);
    }
    if (map.getLayer('parcels-outline')) {
        map.setFilter('parcels-outline', combinedFilter);
    }
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
                acreage: parseFloat(props['Land Acres']) || 0,
                style: props['Style Description'] || 'Unknown',
                neighborhood: props['Neighborhood'] || 'Unknown',
                zone: props['Zone'] || 'Unknown',
                bedrooms: parseInt(props['Number of Bedroom']) || 0,
                bathrooms: parseFloat(props['Number of Bathrooms']) || 0,
                sqft: parseFloat(props['Gross Area of Primary Building']) || 0,
                yearBuilt: parseInt(props['Effective Year Built']) || 0,
                stateUse: props['State Use Description'] || 'Unknown',
                frameType: props['Frame Type'] || 'Unknown'
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
    
    // Additional property details
    const style = props['Style Description'] || '–';
    const bedrooms = props['Number of Bedroom'] || '–';
    const bathrooms = props['Number of Bathrooms'] || '–';
    const sqft = props['Gross Area of Primary Building'] ? parseFloat(props['Gross Area of Primary Building']).toLocaleString() : '–';
    const yearBuilt = props['Effective Year Built'] || '–';
    const acres = props['Land Acres'] ? parseFloat(props['Land Acres']).toFixed(2) : '–';

    new maplibregl.Popup()
        .setLngLat(lngLat)
        .setHTML(`
            <div style="min-width:240px;font-size:13px;font-family:sans-serif;">
                <div style="font-weight:700;margin-bottom:6px;">
                    ${props['Property Address'] || 'Unknown'}
                </div>
                <div style="color:${color};font-weight:600;font-size:11px;
                     text-transform:uppercase;margin-bottom:8px;">
                    ${propertyType} • Parcel ${props['Parcel ID'] || ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;font-size:12px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #eee;">
                    <div><span style="color:#666;">Style:</span> ${style}</div>
                    <div><span style="color:#666;">Built:</span> ${yearBuilt}</div>
                    <div><span style="color:#666;">Beds:</span> ${bedrooms}</div>
                    <div><span style="color:#666;">Baths:</span> ${bathrooms}</div>
                    <div><span style="color:#666;">Sq Ft:</span> ${sqft}</div>
                    <div><span style="color:#666;">Acres:</span> ${acres}</div>
                </div>
                <table style="width:100%;border-collapse:collapse;">
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
    console.log(`🔄 Creating residential charts with ${parcels.length} parcels`);
    
    // Average Building Assessment by Design (residentialDesignChart exists in HTML)
    const avgByStyle = {};
    const countByStyle = {};
    
    parcels.forEach(p => {
        if (p.style && p.style !== 'Unknown' && p.assessed2025 > 0) {
            if (!avgByStyle[p.style]) {
                avgByStyle[p.style] = 0;
                countByStyle[p.style] = 0;
            }
            avgByStyle[p.style] += p.assessed2025;
            countByStyle[p.style]++;
        }
    });
    
    Object.keys(avgByStyle).forEach(style => {
        avgByStyle[style] = avgByStyle[style] / countByStyle[style];
    });
    
    const topAvgStyles = Object.entries(avgByStyle)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    console.log(`Residential design chart data: ${topAvgStyles.length} styles`);
    
    createOrUpdateChart('residentialDesignChart', {
        type: 'bar',
        data: {
            labels: topAvgStyles.map(s => s[0]),
            datasets: [{
                label: 'Average Assessment',
                data: topAvgStyles.map(s => Math.round(s[1])),
                backgroundColor: COLORS.residential
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `$${context.parsed.x.toLocaleString()}`
                    }
                }
            },
            scales: {
                x: { 
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => '$' + (value / 1000).toFixed(0) + 'K'
                    }
                }
            }
        }
    });
    
    // Scatter plot (residentialScatter exists in HTML)
    createScatterPlot('residentialScatter', parcels, 'acreage', 'assessed2025', 
        'Acreage', 'Assessment Value', COLORS.residential);
}

function updateCondoCharts(parcels) {
    // Average by Style (condoStyleChart exists)
    const avgByStyle = {};
    const countByStyle = {};
    
    parcels.forEach(p => {
        if (p.style && p.style !== 'Unknown') {
            if (!avgByStyle[p.style]) {
                avgByStyle[p.style] = 0;
                countByStyle[p.style] = 0;
            }
            avgByStyle[p.style] += p.assessed2025;
            countByStyle[p.style]++;
        }
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
                data: topStyles.map(s => Math.round(s[1])),
                backgroundColor: COLORS.condo
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `$${context.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => '$' + (value / 1000).toFixed(0) + 'K'
                    }
                }
            }
        }
    });
    
    // Unit Location Distribution (condoLocationChart exists - using Neighborhood)
    const locationCount = {};
    parcels.forEach(p => {
        if (p.neighborhood && p.neighborhood !== 'Unknown') {
            locationCount[p.neighborhood] = (locationCount[p.neighborhood] || 0) + 1;
        }
    });
    
    const topLocations = Object.entries(locationCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    
    createOrUpdateChart('condoLocationChart', {
        type: 'doughnut',
        data: {
            labels: topLocations.map(l => l[0]),
            datasets: [{
                data: topLocations.map(l => l[1]),
                backgroundColor: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fed7aa', '#ffedd5', '#fb923c', '#fdba74']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    
    // Scatter plot (condoScatter exists)
    createScatterPlot('condoScatter', parcels, 'sqft', 'assessed2025',
        'Finished Area (Sq Ft)', 'Assessment Value', COLORS.condo);
}

function updateCommercialCharts(parcels) {
    // Building Assessment by Class (using commercialClassChart)
    // Group by Zone for class distribution
    const zoneCount = {};
    parcels.forEach(p => {
        if (p.zone && p.zone !== 'Unknown') {
            zoneCount[p.zone] = (zoneCount[p.zone] || 0) + 1;
        }
    });
    
    const topZones = Object.entries(zoneCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    createOrUpdateChart('commercialClassChart', {
        type: 'bar',
        data: {
            labels: topZones.map(z => z[0]),
            datasets: [{
                label: 'Count',
                data: topZones.map(z => z[1]),
                backgroundColor: COLORS.commercial
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } }
        }
    });
    
    // Use Category Distribution (using commercialUseChart and State Use Description)
    const useCount = {};
    parcels.forEach(p => {
        if (p.stateUse && p.stateUse !== 'Unknown') {
            useCount[p.stateUse] = (useCount[p.stateUse] || 0) + 1;
        }
    });
    
    const topUses = Object.entries(useCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    createOrUpdateChart('commercialUseChart', {
        type: 'bar',
        data: {
            labels: topUses.map(u => u[0]),
            datasets: [{
                label: 'Count',
                data: topUses.map(u => u[1]),
                backgroundColor: COLORS.commercial
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } }
        }
    });
    
    // Scatter - commercialScatter
    createScatterPlot('commercialScatter', parcels, 'sqft', 'assessed2025',
        'Building Area (Sq Ft)', 'Assessment', COLORS.commercial);
}

function updateVacantCharts(parcels) {
    // Primary Use Distribution (vacantUseChart exists - using State Use Description)
    const useCount = {};
    parcels.forEach(p => {
        if (p.stateUse && p.stateUse !== 'Unknown') {
            useCount[p.stateUse] = (useCount[p.stateUse] || 0) + 1;
        }
    });
    
    const topUses = Object.entries(useCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    createOrUpdateChart('vacantUseChart', {
        type: 'bar',
        data: {
            labels: topUses.map(u => u[0]),
            datasets: [{
                label: 'Count',
                data: topUses.map(u => u[1]),
                backgroundColor: COLORS.vacant
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } }
        }
    });
    
    // Assessment Value vs Acreage (vacantScatter exists)
    createScatterPlot('vacantScatter', parcels, 'acreage', 'assessed2025',
        'Acreage', 'Assessment Value', COLORS.vacant);
}

function createOrUpdateChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`❌ Canvas not found: ${canvasId}`);
        return;
    }
    
    console.log(`✓ Creating chart: ${canvasId}`);
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    try {
        charts[canvasId] = new Chart(canvas, config);
        console.log(`✓ Chart created successfully: ${canvasId}`);
    } catch (error) {
        console.error(`❌ Error creating chart ${canvasId}:`, error);
    }
}

function createScatterPlot(canvasId, parcels, xField, yField, xLabel, yLabel, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`❌ Canvas not found for scatter: ${canvasId}`);
        return;
    }
    
    // Filter out parcels with invalid/zero values
    const data = parcels
        .filter(p => p[xField] > 0 && p[yField] > 0)
        .map(p => ({ x: p[xField], y: p[yField] }));
    
    console.log(`Creating scatter plot ${canvasId}: ${data.length} points from ${parcels.length} parcels`);
    
    if (data.length === 0) {
        console.warn(`⚠️ No valid data for scatter plot: ${canvasId} (all values were 0 or negative)`);
        return;
    }
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    try {
        charts[canvasId] = new Chart(canvas, {
            type: 'scatter',
            data: {
                datasets: [{
                    data: data,
                    backgroundColor: color + '80',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { 
                        title: { display: true, text: xLabel },
                        beginAtZero: true
                    },
                    y: { 
                        title: { display: true, text: yLabel },
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => yField.includes('assessed') ? '$' + (value / 1000).toFixed(0) + 'K' : value
                        }
                    }
                }
            }
        });
        console.log(`✓ Scatter plot created: ${canvasId}`);
    } catch (error) {
        console.error(`❌ Error creating scatter plot ${canvasId}:`, error);
    }
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
            <div style="background:#f9fafb;border-left:3px solid #0979e9;padding:1rem;margin-bottom:1rem;">
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
