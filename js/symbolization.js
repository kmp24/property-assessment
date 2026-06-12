"use strict";

// ─── Color expression (MapLibre GL paint expression) ─────────────────────────

function colorExpr(field, opt, type) {
  if (!opt) return "#94a3b8";

  if (opt.type === "categorical" && opt.colors) {
    const cases = [];
    Object.entries(opt.colors).forEach(([val, color]) => {
      if (val !== "default") cases.push(val, color);
    });
    return [
      "match",
      ["to-string", ["get", field]],
      ...cases,
      opt.colors.default || "#94a3b8",
    ];
  }

  if (opt.type === "pct_change" && opt.colorRamp) {
    const ramp = opt.colorRamp;
    let thresholds = [-15, -8, -2, 2, 8, 15];
    if (type && parcelData[type]?.length) {
      const parcels = parcelData[type];
      const pctVals = parcels
        .map((p) =>
          p.assessed2020 > 0
            ? ((p.assessed2022 - p.assessed2020) / p.assessed2020) * 100
            : null,
        )
        .filter((v) => v !== null)
        .sort((a, b) => a - b);
      if (pctVals.length >= ramp.length) {
        const n = ramp.length;
        const raw = [];
        for (let i = 1; i < n; i++) {
          const idx = Math.floor((i / n) * pctVals.length);
          raw.push(Math.round(pctVals[idx] * 10) / 10);
        }
        thresholds = [];
        let prev = -Infinity;
        for (const t of raw) {
          const v = t > prev ? t : prev + 0.1;
          thresholds.push(Math.round(v * 10) / 10);
          prev = thresholds[thresholds.length - 1];
        }
      }
      console.log(
        `[PctChange] type=${type} parcels=${parcels.length} valid=${pctVals.length} thresholds=`,
        thresholds,
      );
    }
    opt._thresholds = thresholds;
    opt._isPctChange = true;
    const a22Expr = ["to-number", ["coalesce", ["get", "Assessed Total"], 0]];
    const a20Expr = [
      "to-number",
      ["coalesce", ["get", "Pre Year Assessed Total"], 0],
    ];
    const pctExpr = ["*", 100, ["/", ["-", a22Expr, a20Expr], a20Expr]];
    const stepArgs = [ramp[0]];
    thresholds.forEach((t, i) => {
      stepArgs.push(t, ramp[i + 1] || ramp[ramp.length - 1]);
    });
    const stepExpr = ["step", pctExpr, ...stepArgs];
    return ["case", [">", a20Expr, 0], stepExpr, "#cccccc"];
  }

  if (opt.type === "continuous" && opt.colorRamp) {
    const ramp = opt.colorRamp;
    const quantileBreaks = (vals, n) => {
      const s = vals.slice().sort((a, b) => a - b);
      const breaks = [];
      for (let i = 1; i < n; i++)
        breaks.push(s[Math.floor((i / n) * s.length)]);
      return breaks;
    };
    let thresholds = [];
    if (type && parcelData[type]?.length) {
      const parcels = parcelData[type];
      if (field.includes("Year Built")) {
        const years = parcels.map((p) => p.yearBuilt).filter((y) => y > 0);
        thresholds = years.length
          ? quantileBreaks(years, ramp.length)
          : [1930, 1950, 1970, 1990, 2010];
      } else if (field === "Land Acres") {
        const acres = parcels.map((p) => p.acreage).filter((a) => a > 0);
        thresholds = acres.length
          ? quantileBreaks(acres, ramp.length)
          : [0.1, 0.25, 0.5, 1, 2];
      } else {
        const isPreYear = field === "Pre Year Assessed Total";
        const vals = parcels
          .map((p) => (isPreYear ? p.assessed2020 : p.assessed2022))
          .filter((v) => v > 0);
        thresholds = vals.length
          ? quantileBreaks(vals, ramp.length)
          : [100000, 250000, 400000, 600000, 1000000];
      }
    } else {
      if (field.includes("Year Built"))
        thresholds = [1930, 1950, 1970, 1990, 2010];
      else if (field === "Land Acres") thresholds = [0.1, 0.25, 0.5, 1, 2];
      else thresholds = [100000, 250000, 400000, 600000, 1000000];
    }
    opt._thresholds = thresholds;
    opt._field = field;
    const stepArgs = [ramp[0]];
    thresholds.forEach((t, i) => {
      stepArgs.push(Math.round(t), ramp[i + 1] || ramp[ramp.length - 1]);
    });
    return [
      "step",
      ["to-number", ["coalesce", ["get", field], 0]],
      ...stepArgs,
    ];
  }

  return "#94a3b8";
}

// ─── Categorical color helpers ────────────────────────────────────────────────

// Fields that should have consistent colors across all tabs
var CROSS_TAB_FIELDS = new Set([
  "Zone",
  "Property Type",
  "Neighborhood",
  "Style Description",
  "State Use Description",
  "Frame Type",
]);

function getUniqueValuesForField(type, field) {
  const fieldMap = {
    Neighborhood: "neighborhood",
    "Style Description": "style",
    "State Use Description": "stateUse",
    Zone: "zone",
    "Property Type": "type",
    "Frame Type": "frame",
  };
  const dataField = fieldMap[field] || field;
  const values = new Set();

  // For cross-tab fields, collect from ALL types so colors are consistent across tabs
  const typesToScan = CROSS_TAB_FIELDS.has(field)
    ? ["residential", "condo", "commercial", "vacant"]
    : [type];

  typesToScan.forEach((t) => {
    (parcelData[t] || []).forEach((p) => {
      const v = p[dataField];
      if (v && v !== "Unknown" && v !== "") values.add(String(v));
    });
  });

  return Array.from(values).sort();
}

function generateCategoricalColors(values) {
  const colors = {};
  values.forEach((val, i) => {
    if (i < CATEGORICAL_PALETTE.length) {
      colors[val] = CATEGORICAL_PALETTE[i];
    } else {
      const hue = Math.round((i * 137.508) % 360);
      const sat = 55 + (i % 3) * 12;
      const lit = 42 + (i % 2) * 10;
      colors[val] = `hsl(${hue},${sat}%,${lit}%)`;
    }
  });
  colors["default"] = "#BBBBBB";
  return colors;
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function buildLegend(field, opt, type) {
  const p = STAT_PREFIX[type];
  const el = document.getElementById(p + "-legend");
  if (!el) return;
  el.innerHTML = "";
  if (!opt) return;

  if (opt.type === "categorical" && opt.colors) {
    const entries = Object.entries(opt.colors).filter(([k]) => k !== "default");
    const parcels = parcelData[type] || [];
    const fieldMap = {
      Neighborhood: "neighborhood",
      "Style Description": "style",
      "State Use Description": "stateUse",
      Zone: "zone",
      "Property Type": "type",
    };
    const dataField = fieldMap[field] || field;
    const counts = {};
    parcels.forEach((p) => {
      const v = p[dataField];
      if (v && v !== "Unknown")
        counts[String(v)] = (counts[String(v)] || 0) + 1;
    });
    const sorted = entries
      .map(([val, color]) => ({ val, color, count: counts[val] || 0 }))
      .sort((a, b) => b.count - a.count);
    sorted.forEach(({ val, color }) => {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><span>${val}</span>`;
      el.appendChild(item);
    });
  } else if (opt.type === "pct_change") {
    const ramp = opt.colorRamp || PCT_CHANGE_RAMP;
    const thresholds = opt._thresholds || [-15, -8, -2, 2, 8, 15];
    const edges = [-Infinity, ...thresholds, Infinity];
    const fmtP = (v) => (v >= 0 ? `+${v}%` : `${v}%`);
    ramp.forEach((color, i) => {
      const lo = edges[i];
      const hi = edges[i + 1];
      let label;
      if (lo === -Infinity) label = `< ${fmtP(thresholds[0])}`;
      else if (hi === Infinity)
        label = `> ${fmtP(thresholds[thresholds.length - 1])}`;
      else label = `${fmtP(lo)} – ${fmtP(hi)}`;
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><span>${label}</span>`;
      el.appendChild(item);
    });
  } else if (opt.type === "continuous") {
    const ramp = opt.colorRamp || VALUE_RAMP;
    const thresholds = opt._thresholds || [];
    const parcels = parcelData[type] || [];
    const isYear = opt.value && opt.value.includes("Year Built");
    const isAcres = opt.value === "Land Acres";
    const isPreYear = opt.value === "Pre Year Assessed Total";
    const fmtThresh = (v) => {
      if (isYear) return Math.round(v).toString();
      if (isAcres) return v < 1 ? v.toFixed(2) + " ac" : v.toFixed(1) + " ac";
      return v >= 1e6
        ? `$${(v / 1e6).toFixed(2)}M`
        : v >= 1e3
          ? `$${Math.round(v / 1e3)}K`
          : `$${Math.round(v)}`;
    };
    let dataMin = 0,
      dataMax = 0;
    if (isYear) {
      const years = parcels.map((p) => p.yearBuilt).filter((y) => y > 0);
      dataMin = years.length ? Math.min(...years) : 1900;
      dataMax = years.length ? Math.max(...years) : 2024;
    } else if (isAcres) {
      const acres = parcels.map((p) => p.acreage).filter((a) => a > 0);
      dataMin = 0;
      dataMax = acres.length ? Math.max(...acres) : 5;
    } else {
      const vals = parcels
        .map((p) => (isPreYear ? p.assessed2020 : p.assessed2022))
        .filter((v) => v > 0);
      dataMin = vals.length ? Math.min(...vals) : 0;
      dataMax = vals.length ? Math.max(...vals) : 2000000;
    }
    const edges = [dataMin, ...thresholds, dataMax];
    ramp.forEach((color, i) => {
      const lo = edges[i] !== undefined ? edges[i] : 0;
      const hi = edges[i + 1] !== undefined ? edges[i + 1] : dataMax;
      const rangeLabel =
        i === ramp.length - 1
          ? `${fmtThresh(lo)}+`
          : `${fmtThresh(lo)} – ${fmtThresh(hi)}`;
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><span>${rangeLabel}</span>`;
      el.appendChild(item);
    });
  }
}

// ─── Main symbolization change handler ───────────────────────────────────────

window.changeMapSymbolization = function (map, type, field) {
  mapSymbolization[type] = field;
  let baseOpt = SYMBOLIZATION_OPTIONS.find((o) => o.value === field);
  let opt = baseOpt ? { ...baseOpt } : { value: field, type: "categorical" };

  if (opt.type === "categorical") {
    // Cross-tab fields share one color cache so Zone/Neighborhood etc. are consistent across tabs
    const cacheKey = CROSS_TAB_FIELDS.has(field)
      ? "global:" + field
      : type + ":" + field;
    if (!categoricalColorCache[cacheKey]) {
      categoricalColorCache[cacheKey] = generateCategoricalColors(
        getUniqueValuesForField(type, field),
      );
    }
    if (!opt.colors) opt.colors = categoricalColorCache[cacheKey];
  }

  if (map && map.getLayer("parcels-fill"))
    map.setPaintProperty(
      "parcels-fill",
      "fill-color",
      colorExpr(field, opt, type),
    );
  buildLegend(field, opt, type);

  // Sync bar chart dropdown if field matches an Aggregate By option
  const barSelectId = `${type === "residential" ? "res" : type}-bar-field`;
  const barSel = document.getElementById(barSelectId);
  if (barSel) {
    const symToBar = {
      Neighborhood: "neighborhood",
      "Style Description": "style",
      Zone: "zone",
      "State Use Description": "stateUse",
    };
    const barKey = symToBar[field];
    if (barKey && Array.from(barSel.options).some((o) => o.value === barKey)) {
      barSel.value = barKey;
      updateRightBarChart(type, barKey);
    }
  }

  if (type === activeTab) updateScatter(type);
  mapSymbolizationOpt[type] = opt;

  // Re-render beeswarms to stay in sync
  if (type === "residential" || type === "condo") {
    const parcels = parcelData[type];
    if (parcels?.length) {
      if (type === "residential") {
        if (activeBeeswarm.residential === "style") updateResBeeswarm(parcels);
        else updateResBedroomBeeswarm(parcels);
      } else {
        if (activeBeeswarm.condo === "style") updateCondoBeeswarm(parcels);
        else updateCondoBedroomBeeswarm(parcels);
      }
    }
  }
};

// ─── Shared color function for D3 charts ─────────────────────────────────────

function buildBeeswarmColorFn(symOpt, type) {
  if (!symOpt) return null;
  if (symOpt.type === "categorical" && symOpt.colors) {
    const fieldMap = {
      Zone: "zone",
      "Property Type": "propertyType",
      Neighborhood: "neighborhood",
      "Style Description": "style",
      "State Use Description": "stateUse",
    };
    const df = fieldMap[symOpt.value];
    if (!df) return null;
    return (d) => {
      const key = d[df];
      return key && symOpt.colors[key]
        ? symOpt.colors[key]
        : symOpt.colors["default"] || COLORS[type];
    };
  }
  if (
    symOpt.type === "continuous" &&
    symOpt.colorRamp &&
    symOpt._thresholds?.length
  ) {
    const contFieldMap = {
      "Assessed Total": "assessed2022",
      "Pre Year Assessed Total": "assessed2020",
      "Effective Year Built": "yearBuilt",
      "Land Acres": "acreage",
    };
    const df = contFieldMap[symOpt.value];
    if (!df) return null;
    const scale = d3
      .scaleThreshold()
      .domain(symOpt._thresholds)
      .range(symOpt.colorRamp);
    return (d) => {
      const v = d[df];
      return v > 0 ? scale(v) : "#ccc";
    };
  }
  if (
    symOpt.type === "pct_change" &&
    symOpt.colorRamp &&
    symOpt._thresholds?.length
  ) {
    const scale = d3
      .scaleThreshold()
      .domain(symOpt._thresholds)
      .range(symOpt.colorRamp);
    return (d) => {
      if (d.assessed2020 > 0)
        return scale(
          ((d.assessed2022 - d.assessed2020) / d.assessed2020) * 100,
        );
      return "#ccc";
    };
  }
  return null;
}
