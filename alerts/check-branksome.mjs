// Coast Watch spill alerts: checks Branksome Chine (WXW00865) and pushes to ntfy
// when it starts or stops discharging. Run by .github/workflows/spill-alerts.yml.
// No API keys. State lives in alerts/state.json, committed back only when it changes.
import {readFile, writeFile} from 'node:fs/promises';

const ID = process.env.OUTFALL_ID || 'WXW00865';
const NAME = process.env.OUTFALL_NAME || 'Branksome Chine';
const TOPIC = process.env.NTFY_TOPIC;               // e.g. beachbuds-branksome
const APP = 'https://coastwatch.beatbake.co.uk';
const STATE_FILE = new URL('./state.json', import.meta.url);
const FEED = 'https://services.arcgis.com/3SZ6e0uCvPROr4mS/arcgis/rest/services/Wessex_Water_Storm_Overflow_Activity/FeatureServer/0/query?' +
  new URLSearchParams({where: `Id='${ID}'`, outFields: 'Id,Status,StatusStart,LatestEventStart,LatestEventEnd,LastUpdated', f: 'json'});
const DRY = process.argv.includes('--dry-run');

const clock = t => new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit'}).format(t);
const isTime = v => Number.isFinite(v) && v > 946684800000 && v < Date.now() + 3600e3;

async function readState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { return {}; }
}

// Same rule as the app: anything unconfirmed is unknown, never an all-clear.
function classify(r) {
  if (!r) return 'unknown';
  if (r.Status === 1) return 'active';
  if (r.Status === 0) return 'quiet';
  return 'unknown';
}

function message(kind, r, prev) {
  if (kind === 'active') {
    const s = isTime(r.StatusStart) ? r.StatusStart : r.LatestEventStart;
    return {title: `${NAME} is discharging`, tags: 'warning', priority: 'high',
      body: `Wessex Water reports the storm overflow started discharging${isTime(s) ? ' at ' + clock(s) : ''}. Consider staying out of the water.`};
  }
  if (kind === 'quiet' && prev === 'unknown') {
    return {title: `${NAME} monitor is back online`, tags: 'white_check_mark', priority: 'default',
      body: 'The monitor is reporting again and shows no discharge right now.'};
  }
  if (kind === 'quiet') {
    const e = r.LatestEventEnd;
    return {title: `${NAME} has stopped discharging`, tags: 'white_check_mark', priority: 'default',
      body: `The overflow stopped${isTime(e) ? ' at ' + clock(e) : ''}. Water quality can stay poor for a day or two after a spill.`};
  }
  return {title: `${NAME} status unknown`, tags: 'grey_question', priority: 'default',
    body: 'The Wessex Water monitor is offline or reporting an unknown status. Do not read this as an all-clear.'};
}

async function push(m) {
  if (DRY || !TOPIC) { console.log('[would push]', JSON.stringify(m)); return; }
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(TOPIC)}`, {method: 'POST', body: m.body,
    headers: {Title: m.title, Tags: m.tags, Priority: m.priority, Click: APP}});
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
}

const state = await readState();
let rec;
try {
  const res = await fetch(FEED, {signal: AbortSignal.timeout(20000)});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error || !Array.isArray(json.features)) throw new Error('bad feed response');
  rec = json.features[0]?.attributes;
} catch (err) {
  // A failed fetch is not a status change. Log it and try again next run.
  console.log(`Feed fetch failed (${err.message}); keeping last state "${state.kind ?? 'none'}".`);
  process.exit(0);
}

const kind = classify(rec);
console.log(`${NAME}: ${kind} (Status=${rec?.Status}, LastUpdated=${rec?.LastUpdated ? new Date(rec.LastUpdated).toISOString() : 'n/a'})`);
const month = new Date().toISOString().slice(0, 7);  // touches the file monthly so GitHub keeps the schedule alive

if (state.kind && state.kind !== kind) {
  await push(message(kind, rec, state.kind));
  console.log(`Alert sent: ${state.kind} -> ${kind}`);
} else if (!state.kind) {
  console.log('First run: recording state, no alert.');
}
if (state.kind !== kind || state.month !== month) {
  const next = {kind, since: state.kind === kind ? state.since : new Date().toISOString(), month};
  if (!DRY) await writeFile(STATE_FILE, JSON.stringify(next, null, 2) + '\n');
  console.log('State updated:', JSON.stringify(next));
}
