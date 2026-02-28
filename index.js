let map;

const state = {
  API_BASE: "http://localhost:8000",
  mockMode: true,
  polling: false,
  pollTimer: null,

  vesselsLatest: [],
  selectedMmsi: null,

  markers: new Map(),
  historyLine: null,
  predLine: null,
};

function setStatus(text, color = "#666") {
  const dot = document.getElementById("statusDot");
  const t = document.getElementById("statusText");
  dot.style.background = color;
  t.textContent = text;
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(el._t);
  el._t = window.setTimeout(() => el.classList.remove("show"), 2200);
}

function toISO(ms) {
  try { return new Date(ms).toISOString().replace("T", " ").replace("Z", "Z"); }
  catch { return "-"; }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// ---------- Map ----------
function initMap() {
  map = L.map("map").setView([60.1699, 24.9384], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function createVesselIcon(headingDeg = 0) {
  const rot = clamp(Number(headingDeg) || 0, 0, 360);
  const html = `
    <div style="width:18px;height:18px;transform:rotate(${rot}deg);">
      <div style="
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-bottom:14px solid #2dd4bf;
        margin:2px auto 0;
      "></div>
    </div>
  `;
  return L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

// ---------- UI render ----------
function renderVesselList(vesselsLatest, filter = "") {
  const list = document.getElementById("vesselList");
  list.innerHTML = "";

  const q = (filter || "").trim().toLowerCase();
  const items = vesselsLatest
    .filter(v => !q || String(v.mmsi).toLowerCase().includes(q))
    .sort((a, b) => String(a.mmsi).localeCompare(String(b.mmsi)));

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `<div class="item__left"><div class="item__mmsi">No vessels</div><div class="item__meta">Click Refresh or check API</div></div>`;
    list.appendChild(empty);
    return;
  }

  for (const v of items) {
    const el = document.createElement("div");
    el.className = "item";
    const ts = v.timestampExternal ?? Date.now();
    const meta = `lat ${Number(v.latitude).toFixed(4)}, lon ${Number(v.longitude).toFixed(4)}`;
    el.innerHTML = `
      <div class="item__left">
        <div class="item__mmsi">${v.mmsi}</div>
        <div class="item__meta">${meta}</div>
      </div>
      <div class="badge">${toISO(ts)}</div>
    `;
    el.addEventListener("click", () => selectVessel(v.mmsi));
    list.appendChild(el);
  }
}

function renderMarkers(vesselsLatest) {
  for (const v of vesselsLatest) {
    const mmsi = String(v.mmsi);
    const lat = Number(v.latitude);
    const lon = Number(v.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const heading = (v.heading ?? v.cog ?? 0);
    const icon = createVesselIcon(heading);

    if (!state.markers.has(mmsi)) {
      const marker = L.marker([lat, lon], { icon }).addTo(map);
      marker.bindPopup(`MMSI: ${mmsi}`);
      marker.on("click", () => selectVessel(mmsi));
      state.markers.set(mmsi, marker);
    } else {
      const marker = state.markers.get(mmsi);
      marker.setLatLng([lat, lon]);
      marker.setIcon(icon);
    }
  }

  const current = new Set(vesselsLatest.map(v => String(v.mmsi)));
  for (const [mmsi, marker] of state.markers.entries()) {
    if (!current.has(mmsi)) {
      map.removeLayer(marker);
      state.markers.delete(mmsi);
    }
  }
}

function updateSelectedPanel(v) {
  document.getElementById("selMmsi").textContent = v ? String(v.mmsi) : "-";
  document.getElementById("selTime").textContent = v ? toISO(v.timestampExternal ?? Date.now()) : "-";
  document.getElementById("selSog").textContent = v && v.sog != null ? String(v.sog) : "-";
  document.getElementById("selCog").textContent = v && v.cog != null ? String(v.cog) : "-";
}

function clearLines() {
  if (state.historyLine) { map.removeLayer(state.historyLine); state.historyLine = null; }
  if (state.predLine) { map.removeLayer(state.predLine); state.predLine = null; }
}

function drawHistory(points) {
  if (!Array.isArray(points) || points.length < 2) return;
  const latlngs = points.map(p => [Number(p.latitude), Number(p.longitude)]).filter(ll => ll.every(Number.isFinite));
  if (latlngs.length < 2) return;

  if (state.historyLine) map.removeLayer(state.historyLine);
  state.historyLine = L.polyline(latlngs, { weight: 3, opacity: 0.9 }).addTo(map);
}

function drawPrediction(points) {
  if (!Array.isArray(points) || points.length < 2) return;
  const latlngs = points.map(p => [Number(p.latitude), Number(p.longitude)]).filter(ll => ll.every(Number.isFinite));
  if (latlngs.length < 2) return;

  if (state.predLine) map.removeLayer(state.predLine);
  state.predLine = L.polyline(latlngs, { dashArray: "6 8", weight: 3, opacity: 0.9 }).addTo(map);
}

// ---------- Selection ----------
async function selectVessel(mmsi) {
  state.selectedMmsi = String(mmsi);
  clearLines();

  const v = state.vesselsLatest.find(x => String(x.mmsi) === state.selectedMmsi);
  updateSelectedPanel(v);

  if (v) {
    const lat = Number(v.latitude), lon = Number(v.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.setView([lat, lon], Math.max(map.getZoom(), 9));
      toast(`Selected MMSI ${state.selectedMmsi}`);
    }
  }

  await loadSelectedDetails();
}

async function loadSelectedDetails() {
  if (!state.selectedMmsi) return;

  const historyMin = Number(document.getElementById("historyMin").value) || 30;
  const horizonMin = Number(document.getElementById("horizonMin").value) || 10;
  const stepSec = Number(document.getElementById("stepSec").value) || 60;

  setStatus("Loading selected…", "#fbbf24");

  try {
    const [history, prediction] = await Promise.all([
      apiGetHistory(state.selectedMmsi, historyMin),
      apiGetPrediction(state.selectedMmsi, horizonMin, stepSec),
    ]);

    drawHistory(history);
    drawPrediction(prediction);

    setStatus(state.polling ? "Polling…" : "Ready", state.polling ? "#60a5fa" : "#2dd4bf");
  } catch (e) {
    console.error(e);
    setStatus("Error loading selected", "#ef4444");
    toast("Could not load history/prediction (check API or mock mode).");
  }
}

// ---------- API layer ----------
async function apiGetLatestAll() {
  if (state.mockMode) return mockLatestAll();
  const url = `${state.API_BASE}/vessels/latest_all`;
  return httpJson(url);
}

async function apiGetHistory(mmsi, minutes) {
  if (state.mockMode) return mockHistory(mmsi, minutes);
  const url = `${state.API_BASE}/vessels/${encodeURIComponent(mmsi)}/history?minutes=${encodeURIComponent(minutes)}`;
  return httpJson(url);
}

async function apiGetPrediction(mmsi, horizonMin, stepSec) {
  if (state.mockMode) return mockPrediction(mmsi, horizonMin, stepSec);
  const url = `${state.API_BASE}/vessels/${encodeURIComponent(mmsi)}/prediction?horizon_min=${encodeURIComponent(horizonMin)}&step_sec=${encodeURIComponent(stepSec)}`;
  return httpJson(url);
}

async function httpJson(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}: ${txt}`);
  }
  return res.json();
}

// ---------- Refresh loop ----------
async function refreshLatest() {
  setStatus("Refreshing…", "#fbbf24");
  try {
    const latest = await apiGetLatestAll();
    const normalized = (Array.isArray(latest) ? latest : []).map(v => ({
      mmsi: v.mmsi,
      latitude: v.latitude ?? v.lat,
      longitude: v.longitude ?? v.lon,
      sog: v.sog,
      cog: v.cog,
      heading: v.heading,
      timestampExternal: v.timestampExternal ?? v.ts ?? Date.now(),
    }));

    state.vesselsLatest = normalized;

    renderVesselList(state.vesselsLatest, document.getElementById("search").value);
    renderMarkers(state.vesselsLatest);

    if (state.selectedMmsi) {
      const v = state.vesselsLatest.find(x => String(x.mmsi) === state.selectedMmsi);
      updateSelectedPanel(v || null);
      if (!v) {
        state.selectedMmsi = null;
        clearLines();
        toast("Selected vessel not found in latest data.");
      }
    }

    setStatus(state.polling ? "Polling…" : "Ready", state.polling ? "#60a5fa" : "#2dd4bf");
  } catch (e) {
    console.error(e);
    setStatus("Refresh error", "#ef4444");
    toast("Refresh failed. Check API base URL or enable Mock mode.");
  }
}

function startPolling() {
  if (state.polling) return;
  const pollSec = Number(document.getElementById("pollSec").value) || 60;

  state.polling = true;
  document.getElementById("btnTogglePolling").textContent = "Stop polling";
  setStatus("Polling…", "#60a5fa");

  refreshLatest().finally(() => {
    state.pollTimer = window.setInterval(async () => {
      await refreshLatest();
      if (state.selectedMmsi) await loadSelectedDetails();
    }, pollSec * 1000);
  });
}

function stopPolling() {
  if (!state.polling) return;
  state.polling = false;
  document.getElementById("btnTogglePolling").textContent = "Start polling";
  setStatus("Ready", "#2dd4bf");

  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// ---------- Mock data ----------
function mockLatestAll() {
  const now = Date.now();

  // Simulate motion by adding small drift using time
  const t = (now / 1000) % 3600;
  const drift = (x) => 0.02 * Math.sin(t / 60 + x);

  return [
    { mmsi: "230123000", latitude: 60.1699 + drift(0),  longitude: 24.9384 + drift(1), sog: 12.4, cog: 85,  heading: 90,  timestampExternal: now },
    { mmsi: "230456000", latitude: 60.4518 + drift(2),  longitude: 22.2666 + drift(3), sog: 9.1,  cog: 40,  heading: 35,  timestampExternal: now },
    { mmsi: "230789000", latitude: 65.0121 + drift(4),  longitude: 25.4651 + drift(5), sog: 14.6, cog: 190, heading: 185, timestampExternal: now },
  ];
}

function mockHistory(mmsi, minutes) {
  const v = mockLatestAll().find(x => String(x.mmsi) === String(mmsi)) || mockLatestAll()[0];
  const n = Math.max(8, Math.min(60, Math.floor(minutes / 2)));
  const pts = [];
  const baseLat = Number(v.latitude);
  const baseLon = Number(v.longitude);
  const now = Date.now();

  for (let i = n; i >= 1; i--) {
    const t = i / n;
    pts.push({
      latitude: baseLat - 0.15 * t + 0.03 * Math.sin(6 * t),
      longitude: baseLon - 0.18 * t + 0.03 * Math.cos(6 * t),
      timestampExternal: now - i * 60_000,
    });
  }
  pts.push({ latitude: baseLat, longitude: baseLon, timestampExternal: now });
  return pts;
}

function mockPrediction(mmsi, horizonMin, stepSec) {
  const v = mockLatestAll().find(x => String(x.mmsi) === String(mmsi)) || mockLatestAll()[0];
  const baseLat = Number(v.latitude);
  const baseLon = Number(v.longitude);
  const sog = Number(v.sog || 10); // knots
  const cog = Number(v.cog || 90); // degrees

  const steps = Math.max(2, Math.floor((horizonMin * 60) / stepSec));
  const pts = [];
  const now = Date.now();

  const metersPerSec = sog * 0.514444;
  const degPerMeterLat = 1 / 111_320;
  const latRad = (baseLat * Math.PI) / 180;
  const degPerMeterLon = 1 / (111_320 * Math.cos(latRad));

  const bearing = (cog * Math.PI) / 180;
  let lat = baseLat, lon = baseLon;

  pts.push({ latitude: lat, longitude: lon, futureTs: now });

  for (let i = 1; i <= steps; i++) {
    const dt = stepSec;
    const dx = Math.sin(bearing) * metersPerSec * dt;
    const dy = Math.cos(bearing) * metersPerSec * dt;

    lat += dy * degPerMeterLat;
    lon += dx * degPerMeterLon;

    pts.push({ latitude: lat, longitude: lon, futureTs: now + i * stepSec * 1000 });
  }
  return pts;
}

// ---------- Wire UI ----------
function initUI() {
  const apiBase = document.getElementById("apiBase");
  const mockMode = document.getElementById("mockMode");
  const btnRefresh = document.getElementById("btnRefresh");
  const btnTogglePolling = document.getElementById("btnTogglePolling");
  const btnClear = document.getElementById("btnClear");
  const search = document.getElementById("search");
  const btnLoadSelected = document.getElementById("btnLoadSelected");

  state.API_BASE = apiBase.value.trim();
  state.mockMode = mockMode.checked;

  apiBase.addEventListener("change", () => {
    state.API_BASE = apiBase.value.trim();
    toast(`API base: ${state.API_BASE}`);
  });

  mockMode.addEventListener("change", () => {
    state.mockMode = mockMode.checked;
    toast(state.mockMode ? "Mock mode enabled" : "Mock mode disabled");
    refreshLatest();
  });

  btnRefresh.addEventListener("click", refreshLatest);

  btnTogglePolling.addEventListener("click", () => {
    state.polling ? stopPolling() : startPolling();
  });

  btnClear.addEventListener("click", () => {
    search.value = "";
    renderVesselList(state.vesselsLatest, "");
  });

  search.addEventListener("input", () => {
    renderVesselList(state.vesselsLatest, search.value);
  });

  btnLoadSelected.addEventListener("click", async () => {
    if (!state.selectedMmsi) return toast("Select a vessel first.");
    await loadSelectedDetails();
  });
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", async () => {
  initMap();
  initUI();
  setStatus("Ready", "#2dd4bf");

  await refreshLatest();
  if (state.mockMode && state.vesselsLatest.length > 0) {
    await selectVessel(state.vesselsLatest[0].mmsi);
  }
});
