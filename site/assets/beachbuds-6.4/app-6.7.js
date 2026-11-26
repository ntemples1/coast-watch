'use strict';
/* BeachBuds Alerts. Live Wessex Water storm overflow reports for Branksome, Bournemouth and Poole,
   with Open-Meteo rain, wind and sea context. Static site: every feed below is public, keyless
   and allows browser requests from any origin (CORS *). */
(function () {
const ARC = 'https://services.arcgis.com/3SZ6e0uCvPROr4mS/arcgis/rest/services/';
const FEEDS = {
  activity: 'Wessex_Water_Storm_Overflow_Activity/FeatureServer/0/query',  // live status per outfall
  locations: 'Storm_Overflow_Services_PROD_view/FeatureServer/0/query',     // names, treatment, Wessex note
  events: 'Storm_Overflow_Services_PROD_view/FeatureServer/1/query'         // discharge events, rolling ~24h
};
const WX_POINT = {latitude: '50.705', longitude: '-1.907', timezone: 'Europe/London', timeformat: 'unixtime'}; // Branksome Chine beach
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({...WX_POINT, current: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m', hourly: 'rain,showers,precipitation_probability', daily: 'sunrise,sunset', past_days: '2', forecast_days: '3', wind_speed_unit: 'mph'});
const MARINE_HOURLY = [
  'sea_level_height_msl', 'sea_surface_temperature',
  'wave_height', 'wave_period', 'wave_direction',
  'swell_wave_height', 'swell_wave_period', 'swell_wave_direction', 'wind_wave_height'
].join(',');
const marineUrl = options => 'https://marine-api.open-meteo.com/v1/marine?' + new URLSearchParams({
  ...WX_POINT, cell_selection: 'sea', ...options
});
const MARINE_URL = marineUrl({hourly: MARINE_HOURLY, past_days: '1', forecast_days: '3'});
const WESSEX_MAP = 'https://www.wessexwater.co.uk/coast-and-rivers-watch-map';
const HOUR = 3600e3, DAY = 24 * HOUR, STALE_AFTER = 2 * HOUR, REFRESH_MS = 5 * 60e3, WX_REFRESH_MS = 30 * 60e3;
const HOME_ID = 'WXW00865', HOME_BEACH = 'branksome';
const STORE_KEY = 'coast-watch.v6', OLD_KEY = 'coast-watch.preferences.v2', MOTION_KEY = 'coast-watch.motion-paused';

// A named outfall drives its own card colour. The outfalls list supplies nearby context.
// bw lists the official EA bathing water id(s) for each beach (see assets/js/bathing.js). Empty bw = not designated.
const BEACHES = [
  {id:'sandbanks', name:'Sandbanks', lat:50.6858, lon:-1.9445, water:'sea', outfalls:['WXW00991','WXW00955'], bw:['ukk2102-19350']},
  {id:'shore-road', outfall:'WXW00991', name:'Shore Road', lat:50.6928, lon:-1.9285, water:'sea', outfalls:['WXW00991','WXW00955'], bw:['ukk2102-19200']},
  {id:'canford-cliffs', name:'Canford Cliffs', lat:50.6992, lon:-1.9168, water:'sea', outfalls:['WXW00991','WXW00865'], bw:['ukk2102-19190']},
  {id:'branksome', outfall:'WXW00865', name:'Branksome Chine', lat:50.7047, lon:-1.9068, water:'sea', outfalls:['WXW00865'], bw:['ukk2102-19170']},
  {id:'alum', name:'Alum Chine', lat:50.7104, lon:-1.8962, water:'sea', outfalls:['WXW00865','WXW00155'], bw:['ukk2101-19160']},
  {id:'durley', name:'Durley Chine', lat:50.7138, lon:-1.8842, water:'sea', outfalls:['WXW00155','WXW00865'], bw:['ukk2101-19150']},
  {id:'bournemouth-pier', outfall:'WXW00155', name:'Bournemouth Pier', lat:50.7156, lon:-1.8752, water:'sea', outfalls:['WXW00155','WXW00153'], bw:['ukk2101-19100']},
  {id:'boscombe', outfall:'WXW00153', name:'Boscombe Pier', lat:50.7196, lon:-1.8436, water:'sea', outfalls:['WXW00153','WXW00155'], bw:['ukk2101-19060']},
  {id:'fishermans', outfall:'WXW00429', name:'Fisherman’s Walk', lat:50.7206, lon:-1.8170, water:'sea', outfalls:['WXW00429','WXW00153'], bw:['ukk2101-19030']},
  {id:'southbourne', name:'Southbourne', lat:50.7199, lon:-1.7950, water:'sea', outfalls:['WXW00429','WXW00521'], bw:['ukk2101-19020']},
  {id:'hengistbury', outfall:'WXW00521', name:'Hengistbury Head', lat:50.7142, lon:-1.7655, water:'sea', outfalls:['WXW00521'], bw:['ukk2101-19000']},
  {id:'evening-hill', outfall:'WSX1292', name:'Evening Hill, Lilliput', lat:50.7030, lon:-1.9478, water:'harbour', outfalls:['WSX1292','WSX10118','WXW00955'], bw:[]},
  {id:'baiter', outfall:'WSX10143', name:'Whitecliff and Baiter', lat:50.7128, lon:-1.9655, water:'harbour', outfalls:['WSX10143','WXW00396'], bw:[]},
  {id:'poole-quay', outfall:'WXW00866', name:'Poole Quay', lat:50.7118, lon:-1.9855, water:'harbour', outfalls:['WXW00396','WXW00866','WSX10060'], bw:[]},
  {id:'hamworthy', outfall:'WSX10057', name:'Hamworthy and Rockley', lat:50.7080, lon:-2.0095, water:'harbour', outfalls:['WSX10058','WSX10057'], bw:['ukk2102-19400','ukk2102-19450']}
];
const OUTLOOK_SPOTS = [
  ...[HOME_BEACH, 'sandbanks', 'bournemouth-pier', 'boscombe', 'southbourne'].map(id => BEACHES.find(beach => beach.id === id)),
  {name: 'Avon Beach', lat: 50.727, lon: -1.732}
];
const OUTLOOK_DAYS = 8;
const OUTLOOK_LOCATIONS = {
  latitude: OUTLOOK_SPOTS.map(spot => spot.lat).join(','),
  longitude: OUTLOOK_SPOTS.map(spot => spot.lon).join(','),
  forecast_days: String(OUTLOOK_DAYS)
};
const OUTLOOK_URL = marineUrl({
  ...OUTLOOK_LOCATIONS,
  hourly: 'wave_height,swell_wave_height,swell_wave_period,swell_wave_direction',
});
const OUTLOOK_WIND_URL = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
  ...WX_POINT, ...OUTLOOK_LOCATIONS, hourly: 'wind_speed_10m,wind_direction_10m', wind_speed_unit: 'mph'
});
const ALIASES = {WXW00865:'Branksome Chine', WXW00155:'Bournemouth Pier (No 1)', WXW00153:'Boscombe (No 1)', WXW00429:'Fisherman’s Walk', WXW00521:'Southbourne, Hengistbury Head', WXW00991:'Shore Road', WXW00955:'Sandbanks Pavilion'};
const KIND_ORDER = {active:0, unknown:1, recent:2, quiet:3};
const KIND_LABEL = {nearby:'Nearby reports only', active:'Discharging', recent:'Ended in last 24h', quiet:'Not discharging', unknown:'Unavailable'};
const COLOURS = {active:'#ff6b6f', recent:'#f5b041', quiet:'#4fc9a4', unknown:'#a3a8bd'};

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const finite = v => typeof v === 'number' && Number.isFinite(v);
const isTime = (v, now = Date.now()) => finite(v) && v > 0 && v <= now + 5 * 60e3;
const TZ = {timeZone: 'Europe/London'};
const fmtClock = new Intl.DateTimeFormat('en-GB', {...TZ, hour: '2-digit', minute: '2-digit', hour12: false});
const fmtDay = new Intl.DateTimeFormat('en-GB', {...TZ, weekday: 'short', day: 'numeric', month: 'short'});
const fmtFull = new Intl.DateTimeFormat('en-GB', {...TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false});
const fmtIsoDay = new Intl.DateTimeFormat('en-CA', {...TZ, year: 'numeric', month: '2-digit', day: '2-digit'});
function when(t) { if (!isTime(t)) return 'not supplied'; return (fmtIsoDay.format(t) === fmtIsoDay.format(Date.now()) ? 'today ' : fmtDay.format(t) + ' ') + fmtClock.format(t); }
function ago(ms) {
  if (!finite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60e3); if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); if (h < 48) return `${h} hr${m % 60 && h < 10 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} days`;
}
const dur = ms => { if (!finite(ms) || ms < 0) return null; const s = Math.round(ms / 1000); return s < 60 ? `${s} sec` : ago(ms); };
const num = (v, unit, dp = 1) => finite(v) ? `${(Math.abs(v) < 0.5 * 10 ** -dp ? 0 : v).toFixed(dp)} ${unit}` : 'Unavailable';
const titleCase = s => String(s || '').trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Cis|Ps|Sws|O\/S|O\/F|F W)\b/gi, x => x.toUpperCase());
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let toastTimer; function toast(t) { const n = $('toast'); n.textContent = t; n.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { n.hidden = true; }, 2400); }

// ---------- stored preferences ----------
let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch { storage = null; }
function readStore() {
  try {
    const s = JSON.parse(storage?.getItem(STORE_KEY) || 'null');
    if (s && typeof s === 'object') return s;
    const old = JSON.parse(storage?.getItem(OLD_KEY) || 'null'); // carry over saved places from the previous version
    return {outfalls: Array.isArray(old?.saved) ? old.saved : []};
  } catch { return {}; }
}
const stored = readStore();
const saved = {beaches: new Set(Array.isArray(stored.beaches) ? stored.beaches : []), outfalls: new Set(Array.isArray(stored.outfalls) ? stored.outfalls : [])};
function persist() { try { storage?.setItem(STORE_KEY, JSON.stringify({beaches: [...saved.beaches], outfalls: [...saved.outfalls]})); return true; } catch { return false; } }
function toggleSaved(set, id, label) {
  const had = saved[set].has(id); had ? saved[set].delete(id) : saved[set].add(id);
  toast(persist() ? (had ? `Removed ${label}` : `Saved ${label}`) : 'Saved for this visit only. Browser storage is off.');
  renderAll();
}

// ---------- state ----------
const NAMES = window.CW_NAMES || {}, EXPECTED = window.CW_EXPECTED || [];
const state = {view: 'home', place: HOME_ID, filter: 'all', area: 'all', query: '', savedOnly: false, alertHours: 72, open: null};
let outfalls = new Map(), events = [], historyOk = false, checkedAt = null, lastError = null, loading = false, sourceUpdated = null;
let weather = null, marine = null, weatherAt = 0, marineAt = 0, weatherFailed = false, marineFailed = false, wxBusy = false;
const mapIdOf = id => NAMES[id] && NAMES[id][1];
const nameOf = r => ALIASES[r.id] || titleCase(r.officialName || (NAMES[r.id] && NAMES[r.id][0])) || `Outfall ${r.id}`;
const COAST_IDS = new Set(['WXW00153', 'WXW00155', 'WXW00429', 'WXW00521', 'WXW00865']);
const COAST_WATER = /POOLE HARB|POOLE BAY|HOLES BAY|LYTCHETT BAY|PARKSTONE BAY|WAREHAM CHANNEL|ENGLISH CHANNEL|BACK ?WATER CHANNEL/i;
const inCoverage = a => a && finite(a.Latitude) && finite(a.Longitude) && a.Latitude >= 50.65 && a.Latitude <= 50.8 && a.Longitude >= -2.1 && a.Longitude <= -1.7 && (COAST_IDS.has(a.Id) || COAST_WATER.test(a.ReceivingWaterCourse || ''));
function areaOf(r) {
  if (['WXW00153', 'WXW00155', 'WXW00429', 'WXW00521'].includes(r.id)) return 'bournemouth';
  if (r.id === HOME_ID) return 'branksome';
  if (/ENGLISH CHANNEL|POOLE BAY/i.test(r.water) && r.lon > -1.89) return 'bournemouth';
  if (/ENGLISH CHANNEL|POOLE BAY/i.test(r.water) && r.lon > -1.915) return 'branksome';
  return 'poole';
}

// ---------- status: anything unconfirmed is Unavailable, never an all-clear ----------
function classifyStatus(r, now, fetchedAt, err) {
  if (!fetchedAt) return {kind: 'unknown', label: err ? 'Live data unavailable' : 'Checking'};
  if (!r || r.missing) return {kind: 'unknown', label: 'Missing from feed'};
  if (r.Status === -1) return {kind: 'unknown', label: 'Monitor offline'};
  if (![0, 1].includes(r.Status)) return {kind: 'unknown', label: 'Unknown status'};
  if (!isTime(r.LastUpdated, now) || now - r.LastUpdated > STALE_AFTER) return {kind: 'unknown', label: 'Data out of date'};
  const s = r.LatestEventStart, e = r.LatestEventEnd;
  if ([s, e, r.StatusStart].some(v => v != null && !isTime(v, now)) || (isTime(s, now) && isTime(e, now) && e < s) || (r.Status === 0 && s != null && e == null)) return {kind: 'unknown', label: 'Check source data'};
  if (r.Status === 1) return {kind: 'active', label: 'Discharging'};
  if (isTime(e, now) && now - e <= DAY) return {kind: 'recent', label: 'Ended in last 24h'};
  return {kind: 'quiet', label: 'Not discharging'};
}
function statusOf(r, now = Date.now()) { return classifyStatus(r, now, checkedAt, lastError); }
const lastStart = r => isTime(r.LatestEventStart) ? r.LatestEventStart : (r.Status === 1 && isTime(r.StatusStart) ? r.StatusStart : null);
function headline(r, s = statusOf(r)) {
  if (s.kind === 'active') { const st = lastStart(r); return st ? `Discharging for ${ago(Date.now() - st)}` : 'Discharging now'; }
  if (s.kind === 'unknown') return s.label === 'Checking' ? 'Checking the latest report' : `${s.label}. Current status cannot be confirmed`;
  return isTime(r.LatestEventEnd) ? `Last discharge ended ${ago(Date.now() - r.LatestEventEnd)} ago` : 'No discharge time supplied';
}
function badge(kind, label) { const s = el('span', `badge ${kind}`); s.append(el('i', `dot ${kind}`), document.createTextNode(label || KIND_LABEL[kind])); return s; }
const allRecords = () => outfalls.size ? [...outfalls.values()] : EXPECTED.map(([id, lat, lon, water]) => ({id, lat, lon, water, mapId: mapIdOf(id)}));
const record = id => outfalls.get(id) || allRecords().find(r => r.id === id) || {id, missing: true, water: ''};
const eventsFor = r => r.mapId ? events.filter(e => e.mapId === r.mapId) : [];

// ---------- fetching ----------
const qs = p => new URLSearchParams({returnGeometry: 'false', f: 'json', ...p}).toString();
async function getJSON(url, signal) {
  const res = await fetch(url, {signal, cache: 'no-store'});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json(); if (body.error) throw new Error(body.error.message || body.reason || 'Feed error');
  return body;
}
const inList = ids => ids.map(i => `'${String(i).replace(/'/g, "''")}'`).join(',');

async function refreshOutfalls() {
  if (loading) return; loading = true; $('refresh').disabled = true; document.body.classList.add('busy');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const act = await getJSON(`${ARC}${FEEDS.activity}?${qs({where: 'Latitude >= 50.65 AND Latitude <= 50.80 AND Longitude >= -2.10 AND Longitude <= -1.70', outFields: 'Id,Status,StatusStart,LatestEventStart,LatestEventEnd,Latitude,Longitude,ReceivingWaterCourse,LastUpdated', resultRecordCount: '2000'})}`, ctl.signal);
    if (!Array.isArray(act.features) || act.exceededTransferLimit) throw new Error('Incomplete feed');
    const fresh = act.features.map(f => f.attributes).filter(inCoverage);
    if (!fresh.length || fresh.some(a => typeof a.Id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(a.Id))) throw new Error('No usable local records');
    const next = new Map();
    for (const a of fresh) next.set(a.Id, {...a, id: a.Id, lat: a.Latitude, lon: a.Longitude, water: a.ReceivingWaterCourse || '', mapId: mapIdOf(a.Id)});
    for (const [id, lat, lon, water] of EXPECTED) if (!next.has(id)) next.set(id, {id, lat, lon, water, missing: true, mapId: mapIdOf(id)});
    for (const [id, old] of outfalls) if (!next.has(id)) next.set(id, {...old, missing: true});
    const mapIds = [...next.values()].map(r => r.mapId).filter(Boolean);
    const [loc, ev] = await Promise.allSettled([
      getJSON(`${ARC}${FEEDS.locations}?${qs({where: `unique_id IN (${inList(mapIds)})`, outFields: 'unique_id,wsx_overflow_name,LevelOfTreatment,CauseOfDischarge,DischargeStatusDesc', resultRecordCount: '2000'})}`, ctl.signal),
      // One request for every local outfall's 24h events, instead of one per selected place.
      getJSON(`${ARC}${FEEDS.events}?${qs({where: `overflowid IN (${inList(mapIds)}) AND Publishstatus='TRUE'`, outFields: 'dischargeid,overflowid,dischargestart,dischargeend', orderByFields: 'dischargestart DESC', resultRecordCount: '2000'})}`, ctl.signal)
    ]);
    if (loc.status === 'fulfilled' && Array.isArray(loc.value.features)) {
      const byMap = new Map(loc.value.features.map(f => [f.attributes.unique_id, f.attributes]));
      for (const r of next.values()) { const l = byMap.get(r.mapId); if (l) Object.assign(r, {officialName: l.wsx_overflow_name, treatment: l.LevelOfTreatment, cause: l.CauseOfDischarge, wessexNote: l.DischargeStatusDesc}); }
    } else for (const r of next.values()) { const o = outfalls.get(r.id); if (o) Object.assign(r, {officialName: o.officialName, treatment: o.treatment, cause: o.cause, wessexNote: o.wessexNote}); }
    if (ev.status === 'fulfilled' && Array.isArray(ev.value.features) && !ev.value.exceededTransferLimit) {
      const seen = new Map();
      for (const {attributes: a} of ev.value.features) {
        if (!isTime(a.dischargestart)) continue;
        const key = String(a.dischargeid ?? `${a.overflowid}-${a.dischargestart}`), prev = seen.get(key);
        const end = isTime(a.dischargeend) && a.dischargeend >= a.dischargestart ? a.dischargeend : null;
        if (!prev || (prev.end == null && end != null)) seen.set(key, {id: key, mapId: a.overflowid, start: a.dischargestart, end});
      }
      events = [...seen.values()]; historyOk = true;
    } else historyOk = false;
    outfalls = next; checkedAt = Date.now(); lastError = null;
    const times = fresh.map(a => a.LastUpdated).filter(v => isTime(v)); sourceUpdated = times.length ? Math.max(...times) : null;
  } catch (err) {
    lastError = err.name === 'AbortError' ? 'Wessex Water took too long to respond' : (err.message || 'Request failed');
  } finally {
    clearTimeout(timer); loading = false; $('refresh').disabled = false; document.body.classList.remove('busy'); renderAll();
  }
}

async function getConditionJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await getJSON(url, controller.signal); }
  finally { clearTimeout(timer); }
}
async function refreshConditions() {
  if (wxBusy) return; wxBusy = true; $('conditions-refresh').disabled = true;
  await Promise.allSettled([
    getConditionJSON(WEATHER_URL).then(d => { if (!d.hourly || !Array.isArray(d.hourly.time)) throw new Error('No hourly data'); weather = d; weatherAt = Date.now(); weatherFailed = false; }).catch(() => { weatherFailed = true; }),
    getConditionJSON(MARINE_URL).then(d => { if (!finite(d.latitude) || !finite(d.longitude)) throw new Error('No model location'); marine = d; marineAt = Date.now(); marineFailed = false; }).catch(() => { marineFailed = true; })
  ]);
  wxBusy = false; $('conditions-refresh').disabled = false; renderAll();
}

// ---------- weather logic ----------
const weatherFresh = () => weather && !weatherFailed && Date.now() - weatherAt < 2 * HOUR;
const marineFresh = () => marine && !marineFailed && Date.now() - marineAt < 2 * HOUR;
function rainHours() {
  if (!weatherFresh()) return [];
  const h = weather.hourly;
  return h.time.map((t, i) => ({time: t * 1000, mm: finite(h.rain?.[i]) && finite(h.showers?.[i]) && h.rain[i] >= 0 && h.showers[i] >= 0 ? h.rain[i] + h.showers[i] : null, prob: h.precipitation_probability?.[i]}));
}
// Sum complete hours only. Any gap returns null so a missing hour never reads as zero rain.
function rainWindow(hours, future = false) {
  const now = Date.now(), boundary = Math.floor(now / HOUR) * HOUR;
  const rows = rainHours().filter(r => future ? r.time > boundary && r.time <= boundary + hours * HOUR : r.time > boundary - hours * HOUR && r.time <= boundary);
  if (rows.length !== hours || rows.some(r => r.mm == null)) return null;
  return rows.reduce((a, r) => a + r.mm, 0);
}
function rainWord(mm) { if (!finite(mm)) return null; return mm < 0.2 ? 'dry' : mm < 2 ? 'light rain' : mm < 10 ? 'moderate rain' : 'heavy rain'; }
const compass = d => finite(d) ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((d % 360) + 360) % 360 / 22.5) % 16] : null;
function marineHours(h = marine.hourly) {
  if (!Array.isArray(h?.time)) return [];
  return h.time.map((t, i) => ({
    time: t * 1000,
    level: h.sea_level_height_msl?.[i],
    temperature: h.sea_surface_temperature?.[i],
    wave: h.wave_height?.[i],
    period: h.wave_period?.[i],
    direction: h.wave_direction?.[i],
    swell: h.swell_wave_height?.[i],
    swellPeriod: h.swell_wave_period?.[i],
    swellDirection: h.swell_wave_direction?.[i],
    chop: h.wind_wave_height?.[i]
  }));
}
function marineWindow() {
  const boundary = Math.floor(Date.now() / HOUR) * HOUR;
  const rows = marineHours();
  const current = rows.find(r => r.time === boundary);
  const chart = rows.filter(r => r.time >= boundary && r.time <= boundary + DAY);
  const complete = chart.length === 25 && chart.every((r, i) => finite(r.level) && (!i || r.time - chart[i - 1].time === HOUR));
  // A turning point must be the extreme of the surrounding 3 hours each side, so small wiggles are ignored.
  const peak = (cmp) => complete ? chart.find((r, i) => i > 0 && i < chart.length - 1 && chart.slice(Math.max(0, i - 3), i + 4).every(o => o === r || cmp(r.level, o.level) || r.level === o.level) && cmp(r.level, chart[i - 1].level)) : null;
  const trend = complete ? (chart[1].level - chart[0].level > 0.02 ? 'Rising' : chart[1].level - chart[0].level < -0.02 ? 'Falling' : 'Near level') : null;
  return {current, chart: complete ? chart : [], nextHigh: peak((a, b) => a > b), nextLow: peak((a, b) => a < b), trend};
}

// ---------- 24h strips ----------
function dischargeStrip(rs, {ticks = false} = {}) {
  const now = Date.now(), start = now - DAY, wrap = el('div', 'tl');
  const bar = el('div', 'tl-bar'); wrap.append(bar);
  if (!checkedAt) { bar.classList.add('na'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'Checking 24-hour discharge history'); return wrap; }
  if (!historyOk) { bar.classList.add('na'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', '24-hour history unavailable'); wrap.append(el('span', 'fine', '24h history unavailable. This is not an all-clear.')); return wrap; }
  let n = 0;
  const place = (a, b, cls, title) => { const i = el('i', cls); i.style.left = `${((a - start) / DAY) * 100}%`; i.style.width = `max(3px, ${((b - a) / DAY) * 100}%)`; i.title = title; bar.append(i); n++; };
  for (const r of rs) {
    const active = statusOf(r).kind === 'active';
    for (const e of eventsFor(r)) {
      const end = e.end ?? (active ? now : null);
      if ((end ?? e.start) < start) continue;
      place(Math.max(e.start, start), Math.min(end ?? e.start, now), e.end == null ? (active ? 'open' : 'unresolved') : '', `${nameOf(r)}: ${when(e.start)} to ${e.end ? when(e.end) : active ? 'now, ongoing' : 'end not reported'}`);
    }
    if (active && lastStart(r) && !eventsFor(r).some(e => e.end == null)) place(Math.max(lastStart(r), start), now, 'open', `${nameOf(r)}: discharging now`);
  }
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', n ? `${n} reported discharge${n > 1 ? 's' : ''} in the last 24 hours` : 'No published discharges in the last 24 hours');
  if (ticks) wrap.append(tickRow(now));
  return wrap;
}
function tickRow(now) { const t = el('div', 'tl-ticks'); for (const h of [24, 18, 12, 6, 0]) t.append(el('span', '', h ? fmtClock.format(now - h * HOUR) : 'now')); return t; }
function rainStrip() {
  const now = Date.now(), start = now - DAY, wrap = el('div', 'rain-strip'), rows = rainHours().filter(r => r.time > start - HOUR && r.time <= now);
  if (!rows.length) { wrap.classList.add('na'); wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', 'Rain data unavailable'); return wrap; }
  const max = Math.max(2, ...rows.map(r => r.mm || 0));
  for (const r of rows) {
    // Open-Meteo hourly rain is the total for the preceding hour.
    const a = Math.max(r.time - HOUR, start), b = Math.min(r.time, now); if (b <= a) continue;
    const i = el('i', r.mm == null ? 'na' : '');
    i.style.left = `${((a - start) / DAY) * 100}%`; i.style.width = `${((b - a) / DAY) * 100}%`;
    i.style.height = r.mm == null ? '100%' : `${Math.max(r.mm > 0 ? 8 : 0, (r.mm / max) * 100)}%`;
    i.title = `${fmtClock.format(r.time - HOUR)} to ${fmtClock.format(r.time)}: ${r.mm == null ? 'no data' : r.mm.toFixed(1) + ' mm'}`;
    wrap.append(i);
  }
  const total = rainWindow(24);
  wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', `Hourly rain over the last 24 hours${finite(total) ? `, ${total.toFixed(1)} mm in total` : ''}`);
  return wrap;
}

// ---------- derived ----------
function beachSummary(beach) {
  const local = beach.outfall ? record(beach.outfall) : null;
  const status = beach.outfall ? statusOf(local) : {kind: 'nearby', label: KIND_LABEL.nearby};
  const nearby = beach.outfalls.filter(id => id !== beach.outfall).map(id => ({id, report: record(id)}));
  return {local, status, nearby};
}
function counts() { const c = {active: 0, recent: 0, quiet: 0, unknown: 0}; for (const r of outfalls.values()) c[statusOf(r).kind]++; return c; }

// ---------- render: live line + home ----------
function renderLive() {
  const dot = $('live-dot');
  if (lastError) { dot.className = 'live-dot error'; $('live-label').textContent = checkedAt ? 'Update failed, previous reports shown' : 'Live reports unavailable'; }
  else if (!checkedAt) { dot.className = 'live-dot'; $('live-label').textContent = 'Connecting to Wessex Water'; }
  else { const u = counts().unknown; dot.className = `live-dot ${u ? 'warn' : 'ok'}`; $('live-label').textContent = u ? 'Feed connected, some reports unavailable' : 'Wessex Water feed connected'; }
  $('live-detail').textContent = checkedAt ? `Checked ${fmtClock.format(checkedAt)} · Wessex data from ${sourceUpdated ? fmtClock.format(sourceUpdated) : 'unknown time'} · UK time · refreshes every 5 min` : (lastError ? 'Use Refresh or check Wessex Water’s map.' : 'Fetching the latest reports…');
  const banner = $('banner'); banner.hidden = !lastError;
  if (lastError) {
    banner.replaceChildren(document.createTextNode(checkedAt ? `Could not refresh (${lastError}). Reports were last fetched at ${fmtClock.format(checkedAt)} and may have changed. ` : `Could not load the live feed (${lastError}). Current monitor status cannot be confirmed. `));
    const a = el('a', '', 'Open Wessex Water’s map ↗'); a.href = WESSEX_MAP; a.target = '_blank'; a.rel = 'noopener'; banner.append(a);
  }
  const c = counts(), alerts = c.active + c.unknown, nav = $('nav-alert-count');
  nav.hidden = !checkedAt || !alerts; nav.textContent = alerts; nav.className = `nav-count${c.active ? ' active' : ''}`;
}

function renderHome() {
  const r = record(HOME_ID), s = statusOf(r), hero = $('home-hero');
  hero.dataset.kind = s.kind;
  $('home-status').replaceChildren(badge(s.kind, s.label));
  $('home-summary').textContent = !checkedAt ? (lastError ? 'The current monitor report could not be loaded. Treat Branksome’s status as unknown.' : 'Getting Branksome’s latest overflow report.') :
    s.kind === 'active' ? `${headline(r, s)}. The latest Wessex report says this outfall is discharging.` :
    s.kind === 'unknown' ? `${s.label}. Branksome’s current status cannot be confirmed, so do not read this as an all-clear.` :
    s.kind === 'recent' ? `Not discharging now. A discharge ended ${ago(Date.now() - r.LatestEventEnd)} ago.` : 'The latest source report says this outfall is not discharging.';
  const strip = $('home-strip'); strip.replaceChildren(el('p', 'strip-label', 'Last 24h · discharges'), dischargeStrip([r]), el('p', 'strip-label', 'Rain at Branksome (model)'), rainStrip(), tickRow(Date.now()));
  const end = isTime(r.LatestEventEnd) ? r.LatestEventEnd : null, st = lastStart(r);
  $('home-stop').textContent = !checkedAt ? '…' : s.kind === 'active' ? 'Ongoing' : end ? `${ago(Date.now() - end)} ago` : 'Not supplied';
  $('home-stop-date').textContent = s.kind === 'active' && st ? `Started ${when(st)}` : end ? fmtFull.format(end) : '';
  $('home-duration').textContent = !checkedAt ? '…' : s.kind === 'active' ? (st ? `${ago(Date.now() - st)} so far` : 'Start not supplied') : (st && end && end >= st ? dur(end - st) : 'Not supplied');
  const r24 = rainWindow(24);
  $('home-rain').textContent = weatherFresh() ? num(r24, 'mm') : (weatherFailed ? 'Unavailable' : '…');
  $('home-rain-note').textContent = finite(r24) ? `${rainWord(r24)[0].toUpperCase()}${rainWord(r24).slice(1)} · model estimate` : 'Model estimate at Branksome';
  $('home-updated').textContent = checkedAt && isTime(r.LastUpdated) ? `${ago(Date.now() - r.LastUpdated)} ago` : '…';
  $('home-updated-date').textContent = checkedAt && isTime(r.LastUpdated) ? fmtFull.format(r.LastUpdated) : 'Checked every 5 minutes';
  starSync(document.querySelector('[data-save-beach=branksome]'), saved.beaches.has(HOME_BEACH), 'Save', 'Saved');
  renderHomeSun();
  renderHomeBathing();

  // Whole-area summary
  const c = counts();
  for (const k in c) $('n-' + k).textContent = checkedAt ? c[k] : (lastError ? '–' : '…');
  const activeNames = [...outfalls.values()].filter(x => statusOf(x).kind === 'active').map(nameOf);
  $('area-title').textContent = !checkedAt ? (lastError ? 'Current status cannot be confirmed' : 'Checking all local outfalls…') :
    c.active ? (c.active <= 2 ? `${activeNames.join(' and ')} discharging now` : `${c.active} outfalls discharging now`) :
    c.recent ? `None discharging now, ${c.recent} ended in the last 24h` : 'Nothing reported discharging now';
  const recs = [...outfalls.values()].filter(x => !x.missing && isTime(x.LatestEventEnd)).sort((a, b) => b.LatestEventEnd - a.LatestEventEnd);
  $('area-sub').textContent = !checkedAt ? '' : `${outfalls.size} monitored outfalls on the coast and in Poole Harbour. ` +
    (c.active > 2 ? `Including ${activeNames.slice(0, 3).join(', ')}. ` : '') +
    (recs[0] && !c.active ? `Most recent discharge ended ${ago(Date.now() - recs[0].LatestEventEnd)} ago at ${nameOf(recs[0])}. ` : '') +
    (c.unknown ? `${c.unknown} unavailable, so check those spots separately.` : '');
  $('home-hero').closest('.view').querySelector('.area').dataset.kind = !checkedAt ? 'unknown' : c.active ? 'active' : c.recent ? 'recent' : c.unknown ? 'unknown' : 'quiet';

  // Rain context next to the discharge picture. Context only, never a verdict.
  const r48 = rainWindow(48), rNext = rainWindow(12, true);
  const rc = $('rain-context');
  if (!weatherFresh()) rc.textContent = weatherFailed ? 'Rain data is unavailable right now.' : 'Loading rainfall…';
  else rc.textContent = `Last 48h: ${num(r48, 'mm')} estimated at Branksome. Next 12h forecast: ${num(rNext, 'mm')}.`;

  // Your beaches: Branksome plus saved
  const mine = BEACHES.filter(b => b.id === HOME_BEACH || saved.beaches.has(b.id));
  const box = $('my-beaches'); box.replaceChildren(...mine.map(beachCard));
  if (mine.length === 1) box.append(el('p', 'fine', 'Save more beaches from the Beaches tab and they will appear here.'));
  renderMoon();
  renderWaveForecast();
  renderWaveOutlook();
}

function starSync(btn, on, offText, onText) { if (!btn) return; btn.textContent = on ? `★ ${onText}` : `☆ ${offText}`; btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('on', on); }
function starButton(set, id, label) {
  const on = saved[set].has(id), b = el('button', 'star' + (on ? ' on' : ''), on ? '★' : '☆');
  b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', `${on ? 'Unsave' : 'Save'} ${label}`);
  b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); toggleSaved(set, id, label); });
  return b;
}

// ---------- official bathing water (Environment Agency), static snapshot in bathing.js ----------
// The EA API blocks browser requests from other sites, so classifications are a yearly snapshot
// and daily pollution risk forecasts are linked out to Swimfo rather than shown as a status here.
const BW = (window.CW_BATHING && window.CW_BATHING.sites) ? window.CW_BATHING : {snapshot: null, sites: {}};
const SWIMFO = id => `https://environment.data.gov.uk/bwq/profiles/profile.html?site=${encodeURIComponent(id)}`;
const BW_CLASSES = ['Excellent', 'Good', 'Sufficient', 'Poor'];
const fmtLongDay = new Intl.DateTimeFormat('en-GB', {...TZ, day: 'numeric', month: 'long', year: 'numeric'});
function bathingSeason(at = Date.now()) {
  const iso = fmtIsoDay.format(at), md = iso.slice(5), year = +iso.slice(0, 4);
  const inSeason = md >= '05-15' && md <= '09-30';
  return {inSeason, nextStart: `15 May ${md > '09-30' ? year + 1 : year}`};
}
function bwSite(id) { return BW.sites[id] || null; }
function bwYears(s) { return Object.keys((s && s.classes) || {}).filter(y => /^\d{4}$/.test(y)).sort(); }
function bwLatest(id) {
  const s = bwSite(id), year = bwYears(s).pop(), cls = year && s.classes[year];
  return BW_CLASSES.includes(cls) ? {year, cls} : null;
}
function bwBadge(cls) { const ok = BW_CLASSES.includes(cls); return el('span', `bwq ${ok ? cls.toLowerCase() : 'none'}`, ok ? cls : 'Unavailable'); }
function bwShortName(s) { return s.name.replace(/^(Poole Harbour|Poole|Bournemouth) /, ''); }
function bathingLine(b) {
  const p = el('p', 'card-bw');
  if (!b.bw || !b.bw.length) { p.append(el('span', 'muted', 'Not an official bathing water, so no EA rating')); return p; }
  const parts = b.bw.map(id => ({s: bwSite(id), l: bwLatest(id)}));
  const year = parts.map(x => x.l && x.l.year).filter(Boolean).sort().pop();
  p.append(el('span', 'muted', `EA water quality${year ? ` ${year}` : ''}:`));
  for (const x of parts) {
    p.append(document.createTextNode(' '));
    if (parts.length > 1 && x.s) p.append(el('span', 'muted', bwShortName(x.s) + ' '));
    p.append(bwBadge(x.l && x.l.cls));
  }
  return p;
}
function seasonNote(id) {
  const season = bathingSeason(), p = el('p', 'fine');
  const a = el('a', '', season.inSeason ? 'Check today’s pollution risk forecast on Swimfo ↗' : 'Full EA profile on Swimfo ↗');
  a.href = SWIMFO(id); a.target = '_blank'; a.rel = 'noopener';
  p.append(document.createTextNode(season.inSeason ?
    'The EA publishes a daily pollution risk forecast here in the bathing season. Coast Watch cannot read it directly. ' :
    `Daily pollution risk forecasts run 15 May to 30 September. Next season starts ${season.nextStart}. `), a);
  return p;
}
function bwRow(id) {
  const s = bwSite(id), l = bwLatest(id), row = el('div', 'bw-row');
  if (!s) { row.append(el('span', 'mini-name', id), bwBadge(null)); return row; }
  row.append(el('span', 'mini-name', s.name), bwBadge(l && l.cls));
  const years = bwYears(s);
  if (years.length) {
    const h = el('span', 'bw-hist'); h.setAttribute('aria-label', 'Rating by year: ' + years.map(y => `${y} ${s.classes[y]}`).join(', '));
    for (const y of years) {
      const c = s.classes[y], chip = el('span', `bw-chip ${BW_CLASSES.includes(c) ? c.toLowerCase() : 'none'}`, `’${y.slice(2)}`);
      chip.title = `${y}: ${c}`; chip.setAttribute('aria-hidden', 'true'); h.append(chip);
    }
    row.append(h);
  }
  return row;
}
const BW_FOOT = () => `Yearly rating from the last four seasons of EA samples, not a reading for today. Snapshot taken ${BW.snapshot ? fmtLongDay.format(new Date(BW.snapshot + 'T12:00:00Z')) : 'on an unknown date'}.`;
function bathingMore(b) {
  const box = el('div', 'bw-more');
  box.append(el('p', 'more-label', 'Official bathing water · Environment Agency'));
  if (!b.bw || !b.bw.length) {
    box.append(el('p', 'fine', 'This spot is not a designated bathing water, so the EA does not sample, rate or forecast it. The outfall reports above still apply.'));
    return box;
  }
  for (const id of b.bw) {
    box.append(bwRow(id));
    if (bwSite(id)?.rainWarning) box.append(el('p', 'fine bw-rain', 'The EA says water quality here can drop after heavy rain.'));
    box.append(seasonNote(id));
  }
  box.append(el('p', 'fine', BW_FOOT()));
  return box;
}
function renderHomeBathing() {
  const box = $('home-bathing'); if (!box) return;
  const b = BEACHES.find(x => x.id === HOME_BEACH), id = b.bw[0], l = bwLatest(id), season = bathingSeason();
  const head = el('div', 'bw-head');
  head.append(el('h2', 'h3', 'Official bathing water'), bwBadge(l && l.cls));
  box.replaceChildren(head,
    el('p', 'muted', l ? `The Environment Agency rates Branksome Chine ${l.cls} for ${l.year}.` : 'The Environment Agency rating for Branksome Chine is unavailable.'),
    bwRow(id), seasonNote(id),
    el('p', 'fine', (season.inSeason ? '' : 'Out of season the EA does not sample or forecast. ') + 'A good yearly rating does not rule out pollution after rain or an overflow discharge. ' + BW_FOOT()));
}

// ---------- beach cards ----------
function beachCard(b) {
  const {local, status, nearby} = beachSummary(b), {kind} = status, key = 'b:' + b.id;
  const card = el('details', `card beach ${kind}`); card.dataset.beach = b.id; card.open = state.open === key;
  card.addEventListener('toggle', () => { if (card.open) state.open = key; else if (state.open === key) state.open = null; });
  const sm = el('summary'), head = el('div', 'card-head'), title = el('div', 'card-title');
  title.append(el('h3', '', b.name)); if (b.id === HOME_BEACH) title.append(el('span', 'pin', 'Pinned'));
  head.append(title, starButton('beaches', b.id, b.name));
  const body = el('div', 'card-body');
  body.append(badge(kind, kind === 'nearby' || checkedAt ? status.label : (lastError ? 'Unavailable' : 'Checking')));
  if (local) {
    const start = lastStart(local), stop = isTime(local.LatestEventEnd) ? local.LatestEventEnd : null;
    const line = !checkedAt ? (lastError ? 'Live data unavailable' : 'Checking…') :
      kind === 'active' ? 'Reported discharging now' :
      kind === 'unknown' ? 'Current report unavailable' :
      kind === 'recent' ? `Discharge ended ${ago(Date.now() - stop)} ago` : 'No discharge reported in the last 24h';
    body.append(el('p', 'card-line', line));
    if (checkedAt) {
      const time = kind === 'active' ? (start ? `Started ${when(start)}` : 'Start time unavailable') :
        stop ? `Last reported stop: ${when(stop)}` : 'No previous stop time supplied';
      body.append(el('p', 'card-sub', `${nameOf(local)} · ${time}`));
    }
    body.append(el('p', 'strip-label', 'This outfall · last 24h'), dischargeStrip([local]));
  } else {
    body.append(el('p', 'card-line', 'No named outfall for this beach'));
  }
  if (nearby.length) {
    const nearbyReport = nearby.filter(({report}) => ['active','recent'].includes(statusOf(report).kind))
      .sort((a, c) => KIND_ORDER[statusOf(a.report).kind] - KIND_ORDER[statusOf(c.report).kind])[0]?.report;
    const note = nearbyReport ? `Nearby: ${nameOf(nearbyReport)} · ${statusOf(nearbyReport).label.toLowerCase()}` :
      'Open for nearby outfall reports';
    body.append(el('p', 'card-sub nearby-note', note));
  }
  body.append(bathingLine(b));
  sm.append(head, body); card.append(sm);
  const more = el('div', 'card-more');
  more.append(el('p', 'more-label', 'Outfall reports'));
  for (const id of [...new Set([b.outfall, ...b.outfalls].filter(Boolean))]) {
    const r = record(id), s = statusOf(r), a = el('a', 'mini'); a.href = `#view=history&place=${id}`;
    a.append(el('span', 'mini-name', nameOf(r)), badge(s.kind, s.label), el('span', 'mini-text', headline(r, s)));
    more.append(a);
  }
  more.append(bathingMore(b));
  const acts = el('div', 'actions');
  const m = el('a', 'btn small', 'Show on map'); m.href = `#view=map&beach=${b.id}`;
  const share = el('button', 'btn small ghost', 'Copy link'); share.type = 'button'; share.addEventListener('click', () => copyLink(`view=beaches&beach=${b.id}`));
  acts.append(m, share); more.append(acts); card.append(more);
  return card;
}
function renderBeaches() {
  const list = $('beach-list'); list.replaceChildren();
  const ordered = [...BEACHES].sort((a, b) => (b.id === HOME_BEACH) - (a.id === HOME_BEACH) || saved.beaches.has(b.id) - saved.beaches.has(a.id));
  let group = null;
  for (const b of ordered) {
    const g = b.id === HOME_BEACH || saved.beaches.has(b.id) ? 'mine' : b.water;
    if (g !== group) { list.append(el('h3', 'group', {mine: 'Your beaches', sea: 'Poole Bay', harbour: 'Poole Harbour'}[g])); group = g; }
    list.append(beachCard(b));
  }
}

// ---------- history ----------
function renderHistory() {
  const sel = $('history-select'), rows = allRecords().sort((a, b) => (b.id === HOME_ID) - (a.id === HOME_ID) || nameOf(a).localeCompare(nameOf(b)));
  if (sel.options.length !== rows.length || [...sel.options].some((o, i) => o.value !== rows[i].id || o.textContent !== nameOf(rows[i]))) {
    sel.replaceChildren(...rows.map(r => { const o = el('option', '', nameOf(r)); o.value = r.id; return o; }));
  }
  if (!rows.some(r => r.id === state.place)) state.place = HOME_ID;
  sel.value = state.place;
  const r = record(state.place), s = statusOf(r);
  $('history-title').textContent = nameOf(r);
  starSync($('history-save'), saved.outfalls.has(r.id), 'Save place', 'Saved place');
  $('history-source').href = `${ARC}${FEEDS.activity}?${qs({where: `Id='${r.id}'`, outFields: '*', f: 'pjson'})}`;
  const live = $('history-live'); live.replaceChildren();
  live.append(badge(s.kind, s.label), el('p', 'row-head', headline(r, s)), el('p', 'muted', `Receiving water: ${titleCase(r.water) || 'not supplied'}`));
  const dl = el('dl', 'facts'), add = (k, v) => { if (v) dl.append(el('dt', '', k), el('dd', '', v)); };
  const st = lastStart(r), en = isTime(r.LatestEventEnd) ? r.LatestEventEnd : null;
  if (checkedAt) {
    add('Latest event start', st ? fmtFull.format(st) : 'Not supplied');
    add('Latest event end', s.kind === 'active' ? 'Ongoing' : en ? fmtFull.format(en) : 'Not supplied');
    if (st && en && en >= st && s.kind !== 'active') add('Lasted', dur(en - st));
    add('Wessex note', r.wessexNote); add('Treatment', r.treatment); add('Cause', r.cause);
    add('Wessex updated', isTime(r.LastUpdated) ? `${fmtFull.format(r.LastUpdated)} (${ago(Date.now() - r.LastUpdated)} ago)` : 'Not supplied');
    add('IDs', `${r.id}${r.mapId ? ' · Wessex map ' + r.mapId : ''}`);
    if (r.officialName && ALIASES[r.id]) add('Official name', titleCase(r.officialName));
  }
  live.append(dl);
  const chart = $('history-chart'); chart.replaceChildren(el('p', 'strip-label', 'Discharges'), dischargeStrip([r]), el('p', 'strip-label', 'Rain at Branksome (model, mm per hour)'), rainStrip(), tickRow(Date.now()));
  const box = $('history-events'); box.replaceChildren();
  const evs = eventsFor(r).sort((a, b) => b.start - a.start);
  if (!checkedAt) box.append(el('p', 'muted', lastError ? 'History unavailable while the feed is down.' : 'Loading…'));
  else if (!historyOk) box.append(el('p', 'muted', 'History could not be loaded. This does not mean there were no discharges.'));
  else if (!r.mapId) box.append(el('p', 'muted', 'This outfall has no Wessex map ID on record, so its event history cannot be matched. Check Wessex Water’s map.'));
  else if (!evs.length) box.append(el('p', 'muted', 'No discharges published for this outfall in the last 24 hours.'));
  else {
    const t = el('table', 'events'), cap = el('caption', 'visually-hidden', `Published discharges for ${nameOf(r)}`), h = el('tr');
    for (const c of ['Start', 'End', 'Duration']) { const th = el('th', '', c); th.scope = 'col'; h.append(th); }
    t.append(cap, h);
    for (const e of evs) { const tr = el('tr'); tr.append(el('td', '', when(e.start)), el('td', '', e.end ? when(e.end) : (s.kind === 'active' ? 'Ongoing' : 'Not reported')), el('td', '', e.end ? dur(e.end - e.start) : '–')); t.append(tr); }
    box.append(t);
  }
  $('history-checked').textContent = checkedAt ? `History checked ${fmtFull.format(checkedAt)}. Published records can be delayed. Times are UK time.` : '';
}


// ---------- moon (Meeus, Astronomical Algorithms ch. 49). Computed locally, no extra API. ----------
const SYNODIC = 29.530588861;
const PHASE_NAMES = ['New', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
const sind = d => Math.sin(((d % 360) + 360) % 360 * Math.PI / 180);
const jdeFromMs = ms => ms / 86400e3 + 2440587.5;
const msFromJde = jde => (jde - 2440587.5) * 86400e3;
function moonPhaseJDE(k) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + SYNODIC * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  const phase = ((k % 1) + 1) % 1;
  const isQuarter = Math.abs(phase - 0.25) < 0.01 || Math.abs(phase - 0.75) < 0.01;
  const isFull = Math.abs(phase - 0.5) < 0.01;
  if (!isQuarter) {
    const i = isFull ? 1 : 0;
    const A = [
      [-0.40720, -0.40614], [0.17241, 0.17302], [0.01608, 0.01614], [0.01039, 0.01043],
      [0.00739, 0.00734], [-0.00514, -0.00515], [0.00208, 0.00209], [-0.00111, -0.00111],
      [-0.00057, -0.00057], [0.00056, 0.00056], [-0.00042, -0.00042], [0.00042, 0.00042],
      [0.00038, 0.00038], [-0.00024, -0.00024], [-0.00017, -0.00017], [-0.00007, -0.00007],
      [0.00004, 0.00004], [0.00004, 0.00004], [0.00003, 0.00003], [0.00003, 0.00003],
      [-0.00003, -0.00003], [0.00003, 0.00003], [-0.00002, -0.00002], [-0.00002, -0.00002], [0.00002, 0.00002]
    ];
    const S = [sind(Mp), sind(M), sind(2 * Mp), sind(2 * F), sind(Mp - M), sind(Mp + M), sind(2 * M),
      sind(Mp - 2 * F), sind(Mp + 2 * F), sind(2 * Mp + M), sind(3 * Mp), sind(M + 2 * F), sind(M - 2 * F),
      sind(2 * Mp - M), sind(Om), sind(Mp + 2 * M), sind(2 * Mp - 2 * F), sind(3 * M), sind(Mp + M - 2 * F),
      sind(2 * Mp + 2 * F), sind(Mp + M + 2 * F), sind(Mp - M + 2 * F), sind(Mp - M - 2 * F), sind(3 * Mp + M), sind(4 * Mp)];
    const mul = [1, E, 1, 1, E, E, E * E, 1, 1, E, 1, E, E, E, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    for (let n = 0; n < A.length; n++) jde += A[n][i] * S[n] * mul[n];
  } else {
    jde += -0.62801 * sind(Mp) + 0.17172 * E * sind(M) - 0.01183 * E * sind(Mp + M) + 0.00862 * sind(2 * Mp)
      + 0.00804 * sind(2 * F) + 0.00454 * E * sind(Mp - M) + 0.00204 * E * E * sind(2 * M) - 0.00180 * sind(Mp - 2 * F)
      - 0.00070 * sind(Mp + 2 * F) - 0.00040 * sind(3 * Mp) - 0.00034 * E * sind(2 * Mp - M) + 0.00032 * E * sind(M + 2 * F)
      + 0.00032 * E * sind(M - 2 * F) - 0.00028 * E * E * sind(Mp + 2 * M) + 0.00027 * E * sind(2 * Mp + M) - 0.00017 * sind(Om)
      - 0.00005 * sind(Mp - M - 2 * F) + 0.00004 * sind(2 * Mp + 2 * F) - 0.00004 * sind(Mp + M + 2 * F) + 0.00004 * sind(Mp - 2 * M)
      + 0.00003 * sind(Mp + M - 2 * F) + 0.00003 * sind(3 * M) + 0.00002 * sind(2 * Mp - 2 * F) + 0.00002 * sind(Mp - M + 2 * F)
      - 0.00002 * sind(3 * Mp + M);
    const W = 0.00306 - 0.00038 * E * Math.cos(M * Math.PI / 180) + 0.00026 * Math.cos(Mp * Math.PI / 180)
      - 0.00002 * Math.cos((Mp - M) * Math.PI / 180) + 0.00002 * Math.cos((Mp + M) * Math.PI / 180) + 0.00002 * Math.cos(2 * F * Math.PI / 180);
    jde += (Math.abs(phase - 0.25) < 0.01 ? 1 : -1) * W;
  }
  const A = [299.77 + 0.107408 * k - 0.009173 * T2, 251.88 + 0.016321 * k, 251.83 + 26.651886 * k, 349.42 + 36.412478 * k,
    84.66 + 18.206239 * k, 141.74 + 53.303771 * k, 207.14 + 2.453732 * k, 154.84 + 7.306860 * k, 34.52 + 27.261239 * k,
    207.19 + 0.121824 * k, 291.34 + 1.844379 * k, 161.72 + 24.198154 * k, 239.56 + 25.513099 * k, 331.55 + 3.592518 * k];
  const C = [0.000325, 0.000165, 0.000164, 0.000126, 0.000110, 0.000062, 0.000060, 0.000056, 0.000047, 0.000042, 0.000040, 0.000037, 0.000035, 0.000023];
  for (let n = 0; n < A.length; n++) jde += C[n] * sind(A[n]);
  return jde;
}
function kNear(ms, phase) { return Math.round((jdeFromMs(ms) - 2451550.09766) / SYNODIC - phase) + phase; }
function phaseInstant(k) { return msFromJde(moonPhaseJDE(k)); }
function lastPhaseAt(ms, phase) { let k = kNear(ms, phase); if (phaseInstant(k) > ms) k -= 1; return {k, at: phaseInstant(k)}; }
function nextPhaseAt(ms, phase) { let k = kNear(ms, phase); if (phaseInstant(k) <= ms) k += 1; return {k, at: phaseInstant(k)}; }
function moonIllumination(ms) {
  const T = (jdeFromMs(ms) - 2451545) / 36525, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let D = 297.85019267 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  let M = 357.52910918 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  let Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  const r = Math.PI / 180;
  D *= r; M *= r; Mp *= r;
  const i = Math.PI - D - 6.289 * r * Math.sin(Mp) + 2.100 * r * Math.sin(M)
    - 1.274 * r * Math.sin(2 * D - Mp) - 0.658 * r * Math.sin(2 * D) - 0.214 * r * Math.sin(2 * Mp) - 0.110 * r * Math.sin(D);
  return (1 + Math.cos(i)) / 2;
}
function moonPhase(at = Date.now()) {
  const lastNew = lastPhaseAt(at, 0), nextNew = nextPhaseAt(at, 0);
  const lastFull = lastPhaseAt(at, 0.5), nextFull = nextPhaseAt(at, 0.5);
  const ageDays = (at - lastNew.at) / DAY;
  const cycle = nextNew.at - lastNew.at;
  const frac = cycle > 0 ? ((at - lastNew.at) / cycle) % 1 : 0;
  const illumination = Math.min(1, Math.max(0, moonIllumination(at)));
  const waxing = lastNew.at >= lastFull.at;
  const visual = Math.acos(1 - 2 * illumination) / (2 * Math.PI);
  const drawFrac = waxing ? visual : (1 - visual) % 1;
  const name = PHASE_NAMES[Math.round(frac * 8) % 8];
  const near = d => d * cycle <= 2 * DAY;
  const spring = Math.min(frac, 1 - frac, Math.abs(frac - 0.5));
  const neap = Math.min(Math.abs(frac - 0.25), Math.abs(frac - 0.75));
  const tideNote = near(spring) ? 'Spring tides are usually largest around new and full moon.'
    : near(neap) ? 'Neap tides are usually smallest around first and last quarter.'
    : 'Spring tides run near new and full moon, neap tides near the quarters.';
  return {name, illumination, ageDays, frac, drawFrac, tideNote, lastNew: lastNew.at, nextNew: nextNew.at, lastFull: lastFull.at, nextFull: nextFull.at};
}
function moonLitPath(cx, cy, r, frac) {
  const f = ((frac % 1) + 1) % 1;
  if (f < 0.001 || f > 0.999) return '';
  if (Math.abs(f - 0.5) < 0.001) return '';
  const waxing = f < 0.5;
  const c = Math.cos(2 * Math.PI * f);
  const rx = Math.max(0.12, r * Math.abs(c));
  const limb = waxing ? 1 : 0;
  const term = c > 0 ? (waxing ? 0 : 1) : (waxing ? 1 : 0);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${limb} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${term} ${cx} ${cy - r} Z`;
}
function moonSvg(frac, label, photoId) {
  const s = svg('svg', {viewBox: '0 0 100 100'});
  if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); }
  else s.setAttribute('aria-hidden', 'true');
  const cx = 50, cy = 50, r = 44, f = ((frac % 1) + 1) % 1;
  const full = Math.abs(f - 0.5) < 0.001;
  const crescent = full ? '' : moonLitPath(cx, cy, r, f);
  const shape = () => full ? svg('circle', {cx, cy, r}) : svg('path', {d: crescent});
  s.append(svg('circle', {cx, cy, r, class: 'moon-unlit'}));
  if (photoId) {
    const diskId = `moon-disk-${photoId}`;
    const litId = `moon-lit-${photoId}`;
    const diskClip = svg('clipPath', {id: diskId});
    diskClip.append(svg('circle', {cx, cy, r}));
    s.append(diskClip);
    s.append(svg('image', {
      href: 'assets/beachbuds-6.4/moon-nasa.jpg', x: 4, y: 4, width: 92, height: 92,
      'clip-path': `url(#${diskId})`, class: 'moon-photo-shadow'
    }));
    if (full || crescent) {
      const fill = shape();
      fill.setAttribute('class', 'moon-lit');
      const clip = svg('clipPath', {id: litId});
      clip.append(shape());
      s.append(fill, clip, svg('image', {
        href: 'assets/beachbuds-6.4/moon-nasa.jpg', x: 4, y: 4, width: 92, height: 92,
        'clip-path': `url(#${litId})`, class: 'moon-photo-light'
      }));
    }
  } else if (full || crescent) {
    const fill = shape();
    fill.setAttribute('class', 'moon-lit');
    s.append(fill);
  }
  s.append(svg('circle', {cx, cy, r, class: 'moon-rim'}));
  return s;
}
function fmtUK(t) { return `${fmtDay.format(t)} ${fmtClock.format(t)}`; }
function renderMoon() {
  const m = moonPhase(), lit = `${Math.round(m.illumination * 100)}% lit`, age = `${m.ageDays.toFixed(1)} days`;
  const label = `${m.name}, ${lit}, ${age} into the cycle`;
  const face = $('moon-face'); if (face) face.replaceChildren(moonSvg(m.drawFrac, label, 'weather'));
  const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
  set('moon-phase', m.name); set('moon-lit', lit); set('moon-age', age);
  set('moon-full', fmtUK(m.nextFull)); set('moon-new', fmtUK(m.nextNew)); set('moon-tide-note', m.tideNote);
  const steps = $('moon-cycle-steps');
  if (steps) {
    const cur = Math.round(m.frac * 8) % 8;
    steps.replaceChildren(...PHASE_NAMES.map((name, i) => {
      const b = el('div', 'moon-step' + (i === cur ? ' now' : ''));
      b.append(moonSvg(i / 8), el('span', '', ['New', 'Wax cr.', 'First', 'Wax gib.', 'Full', 'Wan gib.', 'Last', 'Wan cr.'][i]));
      if (i === cur) b.setAttribute('aria-current', 'true');
      return b;
    }));
  }
  const bar = $('moon-cycle-bar');
  if (bar) { const i = el('i'); i.style.left = `${(m.frac * 100).toFixed(2)}%`; bar.replaceChildren(i); }
  const home = $('home-moon-face'), hl = $('home-moon-label');
  if (home) home.replaceChildren(moonSvg(m.drawFrac, null, 'home'));
  if (hl) { hl.textContent = ''; hl.append(document.createTextNode(m.name), el('small', '', lit)); }
}

// ---------- Branksome wave forecast ----------
let waveForecast = null;
const validWaveHeight = value => finite(value) && value >= 0;

function renderWaveForecast() {
  const forecast = $('wave-forecast'), status = $('wave-status');
  if (!marineFresh()) {
    waveForecast = null;
    forecast.hidden = true;
    status.hidden = false;
    status.textContent = !marineFailed && !marine ? 'Loading wave forecast…' : 'Wave forecast unavailable.';
    $('wave-source').textContent = 'Open-Meteo offshore model';
    return;
  }

  const start = Math.floor(Date.now() / HOUR) * HOUR;
  if (waveForecast?.source === marine && waveForecast.start === start) return;
  const oldTime = waveForecast && Number($('wave-hour').value) > 0
    ? waveForecast.hours[Number($('wave-hour').value)].time : start;
  const byTime = new Map(marineHours().map(row => [row.time, row]));
  const hours = Array.from({length: 25}, (_, i) => {
    const time = start + i * HOUR;
    return byTime.get(time) || {time};
  });
  const heights = hours.flatMap(row => [row.wave, row.swell]).filter(validWaveHeight);
  waveForecast = {source: marine, start, hours};
  forecast.hidden = !heights.length;
  status.hidden = heights.length > 0;
  if (!heights.length) {
    status.textContent = 'Wave forecast unavailable.';
    $('wave-source').textContent = 'Open-Meteo offshore model';
    return;
  }
  const latitude = Number(WX_POINT.latitude);
  const distance = Math.hypot(marine.latitude - latitude,
    (marine.longitude - Number(WX_POINT.longitude)) * Math.cos(latitude * Math.PI / 180)) * 111;
  $('wave-source').textContent = `Open-Meteo offshore model · grid point ${Math.round(distance)} km from Branksome`;
  const ceiling = Math.max(0.5, Math.ceil(Math.max(...heights) * 2) / 2);
  $('wave-ceiling').textContent = `${ceiling.toFixed(1)} m`;
  $('wave-ticks').replaceChildren(...[0, 6, 12, 18, 24].map(i => el('span', '', fmtClock.format(hours[i].time))));
  $('wave-chart').replaceChildren(waveHeightChart(hours, ceiling));
  $('wave-hour').value = String(Math.min(24, Math.max(0, (oldTime - start) / HOUR)));
  showWaveHour();
}

const waveX = hour => 6 + hour / 24 * 628;
const waveY = (height, ceiling) => 114 - height / ceiling * 108;
function waveHeightChart(hours, ceiling) {
  const chart = svg('svg', {viewBox: '0 0 640 120', preserveAspectRatio: 'none'});
  for (const y of [6, 60, 114]) {
    chart.append(svg('line', {x1: 6, x2: 634, y1: y, y2: y, class: 'wave-grid'}));
  }
  for (const [key, cls] of [['swell', 'wave-curve swell-curve'], ['wave', 'wave-curve combined-curve']]) {
    let path = '', connected = false;
    hours.forEach((hour, i) => {
      if (!validWaveHeight(hour[key])) { connected = false; return; }
      path += `${connected ? 'L' : 'M'}${waveX(i)} ${waveY(hour[key], ceiling)} `;
      connected = true;
    });
    if (path) chart.append(svg('path', {d: path, class: cls, pathLength: 1}));
  }
  chart.append(svg('line', {id: 'wave-cursor', x1: 6, x2: 6, y1: 6, y2: 114}));
  return chart;
}

function showWaveHour() {
  const slider = $('wave-hour'), i = Number(slider.value);
  const hour = waveForecast?.hours[i];
  if (!hour) return;
  const time = `${fmtDay.format(hour.time)} · ${fmtClock.format(hour.time)} UK time`;
  $('wave-time').textContent = time;
  const height = value => num(validWaveHeight(value) ? value : null, 'm');
  const detail = (value, period, direction) => {
    if (!validWaveHeight(value) || value === 0) return '';
    return [finite(period) && period > 0 ? num(period, 's') : '', finite(direction) ? `from ${compass(direction)}` : ''].filter(Boolean).join(' · ');
  };
  const combinedDetail = detail(hour.wave, hour.period, hour.direction);
  const swellDetail = detail(hour.swell, hour.swellPeriod, hour.swellDirection);
  $('wave-combined').textContent = height(hour.wave);
  $('wave-combined-detail').textContent = combinedDetail;
  $('wave-swell').textContent = height(hour.swell);
  $('wave-swell-detail').textContent = swellDetail;
  $('wave-chop').textContent = height(hour.chop);
  slider.setAttribute('aria-valuetext', [time,
    `Combined waves ${height(hour.wave)}`, combinedDetail,
    `Primary swell ${height(hour.swell)}`, swellDetail,
    `Wind waves ${height(hour.chop)}`
  ].filter(Boolean).join(', '));
  $('wave-cursor').setAttribute('x1', waveX(i));
  $('wave-cursor').setAttribute('x2', waveX(i));
}

// ---------- 8-day wave outlook ----------
let outlookData = null, outlookWind = null, outlookAt = 0, outlookBusy = false;
let outlookHour = null, outlookSelection = null;
const outlookFeet = metres => (metres / 0.3048).toFixed(1);

async function refreshWaveOutlook() {
  if (outlookBusy) return;
  outlookBusy = true;
  $('outlook-retry').hidden = true;
  if (!outlookData) $('outlook-status').textContent = 'Loading wave outlook…';
  try {
    const [marineResult, windResult] = await Promise.allSettled([
      getConditionJSON(OUTLOOK_URL), getConditionJSON(OUTLOOK_WIND_URL)
    ]);
    const data = marineResult.value;
    if (!Array.isArray(data) || data.length !== OUTLOOK_SPOTS.length) throw Error('Incomplete outlook response');
    outlookData = data;
    const wind = windResult.value;
    outlookWind = Array.isArray(wind) && wind.length === OUTLOOK_SPOTS.length ? wind : null;
  } catch {
    outlookData = null;
    outlookWind = null;
  } finally {
    outlookAt = Date.now();
    outlookHour = null;
    outlookBusy = false;
    renderWaveOutlook();
  }
}

function outlookDays(start) {
  const days = new Map();
  for (let time = start; ; time += HOUR) {
    const date = fmtIsoDay.format(time);
    if (!days.has(date)) {
      if (days.size === OUTLOOK_DAYS) break;
      days.set(date, {date, label: fmtDay.format(time), times: []});
    }
    days.get(date).times.push(time);
  }
  return [...days.values()];
}

function outlookGroups(data, days, windData) {
  const cells = new Map();
  data.forEach((point, i) => {
    const spot = OUTLOOK_SPOTS[i];
    const hasLocation = finite(point?.latitude) && finite(point?.longitude);
    const key = hasLocation ? `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}` : spot.name;
    const hours = marineHours(point?.hourly || {});
    if (!cells.has(key)) {
      const wind = windData?.[i]?.hourly;
      const windHours = Array.isArray(wind?.time) ? wind.time.map((time, j) => [
        time * 1000, {speed: wind.wind_speed_10m?.[j], direction: wind.wind_direction_10m?.[j]}
      ]) : [];
      cells.set(key, {key, spots: [], hours, wind: new Map(windHours)});
    }
    const cell = cells.get(key);
    cell.spots.push(spot);
    if (!cell.hours.some(row => validWaveHeight(row.wave))) cell.hours = hours;
  });
  return [...cells.values()].map(cell => {
    const rowsByTime = new Map(cell.hours.map(row => [row.time, row]));
    const name = cell.spots.length === 1 ? cell.spots[0].name : `${cell.spots[0].name} to ${cell.spots.at(-1).name}`;
    return {...cell, name, forecast: days.map(day => {
      const rows = day.times.map(time => rowsByTime.get(time));
      if (!rows.every(row => validWaveHeight(row?.wave))) return null;
      const heights = rows.map(row => row.wave);
      return {day, rows, low: Math.min(...heights), high: Math.max(...heights)};
    })};
  });
}

function renderWaveOutlook() {
  if (!outlookAt) return;
  if (Date.now() - outlookAt >= WX_REFRESH_MS && !outlookBusy) refreshWaveOutlook();
  const start = Math.floor(Date.now() / HOUR) * HOUR;
  if (outlookHour === start) return;
  outlookHour = start;
  const days = outlookDays(start);
  const groups = outlookData ? outlookGroups(outlookData, days, outlookWind) : [];
  const highs = groups.flatMap(group => group.forecast.filter(Boolean).map(day => day.high));
  $('outlook-status').hidden = highs.length > 0;
  $('outlook-retry').hidden = highs.length > 0 || outlookBusy;
  $('outlook-results').hidden = !highs.length;
  $('outlook-checked').textContent = highs.length ? `Fetched ${fmtClock.format(outlookAt)} UK` : '';
  if (!highs.length) {
    $('outlook-status').textContent = 'Wave outlook unavailable.';
    return;
  }

  const head = el('tr');
  const heading = (txt, scope) => {
    const th = el('th', '', txt);
    th.scope = scope;
    return th;
  };
  head.append(heading('Coastal area', 'col'), ...days.map((day, i) => heading(i ? day.label : 'Today', 'col')));
  $('outlook-head').replaceChildren(head);
  const scale = Math.max(0.1, ...highs);
  const rows = [], controls = [];
  for (const group of groups) {
    const row = el('tr', group.spots.some(spot => spot.id === HOME_BEACH) ? 'outlook-home' : '');
    const label = heading(group.name, 'row');
    if (group.spots.length > 1) {
      const between = group.spots.slice(1, -1).map(spot => spot.name).join(', ');
      label.append(el('small', '', between ? `Shared grid · includes ${between}` : 'Shared offshore grid'));
    }
    row.append(label);
    group.forecast.forEach((forecast, i) => {
      const td = el('td');
      if (forecast) {
        const low = outlookFeet(forecast.low), high = outlookFeet(forecast.high);
        const range = low === high ? low : `${low}–${high}`;
        const button = el('button', 'outlook-day');
        button.type = 'button';
        button.setAttribute('aria-label', `${group.name}, ${days[i].label}, ${range} feet offshore`);
        button.setAttribute('aria-pressed', 'false');
        const value = el('strong', '', range);
        value.append(el('span', 'outlook-unit', ' ft'));
        button.append(value);
        const bar = el('span', 'outlook-meter');
        bar.setAttribute('aria-hidden', 'true');
        bar.style.setProperty('--height-share', `${forecast.high / scale * 100}%`);
        button.append(bar);
        const select = () => showOutlookDay(group, forecast, button);
        button.addEventListener('click', select);
        controls.push({matches: group.key === outlookSelection?.key && days[i].date === outlookSelection.date, select});
        td.append(button);
      } else td.append(el('span', 'fine', 'Unavailable'));
      row.append(td);
    });
    rows.push(row);
  }
  $('outlook-rows').replaceChildren(...rows);
  (controls.find(control => control.matches) || controls[0]).select();
}

function showOutlookDay(group, forecast, button) {
  $('outlook-rows').querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-pressed', 'true');
  outlookSelection = {key: group.key, date: forecast.day.date};
  $('outlook-detail-title').textContent = `${group.name} · ${forecast.day.label}`;
  $('outlook-wind-site').textContent = group.spots.length > 1 ? `Wind forecast at ${group.spots[0].name} · UK time` : 'UK time';
  $('outlook-hours').replaceChildren(...forecast.rows.filter((row, i) => i % 3 === 0).map(row => {
    const item = el('li');
    const swell = validWaveHeight(row.swell) ? [
      `Swell ${outlookFeet(row.swell)} ft`,
      finite(row.swellPeriod) && row.swellPeriod > 0 ? num(row.swellPeriod, 's') : '',
      finite(row.swellDirection) ? `from ${compass(row.swellDirection)}` : ''
    ].filter(Boolean).join(' · ') : 'Swell unavailable';
    const wind = group.wind.get(row.time);
    const windDirection = wind?.speed > 0 && finite(wind?.direction) ? ` from ${compass(wind.direction)}` : '';
    const windLabel = finite(wind?.speed) ? `Wind ${num(wind.speed, 'mph', 0)}${windDirection}` : 'Wind unavailable';
    item.append(el('span', 'fine', fmtClock.format(row.time)), el('strong', '', `${outlookFeet(row.wave)} ft`),
      el('span', 'fine', swell), el('span', 'fine', windLabel));
    return item;
  }));
}

// ---------- sunrise and sunset (Open-Meteo daily, Branksome Chine, UK time) ----------
function sunTimes(now = Date.now()) {
  const d = weather?.daily, day = t => fmtIsoDay.format(t), find = t => d?.time?.findIndex(x => day(x * 1000) === day(t)) ?? -1;
  const i = find(now), j = find(now + 24 * HOUR), ms = v => finite(v) ? v * 1000 : NaN;
  return {rise: ms(d?.sunrise?.[i]), set: ms(d?.sunset?.[i]), nextRise: j >= 0 ? ms(d?.sunrise?.[j]) : NaN};
}
const sunLength = ms => { const m = Math.round(ms / 60e3); return `${Math.floor(m / 60)} hr ${m % 60} min`; };
function sunNote(sun, now = Date.now()) {
  if (!finite(sun.rise) || !finite(sun.set)) return 'Unavailable';
  if (now < sun.rise) return `Sunrise in ${ago(sun.rise - now)}`;
  if (now < sun.set) return `${ago(sun.set - now)} of daylight left`;
  return finite(sun.nextRise) ? `After sunset · sunrise tomorrow ${fmtClock.format(sun.nextRise)}` : 'After sunset';
}
function renderHomeSun() {
  const box = $('home-sun-label'); if (!box) return;
  const sun = weatherFresh() ? sunTimes() : null, ok = sun && finite(sun.rise) && finite(sun.set);
  box.textContent = '';
  box.append(document.createTextNode(ok ? `Sunrise ${fmtClock.format(sun.rise)} · Sunset ${fmtClock.format(sun.set)}` : (weatherFailed ? 'Sunrise and sunset unavailable' : 'Sunrise and sunset')),
    el('small', '', ok ? `${sunNote(sun)} · UK time` : (weatherFailed ? 'Weather request failed' : 'Loading…')));
}

// ---------- conditions ----------
function renderConditions() {
  const wf = weatherFresh(), set = (id, v) => { $(id).textContent = v; };
  const pending = !weatherFailed && !weather ? '…' : 'Unavailable';
  if (!wf) { ['rain-24', 'rain-48', 'rain-next', 'wind-speed', 'wind-gust', 'air-temp', 'sunrise', 'sunset', 'day-length', 'daylight-left'].forEach(id => set(id, pending)); set('weather-updated', weatherFailed ? 'Weather request failed. Try Refresh conditions.' : 'Weather loading…'); $('rain-chart').textContent = weatherFailed ? 'Rain chart unavailable.' : 'Loading…'; }
  else {
    const now = Date.now();
    set('rain-24', num(rainWindow(24), 'mm')); set('rain-48', num(rainWindow(48), 'mm')); set('rain-next', num(rainWindow(12, true), 'mm'));
    const c = weather.current || {}, fresh = finite(c.time) && Math.abs(now - c.time * 1000) < 2 * HOUR;
    set('wind-speed', fresh ? num(c.wind_speed_10m, 'mph') + (compass(c.wind_direction_10m) ? ' from ' + compass(c.wind_direction_10m) : '') : 'Unavailable');
    set('wind-gust', fresh ? num(c.wind_gusts_10m, 'mph') : 'Unavailable'); set('air-temp', fresh ? num(c.temperature_2m, '°C') : 'Unavailable');
    const sun = sunTimes(now);
    set('sunrise', finite(sun.rise) ? fmtClock.format(sun.rise) : 'Unavailable'); set('sunset', finite(sun.set) ? fmtClock.format(sun.set) : 'Unavailable');
    set('day-length', finite(sun.rise) && finite(sun.set) ? sunLength(sun.set - sun.rise) : 'Unavailable');
    set('daylight-left', sunNote(sun, now));
    set('weather-updated', `Weather fetched ${fmtClock.format(weatherAt)} · model time ${fresh ? fmtClock.format(c.time * 1000) : 'out of date'} · UK time`);
    rainChart();
  }
  if (!marineFresh()) { ['sea-level', 'sea-trend', 'wave-height', 'wave-period', 'sea-temp', 'model-high', 'model-low'].forEach(id => set(id, !marineFailed && !marine ? '…' : 'Unavailable')); $('tide-curve').textContent = marineFailed ? 'Sea-level forecast unavailable. Use the official tide tables below.' : 'Loading sea-level forecast…'; set('marine-updated', marineFailed ? 'Marine request failed.' : ''); }
  else {
    const m = marineWindow(), c = m.current;
    set('sea-level', c ? `${num(c.level, 'm')} relative to mean sea level` : 'Unavailable'); set('sea-trend', m.trend || 'Unavailable');
    set('wave-height', num(c?.wave, 'm')); set('wave-period', num(c?.period, 'sec')); set('sea-temp', num(c?.temperature, '°C'));
    set('model-high', m.nextHigh ? `About ${fmtClock.format(m.nextHigh.time)}` : 'No clear peak returned'); set('model-low', m.nextLow ? `About ${fmtClock.format(m.nextLow.time)}` : 'No clear trough returned');
    tideChart(m.chart);
    set('marine-updated', `Marine fetched ${fmtClock.format(marineAt)} · offshore model grid ${marine.latitude.toFixed(2)}° N, ${Math.abs(marine.longitude).toFixed(2)}° W`);
  }
  renderMoon();
}
function rainChart() {
  const box = $('rain-chart'), now = Date.now(), start = Math.floor(now / HOUR) * HOUR - 48 * HOUR, end = start + 60 * HOUR;
  const rows = rainHours().filter(r => r.time > start && r.time <= end);
  if (!rows.length) { box.textContent = 'Rain chart unavailable.'; return; }
  const W = 800, H = 150, x = t => 30 + (t - start) / (end - start) * (W - 40), max = Math.max(2, ...rows.map(r => r.mm || 0)), y = v => 120 - v / max * 100;
  const s = svg('svg', {viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Hourly rain, last 48 hours ${num(rainWindow(48), 'mm')}, next 12 hours ${num(rainWindow(12, true), 'mm')}`});
  for (const r of rows) { const fut = r.time > now; s.append(svg('rect', {x: x(r.time - HOUR) + 1, width: Math.max(1, x(r.time) - x(r.time - HOUR) - 2), y: r.mm == null ? 20 : y(r.mm), height: r.mm == null ? 100 : 120 - y(r.mm), class: r.mm == null ? 'bar-na' : fut ? 'bar-future' : 'bar'})); }
  s.append(svg('line', {x1: x(now), x2: x(now), y1: 10, y2: 124, class: 'now-line'}));
  for (let t = start; t <= end; t += 12 * HOUR) { const tx = svg('text', {x: x(t), y: 142, 'text-anchor': t === start ? 'start' : t === end ? 'end' : 'middle', class: 'axis'}); tx.textContent = (fmtIsoDay.format(t) === fmtIsoDay.format(now) ? '' : fmtDay.format(t).split(' ')[0] + ' ') + fmtClock.format(t); s.append(tx); }
  const mx = svg('text', {x: 2, y: 24, class: 'axis'}); mx.textContent = `${max.toFixed(0)}mm`; s.append(mx);
  box.replaceChildren(s);
}
function tideChart(rows) {
  const box = $('tide-curve');
  if (!rows.length) { box.textContent = 'Sea-level forecast unavailable. Use the official tide tables below.'; return; }
  const levels = rows.map(r => r.level), min = Math.min(...levels) - 0.1, max = Math.max(...levels) + 0.1, y = v => 130 - (v - min) / (max - min) * 110, x = i => 45 + i / 24 * 730;
  const s = svg('svg', {viewBox: '0 0 800 160', role: 'img', 'aria-label': 'Model sea level over the next 24 hours, in metres relative to mean sea level.'});
  [0, 6, 12, 18, 24].forEach(i => { s.append(svg('line', {x1: x(i), x2: x(i), y1: 15, y2: 133, class: 'grid'})); const t = svg('text', {x: x(i), y: 154, 'text-anchor': 'middle', class: 'axis'}); t.textContent = fmtClock.format(rows[i].time); s.append(t); });
  [min, max].forEach(v => { const t = svg('text', {x: 3, y: y(v) + 4, class: 'axis'}); t.textContent = `${v.toFixed(1)}m`; s.append(t); });
  s.append(svg('path', {d: rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r.level)}`).join(' '), class: 'tide-line', pathLength: 1}));
  box.replaceChildren(s);
}

// ---------- map and places ----------
function filtered() {
  const q = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return allRecords().filter(r => {
    const s = statusOf(r);
    return (state.filter === 'all' || s.kind === state.filter) && (state.area === 'all' || areaOf(r) === state.area) && (!state.savedOnly || saved.outfalls.has(r.id)) &&
      q.every(t => [nameOf(r), r.officialName, r.id, r.mapId, r.water].join(' ').toLowerCase().includes(t));
  }).sort((a, b) => KIND_ORDER[statusOf(a).kind] - KIND_ORDER[statusOf(b).kind] || (b.id === HOME_ID) - (a.id === HOME_ID) || saved.outfalls.has(b.id) - saved.outfalls.has(a.id) || (b.LatestEventEnd || 0) - (a.LatestEventEnd || 0) || nameOf(a).localeCompare(nameOf(b)));
}
function renderPlaces() {
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
  $('area').value = state.area; if ($('search').value !== state.query) $('search').value = state.query;
  $('saved-only').setAttribute('aria-pressed', String(state.savedOnly)); $('saved-only').textContent = `★ Saved (${saved.outfalls.size})`;
  const list = $('outfall-list'), rows = filtered(); list.replaceChildren();
  $('result-count').textContent = checkedAt ? `${rows.length} of ${outfalls.size} outfalls${state.savedOnly ? ' · saved' : ''}` : (lastError ? 'Live data unavailable' : 'Loading…');
  if (!rows.length) {
    const e = el('div', 'empty card'); e.append(el('p', '', state.savedOnly && !saved.outfalls.size ? 'No saved places yet. Tap ☆ on any outfall to save it.' : 'No outfalls match. A filtered list is not an all-clear.'));
    const c = el('button', 'btn small', 'Clear filters'); c.type = 'button'; c.addEventListener('click', () => { Object.assign(state, {filter: 'all', area: 'all', query: '', savedOnly: false}); renderPlaces(); renderMap(); }); e.append(c); list.append(e);
  }
  for (const r of rows) {
    const s = statusOf(r), row = el('article', `card row ${s.kind}${r.id === state.place ? ' chosen' : ''}`), top = el('div', 'card-head'), info = el('div');
    const link = el('a', 'row-name', nameOf(r)); link.href = `#view=history&place=${r.id}`;
    const h = el('h3'); h.append(link); info.append(h, el('p', 'fine', titleCase(r.water) || 'Receiving water not supplied'));
    top.append(info, starButton('outfalls', r.id, nameOf(r)));
    const acts = el('div', 'row-actions'), loc = el('button', 'btn small ghost', 'On map'); loc.type = 'button';
    loc.addEventListener('click', () => focusOutfall(r.id));
    acts.append(loc);
    row.append(top, badge(s.kind, s.label), el('p', 'row-head', headline(r, s)), dischargeStrip([r]), acts);
    list.append(row);
  }
  renderMap();
}
let map = null, layer = null, markers = new Map(), fitted = false, leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((ok, fail) => {
    const css = el('link'); css.rel = 'stylesheet'; css.href = 'assets/vendor/leaflet/leaflet.css?v=1.9.4'; document.head.append(css);
    const js = el('script'); js.src = 'assets/vendor/leaflet/leaflet.js?v=1.9.4'; js.onload = ok; js.onerror = () => { leafletLoading = null; fail(new Error('Map library failed to load')); }; document.head.append(js);
  });
  return leafletLoading;
}
// A single model vector from Branksome, drawn over a north-up reference map.
let windMap = null, windMapStarting = false, windMapSize = '';
const hasWindPanel = () => state.view === 'home' || state.view === 'conditions';
const windBounds = [[50.678, -1.954], [50.727, -1.862]];
async function ensureWindMap() {
  if (windMapStarting) return;
  const node = $('wind-map');
  if (!windMap) {
    windMapStarting = true;
    try {
      await loadLeaflet();
      if (!hasWindPanel()) return;
      node.textContent = '';
      windMap = L.map(node, {
        zoomControl: false, attributionControl: true, zoomSnap: 0.25,
        dragging: false, keyboard: false, scrollWheelZoom: false,
        touchZoom: false, doubleClickZoom: false, boxZoom: false
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
      }).addTo(windMap);
      for (const beach of BEACHES.filter(b => ['branksome','shore-road','sandbanks','bournemouth-pier'].includes(b.id))) {
        const home = beach.id === HOME_BEACH;
        L.circleMarker([beach.lat, beach.lon], {
          radius: home ? 5 : 3, weight: 2, color: '#194659',
          fillColor: home ? '#a7ecdb' : '#fff', fillOpacity: 1, interactive: false
        }).bindTooltip(home ? 'Branksome' : beach.name, {
          permanent: true, direction: 'top', offset: [0,-3], className: home ? 'wind-place wind-place-home' : 'wind-place'
        }).addTo(windMap);
      }
    } catch {
      windMap?.remove();
      windMap = null;
      windMapSize = '';
      node.textContent = 'Map unavailable. The wind reading is shown above.';
      return;
    } finally {
      windMapStarting = false;
    }
  }
  const size = `${node.clientWidth}x${node.clientHeight}`;
  if (node.clientWidth && size !== windMapSize) {
    windMapSize = size;
    windMap.invalidateSize();
    windMap.fitBounds(windBounds, {padding: [12,12], animate: false});
  }
}

function renderWindMap(current) {
  const field = $('wind-field'), readout = $('wind-map-reading');
  const speed = current?.wind_speed_10m, bearing = current?.wind_direction_10m;
  const fresh = finite(current?.time) && Math.abs(Date.now() - current.time * 1000) < 2 * HOUR;
  const hasWind = fresh && finite(speed) && speed > 0 && finite(bearing);
  const to = finite(bearing) ? ((bearing + 180) % 360 + 360) % 360 : null;
  const text = !weather && !weatherFailed ? 'Waiting for the Branksome forecast…' :
    !fresh || !finite(speed) || speed < 0 ? 'Current model wind unavailable' :
    speed === 0 ? 'Calm · 0 mph' : !hasWind ? `${num(speed, 'mph')} · direction unavailable` :
    `${num(speed, 'mph')} · from ${compass(bearing)} towards ${compass(to)}`;
  if (readout.textContent !== text) readout.textContent = text;
  field.hidden = !hasWind;
  if (hasWind) {
    // The artwork points right (east) at zero rotation. Bearings start at north.
    field.style.setProperty('--wind-angle', `${to - 90}deg`);
    field.style.setProperty('--wind-period', `${Math.max(2.8, 5.5 - speed / 12)}s`);
    if (!field.childElementCount) {
      for (let i = 0; i < 15; i++) {
        const direction = el('span', 'wind-direction');
        direction.style.setProperty('--wind-delay', `${-(i % 7) * 0.55}s`);
        direction.append(el('span', 'wind-arrow', '➝'));
        field.append(direction);
      }
    }
  }
  ensureWindMap();
}
window.addEventListener('resize', () => { if (hasWindPanel()) ensureWindMap(); });

async function ensureMap() {
  if (map) return true;
  try { await loadLeaflet(); } catch { $('map').replaceChildren(el('p', 'map-msg', 'The map could not load. Every outfall is still in the list.')); return false; }
  if (map) return true;
  $('map').replaceChildren();
  map = L.map('map', {scrollWheelZoom: false, zoomSnap: 0.25}).setView([50.705, -1.92], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  layer = L.layerGroup().addTo(map);
  const labels = () => $('map').classList.toggle('no-labels', map.getZoom() < 12.75); map.on('zoomend', labels); labels();
  return true;
}
async function renderMap() {
  if (state.view !== 'map' || !(await ensureMap())) return;
  layer.clearLayers(); markers.clear();
  for (const b of BEACHES) {
    const k = beachSummary(b).status.kind;
    L.marker([b.lat, b.lon], {icon: L.divIcon({className: 'beach-pin', html: `<span class="bp ${k}"></span><b>${b.name}</b>`, iconSize: null}), title: `${b.name}: ${KIND_LABEL[k]}`, alt: b.name})
      .on('click', () => { location.hash = `view=beaches&beach=${b.id}`; }).addTo(layer);
  }
  for (const r of filtered()) {
    const s = statusOf(r);
    const m = L.circleMarker([r.lat, r.lon], {radius: r.id === state.place ? 10 : s.kind === 'quiet' ? 6 : 9, color: r.id === state.place ? '#fff' : '#0b1f26', weight: r.id === state.place ? 3 : 1.5, fillColor: COLOURS[s.kind], fillOpacity: 1}).addTo(layer);
    const pop = el('div', 'pop'); pop.append(el('b', '', nameOf(r)), badge(s.kind, s.label), el('p', '', headline(r, s)), el('p', 'fine', titleCase(r.water)));
    const go = el('a', 'btn small', '24h history'); go.href = `#view=history&place=${r.id}`; pop.append(go);
    m.bindPopup(pop); m.bindTooltip(`${nameOf(r)}: ${s.label}`); markers.set(r.id, m);
  }
  requestAnimationFrame(() => {
    map.invalidateSize();
    if (!fitted && outfalls.size && $('map').offsetWidth) { fitted = true; map.fitBounds(L.latLngBounds([...BEACHES.map(b => [b.lat, b.lon]), ...allRecords().map(r => [r.lat, r.lon])]).pad(0.03), {animate: false}); }
  });
}
async function focusOutfall(id) {
  state.place = id; if (state.view !== 'map') { location.hash = `view=map&place=${id}`; return; }
  await renderMap(); if (!map) return; fitted = true;
  const r = record(id); map.setView([r.lat, r.lon], 15, {animate: false}); markers.get(id)?.openPopup();
  $('map').scrollIntoView({block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth'});
}
async function focusBeach(id) { const b = BEACHES.find(x => x.id === id); if (!b) return; await renderMap(); if (!map) return; fitted = true; map.setView([b.lat, b.lon], 14, {animate: false}); }

// ---------- alerts ----------
function renderAlerts() {
  const box = $('alert-cards'); box.replaceChildren();
  if (!checkedAt) { $('alerts-summary').textContent = lastError ? 'Current discharge reports unavailable.' : 'Checking the local outfalls…'; box.append(el('p', 'muted', lastError ? 'Current activity cannot be confirmed. Use Refresh or check Wessex Water’s map.' : 'Waiting for Wessex Water’s reports.')); return; }
  const now = Date.now(), H = state.alertHours;
  const items = [...outfalls.values()].map(r => ({r, s: statusOf(r), end: isTime(r.LatestEventEnd) ? r.LatestEventEnd : null}))
    .filter(i => i.r.id === HOME_ID || i.s.kind === 'active' || i.s.kind === 'unknown' || H === Infinity || (i.end && now - i.end <= H * HOUR))
    .sort((a, b) => (b.r.id === HOME_ID) - (a.r.id === HOME_ID) || KIND_ORDER[a.s.kind] - KIND_ORDER[b.s.kind] || (b.end || 0) - (a.end || 0));
  const c = counts(), stops = items.filter(i => i.s.kind !== 'active' && i.s.kind !== 'unknown' && i.end && (H === Infinity || now - i.end <= H * HOUR)).length;
  const period = H === Infinity ? 'all latest reports' : H === 168 ? 'last 7 days' : `last ${H} hours`;
  $('alerts-summary').replaceChildren(el('span', 'pill active', `${c.active} discharging`), el('span', 'pill recent', `${stops} reported stops · ${period}`), el('span', `pill${c.unknown ? ' unknown' : ''}`, `${c.unknown} unavailable`));
  for (const {r, s, end} of items) {
    const a = el('a', `card alert ${s.kind === 'quiet' && end && (H === Infinity || now - end <= H * HOUR) ? 'recent' : s.kind}`); a.href = `#view=history&place=${r.id}`;
    if (r.id === HOME_ID) a.append(el('span', 'pin', 'Pinned · always shown'));
    a.append(el('h3', '', nameOf(r)), el('p', 'fine', titleCase(r.water)), badge(s.kind, s.label), el('p', 'row-head', headline(r, s)));
    const st = lastStart(r);
    a.append(el('p', 'card-sub', s.kind === 'active' ? (st ? `Started ${when(st)}` : 'Start not supplied') : end ? `Stopped ${when(end)}${st && end >= st ? `, lasted ${dur(end - st)}` : ''}` : 'No latest stop supplied'));
    a.append(el('p', 'fine', `Source updated ${isTime(r.LastUpdated) ? when(r.LastUpdated) : 'not supplied'}${r.missing ? ' · missing from latest feed' : ''}`));
    box.append(a);
  }
  if (items.length <= 1) box.append(el('p', 'muted', 'No other reported stops in this window. This is not an all-clear. Choose “All latest reports” to see older stops.'));
}

// ---------- CSV + share ----------
function downloadCSV(rows, label) {
  if (!checkedAt) { toast('Nothing to export yet'); return; }
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const iso = v => isTime(v) ? new Date(v).toISOString() : '';
  const out = [['record', 'outfall_id', 'map_id', 'name', 'status', 'receiving_water', 'latitude', 'longitude', 'latest_event_start', 'latest_event_end', 'event_start', 'event_end', 'wessex_updated', 'checked_at'].join(',')];
  for (const r of rows) {
    out.push(['status', r.id, r.mapId, nameOf(r), statusOf(r).label, r.water, r.lat, r.lon, iso(lastStart(r)), iso(r.LatestEventEnd), '', '', iso(r.LastUpdated), iso(checkedAt)].map(esc).join(','));
    for (const e of eventsFor(r)) out.push(['event_24h', r.id, r.mapId, nameOf(r), '', r.water, r.lat, r.lon, '', '', iso(e.start), iso(e.end), '', iso(checkedAt)].map(esc).join(','));
  }
  const a = el('a'); a.href = URL.createObjectURL(new Blob([out.join('\n') + '\n'], {type: 'text/csv'}));
  a.download = `beachbuds-alerts-${label}-${new Date(checkedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function copyLink(hash) {
  const url = new URL(location.href); url.hash = hash;
  try { await navigator.clipboard.writeText(url.href); toast('Link copied'); } catch { history.replaceState(null, '', url); toast('Link is in the address bar'); }
}

// ---------- router ----------
const VIEWS = ['home', 'beaches', 'history', 'conditions', 'map', 'alerts'];
function route() {
  const p = new URLSearchParams(location.hash.slice(1));
  const known = id => allRecords().some(r => r.id === id) || !outfalls.size;
  let view = p.get('view'); if (!VIEWS.includes(view)) view = p.get('place') ? 'history' : p.get('beach') ? 'beaches' : 'home';
  if (p.get('place') && known(p.get('place'))) state.place = p.get('place');
  if (p.get('status') && ['active', 'recent', 'quiet', 'unknown'].includes(p.get('status'))) Object.assign(state, {filter: p.get('status'), area: 'all', query: '', savedOnly: false});
  if (p.get('beach')) state.open = 'b:' + p.get('beach');
  const changed = view !== state.view; state.view = view;
  if (changed) playedCharts.clear();
  document.querySelectorAll('[data-view-panel]').forEach(s => { s.hidden = s.dataset.viewPanel !== view; });
  document.querySelectorAll('.tabs a').forEach(a => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (hasWindPanel()) {
    const anchor = view === 'home' ? $('home-hero') : document.querySelector('#view-conditions .cond-grid');
    const panel = $('wind-panel');
    if (anchor.nextElementSibling !== panel) anchor.after(panel);
  }
  renderView();
  const section = p.get('section');
  const sectionPanel = view === 'conditions' && section === 'wind' ? $('wind-panel') :
    view === 'home' && section === 'waves' ? $('wave-panel') :
    view === 'home' && section === 'outlook' ? $('outlook-panel') : null;
  if (sectionPanel) {
    sectionPanel.focus({preventScroll: true});
    sectionPanel.scrollIntoView({block: 'start', behavior: motionPaused || reducedMotion() ? 'auto' : 'smooth'});
    return;
  }
  if (view === 'map' && p.get('place')) focusOutfall(p.get('place'));
  else if (view === 'map' && p.get('beach')) focusBeach(p.get('beach'));
  else if (view === 'beaches' && p.get('beach')) { const n = document.querySelector(`#beach-list [data-beach="${CSS.escape(p.get('beach'))}"]`); if (n) { n.open = true; n.scrollIntoView({block: 'center'}); } }
  else if (changed) { window.scrollTo({top: 0}); $('main').focus({preventScroll: true}); }
  document.querySelector('.tabs [aria-current]')?.scrollIntoView({inline: 'nearest', block: 'nearest'});
}
function renderView() {
  renderLive();
  ({home: renderHome, beaches: renderBeaches, history: renderHistory, conditions: renderConditions, map: renderPlaces, alerts: renderAlerts})[state.view]();
  if (hasWindPanel()) renderWindMap(weatherFresh() ? weather.current : null);
  observeCharts();
}
const renderAll = renderView; // only the visible view is rebuilt; others render when opened

// ---------- chart motion ----------
const playedCharts = new Set();
const chartSelectors = [
  '#home-strip .rain-strip', '#home-strip .tl-bar',
  '#history-chart .rain-strip', '#history-chart .tl-bar',
  '#rain-chart svg', '#tide-curve svg', '#wave-chart svg'
];
const chartObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || !entry.target.isConnected) continue;
    chartObserver.unobserve(entry.target);
    const key = entry.target.dataset.motionKey;
    if (playedCharts.has(key) || motionPaused || reducedMotion()) continue;
    playedCharts.add(key);
    entry.target.classList.add('chart-reveal');
  }
}, {threshold: 0.15}) : null;

function observeCharts() {
  chartObserver?.disconnect();
  if (!chartObserver || motionPaused || reducedMotion()) return;
  for (const selector of chartSelectors) {
    if (playedCharts.has(selector)) continue;
    const chart = document.querySelector(selector);
    if (!chart || chart.closest('[hidden]') || chart.classList.contains('na')) continue;
    if (!chart.querySelector('i:not(.na), .bar, .bar-future, .tide-line, .combined-curve')) continue;
    chart.dataset.motionKey = selector;
    chartObserver.observe(chart);
  }
}

// ---------- motion ----------
let motionPaused = false; try { motionPaused = storage?.getItem(MOTION_KEY) === 'true'; } catch {}
function applyMotion() { document.body.classList.toggle('motion-paused', motionPaused); $('motion-toggle').setAttribute('aria-pressed', String(motionPaused)); $('motion-toggle').textContent = motionPaused ? 'Play motion' : 'Pause motion'; }

// ---------- wiring ----------
$('refresh').addEventListener('click', () => { refreshOutfalls(); refreshConditions(); });
$('conditions-refresh').addEventListener('click', refreshConditions);
$('motion-toggle').addEventListener('click', () => { motionPaused = !motionPaused; applyMotion(); try { storage?.setItem(MOTION_KEY, String(motionPaused)); } catch {} });
document.querySelector('[data-save-beach=branksome]').addEventListener('click', () => toggleSaved('beaches', HOME_BEACH, 'Branksome Chine'));
$('history-select').addEventListener('change', e => { location.hash = `view=history&place=${e.target.value}`; });
$('history-save').addEventListener('click', () => toggleSaved('outfalls', state.place, nameOf(record(state.place))));
$('history-copy').addEventListener('click', () => copyLink(`view=history&place=${state.place}`));
$('history-csv').addEventListener('click', () => downloadCSV([record(state.place)], state.place));
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderPlaces(); }));
$('search').addEventListener('input', e => { state.query = e.target.value; renderPlaces(); });
$('area').addEventListener('change', e => { state.area = e.target.value; renderPlaces(); });
$('saved-only').addEventListener('click', () => { state.savedOnly = !state.savedOnly; renderPlaces(); });
$('csv').addEventListener('click', () => downloadCSV(filtered(), 'local'));
$('alert-period').addEventListener('change', e => { state.alertHours = e.target.value === 'all' ? Infinity : Number(e.target.value); renderAlerts(); });
$('wave-hour').addEventListener('input', showWaveHour);
$('outlook-retry').addEventListener('click', refreshWaveOutlook);
if (typeof IntersectionObserver === 'function') {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    refreshWaveOutlook();
  }, {rootMargin: '180px 0px'});
  observer.observe($('outlook-panel'));
} else refreshWaveOutlook();
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!checkedAt || Date.now() - checkedAt > REFRESH_MS) refreshOutfalls();
  if (Date.now() - Math.min(weatherAt, marineAt) > WX_REFRESH_MS) refreshConditions();
});
setInterval(() => { if (!document.hidden) refreshOutfalls(); }, REFRESH_MS);
setInterval(() => { if (!document.hidden) refreshConditions(); }, WX_REFRESH_MS);
setInterval(() => { if (!document.hidden && checkedAt && !document.querySelector('select:focus, input:focus')) renderAll(); }, 60e3);

applyMotion(); route();
refreshOutfalls().then(() => { if (new URLSearchParams(location.hash.slice(1)).get('place')) route(); });
refreshConditions();
window.CW_moonPhase = moonPhase;
window.CW_classifyStatus = classifyStatus;
window.CW_BEACHES = BEACHES;
window.CW_bathingSeason = bathingSeason;
})();
