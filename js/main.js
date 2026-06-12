"use strict";

console.log("🚀 Assessor's Atlas - D3 Interactive Version");

function waitForLibraries(timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (
        typeof maplibregl !== "undefined" &&
        typeof pmtiles !== "undefined" &&
        typeof d3 !== "undefined"
      )
        resolve();
      else if (Date.now() - start > timeout)
        reject(new Error("Library loading timeout"));
      else setTimeout(check, 100);
    };
    check();
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  showLoading("Loading libraries…");
  try {
    await waitForLibraries(20000);
    showLoading("Initializing maps…");
    await initializeMaps();
  } catch (err) {
    showError(err.message);
    return;
  }
  document
    .getElementById("enter-btn")
    .addEventListener("click", enterDashboard);
});

console.log("✅ D3 Interactive Charts Ready");
