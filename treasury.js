'use strict';

const INJ_DECIMALS = 1e18;
const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];
const REWARD_CHAIN_REFRESH_MS = 1500;
const REWARD_DROP_EPSILON = 1e-10;
const TREASURY_HISTORY_DROP_EPSILON = 1e-7;
const CLAIM_HISTORY_GRACE_MS = 60000;
const TREASURY_ADDRESSES = Object.freeze([
  'inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv',
  'inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu',
  'inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9',
  'inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q',
  'inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'
]);
const HISTORY_KEY = 'inj_node_treasury_growth_v1';
const SNAPSHOT_KEY = 'inj_node_treasury_snapshot_v1';
const WORTH_HISTORY_KEY = 'inj_node_treasury_worth_growth_v1';
const HISTORY_COMPACT_VERSION = 2;
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TREASURY_DB_NAME = 'inj_node_treasury_persistence_v1';
const TREASURY_DB_STORE = 'timelines';

function openTreasuryDb() {
  return new Promise((resolve,reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(TREASURY_DB_NAME,1);
    request.onupgradeneeded = () => {
      const db=request.result;
      if(!db.objectStoreNames.contains(TREASURY_DB_STORE)) db.createObjectStore(TREASURY_DB_STORE,{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('IndexedDB open failed'));
  });
}
async function idbReadTimeline(key){
  let db;
  try{
    db=await openTreasuryDb();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(TREASURY_DB_STORE,'readonly');
      const req=tx.objectStore(TREASURY_DB_STORE).get(key);
      req.onsuccess=()=>resolve(Array.isArray(req.result?.rows)?req.result.rows:[]);
      req.onerror=()=>reject(req.error);
    });
  }catch(_){return [];}finally{try{db?.close();}catch(_){}}
}
async function idbWriteTimeline(key,rows){
  let db;
  try{
    db=await openTreasuryDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(TREASURY_DB_STORE,'readwrite');
      tx.objectStore(TREASURY_DB_STORE).put({key,rows:Array.isArray(rows)?rows:[],savedAt:Date.now()});
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error);
    });
  }catch(_){}finally{try{db?.close();}catch(_){}}
}
function mergeTimelineRows(...sets){
  return compactTimeline(sets.flatMap((rows)=>Array.isArray(rows)?rows:[]));
}
async function restoreTimelineBackups(){
  const [growthBackup,worthBackup]=await Promise.all([idbReadTimeline(HISTORY_KEY),idbReadTimeline(WORTH_HISTORY_KEY)]);
  const mergedGrowth=mergeTimelineRows(state.samples,growthBackup);
  const mergedWorth=mergeTimelineRows(state.worthSamples,worthBackup);
  if(mergedGrowth.length){state.samples=mergedGrowth;persistHistory();}
  if(mergedWorth.length){state.worthSamples=mergedWorth;persistWorthHistory();}
}

const state = {
  data: null,
  price: 0,
  open24: 0,
  change24: 0,
  eurRate: 0.86,
  currency: 'USD',
  loading: false,
  updatedAt: 0,
  samples: [],
  plot: null,
  inspectIndex: -1,
  growthRange: 'd1',
  worthSamples: [],
  worthPlot: null,
  worthInspectIndex: -1,
  worthRange: 'd1',
  firstPaint: true,
  socket: null,
  reconnectTimer: 0,
  worthBackfillRunning: false,
  priceReady: false,
  treasuryReady: false,
  historyReady: false,
  walletRows: {},
  rewardChainLoading: false,
  rewardChainLastRefresh: 0,
  claimGraceUntil: 0,
  pendingHistoryDrop: null
};

const $ = (id) => document.getElementById(id);
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const fromWei = (value) => number(value) / INJ_DECIMALS;
const rate = (value) => {
  const parsed = number(value);
  return parsed > 1 ? parsed / INJ_DECIMALS : parsed;
};
const aprPercent = (value) => {
  const parsed = number(value);
  if (!(parsed > 0)) return 0;
  return parsed <= 1 ? parsed * 100 : parsed;
};

function currencyValue(value) {
  return state.currency === 'EUR' ? number(value) * state.eurRate : number(value);
}
function money(value, digits = 2) {
  return new Intl.NumberFormat(state.currency === 'EUR' ? 'it-IT' : 'en-US', {
    style: 'currency', currency: state.currency,
    minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(currencyValue(value));
}
function signedMoney(value, digits = 2) {
  const numeric = number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (numeric === 0) return money(0, digits);
  return `${numeric > 0 ? '+' : '−'}${money(Math.abs(numeric), digits)}`;
}
function treasuryInj(value, digits = 4) {
  return `${number(value).toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} INJ`;
}

function numberRollGroups(text) {
  const value = String(text ?? '');
  const groups = [];
  const regex = /\d[\d.,]*/g;
  let match;
  while ((match = regex.exec(value))) groups.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  return groups;
}
function appendRollingDigit(parent, oldDigit, newDigit, direction) {
  if (oldDigit === newDigit) {
    const stable = document.createElement('span');
    stable.className = 'number-roll-static-digit';
    stable.textContent = newDigit;
    parent.append(stable);
    return;
  }
  const slot = document.createElement('span');
  slot.className = `number-roll-digit number-roll-${direction}`;
  slot.setAttribute('aria-hidden', 'true');
  const oldLayer = document.createElement('span');
  oldLayer.className = 'number-roll-digit-layer number-roll-old';
  oldLayer.textContent = oldDigit || '\u00a0';
  const newLayer = document.createElement('span');
  newLayer.className = 'number-roll-digit-layer number-roll-new';
  newLayer.textContent = newDigit;
  slot.append(oldLayer, newLayer);
  parent.append(slot);
}
function appendRollingGroup(parent, oldGroup, newGroup, direction) {
  const oldDigits = Array.from(String(oldGroup || '')).filter((char) => /\d/.test(char));
  const chars = Array.from(String(newGroup || ''));
  const count = chars.reduce((sum, char) => sum + (/\d/.test(char) ? 1 : 0), 0);
  const offset = oldDigits.length - count;
  let index = 0;
  for (const char of chars) {
    if (!/\d/.test(char)) { parent.append(document.createTextNode(char)); continue; }
    const oldIndex = index + offset;
    appendRollingDigit(parent, oldIndex >= 0 && oldIndex < oldDigits.length ? oldDigits[oldIndex] : '', char, direction);
    index += 1;
  }
}
function appendStableGroup(parent, group) {
  for (const char of Array.from(String(group || ''))) {
    if (/\d/.test(char)) {
      const digit = document.createElement('span');
      digit.className = 'number-roll-static-digit';
      digit.textContent = char;
      parent.append(digit);
    } else parent.append(document.createTextNode(char));
  }
}
function renderStableNumberText(element, text) {
  const value = String(text ?? '');
  if (element.textContent === value && (element.querySelector('.number-roll-text') || !/\d/.test(value)) && !element.querySelector('.number-roll-digit')) return;
  const groups = numberRollGroups(value);
  if (!groups.length) { element.textContent = value; return; }
  const shell = document.createElement('span');
  shell.className = 'number-roll-text';
  shell.setAttribute('aria-label', value);
  let cursor = 0;
  for (const group of groups) {
    if (group.start > cursor) shell.append(document.createTextNode(value.slice(cursor, group.start)));
    appendStableGroup(shell, group.text);
    cursor = group.end;
  }
  if (cursor < value.length) shell.append(document.createTextNode(value.slice(cursor)));
  element.replaceChildren(shell);
}
function animateNumber(element, previousText, nextText, previous, next) {
  clearTimeout(element._rollTimer);
  element._rollTimer = null;
  element.classList.add('number-roll-host');
  renderStableNumberText(element, nextText);
}

function retainLiveDirection(element, previous, next) {
  if (!element) return;
  const reset = () => {
    delete element.dataset.liveDirection;
    element.style.removeProperty('color');
    element.classList.remove('value-change-up','value-change-down','entry-value-up','entry-value-down','focus-value-up','focus-value-down');
  };
  if (!Number.isFinite(next) || !Number.isFinite(previous)) {
    clearTimeout(element._directionTimer);element._directionTimer=null;
    element._directionCooldown=0;reset();return;
  }
  if (Math.abs(next-previous)<=Math.max(1e-12,Math.abs(previous)*1e-10)) return;
  if (Date.now() < (element._directionCooldown || 0)) { reset();return; }
  const direction=next>previous?'up':'down';
  element.dataset.liveDirection=direction;
  element.style.setProperty('color',`var(--${direction})`,'important');
  // A burst has a fixed end: frequent ticks cannot keep it colored indefinitely.
  if (!element._directionTimer) element._directionTimer=setTimeout(()=>{
    element._directionTimer=null;element._directionCooldown=Date.now()+180;reset();
  },650);
}

function triggerTreasuryRewardRisePulse(element, minInterval = 7200) {
  const frame = element?.closest?.('.reward-accent-frame');
  if (!frame || state.firstPaint || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const now = Date.now();
  if (now - number(frame._lastRewardRisePulse || 0) < minInterval) return;
  frame._lastRewardRisePulse = now;
  clearTimeout(frame._rewardRisePulseTimer);
  frame.classList.remove('reward-rise-pulse');
  void frame.offsetWidth;
  frame.classList.add('reward-rise-pulse');
  frame._rewardRisePulseTimer = setTimeout(() => frame.classList.remove('reward-rise-pulse'), 900);
}

function setLiveValue(id, text, numericValue, roll = true, directionMode = 'normal') {
  const element = $(id);
  if (!element) return;
  const nextText = String(text);
  const next = Number(numericValue);
  const previousText = element.dataset.renderedText;
  const previous = element.dataset.numericValue === undefined ? NaN : Number(element.dataset.numericValue);
  const changed = previousText !== undefined && previousText !== nextText && Number.isFinite(previous) && Number.isFinite(next) && Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);
  // Treasury values refresh in place: keep the column stable and avoid
  // rolling digits/scale motion that makes live data jump horizontally.
  if (roll) renderStableNumberText(element, nextText);
  else element.textContent = nextText;
  if (changed && !state.firstPaint) {
    if (directionMode === 'reward') {
      // Reward INJ: green on accrual, then neutral. Claims/resets stay calm.
      if (next > previous) {
        retainLiveDirection(element, 0, 1);
        triggerTreasuryRewardRisePulse(element);
      } else retainLiveDirection(element, NaN, NaN);
    } else if (directionMode === 'none') {
      retainLiveDirection(element, NaN, NaN);
    } else {
      retainLiveDirection(element, previous, next);
    }
  }
  element.dataset.renderedText = nextText;
  if (Number.isFinite(next)) element.dataset.numericValue = String(next); else delete element.dataset.numericValue;
}

function milestone(total) {
  const value = Math.max(0, number(total));
  const targets = [1000,1500,2000,2500,3000,4000,5000,7500,10000,15000,25000,50000,100000,250000,500000,1000000];
  const next = targets.find((target) => target > value) || Math.ceil(value / 1000000 + 1) * 1000000;
  const previous = [...targets].reverse().find((target) => target <= value) || 0;
  const span = Math.max(1, next - previous);
  return { next, progress: Math.max(0,Math.min(100,((value - previous) / span) * 100)), remaining: Math.max(0,next - value) };
}

function hydrateSnapshot() {
  try {
    const cached = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    if (cached && number(cached.total) > 0) { state.data = cached; state.updatedAt = number(cached.updatedAt); }
  } catch (_) {}
}
function persistSnapshot(data) { try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data)); } catch (_) {} }
function normalizeTimeline(rows) {
  const cleaned = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ t:number(row?.t), value:number(row?.value) }))
    .filter((row) => row.t > 0 && row.value > 0)
    .sort((a,b) => a.t - b.t);
  const deduped = [];
  for (const row of cleaned) {
    const last = deduped.at(-1);
    if (last && Math.abs(last.t - row.t) < 1000) last.value = row.value;
    else deduped.push(row);
  }
  return deduped;
}
function historyBucketSize(age) {
  if (age <= DAY) return MINUTE;          // ultime 24h: 1 punto/minuto
  if (age <= 7 * DAY) return 10 * MINUTE; // 1–7 giorni: 1 punto/10 min
  if (age <= 30 * DAY) return 30 * MINUTE;// 7–30 giorni: 1 punto/30 min
  if (age <= 180 * DAY) return 3 * HOUR;  // 1–6 mesi: 1 punto/3h
  if (age <= 365 * DAY) return 12 * HOUR; // 6–12 mesi: 1 punto/12h
  return DAY;                              // oltre 1 anno: 1 punto/giorno
}
function compactTimeline(rows, now = Date.now()) {
  const samples = normalizeTimeline(rows);
  if (samples.length <= 2) return samples;
  const first = samples[0];
  const last = samples.at(-1);
  const buckets = new Map();
  for (let index = 1; index < samples.length - 1; index += 1) {
    const row = samples[index];
    const step = historyBucketSize(Math.max(0, now - row.t));
    const bucket = `${step}:${Math.floor(row.t / step)}`;
    // Keep the latest real reading in each historical bucket. Nothing is
    // synthesized and the time coverage always remains from the first sample.
    buckets.set(bucket, row);
  }
  const compacted = [first, ...buckets.values(), last].sort((a,b) => a.t - b.t);
  return normalizeTimeline(compacted);
}
function saveTimeline(key, samples, assign) {
  const compacted = compactTimeline(samples);
  assign(compacted);
  let persisted = compacted;
  try {
    localStorage.setItem(key, JSON.stringify(compacted));
  } catch (_) {
    // Keep the complete time span even if an old browser reaches its localStorage quota.
    const first = compacted[0], last = compacted.at(-1);
    const archived = first && last ? [first] : [];
    const buckets = new Map();
    for (let index = 1; index < compacted.length - 1; index += 1) {
      const row = compacted[index];
      const step = Math.max(historyBucketSize(Math.max(0, Date.now() - row.t)), 6 * HOUR);
      buckets.set(`${step}:${Math.floor(row.t / step)}`, row);
    }
    archived.push(...buckets.values());
    if (last && (!archived.length || archived.at(-1).t !== last.t)) archived.push(last);
    archived.sort((a,b) => a.t - b.t);
    assign(archived);
    persisted = archived;
    try { localStorage.setItem(key, JSON.stringify(archived)); } catch (_) {}
  }
  // Redundant durable copy. Closing the PWA/browser does not reset either chart.
  void idbWriteTimeline(key,persisted);
}

function hydrateHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    state.samples = compactTimeline(rows);
    persistHistory();
  } catch (_) { state.samples = []; }
}
function persistHistory() {
  saveTimeline(HISTORY_KEY, state.samples, (rows) => { state.samples = rows; });
}
function markInternalRewardClaim(at = Date.now()) {
  // A staking claim only moves INJ from Distribution rewards to the bank balance
  // of the same Treasury address. During endpoint propagation we keep the growth
  // history on the last confirmed Treasury total instead of drawing a false dip.
  state.claimGraceUntil = Math.max(number(state.claimGraceUntil), number(at) + CLAIM_HISTORY_GRACE_MS);
  state.pendingHistoryDrop = null;
}
function recordHistory(total, at = Date.now()) {
  const value = number(total);
  if (!(value > 0)) return;
  const last = state.samples.at(-1);
  if (!last) { state.samples.push({t:at,value}); state.pendingHistoryDrop=null; persistHistory(); return; }

  const lastValue = number(last.value);
  const tolerance = Math.max(TREASURY_HISTORY_DROP_EPSILON, Math.abs(lastValue) * 1e-9);
  const isDrop = value < lastValue - tolerance;

  // Claim interno: Reward -> Disponibile nello stesso Treasury. Non e una
  // perdita e quindi non deve mai produrre la classica V verso il basso.
  if (isDrop && number(at) <= number(state.claimGraceUntil)) {
    state.pendingHistoryDrop = null;
    return;
  }

  // Un vero prelievo dal Treasury deve invece comparire. Per evitare che un
  // singolo endpoint momentaneamente arretrato crei una falsa discesa, la
  // riduzione del totale deve essere osservata in due refresh completi consecutivi.
  if (isDrop) {
    const pending = state.pendingHistoryDrop;
    if (!pending || number(pending.baseline) !== lastValue) {
      state.pendingHistoryDrop = { baseline:lastValue, value, t:at };
      return;
    }
    // Seconda lettura reale ancora sotto lo stesso baseline: uscita confermata.
    state.pendingHistoryDrop = null;
  } else {
    state.pendingHistoryDrop = null;
  }

  const gap = Math.max(0, at - number(last.t));
  if (gap < 1000) last.value = value;
  else if (gap >= 15000 || Math.abs(lastValue - value) > 1e-10) state.samples.push({t:at,value});
  persistHistory();
}
function hydrateWorthHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(WORTH_HISTORY_KEY) || '[]');
    state.worthSamples = compactTimeline(rows);
    persistWorthHistory();
  } catch (_) { state.worthSamples = []; }
}
function persistWorthHistory() {
  saveTimeline(WORTH_HISTORY_KEY, state.worthSamples, (rows) => { state.worthSamples = rows; });
}
function recordWorthHistory(total, price, at = Date.now(), force = false) {
  const worthUSD = number(total) * number(price);
  if (!(worthUSD > 0)) return;
  const last = state.worthSamples.at(-1);
  if (!last) { state.worthSamples.push({t:at,value:worthUSD}); persistWorthHistory(); return; }
  const gap = Math.max(0, at - number(last.t));
  if (force || gap >= 15000) {
    if (gap < 1000) last.value = worthUSD;
    else state.worthSamples.push({t:at,value:worthUSD});
    persistWorthHistory();
  }
}
function recordCurrentWorth(force = false) {
  const total = number(state.data?.total);
  const lastConfirmedTotal = number(state.samples.at(-1)?.value);
  if (number(state.claimGraceUntil) >= Date.now() && lastConfirmedTotal > 0 && total < lastConfirmedTotal - TREASURY_HISTORY_DROP_EPSILON) return;
  if (total > 0 && state.price > 0) recordWorthHistory(total,state.price,Date.now(),force);
}

// v15.99.62 — Resume Repair. When INJ NODE/Treasury is closed, there are no
// browser ticks to record. On the next open we rebuild the missing Net Worth
// section from real INJ/USDT Binance candles and the Treasury INJ timeline, so
// an overnight closure no longer becomes one long artificial diagonal line.
const WORTH_BACKFILL_MIN_GAP = 3 * MINUTE;
const WORTH_BACKFILL_MAX_REQUESTS = 4;
const BINANCE_KLINE_STEPS = Object.freeze({
  '1m': MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': HOUR,
  '4h': 4 * HOUR,
  '1d': DAY
});
function worthBackfillPlan(gapMs){
  if(gapMs<=20*HOUR)return {interval:'1m',step:MINUTE};
  if(gapMs<=3*DAY)return {interval:'5m',step:5*MINUTE};
  if(gapMs<=10*DAY)return {interval:'15m',step:15*MINUTE};
  if(gapMs<=35*DAY)return {interval:'30m',step:30*MINUTE};
  if(gapMs<=180*DAY)return {interval:'4h',step:4*HOUR};
  return {interval:'1d',step:DAY};
}
function totalAtHistoryTime(timestamp){
  const rows=state.samples
    .filter((row)=>number(row.t)>0&&number(row.value)>0)
    .map((row)=>({t:number(row.t),value:number(row.value)}))
    .sort((a,b)=>a.t-b.t);
  const liveTotal=number(state.data?.total);
  if(!rows.length)return liveTotal;
  if(timestamp<=rows[0].t)return rows[0].value;
  if(timestamp>=rows.at(-1).t)return liveTotal>0?liveTotal:rows.at(-1).value;
  let low=0,high=rows.length-1;
  while(low<high){
    const mid=Math.floor((low+high)/2);
    if(rows[mid].t<timestamp)low=mid+1;else high=mid;
  }
  const right=rows[low],left=rows[Math.max(0,low-1)];
  if(!right||!left||right.t<=left.t)return number(left?.value)||number(right?.value)||liveTotal;
  const ratio=Math.max(0,Math.min(1,(timestamp-left.t)/(right.t-left.t)));
  return left.value+((right.value-left.value)*ratio);
}
function newestWorthGap(){
  const rows=normalizeTimeline(state.worthSamples);
  const recentEdge=Date.now()-(10*MINUTE);
  for(let index=rows.length-1;index>0;index-=1){
    const left=rows[index-1],right=rows[index];
    // Only repair the gap that ends at the current resume. Historical rows are
    // intentionally compacted over time and must not be expanded again.
    if(right.t<recentEdge)break;
    const gap=right.t-left.t;
    if(gap>=WORTH_BACKFILL_MIN_GAP)return {left,right,gap};
  }
  return null;
}
async function fetchBinanceWorthBridge(startTime,endTime,plan){
  const rows=[];
  let cursor=Math.max(0,Math.floor(startTime+plan.step));
  let requests=0;
  while(cursor<endTime&&requests<WORTH_BACKFILL_MAX_REQUESTS){
    const url=`https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(plan.interval)}&startTime=${Math.floor(cursor)}&endTime=${Math.floor(endTime-1)}&limit=1000`;
    const data=await fetchJson(url,9000);
    const candles=Array.isArray(data)?data:[];
    if(!candles.length)break;
    for(const candle of candles){
      const t=Math.min(endTime-1,number(candle?.[6])||number(candle?.[0]));
      const price=number(candle?.[4]);
      if(t>startTime&&t<endTime&&price>0){
        const total=totalAtHistoryTime(t);
        if(total>0)rows.push({t,value:total*price});
      }
    }
    const lastOpen=number(candles.at(-1)?.[0]);
    const next=lastOpen+plan.step;
    if(!(next>cursor))break;
    cursor=next;
    requests+=1;
  }
  return rows;
}
async function repairWorthHistoryAfterResume(){
  if(state.worthBackfillRunning||!state.priceReady||!state.treasuryReady||!state.historyReady)return;
  const gap=newestWorthGap();
  if(!gap)return;
  state.worthBackfillRunning=true;
  try{
    const plan=worthBackfillPlan(gap.gap);
    const rebuilt=await fetchBinanceWorthBridge(gap.left.t,gap.right.t,plan);
    if(rebuilt.length){
      state.worthSamples=mergeTimelineRows(state.worthSamples,rebuilt);
      persistWorthHistory();
      hideWorthInspector();
      render();
    }
  }catch(error){
    // Keep existing real samples untouched. The next resume/refresh can retry.
    console.warn('Treasury Net Worth resume repair non disponibile',error);
  }finally{
    state.worthBackfillRunning=false;
  }
}

function historyLabel(timestamp) {
  const d = new Date(number(timestamp));
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
}
function historyFullLabel(timestamp) {
  return new Date(number(timestamp)).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function signedInj(value,digits=4){
  const numeric=number(value);
  const sign=numeric>0?'+':numeric<0?'−':'';
  return `${sign}${Math.abs(numeric).toLocaleString('it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits})} INJ`;
}
function signedPct(value,digits=2){
  const numeric=number(value);
  return `${numeric>0?'+':''}${numeric.toFixed(digits)}%`;
}
function setText(id,value){const el=$(id);if(el)el.textContent=value;}
function updateGrowthChartMetrics(sample=null){
  const rows=currentGrowthRows();
  const liveTotal=number(state.data?.total)||number(rows.at(-1)?.value);
  if(!rows.length && !(liveTotal>0))return;
  const first=number(rows[0]?.value)||liveTotal;
  const current=sample?number(sample.value):liveTotal;
  const delta=current-first;
  const pct=first>0?(delta/first)*100:0;
  const ath=Math.max(current,...rows.map((row)=>number(row.value)));
  const rangeLabel=state.growthRange==='d1'?'ULTIME 24H':state.growthRange==='w1'?'ULTIMI 7 GIORNI':state.growthRange==='m1'?'MESE IN CORSO':'TOTALE';
  setText('treasuryGrowthLabel',sample?'LETTURA':'TOTALE ATTUALE');
  setText('treasuryGrowthCurrent',treasuryInj(current,2));
  setText('treasuryGrowthSideLabel',sample?historyLabel(sample.t):rangeLabel);
  setText('treasuryGrowthChange',signedInj(delta,2));
  setText('treasuryGrowthChangePct',signedPct(pct,2));
  setText('treasuryGrowthAth',`MAX ${treasuryInj(ath,2)}`);
  setText('treasuryGrowthPoints',`${rows.length.toLocaleString('it-IT')} LETTURE`);
}
// v15.99.123 — Both Treasury charts share one calm timeframe model.
// 1G = rolling 24 hours, 1S = rolling 7 days, 1M = current calendar month,
// ALL = complete archive. Week/month unlock only after enough durable history exists.
const TREASURY_RANGES = Object.freeze({ d1: DAY, w1: 7 * DAY, m1: 'month', all: Infinity });
const WORTH_RANGES = TREASURY_RANGES;
function allWorthRows(){
  const rows=state.worthSamples
    .filter((row)=>number(row.t)>0&&number(row.value)>0)
    .map((row)=>({...row,t:number(row.t),value:number(row.value)}))
    .sort((a,b)=>a.t-b.t);
  const liveWorth=number(state.data?.total)*number(state.price);
  if(liveWorth>0){
    const now=Date.now();
    const last=rows.at(-1);
    if(!last) rows.push({t:now,value:liveWorth});
    else if(now-last.t<1000) last.value=liveWorth;
    else if(Math.abs(last.value-liveWorth)>Math.max(.000001,Math.abs(liveWorth)*1e-9)) rows.push({t:now,value:liveWorth});
    else if(now-last.t>=15000) rows.push({t:now,value:liveWorth});
  }
  return rows;
}
function currentMonthStart(at=Date.now()){
  const d=new Date(at);
  return new Date(d.getFullYear(),d.getMonth(),1,0,0,0,0).getTime();
}
function worthRangeCutoff(range,now=Date.now()){
  if(range==='d1')return now-DAY;
  if(range==='w1')return now-(7*DAY);
  if(range==='m1')return currentMonthStart(now);
  return -Infinity;
}
function clipWorthRows(rows,cutoff){
  if(!rows.length||!Number.isFinite(cutoff))return rows.slice();
  const firstInside=rows.findIndex((row)=>row.t>=cutoff);
  if(firstInside<0)return rows.slice(-1);
  const filtered=rows.slice(firstInside);
  // Add a boundary value at the exact beginning of a completed timeframe.
  // This makes the graph start at x=0 instead of floating in from the right.
  if(firstInside>0 && filtered.length){
    const prev=rows[firstInside-1],next=filtered[0];
    const span=Math.max(1,next.t-prev.t);
    const ratio=Math.max(0,Math.min(1,(cutoff-prev.t)/span));
    const value=prev.value+((next.value-prev.value)*ratio);
    filtered.unshift({t:cutoff,value,boundary:true});
  }
  return filtered;
}
function currentGrowthRows(){
  const rows=allGrowthRows();
  if(!rows.length||state.growthRange==='all')return rows;
  const now=Date.now();
  const cutoff=worthRangeCutoff(state.growthRange,now);
  const availableSpan=rows.length>1?Math.max(0,number(rows.at(-1).t)-number(rows[0].t)):0;
  const effectiveCutoff=state.growthRange==='d1'&&availableSpan<DAY?number(rows[0].t):cutoff;
  const filtered=clipWorthRows(rows,effectiveCutoff);
  return filtered.length>=2?filtered:rows.slice(-Math.min(2,rows.length));
}
function syncGrowthRangeControls(){
  const rows=allGrowthRows();
  const span=rows.length>1?Math.max(0,number(rows.at(-1).t)-number(rows[0].t)):0;
  document.querySelectorAll('[data-growth-range]').forEach((button)=>{
    const key=button.dataset.growthRange;
    const required=key==='w1'?7*DAY:key==='m1'?30*DAY:0;
    const disabled=required>0&&span<required;
    button.disabled=disabled;
    if(disabled&&state.growthRange===key)state.growthRange='d1';
    const active=key===state.growthRange;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
    if(key==='w1'&&disabled)button.title='Si sblocca dopo 7 giorni di storico accumulato';
    else if(key==='m1'&&disabled)button.title='Si sblocca dopo 30 giorni di storico accumulato';
    else button.removeAttribute('title');
  });
}
function setGrowthRange(range){
  if(!TREASURY_RANGES[range])return;
  const button=document.querySelector(`[data-growth-range="${range}"]`);
  if(button?.disabled)return;
  state.growthRange=range;
  hideSparkInspector();
  syncGrowthRangeControls();
  render();
}
function bindGrowthRangeControls(){
  document.querySelectorAll('[data-growth-range]').forEach((button)=>button.addEventListener('click',()=>setGrowthRange(button.dataset.growthRange)));
  syncGrowthRangeControls();
}
function currentWorthRows(){
  const rows=allWorthRows();
  if(!rows.length||state.worthRange==='all')return rows;
  const now=Date.now();
  const cutoff=worthRangeCutoff(state.worthRange,now);
  const availableSpan=rows.length>1?Math.max(0,number(rows.at(-1).t)-number(rows[0].t)):0;
  // During the first 24h, 1G grows naturally from the first real reading at the
  // left edge. Once 24h exists, it becomes a true rolling 24-hour window.
  const effectiveCutoff=state.worthRange==='d1'&&availableSpan<DAY?number(rows[0].t):cutoff;
  const filtered=clipWorthRows(rows,effectiveCutoff);
  return filtered.length>=2?filtered:rows.slice(-Math.min(2,rows.length));
}
function syncWorthRangeControls(){
  const rows=allWorthRows();
  const span=rows.length>1?Math.max(0,number(rows.at(-1).t)-number(rows[0].t)):0;
  document.querySelectorAll('[data-worth-range]').forEach((button)=>{
    const key=button.dataset.worthRange;
    const required=key==='w1'?7*DAY:key==='m1'?30*DAY:0;
    const disabled=required>0&&span<required;
    button.disabled=disabled;
    if(disabled&&state.worthRange===key)state.worthRange='d1';
    const active=key===state.worthRange;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
    if(key==='w1'&&disabled)button.title='Si sblocca dopo 7 giorni di storico accumulato';
    else if(key==='m1'&&disabled)button.title='Si sblocca dopo 30 giorni di storico accumulato';
    else button.removeAttribute('title');
  });
}
function setWorthRange(range){
  if(!WORTH_RANGES[range])return;
  const button=document.querySelector(`[data-worth-range="${range}"]`);
  if(button?.disabled)return;
  state.worthRange=range;
  hideWorthInspector();
  syncWorthRangeControls();
  render();
}
function bindWorthRangeControls(){
  document.querySelectorAll('[data-worth-range]').forEach((button)=>button.addEventListener('click',()=>setWorthRange(button.dataset.worthRange)));
  syncWorthRangeControls();
}
function updateWorthChartMetrics(sample=null){
  const rows=currentWorthRows();
  if(!rows.length)return;
  const first=number(rows[0].value),current=sample?number(sample.value):number(rows.at(-1).value);
  const delta=current-first,pct=first>0?(delta/first)*100:0;
  const min=Math.min(...rows.map((row)=>number(row.value))),max=Math.max(...rows.map((row)=>number(row.value)));
  setText('treasuryWorthLabel',sample?'LETTURA':'VALORE ATTUALE');
  setText('treasuryNetWorthCurrent',money(current,2));
  const rangeLabel=state.worthRange==='d1'?'ULTIME 24H':state.worthRange==='w1'?'ULTIMI 7 GIORNI':state.worthRange==='m1'?'MESE IN CORSO':'TOTALE';
  setText('treasuryWorthSideLabel',sample?historyLabel(sample.t):rangeLabel);
  setText('treasuryWorthChangeAbs',signedMoney(delta,2));
  setText('treasuryWorthChangePct',signedPct(pct,2));
  setText('treasuryWorthMin',`MIN ${money(min,2)}`);
  setText('treasuryWorthMax',`MAX ${money(max,2)}`);
}

function allGrowthRows(){
  const rows=state.samples
    .filter((row)=>number(row.t)>0&&number(row.value)>0)
    .map((row)=>({t:number(row.t),value:number(row.value)}));
  const liveTotal=number(state.data?.total);
  if(liveTotal>0){
    const last=rows.at(-1);
    if(!last||Math.abs(last.value-liveTotal)>1e-10)rows.push({t:Date.now(),value:liveTotal});
  }
  return rows;
}
function performanceBaseline(rows,windowMs){
  if(!rows.length)return null;
  if(windowMs===Infinity)return rows[0];
  const end=number(rows.at(-1).t)||Date.now();
  const span=Math.max(0,end-number(rows[0].t));
  if(span<windowMs*.92)return null;
  const target=end-windowMs;
  let best=rows[0],distance=Math.abs(number(best.t)-target);
  for(const row of rows){
    const nextDistance=Math.abs(number(row.t)-target);
    if(nextDistance<distance){best=row;distance=nextDistance;}
    if(number(row.t)>target&&nextDistance>distance)break;
  }
  return best;
}
function performanceWindow(windowMs){
  const growth=allGrowthRows();
  const worth=allWorthRows();
  const growthBase=performanceBaseline(growth,windowMs);
  if(!growth.length||!growthBase)return null;
  const currentGrowth=number(growth.at(-1).value);
  const baseGrowth=number(growthBase.value);
  const injDelta=currentGrowth-baseGrowth;
  const injPct=baseGrowth>0?(injDelta/baseGrowth)*100:0;

  const worthBase=performanceBaseline(worth,windowMs);
  let worthDelta=NaN,worthPct=NaN;
  if(worth.length&&worthBase){
    const currentWorth=number(worth.at(-1).value);
    const baseWorth=number(worthBase.value);
    worthDelta=currentWorth-baseWorth;
    worthPct=baseWorth>0?(worthDelta/baseWorth)*100:0;
  }
  return {injDelta,injPct,worthDelta,worthPct};
}
function setPerformanceCell(key,result){
  const cell=$(`treasuryPerf${key}Cell`);
  const inj=$(`treasuryPerf${key}Inj`);
  const worth=$(`treasuryPerf${key}Worth`);
  if(!cell||!inj||!worth)return;
  cell.classList.remove('positive','negative','neutral');
  if(!result){
    cell.classList.add('neutral');
    inj.textContent='—';
    worth.textContent='Storico in costruzione';
    return;
  }
  cell.classList.add(result.injDelta>0?'positive':result.injDelta<0?'negative':'neutral');
  inj.textContent=`${signedInj(result.injDelta,2)} · ${signedPct(result.injPct,2)}`;
  worth.textContent=Number.isFinite(result.worthDelta)?`${signedMoney(result.worthDelta,2)} · ${signedPct(result.worthPct,2)}`:'Patrimonio —';
}
function dailyGrowthMoves(rows){
  if(rows.length<2)return [];
  const closes=new Map();
  for(const row of rows){
    const date=new Date(number(row.t));
    const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    closes.set(key,{...row,key});
  }
  const days=[...closes.values()].sort((a,b)=>number(a.t)-number(b.t));
  const moves=[];
  for(let i=1;i<days.length;i+=1){
    moves.push({t:number(days[i].t),delta:number(days[i].value)-number(days[i-1].value)});
  }
  return moves;
}
function shortDate(timestamp){
  return new Date(number(timestamp)).toLocaleDateString('it-IT',{day:'2-digit',month:'short'});
}
function renderTreasuryPerformance(){
  setPerformanceCell('24',performanceWindow(DAY));
  setPerformanceCell('7',performanceWindow(7*DAY));
  setPerformanceCell('30',performanceWindow(30*DAY));
  setPerformanceCell('All',performanceWindow(Infinity));

  const rows=allGrowthRows();
  const span=rows.length>1?Math.max(0,number(rows.at(-1).t)-number(rows[0].t)):0;
  if(span>=DAY)setText('treasuryPerformanceCoverage',span>=30*DAY?`${Math.floor(span/DAY)} GIORNI`:`${Math.max(1,Math.floor(span/DAY))} GIORNI DI STORICO`);
  else if(span>0)setText('treasuryPerformanceCoverage',`${Math.max(1,Math.floor(span/HOUR))}H DI STORICO`);
  else setText('treasuryPerformanceCoverage','STORICO LIVE');

  if(rows.length){
    const ath=rows.reduce((best,row)=>number(row.value)>number(best.value)?row:best,rows[0]);
    setText('treasuryPerformanceAth',treasuryInj(ath.value,2));
    setText('treasuryPerformanceAthDate',historyFullLabel(ath.t));
    const first=number(rows[0].value),current=number(rows.at(-1).value),growth=current-first;
    setText('treasuryPerformanceGrowth',signedInj(growth,2));
    setText('treasuryPerformanceGrowthPct',first>0?signedPct((growth/first)*100,2):'—');
  }

  const moves=dailyGrowthMoves(rows);
  if(moves.length){
    const best=moves.reduce((a,b)=>b.delta>a.delta?b:a,moves[0]);
    const worst=moves.reduce((a,b)=>b.delta<a.delta?b:a,moves[0]);
    setText('treasuryBestDay',signedInj(best.delta,2));
    setText('treasuryBestDayDate',shortDate(best.t));
    setText('treasuryWorstDay',signedInj(worst.delta,2));
    setText('treasuryWorstDayDate',shortDate(worst.t));
  }else{
    setText('treasuryBestDay','—');setText('treasuryBestDayDate','Servono 2 giorni');
    setText('treasuryWorstDay','—');setText('treasuryWorstDayDate','Servono 2 giorni');
  }
}


function downsampleExtrema(samples,maxPoints=140) {
  if (samples.length <= maxPoints) return samples.map((row)=>({...row}));
  const first=samples[0],last=samples.at(-1),interior=samples.slice(1,-1);
  const bucketCount=Math.max(1,Math.floor((maxPoints-2)/2));
  const out=[first];
  for(let b=0;b<bucketCount;b+=1){
    const start=Math.floor((b*interior.length)/bucketCount);
    const end=Math.floor(((b+1)*interior.length)/bucketCount);
    const bucket=interior.slice(start,Math.max(start+1,end));
    if(!bucket.length)continue;
    let lo=bucket[0],hi=bucket[0];
    for(const row of bucket){
      if(number(row.value)<number(lo.value))lo=row;
      if(number(row.value)>number(hi.value))hi=row;
    }
    if(lo===hi)out.push(lo);
    else if(number(lo.t)<number(hi.t))out.push(lo,hi);
    else out.push(hi,lo);
  }
  out.push(last);
  return out.sort((a,b)=>number(a.t)-number(b.t));
}

// v15.99.123 — Financial chart thinning. LTTB keeps the visible shape instead of
// drawing every micro-tick; the real global high/low are explicitly retained.
function lttbSamples(samples, threshold=96){
  const data=samples.map((row)=>({...row,t:number(row.t),value:number(row.value)}));
  if(threshold>=data.length||threshold===0||threshold<3)return data;
  const sampled=[data[0]];
  const every=(data.length-2)/(threshold-2);
  let a=0;
  for(let i=0;i<threshold-2;i+=1){
    let avgStart=Math.floor((i+1)*every)+1;
    let avgEnd=Math.floor((i+2)*every)+1;
    avgEnd=Math.min(avgEnd,data.length);
    if(avgStart>=data.length)avgStart=data.length-1;
    if(avgEnd<=avgStart)avgEnd=Math.min(data.length,avgStart+1);
    let avgX=0,avgY=0,avgCount=Math.max(1,avgEnd-avgStart);
    for(let j=avgStart;j<avgEnd;j+=1){avgX+=data[j].t;avgY+=data[j].value;}
    avgX/=avgCount;avgY/=avgCount;

    let rangeStart=Math.floor(i*every)+1;
    let rangeEnd=Math.floor((i+1)*every)+1;
    rangeEnd=Math.min(rangeEnd,data.length-1);
    const pointA=data[a];
    let maxArea=-1,nextIndex=rangeStart;
    for(let j=rangeStart;j<Math.max(rangeStart+1,rangeEnd);j+=1){
      const point=data[Math.min(j,data.length-2)];
      const area=Math.abs((pointA.t-avgX)*(point.value-pointA.value)-(pointA.t-point.t)*(avgY-pointA.value));
      if(area>maxArea){maxArea=area;nextIndex=Math.min(j,data.length-2);}
    }
    sampled.push(data[nextIndex]);a=nextIndex;
  }
  sampled.push(data.at(-1));
  return sampled;
}
function readableFinancialSamples(samples,maxPoints=96){
  if(samples.length<=maxPoints)return samples.map((row)=>({...row}));
  const selected=lttbSamples(samples,maxPoints);
  let minRow=samples[0],maxRow=samples[0];
  for(const row of samples){
    if(number(row.value)<number(minRow.value))minRow=row;
    if(number(row.value)>number(maxRow.value))maxRow=row;
  }
  for(const row of [minRow,maxRow]){
    if(!selected.some((item)=>number(item.t)===number(row.t)))selected.push({...row});
  }
  selected.sort((a,b)=>number(a.t)-number(b.t));
  while(selected.length>maxPoints){
    let removeAt=-1,smallest=Infinity;
    for(let i=1;i<selected.length-1;i+=1){
      const row=selected[i];
      if(number(row.t)===number(minRow.t)||number(row.t)===number(maxRow.t))continue;
      const p=selected[i-1],n=selected[i+1];
      const area=Math.abs((number(p.t)-number(n.t))*(number(row.value)-number(p.value))-(number(p.t)-number(row.t))*(number(n.value)-number(p.value)));
      if(area<smallest){smallest=area;removeAt=i;}
    }
    if(removeAt<0)break;
    selected.splice(removeAt,1);
  }
  return selected;
}
function chartPointBudget(range){
  const mobile=window.innerWidth<=760;
  const table=mobile
    ? {d1:112,w1:88,m1:68,all:56}
    : {d1:176,w1:136,m1:108,all:88};
  return table[range]||table.d1;
}
// Shape-preserving cubic interpolation: passes through every retained real point
// and avoids the artificial overshoot typical of generic smooth curves.
function monotoneCurvePath(points){
  if(!points.length)return '';
  if(points.length===1)return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  const n=points.length;
  const d=new Array(n-1).fill(0),m=new Array(n).fill(0);
  for(let i=0;i<n-1;i+=1){
    const h=Math.max(1e-6,points[i+1].x-points[i].x);
    d[i]=(points[i+1].y-points[i].y)/h;
  }
  m[0]=d[0];m[n-1]=d[n-2];
  for(let i=1;i<n-1;i+=1)m[i]=(d[i-1]+d[i])/2;
  for(let i=0;i<n-1;i+=1){
    if(Math.abs(d[i])<1e-9){m[i]=0;m[i+1]=0;continue;}
    let a=m[i]/d[i],b=m[i+1]/d[i];
    if(a<0||b<0){m[i]=0;m[i+1]=0;continue;}
    const sum=a*a+b*b;
    if(sum>9){const tau=3/Math.sqrt(sum);m[i]=tau*a*d[i];m[i+1]=tau*b*d[i];}
  }
  let path=`M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for(let i=0;i<n-1;i+=1){
    const p=points[i],q=points[i+1],h=Math.max(1e-6,q.x-p.x);
    const c1x=p.x+h/3,c1y=p.y+m[i]*h/3;
    const c2x=q.x-h/3,c2y=q.y-m[i+1]*h/3;
    path+=` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
  }
  return path;
}

// Visual-only adaptive scale: keeps large spikes visible without crushing the
// smaller movements into a flat line. Tooltips always show the real value.
function adaptiveVisualPositions(values,minRelativeCore=.0005) {
  const clean=values.map(number).filter(Number.isFinite);
  if(!clean.length)return [];
  const sorted=[...clean].sort((a,b)=>a-b);
  const q=(ratio)=>{
    const pos=(sorted.length-1)*ratio,lo=Math.floor(pos),hi=Math.ceil(pos);
    if(lo===hi)return sorted[lo];
    const mix=pos-lo;
    return sorted[lo]*(1-mix)+sorted[hi]*mix;
  };
  const center=q(.5);
  const core=Math.max((q(.85)-q(.15))/2,Math.abs(center)*minRelativeCore,1e-8);
  const transformed=clean.map((value)=>Math.asinh((value-center)/core));
  let min=Math.min(...transformed),max=Math.max(...transformed);
  let span=Math.max(1e-8,max-min);
  const pad=span*.09;
  min-=pad; max+=pad; span=max-min;
  return transformed.map((value)=>Math.max(0,Math.min(1,(value-min)/span)));
}


function linearVisualPositions(values,minRelativeSpan=.0001){
  const clean=values.map(number);
  if(!clean.length)return [];
  let min=Math.min(...clean),max=Math.max(...clean);
  const center=(min+max)/2;
  const minimumSpan=Math.max(Math.abs(center)*minRelativeSpan,1e-8);
  let span=Math.max(max-min,minimumSpan);
  const pad=span*.14;
  min-=pad;max+=pad;span=Math.max(max-min,1e-8);
  return clean.map((value)=>Math.max(0,Math.min(1,(value-min)/span)));
}
function treasuryGridSvg(){
  return [18,38,58,78].map((y)=>`<line class="treasury-chart-gridline" x1="0" y1="${y}" x2="320" y2="${y}"></line>`).join('');
}
function piePoint(cx,cy,r,angle){
  const rad=(angle-90)*Math.PI/180;
  return {x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)};
}
function donutSlicePath(startAngle,endAngle,outerRadius=52,innerRadius=33){
  const span=Math.max(0,endAngle-startAngle);
  if(span<=0)return '';
  const full=span>=359.999;
  const endSafe=full?startAngle+359.999:endAngle;
  const outerStart=piePoint(60,60,outerRadius,startAngle);
  const outerEnd=piePoint(60,60,outerRadius,endSafe);
  const innerEnd=piePoint(60,60,innerRadius,endSafe);
  const innerStart=piePoint(60,60,innerRadius,startAngle);
  const large=(endSafe-startAngle)>180?1:0;
  return `M${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)} A${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)} L${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)} A${innerRadius} ${innerRadius} 0 ${large} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)} Z`;
}
function setDonutCenter(svg,label,value,meta){
  const labelNode=svg.querySelector('#treasuryDonutCenterLabel');
  const valueNode=svg.querySelector('#treasuryDonutCenterValue');
  const metaNode=svg.querySelector('#treasuryDonutCenterMeta');
  if(labelNode)labelNode.textContent=label;
  if(valueNode)valueNode.textContent=value;
  if(metaNode)metaNode.textContent=meta;
}
function renderAllocationPie(staked,available,rewards,total){
  const svg=$('treasuryAllocationPie');
  if(!svg)return;
  const safe=Math.max(number(total),1e-12);
  const rows=[
    {key:'staked',label:'STAKING',value:Math.max(0,number(staked)),digits:2,gradient:'treasuryDonutStaked'},
    {key:'available',label:'DISPONIBILE',value:Math.max(0,number(available)),digits:2,gradient:'treasuryDonutAvailable'},
    {key:'rewards',label:'REWARD',value:Math.max(0,number(rewards)),digits:4,gradient:'treasuryDonutRewards'}
  ];
  let angle=0;
  const gap=rows.filter((row)=>row.value>0).length>1?1.4:0;
  const paths=[];
  rows.forEach((row,index)=>{
    const rawNext=index===rows.length-1?360:angle+(row.value/safe)*360;
    if(rawNext>angle){
      const span=rawNext-angle;
      const localGap=Math.min(gap,span*.34);
      const start=angle+(localGap/2);
      const end=Math.max(start,rawNext-(localGap/2));
      const pct=(row.value/safe)*100;
      paths.push(`<path class="treasury-pie-slice ${row.key}" data-donut-key="${row.key}" data-donut-label="${row.label}" data-donut-value="${row.value}" data-donut-pct="${pct}" tabindex="0" role="button" aria-label="${row.label}: ${treasuryInj(row.value,row.digits)}, ${pct.toFixed(2)}%" d="${donutSlicePath(start,end)}" fill="url(#${row.gradient})"></path>`);
    }
    angle=rawNext;
  });

  const totalText=treasuryInj(total,2).replace(' INJ','');
  svg.innerHTML=`
    <defs>
      <linearGradient id="treasuryDonutStaked" x1="0%" y1="0%" x2="100%" y2="100%"><stop class="treasury-grad-staked-a" offset="0%"></stop><stop class="treasury-grad-staked-b" offset="100%"></stop></linearGradient>
      <linearGradient id="treasuryDonutAvailable" x1="0%" y1="100%" x2="100%" y2="0%"><stop class="treasury-grad-available-a" offset="0%"></stop><stop class="treasury-grad-available-b" offset="100%"></stop></linearGradient>
      <linearGradient id="treasuryDonutRewards" x1="15%" y1="0%" x2="90%" y2="100%"><stop class="treasury-grad-rewards-a" offset="0%"></stop><stop class="treasury-grad-rewards-b" offset="100%"></stop></linearGradient>
      <filter id="treasuryDonutGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.25" result="blur"></feGaussianBlur><feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>
    </defs>
    <circle class="treasury-donut-halo" cx="60" cy="60" r="56"></circle>
    <circle class="treasury-donut-track" cx="60" cy="60" r="42.5"></circle>
    <g class="treasury-donut-slices">${paths.join('')}</g>
    <circle class="treasury-donut-center-disc" cx="60" cy="60" r="29"></circle>
    <text class="treasury-donut-center-label" id="treasuryDonutCenterLabel" x="60" y="49">TOTAL TREASURY</text>
    <text class="treasury-donut-center-value" id="treasuryDonutCenterValue" x="60" y="62">${totalText}</text>
    <text class="treasury-donut-center-meta" id="treasuryDonutCenterMeta" x="60" y="72">INJ</text>
  `;

  const reset=()=>{
    svg.querySelectorAll('.treasury-pie-slice').forEach((node)=>node.classList.remove('is-active'));
    setDonutCenter(svg,'TOTAL TREASURY',totalText,'INJ');
  };
  const activate=(node)=>{
    if(!node)return;
    svg.querySelectorAll('.treasury-pie-slice').forEach((item)=>item.classList.toggle('is-active',item===node));
    const value=number(node.dataset.donutValue);
    const pct=number(node.dataset.donutPct);
    const key=node.dataset.donutKey;
    const digits=key==='rewards'?4:2;
    setDonutCenter(svg,node.dataset.donutLabel||'TREASURY',treasuryInj(value,digits).replace(' INJ',''),`${pct.toFixed(2)}% · INJ`);
  };
  let touchResetTimer=0;
  svg.querySelectorAll('.treasury-pie-slice').forEach((node)=>{
    node.addEventListener('pointerenter',(event)=>{if(event.pointerType!=='touch')activate(node);});
    node.addEventListener('focus',()=>activate(node));
    node.addEventListener('pointerleave',(event)=>{if(event.pointerType!=='touch'&&!svg.matches(':focus-within'))reset();});
    node.addEventListener('blur',()=>reset());
    node.addEventListener('click',(event)=>{
      activate(node);
      if(event.detail===0)return;
      clearTimeout(touchResetTimer);
      touchResetTimer=setTimeout(reset,1900);
    });
  });
  svg.onmouseleave=reset;
  svg.onpointercancel=reset;

  setText('treasuryAllocationStakedValue',treasuryInj(staked,2));
  setText('treasuryAllocationAvailableValue',treasuryInj(available,2));
  setText('treasuryAllocationRewardsValue',treasuryInj(rewards,4));
}

function placeTreasuryLiveDot(id, point, width=320, height=96) {
  const dot=$(id);
  if(!dot)return;
  if(!point){dot.hidden=true;return;}
  dot.style.left=`${Math.max(0,Math.min(100,(number(point.x)/width)*100))}%`;
  dot.style.top=`${Math.max(0,Math.min(100,(number(point.y)/height)*100))}%`;
  dot.hidden=false;
}
function renderSparkline() {
  const svg = $('treasurySparkline');
  if (!svg) return;
  const rawSamples = currentGrowthRows();
  syncGrowthRangeControls();
  if (rawSamples.length < 2) {
    state.plot = null;
    svg.innerHTML = '<path class="treasury-growth-line" d="M0 76 L320 76" opacity=".18"></path>';
    placeTreasuryLiveDot('treasuryGrowthLiveDot',null);
    $('treasuryHistoryStart').textContent = rawSamples.length ? historyLabel(rawSamples[0].t) : 'Prima lettura';
    $('treasuryHistoryEnd').textContent = 'Ora';
    hideSparkInspector();
    return;
  }

  const samples = readableFinancialSamples(rawSamples,chartPointBudget(state.growthRange));
  const values=samples.map((row)=>number(row.value));
  const rawMin=Math.min(...values),rawMax=Math.max(...values),rawSpan=Math.max(0,rawMax-rawMin);
  const reference=Math.max(.000001,(rawMin+rawMax)/2,number(values.at(-1)));
  const effectiveSpan=Math.max(rawSpan,reference*.00018,1e-7);
  const pad=effectiveSpan*.075;
  const displayMin=Math.max(0,rawMin-pad),displayMax=rawMax+pad,valueSpan=Math.max(1e-9,displayMax-displayMin);

  const now=Date.now();
  const allRows=allGrowthRows();
  const minSampleT=Math.min(...samples.map((row)=>number(row.t)));
  const maxSampleT=Math.max(...samples.map((row)=>number(row.t)));
  let startT=minSampleT,endT=Math.max(startT+1,maxSampleT);
  const firstArchiveT=number(allRows[0]?.t)||minSampleT;
  const archiveSpan=Math.max(0,now-firstArchiveT);
  if(state.growthRange==='d1'){
    if(archiveSpan<DAY){startT=firstArchiveT;endT=Math.max(now,maxSampleT,startT+1);}
    else {startT=now-DAY;endT=now;}
  }else if(state.growthRange==='w1'){startT=now-(7*DAY);endT=now;}
  else if(state.growthRange==='m1'){startT=currentMonthStart(now);endT=Math.max(now,maxSampleT,startT+1);}
  const timeSpan=Math.max(1,endT-startT),topY=12,bottomY=84,chartHeight=bottomY-topY;
  const plotted=samples.map((row)=>({
    t:number(row.t),value:number(row.value),
    x:Math.max(0,Math.min(320,((number(row.t)-startT)/timeSpan)*320)),
    y:Math.max(topY,Math.min(bottomY,bottomY-((number(row.value)-displayMin)/valueSpan)*chartHeight))
  }));
  const d=monotoneCurvePath(plotted);
  const first=plotted[0],last=plotted.at(-1);
  const area=`${d} L${last.x.toFixed(2)} 92 L${first.x.toFixed(2)} 92 Z`;
  svg.innerHTML=`<defs><linearGradient id="treasuryGrowthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".14"></stop><stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop></linearGradient></defs>${treasuryGridSvg()}<path class="treasury-growth-area" d="${area}"></path><path class="treasury-growth-line" d="${d}"></path>`;
  placeTreasuryLiveDot('treasuryGrowthLiveDot',last);
  state.plot={width:320,height:96,samples:plotted};
  $('treasuryHistoryStart').textContent=historyLabel(rawSamples[0].t);
  $('treasuryHistoryEnd').textContent='Ora';
  if(state.inspectIndex>=0)showSparkSample(Math.min(state.inspectIndex,plotted.length-1));
}

function hideSparkInspector() {
  $('treasurySparkStage')?.classList.remove('inspecting','dragging');
  if ($('treasurySparkCursor')) $('treasurySparkCursor').hidden = true;
  if ($('treasurySparkTooltip')) $('treasurySparkTooltip').hidden = true;
  state.inspectIndex = -1;
  updateGrowthChartMetrics();
}
function dockChartTooltip(tooltip,leftPct){
  tooltip.style.top='12px';tooltip.style.bottom='auto';
  tooltip.style.transform='none';
  tooltip.classList.remove('flip','below');
  if(leftPct<50){tooltip.style.left='auto';tooltip.style.right='12px';tooltip.classList.add('dock-right');}
  else{tooltip.style.left='12px';tooltip.style.right='auto';tooltip.classList.add('dock-left');}
}
function showSparkSample(index) {
  const plot = state.plot, stage = $('treasurySparkStage'), cursor = $('treasurySparkCursor'), tooltip = $('treasurySparkTooltip');
  if (!plot?.samples?.length || !stage || !cursor || !tooltip) return;
  const safe = Math.max(0,Math.min(plot.samples.length-1,index));
  const sample = plot.samples[safe];
  const leftPct = (sample.x / plot.width) * 100;
  const topPct = (sample.y / plot.height) * 100;
  cursor.style.left = `${leftPct}%`;
  cursor.querySelector('i').style.top = `${topPct}%`;
  cursor.hidden = false;
  dockChartTooltip(tooltip,leftPct);
  tooltip.querySelector('strong').textContent = treasuryInj(sample.value,4);
  tooltip.querySelector('small').textContent = historyFullLabel(sample.t);
  tooltip.hidden = false;
  stage.classList.add('inspecting');
  state.inspectIndex = safe;
}
function inspectSparkAt(event) {
  const stage = $('treasurySparkStage'), plot = state.plot;
  const samples=plot?.samples||[];
  if (!stage || !samples.length) return;
  const rect = stage.getBoundingClientRect();
  const x = Math.max(0,Math.min(rect.width,event.clientX-rect.left));
  const targetX = rect.width ? (x/rect.width)*plot.width : 0;
  let low=0,high=samples.length-1;
  while(low<high){const mid=Math.floor((low+high)/2);if(samples[mid].x<targetX)low=mid+1;else high=mid;}
  let index=low;
  if(index>0&&Math.abs(samples[index-1].x-targetX)<=Math.abs(samples[index].x-targetX))index-=1;
  showSparkSample(index);
}
function bindSparkInteraction() {
  const stage = $('treasurySparkStage');
  if (!stage || stage.dataset.sparkBound === '1') return;
  stage.dataset.sparkBound='1';
  const touch = {id:null,x:0,y:0,horizontal:false,moved:false};
  let idleTimer=0;
  const clearIdle=()=>{if(idleTimer){clearTimeout(idleTimer);idleTimer=0;}};
  const armIdle=()=>{clearIdle();idleTimer=setTimeout(()=>{idleTimer=0;hideSparkInspector();},1000);};
  const inside=(event)=>{const r=stage.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;};
  const release=(id)=>{try{if(stage.hasPointerCapture?.(id))stage.releasePointerCapture(id);}catch(_){}};
  const resetTouch=()=>{touch.id=null;touch.horizontal=false;touch.moved=false;stage.classList.remove('dragging');};
  stage.addEventListener('pointerdown',(event)=>{
    if(!state.plot?.samples?.length)return;
    clearIdle();
    if(event.pointerType==='mouse'){inspectSparkAt(event);return;}
    touch.id=event.pointerId;touch.x=event.clientX;touch.y=event.clientY;touch.horizontal=false;touch.moved=false;
  },{passive:true});
  stage.addEventListener('pointermove',(event)=>{
    if(event.pointerType==='mouse'){
      if(!inside(event)){armIdle();return;}
      clearIdle();inspectSparkAt(event);return;
    }
    if(event.pointerId!==touch.id)return;
    const dx=event.clientX-touch.x,dy=event.clientY-touch.y,ax=Math.abs(dx),ay=Math.abs(dy);
    if(!touch.horizontal){
      if(Math.max(ax,ay)<5)return;
      touch.moved=true;
      if(ay>ax*1.25){hideSparkInspector();resetTouch();return;}
      if(ax<=ay)return;
      touch.horizontal=true;stage.classList.add('dragging');try{stage.setPointerCapture(event.pointerId)}catch(_){}
    }
    if(event.cancelable)event.preventDefault();inspectSparkAt(event);
  },{passive:false});
  stage.addEventListener('pointerup',(event)=>{
    if(event.pointerType!=='mouse'&&event.pointerId===touch.id&&!touch.moved)inspectSparkAt(event);
    release(event.pointerId);resetTouch();armIdle();
  });
  stage.addEventListener('pointercancel',(event)=>{release(event.pointerId);resetTouch();armIdle();});
  stage.addEventListener('pointerleave',()=>{if(touch.id===null)armIdle();});
  stage.addEventListener('pointerout',(event)=>{if(touch.id===null&&!stage.contains(event.relatedTarget))armIdle();});
  window.addEventListener('blur',()=>{clearIdle();hideSparkInspector();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearIdle();hideSparkInspector();}});
  document.addEventListener('pointerdown',(event)=>{if(stage.classList.contains('inspecting')&&!stage.contains(event.target)){clearIdle();hideSparkInspector();}},true);
  stage.addEventListener('keydown',(event)=>{const samples=state.plot?.samples||[];if(!samples.length||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;event.preventDefault();clearIdle();if(event.key==='Escape')return hideSparkInspector();let i=state.inspectIndex;if(event.key==='Home')i=0;else if(event.key==='End')i=samples.length-1;else if(event.key==='ArrowLeft')i=i<0?samples.length-1:i-1;else i=i<0?0:i+1;showSparkSample(i);armIdle();});
}
function readableWorthSamples(samples, maxPoints = 96) {
  if (samples.length <= maxPoints) return samples.map((row) => ({...row}));
  const out = [samples[0]];
  const interior = samples.length - 2;
  const slots = Math.max(1,maxPoints - 2);
  for (let slot = 0; slot < slots; slot += 1) {
    const start = 1 + Math.floor((slot * interior) / slots);
    const end = 1 + Math.floor(((slot + 1) * interior) / slots);
    const bucket = samples.slice(start,Math.max(start + 1,end));
    if (!bucket.length) continue;
    // A representative point per horizontal bucket keeps the chart readable
    // without inventing extra historical values.
    const mid = bucket[Math.floor(bucket.length / 2)];
    out.push(mid);
  }
  out.push(samples.at(-1));
  return out;
}
function smoothWorthValues(samples) {
  if (samples.length < 4) return samples.map((row) => number(row.value));
  return samples.map((row,index) => {
    if (index === 0 || index === samples.length - 1) return number(row.value);
    const a = number(samples[index - 1].value);
    const b = number(row.value);
    const c = number(samples[index + 1].value);
    return (a + (b * 2) + c) / 4;
  });
}
function worthCurvePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    path += ` Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points.at(-1);
  path += ` T${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return path;
}
function worthSmoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const c1x = previous.x + dx * .38;
    const c2x = current.x - dx * .38;
    path += ` C${c1x.toFixed(2)} ${previous.y.toFixed(2)} ${c2x.toFixed(2)} ${current.y.toFixed(2)} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  }
  return path;
}
function compactAxisMoney(value) {
  const converted = currencyValue(value);
  const symbol = state.currency === 'EUR' ? '€' : '$';
  const absolute = Math.abs(converted);
  if (absolute >= 1_000_000) return `${symbol}${(converted / 1_000_000).toLocaleString('it-IT',{maximumFractionDigits:2})}M`;
  if (absolute >= 10_000) return `${symbol}${Math.round(converted).toLocaleString('it-IT')}`;
  return `${symbol}${converted.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
function renderWorthSparkline() {
  const svg = $('treasuryWorthSparkline');
  if (!svg) return;
  const rawSamples = currentWorthRows();
  syncWorthRangeControls();
  if (rawSamples.length < 2) {
    state.worthPlot = null;
    svg.innerHTML = '<path class="treasury-worth-line" d="M0 48 L320 48" opacity=".18"></path>';
    placeTreasuryLiveDot('treasuryWorthLiveDot',null);
    setText('treasuryWorthAxisTop','—');setText('treasuryWorthAxisBottom','—');
    $('treasuryWorthHistoryStart').textContent = rawSamples.length ? historyLabel(rawSamples[0].t) : 'Prima lettura';
    $('treasuryWorthHistoryEnd').textContent = 'Ora';
    hideWorthInspector();
    return;
  }

  const samples=readableFinancialSamples(rawSamples,chartPointBudget(state.worthRange));
  const values=samples.map((row)=>number(row.value));
  const rawMin=Math.min(...values),rawMax=Math.max(...values),rawSpan=Math.max(0,rawMax-rawMin);
  const referenceValue=Math.max(.000001,(rawMin+rawMax)/2,number(values.at(-1)));
  const effectiveSpan=Math.max(rawSpan,referenceValue*.0025,1);
  const padding=effectiveSpan*.075;
  const displayMin=Math.max(0,rawMin-padding),displayMax=rawMax+padding,valueSpan=Math.max(1e-9,displayMax-displayMin);

  const now=Date.now();
  const minSampleT=Math.min(...samples.map((row)=>number(row.t)));
  const maxSampleT=Math.max(...samples.map((row)=>number(row.t)));
  let startT=minSampleT,endT=Math.max(startT+1,maxSampleT);
  if(state.worthRange==='d1'){
    const archive=allWorthRows(),firstArchiveT=number(archive[0]?.t)||minSampleT,archiveSpan=Math.max(0,now-firstArchiveT);
    if(archiveSpan<DAY){startT=firstArchiveT;endT=Math.max(now,maxSampleT,startT+1);}
    else{startT=now-DAY;endT=now;}
  }else if(state.worthRange==='w1'){startT=now-(7*DAY);endT=now;}
  else if(state.worthRange==='m1'){startT=currentMonthStart(now);endT=Math.max(now,maxSampleT,startT+1);}
  const timeSpan=Math.max(1,endT-startT),topY=12,bottomY=84,chartHeight=bottomY-topY;
  const plotted=samples.map((row)=>({
    t:number(row.t),value:number(row.value),
    x:Math.max(0,Math.min(320,((number(row.t)-startT)/timeSpan)*320)),
    y:Math.max(topY,Math.min(bottomY,bottomY-((number(row.value)-displayMin)/valueSpan)*chartHeight))
  }));
  const d=monotoneCurvePath(plotted);
  const first=plotted[0],last=plotted.at(-1);
  const area=`${d} L${last.x.toFixed(2)} 92 L${first.x.toFixed(2)} 92 Z`;
  const grid=[24,48,72].map((y)=>`<line class="treasury-chart-gridline" x1="0" y1="${y}" x2="320" y2="${y}"></line>`).join('');
  svg.innerHTML=`<defs><linearGradient id="treasuryWorthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".12"></stop><stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop></linearGradient></defs>${grid}<path class="treasury-worth-area" d="${area}"></path><path class="treasury-worth-line" d="${d}"></path>`;
  setText('treasuryWorthAxisTop',`MAX ${compactAxisMoney(rawMax)}`);
  setText('treasuryWorthAxisBottom',`MIN ${compactAxisMoney(rawMin)}`);
  placeTreasuryLiveDot('treasuryWorthLiveDot',last);
  state.worthPlot={width:320,height:96,samples:plotted};
  $('treasuryWorthHistoryStart').textContent=historyLabel(rawSamples[0].t);
  $('treasuryWorthHistoryEnd').textContent='Ora';
  if(state.worthInspectIndex>=0)showWorthSample(Math.min(state.worthInspectIndex,plotted.length-1));
}
function hideWorthInspector() {
  $('treasuryWorthStage')?.classList.remove('inspecting','dragging');
  if ($('treasuryWorthCursor')) $('treasuryWorthCursor').hidden = true;
  if ($('treasuryWorthTooltip')) $('treasuryWorthTooltip').hidden = true;
  state.worthInspectIndex = -1;
  updateWorthChartMetrics();
}
function showWorthSample(index) {
  const plot = state.worthPlot, stage = $('treasuryWorthStage'), cursor = $('treasuryWorthCursor'), tooltip = $('treasuryWorthTooltip');
  if (!plot?.samples?.length || !stage || !cursor || !tooltip) return;
  const safe = Math.max(0,Math.min(plot.samples.length-1,index));
  const sample = plot.samples[safe];
  const leftPct = (sample.x / plot.width) * 100;
  const topPct = (sample.y / plot.height) * 100;
  cursor.style.left = `${leftPct}%`;
  cursor.querySelector('i').style.top = `${topPct}%`;
  cursor.hidden = false;
  dockChartTooltip(tooltip,leftPct);
  tooltip.querySelector('strong').textContent = money(sample.value,2);
  tooltip.querySelector('small').textContent = historyFullLabel(sample.t);
  tooltip.hidden = false;
  stage.classList.add('inspecting');
  state.worthInspectIndex = safe;
}
function inspectWorthAt(event) {
  const stage = $('treasuryWorthStage'), plot = state.worthPlot;
  const samples = plot?.samples || [];
  if (!stage || !samples.length) return;
  const rect = stage.getBoundingClientRect();
  if (!(rect.width > 0)) return;
  const clientX = Number(event?.clientX);
  if (!Number.isFinite(clientX)) return;
  const x = Math.max(0,Math.min(rect.width,clientX-rect.left));
  const targetX = (x/rect.width)*plot.width;
  let low=0,high=samples.length-1;
  while(low<high){const mid=Math.floor((low+high)/2);if(samples[mid].x<targetX)low=mid+1;else high=mid;}
  let index=low;
  if(index>0&&Math.abs(samples[index-1].x-targetX)<=Math.abs(samples[index].x-targetX))index-=1;
  showWorthSample(index);
}
function bindWorthInteraction() {
  const stage = $('treasuryWorthStage');
  if (!stage || stage.dataset.sparkBound === '1') return;
  stage.dataset.sparkBound = '1';
  const touch = {pointerId:null,startX:0,startY:0,horizontal:false,moved:false};
  let idleTimer=0;
  const clearIdle=()=>{if(idleTimer){clearTimeout(idleTimer);idleTimer=0;}};
  const armIdle=()=>{clearIdle();idleTimer=setTimeout(()=>{idleTimer=0;hideWorthInspector();},1000);};
  const inside = (event) => { const r=stage.getBoundingClientRect(); return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom; };
  const release = (id) => { try{if(stage.hasPointerCapture?.(id))stage.releasePointerCapture?.(id);}catch(_){} };
  const resetTouch = () => { touch.pointerId=null;touch.horizontal=false;touch.moved=false;stage.classList.remove('dragging'); };
  stage.addEventListener('pointerdown',(event)=>{
    if(!state.worthPlot?.samples?.length)return;
    clearIdle();
    if(event.pointerType==='mouse'){inspectWorthAt(event);return;}
    touch.pointerId=event.pointerId;touch.startX=event.clientX;touch.startY=event.clientY;touch.horizontal=false;touch.moved=false;
  },{passive:true});
  stage.addEventListener('pointermove',(event)=>{
    if(event.pointerType==='mouse'){
      if(!inside(event)){armIdle();return;}
      clearIdle();inspectWorthAt(event);return;
    }
    if(event.pointerId!==touch.pointerId)return;
    const dx=event.clientX-touch.startX,dy=event.clientY-touch.startY,ax=Math.abs(dx),ay=Math.abs(dy);
    if(!touch.horizontal){
      if(Math.max(ax,ay)<5)return;
      touch.moved=true;
      if(ay>ax*1.25){hideWorthInspector();resetTouch();return;}
      if(ax<=ay)return;
      touch.horizontal=true;stage.classList.add('dragging');try{stage.setPointerCapture?.(event.pointerId);}catch(_){}
    }
    if(event.cancelable)event.preventDefault();inspectWorthAt(event);
  },{passive:false});
  stage.addEventListener('pointerup',(event)=>{
    if(event.pointerType!=='mouse'&&event.pointerId===touch.pointerId&&!touch.moved)inspectWorthAt(event);
    release(event.pointerId);resetTouch();armIdle();
  });
  stage.addEventListener('pointercancel',(event)=>{release(event.pointerId);resetTouch();armIdle();});
  stage.addEventListener('pointerleave',()=>{if(touch.pointerId===null)armIdle();});
  stage.addEventListener('lostpointercapture',()=>stage.classList.remove('dragging'));
  document.addEventListener('pointerdown',(event)=>{if(!stage.classList.contains('inspecting')||stage.contains(event.target))return;clearIdle();hideWorthInspector();resetTouch();},true);
  window.addEventListener('blur',()=>{clearIdle();hideWorthInspector();resetTouch();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearIdle();hideWorthInspector();resetTouch();}});
  stage.addEventListener('keydown',(event)=>{const samples=state.worthPlot?.samples||[];if(!samples.length||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;event.preventDefault();clearIdle();if(event.key==='Escape')return hideWorthInspector();let i=state.worthInspectIndex;if(event.key==='Home')i=0;else if(event.key==='End')i=samples.length-1;else if(event.key==='ArrowLeft')i=i<0?samples.length-1:i-1;else i=i<0?0:i+1;showWorthSample(i);armIdle();});
}
function render() {
  const data = state.data;
  setLiveValue('treasuryHeaderPrice', state.price > 0 ? money(state.price,state.price<10?4:3) : '—', state.price || NaN, true);
  if (!data) { renderSparkline(); renderWorthSparkline(); return; }
  const total=number(data.total),available=number(data.available),staked=number(data.staked),rewards=number(data.rewards),apr=number(data.apr),worth=total*state.price,totalSafe=Math.max(total,.00000001);
  const stakedPct=Math.max(0,Math.min(100,staked/totalSafe*100)),availablePct=Math.max(0,Math.min(100,available/totalSafe*100)),rewardsPct=Math.max(0,Math.min(100,rewards/totalSafe*100));
  const daily=staked>0&&apr>0?staked*(apr/100)/365:0;
  const rv={hour:daily/24,day:daily,month:daily*30.4375,year:daily*365};
  const m=milestone(total);
  const fixed=Math.max(0,total).toFixed(2),[wholeRaw,decimals='00']=fixed.split('.');
  setLiveValue('treasuryTotalMajor',Number(wholeRaw).toLocaleString('en-US'),total,true);
  setLiveValue('treasuryTotalDecimals',`.${decimals}`,total,true);
  setLiveValue('treasuryTotalWorth',state.price>0?money(worth,2):'Prezzo in sincronizzazione',state.price>0?worth:NaN,true);
  setLiveValue('treasuryNetWorthCurrent',state.price>0?money(worth,2):'—',state.price>0?worth:NaN,true);
  const pnl24 = state.price>0 && state.open24>0 ? total * (state.price-state.open24) : NaN;
  const pnl24Pct = state.price>0 && state.open24>0 ? ((state.price/state.open24)-1)*100 : NaN;
  const pnl24Card = $('treasuryPnl24');
  if (pnl24Card) {
    pnl24Card.classList.remove('positive','negative','neutral');
    pnl24Card.classList.add(Number.isFinite(pnl24) ? (pnl24>0?'positive':pnl24<0?'negative':'neutral') : 'neutral');
  }
  setLiveValue('treasuryPnl24Value',Number.isFinite(pnl24)?signedMoney(pnl24,2):'—',pnl24,true);
  setLiveValue('treasuryPnl24Pct',Number.isFinite(pnl24Pct)?`${pnl24Pct>0?'+':''}${pnl24Pct.toFixed(2)}%`:'—',pnl24Pct,true);
  setLiveValue('treasuryRewards',treasuryInj(rewards,4),rewards,true,'reward');setLiveValue('treasuryRewardsWorth',state.price>0?money(rewards*state.price,2):'—',state.price>0?rewards*state.price:NaN,true,'none');
  setLiveValue('treasuryAvailable',treasuryInj(available,4),available,true);setLiveValue('treasuryAvailableWorth',state.price>0?money(available*state.price,2):'—',state.price>0?available*state.price:NaN,true);
  setLiveValue('treasuryStaked',treasuryInj(staked,4),staked,true);setLiveValue('treasuryStakedWorth',state.price>0?money(staked*state.price,2):'—',state.price>0?staked*state.price:NaN,true);
  setLiveValue('treasuryStakeRatio',`${stakedPct.toFixed(2)}%`,stakedPct,true);setLiveValue('treasuryStakedPct',`${stakedPct.toFixed(2)}%`,stakedPct,true);setLiveValue('treasuryAvailablePct',`${availablePct.toFixed(2)}%`,availablePct,true);setLiveValue('treasuryRewardsPct',`${rewardsPct.toFixed(2)}%`,rewardsPct,true);
  renderAllocationPie(staked,available,rewards,total);
  setLiveValue('treasuryApr',apr>0?`APR RETE ${apr.toFixed(3)}%`:'APR —',apr||NaN,true);
  setLiveValue('treasuryRewardHour',treasuryInj(rv.hour,5),rv.hour,true);setLiveValue('treasuryRewardDay',treasuryInj(rv.day,4),rv.day,true);setLiveValue('treasuryRewardMonth',treasuryInj(rv.month,3),rv.month,true);setLiveValue('treasuryRewardYear',treasuryInj(rv.year,2),rv.year,true);
  setLiveValue('treasuryRewardHourWorth',state.price>0?money(rv.hour*state.price,2):'—',state.price>0?rv.hour*state.price:NaN,true);setLiveValue('treasuryRewardDayWorth',state.price>0?money(rv.day*state.price,2):'—',state.price>0?rv.day*state.price:NaN,true);setLiveValue('treasuryRewardMonthWorth',state.price>0?money(rv.month*state.price,2):'—',state.price>0?rv.month*state.price:NaN,true);setLiveValue('treasuryRewardYearWorth',state.price>0?money(rv.year*state.price,2):'—',state.price>0?rv.year*state.price:NaN,true);
  setLiveValue('treasuryMilestoneTitle',`${m.next.toLocaleString('it-IT')} INJ`,m.next,true);setLiveValue('treasuryMilestonePct',`${m.progress.toFixed(1)}%`,m.progress,true);$('treasuryMilestoneBar').style.width=`${m.progress}%`;setLiveValue('treasuryMilestoneCurrent',`${total.toLocaleString('it-IT',{maximumFractionDigits:2})} INJ`,total,true);setLiveValue('treasuryMilestoneRemaining',`${m.remaining.toLocaleString('it-IT',{maximumFractionDigits:2})} INJ mancanti`,m.remaining,true);
  $('treasuryWalletCount').textContent=data.walletCount>0?(number(data.liveWallets)<number(data.walletCount)?`${data.liveWallets}/${data.walletCount} wallet live`:`${data.walletCount} wallet`):'—';
  $('treasuryUpdated').textContent=data.updatedAt?`Updated ${new Date(data.updatedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Sync';
  const base=state.samples.length?number(state.samples[0].value):total,delta=total-base;setLiveValue('treasurySessionDelta',`${delta>=0?'+':''}${delta.toLocaleString('it-IT',{minimumFractionDigits:4,maximumFractionDigits:4})} INJ`,delta,true);
  const worthRangeRows=currentWorthRows();
  const worthBase=worthRangeRows.length?number(worthRangeRows[0].value):worth;
  const worthCurrent=worthRangeRows.length?number(worthRangeRows.at(-1).value):worth;
  const worthDelta=state.price>0?worthCurrent-worthBase:0,worthPct=worthBase>0?(worthDelta/worthBase)*100:0;
  setLiveValue('treasuryWorthDelta',state.price>0?`${worthPct>=0?'+':''}${worthPct.toFixed(2)}%`:'—',worthPct,true);
  syncGrowthRangeControls();
  updateGrowthChartMetrics();
  syncWorthRangeControls();
  updateWorthChartMetrics();
  renderSparkline();
  renderWorthSparkline();
  renderTreasuryPerformance();
  requestAnimationFrame(()=>{state.firstPaint=false;});
}

async function fetchJson(url, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeout);
  try { const response=await fetch(url,{cache:'no-store',signal:controller.signal}); if(!response.ok)throw new Error(`HTTP ${response.status}`); return await response.json(); }
  finally { clearTimeout(timer); }
}
async function lcd(path) {
  let lastError;
  for (const base of LCD_ENDPOINTS) { try { return await fetchJson(base+path); } catch(error){ lastError=error; } }
  throw lastError || new Error('Rete Injective non disponibile');
}
function findInj(coins=[]) { const coin=coins.find((item)=>item?.denom==='inj'); return coin?fromWei(coin.amount):0; }
function delegationTotal(data) { return (data?.delegation_responses||[]).reduce((sum,row)=>sum+fromWei(row?.balance?.amount),0); }
function rewardTotal(data) { return (data?.total||[]).filter((coin)=>coin?.denom==='inj').reduce((sum,coin)=>sum+fromWei(coin.amount),0); }
async function rewardFromEndpoint(base,address){
  const data=await fetchJson(`${base}/cosmos/distribution/v1beta1/delegators/${address}/rewards`,6500);
  const reward=rewardTotal(data);
  if(!Number.isFinite(reward)||reward<0)throw new Error('Reward on-chain non valido');
  return reward;
}
async function loadConfirmedReward(address,previousReward=NaN){
  const previous=Number(previousReward),hasPrevious=Number.isFinite(previous)&&previous>=0;
  const first=await Promise.allSettled([rewardFromEndpoint(LCD_ENDPOINTS[0],address),rewardFromEndpoint(LCD_ENDPOINTS[1],address)]);
  const values=first.filter((item)=>item.status==='fulfilled').map((item)=>Math.max(0,number(item.value)));
  if(!values.length)throw new Error('Reward on-chain non disponibile');
  const belowPrevious=()=>hasPrevious?values.filter((value)=>value+REWARD_DROP_EPSILON<previous):[];
  const potentialDrop=hasPrevious&&belowPrevious().length>0;
  if(values.length<2||(potentialDrop&&belowPrevious().length<2)){try{values.push(Math.max(0,await rewardFromEndpoint(LCD_ENDPOINTS[2],address)));}catch(_){}}
  if(hasPrevious){
    const below=belowPrevious();
    if(below.length>=2)return {reward:Math.max(...below),claimed:true,confirmations:below.length};
    if(below.length){
      const nonDrop=values.filter((value)=>value+REWARD_DROP_EPSILON>=previous);
      if(nonDrop.length)return {reward:Math.max(...nonDrop),claimed:false,confirmations:nonDrop.length};
      throw new Error('Claim non ancora confermato');
    }
  }
  return {reward:Math.max(...values),claimed:false,confirmations:values.length};
}
async function loadWallet(address) {
  const previousReward=number(state.walletRows[address]?.rewards);
  const [bank,delegations,rewardRead]=await Promise.all([lcd(`/cosmos/bank/v1beta1/balances/${address}`),lcd(`/cosmos/staking/v1beta1/delegations/${address}`),loadConfirmedReward(address,previousReward)]);
  const available=findInj(bank?.balances||[]),staked=delegationTotal(delegations),reward=number(rewardRead.reward);
  if(rewardRead.claimed)markInternalRewardClaim();
  return {address,available,staked,rewards:reward,total:available+staked+reward,updatedAt:Date.now()};
}
async function loadRows() {
  const rows=[];let cursor=0;
  const worker=async()=>{while(cursor<TREASURY_ADDRESSES.length){const address=TREASURY_ADDRESSES[cursor++];try{rows.push(await loadWallet(address));}catch(_){}}};
  await Promise.all([worker(),worker()]);
  return rows;
}
function treasuryTotalsFromRows(rows){
  return rows.reduce((acc,row)=>({available:acc.available+number(row.available),staked:acc.staked+number(row.staked),rewards:acc.rewards+number(row.rewards),total:acc.total+number(row.total)}),{available:0,staked:0,rewards:0,total:0});
}
async function refreshTreasuryChainRewards(force=false){
  if(state.rewardChainLoading||!state.data)return;
  if(!force&&state.rewardChainLastRefresh&&Date.now()-state.rewardChainLastRefresh<REWARD_CHAIN_REFRESH_MS-500)return;
  state.rewardChainLoading=true;state.rewardChainLastRefresh=Date.now();
  let cursor=0;
  const worker=async()=>{
    while(cursor<TREASURY_ADDRESSES.length){
      const address=TREASURY_ADDRESSES[cursor++];
      const previous=state.walletRows[address];
      if(!previous)continue;
      try{
        const rewardRead=await loadConfirmedReward(address,number(previous.rewards));
        let next={...previous,rewards:number(rewardRead.reward),total:number(previous.available)+number(previous.staked)+number(rewardRead.reward),updatedAt:Date.now()};
        if(rewardRead.claimed){
          markInternalRewardClaim();
          // Claim confermato: rileggi immediatamente anche il bank balance dello stesso
          // wallet. Il reward non deve restare nel Treasury mentre l'INJ gia' trasferito
          // al saldo disponibile aspetta il normale ciclo di refresh.
          const [bank,delegations]=await Promise.all([lcd(`/cosmos/bank/v1beta1/balances/${address}`),lcd(`/cosmos/staking/v1beta1/delegations/${address}`)]);
          const available=findInj(bank?.balances||[]),staked=delegationTotal(delegations);
          next={...next,available,staked,total:available+staked+number(rewardRead.reward)};
        }
        state.walletRows[address]=next;
      }catch(_){}
    }
  };
  try{
    await Promise.all([worker(),worker()]);
    const rows=Object.values(state.walletRows);
    if(rows.length){
      const totals=treasuryTotalsFromRows(rows);
      state.data={...state.data,...totals,liveWallets:rows.length,updatedAt:Date.now()};
      state.updatedAt=state.data.updatedAt;
      persistSnapshot(state.data);
      render();
    }
  }finally{state.rewardChainLoading=false;}
}
async function loadApr() {
  const cached=number(state.data?.apr);
  try {
    const [official,annual,pool,distribution]=await Promise.all([
      fetchJson(OFFICIAL_APR_ENDPOINT,7000).catch(()=>null),
      lcd('/cosmos/mint/v1beta1/annual_provisions').catch(()=>null),
      lcd('/cosmos/staking/v1beta1/pool').catch(()=>null),
      lcd('/cosmos/distribution/v1beta1/params').catch(()=>null)
    ]);
    const officialApr=aprPercent(official?.apr);
    const annualProvisions=number(annual?.annual_provisions),bondedTokens=number(pool?.pool?.bonded_tokens),communityTax=rate(distribution?.params?.community_tax);
    const fallback=bondedTokens>0?(annualProvisions/bondedTokens)*100*Math.max(0,1-communityTax):0;
    return officialApr||fallback||cached;
  } catch (_) { return cached; }
}
async function loadTreasury(force=false) {
  if(state.loading)return;
  if(!force&&state.updatedAt&&Date.now()-state.updatedAt<15000)return;
  state.loading=true;
  const badge=$('treasuryLiveBadge');badge.classList.add('sync');badge.classList.remove('error');
  try {
    const [rows,apr]=await Promise.all([loadRows(),loadApr()]);
    if(!rows.length)throw new Error('Rete Injective non disponibile');
    state.walletRows=Object.fromEntries(rows.map((row)=>[row.address,row]));
    const totals=treasuryTotalsFromRows(rows);
    const data={ok:true,...totals,apr:number(apr),walletCount:TREASURY_ADDRESSES.length,liveWallets:rows.length,updatedAt:Date.now()};
    state.data=data;state.updatedAt=data.updatedAt;persistSnapshot(data);recordHistory(data.total,data.updatedAt);recordCurrentWorth(true);state.treasuryReady=true;badge.classList.remove('sync','error');void repairWorthHistoryAfterResume();
  } catch(error) {
    badge.classList.remove('sync');badge.classList.add('error');$('treasuryUpdated').textContent='Rete Injective temporaneamente non disponibile';
  } finally { state.loading=false;render(); }
}
async function loadEurRate() {
  try {
    const cached=number(localStorage.getItem('inj_monitor_eur_rate'));if(cached>0)state.eurRate=cached;
    const data=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',6000);const next=number(data?.rates?.EUR);if(next>0){state.eurRate=next;localStorage.setItem('inj_monitor_eur_rate',String(next));render();}
  } catch(_) {}
}
async function loadPrice() {
  try {
    const ticker=await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT',6000);
    const price=number(ticker?.lastPrice),open24=number(ticker?.openPrice),change24=number(ticker?.priceChangePercent);
    if(price>0){state.price=price;if(open24>0)state.open24=open24;state.change24=change24;recordCurrentWorth(false);state.priceReady=true;render();void repairWorthHistoryAfterResume();}
  } catch(_) {
    try {
      const data=await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=injective-protocol&vs_currencies=usd&include_24hr_change=true',6000);
      const price=number(data?.['injective-protocol']?.usd),change24=number(data?.['injective-protocol']?.usd_24h_change);
      if(price>0){
        state.price=price;state.change24=change24;
        if(Number.isFinite(change24)&&change24>-99.999)state.open24=price/(1+(change24/100));
        recordCurrentWorth(false);state.priceReady=true;render();void repairWorthHistoryAfterResume();
      }
    } catch(_){}
  }
}
function connectPriceSocket() {
  clearTimeout(state.reconnectTimer);
  try { state.socket?.close(); } catch(_) {}
  try {
    const socket=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@ticker');state.socket=socket;
    socket.addEventListener('message',(event)=>{try{const tick=JSON.parse(event.data);const price=number(tick?.c),open24=number(tick?.o),change24=number(tick?.P);if(price>0){state.price=price;if(open24>0)state.open24=open24;state.change24=change24;recordCurrentWorth(false);state.priceReady=true;render();void repairWorthHistoryAfterResume();}}catch(_){}});
    socket.addEventListener('close',()=>{if(!document.hidden)state.reconnectTimer=setTimeout(connectPriceSocket,4000);});
    socket.addEventListener('error',()=>{try{socket.close()}catch(_){}});
  } catch(_) { state.reconnectTimer=setTimeout(connectPriceSocket,5000); }
}


function bindTreasuryHomeReturn() {
  const close = $('treasuryClose');
  if (!close) return;
  close.addEventListener('click', (event) => {
    event.preventDefault();
    try { sessionStorage.setItem('inj_node_return_home', '1'); } catch (_) {}

    let canRestorePreviousHome = false;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      canRestorePreviousHome = Boolean(
        ref &&
        ref.origin === window.location.origin &&
        (ref.pathname.endsWith('/index.html') || ref.pathname.endsWith('/')) &&
        window.history.length > 1
      );
    } catch (_) {}

    // If Treasury was opened from Home, let the browser restore that exact page
    // (BFCache on iOS makes this effectively instant). If it cannot, index.html
    // consumes the one-shot flag and opens Home without replaying the boot splash.
    if (canRestorePreviousHome) window.history.back();
    else window.location.replace('./index.html');
  });
}


function boot() {
  try { state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD'; } catch(_) {}
  hydrateSnapshot();hydrateHistory();hydrateWorthHistory();bindTreasuryHomeReturn();bindSparkInteraction();bindWorthInteraction();bindGrowthRangeControls();bindWorthRangeControls();render();
  void restoreTimelineBackups().then(()=>{state.historyReady=true;render();void repairWorthHistoryAfterResume();});
  Promise.allSettled([loadPrice(),loadEurRate(),loadTreasury(true)]).finally(()=>{state.firstPaint=false;});
  connectPriceSocket();
  setInterval(()=>{if(!document.hidden)void loadTreasury(false);},15000);
  setInterval(()=>{if(!document.hidden)void refreshTreasuryChainRewards(false);},REWARD_CHAIN_REFRESH_MS);
  setInterval(()=>{if(!document.hidden&&(!state.socket||state.socket.readyState!==WebSocket.OPEN))void loadPrice();},30000);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){persistHistory();persistWorthHistory();}
    else{void restoreTimelineBackups().then(()=>{state.historyReady=true;render();void repairWorthHistoryAfterResume();});void loadPrice();void loadTreasury(true);connectPriceSocket();}
  });
  window.addEventListener('pageshow',()=>{try{state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';}catch(_){};void restoreTimelineBackups().then(()=>{state.historyReady=true;render();void repairWorthHistoryAfterResume();});render();});
  window.addEventListener('pagehide',()=>{persistHistory();persistWorthHistory();try{state.socket?.close()}catch(_){};clearTimeout(state.reconnectTimer);});
  window.addEventListener('beforeunload',()=>{persistHistory();persistWorthHistory();try{state.socket?.close()}catch(_){};clearTimeout(state.reconnectTimer);});
}

document.addEventListener('DOMContentLoaded',boot,{once:true});


// Reward perimeter removed: no background animation loop.
