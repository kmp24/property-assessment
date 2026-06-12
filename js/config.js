"use strict";

var STAT_PREFIX = {
  residential: "res",
  condo: "condo",
  commercial: "commercial",
  vacant: "vacant",
};

var COLORS = {
  residential: "#EE7733",
  condo: "#0077BB",
  commercial: "#33BBEE",
  vacant: "#009988",
};

var ZONE_COLORS = null; // populated dynamically from tile data like Neighborhood

var PROP_TYPE_COLORS = {
  Residential: "#EE7733",
  Condo: "#0077BB",
  Commercial: "#33BBEE",
  Vacant: "#009988",
  default: "#BBBBBB",
};

var CATEGORICAL_PALETTE = [
  "#EE7733",
  "#0077BB",
  "#33BBEE",
  "#EE3377",
  "#CC3311",
  "#009988",
  "#BBBBBB",
  "#AA3377",
  "#228833",
  "#CCBB44",
  "#AA7744",
  "#4477AA",
];

var VALUE_RAMP = ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"];
var YEAR_RAMP = ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"];
var ACREAGE_RAMP = ["#edf8fb", "#b3cde3", "#8c96c6", "#8856a7", "#810f7c"];
var PCT_CHANGE_RAMP = ["#648FFF", "#785EF0", "#DC267F", "#FE6100", "#FFB000"];

var SYMBOLIZATION_OPTIONS = [
  { value: "Zone", type: "categorical" },
  { value: "Property Type", type: "categorical", colors: PROP_TYPE_COLORS },
  { value: "Assessed Total", type: "continuous", colorRamp: VALUE_RAMP },
  {
    value: "Pre Year Assessed Total",
    type: "continuous",
    colorRamp: VALUE_RAMP,
  },
  {
    value: "Pct Change 2020-2022",
    type: "pct_change",
    colorRamp: PCT_CHANGE_RAMP,
  },
  { value: "Effective Year Built", type: "continuous", colorRamp: YEAR_RAMP },
  { value: "Neighborhood", type: "categorical" },
  { value: "Style Description", type: "categorical" },
  { value: "State Use Description", type: "categorical" },
  { value: "Land Acres", type: "continuous", colorRamp: ACREAGE_RAMP },
];

var AXIS_LABELS = {
  sqft: "Living Area (sf)",
  acreage: "Acreage (ac)",
  yearBuilt: "Effective Year Built",
  assessed2020: "2020 Assessment",
  assessed2022: "2022 Assessment",
};

var RIGHT_BAR_FIELDS = {
  residential: {
    style: "Style Description",
    neighborhood: "Neighborhood",
    zone: "Zone",
    stateUse: "State Use",
    frame: "Frame Type",
  },
  condo: {
    stateUse: "State Use",
    style: "Style Description",
    zone: "Zone",
    frame: "Frame Type",
  },
  commercial: {
    stateUse: "State Use",
    style: "Style Description",
    zone: "Zone",
    neighborhood: "Neighborhood",
    frame: "Frame Type",
  },
  vacant: { stateUse: "State Use", zone: "Zone", neighborhood: "Neighborhood" },
};

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx),
    hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
