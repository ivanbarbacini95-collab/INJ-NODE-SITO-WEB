'use strict';
const WALLETS=['inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv','inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu','inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9','inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q','inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'];
const LCD=['https://sentry.lcd.injective.network:443','https://lcd.injective.network','https://1rpc.io/inj-lcd']; const E18=1e18; let last=null;
const $=id=>document.getElementById(id), num=v=>Number(v)||0, inj=v=>num(v)/E18;
async function json(url,t=6500){const c=new AbortController(),x=setTimeout(()=>c.abort(),t);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error(r.status);return await r.json()}finally{clearTimeout(x)}}
async function lcd(path){let e;for(const b of LCD){try{return await json(b+path)}catch(x){e=x}}throw e}
function coin(a=[]){return inj(a.find(x=>x?.denom==='inj')?.amount)}
function deleg(d){return (d?.delegation_responses||[]).reduce((s,x)=>s+inj(x?.balance?.amount),0)}
function rew(d){return (d?.total||[]).filter(x=>x?.denom==='inj').reduce((s,x)=>s+inj(x.amount),0)}
async function wallet(a){const [b,d,r]=await Promise.all([lcd(`/cosmos/bank/v1beta1/balances/${a}`),lcd(`/cosmos/staking/v1beta1/delegations/${a}`),lcd(`/cosmos/distribution/v1beta1/delegators/${a}/rewards`)]);let available=coin(b?.balances),staked=deleg(d),rewards=rew(r);return{available,staked,rewards,total:available+staked+rewards}}
async function price(){try{let d=await json('https://api.coingecko.com/api/v3/simple/price?ids=injective-protocol&vs_currencies=usd',6000);return num(d?.['injective-protocol']?.usd)}catch(_){return 0}}
function fmt(v,d=2){return Number(v).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d})}
function render(t,p){$('injTotal').textContent=fmt(t.total,2);$('staked').textContent=fmt(t.staked,2)+' INJ';$('rewards').textContent=fmt(t.rewards,4)+' INJ';$('stakeRatio').textContent=t.total?fmt(t.staked/t.total*100,2)+'% del capitale':'—';$('price').textContent=p?`INJ / USDT $${fmt(p,4)}`:'INJ / USDT —';$('fiatTotal').textContent=p?'≈ $'+Math.round(t.total*p).toLocaleString('it-IT'):'Valore live on-chain';$('status').classList.remove('error')}
async function refresh(){try{const rows=(await Promise.allSettled(WALLETS.map(wallet))).filter(x=>x.status==='fulfilled').map(x=>x.value);if(!rows.length)throw Error();const t=rows.reduce((a,x)=>({available:a.available+x.available,staked:a.staked+x.staked,rewards:a.rewards+x.rewards,total:a.total+x.total}),{available:0,staked:0,rewards:0,total:0});last=t;render(t,await price())}catch(_){$('status').classList.add('error');if(!last)$('status').innerHTML='<i></i> RETE IN ATTESA'}}
$('year').textContent=new Date().getFullYear(); refresh(); setInterval(refresh,15000); document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
