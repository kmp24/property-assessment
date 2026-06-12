"use strict";

// ─── Stats UI ─────────────────────────────────────────────────────────────────

function updateStatsUI(type) {
  const s = statsData[type];
  if (!s || !s.count) return;
  const p = STAT_PREFIX[type];
  const fmt = (v) =>
    v >= 1e9
      ? `$${(v / 1e9).toFixed(2)}B`
      : v >= 1e6
        ? `$${(v / 1e6).toFixed(1)}M`
        : `$${Math.round(v).toLocaleString()}`;
  const pct =
    s.total2020 > 0
      ? (((s.total2022 - s.total2020) / s.total2020) * 100).toFixed(1)
      : null;
  const up = pct !== null && parseFloat(pct) >= 0;
  setText(p + "-total25", fmt(s.total2022));
  setText(p + "-total20", fmt(s.total2020));
  setText(p + "-count", s.count.toLocaleString());
  setText(p + "-avg", fmt(s.total2022 / s.count));
  if (s.median2022 !== undefined) setText(p + "-median", fmt(s.median2022));
  const deltaEl = document.getElementById(p + "-delta");
  if (deltaEl && pct !== null) {
    deltaEl.textContent = `${up ? "▲" : "▼"} ${Math.abs(pct)}% vs 2020`;
    deltaEl.className = "stat-delta " + (up ? "up" : "down");
  }
  const tabEl = document.querySelector(`.nav-tab[data-tab="${type}"]`);
  if (tabEl) tabEl.classList.add("data-ready");
}

function updateLandingStats() {
  const fmt = (v) =>
    v >= 1e9
      ? `$${(v / 1e9).toFixed(1)}B`
      : v >= 1e6
        ? `$${(v / 1e6).toFixed(0)}M`
        : "—";
  const ids = {
    residential: "res",
    condo: "condo",
    commercial: "comm",
    vacant: "vac",
  };
  ["residential", "condo", "commercial", "vacant"].forEach((t) => {
    const s = statsData[t];
    if (s && s.count) setText("ls-" + ids[t] + "-total", fmt(s.total2022));
  });
  const total = Object.values(statsData).reduce(
    (a, s) => a + (s.count || 0),
    0,
  );
  if (total > 0)
    setText("ls-total-parcels", total.toLocaleString() + " parcels");
}

// ─── Search ───────────────────────────────────────────────────────────────────

let searchTimeout;

function initializeSearch() {
  const searchInput = document.getElementById("parcel-search");
  const searchResults = document.getElementById("search-results");
  if (!searchInput || !searchResults) return;

  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      searchResults.classList.remove("show");
      return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 300);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container"))
      searchResults.classList.remove("show");
  });
  searchInput.addEventListener("click", (e) => {
    e.stopPropagation();
    if (searchResults.children.length > 0) searchResults.classList.add("show");
  });

  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchResults.setAttribute("role", "listbox");

  searchInput.addEventListener("keydown", (e) => {
    const items = Array.from(
      searchResults.querySelectorAll(".search-result-item"),
    );
    const focused = searchResults.querySelector(".search-result-item.kb-focus");
    const idx = focused ? items.indexOf(focused) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (focused) focused.classList.remove("kb-focus");
      const next = items[Math.min(idx + 1, items.length - 1)];
      if (next) {
        next.classList.add("kb-focus");
        next.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (focused) focused.classList.remove("kb-focus");
      const prev = items[Math.max(idx - 1, 0)];
      if (prev) {
        prev.classList.add("kb-focus");
        prev.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "Enter") {
      const target = focused || items[0];
      if (target) {
        target.click();
      }
    } else if (e.key === "Escape") {
      searchResults.classList.remove("show");
      searchInput.blur();
    }
  });
}

function performSearch(query) {
  const searchResults = document.getElementById("search-results");
  if (!searchResults) return;
  const queryLower = query.toLowerCase();
  const results = [];
  Object.entries(parcelData).forEach(([type, parcels]) => {
    parcels.forEach((parcel) => {
      if (
        parcel.address.toLowerCase().includes(queryLower) ||
        parcel.parcelId.toLowerCase().includes(queryLower)
      )
        results.push({ ...parcel, type });
    });
  });
  const limited = results.slice(0, 20);
  if (!limited.length) {
    searchResults.innerHTML =
      '<div class="search-no-results">No parcels found matching "' +
      query +
      '"</div>';
    searchResults.classList.add("show");
    return;
  }
  const fmt = (v) =>
    v >= 1e6
      ? `$${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `$${Math.round(v / 1e3)}K`
        : `$${Math.round(v)}`;
  searchResults.innerHTML = limited
    .map(
      (p) => `
    <div class="search-result-item" data-parcel-id="${p.parcelId}" data-type="${p.type}">
      <div class="search-result-address">${p.address}</div>
      <div class="search-result-details">
        <span class="search-result-badge">${p.type}</span>
        <span>${p.zone || "N/A"}</span><span>${fmt(p.assessed2022)}</span>
        ${p.sqft > 0 ? `<span>${Math.round(p.sqft).toLocaleString()} sf</span>` : ""}
      </div>
    </div>`,
    )
    .join("");
  searchResults.classList.add("show");
  searchResults.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", () => {
      selectParcel(item.dataset.parcelId, item.dataset.type);
      searchResults.classList.remove("show");
      document.getElementById("parcel-search").value = "";
    });
  });
}

// ─── Parcel selection ─────────────────────────────────────────────────────────

function selectParcel(parcelId, type) {
  if (activeTab !== type) switchTab(type);
  const parcel = parcelData[type].find((p) => p.parcelId === parcelId);
  if (!parcel) return;
  showParcelDetail(
    {
      "Property Address": parcel.address,
      "Parcel ID": parcel.parcelId,
      Owner: parcel.owner,
      Zone: parcel.zone,
      Neighborhood: parcel.neighborhood,
      "Style Description": parcel.style,
      "Frame Type": parcel.frame,
      "Effective Year Built": parcel.yearBuilt,
      "Gross Area of Primary Building": parcel.sqft,
      "Land Acres": parcel.acreage,
      "Number of Bedroom": parcel.bedrooms,
      "Number of Bathrooms": parcel.bathrooms,
      "Assessed Total": parcel.assessed2022,
      "Pre Year Assessed Total": parcel.assessed2020,
    },
    type,
  );
  highlightParcelOnMap(parcelId, type);
}

// ─── Bar-click filter ─────────────────────────────────────────────────────────

function applyBarFilter(type, field, value) {
  const current = activeFilter[type];
  const isSame = current && current.field === field && current.value === value;
  activeFilter[type] = isSame ? null : { field, value };
  renderFilterChip(type);
  applyMapFilter(type);
  const parcels = getFilteredParcels(type);
  if (type === "residential") {
    if (activeBeeswarm.residential === "style") updateResBeeswarm(parcels);
    else updateResBedroomBeeswarm(parcels);
  }
  if (type === "condo") {
    if (activeBeeswarm.condo === "style") updateCondoBeeswarm(parcels);
    else updateCondoBedroomBeeswarm(parcels);
  }
  if (type === "commercial") updateCommercialZoneChart(parcels);
  updateScatter(type);
}

function getFilteredParcels(type) {
  const all = parcelData[type] || [];
  const f = activeFilter[type];
  if (!f) return all;
  const fieldMap = {
    neighborhood: "neighborhood",
    style: "style",
    zone: "zone",
    stateUse: "stateUse",
    frame: "frame",
  };
  const key = fieldMap[f.field] || f.field;
  return all.filter((p) => String(p[key]) === String(f.value));
}

function renderFilterChip(type) {
  const chipId = `${type === "residential" ? "res" : type}-filter-chip`;
  const el = document.getElementById(chipId);
  if (!el) return;
  const f = activeFilter[type];
  if (!f) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  const fieldLabels = {
    neighborhood: "Neighborhood",
    style: "Style",
    zone: "Zone",
    stateUse: "State Use",
    frame: "Frame Type",
  };
  el.style.display = "flex";
  el.innerHTML = `<span class="filter-chip-label">${fieldLabels[f.field] || f.field}: <strong>${f.value}</strong></span><button class="filter-chip-clear" onclick="clearBarFilter('${type}')" aria-label="Clear filter">×</button>`;
}

window.clearBarFilter = function (type) {
  activeFilter[type] = null;
  renderFilterChip(type);
  applyMapFilter(type);
  updateChartsForType(type);
};
