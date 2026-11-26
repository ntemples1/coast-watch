'use strict';
/* Coast Watch v6.1. Live Wessex Water storm overflow reports for Branksome, Bournemouth and Poole,
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
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine?' + new URLSearchParams({...WX_POINT, hourly: 'sea_level_height_msl,wave_height,wave_period,sea_surface_temperature', past_days: '1', forecast_days: '3', cell_selection: 'sea'});
const WESSEX_MAP = 'https://www.wessexwater.co.uk/coast-and-rivers-watch-map';
const HOUR = 3600e3, DAY = 24 * HOUR, STALE_AFTER = 2 * HOUR, REFRESH_MS = 5 * 60e3, WX_REFRESH_MS = 30 * 60e3;
const HOME_ID = 'WXW00865', HOME_BEACH = 'branksome';
const STORE_KEY = 'coast-watch.v6', OLD_KEY = 'coast-watch.preferences.v2', MOTION_KEY = 'coast-watch.motion-paused';

// Beaches west to east, then harbour. Each lists its nearest monitored outfalls.
const BEACHES = [
  {id:'sandbanks', name:'Sandbanks', lat:50.6858, lon:-1.9445, water:'sea', outfalls:['WXW00955']},
  {id:'shore-road', name:'Shore Road', lat:50.6928, lon:-1.9285, water:'sea', outfalls:['WXW00991','WXW00955']},
  {id:'canford-cliffs', name:'Canford Cliffs', lat:50.6992, lon:-1.9168, water:'sea', outfalls:['WXW00991','WXW00865']},
  {id:'branksome', name:'Branksome Chine', lat:50.7047, lon:-1.9068, water:'sea', outfalls:['WXW00865']},
  {id:'alum', name:'Alum Chine', lat:50.7104, lon:-1.8962, water:'sea', outfalls:['WXW00865','WXW00155']},
  {id:'durley', name:'Durley Chine', lat:50.7138, lon:-1.8842, water:'sea', outfalls:['WXW00155','WXW00865']},
  {id:'bournemouth-pier', name:'Bournemouth Pier', lat:50.7156, lon:-1.8752, water:'sea', outfalls:['WXW00155','WXW00153']},
  {id:'boscombe', name:'Boscombe Pier', lat:50.7196, lon:-1.8436, water:'sea', outfalls:['WXW00153','WXW00155']},
  {id:'fishermans', name:'Fisherman’s Walk', lat:50.7206, lon:-1.8170, water:'sea', outfalls:['WXW00429','WXW00153']},
  {id:'southbourne', name:'Southbourne', lat:50.7199, lon:-1.7950, water:'sea', outfalls:['WXW00429','WXW00521']},
  {id:'hengistbury', name:'Hengistbury Head', lat:50.7142, lon:-1.7655, water:'sea', outfalls:['WXW00521']},
  {id:'evening-hill', name:'Evening Hill, Lilliput', lat:50.7030, lon:-1.9478, water:'harbour', outfalls:['WSX1292','WSX10118','WXW00955']},
  {id:'baiter', name:'Whitecliff and Baiter', lat:50.7128, lon:-1.9655, water:'harbour', outfalls:['WSX10143','WXW00396']},
  {id:'poole-quay', name:'Poole Quay', lat:50.7118, lon:-1.9855, water:'harbour', outfalls:['WXW00396','WXW00866','WSX10060']},
  {id:'hamworthy', name:'Hamworthy and Rockley', lat:50.7080, lon:-2.0095, water:'harbour', outfalls:['WSX10058','WSX10057']}
];
const ALIASES = {WXW00865:'Branksome Chine', WXW00155:'Bournemouth Pier (No 1)', WXW00153:'Boscombe (No 1)', WXW00429:'Fisherman’s Walk', WXW00521:'Southbourne, Hengistbury Head', WXW00991:'Shore Road', WXW00955:'Sandbanks Pavilion'};
const KIND_ORDER = {active:0, unknown:1, recent:2, quiet:3};
const KIND_LABEL = {active:'Discharging', recent:'Ended in last 24h', quiet:'Not discharging', unknown:'Unavailable'};
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

async function refreshConditions() {
  if (wxBusy) return; wxBusy = true; $('conditions-refresh').disabled = true;
  const get = async url => { const c = new AbortController(), t = setTimeout(() => c.abort(), 15000); try { return await getJSON(url, c.signal); } finally { clearTimeout(t); } };
  await Promise.allSettled([
    get(WEATHER_URL).then(d => { if (!d.hourly || !Array.isArray(d.hourly.time)) throw new Error('No hourly data'); weather = d; weatherAt = Date.now(); weatherFailed = false; }).catch(() => { weatherFailed = true; }),
    get(MARINE_URL).then(d => { if (!finite(d.latitude) || !finite(d.longitude)) throw new Error('No model location'); marine = d; marineAt = Date.now(); marineFailed = false; }).catch(() => { marineFailed = true; })
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
function marineWindow() {
  const h = marine.hourly || {}, now = Date.now(), boundary = Math.floor(now / HOUR) * HOUR;
  const rows = (h.time || []).map((t, i) => ({time: t * 1000, level: h.sea_level_height_msl?.[i], wave: h.wave_height?.[i], period: h.wave_period?.[i], temperature: h.sea_surface_temperature?.[i]}));
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
  if (!checkedAt) { bar.classList.add('na'); return wrap; }
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
    if (active && !eventsFor(r).some(e => e.end == null)) place(Math.max(lastStart(r) || now - HOUR, start), now, 'open', `${nameOf(r)}: discharging now`);
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
function beachSummary(b) {
  const rs = b.outfalls.map(record), ss = rs.map(r => statusOf(r));
  const worst = ss.reduce((w, s) => KIND_ORDER[s.kind] < KIND_ORDER[w.kind] ? s : w, {kind: 'quiet'});
  const ends = rs.filter(r => isTime(r.LatestEventEnd));
  const lastBy = ends.sort((a, b) => b.LatestEventEnd - a.LatestEventEnd)[0] || null;
  return {rs, ss, worst: checkedAt ? worst : statusOf(null), lastEnd: lastBy ? lastBy.LatestEventEnd : null, lastBy, active: rs.filter((r, i) => ss[i].kind === 'active')};
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
  // If another outfall listed on the Branksome beach card is in a worse state, say so.
  const beach = beachSummary(BEACHES.find(b => b.id === HOME_BEACH)), near = $('home-nearby');
  near.hidden = !checkedAt || KIND_ORDER[beach.worst.kind] >= KIND_ORDER[s.kind];
  if (!near.hidden) {
    const other = beach.rs.find((x, i) => x.id !== HOME_ID && beach.ss[i].kind === beach.worst.kind);
    near.replaceChildren(badge(beach.worst.kind, `Nearby: ${nameOf(other)}`), document.createTextNode(' ' + headline(other)));
  }
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
  else {
    const parts = [`Last 24h: ${num(r24, 'mm')}${finite(r24) ? ` (${rainWord(r24)})` : ''}.`, `Last 48h: ${num(r48, 'mm')}.`, `Next 12h forecast: ${num(rNext, 'mm')}.`];
    if (checkedAt) {
      const recentOrActive = c.active + c.recent;
      if (recentOrActive && finite(r48) && r48 >= 2) parts.push(`${recentOrActive} local outfall${recentOrActive > 1 ? 's have' : ' has'} reported a discharge in the last 24h, after recent rain.`);
      else if (recentOrActive) parts.push(`${recentOrActive} local outfall${recentOrActive > 1 ? 's have' : ' has'} reported a discharge in the last 24h, even though modelled rain was light.`);
      else if (finite(r48) && r48 >= 10) parts.push('No discharges reported in the last 24h despite heavy rain. Reports can lag, so keep checking.');
      if (finite(rNext) && rNext >= 5) parts.push('More rain is forecast, which is when overflows usually operate.');
    }
    rc.textContent = parts.join(' ');
  }
  const mini = $('rain-mini'); mini.replaceChildren(el('p', 'strip-label', 'Rain, last 24h · hourly'), rainStrip(), tickRow(Date.now()));

  // Your beaches: Branksome plus saved
  const mine = BEACHES.filter(b => b.id === HOME_BEACH || saved.beaches.has(b.id));
  const box = $('my-beaches'); box.replaceChildren(...mine.map(beachCard));
  if (mine.length === 1) box.append(el('p', 'fine', 'Save more beaches from the Beaches tab and they will appear here.'));
  renderMoon();
}

function starSync(btn, on, offText, onText) { if (!btn) return; btn.textContent = on ? `★ ${onText}` : `☆ ${offText}`; btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('on', on); }
function starButton(set, id, label) {
  const on = saved[set].has(id), b = el('button', 'star' + (on ? ' on' : ''), on ? '★' : '☆');
  b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', `${on ? 'Unsave' : 'Save'} ${label}`);
  b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); toggleSaved(set, id, label); });
  return b;
}

// ---------- beach cards ----------
function beachCard(b) {
  const sum = beachSummary(b), kind = sum.worst.kind, key = 'b:' + b.id;
  const card = el('details', `card beach ${kind}`); card.dataset.beach = b.id; card.open = state.open === key;
  card.addEventListener('toggle', () => { if (card.open) state.open = key; else if (state.open === key) state.open = null; });
  const sm = el('summary'), head = el('div', 'card-head'), title = el('div', 'card-title');
  title.append(el('h3', '', b.name)); if (b.id === HOME_BEACH) title.append(el('span', 'pin', 'Pinned'));
  head.append(title, starButton('beaches', b.id, b.name));
  let line, sub = '';
  if (!checkedAt) line = lastError ? 'Live data unavailable' : 'Checking…';
  else if (kind === 'active') { line = 'Discharging nearby now'; sub = sum.active.map(r => `${nameOf(r)}: ${headline(r).toLowerCase()}`).join(' · '); }
  else if (kind === 'unknown') { line = 'Cannot confirm, monitor data unavailable'; sub = sum.rs.map((r, i) => `${nameOf(r)}: ${sum.ss[i].label}`).join(' · '); }
  else if (kind === 'recent') { line = `Nearby discharge ended ${ago(Date.now() - sum.lastEnd)} ago`; sub = `${nameOf(sum.lastBy)}, ${when(sum.lastEnd)}. Nothing reported discharging now.`; }
  else { line = 'No discharge reported in last 24h'; sub = sum.lastEnd ? `Last nearby discharge ended ${ago(Date.now() - sum.lastEnd)} ago (${nameOf(sum.lastBy)}, ${fmtDay.format(sum.lastEnd)})` : 'No previous discharge time supplied'; }
  const body = el('div', 'card-body');
  body.append(badge(kind, checkedAt ? undefined : (lastError ? 'Unavailable' : 'Checking')), el('p', 'card-line', line));
  if (sub) body.append(el('p', 'card-sub', sub));
  body.append(el('p', 'strip-label', 'Last 24h'), dischargeStrip(sum.rs));
  sm.append(head, body); card.append(sm);
  const more = el('div', 'card-more');
  more.append(el('p', 'more-label', 'Nearest monitored outfalls'));
  for (const id of b.outfalls) {
    const r = record(id), s = statusOf(r), a = el('a', 'mini'); a.href = `#view=history&place=${id}`;
    a.append(el('span', 'mini-name', nameOf(r)), badge(s.kind, s.label), el('span', 'mini-text', headline(r, s)));
    more.append(a);
  }
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
function moonSvg(frac, label) {
  const s = svg('svg', {viewBox: '0 0 100 100'});
  if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); }
  else s.setAttribute('aria-hidden', 'true');
  const cx = 50, cy = 50, r = 44, f = ((frac % 1) + 1) % 1;
  s.append(svg('circle', {cx, cy, r, class: 'moon-unlit'}));
  if (Math.abs(f - 0.5) < 0.001) s.append(svg('circle', {cx, cy, r, class: 'moon-lit'}));
  else { const d = moonLitPath(cx, cy, r, f); if (d) s.append(svg('path', {d, class: 'moon-lit'})); }
  s.append(svg('circle', {cx, cy, r, class: 'moon-rim'}));
  return s;
}
function fmtUK(t) { return `${fmtDay.format(t)} ${fmtClock.format(t)}`; }
function renderMoon() {
  const m = moonPhase(), lit = `${Math.round(m.illumination * 100)}% lit`, age = `${m.ageDays.toFixed(1)} days`;
  const label = `${m.name}, ${lit}, ${age} into the cycle`;
  const face = $('moon-face'); if (face) face.replaceChildren(moonSvg(m.drawFrac, label));
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
  if (home) home.replaceChildren(moonSvg(m.drawFrac));
  if (hl) { hl.textContent = ''; hl.append(document.createTextNode(`${m.name} · ${lit}`), el('small', '', `Next full ${fmtUK(m.nextFull)} · UK time`)); }
}

// ---------- conditions ----------
function renderConditions() {
  const wf = weatherFresh(), set = (id, v) => { $(id).textContent = v; };
  const pending = !weatherFailed && !weather ? '…' : 'Unavailable';
  if (!wf) { ['rain-24', 'rain-48', 'rain-next', 'wind-speed', 'wind-gust', 'air-temp', 'sunrise', 'sunset', 'daylight-left'].forEach(id => set(id, pending)); set('weather-updated', weatherFailed ? 'Weather request failed. Try Refresh conditions.' : 'Weather loading…'); $('rain-chart').textContent = weatherFailed ? 'Rain chart unavailable.' : 'Loading…'; }
  else {
    const now = Date.now();
    set('rain-24', num(rainWindow(24), 'mm')); set('rain-48', num(rainWindow(48), 'mm')); set('rain-next', num(rainWindow(12, true), 'mm'));
    const c = weather.current || {}, fresh = finite(c.time) && Math.abs(now - c.time * 1000) < 2 * HOUR;
    set('wind-speed', fresh ? num(c.wind_speed_10m, 'mph') + (compass(c.wind_direction_10m) ? ' from ' + compass(c.wind_direction_10m) : '') : 'Unavailable');
    set('wind-gust', fresh ? num(c.wind_gusts_10m, 'mph') : 'Unavailable'); set('air-temp', fresh ? num(c.temperature_2m, '°C') : 'Unavailable');
    const d = weather.daily, i = d?.time?.findIndex(t => fmtIsoDay.format(t * 1000) === fmtIsoDay.format(now)) ?? -1, rise = d?.sunrise?.[i] * 1000, sset = d?.sunset?.[i] * 1000;
    set('sunrise', finite(rise) ? fmtClock.format(rise) : 'Unavailable'); set('sunset', finite(sset) ? fmtClock.format(sset) : 'Unavailable');
    set('daylight-left', !finite(rise) || !finite(sset) ? 'Unavailable' : now < rise ? `Sunrise in ${ago(rise - now)}` : now >= sset ? 'After sunset' : `${ago(sset - now)} until sunset`);
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
  for (let t = start; t <= end; t += 12 * HOUR) { const tx = svg('text', {x: x(t), y: 142, 'text-anchor': 'middle', class: 'axis'}); tx.textContent = (fmtIsoDay.format(t) === fmtIsoDay.format(now) ? '' : fmtDay.format(t).split(' ')[0] + ' ') + fmtClock.format(t); s.append(tx); }
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
  s.append(svg('path', {d: rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r.level)}`).join(' '), class: 'tide-line'}));
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
    const k = beachSummary(b).worst.kind;
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
  a.download = `coast-watch-${label}-${new Date(checkedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
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
  document.querySelectorAll('[data-view-panel]').forEach(s => { s.hidden = s.dataset.viewPanel !== view; });
  document.querySelectorAll('.tabs a').forEach(a => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  renderView();
  if (view === 'map' && p.get('place')) focusOutfall(p.get('place'));
  else if (view === 'map' && p.get('beach')) focusBeach(p.get('beach'));
  else if (view === 'beaches' && p.get('beach')) { const n = document.querySelector(`#beach-list [data-beach="${CSS.escape(p.get('beach'))}"]`); if (n) { n.open = true; n.scrollIntoView({block: 'center'}); } }
  else if (changed) { window.scrollTo({top: 0}); $('main').focus({preventScroll: true}); }
  document.querySelector('.tabs [aria-current]')?.scrollIntoView({inline: 'nearest', block: 'nearest'});
}
function renderView() {
  renderLive();
  ({home: renderHome, beaches: renderBeaches, history: renderHistory, conditions: renderConditions, map: renderPlaces, alerts: renderAlerts})[state.view]();
}
const renderAll = renderView; // only the visible view is rebuilt; others render when opened

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
})();
