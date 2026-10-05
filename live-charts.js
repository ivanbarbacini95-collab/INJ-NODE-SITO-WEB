'use strict';

// v15.98.79 — Live Charts isolated from Order Book. No depth WebSocket, no order-book REST refresh, no order-book rendering on this page.
// Keeps the v15.98.72 indicators/timeframes engine unchanged.

const $ = (id) => document.getElementById(id);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const mobile = matchMedia('(hover:none) and (pointer:coarse)').matches || innerWidth <= 820;
const maxFps = 60;
const minFrameMs = 1000 / maxFps;

const ranges = {
  m1:  { label:'1 MIN',       windowMs:MINUTE,       bucketMs:SECOND,       source:'m1',  interval:'1s',  limit:1000, minSpan:.000055, expand:90,  relax:1500, expected:60, smooth:true },
  m5:  { label:'5 MIN',       windowMs:5*MINUTE,     bucketMs:5*SECOND,     source:'m5',  interval:'1s',  limit:1000, minSpan:.000075, expand:105, relax:1800, expected:60, smooth:true },
  m15: { label:'15 MIN',      windowMs:15*MINUTE,    bucketMs:15*SECOND,    source:'m15', interval:'1s',  limit:1000, minSpan:.00010,  expand:120, relax:2300, expected:60, smooth:true },
  m30: { label:'30 MIN',      windowMs:30*MINUTE,    bucketMs:MINUTE,       source:'m30', interval:'1m',  limit:260,  minSpan:.00014,  expand:135, relax:2800, expected:30, smooth:true },
  h1:  { label:'1 ORA',       windowMs:HOUR,         bucketMs:MINUTE,       source:'h1',  interval:'1m',  limit:260,  minSpan:.00022,  expand:160, relax:4300, expected:60, smooth:true },
  h4:  { label:'4 ORE',       windowMs:4*HOUR,       bucketMs:5*MINUTE,     source:'h4',  interval:'5m',  limit:260,  minSpan:.00042,  expand:185, relax:5600, expected:48 },
  d1:  { label:'1 GIORNO',    windowMs:DAY,          bucketMs:30*MINUTE,    source:'d1',  interval:'30m', limit:260,  minSpan:.0013,   expand:220, relax:7600, expected:48 },
  w1:  { label:'1 SETTIMANA', windowMs:7*DAY,        bucketMs:4*HOUR,       source:'w1',  interval:'4h',  limit:260,  minSpan:.0030,   expand:270, relax:10000,expected:42 },
  mo1: { label:'1 MESE',      windowMs:30*DAY,       bucketMs:12*HOUR,      source:'mo1', interval:'12h', limit:260,  minSpan:.0070,   expand:310, relax:12500,expected:60 },
  y1:  { label:'1 ANNO',      windowMs:365*DAY,      bucketMs:7*DAY,        source:'y1',  interval:'1d',  limit:500,  minSpan:.0200,   expand:360, relax:16000,expected:53 },
  all: { label:'ALL',         windowMs:20*365*DAY,   bucketMs:28*DAY,       source:'all', interval:'1w',  limit:1000, minSpan:.0400,   expand:420, relax:20000,expected:80 }
};

const BOOK_WS_ENDPOINTS=[
  'wss://stream.binance.com:443/ws/injusdt@depth20@100ms',
  'wss://data-stream.binance.vision/ws/injusdt@depth20@100ms',
  'wss://stream.binance.com:9443/ws/injusdt@depth20@100ms'
];
const BOOK_REST_BASES=['https://api.binance.com','https://data-api.binance.vision','https://api1.binance.com'];

const savedRange = (()=>{ try { const v=localStorage.getItem('inj_node_live_chart_range'); return ranges[v]?v:'m1'; } catch(_){ return 'm1'; } })();
const BOOK_GROUPINGS=[0.001,0.01,0.1,1];
const savedBookGrouping=(()=>{try{const v=Number(localStorage.getItem('inj_node_book_grouping'));return BOOK_GROUPINGS.includes(v)?v:0.001;}catch(_){return 0.001;}})();
const savedQuoteCurrency=(()=>{try{return localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';}catch(_){return 'USD';}})();
const savedEurRate=(()=>{try{const v=Number(localStorage.getItem('inj_monitor_eur_rate'));return v>0?v:0.86;}catch(_){return 0.86;}})();
const state = {
  active:savedRange,
  series:Object.fromEntries(Object.values(ranges).map(cfg=>[cfg.source,[]])),
  loaded:Object.fromEntries(Object.values(ranges).map(cfg=>[cfg.source,false])),
  historyCache:{},
  loading:{}, scales:{}, scaleTextAt:0,
  lastPrice:0,targetPrice:0,visualPrice:0,lastTickAt:0,lastTickDir:0,flashUntil:0,
  colors:null,ws:null,reconnect:0,depthWs:null,depthReconnect:0,stopped:false,raf:0,lastFrame:0,
  rangeEnterAt:0, geometry:null,crosshair:{active:false,x:0,y:0},
  indicatorsOn:(()=>{try{return localStorage.getItem('inj_node_indicators')!=='0';}catch(_){return true;}})(),indicatorRenderAt:0,
  book:{asks:[],bids:[],bestAsk:0,bestBid:0,spread:0,renderAt:0,timer:0,open:false,lastUpdateAt:0,endpointIndex:0,watchdog:0,snapshotTimer:0,snapshotLoading:false,maxLevels:100,rawLimit:100,grouping:savedBookGrouping,askPinned:true,bidPinned:true,priceFlashTimer:0,quoteCurrency:savedQuoteCurrency,eurRate:savedEurRate}
};
for(const key of Object.keys(ranges)) state.scales[key]=null;
state.book.rawLimit=snapshotLimitForGrouping(state.book.grouping);

function priceText(v){
  if(!(v>0))return '—';
  const d=v<10?4:v<100?3:2;
  return '$'+v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function pctText(v){ if(!Number.isFinite(v))return '—'; return `${v>=0?'+':''}${v.toFixed(2)}%`; }
function setText(id,text){const n=$(id);if(n&&n.textContent!==text)n.textContent=text;}
function setTrendClass(node,value){if(!node)return;node.classList.remove('up','down','neutral');node.classList.add(value>0?'up':value<0?'down':'neutral');}
function hexAlpha(color,alpha){
  if(!color)return `rgba(85,168,255,${alpha})`;
  if(color.startsWith('#')){let h=color.slice(1);if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;}
  const m=color.match(/[\d.]+/g);if(m&&m.length>=3)return `rgba(${m[0]},${m[1]},${m[2]},${alpha})`;
  return color;
}
function colors(){const cs=getComputedStyle(document.documentElement),read=(name,fallback)=>cs.getPropertyValue(name).trim()||fallback;state.colors={up:read('--up','#2ad98f'),down:read('--down','#ff5b6f'),accent:read('--accent','#55a8ff'),canvas:read('--canvas','#050506'),muted:read('--muted','#7890b7'),muted2:read('--muted2','#9eb1cf'),yellow:read('--yellow','#ffd84d'),ema12:read('--ema12','#62b9ff'),ema26:read('--ema26','#b693ff'),ema50:read('--ema50','#e7b85a'),ema200:read('--ema200','#d9e0ea')};}
function connection(mode){const n=$('connectionState');if(!n)return;n.className=`connection-pill ${mode}`;const b=n.querySelector('b');if(b)b.textContent=mode==='online'?'LIVE':mode==='offline'?'RECONNECT':'CONNECTING';}
function bookConnection(mode){const n=$('orderBookState');if(!n)return;n.className=`book-pill ${mode}`;const b=n.querySelector('b');if(b)b.textContent=mode==='online'?'LIVE':mode==='offline'?'OFF':'SYNC';}
function groupingDecimals(step=state.book.grouping){const text=String(step);return text.includes('.')?text.split('.')[1].length:0;}
function orderPriceText(v){
  if(!(v>0))return '—';
  const d=groupingDecimals();
  return Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function snapshotLimitForGrouping(step=state.book.grouping){return step>=1?5000:step>=0.1?1000:step>=0.01?500:100;}
function snapshotRefreshForGrouping(step=state.book.grouping){return step>=1?8000:step>=0.1?4500:step>=0.01?3000:2500;}
function bucketBookLevels(levels,side,step=state.book.grouping){
  if(!(step>0))return levels.slice();
  const d=Math.min(8,Math.max(groupingDecimals(step),4));
  const buckets=new Map();
  for(const l of levels||[]){
    if(!(l?.p>0&&l?.q>0))continue;
    const ratio=l.p/step;
    const idx=side==='ask'?Math.ceil(ratio-1e-10):Math.floor(ratio+1e-10);
    const p=Number((idx*step).toFixed(d));
    const prev=buckets.get(p);
    if(prev)prev.q+=l.q;else buckets.set(p,{p,q:l.q});
  }
  return [...buckets.values()].sort((a,b)=>side==='ask'?a.p-b.p:b.p-a.p);
}
function updateBookGroupingUI(){
  const select=$('bookGrouping');
  if(select&&select.value!==String(state.book.grouping))select.value=String(state.book.grouping);
  const hint=$('bookDepthHint');
  if(hint)hint.textContent=`INJ / USDT · ${orderPriceText(state.book.grouping)} STEP · SCROLL`;
}
function setBookGrouping(step){
  step=Number(step);if(!BOOK_GROUPINGS.includes(step)||step===state.book.grouping)return;
  state.book.grouping=step;state.book.rawLimit=snapshotLimitForGrouping(step);state.book.askPinned=true;state.book.bidPinned=true;
  try{localStorage.setItem('inj_node_book_grouping',String(step));}catch(_){}
  updateBookGroupingUI();renderOrderBook();startBookSnapshotRefresh();void loadOrderBookSnapshot();
}
function orderSizeText(v){return v>0?Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:v<100?3:2}):'—';}
function orderTotalText(usdValue){
  if(!(usdValue>=0))return '—';
  const eur=state.book.eurRate>0?state.book.eurRate:0.86;
  const isEur=state.book.quoteCurrency==='EUR';
  const value=isEur?usdValue*eur:usdValue;
  return new Intl.NumberFormat(isEur?'it-IT':'en-US',{style:'currency',currency:isEur?'EUR':'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
}
function updateBookCurrencyUI(){
  const label=$('bookTotalLabel');if(label)label.textContent=`TOTAL ${state.book.quoteCurrency==='EUR'?'€':'$'}`;
}
async function refreshBookEurRate(){
  try{
    const cached=Number(localStorage.getItem('inj_monitor_eur_rate'));if(cached>0)state.book.eurRate=cached;
    state.book.quoteCurrency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';
  }catch(_){}
  updateBookCurrencyUI();renderOrderBook();
  if(state.book.quoteCurrency!=='EUR')return;
  try{
    const r=await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR',{cache:'no-store'});if(!r.ok)return;
    const data=await r.json(),rate=Number(data?.rates?.EUR);
    if(rate>0){state.book.eurRate=rate;try{localStorage.setItem('inj_monitor_eur_rate',String(rate));}catch(_){}renderOrderBook();}
  }catch(_){}
}
function flashBookTrade(price,side){
  if(!(price>0))return;
  const host=$('bookMarketPrice'),value=$('bookLivePrice');
  if(value)value.textContent=priceText(price);
  if(!host)return;
  const cls=side==='buy'?'buy-flash':'sell-flash';
  host.classList.remove('buy-flash','sell-flash');
  void host.offsetWidth;
  host.classList.add(cls);
  clearTimeout(state.book.priceFlashTimer);
  state.book.priceFlashTimer=setTimeout(()=>host.classList.remove('buy-flash','sell-flash'),240);
}
function setBookOpen(open){state.book.open=!!open;const page=$('livePage');page?.classList.toggle('book-open',state.book.open);$('orderBookToggle')?.setAttribute('aria-pressed',String(state.book.open));}
function setLoading(mode){const n=$('chartLoading');if(!n)return;if(mode==='done')n.classList.add('done');else{n.classList.remove('done');const s=n.querySelector('span');if(s)s.textContent=mode==='live'?'LIVE':'SYNC';}}

function normalizeCandles(rows,bucketMs){
  const map=new Map();
  for(const raw of rows||[]){if(!raw)continue;const t=Math.floor(Number(raw.t)/bucketMs)*bucketMs;const o=+raw.o,h=+raw.h,l=+raw.l,c=+raw.c;if(!(t>=0&&o>0&&h>0&&l>0&&c>0))continue;const prev=map.get(t);if(!prev)map.set(t,{t,o,h,l,c});else{prev.h=Math.max(prev.h,h);prev.l=Math.min(prev.l,l);prev.c=c;}}
  return [...map.values()].sort((a,b)=>a.t-b.t);
}
function aggregateCandles(rows,bucketMs){return normalizeCandles(rows,bucketMs);}
function trimSeries(key,now=Date.now()){const cfg=ranges[key];if(!cfg)return;const arr=state.series[cfg.source]||[];const cutoff=now-cfg.windowMs-cfg.bucketMs*230;while(arr.length>2&&arr[0].t<cutoff)arr.shift();const cap=Math.max(cfg.expected+8,260);if(arr.length>cap)arr.splice(0,arr.length-cap);}
function mergeLiveInto(key,raw){const cfg=ranges[key],arr=state.series[cfg.source];if(!cfg||!arr)return;const t=Math.floor(raw.t/cfg.bucketMs)*cfg.bucketMs;let last=arr[arr.length-1];if(!last||last.t<t){last={t,o:raw.o,h:raw.h,l:raw.l,c:raw.c};arr.push(last);}else if(last.t===t){last.h=Math.max(last.h,raw.h);last.l=Math.min(last.l,raw.l);last.c=raw.c;}else{const found=arr.find(c=>c.t===t);if(found){found.h=Math.max(found.h,raw.h);found.l=Math.min(found.l,raw.l);found.c=raw.c;}}trimSeries(key,raw.t);}
function mergeTradeInto(key,price,time){const cfg=ranges[key],arr=state.series[cfg.source];if(!cfg||!arr||!state.loaded[cfg.source]||!(price>0))return;const t=Math.floor(time/cfg.bucketMs)*cfg.bucketMs;let last=arr[arr.length-1];if(!last||last.t<t){const open=last?.c>0?last.c:price;last={t,o:open,h:Math.max(open,price),l:Math.min(open,price),c:price};arr.push(last);}else if(last.t===t){last.h=Math.max(last.h,price);last.l=Math.min(last.l,price);last.c=price;}else{const found=arr.find(c=>c.t===t);if(found){found.h=Math.max(found.h,price);found.l=Math.min(found.l,price);found.c=price;}}trimSeries(key,time);}
function applyTrade(price,time=Date.now()){if(!(price>0))return;const previous=state.targetPrice>0?state.targetPrice:(state.lastPrice>0?state.lastPrice:price);state.lastTickDir=price>previous?1:price<previous?-1:state.lastTickDir;state.lastPrice=price;state.targetPrice=price;if(!(state.visualPrice>0))state.visualPrice=price;state.lastTickAt=Date.now();state.flashUntil=performance.now()+420;for(const key of Object.keys(ranges))mergeTradeInto(key,price,time);}

async function fetchKlines(interval,limit){
  const bases=['https://api.binance.com','https://data-api.binance.vision','https://api1.binance.com'];
  let lastErr;
  for(const base of bases){
    try{const url=`${base}/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(interval)}&limit=${limit}`;const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('history '+r.status);const data=await r.json();const rows=data.map(row=>({t:+row[0],o:+row[1],h:+row[2],l:+row[3],c:+row[4]})).filter(c=>c.o>0&&c.h>0&&c.l>0&&c.c>0);if(rows.length)return rows;}catch(e){lastErr=e;}
  }
  throw lastErr||new Error('history');
}
async function historyRows(interval,limit){
  const key=`${interval}:${limit}`;
  if(state.historyCache[key])return state.historyCache[key];
  const promise=fetchKlines(interval,limit).catch(e=>{delete state.historyCache[key];throw e;});
  state.historyCache[key]=promise;return promise;
}
async function ensureHistory(key){
  const cfg=ranges[key];if(!cfg)return;
  if(state.loaded[cfg.source]){if(key===state.active)setLoading('done');return;}
  if(state.loading[key])return state.loading[key];
  const job=(async()=>{
    if(key===state.active)setLoading('sync');
    try{
      const rows=await historyRows(cfg.interval,cfg.limit);
      state.series[cfg.source]=normalizeCandles(rows,cfg.bucketMs);
      state.loaded[cfg.source]=true;state.scales[key]=null;trimSeries(key);
      const latest=rows.at(-1)?.c;if(latest>0){if(!(state.lastPrice>0))state.lastPrice=latest;if(!(state.targetPrice>0))state.targetPrice=latest;if(!(state.visualPrice>0))state.visualPrice=latest;}
      if(state.targetPrice>0)mergeTradeInto(key,state.targetPrice,Date.now());
      if(key===state.active){state.rangeEnterAt=performance.now();setLoading('done');}
    }catch(_){if(key===state.active)setLoading('live');}
    finally{state.loading[key]=null;}
  })();state.loading[key]=job;return job;
}
async function primeHistories(){
  await ensureHistory(state.active);
  const warm=['h1','d1','w1'].filter(k=>k!==state.active);
  const run=async()=>{for(const key of warm){if(document.hidden||state.stopped)break;await ensureHistory(key);}};
  if('requestIdleCallback' in window)requestIdleCallback(()=>{void run();},{timeout:2500});else setTimeout(()=>{void run();},900);
}

function normalizeBookSide(levels,desc=false){
  return (levels||[]).map(l=>Array.isArray(l)?{p:+l[0],q:+l[1]}:{p:+l.price,q:+l.qty}).filter(l=>l.p>0&&l.q>0).sort((a,b)=>desc?b.p-a.p:a.p-b.p);
}
function queueBookRender(){
  const now=performance.now(),wait=Math.max(0,140-(now-state.book.renderAt));
  if(state.book.timer)return;
  state.book.timer=setTimeout(()=>{state.book.timer=0;renderOrderBook();},wait);
}
function renderBookRows(targetId,rows,side,maxQty){
  const host=$(targetId); if(!host) return;
  const oldTop=host.scrollTop;
  const nearBest=side==='ask' ? (host.scrollHeight-host.clientHeight-oldTop<28) : oldTop<28;
  host.textContent='';
  if(!rows.length){ const empty=document.createElement('div'); empty.className='orderbook-empty'; empty.textContent='WAITING FOR BOOK'; host.appendChild(empty); return; }
  const frag=document.createDocumentFragment();
  for(const row of rows){
    const item=document.createElement('div'); item.className=`book-row ${side}`; item.style.setProperty('--depth', `${Math.max(5,Math.min(100,(row.q/Math.max(maxQty,1))*100))}%`);
    const p=document.createElement('span'); p.className='price'; p.textContent=orderPriceText(row.p);
    const s=document.createElement('span'); s.textContent=orderSizeText(row.q);
    const t=document.createElement('span'); t.className='muted'; t.textContent=orderTotalText(row.notionalTotal);
    item.append(p,s,t); frag.appendChild(item);
  }
  host.appendChild(frag);
  requestAnimationFrame(()=>{
    if(side==='ask'){
      if(state.book.askPinned||nearBest){host.scrollTop=host.scrollHeight;state.book.askPinned=true;}
      else host.scrollTop=Math.min(oldTop,Math.max(0,host.scrollHeight-host.clientHeight));
    }else{
      if(state.book.bidPinned||nearBest){host.scrollTop=0;state.book.bidPinned=true;}
      else host.scrollTop=Math.min(oldTop,Math.max(0,host.scrollHeight-host.clientHeight));
    }
  });
}
function renderOrderBook(){
  state.book.renderAt=performance.now();
  const limit=state.book.maxLevels||100;
  const askLevels=bucketBookLevels(state.book.asks,'ask').slice(0,limit);
  const bidLevels=bucketBookLevels(state.book.bids,'bid').slice(0,limit);
  const asksCalc=[]; let aTotal=0,aNotional=0; for(const l of askLevels){aTotal+=l.q;aNotional+=l.p*l.q;asksCalc.push({...l,total:aTotal,notionalTotal:aNotional});}
  const bidsCalc=[]; let bTotal=0,bNotional=0; for(const l of bidLevels){bTotal+=l.q;bNotional+=l.p*l.q;bidsCalc.push({...l,total:bTotal,notionalTotal:bNotional});}
  const askRows=asksCalc.slice().reverse();
  const bidRows=bidsCalc;
  const maxQty=Math.max(...askLevels.map(l=>l.q),...bidLevels.map(l=>l.q),1);
  renderBookRows('bookAsks',askRows,'ask',maxQty);
  renderBookRows('bookBids',bidRows,'bid',maxQty);
  const bestAsk=askLevels[0]?.p||0,bestBid=bidLevels[0]?.p||0,spread=bestAsk>0&&bestBid>0?Math.max(0,bestAsk-bestBid):0;
  if(!(state.lastPrice>0) && bestAsk>0 && bestBid>0) setText('bookLivePrice',priceText((bestAsk+bestBid)/2));
}
function mergePartialBook(current,incoming,side){
  if(!incoming.length)return current;
  if(!current.length)return incoming.slice(0,state.book.rawLimit||state.book.maxLevels);
  let farther;
  if(side==='ask'){
    const edge=incoming[incoming.length-1].p;
    farther=current.filter(l=>l.p>edge);
  }else{
    const edge=incoming[incoming.length-1].p;
    farther=current.filter(l=>l.p<edge);
  }
  const byPrice=new Map();
  for(const l of [...incoming,...farther])byPrice.set(l.p,l);
  return [...byPrice.values()].sort((a,b)=>side==='ask'?a.p-b.p:b.p-a.p).slice(0,state.book.rawLimit||state.book.maxLevels);
}
function applyBook(payload,{snapshot=false}={}){
  const rawMax=state.book.rawLimit||snapshotLimitForGrouping();
  const asks=normalizeBookSide(payload?.asks||payload?.a,false).slice(0,snapshot?rawMax:20);
  const bids=normalizeBookSide(payload?.bids||payload?.b,true).slice(0,snapshot?rawMax:20);
  if(!asks.length && !bids.length) return false;
  state.book.asks=snapshot?asks:mergePartialBook(state.book.asks,asks,'ask');
  state.book.bids=snapshot?bids:mergePartialBook(state.book.bids,bids,'bid');
  state.book.bestAsk=state.book.asks[0]?.p||0; state.book.bestBid=state.book.bids[0]?.p||0; state.book.spread=state.book.bestAsk>0&&state.book.bestBid>0?state.book.bestAsk-state.book.bestBid:0;
  state.book.lastUpdateAt=Date.now();
  queueBookRender();
  return true;
}
async function loadOrderBookSnapshot(){
  if(state.book.snapshotLoading)return false;
  state.book.snapshotLoading=true;
  let lastError=null;
  try{
    for(const base of BOOK_REST_BASES){
      try{
        const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),3500);
        const r=await fetch(`${base}/api/v3/depth?symbol=INJUSDT&limit=${state.book.rawLimit||snapshotLimitForGrouping()}`,{cache:'no-store',signal:controller.signal}); clearTimeout(timeout);
        if(!r.ok) throw new Error(`book ${r.status}`);
        const data=await r.json(); if(!applyBook(data,{snapshot:true})) throw new Error('empty book');
        bookConnection('online'); return true;
      }catch(e){lastError=e;}
    }
    if(!state.book.lastUpdateAt) bookConnection('offline');
    return false;
  }finally{state.book.snapshotLoading=false;}
}
function startBookSnapshotRefresh(){
  clearInterval(state.book.snapshotTimer);
  const every=snapshotRefreshForGrouping();
  state.book.snapshotTimer=setInterval(()=>{if(!state.stopped&&!document.hidden)void loadOrderBookSnapshot();},every);
}
function connectBook(index=state.book.endpointIndex||0){
  if(state.stopped||document.hidden) return;
  clearTimeout(state.depthReconnect); bookConnection('connecting');
  const endpointIndex=((index%BOOK_WS_ENDPOINTS.length)+BOOK_WS_ENDPOINTS.length)%BOOK_WS_ENDPOINTS.length;
  state.book.endpointIndex=endpointIndex;
  try{
    const ws=new WebSocket(BOOK_WS_ENDPOINTS[endpointIndex]); state.depthWs=ws; let gotData=false;
    const noDataTimer=setTimeout(()=>{if(!gotData&&state.depthWs===ws){try{ws.close();}catch(_){}}},4500);
    ws.onopen=()=>bookConnection('connecting');
    ws.onmessage=(e)=>{try{const d=JSON.parse(e.data);if(applyBook(d,{snapshot:false})){gotData=true;clearTimeout(noDataTimer);bookConnection('online');}}catch(_){}};
    ws.onerror=()=>{};
    ws.onclose=()=>{
      clearTimeout(noDataTimer); if(state.depthWs===ws) state.depthWs=null;
      if(state.stopped||document.hidden)return;
      bookConnection(state.book.lastUpdateAt&&Date.now()-state.book.lastUpdateAt<5000?'online':'offline');
      const next=(endpointIndex+1)%BOOK_WS_ENDPOINTS.length; state.book.endpointIndex=next;
      state.depthReconnect=setTimeout(()=>connectBook(next),900);
    };
  }catch(_){
    bookConnection('offline'); const next=(endpointIndex+1)%BOOK_WS_ENDPOINTS.length; state.book.endpointIndex=next;
    state.depthReconnect=setTimeout(()=>connectBook(next),1200);
  }
}
function startBookWatchdog(){
  clearInterval(state.book.watchdog);
  state.book.watchdog=setInterval(()=>{
    if(state.stopped||document.hidden)return;
    const stale=!state.book.lastUpdateAt||Date.now()-state.book.lastUpdateAt>5000;
    if(stale){void loadOrderBookSnapshot();if(!state.depthWs||state.depthWs.readyState>1)connectBook(state.book.endpointIndex);}
  },3000);
}
function connect(){
  if(state.stopped||document.hidden)return;clearTimeout(state.reconnect);connection('connecting');
  try{
    const ws=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@aggTrade');state.ws=ws;
    ws.onopen=()=>connection('online');
    ws.onmessage=(e)=>{try{const d=JSON.parse(e.data);const price=+d.p,time=+(d.T||d.E||Date.now());if(price>0){applyTrade(price,time);}}catch(_){}};
    ws.onerror=()=>{};
    ws.onclose=()=>{if(state.ws===ws)state.ws=null;connection('offline');if(!state.stopped&&!document.hidden)state.reconnect=setTimeout(connect,1500);};
  }catch(_){connection('offline');state.reconnect=setTimeout(connect,2000);}
}

const canvas=$('mainCanvas');
function resizeCanvas(){if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,mobile?1.7:2);const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._dpr=dpr;canvas._cssW=r.width;canvas._cssH=r.height;}}
new ResizeObserver(resizeCanvas).observe($('plot'));
resizeCanvas();

function visibleCandles(now,key,cfg){const arr=state.series[cfg.source]||[];if(!arr.length)return[];const cutoff=now-cfg.windowMs-cfg.bucketMs*3;return arr.filter(c=>c.t>=cutoff&&c.t<=now);}
function timeframeStats(candles){if(!candles.length)return null;let hi=-Infinity,lo=Infinity;for(const c of candles){hi=Math.max(hi,c.h);lo=Math.min(lo,c.l);}const open=candles[0].o,close=candles.at(-1).c,change=open>0?(close/open-1)*100:0;return{open,high:hi,low:lo,close,change};}
function computeScale(dt,key,cfg,candles){let lo=Infinity,hi=-Infinity;for(const c of candles){if(c.l<lo)lo=c.l;if(c.h>hi)hi=c.h;}const latest=candles.at(-1)?.c||state.lastPrice;if(!(lo<Infinity&&hi>0&&latest>0))return null;const floor=latest<10?.00005:.0005;const minSpan=Math.max(latest*cfg.minSpan,floor);let span=hi-lo;if(span<minSpan){const mid=(hi+lo)/2;lo=mid-minSpan/2;hi=mid+minSpan/2;span=minSpan;}const targetMin=lo-span*.12,targetMax=hi+span*.12;let sc=state.scales[key];if(!sc)sc=state.scales[key]={min:targetMin,max:targetMax};else{const aMin=1-Math.exp(-dt/(targetMin<sc.min?cfg.expand:cfg.relax));const aMax=1-Math.exp(-dt/(targetMax>sc.max?cfg.expand:cfg.relax));sc.min+=(targetMin-sc.min)*aMin;sc.max+=(targetMax-sc.max)*aMax;}lo=sc.min;hi=sc.max;span=Math.max(hi-lo,minSpan);const breath=Math.max(span*.075,minSpan*.10);if(latest<lo+breath){lo=latest-breath;sc.min=lo;}if(latest>hi-breath){hi=latest+breath;sc.max=hi;}return{min:lo,max:hi,span:Math.max(hi-lo,minSpan),latest};}
function drawGuides(ctx,left,right,top,bottom){const pw=right-left,ph=bottom-top;ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(135,165,205,.055)';for(const f of [.25,.5,.75]){const y=top+ph*f;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}ctx.strokeStyle='rgba(135,165,205,.030)';for(const f of [.2,.4,.6,.8]){const x=left+pw*f;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}ctx.restore();}
function drawRangeTags(ctx,candles,xs,toY,right,bottom){if(candles.length<4)return;let hiI=0,loI=0;for(let i=1;i<candles.length;i++){if(candles[i].h>candles[hiI].h)hiI=i;if(candles[i].l<candles[loI].l)loI=i;}ctx.save();ctx.font=`800 ${mobile?7:8}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.58);ctx.textBaseline='middle';const hx=Math.min(right-12,xs[hiI]+5),hy=Math.max(9,toY(candles[hiI].h)-8);ctx.fillText('H',hx,hy);const lx=Math.min(right-12,xs[loI]+5),ly=Math.min(bottom-5,toY(candles[loI].l)+9);ctx.fillText('L',lx,ly);ctx.restore();}
function pad2(v){return String(v).padStart(2,'0');}
function timeAxisText(ts,key){const d=new Date(ts),hh=pad2(d.getHours()),mm=pad2(d.getMinutes()),ss=pad2(d.getSeconds());if(key==='m1')return `${hh}:${mm}:${ss}`;if(['m5','m15','m30','h1'].includes(key))return `${hh}:${mm}`;if(key==='h4'||key==='d1')return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${hh}:${mm}`;if(key==='w1'||key==='mo1')return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;if(key==='y1')return d.toLocaleDateString('it-IT',{month:'short',year:'2-digit'});return d.toLocaleDateString('it-IT',{month:'short',year:'numeric'});}
function crosshairTimeText(ts,key){const d=new Date(ts);if(key==='m1')return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;if(['m5','m15','m30','h1'].includes(key))return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;const options={day:'2-digit',month:'2-digit'};if(key==='all')options.year='2-digit';if(['h4','d1','w1','mo1'].includes(key)){options.hour='2-digit';options.minute='2-digit';}return d.toLocaleString('it-IT',options);}

function drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h,now,cfg){
  const axisTop=bottom+7,axisTextY=h-(mobile?5:6),usable=Math.max(1,right-left);
  const longKey=['w1','mo1','y1','all'].includes(key);const minGap=key==='m1'?(mobile?58:72):(longKey?(mobile?64:82):(mobile?54:68));
  const wanted=Math.max(2,Math.min(mobile?5:7,Math.floor(usable/minGap)+1));
  ctx.save();ctx.strokeStyle=hexAlpha(state.colors.muted2,.13);ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(left,axisTop);ctx.lineTo(right,axisTop);ctx.stroke();ctx.font=`650 ${mobile?6.3:7.4}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;ctx.fillStyle=hexAlpha(state.colors.muted2,.54);ctx.textBaseline='alphabetic';
  for(let n=0;n<wanted;n++){const f=n/(wanted-1),x=left+usable*f,stamp=now-cfg.windowMs*(1-f),label=timeAxisText(stamp,key);ctx.strokeStyle=hexAlpha(state.colors.muted2,.18);ctx.beginPath();ctx.moveTo(x,axisTop);ctx.lineTo(x,axisTop+3);ctx.stroke();const tw=ctx.measureText(label).width,tx=Math.max(left+tw/2,Math.min(right-tw/2,x));ctx.textAlign='center';ctx.fillText(label,tx,axisTextY);}
  ctx.restore();
}
function drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span){if(!state.crosshair.active||!state.geometry||!candles.length)return;const x=Math.max(left,Math.min(right,state.crosshair.x)),y=Math.max(top,Math.min(bottom,state.crosshair.y));let idx=0,best=Infinity;for(let i=0;i<xs.length;i++){const d=Math.abs(xs[i]-x);if(d<best){best=d;idx=i;}}const candle=candles[idx],cx=xs[idx],price=min+(bottom-y)/(bottom-top)*span;ctx.save();ctx.setLineDash([3,4]);ctx.lineWidth=.75;ctx.strokeStyle=hexAlpha(state.colors.muted2,.32);ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,bottom);ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);ctx.font=`800 ${mobile?7.2:8.2}px -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif`;const tLabel=crosshairTimeText(candle.t,key),pLabel=priceText(price);ctx.textBaseline='middle';const tW=ctx.measureText(tLabel).width+12,pW=ctx.measureText(pLabel).width+12;const boxH=18;let tx=Math.max(left,Math.min(right-tW,cx-tW/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.90);ctx.strokeStyle=hexAlpha(state.colors.muted2,.22);ctx.fillRect(tx,bottom-boxH,tW,boxH);ctx.strokeRect(tx,bottom-boxH,tW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.92);ctx.textAlign='center';ctx.fillText(tLabel,tx+tW/2,bottom-boxH/2);let py=Math.max(top,Math.min(bottom-boxH,y-boxH/2));ctx.fillStyle=hexAlpha(state.colors.canvas,.92);ctx.fillRect(right-pW,py,pW,boxH);ctx.strokeRect(right-pW,py,pW,boxH);ctx.fillStyle=hexAlpha(state.colors.muted2,.95);ctx.fillText(pLabel,right-pW/2,py+boxH/2);ctx.restore();}
function updateScaleText(now,min,max,span,latest){if(now-state.scaleTextAt<100)return;state.scaleTextAt=now;setText('scaleTop',priceText(max));setText('scaleQ3',priceText(min+span*.75));setText('scaleMid',priceText(min+span*.5));setText('scaleQ1',priceText(min+span*.25));setText('scaleBottom',priceText(min));setText('scaleLive',priceText(latest));}
function updateStats(candles){const stats=timeframeStats(candles);if(!stats)return;setText('statOpen',priceText(stats.open));setText('statHigh',priceText(stats.high));setText('statLow',priceText(stats.low));setText('statChange',pctText(stats.change));setText('headerRangeChange',pctText(stats.change));setTrendClass($('statChange'),stats.change);setTrendClass($('headerRangeChange'),stats.change);const shell=$('terminalShell');shell?.classList.remove('up','down','neutral');shell?.classList.add(stats.change>0?'up':stats.change<0?'down':'neutral');}

function emaValues(values,period){
  if(!values.length)return[];const k=2/(period+1),out=new Array(values.length);let e=values[0];out[0]=e;for(let i=1;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e;}return out;
}
function rsiValues(values,period=14){
  const out=new Array(values.length).fill(NaN);if(values.length<2)return out;let avgG=0,avgL=0;for(let i=1;i<values.length;i++){const d=values[i]-values[i-1],g=Math.max(0,d),l=Math.max(0,-d);if(i<=period){avgG+=g;avgL+=l;if(i===period){avgG/=period;avgL/=period;out[i]=avgL===0?100:100-(100/(1+avgG/avgL));}}else{avgG=(avgG*(period-1)+g)/period;avgL=(avgL*(period-1)+l)/period;out[i]=avgL===0?100:100-(100/(1+avgG/avgL));}}return out;
}
function indicatorBundle(key,visible,visual){
  const cfg=ranges[key],src=(state.series[cfg.source]||[]).map(c=>({...c}));if(!src.length)return null;const last=src.at(-1);if(last&&visual>0){last.c=visual;last.h=Math.max(last.h,visual);last.l=Math.min(last.l,visual);}const closes=src.map(c=>c.c),e12=emaValues(closes,12),e26=emaValues(closes,26),e50=emaValues(closes,50),e200=emaValues(closes,200),rsi=rsiValues(closes,14),macd=e12.map((v,i)=>v-e26[i]),signal=emaValues(macd,9),hist=macd.map((v,i)=>v-signal[i]),map=new Map(src.map((c,i)=>[c.t,i]));return visible.map(c=>{const i=map.get(c.t);return i==null?null:{ema12:e12[i],ema26:e26[i],ema50:e50[i],ema200:e200[i],rsi:rsi[i],macd:macd[i],signal:signal[i],hist:hist[i]};});
}
function drawSeriesLine(ctx,xs,data,key,toY,color,alpha=.52,width=.85){ctx.save();ctx.strokeStyle=hexAlpha(color,alpha);ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let started=false;for(let i=0;i<data.length;i++){const v=data[i]?.[key];if(!Number.isFinite(v)||!Number.isFinite(xs[i]))continue;const y=toY(v);if(!started){ctx.moveTo(xs[i],y);started=true;}else ctx.lineTo(xs[i],y);}if(started)ctx.stroke();ctx.restore();}
function drawEmaOverlay(ctx,xs,bundle,toY){if(!state.indicatorsOn||!bundle)return;drawSeriesLine(ctx,xs,bundle,'ema200',toY,state.colors.ema200,.25,mobile?.65:.8);drawSeriesLine(ctx,xs,bundle,'ema50',toY,state.colors.ema50,.34,mobile?.68:.85);drawSeriesLine(ctx,xs,bundle,'ema26',toY,state.colors.ema26,.42,mobile?.72:.9);drawSeriesLine(ctx,xs,bundle,'ema12',toY,state.colors.ema12,.50,mobile?.75:.95);}
const rsiCanvas=$('rsiCanvas'),macdCanvas=$('macdCanvas');
function resizeAuxCanvas(canvas){if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,mobile?1.25:1.45),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._dpr=dpr;canvas._cssW=r.width;canvas._cssH=r.height;}}
function auxContext(canvas){resizeAuxCanvas(canvas);const ctx=canvas?.getContext('2d');if(!ctx)return null;const dpr=canvas._dpr||1,w=canvas._cssW||canvas.clientWidth,h=canvas._cssH||canvas.clientHeight;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return{ctx,w,h};}
function drawRsiPanel(xs,bundle){const out=auxContext(rsiCanvas);if(!out||!bundle)return;const{ctx,w,h}=out,left=mobile?9:13,right=w-(mobile?8:12),top=5,bottom=h-5,toY=v=>top+(100-v)/100*(bottom-top);ctx.save();for(const level of [70,50,30]){ctx.strokeStyle=hexAlpha(state.colors.muted2,level===50?.12:.18);ctx.lineWidth=.7;ctx.setLineDash(level===50?[2,4]:[4,4]);ctx.beginPath();ctx.moveTo(left,toY(level));ctx.lineTo(right,toY(level));ctx.stroke();}ctx.setLineDash([]);ctx.restore();drawSeriesLine(ctx,xs,bundle,'rsi',toY,state.colors.accent,.62,mobile?.8:1);const last=[...bundle].reverse().find(v=>Number.isFinite(v?.rsi));setText('rsiValue',last?last.rsi.toFixed(1):'—');}
function drawMacdPanel(xs,bundle){const out=auxContext(macdCanvas);if(!out||!bundle)return;const{ctx,w,h}=out,left=mobile?9:13,right=w-(mobile?8:12),top=7,bottom=h-6,vals=bundle.flatMap(v=>v?[v.macd,v.signal,v.hist]:[]).filter(Number.isFinite),maxAbs=Math.max(...vals.map(Math.abs),1e-8),mid=(top+bottom)/2,toY=v=>mid-(v/maxAbs)*(bottom-top)*.42;ctx.save();ctx.strokeStyle=hexAlpha(state.colors.muted2,.16);ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(left,mid);ctx.lineTo(right,mid);ctx.stroke();const approxStep=xs.length>1?Math.abs(xs[1]-xs[0]):5,barW=Math.max(1,Math.min(7,approxStep*.55));for(let i=0;i<bundle.length;i++){const v=bundle[i]?.hist;if(!Number.isFinite(v)||!Number.isFinite(xs[i]))continue;const y=toY(v),color=v>=0?state.colors.up:state.colors.down;ctx.fillStyle=hexAlpha(color,.38);ctx.fillRect(xs[i]-barW/2,Math.min(mid,y),barW,Math.max(1,Math.abs(y-mid)));}ctx.restore();drawSeriesLine(ctx,xs,bundle,'macd',toY,state.colors.ema12,.70,mobile?.75:.95);drawSeriesLine(ctx,xs,bundle,'signal',toY,state.colors.ema26,.64,mobile?.75:.95);const last=[...bundle].reverse().find(v=>Number.isFinite(v?.macd));setText('macdValue',last?`${last.macd>=0?'+':''}${last.macd.toFixed(4)}`:'—');}
function setIndicators(on){state.indicatorsOn=!!on;try{localStorage.setItem('inj_node_indicators',state.indicatorsOn?'1':'0');}catch(_){}const page=$('livePage');page?.classList.toggle('indicators-off',!state.indicatorsOn);$('indicatorToggle')?.setAttribute('aria-pressed',String(state.indicatorsOn));requestAnimationFrame(()=>{resizeCanvas();resizeAuxCanvas(rsiCanvas);resizeAuxCanvas(macdCanvas);});}
function drawActive(now,dt,ts){
  const key=state.active,cfg=ranges[key];if(!cfg||!state.loaded[cfg.source])return;
  const visible=visibleCandles(now,key,cfg);if(!visible.length)return;
  // Keep the extra candles needed to physically travel beyond the left viewport edge.
  const rawCandles=visible;
  const visual=state.visualPrice>0?state.visualPrice:(state.lastPrice>0?state.lastPrice:rawCandles.at(-1).c);const candles=rawCandles.slice(),rawLast=candles.at(-1);if(rawLast&&visual>0)candles[candles.length-1]={...rawLast,c:visual,h:Math.max(rawLast.h,visual),l:Math.min(rawLast.l,visual)};
  const ctx=canvas?.getContext('2d');if(!ctx)return;resizeCanvas();const dpr=canvas._dpr||1,w=canvas._cssW||canvas.clientWidth,h=canvas._cssH||canvas.clientHeight;if(w<2||h<2)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const scale=computeScale(dt,key,cfg,candles);if(!scale)return;const{min,max,span,latest}=scale;const axisH=mobile?19:22,left=mobile?9:13,right=w-(mobile?8:12),top=mobile?9:12,bottom=h-axisH-8,plotH=Math.max(1,bottom-top),plotW=Math.max(1,right-left),toY=(p)=>bottom-Math.max(0,Math.min(1,(p-min)/span))*plotH;
  state.geometry={left,right,top,bottom,min,max,span};drawGuides(ctx,left,right,top,bottom);
  const count=candles.length,step=plotW/Math.max(1,cfg.expected);
  const smoothFlow=!!cfg.smooth;
  // Time-anchored X position: every candle moves continuously and is removed only after its body clears the left edge.
  const bodyRatio=mobile?(smoothFlow?.68:.64):(smoothFlow?.76:.70);
  const bodyW=Math.max(mobile?2.6:2.2,Math.min(mobile?9:48,step*bodyRatio)),xs=[];
  const enterElapsed=Math.max(0,ts-(state.rangeEnterAt||0));
  const bundle=state.indicatorsOn?indicatorBundle(key,candles,visual):null;
  for(let i=0;i<count;i++){
    const c=candles[i];
    let x;
    if(smoothFlow){x=right-step*(.5+(now-c.t)/cfg.bucketMs);}
    else{x=right-step*(count-i-.5);}
    xs.push(x);
    const up=c.c>=c.o,color=up?state.colors.up:state.colors.down,yO=toY(c.o),rawYH=toY(c.h),rawYL=toY(c.l),rawYC=toY(c.c),isLast=i===count-1;
    if(x+bodyW/2<left||x-bodyW/2>right)continue;
    // Opening animation: wick and body stretch naturally away from OPEN, without altering actual data or scale.
    const stagger=Math.min(130,(i/Math.max(1,count-1))*130),q=Math.max(0,Math.min(1,(enterElapsed-stagger)/430)),grow=1-Math.pow(1-q,3);
    const yH=yO+(rawYH-yO)*grow,yL=yO+(rawYL-yO)*grow,yC=yO+(rawYC-yO)*grow;
    ctx.save();ctx.strokeStyle=hexAlpha(color,isLast?.99:.88);ctx.lineWidth=isLast?1.25:1;ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,yL);ctx.stroke();let by=Math.min(yO,yC),bh=Math.abs(yC-yO);if(bh<1.8){by=(yO+yC)/2-.9;bh=1.8;}ctx.fillStyle=hexAlpha(color,isLast?.99:.94);ctx.fillRect(x-bodyW/2,by,bodyW,bh);if(isLast){ctx.strokeStyle=hexAlpha(color,.99);ctx.lineWidth=.65;ctx.strokeRect(x-bodyW/2-.25,by-.25,bodyW+.5,bh+.5);}ctx.restore();
  }
  drawEmaOverlay(ctx,xs,bundle,toY);
  drawRangeTags(ctx,candles,xs,toY,right,bottom);drawTimeAxis(ctx,key,candles,xs,left,right,bottom,h,now,cfg);
  // v15.98.64 — Price Pulse Halo + micro Edge Tick on the active candle.
  // The marker sits on the true live close, follows it vertically and uses the latest tick direction.
  const last=candles.at(-1),lastX=xs.at(-1),yO=toY(last.o),rawLastYC=toY(last.c),bullish=last.c>=last.o;
  const lastStagger=Math.min(130,130),lastQ=Math.max(0,Math.min(1,(enterElapsed-lastStagger)/430)),lastGrow=1-Math.pow(1-lastQ,3),yC=yO+(rawLastYC-yO)*lastGrow;
  const flash=Math.max(0,Math.min(1,(state.flashUntil-ts)/560));
  const signalDir=state.lastTickDir||(bullish?1:-1),signalColor=signalDir>=0?state.colors.up:state.colors.down;
  const anchorY=Math.max(top+1,Math.min(bottom-1,yC));
  const tickStart=lastX+bodyW/2+1.1,tickLen=Math.max(4.5,Math.min(8.5,bodyW*.82)),tickEnd=Math.min(right-1,tickStart+tickLen);
  ctx.save();
  if(flash>0){
    const phase=1-flash,haloRadius=Math.max(3.2,bodyW*.62)+phase*7.5;
    ctx.strokeStyle=hexAlpha(signalColor,.10+flash*.28);ctx.lineWidth=.8+flash*.8;
    ctx.shadowColor=hexAlpha(signalColor,.26+flash*.26);ctx.shadowBlur=3+flash*7;
    ctx.beginPath();ctx.arc(lastX,anchorY,haloRadius,0,Math.PI*2);ctx.stroke();
  }
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=hexAlpha(signalColor,.76+flash*.24);ctx.lineWidth=1.35+flash*.55;
  if(flash>0){ctx.shadowColor=hexAlpha(signalColor,.20+flash*.30);ctx.shadowBlur=2+flash*4;}
  ctx.beginPath();ctx.moveTo(tickStart,anchorY);ctx.lineTo(tickEnd,anchorY);ctx.lineTo(tickEnd,anchorY+(signalDir>=0?-2.1:2.1));ctx.stroke();
  ctx.restore();
  // Consistent small circular live endpoint for every viewport.
  const endpointPulse=(Math.sin(ts/210)+1)/2;
  ctx.save();ctx.fillStyle=hexAlpha(signalColor,.72+endpointPulse*.28);ctx.shadowColor=hexAlpha(signalColor,.38+endpointPulse*.28);ctx.shadowBlur=3+endpointPulse*5;
  ctx.beginPath();ctx.arc(lastX,anchorY,2.25+endpointPulse*.45,0,Math.PI*2);ctx.fill();ctx.restore();
  if(state.indicatorsOn&&bundle&&ts-state.indicatorRenderAt>70){state.indicatorRenderAt=ts;drawRsiPanel(xs,bundle);drawMacdPanel(xs,bundle);}
  drawCrosshair(ctx,key,candles,xs,left,right,top,bottom,min,span);
  updateScaleText(now,min,max,span,latest);updateStats(candles);const marker=$('scaleMarker');if(marker){const pct=100-Math.max(0,Math.min(1,(latest-min)/span))*100;marker.style.top=Math.max(5,Math.min(95,pct))+'%';}
}

function setMoreOpen(open){const wrap=$('moreTimeframesToggle')?.closest('.timeframe-more-wrap');wrap?.classList.toggle('open',!!open);$('moreTimeframesToggle')?.setAttribute('aria-expanded',String(!!open));$('moreTimeframesMenu')?.setAttribute('aria-hidden',String(!open));}
function selectRange(key){if(!ranges[key])return;setMoreOpen(false);const extra=['m30','mo1','y1','all'];$('moreTimeframesToggle')?.classList.toggle('active',extra.includes(key));if(key===state.active)return;state.active=key;state.crosshair.active=false;state.rangeEnterAt=performance.now();try{localStorage.setItem('inj_node_live_chart_range',key);}catch(_){}document.querySelectorAll('.timeframe,.timeframe-more-option').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===key));setText('activeRangeLabel',ranges[key].label);setText('watermarkRange',ranges[key].label);setText('footerRange',ranges[key].label);$('terminalShell')?.setAttribute('data-range-key',key);state.scaleTextAt=0;state.indicatorRenderAt=0;if(state.loaded[ranges[key].source])setLoading('done');else{setLoading('sync');void ensureHistory(key);}}

document.querySelectorAll('.timeframe,.timeframe-more-option').forEach(btn=>btn.addEventListener('click',()=>selectRange(btn.dataset.range)));
function pointerPosition(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
const crosshairPointerInside=(e)=>{if(!canvas)return false;const r=canvas.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;};
canvas?.addEventListener('pointerdown',(e)=>{const p=pointerPosition(e);state.crosshair={active:true,x:p.x,y:p.y};if(e.pointerType!=='mouse')canvas.setPointerCapture?.(e.pointerId);});
canvas?.addEventListener('pointermove',(e)=>{if(!crosshairPointerInside(e)){state.crosshair.active=false;try{if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture?.(e.pointerId);}catch(_){}return;}const p=pointerPosition(e);if(e.pointerType==='mouse'||state.crosshair.active){state.crosshair={active:true,x:p.x,y:p.y};if(e.pointerType!=='mouse'&&e.cancelable)e.preventDefault();}}, {passive:false});
canvas?.addEventListener('pointerup',(e)=>{state.crosshair.active=false;try{if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture?.(e.pointerId);}catch(_){}});
canvas?.addEventListener('pointercancel',(e)=>{state.crosshair.active=false;try{if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture?.(e.pointerId);}catch(_){}});
canvas?.addEventListener('pointerleave',()=>{state.crosshair.active=false;});

const focusExit=document.createElement('button');focusExit.className='focus-exit';focusExit.type='button';focusExit.textContent='EXIT FOCUS';document.body.appendChild(focusExit);
function setFocus(on){$('livePage')?.classList.toggle('focus-mode',on);$('focusToggle')?.setAttribute('aria-pressed',String(on));requestAnimationFrame(resizeCanvas);}
$('focusToggle')?.addEventListener('click',()=>setFocus(!$('livePage')?.classList.contains('focus-mode')));focusExit.addEventListener('click',()=>setFocus(false));
$('orderBookToggle')?.addEventListener('click',()=>setBookOpen(!state.book.open));
$('bookGrouping')?.addEventListener('change',(e)=>setBookGrouping(e.currentTarget.value));
$('orderBookBackdrop')?.addEventListener('click',()=>setBookOpen(false));
$('bookAsks')?.addEventListener('scroll',(e)=>{const el=e.currentTarget;state.book.askPinned=(el.scrollHeight-el.clientHeight-el.scrollTop)<28;},{passive:true});
$('bookBids')?.addEventListener('scroll',(e)=>{state.book.bidPinned=e.currentTarget.scrollTop<28;},{passive:true});
$('indicatorToggle')?.addEventListener('click',()=>setIndicators(!state.indicatorsOn));
$('moreTimeframesToggle')?.addEventListener('click',(e)=>{e.stopPropagation();const wrap=e.currentTarget.closest('.timeframe-more-wrap');setMoreOpen(!wrap?.classList.contains('open'));});
document.addEventListener('click',(e)=>{if(!e.target?.closest?.('.timeframe-more-wrap'))setMoreOpen(false);});

function frame(ts){state.raf=0;if(document.hidden||state.stopped)return;if(ts-state.lastFrame<minFrameMs){state.raf=requestAnimationFrame(frame);return;}const dt=Math.max(8,Math.min(80,ts-(state.lastFrame||ts-minFrameMs)));state.lastFrame=ts;const target=state.targetPrice>0?state.targetPrice:state.lastPrice;if(target>0){if(!(state.visualPrice>0))state.visualPrice=target;const delta=target-state.visualPrice;state.visualPrice+=delta*(1-Math.exp(-dt/38));if(Math.abs(target-state.visualPrice)<Math.max(.0000005,target*1e-8))state.visualPrice=target;setText('headerLivePrice',priceText(state.visualPrice));drawActive(Date.now(),dt,ts);}if(state.lastTickAt){const age=Date.now()-state.lastTickAt;setText('lastTickText',age<1100?'NOW':age<60000?`${Math.floor(age/1000)}s`:`${Math.floor(age/60000)}m`);}state.raf=requestAnimationFrame(frame);}
function start(){if(!state.raf&&!document.hidden&&!state.stopped)state.raf=requestAnimationFrame(frame);}
function stop(){state.stopped=true;if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;clearTimeout(state.reconnect);clearTimeout(state.depthReconnect);clearInterval(state.book.watchdog);clearInterval(state.book.snapshotTimer);state.book.watchdog=0;state.book.snapshotTimer=0;if(state.book.timer){clearTimeout(state.book.timer);state.book.timer=0;}if(state.book.priceFlashTimer){clearTimeout(state.book.priceFlashTimer);state.book.priceFlashTimer=0;}try{state.ws?.close();}catch(_){}try{state.depthWs?.close();}catch(_){}state.ws=null;state.depthWs=null;}

function returnHomeInstant(){
  stop();
  let fromHome=false;
  try{fromHome=sessionStorage.getItem('inj_node_livecharts_from_home')==='1';sessionStorage.removeItem('inj_node_livecharts_from_home');}catch(_){}
  const sameOriginRef=(()=>{try{return !!document.referrer&&new URL(document.referrer).origin===location.origin;}catch(_){return false;}})();
  if((fromHome||sameOriginRef)&&history.length>1){history.back();return;}
  location.replace('./index.html?v=15.99.9');
}
$('liveChartsBack')?.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();returnHomeInstant();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;try{state.ws?.close();}catch(_){}}else if(!state.stopped){start();connect();}});

colors();
window.addEventListener('load',()=>{colors();},{once:true});
window.addEventListener('pageshow',()=>{colors();});
document.querySelectorAll('.timeframe,.timeframe-more-option').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===state.active));
setText('activeRangeLabel',ranges[state.active].label);setText('watermarkRange',ranges[state.active].label);setText('footerRange',ranges[state.active].label);
setIndicators(state.indicatorsOn);$('moreTimeframesToggle')?.classList.toggle('active',['m30','mo1','y1','all'].includes(state.active));
start();connect();void primeHistories();
