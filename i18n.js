// v15.99.70 — delayed/fail-safe IT/EN interface translation layer.
(() => {
  'use strict';

  const STORAGE_KEY = 'inj_node_language_v1';
  const VALID = new Set(['it', 'en']);
  const readStoredLanguage = () => { try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; } };
  const writeStoredLanguage = (value) => { try { localStorage.setItem(STORAGE_KEY, value); } catch (_) {} };
  const storedLanguage = readStoredLanguage();
  let lang = VALID.has(storedLanguage) ? storedLanguage : 'it';
  let applying = false;

  // Pairs are intentionally UI-oriented: crypto/product names remain unchanged where they are clearer as product terms.
  const pairs = [
    ['Lingua', 'Language'], ['Italiano', 'Italian'], ['Inglese', 'English'], ['Interfaccia', 'Interface'],
    ['PRIMO ACCESSO', 'FIRST ACCESS'], ['Collega il tuo wallet', 'Connect your wallet'],
    ['Incolla il tuo indirizzo pubblico Injective per iniziare. Non servono seed phrase, chiavi private o connessioni al wallet.', 'Paste your public Injective address to get started. No seed phrase, private keys or wallet connections are required.'],
    ['NOME WALLET', 'WALLET NAME'], ['INDIRIZZO INJECTIVE', 'INJECTIVE ADDRESS'], ['Continua', 'Continue'],
    ['L’indirizzo rimane salvato solo su questo dispositivo.', 'The address is stored only on this device.'],
    ['WALLET ATTIVO', 'ACTIVE WALLET'], ['Nessun wallet attivo', 'No active wallet'], ['Dati live', 'Live data'],
    ['Azioni rapide', 'Quick actions'], ['Wallet e strumenti', 'Wallet and tools'], ['Gestisci account', 'Manage accounts'],
    ['Aggiorna', 'Refresh'], ['Sincronizza dati', 'Sync data'], ['Dati personali', 'Personal data'],
    ['Prezzo medio INJ', 'Average INJ price'], ['Usato per calcolare il PnL', 'Used to calculate PnL'],
    ['Preferenze', 'Preferences'], ['Personalizza INJ Node', 'Customize INJ Node'], ['Valuta', 'Currency'],
    ['Nascondi valori', 'Hide values'], ['Mostra valori', 'Show values'], ['Tema', 'Theme'], ['Scegli tema', 'Choose theme'],
    ['Nero', 'Black'], ['Chiaro', 'Light'], ['Reset grafici Treasury', 'Reset Treasury charts'],
    ['Ricomincia lo storico da adesso', 'Restart history from now'], ['Stato rete & API', 'Network & API status'],
    ['Verifica servizi live', 'Check live services'], ['Installa INJ Node', 'Install INJ Node'],
    ['Aggiungi l’app al dispositivo', 'Add the app to this device'], ['Dati', 'Data'], ['In attesa…', 'Waiting…'],
    ['Il tuo spazio Injective.', 'Your Injective space.'],
    ['Scegli il wallet, controlla i dati essenziali e apri la vista che ti serve.', 'Choose a wallet, check the essential data and open the view you need.'],
    ['ACCOUNT SELEZIONATO', 'SELECTED ACCOUNT'], ['Seleziona un wallet', 'Select a wallet'], ['VALORE ACCOUNT', 'ACCOUNT VALUE'],
    ['AGGIORNATO', 'UPDATED'], ['INJ / USDT · OGGI', 'INJ / USDT · TODAY'], ['Dalle 00:00 · wallet selezionato', 'From 00:00 · selected wallet'],
    ['DISPONIBILE', 'AVAILABLE'], ['INJ liquidi', 'Liquid INJ'], ['REWARD / GIORNO', 'REWARD / DAY'], ['APR NETTO', 'NET APR'],
    ['Wallet selezionato', 'Selected wallet'], ['Portfolio · staking · analytics', 'Portfolio · staking · analytics'],
    ['Prezzo · patrimonio · reward live', 'Price · portfolio · live rewards'], ['P/L giornaliero · storico · autoscale', 'Daily P/L · history · autoscale'],
    ['EUR · USD · INJ · conversione live', 'EUR · USD · INJ · live conversion'],
    ['Patrimonio · staking · reward · crescita live', 'Portfolio · staking · rewards · live growth'],
    ['Wallet e preferenze restano solo su questo dispositivo.', 'Wallets and preferences stay only on this device.'],
    ['P/L giornaliero · sessione 00:00 → 00:00', 'Daily P/L · session 00:00 → 00:00'],
    ['Candele giornaliere · EMA 7 / EMA 21', 'Daily candles · EMA 7 / EMA 21'], ['OGGI', 'TODAY'],
    ['Chiude alle 00:00', 'Closes at 00:00'], ['PERIODO · 14G', 'PERIOD · 14D'], ['In attesa dello storico', 'Waiting for history'],
    ['GIORNO MIGLIORE · 14G', 'BEST DAY · 14D'], ['Tocca una candela per vedere i dettagli.', 'Tap a candle to see details.'],
    ['SCORRI ← STORICO · OGGI →', 'SCROLL ← HISTORY · TODAY →'], ['conversione live', 'live conversion'],
    ['CONVERSIONE LIVE', 'LIVE CONVERSION'], ['Scrivi in uno dei tre campi: gli altri si aggiornano automaticamente', 'Type in any of the three fields: the others update automatically'],
    ['EURO', 'EURO'], ['DOLLARI', 'DOLLARS'], ['Inserisci un importo in € / $ / INJ', 'Enter an amount in € / $ / INJ'],
    ['Connessione…', 'Connecting…'], ['Account', 'Accounts'], ['0 salvati', '0 saved'], ['Un solo pannello per tutti i wallet', 'One panel for all wallets'],
    ['Totale multi-wallet', 'Multi-wallet total'], ['Sincronizzazione…', 'Syncing…'], ['Patrimonio', 'Portfolio value'], ['Totale', 'Total'],
    ['Reward disponibili', 'Available rewards'], ['Min 24h', '24h low'], ['Max 24h', '24h high'], ['Timeframe prezzo', 'Price timeframe'],
    ['Min · Apertura · Max', 'Low · Open · High'], ['Min', 'Low'], ['Apertura', 'Open'], ['Max', 'High'],
    ['Patrimonio account', 'Account portfolio'], ['Wallet non caricato', 'Wallet not loaded'], ['Variazione 24h', '24h change'], ['PnL totale', 'Total PnL'],
    ['Liquido', 'Liquid'], ['Totale posseduto', 'Total holdings'], ['In staking', 'Staked'], ['Reward maturate', 'Accrued rewards'],
    ['APR netto personale', 'Personal net APR'], ['Reward tracker', 'Reward tracker'], ['Velocità di produzione', 'Production rate'],
    ['1 ora', '1 hour'], ['1 giorno', '1 day'], ['1 settimana', '1 week'], ['30 giorni', '30 days'], ['1 anno', '1 year'],
    ['Prossimo livello', 'Next level'], ['Accumulo reward · wallet attivo', 'Reward accrual · active wallet'], ['Reward ora', 'Reward now'],
    ['Mancano', 'Remaining'], ['Avanzamento', 'Progress'],
    ['La stima usa solo gli INJ effettivamente delegati dall’indirizzo, con commissioni e stato di ciascun validator.', 'The estimate uses only the INJ actually delegated by the address, including each validator’s commission and status.'],
    ['Target tracker', 'Target tracker'], ['Prossimo obiettivo INJ', 'Next INJ target'], ['Mancano al target', 'Remaining to target'], ['Completato', 'Completed'],
    ['Stima raggiungimento', 'Estimated completion'],
    ['La linea segue il wallet selezionato in tempo reale: tra un aggiornamento blockchain e l’altro avanza con la produzione staking stimata e si riallinea automaticamente ai dati reali.', 'The line follows the selected wallet in real time: between blockchain updates it advances using estimated staking production and automatically realigns with actual data.'],
    ['Delegazioni attive', 'Active delegations'], ['Carica un wallet per vedere dove sono delegati gli INJ.', 'Load a wallet to see where the INJ are delegated.'],
    ['Rete Injective', 'Injective network'], ['Wallet salvati', 'Saved wallets'], ['Gestisci indirizzi', 'Manage addresses'],
    ['Assegna un nome, apri o rimuovi gli indirizzi salvati su questo dispositivo.', 'Name, open or remove addresses saved on this device.'],
    ['STATO GENERALE', 'OVERALL STATUS'], ['Verifica in corso…', 'Checking…'], ['Controllo dei servizi utilizzati da INJ Node.', 'Checking the services used by INJ Node.'],
    ['CONNESSIONE', 'CONNECTION'], ['Dispositivo', 'Device'], ['MERCATO LIVE', 'LIVE MARKET'], ['Wallet e staking', 'Wallet and staking'], ['Ultimo controllo', 'Last check'],
    ['Andamento live giornaliero', 'Daily live trend'], ['Mini grafico prezzo', 'Mini price chart'], ['Mini grafico profit e loss', 'Mini profit/loss chart'],
    ['Mini grafico reward', 'Mini reward chart'], ['vs apertura giornata', 'vs day open'], ['reward maturate', 'accrued rewards'],
    ['estremi + andamento giornaliero', 'extremes + daily trend'], ['nuovo ciclo dopo il claim', 'new cycle after claim'],
    ['Mercato', 'Market'], ['Prezzo e performance periodo', 'Period price and performance'], ['Chiudi grafico', 'Close chart'], ['Riepilogo periodo', 'Period summary'],
    ['ORA', 'NOW'], ['Andamento live INJ/USDT', 'Live INJ/USDT trend'], ['Grafico performance INJ/USDT', 'INJ/USDT performance chart'],
    ['Caricamento dati…', 'Loading data…'], ['Timeframe grafico', 'Chart timeframe'], ['Apri menu', 'Open menu'], ['Chiudi menu', 'Close menu'],

    ['TOTAL MANAGED', 'TOTAL MANAGED'], ['TOTALE GESTITO', 'TOTAL MANAGED'], ['P/L 24H', '24H P/L'], ['SYNC', 'SYNC'], ['ALLOCATION', 'ALLOCATION'],
    ['Composizione Treasury', 'Treasury allocation'], ['REWARD DISPONIBILI', 'AVAILABLE REWARDS'], ['INJ DISPONIBILI', 'AVAILABLE INJ'], ['IN STAKING', 'STAKED'],
    ['STAKING RATIO', 'STAKING RATIO'], ['quota del totale', 'share of total'], ['REWARD VELOCITY', 'REWARD RATE'], ['Produzione stimata', 'Estimated production'],
    ['1 ORA', '1 HOUR'], ['1 GIORNO', '1 DAY'], ['1 MESE', '1 MONTH'], ['1 ANNO', '1 YEAR'], ['NEXT MILESTONE', 'NEXT MILESTONE'],
    ['TOTAL INJ GROWTH', 'TOTAL INJ GROWTH'], ['Crescita Treasury', 'Treasury growth'], ['TOTALE ATTUALE', 'CURRENT TOTAL'], ['DAL PRIMO DATO', 'SINCE FIRST DATA'],
    ['STORICO', 'HISTORY'], ['Prima lettura', 'First reading'], ['Ora', 'Now'], ['TOTAL NET WORTH GROWTH', 'TOTAL NET WORTH GROWTH'],
    ['Andamento patrimonio', 'Portfolio trend'], ['VALORE ATTUALE', 'CURRENT VALUE'], ['TREASURY PERFORMANCE', 'TREASURY PERFORMANCE'], ['Performance storica', 'Historical performance'],
    ['STORICO LIVE', 'LIVE HISTORY'], ['BEST DAY', 'BEST DAY'], ['WORST DAY', 'WORST DAY'], ['ATH TREASURY', 'TREASURY ATH'], ['GROWTH', 'GROWTH'],

    ['COMMAND CENTRE · LIVE', 'COMMAND CENTER · LIVE'], ['ATTESA', 'WAITING'], ['Situazione live · lettura immediata', 'Live status · instant read'],
    ['P/L totale', 'Total P/L'], ['Reward / giorno', 'Reward / day'], ['Trend timeframe', 'Timeframe trend'], ['positivi / disponibili', 'positive / available'],
    ['Grafico principale con tre conferme.', 'Main chart with three confirmations.'], ['Grafico principale', 'Main chart'], ['1 MIN', '1 MIN'], ['5 MIN', '5 MIN'], ['10 MIN', '10 MIN'],
    ['1 SETTIMANA', '1 WEEK'], ['Livelli', 'Levels'], ['Osservazione', 'Observation'], ['OPERATIVO', 'OPERATIONS'], ['Wallet · Rendita · Rischio', 'Wallet · Yield · Risk'],
    ['Posizione', 'Position'], ['Dove sono gli INJ', 'Where the INJ are'], ['Quota in staking', 'Staking share'], ['Movimento', 'Movement'], ['Prezzo vs riferimenti', 'Price vs references'],
    ['Variazione 24h*', '24h change*'], ['Prezzo medio', 'Average price'], ['*Stima sul valore attuale del wallet, esclusi i flussi.', '*Estimate based on current wallet value, excluding flows.'],
    ['Rendita', 'Yield'], ['validatori', 'validators'], ['Range & avvisi', 'Range & alerts'], ['Eventi', 'Events'], ['Livelli personali · non impostati', 'Personal levels · not set'],
    ['In attesa del flusso di mercato', 'Waiting for market feed'], ['MERCATO · ATTESA', 'MARKET · WAITING'], ['Ultimo prezzo', 'Last price'], ['WALLET · CACHE', 'WALLET · CACHE'],
    ['Ultima sync', 'Last sync'], ['API · ATTESA', 'API · WAITING'], ['Livelli personali', 'Personal levels'],
    ['Prezzi INJ / USDT. Le soglie vengono salvate per questo wallet; lascia vuoto per rimuoverle.', 'INJ / USDT prices. Thresholds are saved for this wallet; leave blank to remove them.'],
    ['Livello 1', 'Level 1'], ['Livello 2', 'Level 2'], ['Es. 7.50', 'E.g. 7.50'], ['Es. 10.00', 'E.g. 10.00'],
    ['Il prezzo medio appare sul grafico quando rientra nella scala visibile. Gli avvisi funzionano mentre il Command Centre è aperto.', 'The average price appears on the chart when it falls within the visible scale. Alerts work while Command Center is open.'],
    ['Salva livelli', 'Save levels'], ['Eventi della sessione', 'Session events'], ['Nessun evento', 'No events'],

    ['CONNECTING', 'CONNECTING'], ['IND', 'IND'], ['FOCUS', 'FOCUS'], ['MESE', 'MONTH'], ['MORE', 'MORE'], ['OPEN', 'OPEN'], ['HIGH', 'HIGH'], ['LOW', 'LOW'],
    ['CHANGE', 'CHANGE'], ['LAST TICK', 'LAST TICK'], ['CANDLE LIVE · trascina sul grafico per leggere prezzo e ora', 'LIVE CANDLE · drag on the chart to read price and time'],
    ['ORDER BOOK', 'ORDER BOOK'], ['BINANCE · REALTIME', 'BINANCE · REALTIME'], ['STEP', 'STEP'], ['TOTAL $', 'TOTAL $'], ['PRICE', 'PRICE'], ['SIZE INJ', 'SIZE INJ'],
    ['LAST TRADE', 'LAST TRADE'], ['DEPTH LIVE', 'DEPTH LIVE'], ['Scroll indipendente ASK / BID · il totale è il controvalore cumulativo reale', 'Independent ASK / BID scrolling · total is the actual cumulative notional value'],
    ['Ordini di vendita', 'Sell orders'], ['Ordini di acquisto', 'Buy orders'], ['Direzione ultimo trade', 'Last trade direction'],

    // English labels -> Italian labels for the Italian mode.
    ['TOTALE GESTITO', 'TOTAL MANAGED'], ['ASSEGNAZIONE', 'ALLOCATION'], ['VELOCITÀ REWARD', 'REWARD RATE'], ['PROSSIMA SOGLIA', 'NEXT MILESTONE'],
    ['CRESCITA TOTALE INJ', 'TOTAL INJ GROWTH'], ['CRESCITA PATRIMONIO TOTALE', 'TOTAL NET WORTH GROWTH'], ['PERFORMANCE TREASURY', 'TREASURY PERFORMANCE'],
    ['GIORNO MIGLIORE', 'BEST DAY'], ['GIORNO PEGGIORE', 'WORST DAY'], ['CRESCITA', 'GROWTH'], ['APERTURA', 'OPEN'], ['MASSIMO', 'HIGH'], ['MINIMO', 'LOW'],
    ['VARIAZIONE', 'CHANGE'], ['ULTIMO TICK', 'LAST TICK'], ['ULTIMO SCAMBIO', 'LAST TRADE'], ['PROFONDITÀ LIVE', 'DEPTH LIVE'], ['QUANTITÀ INJ', 'SIZE INJ'], ['PREZZO', 'PRICE']
  ];

  const exactIT = new Map();
  const exactEN = new Map();
  for (const [it, en] of pairs) {
    exactIT.set(it, it);
    exactIT.set(en, it);
    exactEN.set(it, en);
    exactEN.set(en, en);
  }

  const itPhrases = [
    ['TOTAL MANAGED','TOTALE GESTITO'], ['ALLOCATION','ASSEGNAZIONE'], ['REWARD VELOCITY','VELOCITÀ REWARD'], ['NEXT MILESTONE','PROSSIMA SOGLIA'],
    ['TOTAL INJ GROWTH','CRESCITA TOTALE INJ'], ['TOTAL NET WORTH GROWTH','CRESCITA PATRIMONIO TOTALE'], ['TREASURY PERFORMANCE','PERFORMANCE TREASURY'],
    ['BEST DAY','GIORNO MIGLIORE'], ['WORST DAY','GIORNO PEGGIORE'], ['CURRENT TOTAL','TOTALE ATTUALE'], ['CURRENT VALUE','VALORE ATTUALE'], ['SINCE FIRST DATA','DAL PRIMO DATO'],
    ['AVAILABLE REWARDS','REWARD DISPONIBILI'], ['AVAILABLE INJ','INJ DISPONIBILI'], ['STAKED','IN STAKING'], ['SHARE OF TOTAL','QUOTA DEL TOTALE'],
    ['FIRST READING','PRIMA LETTURA'], ['LIVE HISTORY','STORICO LIVE'], ['LAST TRADE','ULTIMO SCAMBIO'], ['LAST TICK','ULTIMO TICK'], ['SIZE INJ','QUANTITÀ INJ'],
    ['PRICE','PREZZO'], ['OPEN','APERTURA'], ['HIGH','MASSIMO'], ['LOW','MINIMO'], ['CHANGE','VARIAZIONE'], ['DEPTH LIVE','PROFONDITÀ LIVE']
  ];

  const enPhrases = [
    ['Command Center può essere aperto solo da PC.','Command Center can only be opened on a PC.'],
    ['Impossibile verificare il wallet. Controlla l’indirizzo o la connessione e riprova.','Unable to verify the wallet. Check the address or connection and try again.'],
    ['Connessione disponibile','Connection available'], ['Nessuna connessione','No connection'], ['NON DISPONIBILE','UNAVAILABLE'], ['In attesa del mercato','Waiting for market'],
    ['IN ATTESA','WAITING'], ['Wallet non aggiornato','Wallet not updated'], ['Valore precedente disponibile','Previous value available'], ['Calcolo APR in corso','Calculating APR'],
    ['Prezzo INJ in attesa…','Waiting for INJ price…'], ['Grafico Price Home non disponibile','Home price chart unavailable'], ['Tutti i sistemi operativi','All systems operational'],
    ['Alcuni servizi richiedono attenzione','Some services need attention'], ['Connessione non disponibile','Connection unavailable'],
    ['Mercato, wallet e APR stanno rispondendo normalmente.','Market, wallet and APR are responding normally.'],
    ['INJ Node continua a usare i dati disponibili mentre tenta la riconnessione.','INJ Node continues using available data while attempting to reconnect.'],
    ['Controlla la connessione del dispositivo e riprova.','Check the device connection and try again.'], ['Tutti i servizi operativi','All services operational'],
    ['Sincronizzazione del P/L giornaliero…','Syncing daily P/L…'],
    ['Oggi è la prima candela salvata su questo dispositivo. Lo storico cresce giorno per giorno.','Today is the first candle saved on this device. History grows day by day.'],
    ['Dati giornalieri non ancora disponibili. INJ Node riproverà con il prossimo aggiornamento live.','Daily data is not available yet. INJ Node will retry on the next live update.'],
    ['Chiudi ricerca wallet','Close wallet search'], ['Apri ricerca wallet','Open wallet search'], ['Aggiungi un wallet con la lente','Add a wallet with search'], ['Wallet attivo','Active wallet'],
    ['Nessun wallet','No wallet'], ['Attivo','Active'], ['Rete Injective non disponibile','Injective network unavailable'], ['Apertura giornata non disponibile','Day open unavailable'],
    ['ETA non disponibile','ETA unavailable'], ['Avanzamento reward non disponibile','Reward progress unavailable'], ['Reward giornaliero non disponibile','Daily reward unavailable'],
    ['Nessuna delegazione trovata per questo wallet.','No delegations found for this wallet.'], ['Tutti gli account sono aggiornati','All accounts are up to date'],
    ['Storico mercato non disponibile','Market history unavailable'], ['Storico non disponibile','History unavailable'], ['Nascondi valori saldo','Hide balance values'],
    ['In attesa dei dati live','Waiting for live data'], ['Installazione disponibile','Installation available'],
    ['Su iPhone: Condividi → Aggiungi a schermata Home','On iPhone: Share → Add to Home Screen'], ['Usa il menu del browser → Installa app','Use the browser menu → Install app'],
    ['Azzerare lo storico di Crescita Treasury e Andamento patrimonio? I grafici ripartiranno dai prossimi dati reali.','Reset Treasury Growth and Portfolio Trend history? Charts will restart from the next real data.'],
    ['Puoi scegliere un nome riconoscibile. L’indirizzo resta salvato solo su questo dispositivo.','You can choose a recognizable name. The address remains stored only on this device.'],
    ['Si sblocca dopo 7 giorni di storico accumulato','Unlocks after 7 days of accumulated history'], ['Si sblocca dopo 30 giorni di storico accumulato','Unlocks after 30 days of accumulated history'],
    ['ULTIMI 7 GIORNI','LAST 7 DAYS'], ['MESE IN CORSO','CURRENT MONTH'], ['Servono 2 giorni','2 days required'], ['Rete Injective temporaneamente non disponibile','Injective network temporarily unavailable'],
    ['In attesa di storico reale','Waiting for real history'], ['IN RITARDO','DELAYED'], ['Flusso mercato interrotto: ultimo prezzo conservato.','Market feed interrupted: last price retained.'],
    ['Flusso mercato ripristinato.','Market feed restored.'], ['Flusso mercato connesso.','Market feed connected.'], ['Storico parziale','Partial history'], ['PREZZO MEDIO','AVERAGE PRICE']
  ];

  function replacePhrases(value, list) {
    let out = value;
    const sorted = list.slice().sort((a,b) => b[0].length - a[0].length);
    for (const [from, to] of sorted) out = out.split(from).join(to);
    return out;
  }

  function dynamicEN(s) {
    let out = replacePhrases(s, enPhrases);
    out = out
      .replace(/^Vai a (.+)$/,'Go to $1')
      .replace(/^Seleziona (.+)$/,'Select $1')
      .replace(/^Apri dettaglio (.+)$/,'Open details for $1')
      .replace(/^Apri (.+)$/,'Open $1')
      .replace(/^Chiudi (.+)$/,'Close $1')
      .replace(/^Rimuovere “(.+)” dai wallet salvati\?$/,'Remove “$1” from saved wallets?')
      .replace(/\bUltimo tick\b/g,'Last tick')
      .replace(/\bUltimo dato\b/g,'Last data')
      .replace(/\bUltimo prezzo\b/g,'Last price')
      .replace(/\bwallet aggiornati\b/g,'wallets updated')
      .replace(/\bsalvato\b/g,'saved').replace(/\bsalvati\b/g,'saved')
      .replace(/\bgiorni\b/g,'days').replace(/\bgiorno\b/g,'day').replace(/\banni\b/g,'years').replace(/\banno\b/g,'year')
      .replace(/\/ giorno\b/g,'/ day').replace(/\/giorno\b/g,'/day')
      .replace(/\bMancano\b/g,'Remaining').replace(/\bmancanti\b/g,'remaining')
      .replace(/\bTema attuale\b/g,'Current theme').replace(/\bTema:\s*/g,'Theme: ')
      .replace(/\. Cambia tema\b/g,'. Change theme')
      .replace(/\bLivello (\d+) attraversato al rialzo:/g,'Level $1 crossed upward:')
      .replace(/\bLivello (\d+) attraversato al ribasso:/g,'Level $1 crossed downward:')
      .replace(/\bOltre 40 years \/ n\.d\./g,'Over 40 years / n/a')
      .replace(/\bOltre 40 anni \/ n\.d\./g,'Over 40 years / n/a')
      .replace(/\bStima netta\b/g,'Net estimate')
      .replace(/\bmaturate\b/g,'accrued')
      .replace(/\boggi\b/gi,'today')
      .replace(/\badesso\b/gi,'now');
    return out;
  }

  function dynamicIT(s) {
    let out = replacePhrases(s, itPhrases);
    out = out
      .replace(/^Go to (.+)$/,'Vai a $1').replace(/^Select (.+)$/,'Seleziona $1').replace(/^Open details for (.+)$/,'Apri dettaglio $1')
      .replace(/^Open (.+)$/,'Apri $1').replace(/^Close (.+)$/,'Chiudi $1')
      .replace(/^Remove “(.+)” from saved wallets\?$/,'Rimuovere “$1” dai wallet salvati?')
      .replace(/\bLast data\b/g,'Ultimo dato').replace(/\bLast price\b/g,'Ultimo prezzo')
      .replace(/\bwallets updated\b/g,'wallet aggiornati').replace(/\bCurrent theme\b/g,'Tema attuale').replace(/\bTheme:\s*/g,'Tema: ')
      .replace(/\. Change theme\b/g,'. Cambia tema').replace(/\bNet estimate\b/g,'Stima netta')
      .replace(/\bOver 40 years \/ n\/a\b/g,'Oltre 40 anni / n.d.');
    return out;
  }

  function translateString(value, target = lang) {
    if (value == null) return value;
    const raw = String(value);
    const leading = raw.match(/^\s*/)?.[0] || '';
    const trailing = raw.match(/\s*$/)?.[0] || '';
    const core = raw.trim();
    if (!core) return raw;
    const map = target === 'en' ? exactEN : exactIT;
    let result = map.get(core) || core;
    result = target === 'en' ? dynamicEN(result) : dynamicIT(result);
    return leading + result + trailing;
  }

  function translateElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.closest?.('[data-i18n-skip="true"]')) return;
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      if (el.hasAttribute?.(attr)) {
        const old = el.getAttribute(attr);
        const next = translateString(old);
        if (next !== old) el.setAttribute(attr, next);
      }
    }
  }

  function translateNode(root) {
    if (!root) return;
    applying = true;
    try {
      if (root.nodeType === 3) {
        const parent = root.parentElement;
        if (!parent || parent.closest?.('[data-i18n-skip="true"], script, style, textarea')) return;
        const next = translateString(root.nodeValue);
        if (next !== root.nodeValue) root.nodeValue = next;
        return;
      }
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
      if (root.nodeType === 1) translateElement(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === 1) translateElement(node);
        else {
          const parent = node.parentElement;
          if (!parent || parent.closest?.('[data-i18n-skip="true"], script, style, textarea')) continue;
          const next = translateString(node.nodeValue);
          if (next !== node.nodeValue) node.nodeValue = next;
        }
      }
    } finally { applying = false; }
  }

  function updateControls() {
    document.querySelectorAll('[data-language-choice]').forEach((button) => {
      const active = button.dataset.languageChoice === lang;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const value = document.getElementById('languageValue');
    if (value) value.textContent = lang.toUpperCase();
  }

  function applyLanguage(nextLang, persist = true) {
    if (!VALID.has(nextLang)) return;
    lang = nextLang;
    if (persist) writeStoredLanguage(lang);
    document.documentElement.lang = lang;
    translateNode(document.body || document.documentElement);
    updateControls();
    window.dispatchEvent(new CustomEvent('injnode:languagechange', { detail: { language: lang } }));
  }

  function bindControls() {
    document.querySelectorAll('[data-language-choice]').forEach((button) => {
      if (button.dataset.i18nBound === '1') return;
      button.dataset.i18nBound = '1';
      button.addEventListener('click', () => applyLanguage(button.dataset.languageChoice, true));
    });
    updateControls();
  }

  let observer;
  let flushTimer = 0;
  const pending = new Set();

  function observe() {
    if (!observer || !document.documentElement) return;
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label','title','placeholder']
    });
  }

  function flushMutations() {
    flushTimer = 0;
    if (!pending.size) return;
    observer?.disconnect();
    applying = true;
    try {
      const nodes = Array.from(pending);
      pending.clear();
      for (const node of nodes) {
        if (!node || !node.isConnected) continue;
        translateNode(node.nodeType === 3 ? node : node);
      }
      bindControls();
    } catch (_) {
      // Translation must never be able to break the core application.
    } finally {
      applying = false;
      observe();
    }
  }

  observer = new MutationObserver((mutations) => {
    if (applying) return;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData' || mutation.type === 'attributes') pending.add(mutation.target);
      else mutation.addedNodes.forEach((node) => pending.add(node));
    }
    if (!flushTimer) flushTimer = window.setTimeout(flushMutations, 80);
  });

  function safeApply(nextLang, persist = true) {
    try { applyLanguage(nextLang, persist); } catch (_) { updateControls(); }
  }

  function start() {
    bindControls();
    // Core INJ Node has already completed its load before this script is injected.
    // Translation is therefore presentation-only and cannot block the boot screen.
    window.setTimeout(() => {
      safeApply(lang, false);
      observe();
    }, 40);
  }

  window.INJ_I18N = {
    getLanguage: () => lang,
    setLanguage: (next) => safeApply(next, true),
    t: (value) => translateString(value, lang),
    translate: translateNode
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
