// Property Assessment Dashboard - GeoJSON Version
// Reads all properties from a single GeoJSON file

let allProperties = [];
let propertiesByType = {
    residential: [],
    condo: [],
    commercial: [],
    vacant: []
};

let statistics = {
    residential: { totalAssessment2020: 0, totalAssessment2025: 0, parcelCount: 0 },
    condo: { totalAssessment2020: 0, totalAssessment2025: 0, parcelCount: 0 },
    commercial: { totalAssessment2020: 0, totalAssessment2025: 0, parcelCount: 0 },
    vacant: { totalAssessment2020: 0, totalAssessment2025: 0, parcelCount: 0 }
};
let residentialMap, condoMap, commercialMap, vacantMap;
// Configuration: Map your shapefile field names to what the app expects
const FIELD_MAPPING = {
    parcelId: 'parcelId',           // Your parcel ID field name
    address: 'address',             // Your address field name
    owner: 'owner',                 // Your owner field name
    propertyType: 'propertyType',   // Field that indicates Residential/Condo/Commercial/Vacant
    
    // Residential/Vacant fields
    neighborhood: 'neighborhood',
    designStyle: 'designStyle',
    acreage: 'acreage',
    bedrooms: 'bedrooms',
    bathrooms: 'bathrooms',
    
    // Condo fields
    complex: 'complex',
    style: 'style',
    location: 'location',
    
    // Commercial fields
    zone: 'zone',
    buildingClass: 'buildingClass',
    useCategory: 'useCategory',
    
    // Common fields
    sqft: 'sqft',
    yearBuilt: 'yearBuilt',
    assessment2020: 'assessment2020',
    assessment2025: 'assessment2025'
};

// Wait for all resources to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, waiting for libraries...');
    
    const checkLibraries = setInterval(function() {
        if (typeof Chart !== 'undefined' && typeof L !== 'undefined') {
            clearInterval(checkLibraries);
            console.log('All libraries loaded, loading property data...');
            loadPropertyData();
        }
    }, 100);
});

// Load GeoJSON data
async function loadPropertyData() {
    try {
        console.log('Fetching properties.geojson...');
        const response = await fetch('properties.geojson');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const geojson = await response.json();
        console.log(`Loaded ${geojson.features.length} properties from GeoJSON`);
        
        // Process features
        processGeoJSON(geojson);
        
        // Initialize app
        initializeApp();
        
    } catch (error) {
        console.error('Error loading property data:', error);
        alert('Error loading property data. Make sure properties.geojson exists in the same directory.');
    }
}

// Process GeoJSON and categorize properties
function processGeoJSON(geojson) {
    geojson.features.forEach(feature => {
        const props = feature.properties;
        const geometry = feature.geometry;
        
        // Get centroid coordinates
        let lat, lng;
        if (props.lat && props.lng) {
            lat = props.lat;
            lng = props.lng;
        } else if (geometry.type === 'Point') {
            lng = geometry.coordinates[0];
            lat = geometry.coordinates[1];
        } else if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            // Calculate centroid (simple average of coordinates)
            const coords = geometry.type === 'Polygon' 
                ? geometry.coordinates[0] 
                : geometry.coordinates[0][0];
            lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
            lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        }
        
        // Create property object
        const property = {
            parcelId: props[FIELD_MAPPING.parcelId] || 'Unknown',
            address: props[FIELD_MAPPING.address] || 'Unknown',
            owner: props[FIELD_MAPPING.owner] || 'Unknown',
            propertyType: normalizePropertyType(props[FIELD_MAPPING.propertyType]),
            
            // Optional fields
            neighborhood: props[FIELD_MAPPING.neighborhood],
            designStyle: props[FIELD_MAPPING.designStyle],
            acreage: parseFloat(props[FIELD_MAPPING.acreage]) || 0,
            bedrooms: parseInt(props[FIELD_MAPPING.bedrooms]) || 0,
            bathrooms: parseFloat(props[FIELD_MAPPING.bathrooms]) || 0,
            complex: props[FIELD_MAPPING.complex],
            style: props[FIELD_MAPPING.style],
            location: props[FIELD_MAPPING.location],
            zone: props[FIELD_MAPPING.zone],
            buildingClass: props[FIELD_MAPPING.buildingClass],
            useCategory: props[FIELD_MAPPING.useCategory],
            sqft: parseInt(props[FIELD_MAPPING.sqft]) || 0,
            yearBuilt: parseInt(props[FIELD_MAPPING.yearBuilt]) || 0,
            
            // Assessment values
            assessment2020: parseFloat(props[FIELD_MAPPING.assessment2020]) || 0,
            assessment2025: parseFloat(props[FIELD_MAPPING.assessment2025]) || 0,
            
            // Coordinates
            lat: lat,
            lng: lng,
            
            // Keep original geometry for polygon display if needed
            geometry: geometry
        };
        
        allProperties.push(property);
        
        // Categorize by type
        const type = property.propertyType.toLowerCase();
        if (propertiesByType[type]) {
            propertiesByType[type].push(property);
        }
    });
    
    console.log('Properties by type:', {
        residential: propertiesByType.residential.length,
        condo: propertiesByType.condo.length,
        commercial: propertiesByType.commercial.length,
        vacant: propertiesByType.vacant.length
    });
}

// Normalize property type names
function normalizePropertyType(type) {
    if (!type) return 'residential';
    
    const typeStr = type.toString().toLowerCase();
    
    // Residential variations
    if (typeStr.includes('res') || typeStr.includes('single') || typeStr.includes('family')) {
        return 'residential';
    }
    // Condo variations
    if (typeStr.includes('condo') || typeStr.includes('town')) {
        return 'condo';
    }
    // Commercial variations
    if (typeStr.includes('comm') || typeStr.includes('business') || typeStr.includes('industrial')) {
        return 'commercial';
    }
    // Vacant variations
    if (typeStr.includes('vac') || typeStr.includes('land')) {
        return 'vacant';
    }
    
    return 'residential'; // default
}

function initializeApp() {
    // Calculate statistics
    calculateStatistics();
    
    // Initialize map
    initializeMap();
    
    // Initialize all charts
    initializeCharts();
    
    // Update statistics in UI
    updateStatisticsUI();
    
    console.log('Application initialized successfully');
}

// Calculate statistics from property data
function calculateStatistics() {
    ['residential', 'condo', 'commercial', 'vacant'].forEach(type => {
        const properties = propertiesByType[type];
        statistics[type] = {
            totalAssessment2020: properties.reduce((sum, p) => sum + p.assessment2020, 0),
            totalAssessment2025: properties.reduce((sum, p) => sum + p.assessment2025, 0),
            parcelCount: properties.length
        };
    });
    
    console.log('Statistics calculated:', statistics);
}

// Update statistics in the UI
function updateStatisticsUI() {
    const formatCurrency = (num) => '$' + num.toLocaleString('en-US');
    const formatNumber = (num) => num.toLocaleString('en-US');
    
    function updateStatCard(tabName, old2020, new2025, count) {
        const tabContent = document.getElementById(`${tabName}-content`);
        if (tabContent) {
            const statCards = tabContent.querySelectorAll('.stat-value');
            if (statCards.length >= 3) {
                statCards[0].textContent = formatCurrency(old2020);
                statCards[1].textContent = formatCurrency(new2025);
                statCards[2].textContent = formatNumber(count);
            }
        }
    }
    
    updateStatCard('residential', statistics.residential.totalAssessment2020, 
                   statistics.residential.totalAssessment2025, 
                   statistics.residential.parcelCount);
    
    updateStatCard('condo', statistics.condo.totalAssessment2020, 
                   statistics.condo.totalAssessment2025, 
                   statistics.condo.parcelCount);
    
    updateStatCard('commercial', statistics.commercial.totalAssessment2020, 
                   statistics.commercial.totalAssessment2025, 
                   statistics.commercial.parcelCount);
    
    updateStatCard('vacant', statistics.vacant.totalAssessment2020, 
                   statistics.vacant.totalAssessment2025, 
                   statistics.vacant.parcelCount);
}

// Initialize Leaflet Map with all properties
function initializeMap() {
    try {
        // Initialize maps for each tab
        residentialMap = L.map('residentialMap').setView([41.698, -72.731], 13);
        condoMap = L.map('condoMap').setView([41.698, -72.731], 13);
        commercialMap = L.map('commercialMap').setView([41.698, -72.731], 13);
        vacantMap = L.map('vacantMap').setView([41.698, -72.731], 13);

        // Create separate tile layer for each map (can't share!)
        const tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const tileLayerOptions = {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        };

        L.tileLayer(tileLayerUrl, tileLayerOptions).addTo(residentialMap);
        L.tileLayer(tileLayerUrl, tileLayerOptions).addTo(condoMap);
        L.tileLayer(tileLayerUrl, tileLayerOptions).addTo(commercialMap);
        L.tileLayer(tileLayerUrl, tileLayerOptions).addTo(vacantMap);

        const colors = {
            residential: '#e55d75',
            condo: '#f59e0b',
            commercial: '#6b8cae',
            vacant: '#10b981'
        };

        // Add markers to each map individually
        propertiesByType.residential.forEach(prop => addMarker(prop, residentialMap, colors.residential));
        propertiesByType.condo.forEach(prop => addMarker(prop, condoMap, colors.condo));
        propertiesByType.commercial.forEach(prop => addMarker(prop, commercialMap, colors.commercial));
        propertiesByType.vacant.forEach(prop => addMarker(prop, vacantMap, colors.vacant));

        console.log('All maps initialized successfully');
    } catch (error) {
        console.error('Error initializing maps:', error);
    }
}

// Helper function to add markers
function addMarker(prop, map, color) {
    if (!prop.lat || !prop.lng) return;

    const change = prop.assessment2020 > 0
        ? ((prop.assessment2025 - prop.assessment2020) / prop.assessment2020 * 100).toFixed(1)
        : 0;

    const popupContent = `
        <div style="min-width: 220px;">
            <strong>${prop.address}</strong><br>
            <span style="color: ${color}; font-weight: bold;">${prop.propertyType.toUpperCase()}</span><br>
            <strong>Parcel:</strong> ${prop.parcelId}<br>
            ${prop.designStyle ? `<strong>Style:</strong> ${prop.designStyle}<br>` : ''}
            ${prop.sqft > 0 ? `<strong>Sq Ft:</strong> ${prop.sqft.toLocaleString()}<br>` : ''}
            <strong>2020:</strong> $${prop.assessment2020.toLocaleString()}<br>
            <strong>2025:</strong> $${prop.assessment2025.toLocaleString()}<br>
            <strong>Change:</strong> <span style="color: ${change > 0 ? 'green' : 'red'}">${change > 0 ? '+' : ''}${change}%</span>
        </div>
    `;

    L.circleMarker([prop.lat, prop.lng], {
        radius: 6,
        fillColor: color,
        color: '#ffffff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7
    }).bindPopup(popupContent).addTo(map);
}


// Aggregate properties by field
function aggregateByField(properties, field, valueField = 'assessment2025') {
    const aggregated = {};
    properties.forEach(prop => {
        const key = prop[field] || 'Unknown';
        if (!aggregated[key]) {
            aggregated[key] = { sum: 0, count: 0 };
        }
        aggregated[key].sum += prop[valueField];
        aggregated[key].count += 1;
    });
    
    return Object.entries(aggregated).map(([key, value]) => ({
        label: key,
        value: value.sum / value.count,
        count: value.count
    })).sort((a, b) => b.value - a.value);
}

// Initialize all charts (same as before but using propertiesByType)
function initializeCharts() {
    // Residential Scatter
    new Chart(document.getElementById('residentialScatter'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Properties',
                data: propertiesByType.residential.map(p => ({ x: p.acreage, y: p.assessment2025 })),
                backgroundColor: 'rgba(229, 93, 117, 0.5)',
                borderColor: 'rgba(229, 93, 117, 1)',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'Acreage' } },
                y: { 
                    title: { display: true, text: 'Assessed Value ($)' },
                    ticks: { callback: value => '$' + (value/1000).toFixed(0) + 'K' }
                }
            }
        }
    });
    
    // Residential Design Chart
    const designData = aggregateByField(propertiesByType.residential.filter(p => p.designStyle), 'designStyle');
    new Chart(document.getElementById('residentialDesignChart'), {
        type: 'bar',
        data: {
            labels: designData.map(d => d.label),
            datasets: [{
                data: designData.map(d => d.value),
                backgroundColor: 'rgba(229, 93, 117, 0.8)'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { callback: value => '$' + (value/1000).toFixed(0) + 'K' } } }
        }
    });
    
    // Condo Scatter
    new Chart(document.getElementById('condoScatter'), {
        type: 'scatter',
        data: {
            datasets: [{
                data: propertiesByType.condo.map(p => ({ x: p.sqft, y: p.assessment2025 })),
                backgroundColor: 'rgba(245, 158, 11, 0.5)',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'Finished Area (sq ft)' } },
                y: { 
                    title: { display: true, text: 'Value ($)' },
                    ticks: { callback: value => '$' + (value/1000).toFixed(0) + 'K' }
                }
            }
        }
    });
    
    // Condo Style
    const styleData = aggregateByField(propertiesByType.condo.filter(p => p.style), 'style');
    new Chart(document.getElementById('condoStyleChart'), {
        type: 'doughnut',
        data: {
            labels: styleData.map(d => d.label),
            datasets: [{
                data: styleData.map(d => d.count),
                backgroundColor: ['#f59e0b', '#ea580c', '#c2410c', '#92400e', '#78350f']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
    
    // Condo Location
    const locationData = aggregateByField(propertiesByType.condo.filter(p => p.location), 'location');
    new Chart(document.getElementById('condoLocationChart'), {
        type: 'bar',
        data: {
            labels: locationData.map(d => d.label),
            datasets: [{ data: locationData.map(d => d.value), backgroundColor: 'rgba(245, 158, 11, 0.8)' }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { callback: value => '$' + (value/1000).toFixed(0) + 'K' } } }
        }
    });
    
    // Commercial Scatter
    new Chart(document.getElementById('commercialScatter'), {
        type: 'scatter',
        data: {
            datasets: [{
                data: propertiesByType.commercial.map(p => ({ x: p.sqft, y: p.assessment2025 })),
                backgroundColor: 'rgba(107, 140, 174, 0.5)',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'Sq Ft' } },
                y: { 
                    title: { display: true, text: 'Value ($)' },
                    ticks: { callback: value => '$' + (value/1000000).toFixed(1) + 'M' }
                }
            }
        }
    });
    
    // Commercial Class
    const classData = aggregateByField(propertiesByType.commercial.filter(p => p.buildingClass), 'buildingClass');
    new Chart(document.getElementById('commercialClassChart'), {
        type: 'doughnut',
        data: {
            labels: classData.map(d => d.label),
            datasets: [{
                data: classData.map(d => d.count),
                backgroundColor: ['#6b8cae', '#4a6b8a', '#3a5a7a', '#2a4a6a', '#1a3a5a']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
    
    // Commercial Use
    const useData = aggregateByField(propertiesByType.commercial.filter(p => p.useCategory), 'useCategory');
    new Chart(document.getElementById('commercialUseChart'), {
        type: 'bar',
        data: {
            labels: useData.map(d => d.label),
            datasets: [{ data: useData.map(d => d.value), backgroundColor: 'rgba(107, 140, 174, 0.8)' }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { callback: value => '$' + (value/1000000).toFixed(1) + 'M' } } }
        }
    });
    
    // Vacant Scatter
    new Chart(document.getElementById('vacantScatter'), {
        type: 'scatter',
        data: {
            datasets: [{
                data: propertiesByType.vacant.map(p => ({ x: p.acreage, y: p.assessment2025 })),
                backgroundColor: 'rgba(16, 185, 129, 0.5)',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'Acres' } },
                y: { 
                    title: { display: true, text: 'Value ($)' },
                    ticks: { callback: value => '$' + (value/1000).toFixed(0) + 'K' }
                }
            }
        }
    });
    
    // Vacant Primary Use
    const primaryUseData = {};
    propertiesByType.vacant.forEach(prop => {
        const use = prop.useCategory || prop.zone || 'Unknown';
        primaryUseData[use] = (primaryUseData[use] || 0) + prop.assessment2025;
    });
    
    const sortedUseData = Object.entries(primaryUseData).sort((a, b) => b[1] - a[1]);
    
    new Chart(document.getElementById('vacantUseChart'), {
        type: 'bar',
        data: {
            labels: sortedUseData.map(d => d[0]),
            datasets: [{ data: sortedUseData.map(d => d[1]), backgroundColor: 'rgba(16, 185, 129, 0.8)' }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { callback: value => '$' + (value/1000).toFixed(0) + 'K' } } }
        }
    });
    
    console.log('All charts initialized from GeoJSON data');
}

function switchTab(tabName) {
    // Update active tab button
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');

    // Show only the selected tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const targetContent = document.getElementById(`${tabName}-content`);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    // Fix map display after tab switch
    setTimeout(() => {
        if (tabName === 'residential' && residentialMap) {
            residentialMap.invalidateSize();
        } else if (tabName === 'condo' && condoMap) {
            condoMap.invalidateSize();
        } else if (tabName === 'commercial' && commercialMap) {
            commercialMap.invalidateSize();
        } else if (tabName === 'vacant' && vacantMap) {
            vacantMap.invalidateSize();
        }
    }, 100);
}
