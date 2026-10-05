'use strict';
const WALLETS=[
  'inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv',
  'inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu',
  'inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9',
  'inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q',
  'inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'
];
const LCD=['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd'];
const E18=1e18;
let lastTotals=null;

const $=id=>document.getElementById(id);
const num=v=>Number(v)||0;
const inj=v=>num(v)/E18;

async function json(url, timeout=6500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(), timeout);
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok) throw new Error(String(response.status));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function lcd(path){
  let error;
  for(const base of LCD){
    try { return await json(base+path); }
    catch(err){ error=err; }
  }
  throw error;
}

function coin(list=[]){return inj(list.find(item=>item?.denom==='inj')?.amount);}
function deleg(data){return (data?.delegation_responses||[]).reduce((sum,item)=>sum+inj(item?.balance?.amount),0);}
function rewards(data){return (data?.total||[]).filter(item=>item?.denom==='inj').reduce((sum,item)=>sum+inj(item.amount),0);}

async function loadWallet(address){
  const [balances, delegations, distribution] = await Promise.all([
    lcd(`/cosmos/bank/v1beta1/balances/${address}`),
    lcd(`/cosmos/staking/v1beta1/delegations/${address}`),
    lcd(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`)
  ]);

  const available = coin(balances?.balances);
  const staked = deleg(delegations);
  const reward = rewards(distribution);
  return {available, staked, rewards: reward, total: available + staked + reward};
}

async function loadPrice(){
  try{
    const data = await json('https://api.coingecko.com/api/v3/simple/price?ids=injective-protocol&vs_currencies=usd',6000);
    return num(data?.['injective-protocol']?.usd);
  }catch(_){
    return 0;
  }
}

function fmt(value, digits=2){
  return Number(value).toLocaleString('it-IT', {minimumFractionDigits:digits, maximumFractionDigits:digits});
}

function setStatus(text, isError=false){
  const status=$('status');
  if(!status) return;
  status.classList.toggle('error', isError);
  status.innerHTML = `<i></i> ${text}`;
}

function render(totals, price){
  const fiatText = price ? `≈ $${Math.round(totals.total*price).toLocaleString('it-IT')}` : 'Valore live on-chain';
  const heroInj = $('heroInjTotal');
  const heroFiat = $('heroFiatTotal');
  if(heroInj) heroInj.textContent = `${fmt(totals.total,2)} INJ`;
  if(heroFiat) heroFiat.textContent = fiatText;

  $('injTotal').textContent = fmt(totals.total,2);
  $('fiatTotal').textContent = fiatText;
  $('price').textContent = price ? `INJ / USDT $${fmt(price,4)}` : 'INJ / USDT —';
  $('staked').textContent = `${fmt(totals.staked,2)} INJ`;
  $('rewards').textContent = `${fmt(totals.rewards,4)} INJ`;
  $('stakeRatio').textContent = totals.total ? `${fmt((totals.staked / totals.total) * 100,2)}% del capitale` : '—';

  setStatus('LIVE', false);
}

async function refresh(){
  try{
    const results = await Promise.allSettled(WALLETS.map(loadWallet));
    const rows = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    if(!rows.length) throw new Error('no wallet data');

    const totals = rows.reduce((acc,row)=>({
      available:acc.available + row.available,
      staked:acc.staked + row.staked,
      rewards:acc.rewards + row.rewards,
      total:acc.total + row.total
    }),{available:0, staked:0, rewards:0, total:0});

    lastTotals = totals;
    const injPrice = await loadPrice();
    render(totals, injPrice);
  } catch(err){
    if(lastTotals){
      setStatus('LIVE · cache locale', true);
    } else {
      setStatus('RETE IN ATTESA', true);
    }
  }
}

$('year').textContent = new Date().getFullYear();
refresh();
setInterval(refresh, 15000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refresh(); });
