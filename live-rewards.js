'use strict';

const $ = (id) => document.getElementById(id);
const INJ_DECIMALS = 1e18;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const REWARD_REFRESH_MS = 5000;
const REWARD_COMPARE_TOLERANCE = 2e-8;
const STATUS_REFRESH_MS = 30000;
const CLAIM_DROP_EPSILON = 1e-9;
const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];
const MANAGED_ADDRESSES = Object.freeze([
  'inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv',
  'inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu',
  'inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9',
  'inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q',
  'inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'
]);
const LABELS_KEY = 'inj_node_treasury_wallet_labels_v1';
const SAVED_WALLETS_KEY = 'inj_monitor_wallets_v1';
const VALIDATOR_COMMISSION_CACHE_MS = 120000;
const validatorCommissionCache = new Map();

const state = {
  rows: MANAGED_ADDRESSES.map((address, index) => ({
    address, index, label:`Wallet ${index + 1}`,
    staked:0,
    apr:0,
    validatorCount:0,
    aprVerified:false,
    confirmedReward:0,
    displayedReward:0,
    displayFrom:0,
    displayTo:0,
    displayStartedAt:0,
    displayDuration:REWARD_REFRESH_MS-350,
    ratePerMs:0,
    lastNetworkReward:0,
    lastNetworkAt:0,
    online:false,
    synced:false,
    confidence:'sync'
  })),
  apr: 0,
  price: 0,
  eurRate: 0.86,
  currency: 'USD',
  rewardLoading: false,
  statusLoading: false,
  lastSync: 0,
  lastStatusSync: 0,
  socket: null,
  reconnectTimer: 0,
  editorAddress: ''
};

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const fromWei = (value) => number(value) / INJ_DECIMALS;
const shortAddress = (address) => address ? `${address.slice(0,9)}…${address.slice(-7)}` : '—';
const lang = () => { try { return localStorage.getItem('inj_node_language_v1') === 'en' ? 'en' : 'it'; } catch (_) { return 'it'; } };
const copy = (it, en) => lang() === 'en' ? en : it;
const formatInj = (value, digits = 8) => number(value).toLocaleString(lang()==='en'?'en-US':'it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true});
const formatRate = (value, digits = 6) => number(value).toLocaleString(lang()==='en'?'en-US':'it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true});

function smartMoney(value,currency) {
  const valid=number(value);
  const abs=Math.abs(valid);
  const digits=abs===0?2:(abs>=1?2:(abs>=0.01?4:6));
  return valid.toLocaleString(lang()==='en'?'en-US':'it-IT',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits});
}
function money(value) {
  const usd=Math.max(0,number(value));
  if(state.currency==='EUR'){
    const eur=usd*Math.max(0,number(state.eurRate)||0);
    return smartMoney(eur,'EUR');
  }
  return smartMoney(usd,'USD');
}
function fiatFromInj(inj){
  if(!(state.price>0))return '—';
  const usd=Math.max(0,number(inj))*state.price;
  return money(usd);
}
function updateHeaderPrice(){
  const node=$('rewardsHeaderPrice');
  if(!node||!(state.price>0))return;
  if(state.currency==='EUR'){
    const rate=Math.max(0,number(state.eurRate)||0);
    if(!(rate>0)){node.textContent='INJ —';return;}
    const eur=state.price*rate;
    node.textContent=`INJ €${eur.toFixed(eur<10?4:3)}`;
  }else{
    node.textContent=`INJ $${state.price.toFixed(state.price<10?4:3)}`;
  }
}
function formatStaked(value){
  return number(value).toLocaleString(lang()==='en'?'en-US':'it-IT',{minimumFractionDigits:0,maximumFractionDigits:2,useGrouping:true});
}
function currentReward(row, now = Date.now()) {
  // Il primo dato mostrato e' SEMPRE l'ultimo reward verificato on-chain.
  // Tra due conferme il contatore continua a crescere senza pause usando
  // esclusivamente il ritmo teorico del wallet: INJ in staking × APR rete.
  if(!row.synced) return NaN;
  const anchor=Math.max(0,number(row.confirmedReward));
  const anchorAt=number(row.lastNetworkAt);
  const elapsed=anchorAt>0?Math.max(0,now-anchorAt):0;
  const rate=Math.max(0,number(row.ratePerMs));
  return Math.max(0,anchor + rate*elapsed);
}
function currentTotal() {
  const now=Date.now();
  return state.rows.reduce((sum,row)=>sum + currentReward(row,now),0);
}
function totalDailyRate() { return state.rows.reduce((sum,row)=>sum + Math.max(0,row.ratePerMs) * 86400000,0); }

function readLabels() {
  const matched = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_WALLETS_KEY) || '[]');
    for (const item of Array.isArray(saved)?saved:[]) {
      const address=String(item?.address||'').toLowerCase();
      const label=String(item?.label||'').trim();
      if(address&&label) matched.set(address,label.slice(0,28));
    }
  } catch (_) {}
  try {
    const custom = JSON.parse(localStorage.getItem(LABELS_KEY) || '{}');
    if(custom&&typeof custom==='object') for(const [address,label] of Object.entries(custom)) if(String(label||'').trim()) matched.set(address.toLowerCase(),String(label).trim().slice(0,28));
  } catch (_) {}
  state.rows.forEach((row,index)=>{row.label=matched.get(row.address) || `Wallet ${index+1}`;});
}
function saveLabel(address,label) {
  const clean=String(label||'').trim().slice(0,28);
  if(!clean)return;
  try {
    const map=JSON.parse(localStorage.getItem(LABELS_KEY)||'{}');
    map[address]=clean;
    localStorage.setItem(LABELS_KEY,JSON.stringify(map));
  } catch (_) {}
  try {
    const saved=JSON.parse(localStorage.getItem(SAVED_WALLETS_KEY)||'[]');
    if(Array.isArray(saved)){
      const wallet=saved.find((item)=>String(item?.address||'').toLowerCase()===address);
      if(wallet){wallet.label=clean;localStorage.setItem(SAVED_WALLETS_KEY,JSON.stringify(saved));}
    }
  } catch (_) {}
  const row=state.rows.find((item)=>item.address===address);if(row)row.label=clean;
  renderRows();
}

function renderRows() {
  const host=$('rewardsList');if(!host)return;
  const existing=new Map(Array.from(host.children).map((node)=>[node.dataset.address,node]));
  state.rows.forEach((row,index)=>{
    let node=existing.get(row.address);
    if(!node){
      node=document.createElement('article');node.className='reward-row';node.dataset.address=row.address;
      node.innerHTML=`
        <div class="reward-wallet">
          <div class="reward-wallet-index">${String(index+1).padStart(2,'0')}</div>
          <div class="reward-wallet-copy"><strong data-wallet-name></strong><small>${shortAddress(row.address)}</small></div>
          <button class="reward-edit" type="button" aria-label="Rinomina wallet" title="Rinomina wallet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button>
        </div>
        <div class="reward-card-content">
          <div class="reward-card-livehead"><span>REWARD LIVE</span><span class="row-live"><i></i><b>LIVE</b></span></div>
          <div class="reward-live-number">
            <strong data-reward>—</strong>
            <div class="reward-fiat-pair" data-fiat>—</div>
          </div>
          <div class="reward-flow reward-runway-live" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
        </div>
        <div class="reward-card-stats">
          <div><span>24H</span><strong data-rate>—</strong></div>
          <div><span>STAKING</span><strong data-staked>—</strong></div>
          <div><span>APR</span><strong data-apr>—</strong></div>
        </div>`;
      node.querySelector('.reward-edit')?.addEventListener('click',()=>openEditor(row.address));
      host.appendChild(node);
    }
    existing.delete(row.address);
    node.classList.toggle('offline',!row.online);
    const name=node.querySelector('[data-wallet-name]');if(name)name.textContent=row.label;
    const rate=node.querySelector('[data-rate]');if(rate)rate.textContent=`${formatRate(row.ratePerMs*86400000,6)} INJ`;
    const staked=node.querySelector('[data-staked]');if(staked)staked.textContent=row.staked>0?`${formatStaked(row.staked)} INJ`:'—';
    const apr=node.querySelector('[data-apr]');if(apr)apr.textContent=row.apr>0?`${row.apr.toFixed(3)}%`:'—';
    const live=node.querySelector('.row-live b');if(live)live.textContent=row.synced?(row.confidence==='hold'?copy('VERIFICA','VERIFY'):'ON-CHAIN'):copy('SYNC','SYNC');
  });
  existing.forEach((node)=>node.remove());
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

function setRewardLiveText(element, text, value) {
  if (!element) return;
  // v15.99.118: Live Rewards stays visually calm. The live line/dot carries
  // the motion; numeric values no longer flash green/red on every accrual tick.
  if (element.textContent !== text) element.textContent = text;
  clearTimeout(element._directionTimer);
  element._directionTimer = null;
  element._directionCooldown = 0;
  delete element.dataset.liveDirection;
  element.style.removeProperty('color');
  element.classList.remove('value-change-up','value-change-down','entry-value-up','entry-value-down','focus-value-up','focus-value-down');
  element._rewardNumeric=value;
}
let lastFramePaint = 0;
function renderFrame(frameNow = 0) {
  requestAnimationFrame(renderFrame);
  if (frameNow - lastFramePaint < 50) return;
  lastFramePaint = frameNow;
  const wallNow=Date.now();
  let total=0;
  let syncedCount=0;
  state.rows.forEach((row)=>{
    const value=currentReward(row,wallNow);
    const node=document.querySelector(`.reward-row[data-address="${row.address}"]`);
    const target=node?.querySelector('[data-reward]');
    const fiat=node?.querySelector('[data-fiat]');
    if(Number.isFinite(value)){
      total+=value; syncedCount++;
      setRewardLiveText(target,`${formatInj(value,8)} INJ`,value);
      setRewardLiveText(fiat,fiatFromInj(value),value*state.price);
    }else{
      setRewardLiveText(target,'—',NaN);
      setRewardLiveText(fiat,'—',NaN);
    }
  });
  setRewardLiveText($('rewardsTotal'),syncedCount?formatInj(total,8):'—',syncedCount?total:NaN);
  setRewardLiveText($('rewardsTotalFiat'),syncedCount?fiatFromInj(total):'—',syncedCount?total*state.price:NaN);
  if($('rewardsTotalDay'))$('rewardsTotalDay').textContent=`${formatRate(totalDailyRate(),6)} INJ`;
  const totalStaked=state.rows.reduce((sum,row)=>sum+Math.max(0,number(row.staked)),0);
  if($('rewardsTotalStaked'))$('rewardsTotalStaked').textContent=totalStaked>0?`${formatStaked(totalStaked)} INJ`:'—';
  const weightedAprNumerator=state.rows.reduce((sum,row)=>sum + Math.max(0,number(row.staked))*Math.max(0,number(row.apr)),0);
  const weightedApr=totalStaked>0?weightedAprNumerator/totalStaked:0;
  if($('rewardsApr'))$('rewardsApr').textContent=weightedApr>0?`${weightedApr.toFixed(3)}%`:'—';
}
async function fetchJson(url,timeout=7000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}finally{clearTimeout(timer)}}
async function lcd(path){let lastError;for(const base of LCD_ENDPOINTS){try{return await fetchJson(base+path)}catch(error){lastError=error}}throw lastError||new Error('Injective unavailable')}
function delegationTotal(data){return (data?.delegation_responses||[]).reduce((sum,row)=>sum+fromWei(row?.balance?.amount),0)}
function rewardTotal(data){return (data?.total||[]).filter((coin)=>coin?.denom==='inj').reduce((sum,coin)=>sum+fromWei(coin.amount),0)}
function aprPercent(value){const n=number(value);if(n<=0)return 0;return n<=1?n*100:n}
async function loadApr(){try{const data=await fetchJson(OFFICIAL_APR_ENDPOINT,7000);return aprPercent(data?.apr)}catch(_){return state.apr}}
async function rewardFromEndpoint(base,address){
  const path=`/cosmos/distribution/v1beta1/delegators/${address}/rewards`;
  const data=await fetchJson(base+path,6500);
  const value=rewardTotal(data);
  if(!Number.isFinite(value)||value<0)throw new Error('Invalid reward');
  return value;
}
function rewardTolerance(row,a,b){
  const elapsed=Math.max(REWARD_REFRESH_MS, Date.now()-(row.lastNetworkAt||Date.now()));
  const modelDrift=Math.max(0,row.ratePerMs)*elapsed*4;
  const magnitude=Math.max(Math.abs(a),Math.abs(b));
  return Math.max(REWARD_COMPARE_TOLERANCE,modelDrift,magnitude*1e-8);
}
function closestPairMedian(values){
  const sorted=[...values].sort((a,b)=>a-b);
  if(sorted.length<3)return sorted[sorted.length-1];
  const d01=Math.abs(sorted[1]-sorted[0]);
  const d12=Math.abs(sorted[2]-sorted[1]);
  // Se due nodi sono chiaramente più vicini tra loro, usa la loro media;
  // altrimenti la mediana evita sia spike che letture stale estreme.
  if(d01<d12*.45)return (sorted[0]+sorted[1])/2;
  if(d12<d01*.45)return (sorted[1]+sorted[2])/2;
  return sorted[1];
}
async function loadPendingRewardConfirmed(address,row){
  // v15.99.131 — Live Reward must become usable as soon as one healthy
  // Injective LCD answers. Do not wait for every public endpoint.
  const endpoints = LCD_ENDPOINTS.filter(Boolean);
  const path = `/cosmos/distribution/v1beta1/delegators/${address}/rewards`;

  const read = async (base) => {
    const data = await fetchJson(base + path, 4500);
    const value = rewardTotal(data);
    if(!Number.isFinite(value) || value < 0) throw new Error('Invalid reward');
    return value;
  };

  // Promise.any is intentional here: a failed/slow public LCD must never
  // keep the whole Live Reward page in SYNC. One valid LCD is sufficient.
  const attempts = endpoints.map((base) => read(base));
  let firstValue;
  try {
    firstValue = await Promise.any(attempts);
  } catch (_) {
    throw new Error('Reward endpoints unavailable');
  }

  // Normal growth (and the first ever read) is accepted immediately.
  if(!row.synced || firstValue >= row.confirmedReward - rewardTolerance(row, firstValue, row.confirmedReward)) {
    return { address, rewards: firstValue, confidence: 'verified' };
  }

  // A lower value can be a real claim. Confirm the drop with the primary
  // Injective LCD only; this is a safety check, not a loading prerequisite.
  try {
    const primary = endpoints.find((base) => base === 'https://lcd.injective.network') || endpoints[0];
    const confirmed = await read(primary);
    if(
      confirmed < row.confirmedReward &&
      Math.abs(confirmed - firstValue) <= rewardTolerance(row, confirmed, firstValue)
    ) {
      return { address, rewards: Math.max(firstValue, confirmed), confidence: 'double' };
    }
  } catch (_) {}

  // Never reset the live counter because one node is stale.
  return { address, rewards: row.confirmedReward, confidence: 'hold' };
}

function commissionPercentFromValidator(data){
  const raw=number(data?.validator?.commission?.commission_rates?.rate);
  if(!Number.isFinite(raw)||raw<0)return NaN;
  // Cosmos SDK espone la commissione come decimale: 0.10 = 10%.
  return Math.min(100, raw<=1 ? raw*100 : raw);
}
async function validatorCommissionPercent(validatorAddress){
  const cached=validatorCommissionCache.get(validatorAddress);
  const now=Date.now();
  if(cached&&now-cached.at<VALIDATOR_COMMISSION_CACHE_MS)return cached.value;
  const data=await lcd(`/cosmos/staking/v1beta1/validators/${validatorAddress}`);
  const value=commissionPercentFromValidator(data);
  if(!Number.isFinite(value))throw new Error('Validator commission unavailable');
  validatorCommissionCache.set(validatorAddress,{value,at:now});
  return value;
}
async function loadDelegation(address,networkApr){
  const data=await lcd(`/cosmos/staking/v1beta1/delegations/${address}`);
  const delegations=Array.isArray(data?.delegation_responses)?data.delegation_responses:[];
  const rows=delegations.map((entry)=>({
    validator:String(entry?.delegation?.validator_address||''),
    amount:fromWei(entry?.balance?.amount)
  })).filter((entry)=>entry.validator&&entry.amount>0);
  const staked=rows.reduce((sum,entry)=>sum+entry.amount,0);
  if(!(staked>0))return {address,staked:0,apr:0,validatorCount:0,aprVerified:true};

  const details=await Promise.all(rows.map(async(entry)=>{
    const commission=await validatorCommissionPercent(entry.validator);
    const effectiveApr=Math.max(0,number(networkApr)) * Math.max(0,1-commission/100);
    return {...entry,commission,effectiveApr};
  }));
  const weightedApr=details.reduce((sum,entry)=>sum+entry.amount*entry.effectiveApr,0)/staked;
  return {address,staked,apr:weightedApr,validatorCount:details.length,aprVerified:true};
}

/*
  Questa pagina legge SOLO i reward staking pendenti dal modulo distribution.
  Il saldo INJ disponibile/spendibile del wallet non viene mai interrogato né sommato.
*/
async function syncRewardFlow(force=false){
  if(state.rewardLoading)return;
  if(!force&&state.lastSync&&Date.now()-state.lastSync<REWARD_REFRESH_MS-700)return;
  state.rewardLoading=true;
  $('rewardsLiveBadge')?.classList.add('sync');
  $('rewardsLiveBadge')?.classList.remove('error');
  let liveCount=0;
  try{
    // Ogni wallet viene applicato appena la sua lettura on-chain risponde.
    // Non aspettiamo il wallet più lento per mostrare quelli già verificati.
    await Promise.all(state.rows.map(async(row)=>{
      try{
        const entry=await loadPendingRewardConfirmed(row.address,row);
        const now=Date.now();
        const networkReward=Math.max(0,number(entry.rewards));
        const previous=row.confirmedReward;
        const claimDetected=row.synced && networkReward + CLAIM_DROP_EPSILON < previous;

        row.confirmedReward=networkReward;
        row.lastNetworkReward=networkReward;
        row.lastNetworkAt=now;
        row.displayedReward=networkReward;
        if(claimDetected) row.displayedReward=networkReward;
        row.online=true;
        row.synced=true;
        row.confidence=entry.confidence||'verified';
        liveCount++;
        state.lastSync=now;
        if($('rewardsUpdated'))$('rewardsUpdated').textContent=`${copy('Dato on-chain verificato','Verified on-chain')} · ${new Date(now).toLocaleTimeString(lang()==='en'?'en-US':'it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
        if($('rewardsWalletStatus'))$('rewardsWalletStatus').textContent=`${state.rows.filter(r=>r.synced).length}/5 LIVE`;
        $('rewardsLiveBadge')?.classList.remove('sync','error');
        renderRows();
      }catch(_){
        // Non sostituire mai un dato valido con una lettura dubbia.
        row.online=row.synced;
        row.confidence='hold';
      }
    }));

    if(!liveCount && !state.rows.some(row=>row.synced))throw new Error('No wallets live');
    state.lastSync=state.lastSync||Date.now();
    if(state.rows.some(row=>row.synced)){
      $('rewardsLiveBadge')?.classList.remove('sync','error');
      if($('rewardsWalletStatus'))$('rewardsWalletStatus').textContent=`${state.rows.filter(r=>r.synced).length}/5 LIVE`;
    }
    renderRows();
  }catch(_){
    $('rewardsLiveBadge')?.classList.remove('sync');
    $('rewardsLiveBadge')?.classList.add('error');
    if($('rewardsUpdated'))$('rewardsUpdated').textContent=copy('In attesa di conferma on-chain','Waiting for on-chain confirmation');
    renderRows();
  }finally{
    state.rewardLoading=false;
  }
}

async function syncStatus(force=false){
  if(state.statusLoading)return;
  if(!force&&state.lastStatusSync&&Date.now()-state.lastStatusSync<STATUS_REFRESH_MS-1500)return;
  state.statusLoading=true;
  try{
    const apr=await loadApr();
    if(apr>0)state.apr=apr;
    const effectiveNetworkApr=state.apr;
    const settled=await Promise.all(
      MANAGED_ADDRESSES.map((address)=>
        loadDelegation(address,effectiveNetworkApr)
          .then((value)=>({ok:true,value}))
          .catch(()=>({ok:false,address}))
      )
    );
    settled.forEach((entry)=>{
      if(!entry.ok)return;
      const row=state.rows.find((item)=>item.address===entry.value.address);
      if(!row)return;
      row.staked=Math.max(0,number(entry.value.staked));
      row.apr=Math.max(0,number(entry.value.apr));
      row.validatorCount=Math.max(0,number(entry.value.validatorCount));
      row.aprVerified=Boolean(entry.value.aprVerified);
      const modelRate=row.staked*Math.max(0,row.apr)/100/YEAR_MS;
      // Ogni wallet scorre al SUO APR effettivo, ponderato sui validator
      // a cui e' realmente delegato. Il saldo disponibile resta escluso.
      row.ratePerMs=modelRate>0?modelRate:0;
    });
    state.lastStatusSync=Date.now();
    renderRows();
  }finally{
    state.statusLoading=false;
  }
}

async function loadPrice(){try{const ticker=await fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=INJUSDT',6000);const price=number(ticker?.price);if(price>0){state.price=price;updateHeaderPrice();}}catch(_){}}
async function loadEurRate(){try{const cached=number(localStorage.getItem('inj_monitor_eur_rate'));if(cached>0){state.eurRate=cached;updateHeaderPrice();}const data=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',6000);const next=number(data?.rates?.EUR);if(next>0){state.eurRate=next;localStorage.setItem('inj_monitor_eur_rate',String(next));updateHeaderPrice();renderRows();}}catch(_){}}
function connectPriceSocket(){clearTimeout(state.reconnectTimer);try{state.socket?.close()}catch(_){};try{const socket=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@trade');state.socket=socket;socket.addEventListener('message',(event)=>{try{const tick=JSON.parse(event.data);const price=number(tick?.p);if(price>0){state.price=price;updateHeaderPrice();}}catch(_){}});socket.addEventListener('close',()=>{if(!document.hidden)state.reconnectTimer=setTimeout(connectPriceSocket,4500)});socket.addEventListener('error',()=>{try{socket.close()}catch(_){}})}catch(_){state.reconnectTimer=setTimeout(connectPriceSocket,5000)}}

function openEditor(address){const row=state.rows.find((item)=>item.address===address);if(!row)return;state.editorAddress=address;$('rewardEditorAddress').textContent=shortAddress(address);$('rewardEditorInput').value=row.label.startsWith('Wallet ')?'':row.label;$('rewardEditor').hidden=false;$('rewardEditor').setAttribute('aria-hidden','false');document.documentElement.style.overflow='hidden';setTimeout(()=>{$('rewardEditorInput')?.focus();$('rewardEditorInput')?.select()},40)}
function closeEditor(){state.editorAddress='';$('rewardEditor').hidden=true;$('rewardEditor').setAttribute('aria-hidden','true');document.documentElement.style.overflow=''}
function bindEditor(){$('rewardEditorForm')?.addEventListener('submit',(event)=>{event.preventDefault();const value=$('rewardEditorInput')?.value.trim();if(value&&state.editorAddress)saveLabel(state.editorAddress,value);closeEditor()});document.querySelectorAll('[data-editor-close]').forEach((node)=>node.addEventListener('click',closeEditor));document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!$('rewardEditor')?.hidden)closeEditor()})}
function bindHomeReturn(){const close=$('rewardsClose');if(!close)return;close.addEventListener('click',(event)=>{event.preventDefault();try{sessionStorage.setItem('inj_node_return_home','1')}catch(_){}let canBack=false;try{const ref=document.referrer?new URL(document.referrer):null;canBack=Boolean(ref&&ref.origin===location.origin&&(ref.pathname.endsWith('/index.html')||ref.pathname.endsWith('/'))&&history.length>1)}catch(_){}if(canBack)history.back();else location.replace('./index.html')})}

let rewardRunwayTimer=null;
function startRewardRunway(){
  clearInterval(rewardRunwayTimer);
  let step=0;
  const tick=()=>{
    document.querySelectorAll('.reward-runway-live').forEach(flow=>{
      const dots=flow.querySelectorAll(':scope > i');
      dots.forEach((dot,index)=>dot.classList.toggle('runway-active',index===step));
    });
    step=(step+1)%6;
  };
  tick();
  rewardRunwayTimer=setInterval(tick,270);
}

function boot(){
  try{state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD'}catch(_){}
  readLabels();renderRows();bindEditor();bindHomeReturn();startRewardRunway();requestAnimationFrame(renderFrame);
  // Prima otteniamo staking + APR specifico dei validator, poi il reward verificato. In questo modo
  // il PRIMO numero mostrato e' gia' esatto e parte subito alla velocita' corretta.
  // Reward e staking partono in parallelo: un LCD/validator lento non può bloccare Live Reward.
  void Promise.allSettled([loadPrice(),loadEurRate(),syncStatus(true)]);
  void syncRewardFlow(true);
  connectPriceSocket();
  setInterval(()=>{if(!document.hidden)void syncRewardFlow(false)},REWARD_REFRESH_MS);
  setInterval(()=>{if(!document.hidden)void syncStatus(false)},STATUS_REFRESH_MS);
  setInterval(()=>{if(!document.hidden&&(!state.socket||state.socket.readyState!==WebSocket.OPEN))void loadPrice()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){readLabels();renderRows();void syncStatus(true);void syncRewardFlow(true);connectPriceSocket()}});
  window.addEventListener('storage',(event)=>{if([LABELS_KEY,SAVED_WALLETS_KEY,'inj_monitor_currency','inj_node_language_v1'].includes(event.key)){if(event.key==='inj_monitor_currency'){state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';updateHeaderPrice();}readLabels();renderRows();}});
  window.addEventListener('injnode:languagechange',()=>{renderRows();if(state.lastSync&&$('rewardsUpdated'))$('rewardsUpdated').textContent=`${copy('Aggiornato','Updated')} ${new Date(state.lastSync).toLocaleTimeString(lang()==='en'?'en-US':'it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
