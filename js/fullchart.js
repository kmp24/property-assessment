"use strict";

window.openFullChart = function (type, chartType) {
  const parcels = parcelData[type];
  if (!parcels?.length) return;

  if (!mapSymbolizationOpt[type]) {
    const maps = {
      residential: residentialMap,
      condo: condoMap,
      commercial: commercialMap,
      vacant: vacantMap,
    };
    window.changeMapSymbolization(
      maps[type],
      type,
      mapSymbolization[type] || "Zone",
    );
  }

  const symOpt = mapSymbolizationOpt[type];
  const payload = {
    type,
    chartType,
    color: COLORS[type],
    ax: scatterAxes[type],
    axLabels: AXIS_LABELS,
    symField: mapSymbolization[type],
    symOpt: symOpt
      ? {
          type: symOpt.type,
          value: symOpt.value,
          colors: symOpt.colors || null,
          colorRamp: symOpt.colorRamp || null,
          _thresholds: symOpt._thresholds || null,
        }
      : null,
    parcels: parcels.map((p) => ({
      address: p.address,
      sqft: p.sqft,
      acreage: p.acreage,
      yearBuilt: p.yearBuilt,
      assessed2020: p.assessed2020,
      assessed2022: p.assessed2022,
      neighborhood: p.neighborhood,
      style: p.style,
      zone: p.zone,
      stateUse: p.stateUse,
      bedrooms: p.bedrooms,
    })),
    activeBeeswarmMode: activeBeeswarm[type] || "style",
  };

  try {
    sessionStorage.setItem("fullChartData", JSON.stringify(payload));
  } catch (e) {
    alert("Dataset too large for sessionStorage — try filtering first.");
    return;
  }

  window.open("fullchart.html", "_blank");
};
