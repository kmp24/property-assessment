// Property Assessment Dashboard - Diagnostic Version with Fallback Data

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

let map;

const FIELD_MAPPING = {
    parcelId: 'parcelId',
    address: 'address',
    owner: 'owner',
    propertyType: 'propertyType',
    neighborhood: 'neighborhood',
    designStyle: 'designStyle',
    acreage: 'acreage',
    bedrooms: 'bedrooms',
    bathrooms: 'bathrooms',
    complex: 'complex',
    style: 'style',
    location: 'location',
    zone: 'zone',
    buildingClass: 'buildingClass',
    useCategory: 'useCategory',
    sqft: 'sqft',
    yearBuilt: 'yearBuilt',
    assessment2020: 'assessment2020',
    assessment2025: 'assessment2025'
};

// Fallback sample data
const SAMPLE_DATA = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "parcelId": "R001",
                "address": "123 Main Street",
                "owner": "Sample Property",
                "propertyType": "Residential",
                "designStyle": "Colonial",
                "acreage": 0.25,
                "bedrooms": 3,
                "bathrooms": 2,
                "sqft": 2000,
                "yearBuilt": 1995,
                "assessment2020": 250000,
                "assessment2025": 320000
            },
            "geometry": { "type": "Point", "coordinates": [-72.729, 41.698] }
        },
        {
            "type": "Feature",
            "properties": {
                "parcelId": "R002",
                "address": "456 Oak Avenue",
                "owner": "Sample Property",
                "propertyType": "Residential",
                "designStyle": "Ranch",
                "acreage": 0.35,
                "bedrooms": 4,
                "bathrooms": 2.5,
                "sqft": 2400,
                "yearBuilt": 2005,
                "assessment2020": 280000,
                "assessment2025": 355000
            },
            "geometry": { "type": "Point", "coordinates": [-72.735, 41.701] }
        },
        {
            "type": "Feature",
            "properties": {
                "parcelId": "C001",
                "address": "100 Condo Lane Unit 1A",
                "owner": "Sample Property",
                "propertyType": "Condo",
                "style": "Condominium",
                "location": "First Floor",
                "sqft": 1200,
                "bedrooms": 2,
                "bathrooms": 2,
                "yearBuilt": 2010,
                "assessment2020": 180000,
                "assessment2025": 245000
            },
            "geometry": { "type": "Point", "coordinates": [-72.730, 41.700] }
        },
        {
            "type": "Feature",
            "properties": {
                "parcelId": "COM001",
                "address": "500 Business Parkway",
                "owner": "Sample Property",
                "propertyType": "Commercial",
                "zone": "Business",
                "buildingClass": "Masonry",
                "useCategory": "Office",
                "sqft": 15000,
                "yearBuilt": 2000,
                "assessment2020": 1500000,
                "assessment2025": 1850000
            },
            "geometry": { "type": "Point", "coordinates": [-72.728, 41.695] }
        },
        {
            "type": "Feature",
            "properties": {
                "parcelId": "V001",
                "address": "Vacant Lot Development Road",
                "owner": "Sample Property",
                "propertyType": "Vacant",
                "zone": "Residential",
                "acreage": 2.5,
                "assessment2020": 95000,
                "assessment2025": 115000
            },
            "geometry": { "type": "Point", "coordinates": [-72.737, 41.702] }
        }
    ]
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('✓ DOM loaded, waiting for libraries...');
    showStatus('Loading libraries...');
    
    const checkLibraries = setInterval(function() {
        if (typeof Chart !== 'undefined' && typeof L !== 'undefined') {
            clearInterval(checkLibraries);
            console.log('✓ All libraries loaded');
            showStatus('Libraries loaded. Loading property data...');
            loadPropertyData();
        }
    }, 100);
});

function showStatus(message) {
    // Create status overlay if it doesn't exist
    let statusDiv = document.getElementById('status-overlay');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'status-overlay';
        statusDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            text-align: center;
            min-width: 300px;
        `;
        document.body.appendChild(statusDiv);
    }
    statusDiv.innerHTML = `<p style="margin: 0; font-size: 1.1rem;">${message}</p>`;
}

function hideStatus() {
    const statusDiv = document.getElementById('status-overlay');
    if (statusDiv) {
        statusDiv.remove();
    }
}

async function loadPropertyData() {
    try {
        console.log('Attempting to fetch properties.geojson...');
        showStatus('Fetching properties.geojson...');
        
        const response = await fetch('properties.geojson');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const geojson = await response.json();
        console.log(`✓ Loaded ${geojson.features.length} properties from GeoJSON`);
        showStatus(`Loaded ${geojson.features.length} properties. Processing...`);
        
        processGeoJSON(geojson);
        initializeApp();
        hideStatus();
        
    } catch (error) {
        console.error('❌ Error loading property data:', error);
        console.warn('⚠️ Using sample data instead');
        
        showStatus(`
            <div style="color: #d97706;">
                <p style="margin: 0 0 1rem 0; font-weight: bold;">⚠️ Could not load properties.geojson</p>
                <p style="margin: 0 0 1rem 0; font-size: 0.9rem;">Error: ${error.message}</p>
                <p style="margin: 0 0 1rem 0; font-size: 0.9rem;">Using sample data to demonstrate functionality.</p>
                <button onclick="hideStatus()" style="padding: 0.5rem 1rem; cursor: pointer; background: #6b8cae; color: white; border: none; border-radius: 4px;">Continue with Sample Data</button>
            </div>
        `);
        
        // Use sample data
        setTimeout(() => {
            processGeoJSON(SAMPLE_DATA);
            initializeApp();
        }, 1000);
    }
}

function processGeoJSON(geojson) {
    console.log('Processing GeoJSON features...');
    
    geojson.features.forEach(feature => {
        const props = feature.properties;
        const geometry = feature.geometry;
        
        let lat, lng;
        if (props.lat && props.lng) {
            lat = props.lat;
            lng = props.lng;
        } else if (geometry.type === 'Point') {
            lng = geometry.coordinates[0];
            lat = geometry.coordinates[1];
        } else if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            const coords = geometry.type === 'Polygon' 
                ? geometry.coordinates[0] 
                : geometry.coordinates[0][0];
            lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
            lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        }
        
        const property = {
            parcelId: props[FIELD_MAPPING.parcelId] || 'Unknown',
            address: props[FIELD_MAPPING.address] || 'Unknown',
            owner: props[FIELD_MAPPING.owner] || 'Unknown',
            propertyType: normalizePropertyType(props[FIELD_MAPPING.propertyType]),
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
            assessment2020: parseFloat(props[FIELD_MAPPING.assessment2020]) || 0,
            assessment2025: parseFloat(props[FIELD_MAPPING.assessment2025]) || 0,
            lat: lat,
            lng: lng,
            geometry: geometry
        };
        
        allProperties.push(property);
        
        const type = property.propertyType.toLowerCase();
        if (propertiesByType[type]) {
            propertiesByType[type].push(property);
        }
    });
    
    console.log('✓ Properties categorized:', {
        residential: propertiesByType.residential.length,
        condo: propertiesByType.condo.length,
        commercial: propertiesByType.commercial.length,
        vacant: propertiesByType.vacant.length
    });
}

function normalizePropertyType(type) {
    if (!type) return 'residential';
    
    const typeStr = type.toString().toLowerCase();
    
    if (typeStr.includes('res') || typeStr.includes('single') || typeStr.includes('family')) {
        return 'residential';
    }
    if (typeStr.includes('condo') || typeStr.includes('town')) {
        return 'condo';
    }
    if (typeStr.includes('comm') || typeStr.includes('business') || typeStr.includes('industrial')) {
        return 'commercial';
    }
    if (typeStr.includes('vac') || typeStr.includes('land')) {
        return 'vacant';
    }
    
    return 'residential';
}

function initializeApp() {
    console.log('Initializing application...');
    calculateStatistics();
    initializeMap();
    updateStatisticsUI();
    initializeCharts(); 
    console.log('✓ Application initialized successfully');
}

function calculateStatistics() {
    ['residential', 'condo', 'commercial', 'vacant'].forEach(type => {
        const properties = propertiesByType[type];
        statistics[type] = {
            totalAssessment2020: properties.reduce((sum, p) => sum + p.assessment2020, 0),
            totalAssessment2025: properties.reduce((sum, p) => sum + p.assessment2025, 0),
            parcelCount: properties.length
        };
    });
    console.log('✓ Statistics calculated');
}

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
    
    console.log('✓ Statistics UI updated');
}

function initializeMap() {
    try {
        map = L.map('map').setView([41.698, -72.731], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
        
        const colors = {
            residential: '#e55d75',
            condo: '#f59e0b',
            commercial: '#6b8cae',
            vacant: '#10b981'
        };
        
        let bounds = [];
        
        allProperties.forEach(prop => {
            if (prop.lat && prop.lng) {
                bounds.push([prop.lat, prop.lng]);
                
                const color = colors[prop.propertyType] || '#666666';
                const change = prop.assessment2020 > 0 
                    ? ((prop.assessment2025 - prop.assessment2020) / prop.assessment2020 * 100).toFixed(1)
                    : 0;
                
                const popupContent = `
                    <div style="min-width: 220px;">
                        <strong>${prop.address}</strong><br>
                        <span style="color: ${color}; font-weight: bold;">${prop.propertyType.toUpperCase()}</span><br>
                        <strong>Parcel:</strong> ${prop.parcelId}<br>
                        ${prop.sqft > 0 ? `<strong>Sq Ft:</strong> ${prop.sqft.toLocaleString()}<br>` : ''}
                        <strong>2020:</strong> $${prop.assessment2020.toLocaleString()}<br>
                        <strong>2025:</strong> $${prop.assessment2025.toLocaleString()}<br>
                        <strong>Change:</strong> <span style="color: ${change > 0 ? 'green' : 'red'}">${change > 0 ? '+' : ''}${change}%</span>
                    </div>
                `;
                
                const marker = L.circleMarker([prop.lat, prop.lng], {
                    radius: 6,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.7
                });
                
                marker.bindPopup(popupContent);
                marker.addTo(map);
            }
        });
        
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
        
        console.log('✓ Map initialized with', allProperties.length, 'markers');
    } catch (error) {
        console.error('❌ Error initializing map:', error);
    }
}

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

function initializeCharts() {
    console.log('Initializing charts...');
    
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
                    title: { display: true, text: 'Value ($)' },
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
                x: { title: { display: true, text: 'Sq Ft' } },
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
    
    console.log('✓ All charts initialized');
}

function switchTab(tabName, el) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    el.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    const targetContent = document.getElementById(`${tabName}-content`);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    if (tabName === 'residential' && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}




