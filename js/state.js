'use strict';

// Map instances
let residentialMap, condoMap, commercialMap, vacantMap;

// Parcel data bucketed by type
let parcelData = { residential: [], condo: [], commercial: [], vacant: [] };
let statsData  = { residential: {}, condo: {}, commercial: {}, vacant: {} };
let dataCollected = { residential: false, condo: false, commercial: false, vacant: false };
let collectionDone = false;

// UI state
let activeTab = 'residential';
let scatterPending = { residential: false, condo: false, commercial: false, vacant: false };
let sidebarState = {
  residential: { left: false, right: false },
  condo:       { left: false, right: false },
  commercial:  { left: false, right: false },
  vacant:      { left: false, right: false }
};

// Per-tab filter / selection state
let activeFilter   = { residential: null, condo: null, commercial: null, vacant: null };
let selectedParcelId = { residential: null, condo: null, commercial: null, vacant: null };
let showAllParcels = { residential: false, condo: false, commercial: false, vacant: false };

// Map init flags (residential is eager, rest are lazy)
let mapInitialized = { residential: true, condo: false, commercial: false, vacant: false };

// Scatter axis config
const scatterAxes = {
  residential: { x: 'sqft',    y: 'assessed2022' },
  condo:       { x: 'sqft',    y: 'assessed2022' },
  commercial:  { x: 'sqft',    y: 'assessed2022' },
  vacant:      { x: 'acreage', y: 'assessed2022' },
};

// Symbolization state — current field name and resolved opt per type
const mapSymbolization    = { residential:'Zone', condo:'Zone', commercial:'Zone', vacant:'Zone' };
const mapSymbolizationOpt = { residential:null, condo:null, commercial:null, vacant:null };

// Per-type categorical color cache: `type:field` → colors object
const categoricalColorCache = {};

// Stored by initializeMaps for lazy tab init
let _sourceLayerName = 'parcels';
let _mapConfig = null;

// Misc charts registry (used by some chart init paths)
let charts = {};

// D3 tooltip (shared across all charts)
const tooltip = d3.select('body').append('div')
  .attr('class', 'd3-tooltip')
  .style('position','absolute')
  .style('pointer-events','none');
