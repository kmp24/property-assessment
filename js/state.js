'use strict';

// Map instances
var residentialMap, condoMap, commercialMap, vacantMap;

// Parcel data bucketed by type
var parcelData = { residential: [], condo: [], commercial: [], vacant: [] };
var statsData  = { residential: {}, condo: {}, commercial: {}, vacant: {} };
var dataCollected = { residential: false, condo: false, commercial: false, vacant: false };
var collectionDone = false;

// UI state
var activeTab = 'residential';
var scatterPending = { residential: false, condo: false, commercial: false, vacant: false };
var sidebarState = {
  residential: { left: false, right: false },
  condo:       { left: false, right: false },
  commercial:  { left: false, right: false },
  vacant:      { left: false, right: false }
};

// Per-tab filter / selection state
var activeFilter   = { residential: null, condo: null, commercial: null, vacant: null };
var selectedParcelId = { residential: null, condo: null, commercial: null, vacant: null };
var showAllParcels = { residential: false, condo: false, commercial: false, vacant: false };

// Map init flags (residential is eager, rest are lazy)
var mapInitialized = { residential: true, condo: false, commercial: false, vacant: false };

// Scatter axis config
var scatterAxes = {
  residential: { x: 'sqft',    y: 'assessed2022' },
  condo:       { x: 'sqft',    y: 'assessed2022' },
  commercial:  { x: 'sqft',    y: 'assessed2022' },
  vacant:      { x: 'acreage', y: 'assessed2022' },
};

// Symbolization state — current field name and resolved opt per type
var mapSymbolization    = { residential:'Zone', condo:'Zone', commercial:'Zone', vacant:'Zone' };
var mapSymbolizationOpt = { residential:null, condo:null, commercial:null, vacant:null };

// Per-type categorical color cache: `type:field` → colors object
var categoricalColorCache = {};

// Stored by initializeMaps for lazy tab init
var _sourceLayerName = 'parcels';
var _mapConfig = null;

// Misc charts registry (used by some chart init paths)
var charts = {};

// D3 tooltip (shared across all charts)
var d3Tooltip = d3.select('body').append('div')
  .attr('class', 'd3-tooltip')
  .style('position','absolute')
  .style('pointer-events','none');