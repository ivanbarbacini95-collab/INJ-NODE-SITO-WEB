'use strict';

/* Cash Reserve · watch-only · indirizzi usati solo per richieste on-chain,
   mai scritti nel DOM, nei messaggi o negli URL visibili. */
(function () {
  const INJ_ACCOUNT = 'inj1nj4ahf4p96ulu7r7n3h27u4rlud5qlc2jy3zyg';
  const SOL_ACCOUNT = '5atuLUBzVvj8EBJKt4oeTd1Ci9cZqcX6LKELSypNQGpK';
  const INJ_USDC = 'erc20:0xa00c59ff5a080d2b954d0c75e46e22a0c371235a';
  const SOL_TOKEN_PROGRAMS = [
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  ];
  const SOL_RPC = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com'
  ];
  const INJ_LCD = [
    'https://sentry.lcd.injective.network:443',
    'https://lcd.injective.network',
    'https://1rpc.io/inj-lcd'
  ];
  const SOL_VERIFIED = Object.freeze({
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name:'USDC', kind:'stable' },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name:'USDT', kind:'stable' },
    'So11111111111111111111111111111111111111112': { name:'Wrapped SOL', short:'wSOL', kind:'token' },
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { name:'Jupiter', short:'JUP', kind:'token' },
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { name:'Bonk', short:'BONK', kind:'token' },
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': { name:'Pyth', short:'PYTH', kind:'token' },
    'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL': { name:'Jito', short:'JTO', kind:'token' },
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { name:'Raydium', short:'RAY', kind:'token' }
  });
  const reads = {
    inj: { assets:[], ok:false, updatedAt:0, error:false },
    sol: { assets:[], ok:false, updatedAt:0, error:false }
  };
  let loading = false;
  const element = (id) => document.getElementById(id);

  function moneyUsd(value) {
    return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 }).format(value);
  }
  function formatAmount(raw, exponent) {
    const str = String(raw == null ? '0' : raw);
    if (!/^\d+$/.test(str)) return { text:'—', number:null, positive:false };
    const decimals = Math.max(0, Math.min(30, Number(exponent) || 0));
    const wholeNumber = BigInt(str);
    const power = 10n ** BigInt(decimals);
    const whole = (wholeNumber / power).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    const fraction = decimals
      ? (wholeNumber % power).toString().padStart(decimals,'0').slice(0,10).replace(/0+$/,'')
      : '';
    const tiny = wholeNumber > 0n && whole === '0' && !fraction;
    const text = tiny ? '<0,0000000001' : whole + (fraction ? ',' + fraction : '');
    const numeric = Number(wholeNumber) / Number(power);
    return { text, number:Number.isFinite(numeric) ? numeric : null, positive:wholeNumber > 0n };
  }
  function asset(name, kind, short, raw, decimals, notes) {
    const amount = formatAmount(raw,decimals);
    return { name, kind, short:short || name.slice(0,4), amount, notes:notes || '', usd:kind === 'stable' ? amount.number : null };
  }
  async function fetchData(url, opts, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 7500);
    try {
      const response = await fetch(url, { cache:'no-store', ...(opts || {}), signal:controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  async function injectiveApi(path) {
    let error;
    for (const host of INJ_LCD) {
      try { return await fetchData(host + path, null, 6500); }
      catch (err) { error = err; }
    }
    throw error || new Error('Injective non disponibile');
  }
  async function injMetadata(denom) {
    try {
      const result = await injectiveApi('/cosmos/bank/v1beta1/denoms_metadata/' + encodeURIComponent(denom));
      const metadata = result && result.metadata;
      const unit = metadata && Array.isArray(metadata.denom_units)
        ? metadata.denom_units.find((entry) => entry.denom === metadata.display)
        : null;
      if (!metadata || !unit) return null;
      return {
        name: String(metadata.symbol || metadata.name || 'Token'),
        exponent: Number(unit.exponent) || 0
      };
    } catch (_) { return null; }
  }
  async function injectiveBalances() {
    const coins = [];
    let next = '';
    for (let page = 0; page < 30; page++) {
      const query = '?pagination.limit=200' + (next ? '&pagination.key=' + encodeURIComponent(next) : '');
      const result = await injectiveApi('/cosmos/bank/v1beta1/balances/' + INJ_ACCOUNT + query);
      if (!Array.isArray(result && result.balances)) throw new Error('Risposta Injective non valida');
      coins.push(...result.balances);
      next = result.pagination && result.pagination.next_key || '';
      if (!next) break;
      if (page === 29) throw new Error('Paginazione Injective incompleta');
    }
    const active = coins.filter((entry) => /^\d+$/.test(String(entry.amount)) && BigInt(entry.amount) > 0n);
    const assets = await Promise.all(active.map(async (coin, index) => {
      const denom = String(coin.denom || '');
      if (denom === 'inj') return asset('INJ','native','INJ',coin.amount,18,'Token nativo');
      if (denom.toLowerCase() === INJ_USDC) return asset('USDC','stable','USDC',coin.amount,6,'USDC nativo Circle');
      const meta = await injMetadata(denom);
      if (meta) return asset(meta.name,'token',meta.name.slice(0,4),coin.amount,meta.exponent,'Token Injective');
      const result = asset('Token ' + (index+1),'token','TOK',coin.amount,0,'Unità base · metadati non disponibili');
      result.unformatted = true;
      return result;
    }));
    return assets;
  }
  async function solanaRpc(host, method, params, id) {
    const payload = JSON.stringify({ jsonrpc:'2.0', id:id || 1, method, params });
    const data = await fetchData(host, {method:'POST',headers:{'Content-Type':'application/json'},body:payload},10000);
    if (data.error || !data.result) throw new Error('Solana RPC: ' + (data.error && data.error.message || 'risposta non valida'));
    return data.result;
  }
  async function solanaBalances() {
    let result, error;
    for (const host of SOL_RPC) {
      try {
        result = await Promise.all([
          solanaRpc(host,'getBalance',[SOL_ACCOUNT,{commitment:'confirmed'}],1),
          solanaRpc(host,'getTokenAccountsByOwner',[SOL_ACCOUNT,{programId:SOL_TOKEN_PROGRAMS[0]},{encoding:'jsonParsed',commitment:'confirmed'}],2),
          solanaRpc(host,'getTokenAccountsByOwner',[SOL_ACCOUNT,{programId:SOL_TOKEN_PROGRAMS[1]},{encoding:'jsonParsed',commitment:'confirmed'}],3)
        ]);
        break;
      } catch (err) { error = err; result = null; }
    }
    if (!result) throw error || new Error('Solana non disponibile');
    const assets = [];
    const lamports = String(result[0].value == null ? '0' : result[0].value);
    if (formatAmount(lamports,9).positive) assets.push(asset('Solana','native','SOL',lamports,9,'Token nativo SOL'));
    const byMint = new Map();
    for (const group of [result[1].value,result[2].value]) {
      if (!Array.isArray(group)) throw new Error('Token Solana non disponibili');
      for (const entry of group) {
        const info = entry && entry.account && entry.account.data && entry.account.data.parsed && entry.account.data.parsed.info;
        const mint = info && info.mint;
        const balance = info && info.tokenAmount;
        if (!mint || !balance || !/^\d+$/.test(String(balance.amount))) continue;
        const decimals = Number(balance.decimals) || 0;
        const previous = byMint.get(mint);
        if (previous && previous.decimals !== decimals) throw new Error('Decimali token incoerenti');
        byMint.set(mint,{ decimals, raw:(previous ? previous.raw : 0n) + BigInt(balance.amount) });
      }
    }
    let unknown = 0;
    for (const [mint, value] of byMint) {
      if (value.raw <= 0n) continue;
      const known = SOL_VERIFIED[mint];
      const name = known ? known.name : 'Token ' + (++unknown);
      const resultAsset = asset(name,known ? known.kind : 'token',known ? (known.short || known.name) : 'TOK',value.raw.toString(),value.decimals,known ? 'Token SPL verificato' : 'Token SPL · identificativo nascosto');
      assets.push(resultAsset);
    }
    return assets;
  }
  function sortedAssets(assets) {
    const priority = (entry) => entry.kind === 'stable' ? 0 : entry.kind === 'native' ? 1 : 2;
    return assets.slice().sort((a,b) => priority(a)-priority(b) || a.name.localeCompare(b.name));
  }
  function node(tag, cls, txt) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (txt != null) el.textContent = txt;
    return el;
  }
  function renderNetwork(which, containerId, statusId) {
    const container = element(containerId), status = element(statusId);
    if (!container || !status) return;
    const data = reads[which];
    status.className = 'reserve-network-state ' + (data.ok ? 'is-live' : data.error ? 'is-error' : '');
    status.textContent = data.ok ? 'ONLINE' : data.error ? 'NON DISPONIBILE' : 'SINCRONIZZAZIONE';
    container.replaceChildren();
    if (!data.ok) {
      container.append(node('p','reserve-empty',data.error ? 'Lettura non riuscita. Tocca Aggiorna per riprovare.' : 'Caricamento saldi on-chain…'));
      return;
    }
    const assets = sortedAssets(data.assets);
    if (!assets.length) {
      container.append(node('p','reserve-empty','Nessun token con saldo positivo.'));
      return;
    }
    for (const entry of assets) {
      const row = node('div','reserve-asset-row');
      const icon = node('span','reserve-asset-icon ' + (entry.kind === 'stable' ? 'reserve-stable' : ''),entry.short.slice(0,4).toUpperCase());
      icon.setAttribute('aria-hidden','true');
      const left = node('div','reserve-asset-name');
      left.append(node('strong','',entry.name));
      left.append(node('small','',entry.notes));
      const right = node('div','reserve-asset-values');
      right.append(node('strong','',entry.amount.text));
      right.append(node('small','',entry.kind === 'stable' && entry.usd != null ? '≈ ' + moneyUsd(entry.usd) + ' nominali' : entry.unformatted ? 'Quantità in unità base' : 'Saldo on-chain'));
      row.append(icon,left,right);
      container.append(row);
    }
  }
  function renderSummary() {
    renderNetwork('inj','reserveInjectiveAssets','reserveInjectiveStatus');
    renderNetwork('sol','reserveSolanaAssets','reserveSolanaStatus');
    const verified = Object.values(reads).filter((item) => item.ok);
    const stable = verified.flatMap((item) => item.assets).filter((item) => item.kind === 'stable' && item.usd != null).reduce((sum,item) => sum + item.usd,0);
    const count = verified.reduce((sum,item) => sum+item.assets.length,0);
    const complete = verified.length === 2;
    element('reserveStableUsd').textContent = verified.length ? (complete ? '≈ ' : '≥ ') + moneyUsd(stable) : '—';
    element('reserveAssetCount').textContent = verified.length ? String(count) + (complete ? '' : '+') : '—';
    const updated = Math.max(reads.inj.updatedAt,reads.sol.updatedAt);
    element('reserveUpdatedAt').textContent = updated
      ? new Date(updated).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})
      : 'In attesa';
    element('reserveCoverage').textContent = complete ? '2 reti sincronizzate' : verified.length ? '1 rete sincronizzata · totale parziale' : 'Nessuna rete sincronizzata';
    const refresh = element('reserveRefresh');
    refresh.disabled = loading;
    refresh.textContent = loading ? 'Sincronizzazione…' : 'Aggiorna';
  }
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true; renderSummary();
    const outcomes = await Promise.allSettled([injectiveBalances(),solanaBalances()]);
    for (const [index,network] of ['inj','sol'].entries()) {
      const result = outcomes[index];
      const item = reads[network];
      if (result.status === 'fulfilled') {
        item.assets = result.value;
        item.ok = true;
        item.error = false;
        item.updatedAt = Date.now();
      } else {
        item.ok = false;
        item.error = true;
      }
    }
    loading = false;
    renderSummary();
  }
  function boot() {
    if (!element('reserveRefresh')) return;
    element('reserveRefresh').addEventListener('click',refresh);
    renderSummary();
    void refresh();
    setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    document.addEventListener('visibilitychange',() => { if (!document.hidden) void refresh(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
