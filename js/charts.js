"use strict";

// ─── Resize observer wrapper ──────────────────────────────────────────────────

function watchAndRender(container, renderFn) {
  if (!container) return;
  container._renderFn = renderFn;
  if (container._ro) container._ro.disconnect();
  const ro = new ResizeObserver(() => {
    if (container.clientWidth > 20 && container.clientHeight > 20) renderFn();
  });
  ro.observe(container);
  container._ro = ro;
  renderFn();
}

// ─── Chart orchestration ──────────────────────────────────────────────────────

function updateChartsForType(type) {
  const parcels = parcelData[type];
  if (!parcels?.length) return;
  setTimeout(() => {
    if (type === "residential") {
      if (activeBeeswarm.residential === "style") updateResBeeswarm(parcels);
      else updateResBedroomBeeswarm(parcels);
    }
    if (type === "condo") {
      if (activeBeeswarm.condo === "style") updateCondoBeeswarm(parcels);
      else updateCondoBedroomBeeswarm(parcels);
    }
    if (type === "commercial") updateCommercialZoneChart(parcels);
    const selectId = `${type === "residential" ? "res" : type}-bar-field`;
    const sel = document.getElementById(selectId);
    const field = sel ? sel.value : Object.keys(RIGHT_BAR_FIELDS[type])[0];
    updateRightBarChart(type, field);
    if (type === activeTab) updateScatter(type);
    else scatterPending[type] = true;
  }, 100);
}

// ─── Beeswarm toggle state ────────────────────────────────────────────────────

var activeBeeswarm = { residential: "style", condo: "style" };

window.switchResBeeswarm = function (mode, btn) {
  activeBeeswarm.residential = mode;
  btn.parentElement
    .querySelectorAll(".scatter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  const labelEl = document.getElementById("res-beeswarm-label");
  if (labelEl)
    labelEl.textContent = mode === "style" ? "by Style" : "by Bedrooms";
  const styleDiv = document.getElementById("resBeeswarm");
  const bedroomDiv = document.getElementById("resBeeswarmBedroom");
  if (styleDiv) styleDiv.style.display = mode === "style" ? "" : "none";
  if (bedroomDiv) bedroomDiv.style.display = mode === "bedrooms" ? "" : "none";
  const parcels = parcelData["residential"];
  if (parcels?.length) {
    if (mode === "style") {
      if (!styleDiv?.querySelector("svg")) updateResBeeswarm(parcels);
      else styleDiv._renderFn?.();
    } else {
      if (!bedroomDiv?.querySelector("svg")) updateResBedroomBeeswarm(parcels);
      else bedroomDiv._renderFn?.();
    }
  }
};

window.switchCondoBeeswarm = function (mode, btn) {
  activeBeeswarm.condo = mode;
  btn.parentElement
    .querySelectorAll(".scatter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  const labelEl = document.getElementById("condo-beeswarm-label");
  if (labelEl)
    labelEl.textContent = mode === "style" ? "by Style" : "by Bedrooms";
  const styleDiv = document.getElementById("condoBeeswarm");
  const bedroomDiv = document.getElementById("condoBeeswarmBedroom");
  if (styleDiv) styleDiv.style.display = mode === "style" ? "" : "none";
  if (bedroomDiv) bedroomDiv.style.display = mode === "bedrooms" ? "" : "none";
  const cparcels = parcelData["condo"];
  if (cparcels?.length) {
    if (mode === "style") {
      if (!styleDiv?.querySelector("svg")) updateCondoBeeswarm(cparcels);
      else styleDiv._renderFn?.();
    } else {
      if (!bedroomDiv?.querySelector("svg"))
        updateCondoBedroomBeeswarm(cparcels);
      else bedroomDiv._renderFn?.();
    }
  }
};

// ─── Beeswarm update functions ────────────────────────────────────────────────

function updateResBeeswarm(parcels) {
  const container = document.getElementById("resBeeswarm");
  if (!container) return;
  const counts = {};
  parcels.forEach((p) => {
    if (p.style && p.style !== "Unknown" && p.assessed2022 > 0)
      counts[p.style] = (counts[p.style] || 0) + 1;
  });
  const topStyles = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([s]) => s);
  const filtered = parcels.filter(
    (p) => topStyles.includes(p.style) && p.assessed2022 > 0,
  );
  const MAX_BEE = 1500;
  const beeStep = Math.max(1, Math.ceil(filtered.length / MAX_BEE));
  const sample =
    beeStep === 1 ? filtered : filtered.filter((_, i) => i % beeStep === 0);
  if (!sample.length) return;
  const colorFn = buildBeeswarmColorFn(
    mapSymbolizationOpt["residential"],
    "residential",
  );
  watchAndRender(container, () =>
    renderBeeswarmInto(
      container,
      sample,
      topStyles,
      COLORS.residential,
      "style",
      colorFn,
    ),
  );
}

function updateResBedroomBeeswarm(parcels) {
  const container = document.getElementById("resBeeswarmBedroom");
  if (!container) return;
  const counts = {};
  parcels.forEach((p) => {
    if (p.bedrooms > 0 && p.assessed2022 > 0)
      counts[p.bedrooms] = (counts[p.bedrooms] || 0) + 1;
  });
  const topBeds = Object.entries(counts)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .slice(0, 10)
    .map(([s]) => parseInt(s));
  const filtered = parcels.filter(
    (p) => topBeds.includes(p.bedrooms) && p.assessed2022 > 0,
  );
  const MAX_BEE = 1500;
  const beeStep = Math.max(1, Math.ceil(filtered.length / MAX_BEE));
  const sample =
    beeStep === 1 ? filtered : filtered.filter((_, i) => i % beeStep === 0);
  if (!sample.length) return;
  const colorFn = buildBeeswarmColorFn(
    mapSymbolizationOpt["residential"],
    "residential",
  );
  watchAndRender(container, () =>
    renderBeeswarmInto(
      container,
      sample,
      topBeds,
      COLORS.residential,
      "bedrooms",
      colorFn,
    ),
  );
}

function updateCondoBeeswarm(parcels) {
  const container = document.getElementById("condoBeeswarm");
  if (!container) return;
  const counts = {};
  parcels.forEach((p) => {
    if (p.style && p.style !== "Unknown" && p.assessed2022 > 0)
      counts[p.style] = (counts[p.style] || 0) + 1;
  });
  const topStyles = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([s]) => s);
  const filtered = parcels.filter(
    (p) => topStyles.includes(p.style) && p.assessed2022 > 0,
  );
  const MAX_BEE = 1500;
  const beeStep = Math.max(1, Math.ceil(filtered.length / MAX_BEE));
  const sample =
    beeStep === 1 ? filtered : filtered.filter((_, i) => i % beeStep === 0);
  if (!sample.length) return;
  const colorFn = buildBeeswarmColorFn(mapSymbolizationOpt["condo"], "condo");
  watchAndRender(container, () =>
    renderBeeswarmInto(
      container,
      sample,
      topStyles,
      COLORS.condo,
      "style",
      colorFn,
    ),
  );
}

function updateCondoBedroomBeeswarm(parcels) {
  const container = document.getElementById("condoBeeswarmBedroom");
  if (!container) return;
  const counts = {};
  parcels.forEach((p) => {
    if (p.bedrooms > 0 && p.assessed2022 > 0)
      counts[p.bedrooms] = (counts[p.bedrooms] || 0) + 1;
  });
  const topBeds = Object.entries(counts)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .slice(0, 10)
    .map(([s]) => parseInt(s));
  const filtered = parcels.filter(
    (p) => topBeds.includes(p.bedrooms) && p.assessed2022 > 0,
  );
  const MAX_BEE = 1500;
  const beeStep = Math.max(1, Math.ceil(filtered.length / MAX_BEE));
  const sample =
    beeStep === 1 ? filtered : filtered.filter((_, i) => i % beeStep === 0);
  if (!sample.length) return;
  const colorFn = buildBeeswarmColorFn(mapSymbolizationOpt["condo"], "condo");
  watchAndRender(container, () =>
    renderBeeswarmInto(
      container,
      sample,
      topBeds,
      COLORS.condo,
      "bedrooms",
      colorFn,
    ),
  );
}

// ─── Beeswarm renderer ────────────────────────────────────────────────────────

function renderBeeswarmInto(
  container,
  data,
  categories,
  color,
  groupKey,
  colorFn,
) {
  groupKey = groupKey || "style";
  d3.select(container).selectAll("*").remove();
  const width = container.clientWidth || 340;
  const height = container.clientHeight || 340;
  const fs = Math.max(8, Math.min(11, width / 32));
  const labelW = Math.min(width * 0.38, fs * 13);
  const margin = {
    top: 10,
    right: 12,
    bottom: Math.round(fs * 4.5),
    left: labelW,
  };
  const iW = Math.max(width - margin.left - margin.right, 40);
  const iH = Math.max(height - margin.top - margin.bottom, 40);

  const vals = data.map((d) => d.assessed2022);
  const xMax = percentile(vals, 97) * 1.05;
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, iW]);
  const yScale = d3.scaleBand().domain(categories).range([0, iH]).padding(0.3);
  const fmtX = (v) =>
    v >= 1e6
      ? `$${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `$${Math.round(v / 1e3)}K`
        : `$${Math.round(v)}`;
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(Math.max(3, Math.floor(iW / 55)))
    .tickFormat(fmtX);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  categories.forEach((cat, i) => {
    g.append("rect")
      .attr("x", 0)
      .attr("y", yScale(cat))
      .attr("width", iW)
      .attr("height", yScale.bandwidth())
      .attr("fill", i % 2 === 0 ? "rgba(0,0,0,0.02)" : "transparent");
  });

  const xAxisG = g
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${iH})`)
    .call(xAxis);
  xAxisG.selectAll("text").style("font-size", fs + "px");

  categories.forEach((cat) => {
    const y = yScale(cat) + yScale.bandwidth() / 2;
    const maxChars = Math.floor(labelW / (fs * 0.58));
    const label =
      String(cat).length > maxChars
        ? String(cat).slice(0, maxChars - 1) + "…"
        : String(cat);
    g.append("text")
      .attr("x", -6)
      .attr("y", y)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .style("font-size", fs + "px")
      .style("fill", "#5a5a7a")
      .text(label);
  });

  const bandwidth = yScale.bandwidth();
  const dotR = Math.max(2, Math.min(3.5, bandwidth / 7));

  const nodes = data.map((d) => ({
    ...d,
    _x: Math.min(d.assessed2022, xMax),
    _ty: yScale(d[groupKey]) + bandwidth / 2,
  }));

  const halfBand = bandwidth / 2 - dotR - 1;
  const sim = d3
    .forceSimulation(nodes)
    .force("x", d3.forceX((d) => xScale(d._x)).strength(1))
    .force("y", d3.forceY((d) => d._ty).strength(0.8))
    .force("collide", d3.forceCollide(dotR + 0.5))
    .stop();
  for (let i = 0; i < 120; i++) sim.tick();
  nodes.forEach((d) => {
    d.y = Math.max(d._ty - halfBand, Math.min(d._ty + halfBand, d.y));
  });

  categories.forEach((cat) => {
    const catVals = data
      .filter((d) => String(d[groupKey]) === String(cat))
      .map((d) => d.assessed2022);
    if (!catVals.length) return;
    const mean = catVals.reduce((a, b) => a + b, 0) / catVals.length;
    const mx = xScale(Math.min(mean, xMax));
    const by = yScale(cat);
    g.append("line")
      .attr("x1", mx)
      .attr("x2", mx)
      .attr("y1", by + 2)
      .attr("y2", by + bandwidth - 2)
      .attr("stroke", "#1a1a2e")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.5)
      .attr("stroke-dasharray", "3,2");
  });

  const useNeighborhoodColor = groupKey === "neighborhood";
  const neighborhoodValues = useNeighborhoodColor
    ? [...new Set(data.map((d) => d.neighborhood).filter(Boolean))]
    : [];
  const neighborhoodColorMap = {};
  neighborhoodValues.forEach((n, i) => {
    neighborhoodColorMap[n] =
      CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length];
  });

  g.selectAll(".bee-dot")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("class", "bee-dot")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", dotR)
    .attr("fill", (d) =>
      colorFn
        ? colorFn(d)
        : useNeighborhoodColor
          ? neighborhoodColorMap[d.neighborhood] || color
          : color,
    )
    .attr("fill-opacity", 0.45)
    .attr("stroke", (d) =>
      colorFn
        ? colorFn(d)
        : useNeighborhoodColor
          ? neighborhoodColorMap[d.neighborhood] || color
          : color,
    )
    .attr("stroke-width", 0.5)
    .attr("stroke-opacity", 0.6)
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this)
        .attr("r", dotR + 2)
        .attr("fill-opacity", 0.9)
        .attr("stroke-width", 1.5);
      const groupLabel =
        groupKey === "bedrooms"
          ? `Bedrooms: ${d[groupKey]}`
          : `${groupKey.charAt(0).toUpperCase() + groupKey.slice(1)}: ${d[groupKey]}`;
      d3Tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px")
        .classed("show", true)
        .html(
          `<strong>${d.address}</strong><br>${groupLabel}<br>Neighborhood: ${d.neighborhood}<br>2022 Value: ${fmtX(d.assessed2022)}`,
        );
    })
    .on("mouseout", function () {
      d3.select(this)
        .attr("r", dotR)
        .attr("fill-opacity", 0.45)
        .attr("stroke-width", 0.5);
      d3Tooltip.classed("show", false);
    });

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("x", margin.left + iW / 2)
    .attr("y", height - 2)
    .style("font-size", fs + "px")
    .style("fill", "#5a5a7a")
    .style("font-weight", "600")
    .text("2022 Assessment Value");

  svg
    .append("line")
    .attr("x1", margin.left)
    .attr("x2", margin.left + 18)
    .attr("y1", height - fs * 2.2)
    .attr("y2", height - fs * 2.2)
    .attr("stroke", "#1a1a2e")
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.5)
    .attr("stroke-dasharray", "3,2");
  svg
    .append("text")
    .attr("x", margin.left + 22)
    .attr("y", height - fs * 2.2)
    .attr("dy", "0.35em")
    .style("font-size", fs - 1 + "px")
    .style("fill", "#5a5a7a")
    .text("mean");
}

// ─── Commercial zone chart ────────────────────────────────────────────────────

function updateCommercialZoneChart(parcels) {
  const container = document.getElementById("commercialClassChart");
  if (!container) return;
  const grouped = {};
  parcels.forEach((p) => {
    if (!p.zone || p.zone === "Unknown" || p.assessed2022 <= 0) return;
    if (!grouped[p.zone]) grouped[p.zone] = { sum: 0, count: 0 };
    grouped[p.zone].sum += p.assessed2022;
    grouped[p.zone].count += 1;
  });
  const data = Object.entries(grouped)
    .map(([label, { sum, count }]) => ({ label, count, mean: sum / count }))
    .sort((a, b) => b.mean - a.mean);
  if (!data.length) return;
  const activeVal =
    activeFilter["commercial"]?.field === "zone"
      ? activeFilter["commercial"]?.value
      : null;
  watchAndRender(container, () =>
    renderBarInto(
      container,
      data,
      COLORS.commercial,
      "commercial",
      "zone",
      activeVal,
    ),
  );
}

// ─── Right panel bar chart ────────────────────────────────────────────────────

window.updateRightBarChart = function (type, field) {
  const containerId = `${type === "residential" ? "res" : type}RightBarChart`;
  const container = document.getElementById(containerId);
  if (!container) return;
  const parcels = parcelData[type];
  if (!parcels?.length) return;
  const grouped = {};
  parcels.forEach((p) => {
    const val = p[field];
    if (!val || val === "Unknown" || p.assessed2022 <= 0) return;
    if (!grouped[val]) grouped[val] = { sum: 0, count: 0 };
    grouped[val].sum += p.assessed2022;
    grouped[val].count += 1;
  });
  const data = Object.entries(grouped)
    .map(([label, { sum, count }]) => ({ label, count, mean: sum / count }))
    .sort((a, b) => b.mean - a.mean);
  if (!data.length) return;
  const headingId = `${type === "residential" ? "res" : type}-bar-heading`;
  const headEl = document.getElementById(headingId);
  if (headEl) headEl.textContent = "Mean 2022 Assessment";
  const activeVal =
    activeFilter[type]?.field === field ? activeFilter[type]?.value : null;
  watchAndRender(container, () =>
    renderBarInto(container, data, COLORS[type], type, field, activeVal),
  );
};

// ─── Scatter chart ────────────────────────────────────────────────────────────

function updateScatter(type) {
  const parcels = getFilteredParcels(type);
  const ax = scatterAxes[type];
  const p = STAT_PREFIX[type];
  const container = document.getElementById(p + "Scatter");
  if (!container || !parcels?.length) return;
  const raw = parcels.filter((q) => q[ax.x] > 0 && q[ax.y] > 0);
  const MAX_SCATTER = 3000;
  const step = Math.max(1, Math.ceil(raw.length / MAX_SCATTER));
  const sample = step === 1 ? raw : raw.filter((_, i) => i % step === 0);
  const countEl = document.getElementById(p + "-scatter-count");
  if (countEl)
    countEl.textContent =
      step > 1
        ? ` (${sample.length.toLocaleString()} of ${raw.length.toLocaleString()})`
        : ` (${raw.length.toLocaleString()})`;
  watchAndRender(container, () =>
    renderScatterInto(container, type, sample, ax),
  );
  scatterPending[type] = false;
}

function renderScatterInto(container, type, sample, ax) {
  d3.select(container).selectAll("*").remove();
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 260;
  const fs = Math.max(9, Math.min(13, width / 28));
  const margin = {
    top: 12,
    right: 12,
    bottom: Math.round(fs * 4.2),
    left: Math.round(fs * 5.2),
  };
  const iW = Math.max(width - margin.left - margin.right, 60);
  const iH = Math.max(height - margin.top - margin.bottom, 60);
  const isYearX = ax.x === "yearBuilt";
  const xVals = sample.map((d) => d[ax.x]);
  const yVals = sample.map((d) => d[ax.y]);
  const xMax = isYearX ? d3.max(xVals) * 1.001 : percentile(xVals, 95) * 1.05;
  const yMax = percentile(yVals, 95) * 1.05;
  const xMin = isYearX ? d3.min(xVals) - 2 : 0;
  const clipped = sample.map((d) => ({
    ...d,
    _cx: Math.min(d[ax.x], xMax),
    _cy: Math.min(d[ax.y], yMax),
    _outlier: d[ax.x] > xMax || d[ax.y] > yMax,
  }));
  const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, iW]);
  const yScale = d3.scaleLinear().domain([0, yMax]).range([iH, 0]);
  const fmtX = (d) =>
    isYearX
      ? Math.round(d).toString()
      : ax.x.includes("assessed")
        ? d >= 1e6
          ? `$${(d / 1e6).toFixed(1)}M`
          : d >= 1e3
            ? `$${Math.round(d / 1e3)}K`
            : `$${Math.round(d)}`
        : d >= 1e3
          ? `${Math.round(d / 1e3)}K`
          : Math.round(d);
  const fmtY = (d) =>
    ax.y.includes("assessed")
      ? d >= 1e6
        ? `$${(d / 1e6).toFixed(1)}M`
        : d >= 1e3
          ? `$${Math.round(d / 1e3)}K`
          : `$${Math.round(d)}`
      : d >= 1e3
        ? `${Math.round(d / 1e3)}K`
        : Math.round(d);
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(Math.max(3, Math.floor(iW / 55)))
    .tickFormat(fmtX);
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(Math.max(3, Math.floor(iH / 40)))
    .tickFormat(fmtY);
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const xAxisG = g
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${iH})`)
    .call(xAxis);
  xAxisG.selectAll("text").style("font-size", fs + "px");
  const yAxisG = g.append("g").attr("class", "axis").call(yAxis);
  yAxisG.selectAll("text").style("font-size", fs + "px");
  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("x", margin.left + iW / 2)
    .attr("y", height - 2)
    .style("font-size", fs + "px")
    .style("fill", "#5a5a7a")
    .style("font-weight", "600")
    .text(AXIS_LABELS[ax.x] || ax.x);
  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + iH / 2))
    .attr("y", fs + 1)
    .style("font-size", fs + "px")
    .style("fill", "#5a5a7a")
    .style("font-weight", "600")
    .text(AXIS_LABELS[ax.y] || ax.y);

  // Color encoding
  const symField = mapSymbolization[type];
  const symOpt =
    mapSymbolizationOpt[type] ||
    SYMBOLIZATION_OPTIONS.find((o) => o.value === symField);
  const dotFieldMap = {
    Neighborhood: "neighborhood",
    "Style Description": "style",
    "State Use Description": "stateUse",
    Zone: "zone",
    "Property Type": "type",
  };
  const dataField = dotFieldMap[symField] || null;
  const isCat =
    symOpt && symOpt.type === "categorical" && symOpt.colors && dataField;
  const isCont = symOpt && symOpt.type === "continuous" && symOpt.colorRamp;
  const isPctChange =
    symOpt && symOpt.type === "pct_change" && symOpt.colorRamp;
  const contFieldMap = {
    "Assessed Total": "assessed2022",
    "Pre Year Assessed Total": "assessed2020",
    "Effective Year Built": "yearBuilt",
    "Land Acres": "acreage",
  };
  const contDataField = contFieldMap[symField] || null;
  let contScale = null;
  if (isCont && contDataField && symOpt._thresholds?.length) {
    contScale = d3
      .scaleThreshold()
      .domain(symOpt._thresholds)
      .range(symOpt.colorRamp);
  }
  let pctScale = null;
  if (isPctChange && symOpt._thresholds?.length) {
    pctScale = d3
      .scaleThreshold()
      .domain(symOpt._thresholds)
      .range(symOpt.colorRamp);
  }

  function dotColor(d) {
    if (d._outlier) return "#aaa";
    if (isCat) {
      const v = d[dataField];
      const key = v !== undefined && v !== null ? String(v) : null;
      return key && symOpt.colors[key]
        ? symOpt.colors[key]
        : symOpt.colors["default"] || COLORS[type];
    }
    if (isCont && contScale && contDataField) {
      const v = d[contDataField];
      return v !== undefined && v !== null && v > 0 ? contScale(v) : "#ccc";
    }
    if (isPctChange && pctScale) {
      if (d.assessed2020 > 0)
        return pctScale(
          ((d.assessed2022 - d.assessed2020) / d.assessed2020) * 100,
        );
      return "#ccc";
    }
    return COLORS[type];
  }

  const dotR = Math.max(2, Math.min(4, width / 80));
  const clipId = "scatter-clip-" + Math.random().toString(36).slice(2, 7);
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", -dotR)
    .attr("y", -dotR)
    .attr("width", iW + dotR * 2)
    .attr("height", iH + dotR * 2);
  const dots = g
    .append("g")
    .attr("class", "dots")
    .attr("clip-path", `url(#${clipId})`);
  dots
    .selectAll("circle")
    .data(clipped)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", (d) => xScale(d._cx))
    .attr("cy", (d) => yScale(d._cy))
    .attr("r", (d) => (d._outlier ? dotR * 0.7 : dotR))
    .attr("fill", (d) => dotColor(d))
    .attr("fill-opacity", (d) => (d._outlier ? 0.25 : 0.5))
    .attr("stroke", (d) => dotColor(d))
    .attr("stroke-width", 1)
    .on("mouseover", function (event, d) {
      d3.select(this)
        .attr("r", dotR + 2)
        .attr("fill-opacity", 0.9)
        .attr("stroke-width", 2);
      const xVal = isYearX
        ? d[ax.x].toString()
        : ax.x.includes("assessed")
          ? `$${Math.round(d[ax.x]).toLocaleString()}`
          : Math.round(d[ax.x]).toLocaleString();
      const yVal = ax.y.includes("assessed")
        ? `$${Math.round(d[ax.y]).toLocaleString()}`
        : Math.round(d[ax.y]).toLocaleString();
      const outlierNote = d._outlier
        ? '<br><em style="color:#aaa">outlier — clipped to edge</em>'
        : "";
      let colorInfo = "";
      if (isCat && dataField && d[dataField] !== undefined)
        colorInfo = `<br>${symField}: ${d[dataField]}`;
      else if (isCont && contDataField && d[contDataField] > 0) {
        const fmtV = symField.includes("Year")
          ? d[contDataField]
          : symField.includes("Acres")
            ? d[contDataField].toFixed(2) + " ac"
            : "$" + Math.round(d[contDataField]).toLocaleString();
        colorInfo = `<br>${symField}: ${fmtV}`;
      }
      d3Tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px")
        .classed("show", true)
        .html(
          `<strong>${d.address}</strong><br>${AXIS_LABELS[ax.x] || ax.x}: ${xVal}<br>${AXIS_LABELS[ax.y] || ax.y}: ${yVal}${colorInfo}${outlierNote}`,
        );
    })
    .on("mouseout", function () {
      d3.select(this)
        .attr("r", (d) => (d._outlier ? dotR * 0.7 : dotR))
        .attr("fill-opacity", (d) => (d._outlier ? 0.25 : 0.5))
        .attr("stroke-width", 1);
      d3Tooltip.classed("show", false);
    });

  // Zoom
  const resetBtn = d3
    .select(container)
    .append("button")
    .attr("class", "scatter-reset-btn")
    .style("display", "none")
    .text("⟳ Reset")
    .on("click", () => {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });
  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 20])
    .extent([
      [0, 0],
      [iW, iH],
    ])
    .on("zoom", (event) => {
      const t = event.transform;
      const nx = t.rescaleX(xScale);
      const ny = t.rescaleY(yScale);
      const xLo = isYearX
        ? Math.max(1800, nx.domain()[0])
        : Math.max(0, nx.domain()[0]);
      const cx = nx.copy().domain([xLo, Math.max(xLo + 1, nx.domain()[1])]);
      const yLo = Math.max(0, ny.domain()[0]);
      const cy = ny.copy().domain([yLo, Math.max(yLo + 1, ny.domain()[1])]);
      xAxisG.call(xAxis.scale(cx).ticks(Math.max(3, Math.floor(iW / 55))));
      xAxisG.selectAll("text").style("font-size", fs + "px");
      yAxisG.call(yAxis.scale(cy).ticks(Math.max(3, Math.floor(iH / 40))));
      yAxisG.selectAll("text").style("font-size", fs + "px");
      dots
        .selectAll("circle")
        .attr("cx", (d) =>
          cx(Math.min(Math.max(d[ax.x], cx.domain()[0]), cx.domain()[1])),
        )
        .attr("cy", (d) =>
          cy(Math.min(Math.max(d[ax.y], cy.domain()[0]), cy.domain()[1])),
        );
      resetBtn.style(
        "display",
        t.k !== 1 || t.x !== 0 || t.y !== 0 ? "block" : "none",
      );
    });
  svg.call(zoom);
  svg.on("dblclick.zoom", () => {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    resetBtn.style("display", "none");
  });

  // Scatter color legend
  let legendDiv = container.querySelector(".scatter-color-legend");
  if (!legendDiv) {
    legendDiv = document.createElement("div");
    legendDiv.className = "scatter-color-legend";
    container.appendChild(legendDiv);
  }
  if (isCat && symOpt.colors) {
    const catCounts = {};
    sample.forEach((d) => {
      const v = d[dataField];
      if (v !== undefined && v !== null)
        catCounts[String(v)] = (catCounts[String(v)] || 0) + 1;
    });
    const entries = Object.entries(symOpt.colors)
      .filter(([k]) => k !== "default" && catCounts[k])
      .sort((a, b) => (catCounts[b[0]] || 0) - (catCounts[a[0]] || 0));
    const MAX_LEGEND = 8;
    const visible = entries.slice(0, MAX_LEGEND);
    const overflow = entries.length - MAX_LEGEND;
    const items = visible
      .map(
        ([label, color]) =>
          `<span class="sc-leg-item"><span class="sc-leg-dot" style="background:${color}"></span>${label}</span>`,
      )
      .join("");
    const more =
      overflow > 0 ? `<span class="sc-leg-more">+${overflow} more</span>` : "";
    legendDiv.innerHTML = `<span class="sc-leg-title">Color: ${symField}</span>${items}${more}`;
    legendDiv.style.display = "flex";
  } else if (isCont && symOpt._thresholds?.length) {
    const ramp = symOpt.colorRamp;
    const fmtT = (v) =>
      symField.includes("Year")
        ? Math.round(v)
        : symField.includes("Acres")
          ? v.toFixed(2) + " ac"
          : v >= 1e6
            ? `$${(v / 1e6).toFixed(1)}M`
            : `$${Math.round(v / 1e3)}K`;
    const swatches = ramp
      .map((color, i) => {
        const lo = i === 0 ? null : symOpt._thresholds[i - 1];
        const hi = symOpt._thresholds[i];
        const label =
          hi === undefined
            ? `${fmtT(symOpt._thresholds[i - 1])}+`
            : lo === null
              ? `< ${fmtT(hi)}`
              : `${fmtT(lo)}–${fmtT(hi)}`;
        return `<span class="sc-leg-item"><span class="sc-leg-dot" style="background:${color}"></span>${label}</span>`;
      })
      .join("");
    legendDiv.innerHTML = `<span class="sc-leg-title">Color: ${symField}</span>${swatches}`;
    legendDiv.style.display = "flex";
  } else if (isPctChange && symOpt._thresholds?.length) {
    const ramp = symOpt.colorRamp;
    const fmtP = (v) => (v >= 0 ? `+${v}%` : `${v}%`);
    const swatches = ramp
      .map((color, i) => {
        const lo = i === 0 ? null : symOpt._thresholds[i - 1];
        const hi = symOpt._thresholds[i];
        const label =
          hi === undefined
            ? `${fmtP(symOpt._thresholds[i - 1])}+`
            : lo === null
              ? `< ${fmtP(hi)}`
              : `${fmtP(lo)}–${fmtP(hi)}`;
        return `<span class="sc-leg-item"><span class="sc-leg-dot" style="background:${color}"></span>${label}</span>`;
      })
      .join("");
    legendDiv.innerHTML = `<span class="sc-leg-title">Color: 2020–2022 Δ%</span>${swatches}`;
    legendDiv.style.display = "flex";
  } else {
    legendDiv.style.display = "none";
  }
}

// ─── Bar chart renderer ───────────────────────────────────────────────────────

function renderBarInto(container, data, color, type, field, activeVal) {
  d3.select(container).selectAll("*").remove();
  if (!data.length) return;
  const width = container.clientWidth || 280;
  const barHeight = 24;
  const svgHeight = Math.max(160, data.length * barHeight + 60);
  const fs = Math.max(9, Math.min(13, width / 22));
  const margin = {
    top: 8,
    right: Math.round(fs * 5),
    bottom: Math.round(fs * 4),
    left: 0,
  };
  const labelW = Math.min(width * 0.4, fs * 12);
  const iW = Math.max(width - margin.right - labelW, 60);

  const xScale = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.mean)])
    .range([0, iW]);
  const yScale = d3
    .scaleBand()
    .domain(data.map((d) => d.label))
    .range([0, data.length * barHeight])
    .padding(0.25);
  const fmtV = (v) =>
    v >= 1e6
      ? `$${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `$${Math.round(v / 1e3)}K`
        : `$${Math.round(v)}`;
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(Math.max(2, Math.floor(iW / 55)))
    .tickFormat(fmtV);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", svgHeight);
  const g = svg
    .append("g")
    .attr("transform", `translate(${labelW},${margin.top})`);

  // Category labels
  data.forEach((d) => {
    const y = yScale(d.label) + yScale.bandwidth() / 2 + margin.top;
    const maxChars = Math.floor(labelW / (fs * 0.58));
    const label =
      d.label.length > maxChars
        ? d.label.slice(0, maxChars - 1) + "…"
        : d.label;
    svg
      .append("text")
      .attr("x", labelW - 6)
      .attr("y", y)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .style("font-size", fs + "px")
      .style("fill", "#5a5a7a")
      .style("cursor", "pointer")
      .text(label)
      .on("click", () => {
        applyBarFilter(type, field, d.label);
        updateChartsForType(type);
      });
  });

  const bars = g
    .selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", (d) => yScale(d.label) + margin.top)
    .attr("height", yScale.bandwidth())
    .attr("width", (d) => Math.max(0, xScale(d.mean)))
    .attr("fill", (d) =>
      d.label === activeVal ? d3.color(color).darker(0.5).formatHex() : color,
    )
    .attr("fill-opacity", (d) => (d.label === activeVal ? 1.0 : 0.7))
    .attr("rx", 2)
    .style("cursor", "pointer")
    .on("click", (d) => {
      applyBarFilter(type, field, d.label);
      updateChartsForType(type);
    })
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill-opacity", 1);
      d3Tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px")
        .classed("show", true)
        .html(
          `<strong>${d.label}</strong><br>Mean assessment: ${fmtV(d.mean)}<br>Total parcels: ${d.count.toLocaleString()}${d.withVal && d.withVal !== d.count ? '<br><span style="opacity:.7">Assessed: ' + d.withVal.toLocaleString() + "</span>" : ""}`,
        );
    })
    .on("mouseout", function (event, d) {
      d3.select(this).attr("fill-opacity", d.label === activeVal ? 1.0 : 0.7);
      d3Tooltip.classed("show", false);
    });

  // Value labels on bars
  g.selectAll(".bar-label")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "bar-label")
    .attr("x", (d) => Math.max(0, xScale(d.mean)) + 4)
    .attr("y", (d) => yScale(d.label) + yScale.bandwidth() / 2 + margin.top)
    .attr("dy", "0.35em")
    .style("font-size", fs - 1 + "px")
    .style("fill", "#5a5a7a")
    .text((d) => fmtV(d.mean));

  const xAxisG = g
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${data.length * barHeight + margin.top})`)
    .call(xAxis);
  xAxisG.selectAll("text").style("font-size", fs + "px");

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("x", labelW + iW / 2)
    .attr("y", svgHeight - 4)
    .style("font-size", fs - 1 + "px")
    .style("fill", "#5a5a7a")
    .text("Mean 2022 Assessed Value");

  const zoom = d3
    .zoom()
    .scaleExtent([1, 5])
    .translateExtent([
      [0, 0],
      [iW, svgHeight],
    ])
    .on("zoom", (event) => {
      const nx = event.transform.rescaleX(xScale);
      xAxisG.call(d3.axisBottom(nx).ticks(Math.max(3, Math.floor(iW / 50))));
      xAxisG.selectAll("text").style("font-size", fs + "px");
      bars.attr("width", (d) => Math.max(0, nx(d.mean)));
    });
  svg.call(zoom);
}
