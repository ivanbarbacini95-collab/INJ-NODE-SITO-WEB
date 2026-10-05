// v15.98.67 — Home Market Matrix: live 1M/5M/10M/1H/1D/1W direction consensus.
// v15.99.71 — Stable mobile notice + delayed IT/EN layer; core boot remains identical to v15.99.64.
// v15.98.63 — Global Market Motion: Command Center-style realtime INJ price interpolation across Home, Dashboard, Live View and Pulse View.
// Price-derived values follow the same visual price without forcing full-page redraws.
// v15.98.62 — Command Center: isolated large-screen wall display with portfolio, staking, Pulse and five live charts.
// v15.98.43 — Live Charts isolated page: Home only navigates; chart rendering can no longer block the main app.
// v15.98.41 — Live Charts Safe Engine: no permanent RAF loop, lazy history and isolated lightweight updates.
// v15.98.40 — Live Charts Stability Fix: deferred opening, split lightweight/full rendering and reduced mobile chart workload.
// v15.98.39 — Dedicated Live Charts: continuous 5m/10m/1h realtime stack with readable adaptive right-side price scales.
// v15.98.37 — Live View 1M fluid engine: interpolated endpoint, right-edge live dot and stable momentum colour.
// v15.98.36 — Live View 1M bottom signal ribbon: smoothed realtime curve in the empty lower band, with restrained live pulse.
// v15.98.35 — Live View 1M realtime adaptive overlay: trade-sensitive line, live pulse and breakout compression.
// v15.98.34 — Interface Styles: Elegant, Futuristic and Ultra Premium, persistent and theme-independent.
// v15.98.33 — Clean UI: removed selectable/global card elements while preserving the Home chart drag-lock and mobile fixes.
// v15.98.33 — Home PRICE drag lock: sticky inspector + pointer capture for reliable iOS traversal.
// v15.98.29 — Mobile Fluid: iOS no-zoom wallet search, reliable vertical scrolling, swipeable active-wallet card, ghost-tap-safe themes and lower-power mobile runtime.
// v15.98.23 — Mobile Fast Tap: touch controls fire on pointer release, with duplicate native-click suppression and larger coarse-pointer hit areas.
// Keeps the v15.98.22 clean Dashboard exit unchanged.
// v15.98.21 — Fixed immersive exit: Home remains stationary underneath; only Live/Pulse fade out.
// v15.98.20 — Stable Home return: no re-triggered Home entrance animations and extra compositor handoff buffer.
// v15.98.19 — Premium adaptive Reward runway + static Dashboard performance/P&L percentages.
// v15.98.18 — Adaptive thin Reward USD gauge + no-black-frame Home-over-immersive return.
// v15.98.15 — Fixed-size selective odometer: Home rolls only account countervalue + side INJ/USDT price.
// Dashboard rolls only LIVE price + countervalue; Live View rolls only price + countervalue; Pulse View remains blink-only.
'use strict';

const $ = (id) => document.getElementById(id);
const INJ_DECIMALS = 1e18;
const USDC_DECIMALS = 1e6;
const NATIVE_USDC_DENOM = 'erc20:0xa00c59ff5a080d2b954d0c75e46e22a0c371235a';

const BOOT_SPLASH_DURATION = 2800;
const BOOT_PROGRESS_DELAY = 280;
const BOOT_PROGRESS_DURATION = 2180;
const DIRECT_HOME_RETURN = document.documentElement.dataset.returnHome === '1';
window.addEventListener('pageshow', () => {
  try { sessionStorage.removeItem('inj_node_return_home'); } catch (_) {}
});

// v15.98.28 — Keep mobile/PWA rendering smooth without holding the GPU and
// network stack at desktop intensity. This only changes scheduling/effects, not
// portfolio math or the data shown to the user.
const MOBILE_EFFICIENCY = Boolean(
  window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches || window.innerWidth <= 820
);
document.documentElement.classList.toggle('mobile-efficient', MOBILE_EFFICIENCY);


// v15.98.7 — Direct launch + large-monitor responsive scaling.

function formatBootPercent(value) {
  return `${Math.max(0, Math.min(100, Math.round(value))).toString().padStart(3, '0')}%`;
}

function animateBootPercent(reducedMotion = false) {
  const output = $('bootPercent');
  if (!output) return;
  output.textContent = '000%';

  const delay = reducedMotion ? 40 : BOOT_PROGRESS_DELAY;
  const duration = reducedMotion ? 430 : BOOT_PROGRESS_DURATION;
  const started = performance.now();

  const frame = (now) => {
    const elapsed = now - started;
    if (elapsed < delay) {
      requestAnimationFrame(frame);
      return;
    }
    const progress = Math.max(0, Math.min(1, (elapsed - delay) / duration));
    output.textContent = formatBootPercent(progress * 100);
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function scheduleBootSplashExit() {
  const splash = $('bootSplash');

  // v15.99.38 — Returning from Treasury must behave like an in-app Home handoff:
  // never replay the INJ Node startup logo. The Treasury page sets a one-shot
  // session flag before navigation; the <head> hides the splash before first paint.
  if (DIRECT_HOME_RETURN) {
    splash?.remove();
    requestAnimationFrame(() => {
      showEntryGate();
      $('entryGate')?.classList.add('home-return-stable');
      document.body.classList.remove('boot-loading');
      document.documentElement.removeAttribute('data-return-home');
      window.setTimeout(() => $('entryGate')?.classList.remove('home-return-stable'), 420);
    });
    return;
  }

  if (!splash) {
    // La schermata di accesso prende il controllo PRIMA di scoprire la dashboard.
    showEntryGate();
    requestAnimationFrame(() => document.body.classList.remove('boot-loading'));
    return;
  }

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const wait = reducedMotion ? 650 : BOOT_SPLASH_DURATION;
  animateBootPercent(Boolean(reducedMotion));

  window.setTimeout(() => {
    const percent = $('bootPercent');
    if (percent) percent.textContent = '100%';

    // Prima rendiamo visibile l'Entry Gate sotto la splash; solo nel frame
    // successivo iniziamo il fade della splash. In questo modo non esiste
    // alcun frame in cui la dashboard possa comparire tra le due viste.
    showEntryGate();
    requestAnimationFrame(() => {
      splash.classList.add('leaving');
      document.body.classList.remove('boot-loading');
    });

    window.setTimeout(() => splash.remove(), reducedMotion ? 300 : 560);
  }, wait);
}


function selectedEntryWallet() {
  return state.wallets.find((wallet) => wallet.address === state.entrySelectedAddress) || null;
}

function setEntryOnboardingStatus(message, mode = '') {
  const status = $('entryWalletStatus');
  if (!status) return;
  status.textContent = message;
  status.className = `entry-onboarding-status ${mode}`.trim();
}

function setEntryOnboardingLoading(loading) {
  const input = $('entryWalletInput');
  const nameInput = $('entryWalletName');
  const button = $('entryWalletContinue');
  const copy = $('entryWalletContinueText');
  if (input) input.disabled = loading;
  if (nameInput) nameInput.disabled = loading;
  if (button) {
    button.disabled = loading;
    button.classList.toggle('loading', loading);
  }
  if (copy) copy.textContent = loading ? 'Verifica…' : 'Continua';
}

async function submitFirstWallet(event) {
  event?.preventDefault();
  if (state.wallets.length) {
    renderEntryGate();
    return;
  }

  const input = $('entryWalletInput');
  const nameInput = $('entryWalletName');
  const walletLabel = String(nameInput?.value || '').trim();
  const address = String(input?.value || '').trim().toLowerCase();
  if (!validAddress(address)) {
    setEntryOnboardingStatus('Inserisci un indirizzo Injective valido che inizi con inj1.', 'error');
    input?.focus();
    return;
  }

  setEntryOnboardingLoading(true);
  setEntryOnboardingStatus('Verifica dell’indirizzo sulla rete Injective…', 'checking');

  try {
    const summary = await loadWalletSummary(address);
    state.walletSummaries[address] = {
      ...state.walletSummaries[address],
      ...summary,
      updated: Date.now()
    };
    state.lastWalletUpdate = state.walletSummaries[address].updated;
    setWalletSkeleton(false);
    saveWalletSummaries();
    ensureSavedWallet(address, walletLabel);
    state.entrySelectedAddress = address;
    state.address = address;
    $('addressInput').value = address;

    // Carica immediatamente lo snapshot appena verificato mentre la Dashboard
    // rimane coperta dall'Entry Gate, quindi passa alla scelta della modalità.
    activateWalletImmediately(address);
    setEntryOnboardingStatus('Wallet verificato.', 'success');
    renderEntryGate();

    // Completa validator e APR in background: la scelta Dashboard / Live View
    // è già utilizzabile senza costringere l'utente ad attendere oltre.
    loadWallet(false, address);
  } catch (error) {
    console.error(error);
    setEntryOnboardingStatus('Impossibile verificare il wallet. Controlla l’indirizzo o la connessione e riprova.', 'error');
    input?.focus();
  } finally {
    setEntryOnboardingLoading(false);
  }
}

let entryWalletScrollFrame = 0;

/* v15.95 — Home wallet carousel architecture cleanup.
   The active-account preview is now rendered inside one clipped compositor
   viewport. During a gesture only one track moves; the real card underneath
   never leaves layout, so wide desktop and iOS use the same paint path. */
const entryWalletGesture = {
  active: false,
  tracking: false,
  baseIndex: -1,
  targetIndex: -1,
  startX: 0,
  startScrollLeft: 0,
  startTime: 0,
  lastX: 0,
  lastTime: 0,
  velocityX: 0,
  moved: false,
  suppressClickUntil: 0,
  settling: false,
  settleTimer: 0,
  programmatic: false,
  programmaticIndex: -1,
  programmaticTimer: 0,
  stage: null,
  track: null,
  stageBaseIndex: -1,
  stagePrevIndex: -1,
  stageNextIndex: -1
};

function updateEntryWalletPagination(index = entryWalletCurrentBaseIndex()) {
  const position = $('entryWalletPosition');
  const dots = $('entryWalletDots');
  const pagination = $('entryWalletPagination');
  const count = state.wallets.length;
  const safeIndex = count ? Math.max(0, Math.min(count - 1, Number(index) || 0)) : 0;

  if (position) position.textContent = count ? `${safeIndex + 1} / ${count}` : '0 / 0';
  if (pagination) pagination.hidden = count <= 1;
  if (!dots) return;

  const existing = [...dots.children];
  if (existing.length !== count) {
    dots.replaceChildren();
    state.wallets.forEach((wallet) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'entry-wallet-dot';
      dot.setAttribute('aria-label', `Vai a ${wallet.label}`);
      dot.addEventListener('click', () => selectEntryWalletFromRail(wallet.address));
      dots.appendChild(dot);
    });
  }

  [...dots.children].forEach((dot, dotIndex) => {
    const active = dotIndex === safeIndex;
    dot.classList.toggle('active', active);
    dot.setAttribute('aria-current', active ? 'true' : 'false');
  });
}

function entryWalletCenteredScrollLeft(host, row) {
  if (!host || !row) return 0;
  const raw = row.offsetLeft + row.offsetWidth / 2 - host.clientWidth / 2;
  return Math.max(0, Math.min(Math.max(0, host.scrollWidth - host.clientWidth), raw));
}

function entryWalletCurrentBaseIndex() {
  const selected = state.wallets.findIndex((wallet) => wallet.address === state.entrySelectedAddress);
  return selected >= 0 ? selected : 0;
}

function fillEntryOverviewClone(clone, address) {
  if (!clone || !address) return;
  const wallet = state.wallets.find((item) => item.address === address);
  if (!wallet) return;
  const row = state.walletSummaries[wallet.address] || null;
  const total = number(row?.total);
  const worth = total * state.price;
  const q = (id) => clone.querySelector(`#${id}`);
  if (q('entryOverviewWallet')) q('entryOverviewWallet').textContent = wallet.label;
  if (q('entryWalletWorth')) {
    const worthNode = q('entryWalletWorth');
    worthNode.classList.add('number-roll-host');
    renderStableNumberText(worthNode, total > 0 && state.price > 0 ? compactMoney(worth) : '—');
  }
  if (q('entryWalletTotal')) q('entryWalletTotal').textContent = row ? formatInj(total, 4) : 'Sincronizzazione…';
  if (q('entryWalletStaked')) q('entryWalletStaked').textContent = row ? formatInj(number(row.staked), 4) : '—';
  if (q('entryWalletRewards')) q('entryWalletRewards').textContent = row ? formatInj(number(row.rewards), 4) : '—';
  if (q('entryWalletFreshness')) q('entryWalletFreshness').textContent = row?.updated ? formatFreshAge(row.updated) : '—';
  if (q('entryMarketPrice')) {
    const priceNode = q('entryMarketPrice');
    priceNode.classList.add('number-roll-host');
    renderStableNumberText(priceNode, state.price > 0 ? money(state.price, state.price < 10 ? 4 : 3) : '—');
  }
  const change = q('entryMarketChange');
  if (change) {
    const value = Number(state.change);
    change.textContent = state.price > 0 ? `${value > 0 ? '+' : ''}${value.toFixed(2)}% · 24H` : '— · 24H';
    change.className = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
  }
}

function removeEntryWalletCarouselStage() {
  entryWalletGesture.stage?.remove();
  entryWalletGesture.stage = null;
  entryWalletGesture.track = null;
  entryWalletGesture.stageBaseIndex = -1;
  entryWalletGesture.stagePrevIndex = -1;
  entryWalletGesture.stageNextIndex = -1;
  $('entryOverview')?.classList.remove('entry-overview-carousel-active');
}

function createEntryWalletCarouselSlide(address) {
  const overview = $('entryOverview');
  if (!overview || !address) return null;
  const clone = overview.cloneNode(true);
  clone.querySelector('.entry-wallet-card-viewport')?.remove();
  clone.classList.remove('entry-overview-carousel-active');
  fillEntryOverviewClone(clone, address);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  clone.querySelectorAll('[aria-live]').forEach((node) => node.removeAttribute('aria-live'));
  clone.querySelectorAll('button, a, input, select, textarea').forEach((node) => node.setAttribute('tabindex', '-1'));
  clone.setAttribute('aria-hidden', 'true');
  clone.classList.add('entry-wallet-card-slide');
  return clone;
}

function ensureEntryWalletCarouselStage(baseIndex, explicitTargetIndex = -1) {
  const overview = $('entryOverview');
  if (!overview || state.wallets.length < 2) return null;
  const safeBase = Math.max(0, Math.min(state.wallets.length - 1, baseIndex));
  let prevIndex = safeBase - 1;
  let nextIndex = safeBase + 1;
  if (explicitTargetIndex >= 0 && explicitTargetIndex < state.wallets.length) {
    if (explicitTargetIndex < safeBase) prevIndex = explicitTargetIndex;
    if (explicitTargetIndex > safeBase) nextIndex = explicitTargetIndex;
  }

  if (
    entryWalletGesture.stage &&
    entryWalletGesture.stageBaseIndex === safeBase &&
    entryWalletGesture.stagePrevIndex === prevIndex &&
    entryWalletGesture.stageNextIndex === nextIndex
  ) return entryWalletGesture.stage;

  removeEntryWalletCarouselStage();

  const viewport = document.createElement('div');
  viewport.className = 'entry-wallet-card-viewport';
  viewport.setAttribute('aria-hidden', 'true');
  const track = document.createElement('div');
  track.className = 'entry-wallet-card-track';

  [prevIndex, safeBase, nextIndex].forEach((walletIndex) => {
    const slot = document.createElement('div');
    slot.className = 'entry-wallet-card-slot';
    const address = state.wallets[walletIndex]?.address;
    if (address) {
      const slide = createEntryWalletCarouselSlide(address);
      if (slide) slot.appendChild(slide);
    } else {
      slot.classList.add('is-empty');
    }
    track.appendChild(slot);
  });

  viewport.appendChild(track);
  overview.appendChild(viewport);
  overview.classList.add('entry-overview-carousel-active');
  entryWalletGesture.stage = viewport;
  entryWalletGesture.track = track;
  entryWalletGesture.stageBaseIndex = safeBase;
  entryWalletGesture.stagePrevIndex = prevIndex;
  entryWalletGesture.stageNextIndex = nextIndex;
  setEntryWalletTrackProgress(0, false);
  return viewport;
}

function setEntryWalletTrackProgress(progress, animate = false) {
  const track = entryWalletGesture.track;
  if (!track) return;
  const clamped = Math.max(-1, Math.min(1, Number(progress) || 0));
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const duration = reduced ? 0 : 320;
  track.style.transition = animate && duration ? `transform ${duration}ms cubic-bezier(.22,.76,.18,1)` : 'none';
  track.style.webkitTransition = animate && duration ? `-webkit-transform ${duration}ms cubic-bezier(.22,.76,.18,1)` : 'none';
  const x = -100 - clamped * 100;
  track.style.setProperty('transform', `translate3d(${x.toFixed(3)}%,0,0)`, 'important');
  track.style.setProperty('-webkit-transform', `translate3d(${x.toFixed(3)}%,0,0)`, 'important');
}

function resetEntryWalletGestureVisuals({ keepTracking = false } = {}) {
  clearTimeout(entryWalletGesture.settleTimer);
  clearTimeout(entryWalletGesture.programmaticTimer);
  entryWalletGesture.settleTimer = 0;
  entryWalletGesture.programmaticTimer = 0;
  removeEntryWalletCarouselStage();
  const host = $('entryWallets');
  host?.classList.remove('wallet-gesture-active', 'wallet-programmatic-scroll');
  entryWalletGesture.active = false;
  entryWalletGesture.settling = false;
  entryWalletGesture.programmatic = false;
  entryWalletGesture.programmaticIndex = -1;
  updateEntryWalletPagination(entryWalletCurrentBaseIndex());
  if (!keepTracking) {
    entryWalletGesture.tracking = false;
    entryWalletGesture.baseIndex = -1;
    entryWalletGesture.targetIndex = -1;
    entryWalletGesture.velocityX = 0;
  }
}

function commitEntryWalletCarousel(index) {
  const host = $('entryWallets');
  const rows = host ? [...host.querySelectorAll('.entry-wallet-row')] : [];
  const safeIndex = Math.max(0, Math.min(state.wallets.length - 1, Number(index) || 0));
  const address = state.wallets[safeIndex]?.address;
  if (address) setEntryWalletSelection(address, { scroll: false });
  if (host && rows[safeIndex]) host.scrollLeft = entryWalletCenteredScrollLeft(host, rows[safeIndex]);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    removeEntryWalletCarouselStage();
    entryWalletGesture.active = false;
    entryWalletGesture.tracking = false;
    entryWalletGesture.settling = false;
    entryWalletGesture.programmatic = false;
    entryWalletGesture.programmaticIndex = -1;
    entryWalletGesture.baseIndex = safeIndex;
    entryWalletGesture.targetIndex = safeIndex;
    entryWalletGesture.velocityX = 0;
    host?.classList.remove('wallet-gesture-active', 'wallet-programmatic-scroll');
    updateEntryWalletPagination(safeIndex);
    renderEntryOverview();
  }));
}

function finishEntryWalletProgrammaticScroll() {
  clearTimeout(entryWalletGesture.programmaticTimer);
  entryWalletGesture.programmaticTimer = 0;
  const index = entryWalletGesture.programmaticIndex;
  if (!(index >= 0 && index < state.wallets.length)) return resetEntryWalletGestureVisuals();
  commitEntryWalletCarousel(index);
}

function selectEntryWalletFromRail(address) {
  const index = state.wallets.findIndex((wallet) => wallet.address === address);
  if (index < 0) return;
  const host = $('entryWallets');
  if (!host || state.wallets.length < 2) {
    setEntryWalletSelection(address, { scroll: false });
    return;
  }

  const rows = [...host.querySelectorAll('.entry-wallet-row')];
  const targetRow = rows[index];
  if (!targetRow) return;
  const baseIndex = entryWalletCurrentBaseIndex();

  clearTimeout(entryWalletGesture.programmaticTimer);
  clearTimeout(entryWalletGesture.settleTimer);
  resetEntryWalletGestureVisuals();

  if (index === baseIndex) {
    entryWalletGesture.programmatic = true;
    entryWalletGesture.programmaticIndex = index;
    host.classList.add('wallet-programmatic-scroll');
    host.scrollTo({ left: entryWalletCenteredScrollLeft(host, targetRow), behavior: 'smooth' });
    entryWalletGesture.programmaticTimer = window.setTimeout(finishEntryWalletProgrammaticScroll, 360);
    return;
  }

  entryWalletGesture.programmatic = true;
  entryWalletGesture.programmaticIndex = index;
  entryWalletGesture.baseIndex = baseIndex;
  entryWalletGesture.targetIndex = index;
  host.classList.add('wallet-programmatic-scroll');
  ensureEntryWalletCarouselStage(baseIndex, index);
  updateEntryWalletPagination(index);
  void entryWalletGesture.stage?.offsetWidth;
  const direction = index > baseIndex ? 1 : -1;
  requestAnimationFrame(() => {
    setEntryWalletTrackProgress(direction, true);
    host.scrollTo({ left: entryWalletCenteredScrollLeft(host, targetRow), behavior: 'smooth' });
  });
  entryWalletGesture.programmaticTimer = window.setTimeout(finishEntryWalletProgrammaticScroll, 370);
}

function ensureEntryWalletGestureTracking() {
  if (entryWalletGesture.tracking) return;
  entryWalletGesture.tracking = true;
  entryWalletGesture.baseIndex = entryWalletCurrentBaseIndex();
  entryWalletGesture.targetIndex = entryWalletGesture.baseIndex;
}

function updateEntryWalletGesturePreview() {
  const host = $('entryWallets');
  if (!host || state.wallets.length < 2 || entryWalletGesture.programmatic) return;
  ensureEntryWalletGestureTracking();
  const rows = [...host.querySelectorAll('.entry-wallet-row')];
  const baseIndex = Math.max(0, Math.min(rows.length - 1, entryWalletGesture.baseIndex));
  const baseRow = rows[baseIndex];
  if (!baseRow) return;

  const baseLeft = entryWalletCenteredScrollLeft(host, baseRow);
  const delta = host.scrollLeft - baseLeft;
  const direction = delta > 0.5 ? 1 : delta < -0.5 ? -1 : 0;
  const previewIndex = baseIndex + direction;

  if (!direction || previewIndex < 0 || previewIndex >= rows.length) {
    if (entryWalletGesture.track) setEntryWalletTrackProgress(0, false);
    updateEntryWalletPagination(baseIndex);
    return;
  }

  const previewLeft = entryWalletCenteredScrollLeft(host, rows[previewIndex]);
  const step = Math.max(1, Math.abs(previewLeft - baseLeft));
  const progress = Math.max(-1, Math.min(1, delta / step));
  ensureEntryWalletCarouselStage(baseIndex);
  setEntryWalletTrackProgress(progress, false);
  updateEntryWalletPagination(Math.abs(progress) >= 0.5 ? previewIndex : baseIndex);
}

function finalizeEntryWalletGesture() {
  clearTimeout(entryWalletGesture.settleTimer);
  entryWalletGesture.settleTimer = 0;
  const index = entryWalletGesture.targetIndex;
  if (!(index >= 0 && index < state.wallets.length)) return resetEntryWalletGestureVisuals();
  commitEntryWalletCarousel(index);
}

function settleEntryWalletGesture(index, { behavior = 'smooth' } = {}) {
  const host = $('entryWallets');
  if (!host) return;
  const rows = [...host.querySelectorAll('.entry-wallet-row')];
  if (!rows.length) return;
  const safeIndex = Math.max(0, Math.min(rows.length - 1, index));
  const baseIndex = Math.max(0, Math.min(rows.length - 1, entryWalletGesture.baseIndex >= 0 ? entryWalletGesture.baseIndex : entryWalletCurrentBaseIndex()));
  entryWalletGesture.targetIndex = safeIndex;
  entryWalletGesture.settling = true;
  entryWalletGesture.tracking = true;
  entryWalletGesture.baseIndex = baseIndex;
  host.classList.add('wallet-gesture-active');
  if (safeIndex !== baseIndex) ensureEntryWalletCarouselStage(baseIndex);
  const left = entryWalletCenteredScrollLeft(host, rows[safeIndex]);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const scrollBehavior = reduced ? 'auto' : behavior;
  host.scrollTo({ left, behavior: scrollBehavior });
  clearTimeout(entryWalletGesture.settleTimer);
  const alreadyThere = Math.abs(host.scrollLeft - left) < 1;
  entryWalletGesture.settleTimer = window.setTimeout(finalizeEntryWalletGesture, alreadyThere || scrollBehavior === 'auto' ? 60 : 700);
}

function settleEntryWalletRailToNearest() {
  const host = $('entryWallets');
  if (!host || entryWalletGesture.active || entryWalletGesture.programmatic || entryWalletGesture.settling) return;
  const rows = [...host.querySelectorAll('.entry-wallet-row')];
  if (!rows.length) return;
  const center = host.scrollLeft + host.clientWidth / 2;
  let best = 0;
  let distance = Infinity;
  rows.forEach((row, index) => {
    const next = Math.abs(row.offsetLeft + row.offsetWidth / 2 - center);
    if (next < distance) { distance = next; best = index; }
  });
  entryWalletGesture.baseIndex = entryWalletCurrentBaseIndex();
  settleEntryWalletGesture(best, { behavior: 'smooth' });
}

function handleEntryWalletRailScroll() {
  if (entryWalletGesture.programmatic) {
    updateEntryWalletPagination(entryWalletGesture.programmaticIndex);
    return;
  }
  if (entryWalletScrollFrame) cancelAnimationFrame(entryWalletScrollFrame);
  entryWalletScrollFrame = requestAnimationFrame(() => {
    entryWalletScrollFrame = 0;
    updateEntryWalletGesturePreview();
  });

  clearTimeout(entryWalletGesture.settleTimer);
  if (entryWalletGesture.settling) {
    entryWalletGesture.settleTimer = window.setTimeout(finalizeEntryWalletGesture, 120);
  } else if (!entryWalletGesture.active) {
    entryWalletGesture.settleTimer = window.setTimeout(settleEntryWalletRailToNearest, 150);
  }
}

function bindEntryWalletRailGestures(host) {
  if (!host || host.dataset.walletGestureBound === '1') return;
  host.dataset.walletGestureBound = '1';
  host.addEventListener('scroll', handleEntryWalletRailScroll, { passive: true });

  let mousePointerId = null;
  const begin = (x, isMouse = false) => {
    if (!Number.isFinite(x) || state.wallets.length < 2) return;
    clearTimeout(entryWalletGesture.programmaticTimer);
    clearTimeout(entryWalletGesture.settleTimer);
    entryWalletGesture.programmaticTimer = 0;
    entryWalletGesture.settleTimer = 0;
    removeEntryWalletCarouselStage();
    entryWalletGesture.programmatic = false;
    entryWalletGesture.programmaticIndex = -1;
    host.classList.remove('wallet-programmatic-scroll');
    const base = entryWalletCurrentBaseIndex();
    const rows = [...host.querySelectorAll('.entry-wallet-row')];
    if (rows[base]) host.scrollLeft = entryWalletCenteredScrollLeft(host, rows[base]);
    entryWalletGesture.active = true;
    entryWalletGesture.tracking = true;
    entryWalletGesture.baseIndex = base;
    entryWalletGesture.targetIndex = base;
    entryWalletGesture.startX = x;
    entryWalletGesture.startScrollLeft = host.scrollLeft;
    entryWalletGesture.lastX = x;
    entryWalletGesture.startTime = performance.now();
    entryWalletGesture.lastTime = entryWalletGesture.startTime;
    entryWalletGesture.velocityX = 0;
    entryWalletGesture.moved = false;
    entryWalletGesture.settling = false;
    host.classList.add('wallet-gesture-active');
    if (isMouse) host.classList.add('wallet-mouse-dragging');
  };

  const move = (x, isMouse = false) => {
    if (!entryWalletGesture.active || !Number.isFinite(x)) return;
    const now = performance.now();
    const dt = Math.max(1, now - entryWalletGesture.lastTime);
    const instant = (x - entryWalletGesture.lastX) / dt;
    entryWalletGesture.velocityX = entryWalletGesture.velocityX * 0.35 + instant * 0.65;
    entryWalletGesture.lastX = x;
    entryWalletGesture.lastTime = now;
    const dx = x - entryWalletGesture.startX;
    if (Math.abs(dx) >= 8) entryWalletGesture.moved = true;
    if (isMouse && entryWalletGesture.moved) host.scrollLeft = entryWalletGesture.startScrollLeft - dx;
  };

  const end = () => {
    if (!entryWalletGesture.active) return;
    entryWalletGesture.active = false;
    host.classList.remove('wallet-mouse-dragging');
    const rows = [...host.querySelectorAll('.entry-wallet-row')];
    const base = entryWalletGesture.baseIndex;
    if (!rows.length || base < 0) return resetEntryWalletGestureVisuals();

    const baseLeft = entryWalletCenteredScrollLeft(host, rows[base]);
    const directionFromScroll = host.scrollLeft > baseLeft + 0.5 ? 1 : host.scrollLeft < baseLeft - 0.5 ? -1 : 0;
    const neighbor = Math.max(0, Math.min(rows.length - 1, base + directionFromScroll));
    const neighborLeft = entryWalletCenteredScrollLeft(host, rows[neighbor]);
    const step = Math.max(1, Math.abs(neighborLeft - baseLeft));
    const progress = directionFromScroll ? (host.scrollLeft - baseLeft) / step : 0;
    const duration = Math.max(1, performance.now() - entryWalletGesture.startTime);
    const totalDx = entryWalletGesture.lastX - entryWalletGesture.startX;
    const fastFlick = Math.abs(entryWalletGesture.velocityX) >= 0.38 || (Math.abs(totalDx) >= 24 && duration <= 260);
    if (entryWalletGesture.moved || fastFlick) entryWalletGesture.suppressClickUntil = performance.now() + 460;

    let target = base;
    if (fastFlick) {
      target = base + (entryWalletGesture.velocityX < -0.05 || totalDx < -12 ? 1 : -1);
    } else if (Math.abs(progress) >= 0.32) {
      target = base + (progress > 0 ? 1 : -1);
    }
    target = Math.max(0, Math.min(rows.length - 1, target));
    settleEntryWalletGesture(target, { behavior: 'smooth' });
  };

  host.addEventListener('touchstart', (event) => begin(event.touches?.[0]?.clientX, false), { passive: true });
  host.addEventListener('touchmove', (event) => move(event.touches?.[0]?.clientX, false), { passive: true });
  host.addEventListener('touchend', end, { passive: true });
  host.addEventListener('touchcancel', end, { passive: true });

  host.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') return;
    mousePointerId = event.pointerId;
    try { host.setPointerCapture(event.pointerId); } catch (_) {}
    begin(event.clientX, true);
  });
  host.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' && mousePointerId === event.pointerId) move(event.clientX, true);
  });
  host.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'mouse' || mousePointerId !== event.pointerId) return;
    mousePointerId = null;
    end();
  });
  host.addEventListener('pointercancel', (event) => {
    if (event.pointerType !== 'mouse' || mousePointerId !== event.pointerId) return;
    mousePointerId = null;
    end();
  });
}


// v15.98.28 — The large active-wallet card is itself a wallet carousel surface.
// Horizontal intent changes account; vertical intent is deliberately left to the
// browser so page scrolling remains native and reliable on iOS.
const entryOverviewSwipe = {
  pointerId: null,
  baseIndex: -1,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastAt: 0,
  velocityX: 0,
  horizontal: false
};

function resetEntryOverviewSwipe(removeStage = true) {
  const overview = $('entryOverview');
  overview?.classList.remove('entry-overview-swipe-active');
  entryOverviewSwipe.pointerId = null;
  entryOverviewSwipe.baseIndex = -1;
  entryOverviewSwipe.horizontal = false;
  entryOverviewSwipe.velocityX = 0;
  if (removeStage) removeEntryWalletCarouselStage();
}

function bindEntryOverviewWalletGestures() {
  const overview = $('entryOverview');
  if (!overview || overview.dataset.walletSwipeBound === '1') return;
  overview.dataset.walletSwipeBound = '1';

  overview.addEventListener('pointerdown', (event) => {
    if (state.currentView !== 'home' || state.wallets.length < 2) return;
    if (event.target?.closest?.('button, a, input, select, textarea, [role="button"]')) return;
    if (entryWalletGesture.programmatic || entryWalletGesture.settling) return;

    entryOverviewSwipe.pointerId = event.pointerId;
    entryOverviewSwipe.baseIndex = entryWalletCurrentBaseIndex();
    entryOverviewSwipe.startX = event.clientX;
    entryOverviewSwipe.startY = event.clientY;
    entryOverviewSwipe.lastX = event.clientX;
    entryOverviewSwipe.lastAt = performance.now();
    entryOverviewSwipe.velocityX = 0;
    entryOverviewSwipe.horizontal = false;
  }, { passive: true });

  overview.addEventListener('pointermove', (event) => {
    if (event.pointerId !== entryOverviewSwipe.pointerId || entryOverviewSwipe.baseIndex < 0) return;
    const dx = event.clientX - entryOverviewSwipe.startX;
    const dy = event.clientY - entryOverviewSwipe.startY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    if (!entryOverviewSwipe.horizontal) {
      if (Math.max(ax, ay) < 8) return;
      // Vertical/diagonal scrolling always wins unless horizontal intent is clear.
      if (ay > ax * 1.08) {
        resetEntryOverviewSwipe(false);
        return;
      }
      if (ax <= ay * 1.08) return;
      entryOverviewSwipe.horizontal = true;
      overview.classList.add('entry-overview-swipe-active');
      ensureEntryWalletCarouselStage(entryOverviewSwipe.baseIndex);
      try { overview.setPointerCapture?.(event.pointerId); } catch (_) {}
    }

    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - entryOverviewSwipe.lastAt);
    const instant = (event.clientX - entryOverviewSwipe.lastX) / dt;
    entryOverviewSwipe.velocityX = entryOverviewSwipe.velocityX * .42 + instant * .58;
    entryOverviewSwipe.lastX = event.clientX;
    entryOverviewSwipe.lastAt = now;

    const width = Math.max(1, overview.getBoundingClientRect().width);
    let progress = -dx / width;
    if ((entryOverviewSwipe.baseIndex === 0 && progress < 0) ||
        (entryOverviewSwipe.baseIndex === state.wallets.length - 1 && progress > 0)) {
      progress *= .22; // soft edge resistance
    }
    setEntryWalletTrackProgress(Math.max(-1, Math.min(1, progress)), false);

    const preview = Math.max(0, Math.min(state.wallets.length - 1,
      entryOverviewSwipe.baseIndex + (progress > .18 ? 1 : progress < -.18 ? -1 : 0)));
    updateEntryWalletPagination(preview);
  }, { passive: false });

  const finish = (event, cancelled = false) => {
    if (event?.pointerId !== undefined && event.pointerId !== entryOverviewSwipe.pointerId) return;
    const overview = $('entryOverview');
    const base = entryOverviewSwipe.baseIndex;
    // Clear first so releasePointerCapture cannot re-enter through lostpointercapture.
    entryOverviewSwipe.pointerId = null;
    const wasHorizontal = entryOverviewSwipe.horizontal;
    const dx = Number(event?.clientX) - entryOverviewSwipe.startX;
    const safeDx = Number.isFinite(dx) ? dx : (entryOverviewSwipe.lastX - entryOverviewSwipe.startX);
    const velocity = entryOverviewSwipe.velocityX;

    try {
      if (event && overview?.hasPointerCapture?.(event.pointerId)) overview.releasePointerCapture?.(event.pointerId);
    } catch (_) {}

    if (!wasHorizontal || base < 0 || cancelled) {
      resetEntryOverviewSwipe(true);
      updateEntryWalletPagination(entryWalletCurrentBaseIndex());
      return;
    }

    const width = Math.max(1, overview?.getBoundingClientRect().width || 1);
    const fastFlick = Math.abs(velocity) >= .42 || Math.abs(safeDx) >= Math.min(58, width * .18);
    const crossed = Math.abs(safeDx) >= width * .24;
    const direction = safeDx < 0 ? 1 : -1;
    let target = base;
    if (fastFlick || crossed) target = Math.max(0, Math.min(state.wallets.length - 1, base + direction));

    entryWalletGesture.suppressClickUntil = performance.now() + 520;
    updateEntryWalletPagination(target);
    setEntryWalletTrackProgress(target === base ? 0 : (target > base ? 1 : -1), true);
    overview?.classList.remove('entry-overview-swipe-active');
    entryOverviewSwipe.horizontal = false;
    entryOverviewSwipe.baseIndex = -1;

    window.setTimeout(() => commitEntryWalletCarousel(target), 325);
  };

  overview.addEventListener('pointerup', (event) => finish(event, false));
  overview.addEventListener('pointercancel', (event) => finish(event, true));
  overview.addEventListener('lostpointercapture', (event) => {
    if (entryOverviewSwipe.pointerId !== null && event.pointerId === entryOverviewSwipe.pointerId) finish(event, true);
  });
}

function setEntryWalletSelection(address, { scroll = false } = {}) {
  if (!address || !state.wallets.some((wallet) => wallet.address === address)) return;
  const nextIndex = state.wallets.findIndex((wallet) => wallet.address === address);
  state.entrySelectedAddress = address;
  updateEntryWalletPagination(nextIndex);

  const host = $('entryWallets');
  if (host) {
    host.querySelectorAll('.entry-wallet-row').forEach((row) => {
      const selected = row.dataset.address === address;
      row.classList.toggle('selected', selected);
      const button = row.querySelector('.entry-wallet');
      button?.classList.toggle('selected', selected);
      button?.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  if (!entryWalletGesture.active && !entryWalletGesture.programmatic) renderEntryOverview();

  // Keep the Home Control Center aligned with the selected carousel wallet.
  renderMenuWalletContext();
  renderAveragePriceControl();
  syncHomeCommandCenter();

  if (scroll && host) {
    const row = [...host.querySelectorAll('.entry-wallet-row')].find((item) => item.dataset.address === address);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function renderEntryGate() {
  const shell = $('entryGate')?.querySelector('.entry-gate-shell');
  const host = $('entryWallets');
  const hint = $('entryWalletHint');
  const liveButton = $('entryLiveButton');
  const pulseButton = $('entryPulseButton');
  const liveChartsButton = $('entryLiveChartsButton');
  const orderBookButton = $('entryOrderBookButton');
  const performanceButton = $('entryPerformanceButton');
  const converterButton = $('entryConverterButton');
  const commandCenterButton = $('entryCommandCenterButton');
  if (!shell || !host || !hint || !liveButton || !pulseButton || !liveChartsButton || !orderBookButton || !commandCenterButton) return;
  const firstAccess = state.wallets.length === 0;
  shell.classList.toggle('first-access', firstAccess);

  if (firstAccess) {
    state.entrySelectedAddress = '';
    host.replaceChildren();
    updateEntryWalletPagination(0);
    liveButton.disabled = true;
    pulseButton.disabled = true;
    liveChartsButton.disabled = true;
    orderBookButton.disabled = true;
    if (performanceButton) performanceButton.disabled = true;
    commandCenterButton.disabled = true;
    const input = $('entryWalletInput');
    const nameInput = $('entryWalletName');
    if (input && document.activeElement !== input) input.value = '';
    if (nameInput && document.activeElement !== nameInput) nameInput.value = '';
    setEntryOnboardingStatus('Puoi scegliere un nome riconoscibile. L’indirizzo resta salvato solo su questo dispositivo.');
    renderEntryOverview();
    syncHomeCommandCenter();
    return;
  }

  if (!state.wallets.some((wallet) => wallet.address === state.entrySelectedAddress)) {
    const preferred = state.wallets.find((wallet) => wallet.address === state.address) || state.wallets[0];
    state.entrySelectedAddress = preferred?.address || '';
  }

  host.replaceChildren();
  hint.textContent = state.wallets.length === 1 ? '1 wallet salvato' : `${state.wallets.length} wallet · scorri o lancia`;
  $('entryNote').textContent = 'Wallet e preferenze restano solo su questo dispositivo.';
  liveButton.disabled = false;
  pulseButton.disabled = false;
  liveChartsButton.disabled = false;
  orderBookButton.disabled = false;
  if (performanceButton) performanceButton.disabled = false;
  if (converterButton) converterButton.disabled = false;
  commandCenterButton.disabled = false;

  state.wallets.forEach((wallet) => {
    const selected = wallet.address === state.entrySelectedAddress;
    const row = state.walletSummaries[wallet.address];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `entry-wallet ${selected ? 'selected' : ''}`.trim();
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.setAttribute('aria-label', `Seleziona ${wallet.label}`);

    const dot = document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = wallet.label;
    const address = document.createElement('small');
    address.textContent = shortAddress(wallet.address);
    copy.append(name, address);

    const meta = document.createElement('em');
    meta.className = 'private';
    meta.textContent = row?.total > 0 ? `${number(row.total).toLocaleString('it-IT', { maximumFractionDigits: 2 })} INJ` : '—';

    button.append(dot, copy, meta);
    button.addEventListener('click', () => {
      if (performance.now() < entryWalletGesture.suppressClickUntil) return;
      selectEntryWalletFromRail(wallet.address);
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'entry-wallet-rename';
    rename.title = `Rinomina ${wallet.label}`;
    rename.setAttribute('aria-label', `Rinomina ${wallet.label}`);
    rename.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
    rename.addEventListener('click', () => {
      if (performance.now() < entryWalletGesture.suppressClickUntil) return;
      openWalletManager(wallet.address);
    });

    const wrapper = document.createElement('div');
    wrapper.className = `entry-wallet-row ${selected ? 'selected' : ''}`.trim();
    wrapper.dataset.address = wallet.address;
    // v15.99.2 — Desktop-safe wallet selection: the full row is clickable.
    // Drag/flick still wins because synthetic clicks are suppressed after movement.
    wrapper.addEventListener('click', (event) => {
      if (event.target?.closest?.('.entry-wallet, .entry-wallet-rename')) return;
      if (performance.now() < entryWalletGesture.suppressClickUntil) return;
      selectEntryWalletFromRail(wallet.address);
    });
    wrapper.append(button, rename);
    host.appendChild(wrapper);
  });

  updateEntryWalletPagination(entryWalletCurrentBaseIndex());

  // v15.89: the rail drives the active-wallet card continuously. Side peeks and
  // pagination make additional accounts visible; a fast flick advances exactly
  // one wallet while a short/slow drag springs back unless the commit threshold
  // is crossed.
  host.onscroll = null;
  bindEntryWalletRailGestures(host);

  // Keep the selected wallet visible after a rebuild without disturbing a user's swipe.
  requestAnimationFrame(() => {
    const selectedRow = [...host.querySelectorAll('.entry-wallet-row')].find((row) => row.dataset.address === state.entrySelectedAddress);
    if (selectedRow && state.wallets.length > 1) selectedRow.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
  });

  renderEntryOverview();
  syncHomeCommandCenter();
}

function selectedEntrySummary() {
  const wallet = selectedEntryWallet();
  if (!wallet) return { wallet: null, row: null };
  return { wallet, row: state.walletSummaries[wallet.address] || null };
}

function overallSystemSnapshot() {
  const now = Date.now();
  const online = navigator.onLine !== false;
  const marketAge = state.lastMarketUpdate ? now - state.lastMarketUpdate : Infinity;
  const walletAge = state.lastWalletUpdate ? now - state.lastWalletUpdate : Infinity;
  const aprAge = state.networkAprUpdated ? now - state.networkAprUpdated : Infinity;
  const wsOpen = Boolean(state.socket && state.socket.readyState === WebSocket.OPEN);
  const internet = { mode: online ? 'online' : 'offline', state: online ? 'ONLINE' : 'OFFLINE', meta: online ? 'Connessione disponibile' : 'Nessuna connessione' };
  const market = !online
    ? { mode: 'offline', state: 'OFFLINE', meta: 'Nessuna connessione' }
    : wsOpen && marketAge < 20_000
      ? { mode: 'online', state: 'LIVE', meta: `Ultimo tick ${formatFreshAge(state.lastMarketUpdate)}` }
      : marketAge < 65_000
        ? { mode: 'warn', state: 'RICONNESSIONE', meta: `Ultimo dato ${formatFreshAge(state.lastMarketUpdate)}` }
        : { mode: 'offline', state: 'NON DISPONIBILE', meta: state.lastMarketUpdate ? `Ultimo dato ${formatFreshAge(state.lastMarketUpdate)}` : 'In attesa del mercato' };
  const lcd = !state.address
    ? { mode: online ? 'warn' : 'offline', state: 'IN ATTESA', meta: 'Seleziona un wallet' }
    : !online
      ? { mode: 'offline', state: 'OFFLINE', meta: 'Nessuna connessione' }
      : state.endpoint && walletAge < 75_000
        ? { mode: 'online', state: 'ONLINE', meta: `${new URL(state.endpoint).hostname} · ${formatFreshAge(state.lastWalletUpdate)}` }
        : walletAge < 5 * 60_000
          ? { mode: 'warn', state: 'LENTO', meta: state.lastWalletUpdate ? `Wallet ${formatFreshAge(state.lastWalletUpdate)}` : 'Sincronizzazione…' }
          : { mode: 'offline', state: 'NON DISPONIBILE', meta: 'Wallet non aggiornato' };
  const apr = !online
    ? { mode: 'offline', state: 'OFFLINE', meta: 'Nessuna connessione' }
    : state.networkAprUpdated && aprAge < 10 * 60_000
      ? { mode: 'online', state: 'ONLINE', meta: `APR ${formatFreshAge(state.networkAprUpdated)}` }
      : state.networkApr > 0
        ? { mode: 'warn', state: 'CACHE', meta: 'Valore precedente disponibile' }
        : { mode: 'warn', state: 'IN ATTESA', meta: 'Calcolo APR in corso' };
  const services = { internet, market, lcd, apr };
  const modes = Object.values(services).map((item) => item.mode);
  const overall = modes.includes('offline') ? (online ? 'warn' : 'offline') : modes.includes('warn') ? 'warn' : 'online';
  return { overall, services };
}

function systemCopy(mode) {
  return mode === 'online' ? 'SYSTEM · OK' : mode === 'warn' ? 'SYSTEM · ATTENZIONE' : 'SYSTEM · OFFLINE';
}

function setEntryAnimatedValue(id, text, numericValue, { directional = false, roll = false, stableDigits = false } = {}) {
  const element = $(id);
  if (!element) return;

  const nextText = String(text);
  const previousText = element.dataset.entryRenderedValue;
  const next = Number(numericValue);
  const previous = element.dataset.entryNumericValue === undefined ? NaN : Number(element.dataset.entryNumericValue);
  const visibleChange = previousText !== undefined && previousText !== nextText;
  const numericChange = Number.isFinite(previous) && Number.isFinite(next) &&
    Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);

  // v15.98.17 — Home wallet switches keep the exact odometer geometry but do
  // not animate from the previous wallet's worth. Live market changes on the
  // same wallet still use the per-digit roll.
  if (roll && state.marketMotionRendering) {
    clearTimeout(element._verticalRollTimer);
    element._verticalRollTimer = null;
    element.classList.add('number-roll-host');
    renderStableNumberText(element, nextText);
  } else if (roll) animateVerticalNumberRoll(element, previousText, nextText, previous, next);
  else if (stableDigits) {
    clearTimeout(element._verticalRollTimer);
    element._verticalRollTimer = null;
    element.classList.add('number-roll-host');
    renderStableNumberText(element, nextText);
  } else {
    clearTimeout(element._verticalRollTimer);
    element._verticalRollTimer = null;
    element.textContent = nextText;
  }

  if (!state.suppressEffects && !state.marketMotionRendering && visibleChange && directional && numericChange) {
    clearTimeout(element._entryValueTimer);
    element.classList.remove('entry-value-up', 'entry-value-down');
    void element.offsetWidth;
    element.classList.add(next > previous ? 'entry-value-up' : 'entry-value-down');
    element._entryValueTimer = window.setTimeout(() => {
      element.classList.remove('entry-value-up', 'entry-value-down');
    }, 520);
  }

  element.dataset.entryRenderedValue = nextText;
  if (Number.isFinite(next)) element.dataset.entryNumericValue = String(next);
  else delete element.dataset.entryNumericValue;
}

function renderEntryOverview() {
  const overview = $('entryOverview');
  if (!overview) return;
  const { wallet, row } = selectedEntrySummary();
  if (!wallet) return;
  const total = number(row?.total);
  const worth = total * state.price;
  $('entryOverviewWallet').textContent = wallet.label;
  const entryWorth = $('entryWalletWorth');
  const sameWorthWallet = entryWorth?.dataset.walletAddress === wallet.address;
  setEntryAnimatedValue(
    'entryWalletWorth',
    total > 0 && state.price > 0 ? compactMoney(worth) : '—',
    worth,
    { roll: Boolean(sameWorthWallet), stableDigits: true }
  );
  if (entryWorth) entryWorth.dataset.walletAddress = wallet.address;
  setEntryAnimatedValue('entryWalletTotal', row ? formatInj(total, 4) : 'Sincronizzazione…', total);
  setEntryAnimatedValue('entryWalletStaked', row ? formatInj(number(row.staked), 4) : '—', number(row?.staked));
  setEntryAnimatedValue('entryWalletRewards', row ? formatInj(number(row.rewards), 4) : '—', number(row?.rewards), { directional: true });
  $('entryWalletFreshness').textContent = row?.updated ? formatFreshAge(row.updated) : '—';
  setEntryAnimatedValue('entryMarketPrice', state.price > 0 ? money(state.price, state.price < 10 ? 4 : 3) : '—', state.price, { directional: true, roll: true });
  const change = $('entryMarketChange');
  const changeValue = Number(state.change);
  if (change) {
    change.className = changeValue > 0 ? 'positive' : changeValue < 0 ? 'negative' : 'neutral';
    setEntryAnimatedValue('entryMarketChange', state.price > 0 ? `${changeValue > 0 ? '+' : ''}${changeValue.toFixed(2)}% · 24H` : '— · 24H', state.price > 0 ? changeValue : NaN, { directional: true });
  }
  const snapshot = overallSystemSnapshot();
  const gate = $('entryGate');
  if (gate) {
    gate.classList.toggle('market-positive', changeValue > 0);
    gate.classList.toggle('market-negative', changeValue < 0);
    gate.classList.toggle('market-neutral', changeValue === 0 || !Number.isFinite(changeValue));
  }
  const pill = $('entrySystemStatusButton');
  if (pill) pill.className = `entry-system-pill ${snapshot.overall}`;
  if ($('entrySystemStatusText')) $('entrySystemStatusText').textContent = systemCopy(snapshot.overall);
  renderEntryAtGlance();
  renderEntryDesktopMetrics();
  renderEntryConverter();
  renderEntryMarketMatrix();
  renderEntryPnlTimeline();
}

function parseEntryConverterValue(raw) {
  const normalized = String(raw ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return NaN;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

function formatEntryConverterInput(value, kind) {
  if (!Number.isFinite(value) || value < 0) return '';
  const digits = kind === 'INJ' ? (value < 1 ? 6 : 4) : (value < 1 ? 4 : 2);
  return value.toFixed(digits).replace(/\.?0+$/, '').replace('.', ',');
}

function entryConverterValues() {
  const source = state.converter?.source || 'EUR';
  const value = number(state.converter?.value);
  const eurPerUsd = number(state.eurRate);
  const injUsd = number(state.price);
  let eur = 0, usd = 0, inj = 0;
  if (source === 'USD') {
    usd = value;
    eur = eurPerUsd > 0 ? usd * eurPerUsd : NaN;
    inj = injUsd > 0 ? usd / injUsd : NaN;
  } else if (source === 'INJ') {
    inj = value;
    usd = injUsd > 0 ? inj * injUsd : NaN;
    eur = Number.isFinite(usd) && eurPerUsd > 0 ? usd * eurPerUsd : NaN;
  } else {
    eur = value;
    usd = eurPerUsd > 0 ? eur / eurPerUsd : NaN;
    inj = Number.isFinite(usd) && injUsd > 0 ? usd / injUsd : NaN;
  }
  return { EUR: eur, USD: usd, INJ: inj };
}

function renderEntryConverter() {
  const host = $('entryConverter');
  if (!host) return;
  const price = number(state.price);
  const eurPerUsd = number(state.eurRate);
  const usdPerEur = eurPerUsd > 0 ? 1 / eurPerUsd : 0;
  const priceNode = $('entryConverterPrice');
  if (priceNode) priceNode.textContent = price > 0 ? `INJ $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: price < 10 ? 4 : 2 })}` : 'INJ $—';
  const rateNode = $('entryConverterRate');
  if (rateNode) rateNode.textContent = usdPerEur > 0 ? `1 € = ${usdPerEur.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} $` : '1 € = — $';
  const meta = $('entryConverterMeta');
  if (meta) {
    const eurPrice = price > 0 && eurPerUsd > 0 ? price * eurPerUsd : 0;
    meta.textContent = price > 0 ? `1 INJ = $${price.toFixed(price < 10 ? 4 : 2)}${eurPrice > 0 ? ` · €${eurPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : ''}` : 'Prezzo INJ in attesa…';
  }

  const fields = {
    EUR: $('entryConverterEur'),
    USD: $('entryConverterUsd'),
    INJ: $('entryConverterInj')
  };
  const hasValue = Boolean(state.converter?.hasValue);
  if (!hasValue) {
    for (const [kind, input] of Object.entries(fields)) {
      if (!input || (document.activeElement === input && state.converter?.source === kind)) continue;
      input.value = '';
    }
    return;
  }
  const values = entryConverterValues();
  for (const [kind, input] of Object.entries(fields)) {
    if (!input) continue;
    if (document.activeElement === input && state.converter?.source === kind) continue;
    input.value = formatEntryConverterInput(values[kind], kind);
  }
}

function bindEntryConverter() {
  const fields = {
    EUR: $('entryConverterEur'),
    USD: $('entryConverterUsd'),
    INJ: $('entryConverterInj')
  };
  Object.entries(fields).forEach(([kind, input]) => {
    if (!input) return;
    input.addEventListener('focus', () => {
      const parsed = parseEntryConverterValue(input.value);
      if (Number.isFinite(parsed)) {
        state.converter.source = kind;
        state.converter.value = parsed;
        state.converter.hasValue = true;
      }
    });
    input.addEventListener('input', () => {
      const parsed = parseEntryConverterValue(input.value);
      state.converter.source = kind;
      state.converter.hasValue = Number.isFinite(parsed);
      state.converter.value = Number.isFinite(parsed) ? parsed : 0;
      renderEntryConverter();
    });
    input.addEventListener('blur', () => {
      if (state.converter?.hasValue && state.converter?.source === kind) {
        const values = entryConverterValues();
        input.value = formatEntryConverterInput(values[kind], kind);
      }
    });
  });
  renderEntryConverter();
}

function renderEntryDesktopMetrics() {
  const host = $('entryDesktopMetrics');
  if (!host) return;
  const { wallet, row } = selectedEntrySummary();
  if (!wallet) return;

  const available = number(row?.available);
  const staked = number(row?.staked);
  const total = number(row?.total);
  const cachedApr = number(row?.personalApr);
  const apr = cachedApr > 0 ? cachedApr : (wallet.address === state.address ? number(state.personalApr) : 0);
  const stakingRatio = total > 0 ? (staked / total) * 100 : 0;
  const dailyReward = staked > 0 && apr > 0 ? staked * (apr / 100) / 365 : 0;

  setEntryAnimatedValue('entryDesktopAvailable', row ? formatInj(available, 4) : '—', row ? available : NaN);
  setEntryAnimatedValue('entryDesktopStakeRatio', total > 0 ? `${stakingRatio.toFixed(1)}%` : '—', total > 0 ? stakingRatio : NaN);
  setEntryAnimatedValue('entryDesktopStakeMeta', row ? `${formatInj(staked, 4)} delegati` : '—', row ? staked : NaN);
  setEntryAnimatedValue('entryDesktopDailyReward', dailyReward > 0 ? `${dailyReward.toFixed(4)} INJ` : '—', dailyReward > 0 ? dailyReward : NaN);
  setEntryAnimatedValue('entryDesktopDailyRewardValue', dailyReward > 0 && state.price > 0 ? `${money(dailyReward * state.price, 2)} / giorno` : 'Stima netta', dailyReward > 0 && state.price > 0 ? dailyReward * state.price : NaN);
  setEntryAnimatedValue('entryDesktopApr', apr > 0 ? `${apr.toFixed(3)}%` : '—', apr > 0 ? apr : NaN);
}



// =========================================================
// v15.99.4 — Home P/L Timeline
// One locally persisted daily candle per wallet. The candle is based on the
// wallet quantity captured when that day is first observed, so later claims,
// staking moves or deposits do not masquerade as market profit/loss.
// The vertical scale is recalculated from ONLY the candles currently visible.
// =========================================================
function entryPnlTimelineStorageKey() {
  return 'inj_node_daily_pnl_timeline_v1';
}

function entryPnlTimelineDayLabel(dayStart, compact = false) {
  const date = new Date(number(dayStart));
  return date.toLocaleDateString('it-IT', compact
    ? { day: '2-digit', month: 'short' }
    : { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function readEntryPnlTimeline(address) {
  if (!address) return [];
  try {
    const all = JSON.parse(localStorage.getItem(entryPnlTimelineStorageKey()) || '{}');
    const rows = Array.isArray(all?.[address]) ? all[address] : [];
    return rows
      .map((row) => ({
        dayStart: number(row?.dayStart),
        openPrice: number(row?.openPrice),
        closePrice: number(row?.closePrice),
        baseTotal: number(row?.baseTotal),
        baseWorth: number(row?.baseWorth),
        pnlUsd: number(row?.pnlUsd),
        pct: number(row?.pct),
        live: Boolean(row?.live),
        updatedAt: number(row?.updatedAt)
      }))
      .filter((row) => row.dayStart > 0 && row.openPrice > 0 && row.baseTotal > 0)
      .sort((a, b) => a.dayStart - b.dayStart)
      .slice(-180);
  } catch (_) {
    return [];
  }
}

function saveEntryPnlTimeline(force = false) {
  const timeline = state.entryPnlTimeline;
  if (!timeline.address || !timeline.rows.length) return;
  const now = Date.now();
  if (!force && now - number(timeline.saveAt) < 15_000) return;
  timeline.saveAt = now;
  try {
    const all = JSON.parse(localStorage.getItem(entryPnlTimelineStorageKey()) || '{}');
    all[timeline.address] = timeline.rows.slice(-180).map((row) => ({
      dayStart: row.dayStart,
      openPrice: row.openPrice,
      closePrice: row.closePrice,
      baseTotal: row.baseTotal,
      baseWorth: row.baseWorth,
      pnlUsd: row.pnlUsd,
      pct: row.pct,
      live: Boolean(row.live),
      updatedAt: row.updatedAt
    }));
    // Keep storage bounded even with many saved wallets.
    const trimmed = Object.entries(all)
      .sort((a, b) => number(b?.[1]?.at?.(-1)?.updatedAt) - number(a?.[1]?.at?.(-1)?.updatedAt))
      .slice(0, 20);
    localStorage.setItem(entryPnlTimelineStorageKey(), JSON.stringify(Object.fromEntries(trimmed)));
  } catch (_) {}
}

function ensureEntryPnlTimelineRow() {
  const { wallet, row } = selectedEntrySummary();
  if (!wallet || !row) return null;
  const total = number(row.total);
  if (!(total > 0) || !(state.price > 0)) return null;

  const timeline = state.entryPnlTimeline;
  if (timeline.address !== wallet.address) {
    timeline.address = wallet.address;
    timeline.rows = readEntryPnlTimeline(wallet.address);
    timeline.renderKey = '';
    timeline.followLatest = true;
    timeline.inspectDay = 0;
  }

  const bounds = entryLocalDayBounds();
  const today = bounds.start;
  let current = timeline.rows.find((item) => number(item.dayStart) === today);

  // Any older live row becomes a closed historical candle. Its last sampled
  // market price is retained; the new day starts a fresh immutable baseTotal.
  timeline.rows.forEach((item) => {
    if (item.dayStart < today && item.live) item.live = false;
  });

  const sparkMatchesToday = number(state.entrySpark.dayStart) === today;
  const openPrice = sparkMatchesToday ? number(state.entrySpark.openPrice) : 0;
  if (!current) {
    // Never create a new day's candle from yesterday's cached opening price.
    // If the browser woke from sleep after midnight, hydrate the new local day
    // first; the timeline will render as soon as that daily open is available.
    if (!(openPrice > 0)) {
      const retryAge = Date.now() - number(timeline.lastHydrateAttempt);
      if (!state.entrySpark.loading && retryAge > 30_000) {
        timeline.lastHydrateAttempt = Date.now();
        resetEntryPriceSession(today);
        void loadEntrySparkline(true);
      }
      updateEntryPnlTimelineTodayHero(null);
      return null;
    }
    current = {
      dayStart: today,
      openPrice,
      closePrice: state.price,
      baseTotal: total,
      baseWorth: total * openPrice,
      pnlUsd: total * (state.price - openPrice),
      pct: openPrice > 0 ? (state.price / openPrice - 1) * 100 : 0,
      live: true,
      updatedAt: Date.now()
    };
    timeline.rows.push(current);
    timeline.rows.sort((a, b) => a.dayStart - b.dayStart);
    timeline.rows = timeline.rows.slice(-180);
    timeline.renderKey = '';
    saveEntryPnlTimeline(true);
  } else {
    // Never rewrite the opening quantity once the daily candle exists.
    if (!(current.baseTotal > 0)) current.baseTotal = total;
    if (!(current.openPrice > 0) && openPrice > 0) current.openPrice = openPrice;
    current.baseWorth = current.baseTotal * current.openPrice;
    current.closePrice = state.price;
    current.pnlUsd = current.baseTotal * (state.price - current.openPrice);
    current.pct = current.openPrice > 0 ? (state.price / current.openPrice - 1) * 100 : 0;
    current.live = true;
    current.updatedAt = Date.now();
    saveEntryPnlTimeline(false);
  }
  updateEntryPnlTimelineTodayHero(current);
  scheduleEntryPnlTimelineMidnightRollover();
  return current;
}

function updateEntryPnlTimelineTodayHero(current = null) {
  const summary = $('entryPnlTimelineSummary');
  const rollover = $('entryPnlTimelineRollover');
  const periodSummary = $('entryPnlTimelinePeriodSummary');
  const periodMeta = $('entryPnlTimelinePeriodMeta');
  const bestSummary = $('entryPnlTimelineBestSummary');
  const bestMeta = $('entryPnlTimelineBestMeta');
  const rows = Array.isArray(state.entryPnlTimeline.rows) ? state.entryPnlTimeline.rows : [];
  const row = current || rows.find((item) => item.live) || null;

  if (summary) {
    if (!row) {
      summary.textContent = '—';
      summary.className = 'neutral private';
    } else {
      const pnl = number(row.pnlUsd);
      const pct = number(row.pct);
      summary.textContent = `${pnl > 0 ? '+' : pnl < 0 ? '−' : ''}${money(Math.abs(pnl), 2)} · ${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(2)}%`;
      summary.className = `${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral'} private`;
    }
  }

  const periodRows = rows.filter((item) => number(item.dayStart) > 0).slice(-14);
  const periodPnl = periodRows.reduce((sum, item) => sum + number(item.pnlUsd), 0);
  const positiveDays = periodRows.filter((item) => number(item.pnlUsd) > 0).length;
  const negativeDays = periodRows.filter((item) => number(item.pnlUsd) < 0).length;
  if (periodSummary) {
    periodSummary.textContent = periodRows.length
      ? `${periodPnl > 0 ? '+' : periodPnl < 0 ? '−' : ''}${money(Math.abs(periodPnl), 2)}`
      : '—';
    periodSummary.className = `${periodPnl > 0 ? 'positive' : periodPnl < 0 ? 'negative' : 'neutral'} private`;
  }
  if (periodMeta) {
    periodMeta.textContent = periodRows.length
      ? `${periodRows.length}g registrati · ${positiveDays} ↑ · ${negativeDays} ↓`
      : 'In attesa dello storico';
  }

  const best = periodRows.reduce((winner, item) => {
    if (!winner) return item;
    return number(item.pnlUsd) > number(winner.pnlUsd) ? item : winner;
  }, null);
  if (bestSummary) {
    const pnl = best ? number(best.pnlUsd) : 0;
    bestSummary.textContent = best
      ? `${pnl > 0 ? '+' : pnl < 0 ? '−' : ''}${money(Math.abs(pnl), 2)}`
      : '—';
    bestSummary.className = `${best ? (pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral') : 'neutral'} private`;
  }
  if (bestMeta) {
    bestMeta.textContent = best
      ? `${entryPnlTimelineDayLabel(best.dayStart, true)} · ${number(best.pct) > 0 ? '+' : number(best.pct) < 0 ? '−' : ''}${Math.abs(number(best.pct)).toFixed(2)}%`
      : '—';
  }

  if (rollover) {
    const bounds = entryLocalDayBounds();
    const remaining = Math.max(0, bounds.end - Date.now());
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    rollover.textContent = `Chiude 00:00 · ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }
}

function scheduleEntryPnlTimelineMidnightRollover() {
  const timeline = state.entryPnlTimeline;
  if (timeline.rolloverTimer) return;
  const bounds = entryLocalDayBounds();
  timeline.rolloverAt = bounds.end;
  const delay = Math.max(500, bounds.end - Date.now() + 350);
  timeline.rolloverTimer = window.setTimeout(async () => {
    timeline.rolloverTimer = 0;
    timeline.rolloverAt = 0;
    // Freeze yesterday exactly as the last known session value, then hydrate
    // the new local day opening price and create the fresh LIVE candle.
    const newBounds = entryLocalDayBounds();
    timeline.rows.forEach((row) => {
      if (row.live && number(row.dayStart) < newBounds.start) row.live = false;
    });
    saveEntryPnlTimeline(true);
    resetEntryPriceSession(newBounds.start);
    await loadEntrySparkline(true);
    renderEntryPnlTimeline(true);
    updateEntryPnlTimelineTodayHero();
    scheduleEntryPnlTimelineMidnightRollover();
  }, delay);
}

function entryPnlTimelineVisibleCandles() {
  const scroll = $('entryPnlTimelineScroll');
  const track = $('entryPnlTimelineTrack');
  if (!scroll || !track) return [];
  const left = scroll.scrollLeft;
  const right = left + scroll.clientWidth;
  return [...track.querySelectorAll('.entry-pnl-day')].filter((node) => {
    const nodeLeft = node.offsetLeft;
    return nodeLeft + node.offsetWidth > left + 2 && nodeLeft < right - 2;
  });
}

function entryPnlTimelineMetricMode() {
  return state.entryPnlTimeline.metricMode === 'pct' ? 'pct' : 'usd';
}

function entryPnlTimelineMetricValue(node) {
  return entryPnlTimelineMetricMode() === 'pct' ? number(node?.dataset?.pct) : number(node?.dataset?.pnl);
}

function entryPnlTimelineEma(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  const clean = values.map(number);
  let ema = clean.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = ema;
  const alpha = 2 / (period + 1);
  for (let index = period; index < clean.length; index += 1) {
    ema = clean[index] * alpha + ema * (1 - alpha);
    result[index] = ema;
  }
  return result;
}

function syncEntryPnlTimelineControls() {
  const timeline = state.entryPnlTimeline;
  const mode = entryPnlTimelineMetricMode();
  const usd = $('entryPnlModeUsd');
  const pct = $('entryPnlModePct');
  const ema = $('entryPnlEmaToggle');
  const legend = $('entryPnlEmaLegend');
  const rowsCount = Array.isArray(timeline.rows) ? timeline.rows.length : 0;
  [usd, pct].forEach((button) => {
    if (!button) return;
    const active = button === (mode === 'pct' ? pct : usd);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (ema) {
    ema.classList.toggle('active', timeline.emaVisible !== false);
    ema.setAttribute('aria-pressed', timeline.emaVisible !== false ? 'true' : 'false');
    ema.title = rowsCount < 7
      ? `EMA 7 disponibile tra ${7 - rowsCount} giorn${7 - rowsCount === 1 ? 'o' : 'i'}`
      : rowsCount < 21
        ? `EMA 7 attiva · EMA 21 disponibile tra ${21 - rowsCount} giorni`
        : 'EMA 7 e EMA 21 attive';
  }
  if (legend) {
    legend.classList.toggle('hidden', timeline.emaVisible === false);
    legend.querySelector('.ema-fast')?.classList.toggle('unavailable', rowsCount < 7);
    legend.querySelector('.ema-slow')?.classList.toggle('unavailable', rowsCount < 21);
  }
}

function paintEntryPnlEmaLayer(track, scroll, allNodes, ema7, ema21, maxAbs, maxVisual, stageHeight) {
  const layer = $('entryPnlEmaLayer');
  if (!layer) return;
  const show = state.entryPnlTimeline.emaVisible !== false;
  layer.classList.toggle('hidden', !show);
  if (!show || !allNodes.length) {
    layer.replaceChildren();
    return;
  }
  const width = Math.max(1, track.clientWidth || scroll.clientWidth || 1);
  const height = Math.max(1, stageHeight);
  const center = height * 0.5;
  const yFor = (value) => center - (number(value) / Math.max(.0000001, maxAbs)) * maxVisual;
  const xFor = (index) => {
    const node = allNodes[index];
    return node ? node.offsetLeft + node.offsetWidth * 0.5 : 0;
  };
  const pathFor = (series) => {
    let d = '';
    let drawing = false;
    series.forEach((value, index) => {
      if (!Number.isFinite(value)) { drawing = false; return; }
      const command = drawing ? 'L' : 'M';
      d += `${command}${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)} `;
      drawing = true;
    });
    return d.trim();
  };
  const fastPath = pathFor(ema7);
  const slowPath = pathFor(ema21);
  const markers = [];
  for (let index = 1; index < allNodes.length; index += 1) {
    const fastNow = ema7[index], slowNow = ema21[index], fastPrev = ema7[index - 1], slowPrev = ema21[index - 1];
    if (![fastNow, slowNow, fastPrev, slowPrev].every(Number.isFinite)) continue;
    const prevDiff = fastPrev - slowPrev;
    const nextDiff = fastNow - slowNow;
    if ((prevDiff <= 0 && nextDiff > 0) || (prevDiff >= 0 && nextDiff < 0)) {
      const direction = nextDiff > 0 ? 'up' : 'down';
      const y = (yFor(fastNow) + yFor(slowNow)) / 2;
      markers.push(`<circle class="entry-pnl-ema-cross ${direction}" cx="${xFor(index).toFixed(2)}" cy="${y.toFixed(2)}" r="3.2"></circle>`);
    }
  }
  layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  layer.innerHTML = `${fastPath ? `<path class="entry-pnl-ema-path ema-fast" d="${fastPath}"></path>` : ''}${slowPath ? `<path class="entry-pnl-ema-path ema-slow" d="${slowPath}"></path>` : ''}${markers.join('')}`;
}

function paintEntryPnlTimelineScale() {
  const scroll = $('entryPnlTimelineScroll');
  const track = $('entryPnlTimelineTrack');
  if (!scroll || !track) return;
  const candles = entryPnlTimelineVisibleCandles();
  const allNodes = [...track.querySelectorAll('.entry-pnl-day')];
  if (!candles.length || !allNodes.length) return;

  const allValues = allNodes.map(entryPnlTimelineMetricValue);
  const ema7 = entryPnlTimelineEma(allValues, 7);
  const ema21 = entryPnlTimelineEma(allValues, 21);
  const visibleIndexes = candles.map((node) => Math.max(0, number(node.dataset.index)));
  const scaleValues = candles.map(entryPnlTimelineMetricValue);
  if (state.entryPnlTimeline.emaVisible !== false) {
    visibleIndexes.forEach((index) => {
      if (Number.isFinite(ema7[index])) scaleValues.push(ema7[index]);
      if (Number.isFinite(ema21[index])) scaleValues.push(ema21[index]);
    });
  }
  const maxAbs = Math.max(entryPnlTimelineMetricMode() === 'pct' ? .01 : .01, ...scaleValues.map((value) => Math.abs(number(value))));
  const stageHeight = Math.max(150, scroll.clientHeight || 220);
  const halfRange = Math.max(48, stageHeight * 0.5 - 34);
  const maxVisual = halfRange * 0.91;

  candles.forEach((node) => {
    const value = entryPnlTimelineMetricValue(node);
    const ratio = Math.min(1, Math.abs(value) / maxAbs);
    const height = value === 0 ? 2 : Math.max(2, ratio * maxVisual);
    node.style.setProperty('--pnl-height', `${height.toFixed(2)}px`);
    node.classList.toggle('compressed', ratio < 0.08);
    node.classList.toggle('micro', ratio < 0.025);
  });

  paintEntryPnlEmaLayer(track, scroll, allNodes, ema7, ema21, maxAbs, maxVisual, stageHeight);
  syncEntryPnlTimelineControls();
  updateEntryPnlTimelineTodayHero();
}

function scheduleEntryPnlTimelineScale() {
  const timeline = state.entryPnlTimeline;
  if (timeline.frame) cancelAnimationFrame(timeline.frame);
  timeline.frame = requestAnimationFrame(() => {
    timeline.frame = 0;
    paintEntryPnlTimelineScale();
  });
}

function inspectEntryPnlDay(node) {
  const detail = $('entryPnlTimelineDetail');
  if (!node || !detail) return;
  const dayStart = number(node.dataset.day);
  const pnl = number(node.dataset.pnl);
  const pct = number(node.dataset.pct);
  const open = number(node.dataset.open);
  const close = number(node.dataset.close);
  state.entryPnlTimeline.inspectDay = dayStart;
  detail.textContent = `${entryPnlTimelineDayLabel(dayStart)} · ${pnl > 0 ? '+' : pnl < 0 ? '−' : ''}${money(Math.abs(pnl), 2)} · ${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(2)}% · $${open.toFixed(3)} → $${close.toFixed(3)}`;
  node.parentElement?.querySelectorAll('.entry-pnl-day.inspecting').forEach((item) => item.classList.toggle('inspecting', item === node));
}

function clearEntryPnlDayInspection(node = null) {
  state.entryPnlTimeline.inspectDay = 0;
  const parent = node?.parentElement || $('entryPnlTimelineTrack');
  parent?.querySelectorAll?.('.entry-pnl-day.inspecting').forEach((item) => item.classList.remove('inspecting'));
  const detail = $('entryPnlTimelineDetail');
  if (detail) detail.textContent = 'Tocca o passa su una candela per vedere i dettagli.';
}

function bindEntryPnlTimelineInteraction() {
  const scroll = $('entryPnlTimelineScroll');
  if (!scroll || scroll.dataset.bound === '1') return;
  scroll.dataset.bound = '1';
  const inspectAtPointer = (event) => {
    const rect = scroll.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { clearEntryPnlDayInspection(); return; }
    const node = document.elementFromPoint(event.clientX,event.clientY)?.closest?.('.entry-pnl-day');
    if (node && scroll.contains(node)) inspectEntryPnlDay(node);
  };
  scroll.addEventListener('pointermove', inspectAtPointer, { passive:true });
  scroll.addEventListener('pointerleave', () => clearEntryPnlDayInspection(), { passive:true });
  scroll.addEventListener('pointerup', () => clearEntryPnlDayInspection(), { passive:true });
  scroll.addEventListener('pointercancel', () => clearEntryPnlDayInspection(), { passive:true });
  const setMetricMode = (mode) => {
    state.entryPnlTimeline.metricMode = mode === 'pct' ? 'pct' : 'usd';
    syncEntryPnlTimelineControls();
    scheduleEntryPnlTimelineScale();
  };
  $('entryPnlModeUsd')?.addEventListener('click', () => setMetricMode('usd'));
  $('entryPnlModePct')?.addEventListener('click', () => setMetricMode('pct'));
  $('entryPnlEmaToggle')?.addEventListener('click', () => {
    state.entryPnlTimeline.emaVisible = state.entryPnlTimeline.emaVisible === false;
    syncEntryPnlTimelineControls();
    scheduleEntryPnlTimelineScale();
  });
  syncEntryPnlTimelineControls();
  scroll.addEventListener('scroll', () => {
    const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    state.entryPnlTimeline.followLatest = maxScroll - scroll.scrollLeft < 26;
    scheduleEntryPnlTimelineScale();
  }, { passive: true });
  scroll.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const amount = Math.max(80, scroll.clientWidth * 0.72);
    if (event.key === 'Home') scroll.scrollTo({ left: 0, behavior: 'smooth' });
    else if (event.key === 'End') scroll.scrollTo({ left: scroll.scrollWidth, behavior: 'smooth' });
    else scroll.scrollBy({ left: event.key === 'ArrowLeft' ? -amount : amount, behavior: 'smooth' });
  });
  window.addEventListener('resize', scheduleEntryPnlTimelineScale, { passive: true });
}

function renderEntryPnlTimeline(force = false) {
  const section = $('entryPnlTimeline');
  const track = $('entryPnlTimelineTrack');
  const scroll = $('entryPnlTimelineScroll');
  if (!section || !track || !scroll) return;
  const current = ensureEntryPnlTimelineRow();
  const timeline = state.entryPnlTimeline;
  const rows = timeline.rows;
  if (!current || !rows.length) {
    section.classList.add('empty');
    return;
  }
  section.classList.remove('empty');
  bindEntryPnlTimelineInteraction();

  const renderKey = `${timeline.address}:${rows.map((row) => row.dayStart).join(',')}`;
  if (force || renderKey !== timeline.renderKey) {
    const zero = track.querySelector('.entry-pnl-zero-line');
    const emaLayer = track.querySelector('.entry-pnl-ema-layer');
    track.replaceChildren();
    if (zero) track.appendChild(zero);
    if (emaLayer) track.appendChild(emaLayer);
    const count = rows.length;
    const targetVisible = scroll.clientWidth < 620 ? 14 : scroll.clientWidth < 980 ? 22 : 34;
    const slot = Math.max(18, Math.min(28, Math.round(scroll.clientWidth / Math.max(1, targetVisible)) || 22));
    track.style.setProperty('--pnl-slot', `${slot}px`);
    track.style.width = `${Math.max(scroll.clientWidth, count * slot)}px`;
    track.style.justifyContent = count * slot <= scroll.clientWidth ? 'flex-end' : 'flex-start';
    const labelStep = count <= 14 ? 2 : count <= 40 ? 4 : 7;

    rows.forEach((row, index) => {
      const day = document.createElement('button');
      day.type = 'button';
      day.className = `entry-pnl-day ${row.pnlUsd > 0 ? 'positive' : row.pnlUsd < 0 ? 'negative' : 'neutral'} ${row.live ? 'live' : ''}`.trim();
      day.dataset.day = String(row.dayStart);
      day.dataset.index = String(index);
      day.classList.toggle('label-major', row.live || index === 0 || index === count - 1 || index % labelStep === 0);
      day.dataset.pnl = String(row.pnlUsd);
      day.dataset.pct = String(row.pct);
      day.dataset.open = String(row.openPrice);
      day.dataset.close = String(row.closePrice);
      day.dataset.baseWorth = String(row.baseWorth || row.baseTotal * row.openPrice);
      day.setAttribute('aria-label', `${entryPnlTimelineDayLabel(row.dayStart)}: ${signedMoney(row.pnlUsd, 2)}, ${row.pct.toFixed(2)} percento`);
      const signedPnl = `${row.pnlUsd > 0 ? '+' : row.pnlUsd < 0 ? '−' : ''}${money(Math.abs(row.pnlUsd), 2)}`;
      const signedPct = `${row.pct > 0 ? '+' : row.pct < 0 ? '−' : ''}${Math.abs(number(row.pct)).toFixed(2)}%`;
      const worth = number(row.baseTotal) * number(row.closePrice);
      day.innerHTML = `<span class="entry-pnl-value private" aria-hidden="true">${signedPnl}</span><i class="entry-pnl-candle" aria-hidden="true"><b></b></i><small>${row.live ? 'OGGI' : entryPnlTimelineDayLabel(row.dayStart, true)}</small><span class="entry-pnl-tooltip" aria-hidden="true"><b>${entryPnlTimelineDayLabel(row.dayStart)}</b><em class="entry-pnl-tooltip-value">${signedPnl} · ${signedPct}</em><small class="entry-pnl-tooltip-worth">Valore ${money(worth, 2)}</small></span>`;
      day.addEventListener('pointerenter', () => inspectEntryPnlDay(day));
      day.addEventListener('pointerleave', () => clearEntryPnlDayInspection(day));
      day.addEventListener('pointerdown', () => inspectEntryPnlDay(day));
      day.addEventListener('pointerup', () => clearEntryPnlDayInspection(day));
      day.addEventListener('pointercancel', () => clearEntryPnlDayInspection(day));
      day.addEventListener('focus', () => inspectEntryPnlDay(day));
      day.addEventListener('blur', () => clearEntryPnlDayInspection(day));
      day.addEventListener('click', () => { clearEntryPnlDayInspection(day); day.blur(); });
      if (timeline.inspectDay === row.dayStart) day.classList.add('inspecting');
      track.appendChild(day);
    });
    timeline.renderKey = renderKey;
    requestAnimationFrame(() => {
      if (timeline.followLatest) scroll.scrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      scheduleEntryPnlTimelineScale();
    });
  } else {
    updateEntryPnlTimelineLive(false);
  }
}

function updateEntryPnlTimelineLive(forcePaint = false) {
  const section = $('entryPnlTimeline');
  if (!section || section.classList.contains('empty')) return;
  const now = performance.now();
  if (!forcePaint && now - number(state.entryPnlTimeline.lastPaintAt) < 2_000) return;
  state.entryPnlTimeline.lastPaintAt = now;
  const current = ensureEntryPnlTimelineRow();
  if (!current) return;
  const track = $('entryPnlTimelineTrack');
  let node = track?.querySelector(`.entry-pnl-day[data-day="${current.dayStart}"]`);
  if (!node) return renderEntryPnlTimeline(true);

  const oldSign = node.classList.contains('positive') ? 1 : node.classList.contains('negative') ? -1 : 0;
  const newSign = current.pnlUsd > 0 ? 1 : current.pnlUsd < 0 ? -1 : 0;
  node.dataset.pnl = String(current.pnlUsd);
  node.dataset.pct = String(current.pct);
  node.dataset.close = String(current.closePrice);
  node.dataset.baseWorth = String(current.baseWorth);
  node.classList.toggle('positive', newSign > 0);
  node.classList.toggle('negative', newSign < 0);
  node.classList.toggle('neutral', newSign === 0);
  const signedLivePnl = `${current.pnlUsd > 0 ? '+' : current.pnlUsd < 0 ? '−' : ''}${money(Math.abs(current.pnlUsd), 2)}`;
  const signedLivePct = `${current.pct > 0 ? '+' : current.pct < 0 ? '−' : ''}${Math.abs(number(current.pct)).toFixed(2)}%`;
  const value = node.querySelector('.entry-pnl-value');
  if (value) value.textContent = signedLivePnl;
  const tooltipValue = node.querySelector('.entry-pnl-tooltip-value');
  if (tooltipValue) tooltipValue.textContent = `${signedLivePnl} · ${signedLivePct}`;
  const tooltipWorth = node.querySelector('.entry-pnl-tooltip-worth');
  if (tooltipWorth) tooltipWorth.textContent = `Valore ${money(number(current.baseTotal) * number(current.closePrice), 2)}`;
  if (oldSign !== newSign) node.classList.add('sign-flip');
  window.clearTimeout(node._signFlipTimer);
  node._signFlipTimer = window.setTimeout(() => node.classList.remove('sign-flip'), 420);
  if (state.entryPnlTimeline.inspectDay === current.dayStart) inspectEntryPnlDay(node);
  updateEntryPnlTimelineTodayHero(current);
  scheduleEntryPnlTimelineScale();
}

function entryLocalDayBounds(timestamp = Date.now()) {
  const startDate = new Date(timestamp);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.getTime(), end: endDate.getTime() };
}

function resetEntryPriceSession(dayStart = entryLocalDayBounds().start) {
  state.entrySpark.points = [];
  state.entrySpark.loadedAt = 0;
  state.entrySpark.dayStart = dayStart;
  state.entrySpark.openPrice = 0;
  state.entrySpark.lastLiveSampleAt = 0;
  state.entrySpark.plot = null;
  state.entrySpark.inspectIndex = -1;
  hideEntrySparkInspector();
}

function entrySparkPath(points) {
  const bounds = entryLocalDayBounds();
  const dayStart = number(state.entrySpark.dayStart) || bounds.start;
  const dayEnd = bounds.start === dayStart ? bounds.end : dayStart + 86_400_000;
  const rows = Array.isArray(points)
    ? points
        .filter((row) => number(row?.price) > 0 && number(row?.t) >= dayStart && number(row?.t) <= dayEnd)
        .sort((a, b) => number(a.t) - number(b.t))
    : [];
  if (rows.length < 2) return { line: '', area: '', direction: 0, last: null };

  // v15.83 — stronger mobile Y autoscale with protected top/bottom breathing room.
  // The true intraday low/high always define the scale, then a dynamic margin
  // is added so sharp pumps/dumps never pin the line against the card edges.
  const prices = rows.map((row) => number(row.price));
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const rawSpan = rawMax - rawMin;
  const referencePrice = Math.max(0.000001, (rawMin + rawMax) / 2, number(state.price));
  const padding = rawSpan > 0
    ? Math.max(rawSpan * 0.20, referencePrice * 0.0030)
    : Math.max(referencePrice * 0.005, 0.003);
  const min = Math.max(0.00000001, rawMin - padding);
  const max = rawMax + padding;
  const span = Math.max(1e-9, max - min);
  const width = 320;
  const height = 150;
  // Reserve a visibly larger safe band above and below the real curve.
  // This works together with price-domain padding, so even a sudden pump/dump
  // remains comfortably inside the plot instead of touching the card edges.
  const top = 24;
  const bottom = 126;
  const timeSpan = Math.max(1, dayEnd - dayStart);

  const coords = rows.map((row) => {
    const x = Math.max(0, Math.min(width, ((number(row.t) - dayStart) / timeSpan) * width));
    const y = bottom - ((number(row.price) - min) / span) * (bottom - top);
    return [x, y];
  });
  const samples = rows.map((row, index) => ({
    x: coords[index][0],
    y: coords[index][1],
    t: number(row.t),
    price: number(row.price)
  }));
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const firstX = coords[0][0];
  const lastX = coords.at(-1)[0];
  const area = `${line} L${lastX.toFixed(2)} ${height} L${firstX.toFixed(2)} ${height} Z`;
  const open = number(state.entrySpark.openPrice) || prices[0];
  return { line, area, direction: prices.at(-1) - open, last: coords.at(-1), samples, width, height };
}

function entrySparkTimeLabel(timestamp) {
  const date = new Date(number(timestamp));
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function hideEntrySparkInspector() {
  const cursor = $('entrySparkCursor');
  const tooltip = $('entrySparkTooltip');
  const stage = $('entrySparkStage');
  if (cursor) cursor.hidden = true;
  if (tooltip) tooltip.hidden = true;
  stage?.classList.remove('inspecting');
  if (state?.entrySpark) state.entrySpark.inspectIndex = -1;
}

function showEntrySparkSample(index) {
  const plot = state.entrySpark.plot;
  const samples = plot?.samples || [];
  const stage = $('entrySparkStage');
  const cursor = $('entrySparkCursor');
  const tooltip = $('entrySparkTooltip');
  if (!stage || !cursor || !tooltip || !samples.length) return;
  const safeIndex = Math.max(0, Math.min(samples.length - 1, Math.round(index)));
  const sample = samples[safeIndex];
  const open = number(state.entrySpark.openPrice) || samples[0]?.price || 0;
  const perf = open > 0 ? ((sample.price / open) - 1) * 100 : 0;
  const xPct = (sample.x / plot.width) * 100;
  const yPct = (sample.y / plot.height) * 100;
  cursor.style.left = `${xPct}%`;
  cursor.querySelector('i')?.style.setProperty('top', `${yPct}%`);
  cursor.hidden = false;
  tooltip.style.left = `${xPct}%`;
  tooltip.style.top = `${yPct}%`;
  tooltip.classList.toggle('flip', xPct > 72);
  // When the selected point is high in the chart, open the data bubble below
  // the point instead of above it. This keeps price/time fully inside the card
  // on iPhone and other short mobile viewports.
  tooltip.classList.toggle('below', yPct < 34);
  tooltip.querySelector('strong').textContent = `$${sample.price.toFixed(4)}`;
  tooltip.querySelector('small').textContent = `${entrySparkTimeLabel(sample.t)} · ${perf > 0 ? '+' : ''}${perf.toFixed(2)}%`;
  tooltip.hidden = false;
  stage.classList.add('inspecting');
  state.entrySpark.inspectIndex = safeIndex;
}

function inspectEntrySparkAt(event) {
  const stage = $('entrySparkStage');
  const plot = state.entrySpark.plot;
  const samples = plot?.samples || [];
  if (!stage || !samples.length) return;
  const rect = stage.getBoundingClientRect();
  if (!(rect.width > 0)) return;
  const clientX = Number(event?.clientX);
  if (!Number.isFinite(clientX)) return;
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const targetX = (x / rect.width) * plot.width;
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid].x < targetX) low = mid + 1;
    else high = mid;
  }
  let index = low;
  if (index > 0 && Math.abs(samples[index - 1].x - targetX) <= Math.abs(samples[index].x - targetX)) index -= 1;
  showEntrySparkSample(index);
}

function bindEntrySparkInteraction() {
  const stage = $('entrySparkStage');
  if (!stage || stage.dataset.sparkBound === '1') return;
  stage.dataset.sparkBound = '1';
  const touch = { pointerId:null, startX:0, startY:0, horizontal:false };
  const inside = (event) => { const r=stage.getBoundingClientRect(); return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom; };
  const release = (id) => { try { if(stage.hasPointerCapture?.(id)) stage.releasePointerCapture?.(id); } catch (_) {} };
  const resetTouch = () => { touch.pointerId=null; touch.horizontal=false; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerdown',(event)=>{
    if (!state.entrySpark.plot?.samples?.length) return;
    inspectEntrySparkAt(event);
    if(event.pointerType==='mouse') return;
    touch.pointerId=event.pointerId; touch.startX=event.clientX; touch.startY=event.clientY; touch.horizontal=false;
  },{passive:true});
  stage.addEventListener('pointermove',(event)=>{
    if(event.pointerType==='mouse'){ if(!inside(event)){hideEntrySparkInspector();return;} inspectEntrySparkAt(event); return; }
    if(event.pointerId!==touch.pointerId) return;
    if(!inside(event)){release(event.pointerId);resetTouch();hideEntrySparkInspector();return;}
    const dx=event.clientX-touch.startX,dy=event.clientY-touch.startY,ax=Math.abs(dx),ay=Math.abs(dy);
    if(!touch.horizontal){
      if(Math.max(ax,ay)<4){inspectEntrySparkAt(event);return;}
      if(ay>ax*1.35){hideEntrySparkInspector();resetTouch();return;}
      if(ax<4||ax<ay*.72)return;
      touch.horizontal=true;stage.classList.add('dragging');try{stage.setPointerCapture?.(event.pointerId);}catch(_){}
    }
    if(event.cancelable)event.preventDefault();inspectEntrySparkAt(event);
  },{passive:false});
  stage.addEventListener('pointerleave',()=>hideEntrySparkInspector());
  stage.addEventListener('pointerup',(event)=>{release(event.pointerId);resetTouch();hideEntrySparkInspector();});
  stage.addEventListener('pointercancel',(event)=>{release(event.pointerId);resetTouch();hideEntrySparkInspector();});
  stage.addEventListener('lostpointercapture',()=>stage.classList.remove('dragging'));
  document.addEventListener('pointerdown',(event)=>{if(!stage.classList.contains('inspecting')||stage.contains(event.target))return;hideEntrySparkInspector();resetTouch();},true);
  stage.addEventListener('keydown',(event)=>{const samples=state.entrySpark.plot?.samples||[];if(!samples.length||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape')return hideEntrySparkInspector();let index=state.entrySpark.inspectIndex;if(event.key==='Home')index=0;else if(event.key==='End')index=samples.length-1;else if(event.key==='ArrowLeft')index=index<0?samples.length-1:index-1;else index=index<0?0:index+1;showEntrySparkSample(index);});
}
function renderEntryAtGlance() {
  const section = $('entryInsights');
  if (!section) return;
  const { wallet, row } = selectedEntrySummary();
  if (!wallet) return;

  const total = number(row?.total);
  const openPrice = number(state.entrySpark.openPrice);
  const pnlToday = total > 0 && openPrice > 0 && state.price > 0 ? total * (state.price - openPrice) : 0;
  const pnl = $('entryInsightPnl');
  if (pnl) {
    pnl.className = pnlToday > 0 ? 'positive' : pnlToday < 0 ? 'negative' : 'neutral';
    setEntryAnimatedValue('entryInsightPnl', total > 0 && openPrice > 0 && state.price > 0 ? `${pnlToday > 0 ? '+' : ''}${money(pnlToday, 2)}` : '—', total > 0 && openPrice > 0 && state.price > 0 ? pnlToday : NaN, { directional: true });
  }

  const spark = entrySparkPath(state.entrySpark.points);
  state.entrySpark.plot = spark;
  const path = $('entrySparkPath');
  const area = $('entrySparkArea');
  const liveDot = $('entrySparkLiveDot');
  const liveLabel = $('entrySparkLiveLabel');
  if (path) path.setAttribute('d', spark.line);
  if (area) area.setAttribute('d', spark.area);
  if (liveDot || liveLabel) {
    if (spark.last) {
      const xPct = (spark.last[0] / spark.width) * 100;
      const yPct = (spark.last[1] / spark.height) * 100;
      if (liveDot) {
        liveDot.style.left = `${xPct}%`;
        liveDot.style.top = `${yPct}%`;
        liveDot.hidden = false;
      }
      if (liveLabel) {
        const latestPrice = number(spark.samples?.at(-1)?.price) || number(state.price);
        liveLabel.style.left = `${xPct}%`;
        liveLabel.style.top = `${Math.max(12, Math.min(88, yPct))}%`;
        setEntryAnimatedValue('entrySparkLiveLabel', latestPrice > 0 ? `$${latestPrice.toFixed(4)}` : '—', latestPrice > 0 ? latestPrice : NaN);
        liveLabel.classList.toggle('flip', xPct > 68);
        liveLabel.hidden = latestPrice <= 0;
      }
    } else {
      if (liveDot) liveDot.hidden = true;
      if (liveLabel) liveLabel.hidden = true;
    }
  }
  if (state.entrySpark.inspectIndex >= 0 && spark.samples?.length) {
    showEntrySparkSample(Math.min(state.entrySpark.inspectIndex, spark.samples.length - 1));
  }
  section.classList.toggle('spark-positive', spark.direction > 0);
  section.classList.toggle('spark-negative', spark.direction < 0);
  section.classList.toggle('spark-empty', !spark.line);

  const status = $('entrySparkStatus');
  if (status) {
    const loading = Boolean(state.entrySpark.loading);
    status.classList.toggle('loading', loading);
    status.innerHTML = `<i></i> ${loading ? 'SYNC' : state.entrySpark.loadedAt ? 'LIVE' : '—'}`;
  }
}

async function loadEntrySparkline(force = false) {
  const bounds = entryLocalDayBounds();
  const sameDay = number(state.entrySpark.dayStart) === bounds.start;
  if (!sameDay) resetEntryPriceSession(bounds.start);
  if (state.entrySpark.loading) return;
  if (!force && sameDay && state.entrySpark.loadedAt && Date.now() - state.entrySpark.loadedAt < 90_000 && state.entrySpark.points.length > 2) {
    renderEntryAtGlance();
    return;
  }

  state.entrySpark.loading = true;
  renderEntryAtGlance();
  try {
    const end = Date.now();
    const data = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=3m&startTime=${Math.floor(bounds.start)}&endTime=${Math.floor(end)}&limit=500`, 9000);
    const rows = Array.isArray(data) ? data.filter((row) => number(row?.[4]) > 0) : [];
    if (rows.length) {
      const openPrice = number(rows[0]?.[1]);
      state.entrySpark.dayStart = bounds.start;
      state.entrySpark.openPrice = openPrice > 0 ? openPrice : number(rows[0]?.[4]);
      const points = [{ t: bounds.start, price: state.entrySpark.openPrice, live: false }];
      rows.forEach((row) => {
        const t = Math.min(end, number(row?.[6]) || number(row?.[0]) || end);
        const price = number(row?.[4]);
        if (price > 0) points.push({ t, price, live: false });
      });
      if (state.price > 0) points.push({ t: end, price: state.price, live: true });
      state.entrySpark.points = points;
      state.entrySpark.lastLiveSampleAt = end;
      state.entrySpark.loadedAt = end;
    }
  } catch (error) {
    console.warn('Grafico Price Home non disponibile', error);
  } finally {
    state.entrySpark.loading = false;
    renderEntryAtGlance();
    renderEntryPnlTimeline();
  }
}

function renderSystemStatus() {
  const snapshot = overallSystemSnapshot();
  const { overall, services } = snapshot;
  const headline = $('systemStatusHeadline');
  const summary = $('systemStatusSummary');
  const orb = $('systemStatusOrb');
  if (headline) headline.textContent = overall === 'online' ? 'Tutti i sistemi operativi' : overall === 'warn' ? 'Alcuni servizi richiedono attenzione' : 'Connessione non disponibile';
  if (summary) summary.textContent = overall === 'online' ? 'Mercato, wallet e APR stanno rispondendo normalmente.' : overall === 'warn' ? 'INJ Node continua a usare i dati disponibili mentre tenta la riconnessione.' : 'Controlla la connessione del dispositivo e riprova.';
  if (orb) orb.className = `system-status-orb ${overall}`;
  const map = {
    internet: ['serviceInternetState', 'serviceInternetMeta'],
    market: ['serviceMarketState', 'serviceMarketMeta'],
    lcd: ['serviceLcdState', 'serviceLcdMeta'],
    apr: ['serviceAprState', 'serviceAprMeta']
  };
  Object.entries(map).forEach(([key, ids]) => {
    const item = services[key];
    const card = document.querySelector(`.system-service[data-service="${key}"]`);
    if (card) card.className = `system-service ${item.mode}`;
    if ($(ids[0])) $(ids[0]).textContent = item.state;
    if ($(ids[1])) $(ids[1]).textContent = item.meta;
  });
  if ($('systemStatusChecked')) $('systemStatusChecked').textContent = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  const menuDot = $('systemStatusMenuDot');
  if (menuDot) menuDot.className = `menu-system-dot ${overall}`;
  if ($('systemStatusMenuHint')) $('systemStatusMenuHint').textContent = overall === 'online' ? 'Tutti i servizi operativi' : overall === 'warn' ? 'Controllo consigliato' : 'Connessione assente';
  const focusButton = $('focusDisplaySystemButton');
  if (focusButton) focusButton.className = `focus-display-system ${overall}`;
  if ($('focusDisplaySystemText')) $('focusDisplaySystemText').textContent = systemCopy(overall);
  const entryPill = $('entrySystemStatusButton');
  if (entryPill) entryPill.className = `entry-system-pill ${overall}`;
  if ($('entrySystemStatusText')) $('entrySystemStatusText').textContent = systemCopy(overall);
}

function openSystemStatus() {
  setHeaderMenuOpen(false);
  renderSystemStatus();
  const dialog = $('systemStatusDialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function closeSystemStatus() {
  const dialog = $('systemStatusDialog');
  if (dialog?.open) dialog.close();
}

function pulseDashboardReveal() {
  document.body.classList.remove('dashboard-entering');
  requestAnimationFrame(() => {
    document.body.classList.add('dashboard-entering');
    window.setTimeout(() => document.body.classList.remove('dashboard-entering'), 760);
  });
}

function renderFocusAmbient() {
  const clock = $('focusDisplayClock');
  if (clock) clock.textContent = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  renderSystemStatus();
}

function showEntryGate({ modeReturn = false } = {}) {
  const gate = $('entryGate');
  if (!gate) return;
  state.currentView = 'home';
  renderEntryGate();
  loadEntrySparkline(false);
  gate.classList.toggle('mode-return', modeReturn);
  gate.classList.add('visible');
  gate.setAttribute('aria-hidden', 'false');
  document.body.classList.add('entry-gate-open');
  document.body.classList.toggle('mode-returning', modeReturn);
  if (!state.wallets.length && !modeReturn) {
    requestAnimationFrame(() => setTimeout(() => ($('entryWalletName') || $('entryWalletInput'))?.focus(), 90));
  }
}

function closeEntryGate({ revealDashboard = true } = {}) {
  const gate = $('entryGate');
  if (!gate) return;

  // Durante l'uscita l'app-shell rimane nascosta. Se stiamo entrando in
  // Live View, una classe ponte impedisce qualsiasi flash della dashboard
  // finché il dialog fullscreen non è già nel top-layer del browser.
  if (!revealDashboard) document.body.classList.add('entry-live-launch');
  syncHomeCommandCenter();
  gate.classList.add('leaving');

  window.setTimeout(() => {
    gate.classList.remove('visible', 'leaving');
    gate.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('entry-gate-open');
    if (revealDashboard) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    if (revealDashboard || !$('focusDisplayDialog')?.hidden || !$('pulseViewDialog')?.hidden || !$('liveChartsDialog')?.hidden) {
      requestAnimationFrame(() => document.body.classList.remove('entry-live-launch'));
    }
  }, 380);
}

function activateEntrySelection() {
  const wallet = selectedEntryWallet();
  if (!wallet) return null;
  if (state.address !== wallet.address) {
    activateWalletImmediately(wallet.address);
    loadWallet(false, wallet.address);
  } else if (!state.walletSummaries[wallet.address]?.updated && !state.loading) {
    loadWallet(false, wallet.address);
  }
  return wallet;
}

function enterDashboardFromGate() {
  if (state.currentView !== 'home' || !modeLaunchAllowed()) return;
  activateEntrySelection();
  state.currentView = 'dashboard';
  pulseDashboardReveal();
  closeEntryGate({ revealDashboard: true });
  requestAnimationFrame(() => updateDashboardSectionNavigator(true));
}

function parkEntryGateUnderImmersive() {
  const gate = $('entryGate');
  if (!gate) return;
  // v15.64: the selector never leaves the compositor while Live/Pulse is open.
  // It remains a fully painted, theme-correct page underneath the immersive layer.
  gate.classList.remove('leaving', 'mode-return');
  gate.classList.add('visible', 'immersive-underlay');
  gate.setAttribute('aria-hidden', 'true');
  document.body.classList.add('entry-gate-open', 'entry-live-launch');
}

function restoreEntryGateFromImmersive() {
  const gate = $('entryGate');
  if (!gate) return;
  state.currentView = 'home';
  // Home has remained painted and live underneath the immersive mode. Do not
  // rebuild its DOM at the exact handoff frame: that repaint was visible as a
  // tiny snap/black flash on WebKit. Refresh only the live overview in place.
  renderEntryOverview();
  loadEntrySparkline(false);
  gate.classList.remove('immersive-underlay', 'mode-return');
  gate.classList.add('visible', 'home-return-stable');
  gate.setAttribute('aria-hidden', 'false');
  document.body.classList.add('entry-gate-open');
  document.body.classList.remove('entry-live-launch', 'mode-returning');
}

function armModeExitLock(duration = 1250) {
  const ms = Math.max(350, Number(duration) || 1250);
  state.modeExitLockUntil = Date.now() + ms;
  window.clearTimeout(state.modeExitLockTimer);
  document.body.classList.add('mode-exit-lock');
  state.modeExitLockTimer = window.setTimeout(() => {
    state.modeExitLockUntil = 0;
    document.body.classList.remove('mode-exit-lock');
  }, ms);
}

function modeLaunchAllowed() {
  const gate = $('entryGate');
  if (state.currentView !== 'home') return false;
  if (Date.now() < Number(state.modeExitLockUntil || 0)) return false;
  if (document.body.classList.contains('mode-returning')) return false;
  if (!gate?.classList.contains('visible') || gate.classList.contains('immersive-underlay')) return false;
  if ($('focusDisplayDialog')?.classList.contains('is-closing') || $('pulseViewDialog')?.classList.contains('is-closing') || $('liveChartsDialog')?.classList.contains('is-closing')) return false;
  return !isFocusDisplayActive() && !isPulseViewActive() && !isLiveChartsActive();
}

function immersiveModeTransitioning() {
  return Boolean(
    $('focusDisplayDialog')?.classList.contains('is-closing') ||
    $('pulseViewDialog')?.classList.contains('is-closing') ||
    $('liveChartsDialog')?.classList.contains('is-closing')
  );
}

function enterLiveViewFromGate() {
  if (!modeLaunchAllowed()) return;
  const wallet = activateEntrySelection();
  if (!wallet) return;

  // Keep Home physically rendered underneath instead of closing/recreating it.
  parkEntryGateUnderImmersive();
  openFocusDisplay();
}

function enterPulseViewFromGate() {
  if (!modeLaunchAllowed()) return;
  const wallet = activateEntrySelection();
  if (!wallet) return;
  parkEntryGateUnderImmersive();
  openPulseView();
}

function enterLiveChartsFromGate() {
  if (!modeLaunchAllowed()) return;
  // v15.98.43: Live Charts is deliberately isolated in its own lightweight page.
  // Do not park Home or start the in-app chart engine before navigation: this
  // guarantees that a chart failure can never freeze the main application UI.
  setHeaderMenuOpen(false);
  setSearchOpen(false);
  try { sessionStorage.setItem('inj_node_livecharts_from_home', '1'); } catch (_) {}
  window.location.assign('./live-charts.html?v=15.99.80');
}

function enterOrderBookFromGate() {
  if (!modeLaunchAllowed()) return;
  setHeaderMenuOpen(false);
  setSearchOpen(false);
  try { sessionStorage.setItem('inj_node_orderbook_from_home', '1'); } catch (_) {}
  window.location.assign('./order-book.html?v=15.99.80');
}

function isPerformanceTimelineActive() {
  const view = $('performanceTimelineView');
  return Boolean(view && !view.hidden && view.classList.contains('open'));
}

function settlePerformanceTimelineViewport() {
  const scroll = $('entryPnlTimelineScroll');
  if (scroll && state.entryPnlTimeline.followLatest) {
    scroll.scrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  }
  scheduleEntryPnlTimelineScale();
}

function enterPerformanceTimelineFromGate() {
  if (!modeLaunchAllowed()) return;
  const wallet = activateEntrySelection();
  if (!wallet) return;
  const view = $('performanceTimelineView');
  if (!view) return;

  // v15.99.8 — Performance Timeline must sit above the persistent Home
  // underlay. Open it immediately, then hydrate the current-day opening price
  // if the Home sparkline has not completed yet.
  parkEntryGateUnderImmersive();
  state.currentView = 'performance';
  view.hidden = false;
  view.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    view.classList.add('open');
    renderEntryPnlTimeline(true);
    requestAnimationFrame(settlePerformanceTimelineViewport);
  });

  if (!(number(state.entrySpark.openPrice) > 0)) {
    const detail = $('entryPnlTimelineDetail');
    if (detail) detail.textContent = 'Sincronizzazione del P/L giornaliero…';
    void loadEntrySparkline(true).then(() => {
      if (!isPerformanceTimelineActive()) return;
      renderEntryPnlTimeline(true);
      requestAnimationFrame(settlePerformanceTimelineViewport);
      const rows = state.entryPnlTimeline.rows || [];
      if (detail && rows.length <= 1) {
        detail.textContent = rows.length
          ? 'Oggi è la prima candela salvata su questo dispositivo. Lo storico cresce giorno per giorno.'
          : 'Dati giornalieri non ancora disponibili. INJ Node riproverà con il prossimo aggiornamento live.';
      }
    });
  }
}

function closePerformanceTimelineToHome() {
  const view = $('performanceTimelineView');
  if (!view || view.hidden) return;
  state.currentView = 'home';
  armModeExitLock(650);
  view.classList.remove('open');
  view.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    view.hidden = true;
    restoreEntryGateFromImmersive();
  }, 180);
}

function isConverterActive() {
  const view = $('converterView');
  return Boolean(view && !view.hidden && view.classList.contains('open'));
}

function enterConverterFromGate() {
  if (!modeLaunchAllowed()) return;
  const view = $('converterView');
  if (!view) return;
  setHeaderMenuOpen(false);
  setSearchOpen(false);
  parkEntryGateUnderImmersive();
  state.currentView = 'converter';
  view.hidden = false;
  view.setAttribute('aria-hidden', 'false');
  renderEntryConverter();
  requestAnimationFrame(() => view.classList.add('open'));
}

function closeConverterToHome() {
  const view = $('converterView');
  if (!view || view.hidden) return;
  state.currentView = 'home';
  armModeExitLock(650);
  view.classList.remove('open');
  view.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    view.hidden = true;
    restoreEntryGateFromImmersive();
  }, 180);
}


function commandCenterDesktopAllowed() {
  // Command Center is intentionally PC-only. iPhone/iPad/Android stay blocked
  // even in landscape; wide Windows/macOS/Linux desktops remain allowed.
  const ua = String(navigator.userAgent || '');
  const appleTouchTablet = /Macintosh/i.test(ua) && Number(navigator.maxTouchPoints || 0) > 1;
  const mobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || appleTouchTablet;
  return !mobileDevice && window.matchMedia('(min-width: 1100px)').matches;
}

function homeCommandCenterAllowed() {
  return commandCenterDesktopAllowed();
}

function syncHomeCommandCenter() {
  // v15.99.64 — no embedded Command Center exists in Home anymore.
  document.body.classList.remove('home-command-center-enabled');
}

function enterCommandCenterFromGate() {
  if (state.currentView !== 'home') return;
  const wallet = selectedEntryWallet();
  if (!wallet) return;

  if (!commandCenterDesktopAllowed()) {
    commandCenterUnavailableNotice();
    return;
  }

  setHeaderMenuOpen(false);
  setSearchOpen(false);
  window.location.assign(`./command-center.html?wallet=${encodeURIComponent(wallet.address)}&v=15.99.80`);
}

// v15.70 — Home launchers require a fresh gesture that actually began on the
// destination button. This rejects iOS delayed/synthetic clicks generated by
// the close control after the Home page becomes visible underneath.
function markEntryLaunchIntent(event) {
  const button = event?.currentTarget;
  if (!button || state.currentView !== 'home' || !modeLaunchAllowed()) return;
  state.entryLaunchIntent.set(button, performance.now());
}

function consumeEntryLaunchIntent(event) {
  const button = event?.currentTarget;
  if (!button || state.currentView !== 'home' || !modeLaunchAllowed()) return false;
  const startedAt = Number(state.entryLaunchIntent.get(button) || 0);
  state.entryLaunchIntent.delete(button);
  const freshPointerGesture = startedAt > 0 && performance.now() - startedAt < 1200;
  const trustedKeyboardActivation = event?.isTrusted === true && Number(event?.detail || 0) === 0;
  return freshPointerGesture || trustedKeyboardActivation;
}

function bindEntryLauncher(id, handler) {
  const button = $(id);
  if (!button) return;
  button.addEventListener('pointerdown', markEntryLaunchIntent, { passive: true });
  // touchstart/mousedown are fallbacks for older WebKit where Pointer Events can
  // be incomplete in standalone mode. Rewriting the timestamp is harmless.
  button.addEventListener('touchstart', markEntryLaunchIntent, { passive: true });
  button.addEventListener('mousedown', markEntryLaunchIntent, { passive: true });
  button.addEventListener('click', (event) => {
    if (!consumeEntryLaunchIntent(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    handler(event);
  });
}

function bindCommandCenterLauncher() {
  const button = $('entryCommandCenterButton');
  if (!button) return;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    enterCommandCenterFromGate();
  });
}

// v15.74 — Dashboard Home is a dedicated top-left control. A navigation
// gesture must start on the Home icon itself, so chart/search taps can never
// be interpreted as Home navigation by WebKit.
function markDashboardHomeIntent() {
  if (state.currentView !== 'dashboard') return;
  state.dashboardHomeIntentAt = performance.now();
}

function consumeDashboardHomeIntent(event) {
  if (state.currentView !== 'dashboard') return false;
  const startedAt = Number(state.dashboardHomeIntentAt || 0);
  state.dashboardHomeIntentAt = 0;
  const freshPointerGesture = startedAt > 0 && performance.now() - startedAt < 1000;
  const trustedKeyboardActivation = event?.isTrusted === true && Number(event?.detail || 0) === 0;
  return freshPointerGesture || trustedKeyboardActivation;
}

function bindDashboardHomeLauncher() {
  const button = $('dashboardHomeButton');
  if (!button) return;

  // v15.98.79: Home is an explicit navigation control. On iOS/PWA a
  // pointer-intent gate can drop a legitimate tap when the system converts
  // the gesture between touch/pointer/click events. A normal trusted click is
  // enough here; goHome() already rejects every non-Home Dashboard source.
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    goHome('dashboard-home-button');
  });
}

const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];

const state = {
  address: '',
  price: 0,
  marketRawPrice: 0,
  marketTargetPrice: 0,
  marketRawChange: 0,
  marketRawChangeAmount: 0,
  marketOpen24: 0,
  marketMotionFrame: 0,
  marketMotionLastFrame: 0,
  marketMotionLastRender: 0,
  marketMotionUntil: 0,
  marketMotionRendering: false,
  change: 0,
  changeAmount: 0,
  low: 0,
  high: 0,
  marketFrames: {
    d1: { open: 0, min: 0, max: 0, at: 0 },
    m1: { open: 0, min: 0, max: 0, at: 0 },
    y1: { open: 0, min: 0, max: 0, at: 0 },
    all: { open: 0, min: 0, max: 0, at: 0 }
  },
  marketFramesUpdated: 0,
  marketFramesLoading: false,
  marketMatrix: {
    opens: { h1: 0, w1: 0 },
    bucketStarts: { h1: 0, w1: 0 },
    loadedAt: 0,
    loading: false
  },
  marketExtremeFlashTimers: {},
  available: 0,
  nativeUsdc: 0,
  staked: 0,
  rewards: 0,
  rewardSimulationPrice: 0,
  networkApr: 0,
  networkAprUpdated: 0,
  personalApr: 0,
  weightedCommission: 0,
  validators: [],
  validatorMeta: {},
  wallets: [],
  walletSummaries: {},
  entrySelectedAddress: '',
  entrySpark: { points: [], loadedAt: 0, loading: false, dayStart: 0, openPrice: 0, lastLiveSampleAt: 0, plot: null, inspectIndex: -1 },
  entryPnlTimeline: { address: '', rows: [], renderKey: '', frame: 0, saveAt: 0, lastPaintAt: 0, followLatest: true, inspectDay: 0, rolloverTimer: 0, rolloverAt: 0, lastHydrateAttempt: 0, metricMode: 'usd', emaVisible: true },
  summariesLoading: false,
  summariesLastRefresh: 0,
  targetByWallet: {},
  averagePriceByWallet: {},
  suppressEffects: true,
  currency: 'USD',
  eurRate: 0.86,
  converter: { source: 'EUR', value: 0, hasValue: false },
  endpoint: '',
  socket: null,
  walletRequest: 0,
  walletPendingAddress: '',
  loading: false,
  lastMarketUpdate: 0,
  lastWalletUpdate: 0,
  focusControlsTimer: 0,
  liveCharts: { samples: [], lastSampleAt: 0, lastTradeAt: 0, renderFrame: 0, lastRenderAt: 0, lastPathRenderAt: 0, visualPrice: 0, targetPrice: 0, visualFrameAt: 0, historyLoadedAt: 0, persistAt: 0, openToken: 0, scales: { m5: { min: 0, max: 0 }, m10: { min: 0, max: 0 }, h1: { min: 0, max: 0 } }, renderCache: { m5: null, m10: null, h1: null } },
  pulseControlsTimer: 0,
  modeExitLockUntil: 0,
  modeExitLockTimer: 0,
  currentView: 'boot',
  entryLaunchIntent: new WeakMap(),
  dashboardHomeIntentAt: 0,
  pulseDay: { key: '', address: '', start: 0, openPrice: 0, baseTotal: 0, baseWorth: 0, loading: false, loadedAt: 0, fallback: false },
  pulseAutoScale: { key: '', address: '', price: 1, pnl: 1, reward: 1, lastRewards: 0 },
  pulseExtremes: { key: '', address: '', price: null, pnl: null, reward: null },
  pulseExtremeFlashTimers: {},
  pulseMini: { key: '', address: '', price: [], pnl: [], reward: [], lastSampleAt: 0, lastRewardSampleAt: 0, lastSavedAt: 0 },
  deferredInstallPrompt: null,
  nativeChartRange: 'd1',
  nativeChartCache: {},
  nativeChart: { points: [], liveSamples: [], live: null, open: 0, min: 0, max: 0, start: 0, end: 0, loading: false, requestId: 0, renderPoints: [] },
  nativeChartResizeObserver: null,
  nativeChartRenderFrame: 0,
  nativeChartHover: { active: false, t: 0 }
};

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fromWei(value) {
  return number(value) / INJ_DECIMALS;
}

function rate(value) {
  const parsed = number(value);
  return parsed > 1 ? parsed / INJ_DECIMALS : parsed;
}

function validAddress(value) {
  return /^inj1[0-9a-z]{38,60}$/i.test(String(value || '').trim());
}

function formatInj(value, digits = 4) {
  return `${number(value).toLocaleString('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} INJ`;
}

function formatUsdc(value) {
  const amount = Math.max(0, number(value));
  return `${amount.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  })} USDC`;
}

function currencyValue(value) {
  return state.currency === 'EUR' ? number(value) * state.eurRate : number(value);
}

function money(value, digits = 2) {
  return new Intl.NumberFormat(state.currency === 'EUR' ? 'it-IT' : 'en-US', {
    style: 'currency',
    currency: state.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(currencyValue(value));
}

function compactMoney(value) {
  const converted = currencyValue(value);
  const abs = Math.abs(converted);
  if (abs < 1000) return money(value, 2);

  const units = [
    { threshold: 1e12, suffix: 'T' },
    { threshold: 1e9, suffix: 'B' },
    { threshold: 1e6, suffix: 'M' },
    { threshold: 1e3, suffix: 'K' }
  ];
  const unit = units.find((item) => abs >= item.threshold) || units[units.length - 1];
  const scaled = abs / unit.threshold;
  const maximumFractionDigits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const locale = state.currency === 'EUR' ? 'it-IT' : 'en-US';
  const numberText = scaled.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
  const sign = converted < 0 ? '−' : '';

  return state.currency === 'EUR'
    ? `${sign}${numberText}${unit.suffix} €`
    : `${sign}$${numberText}${unit.suffix}`;
}

function usdMoney(value, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(number(value));
}

function signedMoney(value, digits = 4) {
  const formatted = money(Math.abs(value), digits);
  return `${value >= 0 ? '+' : '−'}${formatted}`;
}

function usdt(value, digits = 4) {
  return `${value < 0 ? '−' : value > 0 ? '+' : ''}${Math.abs(number(value)).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} USDT`;
}

function shortAddress(value) {
  const text = String(value || '');
  return text.length > 18 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text;
}

function loadSavedWallets() {
  let rows = [];
  try { rows = JSON.parse(localStorage.getItem('inj_monitor_wallets_v1') || '[]'); } catch (_) {}
  state.wallets = Array.isArray(rows) ? rows.map((item, index) => ({
    address: String(item?.address || '').trim().toLowerCase(),
    label: String(item?.label || `Wallet ${index + 1}`).trim().slice(0, 28)
  })).filter((item, index, all) => validAddress(item.address) && all.findIndex((row) => row.address === item.address) === index) : [];

  const legacy = localStorage.getItem('inj_monitor_address') || '';
  if (validAddress(legacy) && !state.wallets.some((item) => item.address === legacy)) {
    state.wallets.push({ address: legacy, label: `Wallet ${state.wallets.length + 1}` });
  }
  try {
    const cached = JSON.parse(localStorage.getItem('inj_monitor_summaries_v1') || '{}');
    state.walletSummaries = cached && typeof cached === 'object' ? cached : {};
  } catch (_) { state.walletSummaries = {}; }
  saveWallets();
}

function saveWallets() {
  localStorage.setItem('inj_monitor_wallets_v1', JSON.stringify(state.wallets));
}

function saveWalletSummaries() {
  localStorage.setItem('inj_monitor_summaries_v1', JSON.stringify(state.walletSummaries));
}

function loadTargetStorage() {
  try {
    const targets = JSON.parse(localStorage.getItem('inj_monitor_targets_v1') || '{}');
    state.targetByWallet = targets && typeof targets === 'object' ? targets : {};
  } catch (_) { state.targetByWallet = {}; }
  try {
    ['inj_monitor_portfolio_history_v1', 'inj_monitor_history_range', 'inj_monitor_compound_mode', 'inj_monitor_compound_weekly'].forEach((key) => localStorage.removeItem(key));
  } catch (_) {}
}

function saveTargets() {
  try { localStorage.setItem('inj_monitor_targets_v1', JSON.stringify(state.targetByWallet)); } catch (_) {}
}

function loadAveragePriceStorage() {
  try {
    const values = JSON.parse(localStorage.getItem('inj_monitor_average_buy_price_v1') || '{}');
    state.averagePriceByWallet = values && typeof values === 'object' ? values : {};
  } catch (_) { state.averagePriceByWallet = {}; }
}

function saveAveragePrices() {
  try { localStorage.setItem('inj_monitor_average_buy_price_v1', JSON.stringify(state.averagePriceByWallet)); } catch (_) {}
}

// v15.98.3 — Compact K/M/B/T stays on Home; Dashboard keeps full monetary decimals
// v15.98.1 — On Home, wallet-specific settings follow the wallet selected
// in the Home carousel without prematurely switching the dashboard data context.
function currentSettingsWalletAddress() {
  if (state.currentView === 'home' && state.entrySelectedAddress && state.wallets.some((wallet) => wallet.address === state.entrySelectedAddress)) {
    return state.entrySelectedAddress;
  }
  return state.address || '';
}

function currentAverageBuyPrice() {
  const address = currentSettingsWalletAddress();
  return address ? Math.max(0, number(state.averagePriceByWallet[address])) : 0;
}

function renderAveragePriceControl() {
  const input = $('averageBuyPrice');
  if (!input) return;
  input.disabled = !state.address;
  const average = currentAverageBuyPrice();
  if (document.activeElement !== input) input.value = average > 0 ? String(average) : '';
}

function normalizeWalletLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 28);
}

function ensureSavedWallet(address, requestedLabel = '') {
  const cleanLabel = normalizeWalletLabel(requestedLabel);
  let wallet = state.wallets.find((item) => item.address === address);
  let changed = false;
  if (!wallet) {
    wallet = { address, label: cleanLabel || `Wallet ${state.wallets.length + 1}` };
    state.wallets.push(wallet);
    changed = true;
  } else if (cleanLabel && cleanLabel !== wallet.label) {
    wallet.label = cleanLabel;
    changed = true;
  }
  if (changed) saveWallets();
  localStorage.setItem('inj_monitor_address', address);
  return wallet;
}

function setHeaderMenuOpen(open) {
  const host = $('headerMenu');
  if (!host) return;
  host.classList.toggle('open', open);
  document.body.classList.toggle('menu-overlay-open', open);
  $('entryMenuButton')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  $('entryMenuButton')?.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');
  if (!open) setThemePickerOpen(false);
}

function openWalletAddressEditor(address) {
  const wallet = state.wallets.find((item) => item.address === address);
  if (!wallet) return;
  setSearchOpen(true);
  const input = $('addressInput');
  const name = $('walletNameInput');
  if (input) {
    input.value = wallet.address;
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      try { input.select(); } catch (_) {}
    });
  }
  if (name) name.value = wallet.label || '';
}

function setSearchOpen(open) {
  if (open) {
    setThemePickerOpen(false);
    setHeaderMenuOpen(false);
  }
  $('headerSearch').classList.toggle('open', open);
  $('searchButton').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('searchButton').setAttribute('aria-label', open ? 'Chiudi ricerca wallet' : 'Apri ricerca wallet');
  if (open) {
    $('addressInput').value = '';
    if ($('walletNameInput')) $('walletNameInput').value = '';
    requestAnimationFrame(() => $('addressInput')?.focus({ preventScroll: true }));
  } else {
    const active = document.activeElement;
    if (active && $('headerSearch')?.contains(active) && typeof active.blur === 'function') active.blur();
  }
}

function summaryAge(updated) {
  const age = Math.max(0, Date.now() - number(updated));
  if (!(updated > 0)) return 'In attesa di sincronizzazione';
  if (age < 5_000) return 'Aggiornato ora';
  if (age < 60_000) return `Aggiornato ${Math.floor(age / 1000)}s fa`;
  if (age < 3_600_000) return `Aggiornato ${Math.floor(age / 60_000)}m fa`;
  return `Aggiornato ${Math.floor(age / 3_600_000)}h fa`;
}

function renderWalletCards() {
  const host = $('walletCards');
  if (!host) return;

  host.replaceChildren();
  if (!state.wallets.length) {
    const empty = document.createElement('span');
    empty.className = 'wallet-mini-empty';
    empty.textContent = 'Aggiungi un wallet con la lente';
    host.appendChild(empty);
    return;
  }

  state.wallets.forEach((wallet) => {
    const row = state.walletSummaries[wallet.address];
    const active = wallet.address === state.address;
    const fresh = Boolean(row && Date.now() - number(row.updated) < 90_000);

    const item = document.createElement('div');
    const switching = state.walletPendingAddress === wallet.address;
    item.className = `wallet-mini ${active ? 'active' : ''} ${fresh ? 'synced' : row ? 'cached' : 'loading'} ${switching ? 'switching' : ''}`.trim();

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'wallet-mini-main';
    open.title = `Apri ${wallet.label} · ${shortAddress(wallet.address)}`;
    open.setAttribute('aria-label', `Apri dettaglio ${wallet.label}`);
    open.setAttribute('aria-pressed', active ? 'true' : 'false');

    const heading = document.createElement('span');
    heading.className = 'wallet-mini-heading';

    const status = document.createElement('i');
    status.className = 'wallet-mini-status';
    status.setAttribute('aria-hidden', 'true');

    const name = document.createElement('strong');
    name.className = 'wallet-mini-name';
    name.textContent = wallet.label;

    heading.append(status, name);

    const address = document.createElement('small');
    address.className = 'wallet-mini-address';
    address.textContent = shortAddress(wallet.address);
    address.title = `Modifica indirizzo ${wallet.label}`;
    address.setAttribute('role', 'button');
    address.setAttribute('tabindex', '0');
    address.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openWalletAddressEditor(wallet.address);
    });
    address.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        openWalletAddressEditor(wallet.address);
      }
    });
    heading.append(address);

    const total = document.createElement('span');
    total.className = 'wallet-mini-total private';
    total.textContent = row ? `${number(row.total).toLocaleString('it-IT', { maximumFractionDigits: 2 })} INJ` : '— INJ';

    const worth = document.createElement('small');
    worth.className = 'wallet-mini-worth private';
    worth.textContent = row && state.price > 0 ? compactMoney(row.total * state.price) : (fresh ? 'LIVE' : row ? 'CACHE' : 'SYNC');

    open.append(heading, total, worth);
    open.addEventListener('click', () => {
      if (!active || state.walletPendingAddress) loadWallet(true, wallet.address);
    });

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'wallet-mini-edit';
    edit.title = `Rinomina ${wallet.label}`;
    edit.setAttribute('aria-label', `Rinomina ${wallet.label}`);
    edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
    edit.addEventListener('click', (event) => {
      event.stopPropagation();
      openWalletManager(wallet.address);
    });

    item.append(open, edit);
    host.appendChild(item);
  });
}

function renderMenuWalletContext() {
  const settingsAddress = currentSettingsWalletAddress();
  const wallet = state.wallets.find((item) => item.address === settingsAddress);
  const label = $('menuWalletLabel');
  const address = $('menuWalletAddress');
  if (label) label.textContent = wallet?.label || (settingsAddress ? 'Wallet attivo' : 'Nessun wallet');
  if (address) address.textContent = settingsAddress ? shortAddress(settingsAddress) : 'Nessun wallet attivo';
}

function renderWalletControls() {
  $('savedWalletCount').textContent = `${state.wallets.length} salvat${state.wallets.length === 1 ? 'o' : 'i'}`;
  renderMenuWalletContext();
  renderWalletCards();
  renderWalletManager();
  renderAggregate();
  if ($('entryGate')?.classList.contains('visible')) renderEntryGate();
}

function openWalletManager(address = '') {
  renderWalletManager();
  const dialog = $('walletDialog');
  if (!dialog.open) dialog.showModal();
  if (!address) return;
  requestAnimationFrame(() => {
    const input = [...dialog.querySelectorAll('.wallet-manager-copy input')]
      .find((field) => field.dataset.walletAddress === address);
    if (input) {
      input.focus();
      input.select();
    }
  });
}

function renderWalletManager() {
  const host = $('walletManagerList');
  host.replaceChildren();
  if (!state.wallets.length) {
    const empty = document.createElement('div');
    empty.className = 'wallet-manager-empty';
    empty.textContent = 'Non ci sono ancora indirizzi salvati.';
    host.appendChild(empty);
    return;
  }

  state.wallets.forEach((wallet) => {
    const row = document.createElement('div');
    row.className = 'wallet-manager-row';
    const copy = document.createElement('div');
    copy.className = 'wallet-manager-copy';
    const input = document.createElement('input');
    input.value = wallet.label;
    input.maxLength = 28;
    input.dataset.walletAddress = wallet.address;
    input.setAttribute('aria-label', `Nome per ${shortAddress(wallet.address)}`);
    const address = document.createElement('small');
    address.textContent = wallet.address;
    input.addEventListener('change', () => {
      wallet.label = input.value.trim() || wallet.label;
      input.value = wallet.label;
      saveWallets();
      renderWalletControls();
    });
    copy.append(input, address);

    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = wallet.address === state.address ? 'Attivo' : 'Apri';
    open.disabled = wallet.address === state.address;
    open.addEventListener('click', () => {
      $('walletDialog').close();
      loadWallet(true, wallet.address);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Rimuovi';
    remove.addEventListener('click', () => removeWallet(wallet.address));
    row.append(copy, open, remove);
    host.appendChild(row);
  });
}

function removeWallet(address) {
  const wallet = state.wallets.find((item) => item.address === address);
  if (!wallet || !window.confirm(`Rimuovere “${wallet.label}” dai wallet salvati?`)) return;
  const wasActive = state.address === address;
  state.wallets = state.wallets.filter((item) => item.address !== address);
  delete state.walletSummaries[address];
  saveWallets();
  saveWalletSummaries();
  if (wasActive) {
    const next = state.wallets[0];
    if (next) loadWallet(false, next.address);
    else resetWallet();
  }
  renderWalletControls();
}

function resetWallet() {
  state.address = '';
  state.available = 0;
  state.staked = 0;
  state.rewards = 0;
  state.networkApr = 0;
  state.personalApr = 0;
  state.weightedCommission = 0;
  state.validators = [];
  $('addressInput').value = '';
  $('lastUpdate').textContent = '—';
  localStorage.removeItem('inj_monitor_address');
  renderAll();
  renderWalletControls();
}

function aprPercent(value) {
  const parsed = number(value);
  if (!(parsed > 0)) return 0;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function setStatus(mode, message) {
  const host = $('connectionStatus');
  host.className = `connection ${mode || ''}`.trim();
  $('statusText').textContent = message;
  host.title = message;
}

function commandCenterUnavailableNotice() {
  // v15.99.71 — Dedicated transient overlay. It is physically removed from
  // the DOM after the message, so iOS cannot leave a residual bottom panel.
  document.querySelectorAll('.command-center-mobile-notice').forEach((node) => node.remove());
  const host = document.createElement('div');
  host.className = 'command-center-mobile-notice';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.innerHTML = '<strong>COMMAND CENTER</strong><span>Command Center può essere aperto solo da PC.</span>';
  document.body.appendChild(host);
  requestAnimationFrame(() => host.classList.add('show'));
  window.setTimeout(() => {
    host.classList.remove('show');
    window.setTimeout(() => host.remove(), 240);
  }, 2200);
}

function toast(message) {
  const host = $('toast');
  if (!host) return;
  host.textContent = message;
  host.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => host.classList.remove('show'), 2200);
}

function signalChange(element, previous, next) {
  const tolerance = Math.max(1e-12, Math.abs(previous) * 1e-10);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || Math.abs(next - previous) <= tolerance) return;
  const direction = next > previous ? 'up' : 'down';
  const card = element.closest('.data-card');
  const now = Date.now();

  element.classList.remove('value-change-up', 'value-change-down');
  void element.offsetWidth;
  element.classList.add(`value-change-${direction}`);

  // La card si illumina solo in risposta a una variazione realmente visibile.
  // Il piccolo lock evita che due valori della stessa card provochino flash sovrapposti
  // durante lo stesso ciclo di rendering.
  if (card && now - number(card.dataset.lastFlash) > 420) {
    card.dataset.lastFlash = String(now);
    card.classList.remove('data-flash-up', 'data-flash-down');
    void card.offsetWidth;
    card.classList.add(`data-flash-${direction}`);
    clearTimeout(card._flashTimer);
    card._flashTimer = setTimeout(() => {
      card.classList.remove('data-flash-up', 'data-flash-down');
    }, 1400);
  }
}

function numberRollGroups(text) {
  const value = String(text ?? '');
  const groups = [];
  const regex = /\d[\d.,]*/g;
  let match;
  while ((match = regex.exec(value))) {
    groups.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
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

function appendRollingNumberGroup(parent, oldGroup, newGroup, direction) {
  const oldDigits = Array.from(String(oldGroup || '')).filter((char) => /\d/.test(char));
  const newChars = Array.from(String(newGroup || ''));
  const newDigitCount = newChars.reduce((count, char) => count + (/\d/.test(char) ? 1 : 0), 0);
  const digitOffset = oldDigits.length - newDigitCount;
  let newDigitIndex = 0;

  for (const char of newChars) {
    if (!/\d/.test(char)) {
      parent.append(document.createTextNode(char));
      continue;
    }

    const oldIndex = newDigitIndex + digitOffset;
    const oldDigit = oldIndex >= 0 && oldIndex < oldDigits.length ? oldDigits[oldIndex] : '';
    appendRollingDigit(parent, oldDigit, char, direction);
    newDigitIndex += 1;
  }
}

function appendStableNumberGroup(parent, group) {
  for (const char of Array.from(String(group || ''))) {
    if (/\d/.test(char)) {
      const digit = document.createElement('span');
      digit.className = 'number-roll-static-digit';
      digit.textContent = char;
      parent.append(digit);
    } else {
      parent.append(document.createTextNode(char));
    }
  }
}

function renderStableNumberText(element, text) {
  if (!element) return;
  const value = String(text ?? '');
  const groups = numberRollGroups(value);
  if (!groups.length) {
    element.textContent = value;
    return;
  }

  const shell = document.createElement('span');
  shell.className = 'number-roll-text number-roll-stable';
  shell.setAttribute('aria-label', value);
  let cursor = 0;
  for (const group of groups) {
    if (group.start > cursor) shell.append(document.createTextNode(value.slice(cursor, group.start)));
    appendStableNumberGroup(shell, group.text);
    cursor = group.end;
  }
  if (cursor < value.length) shell.append(document.createTextNode(value.slice(cursor)));
  element.textContent = '';
  element.append(shell);
}

function animateVerticalNumberRoll(element, previousText, nextText, previousNumeric, nextNumeric) {
  if (!element) return;
  // Keep the host in tabular-number mode even after the temporary animation
  // markup is removed. This makes the animated and final text occupy the same
  // width and prevents the tiny horizontal/baseline jumps seen on live updates.
  element.classList.add('number-roll-host');
  const oldText = previousText === undefined ? undefined : String(previousText);
  const newText = String(nextText);
  const previous = Number(previousNumeric);
  const next = Number(nextNumeric);
  const visibleChange = oldText !== undefined && oldText !== newText;
  const numericChange = Number.isFinite(previous) && Number.isFinite(next) &&
    Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Identical rounded values can be rendered several times per second. Do not
  // interrupt a roll that is already in flight just because another renderer ran.
  if (!visibleChange || !numericChange || state.suppressEffects || reduceMotion) {
    if (element._verticalRollTimer && oldText === newText) return;
    clearTimeout(element._verticalRollTimer);
    element._verticalRollTimer = null;
    renderStableNumberText(element, newText);
    return;
  }

  clearTimeout(element._verticalRollTimer);
  const direction = next > previous ? 'up' : 'down';
  const shell = document.createElement('span');
  shell.className = 'number-roll-text';
  shell.setAttribute('aria-label', newText);

  const oldGroups = numberRollGroups(oldText);
  const newGroups = numberRollGroups(newText);
  let cursor = 0;

  newGroups.forEach((group, index) => {
    if (group.start > cursor) shell.append(document.createTextNode(newText.slice(cursor, group.start)));
    appendRollingNumberGroup(shell, oldGroups[index]?.text || '', group.text, direction);
    cursor = group.end;
  });
  if (cursor < newText.length) shell.append(document.createTextNode(newText.slice(cursor)));

  // If a value contains no digits (for example an em dash), use the plain text.
  element.textContent = '';
  if (newGroups.length) element.append(shell);
  else element.textContent = newText;

  element._verticalRollTimer = window.setTimeout(() => {
    element._verticalRollTimer = null;
    // Keep the exact same per-digit geometry after the animation. Reverting to
    // a plain text node changed the glyph metrics by a fraction of a pixel on
    // Safari/iOS and created the visible grow/shrink "jump" at the end.
    renderStableNumberText(element, newText);
  }, 500);
}

function setRollingNumberValue(element, text, numericValue) {
  if (!element) return { visibleChange: false, numericChange: false, previous: NaN, next: NaN };
  const nextText = String(text);
  const previousText = element.dataset.rollRenderedValue;
  const next = Number(numericValue);
  const previous = element.dataset.rollNumericValue === undefined ? NaN : Number(element.dataset.rollNumericValue);
  const visibleChange = previousText !== undefined && previousText !== nextText;
  const numericChange = Number.isFinite(previous) && Number.isFinite(next) &&
    Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);

  animateVerticalNumberRoll(element, previousText, nextText, previous, next);

  element.dataset.rollRenderedValue = nextText;
  if (Number.isFinite(next)) element.dataset.rollNumericValue = String(next);
  else delete element.dataset.rollNumericValue;
  return { visibleChange, numericChange, previous, next, previousText, nextText };
}

function setPlainNumberValue(element, text, numericValue) {
  if (!element) return { visibleChange: false, numericChange: false, previous: NaN, next: NaN };
  const nextText = String(text);
  const previousText = element.dataset.plainRenderedValue;
  const next = Number(numericValue);
  const previous = element.dataset.plainNumericValue === undefined ? NaN : Number(element.dataset.plainNumericValue);
  const visibleChange = previousText !== undefined && previousText !== nextText;
  const numericChange = Number.isFinite(previous) && Number.isFinite(next) &&
    Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);

  clearTimeout(element._verticalRollTimer);
  element._verticalRollTimer = null;
  element.textContent = nextText;
  element.dataset.plainRenderedValue = nextText;
  if (Number.isFinite(next)) element.dataset.plainNumericValue = String(next);
  else delete element.dataset.plainNumericValue;
  return { visibleChange, numericChange, previous, next, previousText, nextText };
}

function setStableLiveNumberValue(element, text, numericValue) {
  if (!element) return { visibleChange: false, numericChange: false, previous: NaN, next: NaN };
  const result = setPlainNumberValue(element, text, numericValue);
  element.classList.add('number-roll-host');
  renderStableNumberText(element, String(text));
  return result;
}

function setPulseOnlyValue(id, text, numericValue, { flash = true } = {}) {
  const element = $(id);
  if (!element) return;
  const result = setPlainNumberValue(element, text, numericValue);
  if (flash && !state.suppressEffects && result.visibleChange && result.numericChange) {
    signalChange(element, result.previous, result.next);
  }
}

function setRewardEstimateValue(id, value, active, digits = 4) {
  const element = $(id);
  if (!element) return;
  if (!active || !Number.isFinite(number(value))) {
    setPlainNumberValue(element, '—', NaN);
    element.classList.remove('reward-estimate-value');
    return;
  }
  const rendered = formatInj(value, digits);
  setPlainNumberValue(element, rendered, value);
  const formattedNumber = number(value).toLocaleString('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  element.classList.add('reward-estimate-value');
  element.innerHTML = `<span class="reward-estimate-number">${formattedNumber}</span><span class="reward-estimate-unit">INJ</span>`;
}

// Pulse View intentionally has no numeric odometer in v15.98.13.

function setValue(id, text, numericValue, { flash = true, roll = false } = {}) {
  const element = $(id);
  if (!element) return;

  // v15.98.13: Dashboard is intentionally selective. Only callers that pass
  // roll:true get the per-digit odometer; every other value stays geometrically
  // fixed and can use the existing directional color blink.
  const result = roll
    ? (state.marketMotionRendering
        ? setStableLiveNumberValue(element, text, numericValue)
        : setRollingNumberValue(element, text, numericValue))
    : setPlainNumberValue(element, text, numericValue);
  if (flash && !state.suppressEffects && !state.marketMotionRendering && result.visibleChange && result.numericChange) {
    signalChange(element, result.previous, result.next);
  }

  // Keep the legacy datasets because a few older dashboard effects read them.
  element.dataset.renderedValue = result.nextText;
  if (Number.isFinite(result.next)) element.dataset.numericValue = String(result.next);
  else delete element.dataset.numericValue;
}

function setAccruedRewardValue(text, numericValue) {
  const element = $('rewardsInj');
  if (!element) return;

  const result = setPlainNumberValue(element, text, numericValue);
  const card = $('rewardsCard');

  // Reward maturate are an accumulation signal: highlight only real increases
  // in INJ. Price-only changes in the USD countervalue must not trigger it.
  if (
    card &&
    !state.suppressEffects &&
    !state.marketMotionRendering &&
    result.visibleChange &&
    result.numericChange &&
    Number.isFinite(result.previous) &&
    Number.isFinite(result.next) &&
    result.next > result.previous
  ) {
    element.classList.remove('reward-accrual-value-flash');
    card.classList.remove('reward-accrual-flash');
    void card.offsetWidth;
    element.classList.add('reward-accrual-value-flash');
    card.classList.add('reward-accrual-flash');

    clearTimeout(card._rewardAccrualFlashTimer);
    card._rewardAccrualFlashTimer = window.setTimeout(() => {
      element.classList.remove('reward-accrual-value-flash');
      card.classList.remove('reward-accrual-flash');
    }, 900);
  }

  element.dataset.renderedValue = result.nextText;
  if (Number.isFinite(result.next)) element.dataset.numericValue = String(result.next);
  else delete element.dataset.numericValue;
}

function setBlinkOnlyElement(element, text, numericValue, { flash = true } = {}) {
  if (!element) return { visibleChange: false, numericChange: false, previous: NaN, next: NaN };
  const result = setPlainNumberValue(element, text, numericValue);
  if (flash && !state.suppressEffects && !state.marketMotionRendering && result.visibleChange && result.numericChange) {
    signalChange(element, result.previous, result.next);
  }
  return result;
}

async function fetchJson(url, timeout = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function lcd(path) {
  let lastError;
  for (const base of LCD_ENDPOINTS) {
    try {
      const data = await fetchJson(base + path);
      state.endpoint = base;
      $('endpointLabel').textContent = `API · ${new URL(base).hostname}`;
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Rete Injective non disponibile');
}

function findInj(coins = []) {
  const coin = coins.find((item) => item?.denom === 'inj');
  return coin ? fromWei(coin.amount) : 0;
}

function findNativeUsdc(coins = []) {
  const coin = coins.find((item) => String(item?.denom || '').toLowerCase() === NATIVE_USDC_DENOM);
  return coin ? number(coin.amount) / USDC_DECIMALS : 0;
}

function delegationRows(data) {
  return (data?.delegation_responses || []).map((row) => ({
    operator: row?.delegation?.validator_address || '',
    amount: fromWei(row?.balance?.amount)
  })).filter((row) => row.operator && row.amount > 0);
}

function rewardTotal(data) {
  return (data?.total || [])
    .filter((coin) => coin?.denom === 'inj')
    .reduce((sum, coin) => sum + fromWei(coin.amount), 0);
}

async function loadWalletSummary(address) {
  const [bank, delegations, rewards] = await Promise.all([
    lcd(`/cosmos/bank/v1beta1/balances/${address}`),
    lcd(`/cosmos/staking/v1beta1/delegations/${address}`),
    lcd(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`)
  ]);
  const balances = bank?.balances || [];
  const available = findInj(balances);
  const nativeUsdc = findNativeUsdc(balances);
  const staked = delegationRows(delegations).reduce((sum, item) => sum + item.amount, 0);
  const reward = rewardTotal(rewards);
  return { available, nativeUsdc, staked, rewards: reward, total: available + staked + reward, updated: Date.now() };
}

async function refreshWalletSummaries(force = false) {
  if (state.summariesLoading || !state.wallets.length) return;
  const summaryCooldown = MOBILE_EFFICIENCY ? 55_000 : 25_000;
  const walletStaleAfter = MOBILE_EFFICIENCY ? 50_000 : 20_000;
  if (!force && Date.now() - state.summariesLastRefresh < summaryCooldown) return;
  state.summariesLoading = true;
  state.summariesLastRefresh = Date.now();
  renderAggregate();
  let cursor = 0;
  const addresses = state.wallets.map((item) => item.address).filter((address) => {
    const row = state.walletSummaries[address];
    if (force || !row) return true;
    const isPriority = address === state.address || address === state.entrySelectedAddress;
    const staleAfter = MOBILE_EFFICIENCY && !isPriority ? 120_000 : walletStaleAfter;
    return Date.now() - number(row.updated) > staleAfter;
  });
  if (!addresses.length) {
    state.summariesLoading = false;
    renderAggregate();
    renderWalletCards();
    return;
  }
  const worker = async () => {
    while (cursor < addresses.length) {
      const address = addresses[cursor++];
      try {
        state.walletSummaries[address] = await loadWalletSummary(address);
        saveWalletSummaries();
        if (!MOBILE_EFFICIENCY) {
          renderAggregate();
          renderWalletCards();
        }
      } catch (_) {}
    }
  };
  const concurrency = MOBILE_EFFICIENCY ? 1 : Math.min(3, addresses.length);
  await Promise.all(Array.from({ length: concurrency }, worker));
  state.summariesLoading = false;
  renderAggregate();
  renderWalletCards();
}

function aggregateCollapsedPreference() {
  try { return localStorage.getItem('inj_monitor_aggregate_collapsed_v1') === '1'; }
  catch (_) { return false; }
}

function setAggregateCollapsed(collapsed, persist = true) {
  const section = $('aggregateSection');
  if (!section) return;
  const next = Boolean(collapsed);
  section.classList.toggle('collapsed', next);
  section.setAttribute('aria-expanded', next ? 'false' : 'true');
  section.title = next ? 'Mostra il totale multi-wallet' : 'Nascondi il totale multi-wallet';

  // v15.99.19 — hard collapse: when closed, keep ONLY the title row.
  // Inline !important wins over any legacy/mobile grid rules that may force
  // individual metrics (especially Reward disponibili) back to display:grid.
  Array.from(section.children).forEach((child) => {
    if (!child.classList.contains('aggregate-metric')) return;
    child.hidden = next;
    child.setAttribute('aria-hidden', next ? 'true' : 'false');
    if (next) child.style.setProperty('display', 'none', 'important');
    else child.style.removeProperty('display');
  });

  const status = $('aggregateStatus');
  if (status) {
    status.hidden = next;
    status.setAttribute('aria-hidden', next ? 'true' : 'false');
    if (next) status.style.setProperty('display', 'none', 'important');
    else status.style.removeProperty('display');
  }

  if (persist) {
    try { localStorage.setItem('inj_monitor_aggregate_collapsed_v1', next ? '1' : '0'); } catch (_) {}
  }
}

function toggleAggregate() {
  const section = $('aggregateSection');
  if (!section || section.hidden) return;
  setAggregateCollapsed(!section.classList.contains('collapsed'));
}

function renderAggregate() {
  const section = $('aggregateSection');
  const enabled = state.wallets.length > 1;
  section.hidden = !enabled;
  if (!enabled) return;
  setAggregateCollapsed(aggregateCollapsedPreference(), false);
  const rows = state.wallets.map((wallet) => state.walletSummaries[wallet.address]).filter(Boolean);
  const total = rows.reduce((acc, row) => ({
    available: acc.available + number(row.available),
    staked: acc.staked + number(row.staked),
    rewards: acc.rewards + number(row.rewards),
    total: acc.total + number(row.total)
  }), { available: 0, staked: 0, rewards: 0, total: 0 });
  setValue('aggregateNetWorth', rows.length ? money(total.total * state.price, 2) : '—', total.total * state.price, { flash: false });
  setValue('aggregateTotalInj', rows.length ? formatInj(total.total, 4) : '—', total.total, { flash: false });
  setValue('aggregateAvailable', rows.length ? formatInj(total.available, 4) : '—', total.available, { flash: false });
  setValue('aggregateAvailableValue', rows.length && state.price > 0 ? `≈ ${money(total.available * state.price, 2)}` : '—', total.available * state.price, { flash: false });
  setValue('aggregateStaked', rows.length ? formatInj(total.staked, 4) : '—', total.staked, { flash: false });
  setValue('aggregateRewards', rows.length ? formatInj(total.rewards, 4) : '—', total.rewards, { flash: false });
  setValue('aggregateRewardsValue', rows.length && state.price > 0 ? `≈ ${money(total.rewards * state.price, 2)}` : '—', total.rewards * state.price, { flash: false });
  $('aggregateStatus').textContent = state.summariesLoading
    ? `${rows.length}/${state.wallets.length} sincronizzati`
    : `${rows.length}/${state.wallets.length} wallet aggiornati`;
}

function validatorActive(validator) {
  return Boolean(validator && !validator.jailed && (!validator.status || validator.status === 'BOND_STATUS_BONDED'));
}

function validatorNetApr(validator) {
  return validatorActive(validator)
    ? state.networkApr * Math.max(0, 1 - number(validator.commission))
    : 0;
}

function calculatePersonalApr() {
  const delegated = state.validators.reduce((sum, item) => sum + item.amount, 0);
  state.weightedCommission = delegated > 0
    ? state.validators.reduce((sum, item) => sum + item.amount * item.commission, 0) / delegated
    : 0;

  const annualNetInj = state.validators.reduce((sum, item) => {
    return sum + item.amount * (validatorNetApr(item) / 100);
  }, 0);

  state.personalApr = state.staked > 0 ? (annualNetInj / state.staked) * 100 : 0;
}


function loadMarketFrameCache() {
  try {
    const cached = JSON.parse(localStorage.getItem('inj_monitor_market_frames_v2') || '{}');
    ['m1', 'y1', 'all'].forEach((key) => {
      const row = cached?.[key];
      if (number(row?.open) > 0 && number(row?.min) > 0 && number(row?.max) > 0) {
        state.marketFrames[key] = {
          open: number(row.open),
          min: number(row.min),
          max: number(row.max),
          at: number(row.at)
        };
      }
    });
    state.marketFramesUpdated = number(cached?.updated);
  } catch (_) {}
}

function saveMarketFrameCache() {
  try {
    localStorage.setItem('inj_monitor_market_frames_v2', JSON.stringify({
      m1: state.marketFrames.m1,
      y1: state.marketFrames.y1,
      all: state.marketFrames.all,
      updated: state.marketFramesUpdated
    }));
  } catch (_) {}
}

async function binanceKlineRange(startTime, interval = '1d') {
  const data = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${interval}&startTime=${Math.max(0, Math.floor(startTime))}&limit=1000`, 9000);
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return { open: 0, min: 0, max: 0, at: 0 };
  const valid = rows.filter((row) => number(row?.[1]) > 0 && number(row?.[2]) > 0 && number(row?.[3]) > 0);
  if (!valid.length) return { open: 0, min: 0, max: 0, at: 0 };
  return {
    open: number(valid[0][1]),
    min: Math.min(...valid.map((row) => number(row[3]))),
    max: Math.max(...valid.map((row) => number(row[2]))),
    at: number(valid[0][0])
  };
}

async function loadMarketTimeframes(force = false) {
  if (state.marketFramesLoading) return;
  if (!force && state.marketFramesUpdated && Date.now() - state.marketFramesUpdated < 15 * 60_000) return;
  state.marketFramesLoading = true;
  try {
    const now = new Date();
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);

    const [monthResult, yearResult, allResult] = await Promise.allSettled([
      binanceKlineRange(monthAgo.getTime(), '1d'),
      binanceKlineRange(yearAgo.getTime(), '1d'),
      binanceKlineRange(0, '1M')
    ]);

    if (monthResult.status === 'fulfilled' && monthResult.value.open > 0) state.marketFrames.m1 = monthResult.value;
    if (yearResult.status === 'fulfilled' && yearResult.value.open > 0) state.marketFrames.y1 = yearResult.value;
    if (allResult.status === 'fulfilled' && allResult.value.open > 0) state.marketFrames.all = allResult.value;

    if ([state.marketFrames.m1.open, state.marketFrames.y1.open, state.marketFrames.all.open].some((value) => value > 0)) {
      state.marketFramesUpdated = Date.now();
      saveMarketFrameCache();
    }
    renderMarketTimeframes();
    renderEntryMarketMatrix();
  } catch (_) {
    renderMarketTimeframes();
    renderEntryMarketMatrix();
  } finally {
    state.marketFramesLoading = false;
  }
}

function marketFramePrefix(key) {
  return ({ d1: '1d', m1: '1m', y1: '1y', all: 'All' })[key] || '';
}

function flashMarketFrameExtreme(key, side) {
  if (state.suppressEffects || document.hidden) return;
  const prefix = marketFramePrefix(key);
  const suffix = side === 'min' ? 'Min' : 'Max';
  const elements = [`tf${prefix}${suffix}`, `wtf${prefix}${suffix}`].map($).filter(Boolean);
  if (!elements.length) return;

  const timerKey = `${key}:${side}`;
  clearTimeout(state.marketExtremeFlashTimers[timerKey]);
  elements.forEach((element) => {
    element.classList.remove('market-extreme-flash');
    void element.offsetWidth;
    element.classList.add('market-extreme-flash');
  });
  state.marketExtremeFlashTimers[timerKey] = setTimeout(() => {
    elements.forEach((element) => element.classList.remove('market-extreme-flash'));
    delete state.marketExtremeFlashTimers[timerKey];
  }, 2400);
}

function updateLiveMarketFrameExtremes(current) {
  if (!(number(current) > 0)) return false;
  let changed = false;
  const tolerance = Math.max(1e-10, number(current) * 1e-10);

  ['m1', 'y1', 'all'].forEach((key) => {
    const frame = state.marketFrames[key];
    if (!(number(frame?.open) > 0) || !(number(frame?.min) > 0) || !(number(frame?.max) > 0)) return;

    if (current < number(frame.min) - tolerance) {
      frame.min = current;
      changed = true;
      requestAnimationFrame(() => flashMarketFrameExtreme(key, 'min'));
    }
    if (current > number(frame.max) + tolerance) {
      frame.max = current;
      changed = true;
      requestAnimationFrame(() => flashMarketFrameExtreme(key, 'max'));
    }
  });

  if (changed) saveMarketFrameCache();
  return changed;
}

function marketCenteredRangePosition(value, min, open, max) {
  const v = number(value);
  const lo = number(min);
  const op = number(open);
  const hi = number(max);
  if (!(v > 0) || !(lo > 0) || !(op > 0) || !(hi > 0)) return 50;

  // L'apertura resta sempre al centro. Le due meta' della barra hanno
  // scale indipendenti: Min -> Apertura occupa 0-50%, Apertura -> Max 50-100%.
  if (v <= op) {
    if (!(op > lo)) return 50;
    const ratio = (v - lo) / (op - lo);
    return Math.max(1.5, Math.min(50, ratio * 50));
  }

  if (!(hi > op)) return 50;
  const ratio = (v - op) / (hi - op);
  return Math.max(50, Math.min(98.5, 50 + ratio * 50));
}

function renderMarketFrame(key, prefix) {
  const row = $(`tf${prefix}Row`);
  const minEl = $(`tf${prefix}Min`);
  const openEl = $(`tf${prefix}Open`);
  const maxEl = $(`tf${prefix}Max`);
  const changeEl = $(`tf${prefix}Change`);
  const track = $(`tf${prefix}Track`);
  if (!row || !minEl || !openEl || !maxEl || !changeEl || !track) return;

  const frame = state.marketFrames[key] || {};
  const open = number(frame.open);
  const current = number(state.price);
  let min = number(frame.min);
  let max = number(frame.max);

  if (!(open > 0) || !(current > 0) || !(min > 0) || !(max > 0)) {
    minEl.textContent = '—';
    setBlinkOnlyElement(openEl, open > 0 ? money(open, open < 1 ? 4 : 3) : '—', open > 0 ? open : NaN);
    maxEl.textContent = '—';
    changeEl.textContent = '—';
    row.className = 'market-tf neutral';
    track.style.setProperty('--tf-pos', '50%');
    track.style.setProperty('--tf-open-pos', '50%');
    track.style.setProperty('--tf-fill-start', '50%');
    track.style.setProperty('--tf-fill-width', '0%');
    return;
  }

  min = Math.min(min, open, current);
  max = Math.max(max, open, current);
  const openPosition = 50;
  const currentPosition = marketCenteredRangePosition(current, min, open, max);
  const start = Math.min(50, currentPosition);
  const width = Math.abs(currentPosition - 50);
  const changePercent = ((current / open) - 1) * 100;
  const digits = (value) => value < 1 ? 4 : value >= 100 ? 2 : 3;

  setBlinkOnlyElement(minEl, money(min, digits(min)), min);
  setBlinkOnlyElement(openEl, money(open, digits(open)), open);
  setBlinkOnlyElement(maxEl, money(max, digits(max)), max);
  setBlinkOnlyElement(changeEl, `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(Math.abs(changePercent) >= 100 ? 1 : 2)}%`, changePercent, { flash: false });
  row.className = `market-tf ${changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral'}`;
  track.style.setProperty('--tf-pos', `${currentPosition.toFixed(3)}%`);
  track.style.setProperty('--tf-open-pos', '50%');
  track.style.setProperty('--tf-fill-start', `${start.toFixed(3)}%`);
  track.style.setProperty('--tf-fill-width', `${width.toFixed(3)}%`);
  track.title = `Min ${money(min, digits(min))} · Apertura ${money(open, digits(open))} · Ora ${money(current, digits(current))} · Max ${money(max, digits(max))}`;
}

function renderMarketTimeframes() {
  renderMarketFrame('d1', '1d');
  renderMarketFrame('m1', '1m');
  renderMarketFrame('y1', '1y');
  renderMarketFrame('all', 'All');
}

function timeframeCollapsedPreference(kind) {
  try { return localStorage.getItem(`inj_monitor_${kind}_timeframes_collapsed_v1`) === '1'; }
  catch (_) { return false; }
}

function setTimeframeCollapsed(kind, collapsed, persist = true) {
  if (kind !== 'market') return;
  const card = $('marketCard');
  const toggle = $('marketTimeframeToggle');
  const panel = $('marketTimeframesPanel');
  if (!card || !toggle || !panel) return;
  const next = Boolean(collapsed);
  card.classList.toggle('timeframes-collapsed', next);
  panel.hidden = next;
  toggle.setAttribute('aria-expanded', next ? 'false' : 'true');
  toggle.title = next ? 'Mostra i timeframe' : 'Nascondi i timeframe';
  if (persist) {
    try { localStorage.setItem('inj_monitor_market_timeframes_collapsed_v1', next ? '1' : '0'); } catch (_) {}
  }
}

function toggleTimeframes(kind) {
  if (kind !== 'market') return;
  const card = $('marketCard');
  if (!card) return;
  setTimeframeCollapsed('market', !card.classList.contains('timeframes-collapsed'));
}

function trackerCollapsedPreference(kind) {
  try { return localStorage.getItem(`inj_monitor_${kind}_tracker_collapsed_v1`) === '1'; }
  catch (_) { return false; }
}

function setTrackerCollapsed(kind, collapsed, persist = true) {
  const reward = kind === 'reward';
  const card = reward ? $('yieldCard') : $('targetCard');
  const panel = reward ? $('rewardTrackerPanel') : $('targetTrackerPanel');
  const toggle = reward ? $('rewardTrackerToggle') : $('targetTrackerToggle');
  if (!card || !panel || !toggle) return;

  const next = Boolean(collapsed);
  card.classList.toggle('tracker-collapsed', next);
  panel.hidden = next;
  toggle.setAttribute('aria-expanded', next ? 'false' : 'true');
  toggle.title = next ? `Mostra i dati ${reward ? 'Reward Tracker' : 'Target Tracker'}` : `Nascondi i dati ${reward ? 'Reward Tracker' : 'Target Tracker'}`;
  if (persist) {
    try { localStorage.setItem(`inj_monitor_${kind}_tracker_collapsed_v1`, next ? '1' : '0'); } catch (_) {}
  }
}

function toggleTracker(kind) {
  const card = kind === 'reward' ? $('yieldCard') : $('targetCard');
  if (!card) return;
  setTrackerCollapsed(kind, !card.classList.contains('tracker-collapsed'));
}

function dashboardCollapseConfig(kind) {
  const configs = {
    overview: { card: 'accountDetail', panel: 'overviewSectionPanel', toggle: 'overviewSectionToggle', label: 'Overview' },
    wallet: { card: 'dashboardWalletSection', panel: 'walletSectionPanel', toggle: 'walletSectionToggle', label: 'Posizione' },
    staking: { card: 'dashboardStakingSection', panel: 'stakingSectionPanel', toggle: 'stakingSectionToggle', label: 'Reward & Obiettivi' },
    goals: { card: 'walletGoalsCard', panel: 'walletGoalsPanel', toggle: 'walletGoalsToggle', label: 'Prossimo livello e Prossimo target' },
    validators: { card: 'validatorCard', panel: 'validatorPanel', toggle: 'validatorToggle', label: 'Delegazioni attive' },
    matrix: { card: 'marketMatrixSection', panel: 'marketMatrixPanel', toggle: 'marketMatrixToggle', label: 'Market Matrix' }
  };
  return configs[kind] || null;
}

function dashboardCollapsedPreference(kind) {
  try { return localStorage.getItem(`inj_node_dashboard_${kind}_collapsed_v1`) === '1'; }
  catch (_) { return false; }
}

function setDashboardCollapsed(kind, collapsed, persist = true) {
  const config = dashboardCollapseConfig(kind);
  if (!config) return;
  const card = $(config.card);
  const panel = $(config.panel);
  const toggle = $(config.toggle);
  if (!card || !panel || !toggle) return;

  const next = Boolean(collapsed);
  card.classList.toggle('dashboard-collapsed', next);
  panel.hidden = next;
  toggle.setAttribute('aria-expanded', next ? 'false' : 'true');
  toggle.title = next ? `Apri ${config.label}` : `Chiudi ${config.label}`;
  if (persist) {
    try { localStorage.setItem(`inj_node_dashboard_${kind}_collapsed_v1`, next ? '1' : '0'); } catch (_) {}
  }
}

function toggleDashboardSection(kind) {
  const config = dashboardCollapseConfig(kind);
  const card = config ? $(config.card) : null;
  if (!card) return;
  setDashboardCollapsed(kind, !card.classList.contains('dashboard-collapsed'));
}

async function loadEurRate() {
  try {
    const cached = number(localStorage.getItem('inj_monitor_eur_rate'));
    if (cached > 0) { state.eurRate = cached; renderEntryConverter(); }
    const data = await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR', 6000);
    const current = number(data?.rates?.EUR);
    if (current > 0) {
      state.eurRate = current;
      localStorage.setItem('inj_monitor_eur_rate', String(current));
      renderAll();
      renderEntryConverter();
    }
  } catch (_) {}
}

// v15.98.62 — one visual market clock shared by every main-app surface.
function syncVisualMarketChange() {
  const open = number(state.marketOpen24) || number(state.marketFrames?.d1?.open);
  if (open > 0 && state.price > 0) {
    state.changeAmount = state.price - open;
    state.change = (state.price / open - 1) * 100;
  } else {
    state.change = number(state.marketRawChange);
    state.changeAmount = number(state.marketRawChangeAmount);
  }
}

function syncEntrySparkToVisualPrice() {
  if (!$('entryGate')?.classList.contains('visible') || !(state.price > 0)) return;
  const last = state.entrySpark.points.at(-1);
  if (!last?.live) return;
  last.t = Date.now();
  last.price = state.price;
}

function renderHomeMarketMotion() {
  const { wallet, row } = selectedEntrySummary();
  if (!wallet) return;
  const total = number(row?.total);
  const worth = total * state.price;
  setEntryAnimatedValue('entryWalletWorth', total > 0 && state.price > 0 ? compactMoney(worth) : '—', worth, { roll: true, stableDigits: true });
  setEntryAnimatedValue('entryMarketPrice', state.price > 0 ? money(state.price, state.price < 10 ? 4 : 3) : '—', state.price, { directional: true, roll: true });
  const change = $('entryMarketChange');
  if (change) {
    const value = number(state.change);
    change.className = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
    setEntryAnimatedValue('entryMarketChange', state.price > 0 ? `${value > 0 ? '+' : ''}${value.toFixed(2)}% · 24H` : '— · 24H', state.price > 0 ? value : NaN, { directional: true });
  }
  const gate = $('entryGate');
  if (gate) {
    const value = number(state.change);
    gate.classList.toggle('market-positive', value > 0);
    gate.classList.toggle('market-negative', value < 0);
    gate.classList.toggle('market-neutral', value === 0 || !Number.isFinite(value));
  }
  const staked = number(row?.staked);
  const cachedApr = number(row?.personalApr);
  const apr = cachedApr > 0 ? cachedApr : (wallet.address === state.address ? number(state.personalApr) : 0);
  const dailyReward = staked > 0 && apr > 0 ? staked * (apr / 100) / 365 : 0;
  setEntryAnimatedValue('entryDesktopDailyRewardValue', dailyReward > 0 && state.price > 0 ? `${money(dailyReward * state.price, 2)} / giorno` : 'Stima netta', dailyReward > 0 && state.price > 0 ? dailyReward * state.price : NaN);
  syncEntrySparkToVisualPrice();
  renderEntryAtGlance();
  renderEntryConverter();
  updateEntryPnlTimelineLive();
  renderEntryMarketMatrix();
}

function renderPortfolioMarketMotion() {
  if (!state.address) return;
  const totalInj = currentTotalInj();
  const netWorth = totalInj * state.price;
  setValue('netWorthUsd', state.price > 0 ? money(netWorth, 2) : '—', state.price > 0 ? netWorth : NaN, { roll: true, flash: false });
  setValue('availableUsd', state.price > 0 ? money(state.available * state.price) : '—', state.available * state.price, { flash: false });
  setValue('ownedTotalUsd', state.price > 0 ? money(totalInj * state.price) : '—', totalInj * state.price, { flash: false });
  setValue('stakedUsd', state.price > 0 ? money(state.staked * state.price) : '—', state.staked * state.price, { flash: false });
  setValue('rewardsUsd', state.price > 0 ? money(state.rewards * state.price) : '—', state.rewards * state.price, { flash: false });

  const netWorthChange24h = totalInj * state.changeAmount;
  const worthChange = $('netWorthChange24h');
  if (worthChange && state.price > 0) {
    const label = netWorthChange24h > 0 ? 'Guadagno 24h' : netWorthChange24h < 0 ? 'Perdita 24h' : 'Variazione 24h';
    worthChange.className = `worth-change private ${netWorthChange24h > 0 ? 'positive' : netWorthChange24h < 0 ? 'negative' : 'neutral'}`;
    setBlinkOnlyElement(worthChange, `${label} ${signedMoney(netWorthChange24h, 2)} (${state.change > 0 ? '+' : ''}${state.change.toFixed(2)}%)`, netWorthChange24h, { flash: false });
  }

  const pnlElement = $('netWorthPnl');
  const averageBuyPrice = currentAverageBuyPrice();
  if (pnlElement && state.price > 0 && averageBuyPrice > 0) {
    const pnl = netWorth - totalInj * averageBuyPrice;
    const pnlPercent = (state.price / averageBuyPrice - 1) * 100;
    const prefix = pnl > 0 ? '+' : pnl < 0 ? '−' : '';
    pnlElement.className = `worth-change private ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral'}`;
    setBlinkOnlyElement(pnlElement, `PnL totale ${prefix}${money(Math.abs(pnl), 2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`, pnl, { flash: false });
  }
  const miniWorths = document.querySelectorAll('#walletCards .wallet-mini-worth');
  miniWorths.forEach((element, index) => {
    const wallet = state.wallets[index];
    const row = wallet ? state.walletSummaries[wallet.address] : null;
    if (row && state.price > 0) element.textContent = compactMoney(number(row.total) * state.price);
  });
}

function renderRewardValuationMarketMotion() {
  if (!(state.staked > 0 && state.personalApr > 0 && state.price > 0) || state.rewardSimulationPrice > 0) return;
  const daily = state.staked * (state.personalApr / 100) / 365;
  const rows = [
    ['hourlyUsd', daily / 24, 4],
    ['dailyUsd', daily, 3],
    ['weeklyUsd', daily * 7, 3],
    ['monthlyUsd', daily * 30, 2],
    ['yearlyUsd', daily * 365, 2]
  ];
  rows.forEach(([id, inj, digits]) => setPulseOnlyValue(id, money(inj * state.price, digits), inj * state.price, { flash: false }));

  const dailyUsdValue = daily * state.price;
  const milestones = [0.25,0.5,1,2,3,5,7.5,10,15,20,25,50,75,100,150,200,250,500,750,1000,1500,2000,2500,5000];
  let target = milestones.find((value) => value > dailyUsdValue + 1e-9);
  if (!(target > 0)) {
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, dailyUsdValue))));
    target = Math.ceil(dailyUsdValue / magnitude + .001) * magnitude;
    if (target <= dailyUsdValue) target += magnitude;
  }
  if (dailyUsdValue < 2) target = 2;
  const rawScaleMax = Math.max(target * 1.12, dailyUsdValue * 1.08, .5);
  const scaleStep = rawScaleMax <= 5 ? .5 : rawScaleMax <= 20 ? 1 : rawScaleMax <= 100 ? 5 : rawScaleMax <= 500 ? 25 : 100;
  const scaleMax = Math.max(scaleStep, Math.ceil(rawScaleMax / scaleStep) * scaleStep);
  const markerPct = Math.max(0, Math.min(100, dailyUsdValue / scaleMax * 100));
  const targetPct = Math.max(0, Math.min(100, target / scaleMax * 100));
  const gauge = $('rewardUsdProgress');
  if (gauge) {
    gauge.style.setProperty('--reward-usd-marker', `${markerPct}%`);
    gauge.style.setProperty('--reward-usd-target', `${targetPct}%`);
    gauge.classList.toggle('target-reached', dailyUsdValue >= target);
  }
  if ($('rewardDailyUsdGauge')) $('rewardDailyUsdGauge').textContent = `${money(dailyUsdValue, 3)} / giorno`;
  if ($('rewardUsdTargetValue')) $('rewardUsdTargetValue').textContent = `${money(target, target < 10 ? 2 : 0)} / giorno`;
  if ($('rewardUsdProgressCopy')) {
    const progress = target > 0 ? Math.max(0, Math.min(100, dailyUsdValue / target * 100)) : 0;
    $('rewardUsdProgressCopy').textContent = `${progress.toLocaleString('it-IT',{maximumFractionDigits:progress<10?1:0})}% del target`;
  }
  if ($('rewardUsdScaleMax')) $('rewardUsdScaleMax').textContent = money(scaleMax, scaleMax < 10 ? 2 : 0);
}

function renderAggregateMarketMotion() {
  if (state.wallets.length <= 1) return;
  const rows = state.wallets.map((wallet) => state.walletSummaries[wallet.address]).filter(Boolean);
  const total = rows.reduce((sum, row) => sum + number(row.total), 0);
  setValue('aggregateNetWorth', rows.length && state.price > 0 ? money(total * state.price, 2) : '—', total * state.price, { flash: false });
}

function renderGlobalMarketMotion() {
  state.marketMotionRendering = true;
  try {
    if (state.currentView === 'home') {
      renderHomeMarketMotion();
      return;
    }
    if (state.currentView === 'dashboard') {
      renderMarket();
      renderPortfolioMarketMotion();
      renderRewardValuationMarketMotion();
      renderAggregateMarketMotion();
      updateNativeChartLive(state.price);
      return;
    }
    if (state.currentView === 'live') {
      renderFocusDisplay();
      return;
    }
    if (state.currentView === 'pulse') {
      renderPulseView();
      return;
    }
    if (state.currentView === 'performance') {
      updateEntryPnlTimelineLive();
      return;
    }
    if (state.currentView === 'charts') {
      updateLiveChartsTick(state.price, Date.now());
      scheduleLiveChartsRender(false);
    }
  } finally {
    state.marketMotionRendering = false;
  }
}

function runGlobalMarketMotion(timestamp) {
  state.marketMotionFrame = 0;
  if (document.hidden) return;
  const target = number(state.marketTargetPrice) || number(state.marketRawPrice);
  if (!(target > 0)) return;
  const previousFrame = number(state.marketMotionLastFrame) || timestamp - 50;
  const dt = Math.max(8, Math.min(120, timestamp - previousFrame));
  state.marketMotionLastFrame = timestamp;
  if (!(state.price > 0)) state.price = target;
  const delta = target - state.price;
  state.price += delta * (1 - Math.exp(-dt / 125));
  if (Math.abs(target - state.price) < Math.max(0.0000005, target * 1e-8)) state.price = target;
  syncVisualMarketChange();

  if (timestamp - number(state.marketMotionLastRender) >= 80) {
    state.marketMotionLastRender = timestamp;
    renderGlobalMarketMotion();
  }

  const moving = Math.abs(target - state.price) > Math.max(0.0000005, target * 1e-8);
  if (moving || timestamp < number(state.marketMotionUntil)) {
    state.marketMotionFrame = requestAnimationFrame(runGlobalMarketMotion);
  }
}

function startGlobalMarketMotion(duration = 1400) {
  state.marketMotionUntil = Math.max(number(state.marketMotionUntil), performance.now() + Math.max(250, number(duration)));
  if (!state.marketMotionFrame && !document.hidden) state.marketMotionFrame = requestAnimationFrame(runGlobalMarketMotion);
}

const MARKET_MATRIX_BUCKETS = { h1: 3_600_000 };
const MARKET_MATRIX_IDS = { h1: 'H1', d1: 'D1', w1: 'W1', mo1: 'MO1', y1: 'Y1' };

function marketMatrixBucketStart(now, duration) {
  return Math.floor(now / duration) * duration;
}

function syncMarketMatrixBuckets(price, now = Date.now()) {
  if (!(price > 0) || !state.marketMatrix) return;
  for (const [key, duration] of Object.entries(MARKET_MATRIX_BUCKETS)) {
    const start = marketMatrixBucketStart(now, duration);
    if (number(state.marketMatrix.bucketStarts[key]) !== start) {
      state.marketMatrix.bucketStarts[key] = start;
      state.marketMatrix.opens[key] = price;
    }
  }
  const weekStart = number(state.marketMatrix.bucketStarts.w1);
  if (weekStart > 0 && now >= weekStart + 7 * 86_400_000) {
    state.marketMatrix.bucketStarts.w1 = now;
    state.marketMatrix.opens.w1 = price;
  }
}

function marketMatrixPercent(open, price = state.price) {
  const o = number(open);
  const p = number(price);
  return o > 0 && p > 0 ? (p / o - 1) * 100 : NaN;
}

function marketMatrixValueText(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs < .01 ? 3 : 2;
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function renderEntryMarketMatrix() {
  const host = $('entryMarketMatrix');
  if (!host) return;
  const price = number(state.price);
  const matrix = state.marketMatrix || {};
  const values = {
    h1: marketMatrixPercent(matrix.opens?.h1, price),
    d1: marketMatrixPercent(state.marketOpen24, price),
    w1: marketMatrixPercent(matrix.opens?.w1, price),
    mo1: marketMatrixPercent(state.marketFrames?.m1?.open, price),
    y1: marketMatrixPercent(state.marketFrames?.y1?.open, price)
  };

  let bullish = 0;
  let bearish = 0;
  let valid = 0;
  for (const [key, value] of Object.entries(values)) {
    const suffix = MARKET_MATRIX_IDS[key];
    const output = $(`matrix${suffix}`);
    const status = $(`matrix${suffix}State`);
    const cell = host.querySelector(`[data-matrix-key="${key}"]`);
    const rail = host.querySelector(`[data-segment="${key}"]`);
    const direction = Number.isFinite(value) ? (value > .00005 ? 1 : value < -.00005 ? -1 : 0) : 0;
    if (Number.isFinite(value)) valid += 1;
    if (direction > 0) bullish += 1;
    if (direction < 0) bearish += 1;
    if (output) output.textContent = marketMatrixValueText(value);
    if (status) status.textContent = !Number.isFinite(value) ? 'SYNC' : direction > 0 ? 'UP' : direction < 0 ? 'DOWN' : 'FLAT';
    for (const node of [cell, rail]) {
      if (!node) continue;
      node.classList.remove('matrix-up', 'matrix-down', 'matrix-neutral');
      node.classList.add(direction > 0 ? 'matrix-up' : direction < 0 ? 'matrix-down' : 'matrix-neutral');
    }
  }

  const live = $('entryMarketMatrixLive');
  if (live) {
    live.classList.toggle('online', valid === 5 && price > 0);
    const label = live.querySelector('b');
    if (label) label.textContent = valid === 5 && price > 0 ? 'LIVE' : 'SYNC';
  }

  const consensus = $('entryMarketMatrixConsensus');
  if (consensus) {
    consensus.classList.remove('matrix-up', 'matrix-down', 'matrix-neutral');
    if (!valid) {
      consensus.textContent = 'SYNC';
      consensus.classList.add('matrix-neutral');
    } else if (bullish > bearish) {
      consensus.textContent = `${bullish}/5 BULLISH`;
      consensus.classList.add('matrix-up');
    } else if (bearish > bullish) {
      consensus.textContent = `${bearish}/5 BEARISH`;
      consensus.classList.add('matrix-down');
    } else {
      consensus.textContent = `${bullish} UP · ${bearish} DOWN`;
      consensus.classList.add('matrix-neutral');
    }
  }
}

async function loadEntryMarketMatrixAnchors(force = false) {
  const matrix = state.marketMatrix;
  if (!matrix || matrix.loading) return;
  const now = Date.now();
  if (!force && matrix.loadedAt && now - matrix.loadedAt < 8 * 60_000) return;
  matrix.loading = true;
  renderEntryMarketMatrix();
  try {
    const [minuteResult, weekResult] = await Promise.allSettled([
      fetchJson('https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=1m&limit=65', 7000),
      fetchJson('https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=1w&limit=2', 7000)
    ]);

    if (minuteResult.status === 'fulfilled' && Array.isArray(minuteResult.value)) {
      const rows = minuteResult.value;
      for (const [key, duration] of Object.entries(MARKET_MATRIX_BUCKETS)) {
        const start = marketMatrixBucketStart(now, duration);
        const row = rows.find((item) => number(item?.[0]) === start);
        const open = number(row?.[1]);
        if (open > 0) {
          matrix.opens[key] = open;
          matrix.bucketStarts[key] = start;
        }
      }
    }

    if (weekResult.status === 'fulfilled' && Array.isArray(weekResult.value)) {
      const row = weekResult.value.at(-1);
      const open = number(row?.[1]);
      const start = number(row?.[0]);
      if (open > 0) matrix.opens.w1 = open;
      if (start > 0) matrix.bucketStarts.w1 = start;
    }
    matrix.loadedAt = Date.now();
  } catch (_) {
    // Existing live bucket anchors remain usable if the history request fails.
  } finally {
    matrix.loading = false;
    renderEntryMarketMatrix();
  }
}

function updateMarket(next) {
  state.lastMarketUpdate = Date.now();
  document.body.classList.remove('market-data-loading');
  const previousD1 = { ...state.marketFrames.d1 };
  const rawPrice = number(next.price);
  const firstPrice = !(state.price > 0);
  if (rawPrice > 0) syncMarketMatrixBuckets(rawPrice, Date.now());

  if (rawPrice > 0) {
    state.marketRawPrice = rawPrice;
    state.marketTargetPrice = rawPrice;
    if (firstPrice) state.price = rawPrice;
  }
  if (Number.isFinite(Number(next.change))) state.marketRawChange = Number(next.change);
  if (Number.isFinite(Number(next.changeAmount))) state.marketRawChangeAmount = Number(next.changeAmount);
  if (number(next.open24h) > 0) state.marketOpen24 = number(next.open24h);
  if (number(next.low) > 0) state.low = number(next.low);
  if (number(next.high) > 0) state.high = number(next.high);

  if (number(next.open24h) > 0 && number(next.low) > 0 && number(next.high) > 0) {
    const nextD1 = { open: number(next.open24h), min: number(next.low), max: number(next.high), at: Date.now() - 86_400_000 };
    const tolerance = Math.max(1e-10, rawPrice * 1e-10);
    const newMin = number(previousD1.min) > 0 && nextD1.min < number(previousD1.min) - tolerance;
    const newMax = number(previousD1.max) > 0 && nextD1.max > number(previousD1.max) + tolerance;
    state.marketFrames.d1 = nextD1;
    if (newMin) requestAnimationFrame(() => flashMarketFrameExtreme('d1', 'min'));
    if (newMax) requestAnimationFrame(() => flashMarketFrameExtreme('d1', 'max'));
  }

  if (rawPrice > 0) {
    updateLiveMarketFrameExtremes(rawPrice);
    updateNativeChartLive(rawPrice);
    if (state.currentView === 'charts') updateLiveChartsTick(rawPrice, Date.now());
  }

  // Keep the Home day chart historically truthful: only raw exchange ticks are
  // stored. The final live point is visually interpolated by the global motion
  // frame without manufacturing extra historical samples.
  if ($('entryGate')?.classList.contains('visible')) {
    const now = Date.now();
    const bounds = entryLocalDayBounds(now);
    if (number(state.entrySpark.dayStart) !== bounds.start) {
      resetEntryPriceSession(bounds.start);
      void loadEntrySparkline(true);
    }
    if (rawPrice > 0 && number(state.entrySpark.dayStart) === bounds.start) {
      let lastSpark = state.entrySpark.points.at(-1);
      const sampleAge = now - number(state.entrySpark.lastLiveSampleAt);
      if (!lastSpark || !lastSpark.live || sampleAge >= 180_000) {
        if (lastSpark?.live) lastSpark.live = false;
        state.entrySpark.points.push({ t: now, price: rawPrice, live: true });
        state.entrySpark.lastLiveSampleAt = now;
      } else {
        lastSpark.t = now;
        lastSpark.price = rawPrice;
      }
    }
  }

  syncVisualMarketChange();
  renderDataFreshness();
  if (firstPrice) {
    state.marketMotionRendering = true;
    try { renderAll(); if ($('entryGate')?.classList.contains('visible')) renderEntryOverview(); }
    finally { state.marketMotionRendering = false; }
  }
  startGlobalMarketMotion();
}

async function loadMarket() {
  if (!(state.price > 0)) document.body.classList.add('market-data-loading');
  try {
    const ticker = await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT');
    updateMarket({
      price: ticker.lastPrice,
      change: ticker.priceChangePercent,
      changeAmount: ticker.priceChange,
      low: ticker.lowPrice,
      high: ticker.highPrice,
      open24h: ticker.openPrice
    });
    setStatus('online', state.address ? 'Wallet online' : 'Mercato live');
  } catch (primaryError) {
    try {
      const data = await fetchJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=injective-protocol&sparkline=false');
      const coin = data?.[0];
      const fallbackPrice = number(coin?.current_price);
      const fallbackChangeAmount = number(coin?.price_change_24h);
      updateMarket({ price: fallbackPrice, change: coin?.price_change_percentage_24h, changeAmount: fallbackChangeAmount, low: coin?.low_24h, high: coin?.high_24h, open24h: fallbackPrice - fallbackChangeAmount });
      setStatus('online', 'Mercato online');
    } catch (_) {
      document.body.classList.remove('market-data-loading');
      setStatus('offline', 'Mercato non disponibile');
      renderDataFreshness();
    }
  }
}

function connectMarketSocket() {
  if (document.hidden) return;
  try { state.socket?.close(); } catch (_) {}
  try {
    // v15.98.62 — same lightweight Binance miniTicker feed used by Command Center.
    // The raw tick is the target; the shared visual market clock interpolates it
    // across every visible INJ Node surface.
    const socket = new WebSocket('wss://stream.binance.com:9443/ws/injusdt@miniTicker');
    state.socket = socket;
    socket.onopen = () => setStatus('online', state.address ? 'Wallet online' : 'Mercato live');
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const tick = payload?.data || payload;
        const price = number(tick.c);
        const open = number(tick.o);
        updateMarket({
          price,
          change: open > 0 && price > 0 ? (price / open - 1) * 100 : state.marketRawChange,
          changeAmount: open > 0 && price > 0 ? price - open : state.marketRawChangeAmount,
          low: tick.l,
          high: tick.h,
          open24h: tick.o
        });
      } catch (_) {}
    };
    socket.onerror = () => setStatus('', 'Riconnessione…');
    socket.onclose = () => { if (!document.hidden) setTimeout(connectMarketSocket, 4000); };
  } catch (_) {
    setTimeout(connectMarketSocket, 5000);
  }
}

async function loadValidator(row) {
  const cached = state.validatorMeta[row.operator];
  if (cached && Date.now() - number(cached.updated) < 10 * 60_000) {
    return { ...row, ...cached };
  }
  try {
    const response = await lcd(`/cosmos/staking/v1beta1/validators/${row.operator}`);
    const validator = response?.validator || {};
    const meta = {
      moniker: validator?.description?.moniker || shortAddress(row.operator),
      commission: Math.max(0, Math.min(1, rate(validator?.commission?.commission_rates?.rate))),
      status: validator?.status || '',
      jailed: Boolean(validator?.jailed),
      updated: Date.now()
    };
    state.validatorMeta[row.operator] = meta;
    return { ...row, ...meta };
  } catch (_) {
    if (cached) return { ...row, ...cached };
    return { ...row, moniker: shortAddress(row.operator), commission: 0, status: '', jailed: false };
  }
}

async function ensureNetworkApr(force = false) {
  if (!force && state.networkApr > 0 && Date.now() - state.networkAprUpdated < 5 * 60_000) {
    return state.networkApr;
  }

  const [annual, pool, distribution, officialApr] = await Promise.all([
    lcd('/cosmos/mint/v1beta1/annual_provisions'),
    lcd('/cosmos/staking/v1beta1/pool'),
    lcd('/cosmos/distribution/v1beta1/params').catch(() => null),
    fetchJson(OFFICIAL_APR_ENDPOINT, 7000).catch(() => null)
  ]);

  const officialBaseApr = aprPercent(officialApr?.apr);
  const annualProvisions = number(annual?.annual_provisions);
  const bondedTokens = number(pool?.pool?.bonded_tokens);
  const communityTax = rate(distribution?.params?.community_tax);
  const fallbackGrossApr = bondedTokens > 0 ? (annualProvisions / bondedTokens) * 100 : 0;
  const fallbackDelegatorApr = fallbackGrossApr * Math.max(0, 1 - communityTax);
  const nextApr = officialBaseApr || fallbackDelegatorApr;
  if (nextApr > 0) {
    state.networkApr = nextApr;
    state.networkAprUpdated = Date.now();
  }
  return state.networkApr;
}

function activateWalletImmediately(address, requestedLabel = '') {
  const wallet = ensureSavedWallet(address, requestedLabel);
  const cached = state.walletSummaries[address];

  state.address = address;
  state.walletPendingAddress = address;
  state.suppressEffects = true;
  state.available = number(cached?.available);
  state.nativeUsdc = number(cached?.nativeUsdc);
  state.staked = number(cached?.staked);
  state.rewards = number(cached?.rewards);
  state.validators = Array.isArray(cached?.validators) ? cached.validators : [];
  state.personalApr = number(cached?.personalApr);
  state.weightedCommission = number(cached?.weightedCommission);
  if (number(cached?.networkApr) > 0) state.networkApr = number(cached.networkApr);

  $('addressInput').value = address;
  state.lastWalletUpdate = number(cached?.updated);
  $('lastUpdate').textContent = cached?.updated
    ? new Date(cached.updated).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  setStatus('', `Apertura ${wallet.label}…`);
  renderAll();
  renderWalletControls();
  setSearchOpen(false);
}

function setLoading(loading) {
  state.loading = loading;
  $('loadButton').disabled = loading;
  const refreshMenuButton = $('refreshMenuButton');
  if (refreshMenuButton) {
    refreshMenuButton.disabled = loading;
    refreshMenuButton.classList.toggle('loading', loading);
  }
  $('loadButton').textContent = loading ? 'Lettura…' : 'Apri';
}

function setWalletSkeleton(visible) {
  document.body.classList.toggle('wallet-data-loading', Boolean(visible));
}

async function loadWallet(showFeedback = true, requestedAddress = '', requestedLabel = '') {
  const address = String(requestedAddress || $('addressInput').value || '').trim().toLowerCase();
  if (!validAddress(address)) {
    toast('Inserisci un indirizzo Injective valido');
    $('addressInput').focus();
    return;
  }

  const switchingWallet = state.address !== address;
  const hasSnapshot = Boolean(state.walletSummaries[address]?.updated);
  const requestId = ++state.walletRequest;
  if (switchingWallet && !hasSnapshot) setWalletSkeleton(true);

  // Feedback immediato: selezione e snapshot locale cambiano prima delle chiamate di rete.
  if (switchingWallet) activateWalletImmediately(address, requestedLabel);
  else {
    state.walletPendingAddress = address;
    renderWalletCards();
    setStatus('', 'Aggiornamento wallet…');
  }

  setLoading(true);
  const aprPromise = ensureNetworkApr(false).catch(() => state.networkApr);

  try {
    // Primo stadio: i tre dati essenziali. Appena arrivano, aggiorniamo subito la UI.
    const [bank, delegations, rewards] = await Promise.all([
      lcd(`/cosmos/bank/v1beta1/balances/${address}`),
      lcd(`/cosmos/staking/v1beta1/delegations/${address}`),
      lcd(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`)
    ]);
    if (requestId !== state.walletRequest) return;

    const validatorRows = delegationRows(delegations);
    state.address = address;
    const balances = bank?.balances || [];
    state.available = findInj(balances);
    state.nativeUsdc = findNativeUsdc(balances);
    state.staked = validatorRows.reduce((sum, item) => sum + item.amount, 0);
    state.rewards = rewardTotal(rewards);

    const previous = state.walletSummaries[address] || {};
    state.walletSummaries[address] = {
      ...previous,
      available: state.available,
      nativeUsdc: state.nativeUsdc,
      staked: state.staked,
      rewards: state.rewards,
      total: state.available + state.staked + state.rewards,
      updated: Date.now()
    };
    state.lastWalletUpdate = state.walletSummaries[address].updated;
    setWalletSkeleton(false);
    saveWalletSummaries();
    ensureSavedWallet(address, requestedLabel);
    renderDataFreshness();
    $('addressInput').value = address;
    $('lastUpdate').textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Il patrimonio cambia già qui, senza aspettare APR/validator.
    ensurePulseDayBaseline();
    renderPulseView();
    renderPortfolio();
    renderTarget();
    renderAggregate();
    renderWalletCards();
    setStatus('', 'Dati principali aggiornati…');

    // Secondo stadio: dettagli più costosi. Sono cache-izzati e non bloccano il cambio wallet.
    const [validators] = await Promise.all([
      Promise.all(validatorRows.map(loadValidator)),
      aprPromise
    ]);
    if (requestId !== state.walletRequest) return;

    state.validators = validators;
    await aprPromise;
    if (requestId !== state.walletRequest) return;
    calculatePersonalApr();

    state.walletSummaries[address] = {
      ...state.walletSummaries[address],
      validators,
      personalApr: state.personalApr,
      weightedCommission: state.weightedCommission,
      networkApr: state.networkApr,
      updated: Date.now()
    };
    state.lastWalletUpdate = state.walletSummaries[address].updated;
    saveWalletSummaries();
    renderDataFreshness();

    state.walletPendingAddress = '';
    setStatus('online', 'Wallet online');
    renderAll();
    renderWalletControls();
    state.suppressEffects = false;
    if (showFeedback) toast(switchingWallet ? 'Wallet aperto' : 'Dati wallet aggiornati');
  } catch (error) {
    if (requestId !== state.walletRequest) return;
    console.error(error);
    state.walletPendingAddress = '';
    setStatus('offline', 'Errore rete Injective');
    renderWalletCards();
    setWalletSkeleton(false);
    if (showFeedback) toast('Impossibile aggiornare il wallet');
  } finally {
    if (requestId === state.walletRequest) {
      state.walletPendingAddress = '';
      state.suppressEffects = false;
      setLoading(false);
      setWalletSkeleton(false);
      renderWalletCards();
    }
  }
}

function syncFocusDisplayViewport() {
  const dialog = $('focusDisplayDialog');
  if (!dialog || dialog.hidden) return;
  const viewport = window.visualViewport;
  const top = viewport ? viewport.offsetTop : 0;
  const left = viewport ? viewport.offsetLeft : 0;
  const width = viewport ? viewport.width : window.innerWidth;
  const height = viewport ? viewport.height : window.innerHeight;
  dialog.style.setProperty('--focus-viewport-top', `${Math.round(top)}px`);
  dialog.style.setProperty('--focus-viewport-left', `${Math.round(left)}px`);
  dialog.style.setProperty('--focus-viewport-width', `${Math.round(width)}px`);
  dialog.style.setProperty('--focus-viewport-height', `${Math.round(height)}px`);
}

function setFocusDisplayValue(element, text, numericValue, { roll = false } = {}) {
  if (!element) return;
  const nextText = String(text);
  const next = Number(numericValue);
  const previous = element.dataset.focusNumericValue === undefined ? NaN : Number(element.dataset.focusNumericValue);
  const previousText = element.dataset.focusRenderedValue;
  const visibleChange = previousText !== undefined && previousText !== nextText;
  const numericChange = Number.isFinite(previous) && Number.isFinite(next) &&
    Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);
  const active = isFocusDisplayActive();

  // v15.98.13: Live View rolls only PRICE and CONTROVALORE. Every other
  // metric is rendered as fixed text and retains the directional color blink.
  if (active && roll && !state.marketMotionRendering) {
    animateVerticalNumberRoll(element, previousText, nextText, previous, next);
  } else {
    clearTimeout(element._verticalRollTimer);
    element._verticalRollTimer = null;
    if (roll) {
      element.classList.add('number-roll-host');
      // v15.98.16: Live View is primed with the exact same per-digit geometry
      // used during the roll before the fullscreen layer becomes visible.
      // This removes the one-frame grow/snap seen on entry in Safari/iOS.
      renderStableNumberText(element, nextText);
    } else {
      element.classList.remove('number-roll-host');
      element.textContent = nextText;
    }
  }

  if (active && !state.suppressEffects && !state.marketMotionRendering && visibleChange && numericChange) {
    const direction = next > previous ? 'up' : 'down';
    element.classList.remove('focus-value-up', 'focus-value-down');
    void element.offsetWidth;
    element.classList.add(`focus-value-${direction}`);
    clearTimeout(element._focusValueTimer);
    element._focusValueTimer = setTimeout(() => {
      element.classList.remove('focus-value-up', 'focus-value-down');
    }, 1250);
  }

  element.dataset.focusRenderedValue = nextText;
  if (Number.isFinite(next)) element.dataset.focusNumericValue = String(next);
  else delete element.dataset.focusNumericValue;
}


const LIVE_CHART_MAX_WINDOW_MS = 60 * 60_000;
const LIVE_CHART_MAX_SAMPLES = 1100;
const LIVE_CHART_PLOT_LEFT_X = 12;
const LIVE_CHART_PLOT_RIGHT_X = 850;
const LIVE_CHART_VIEWBOX_HEIGHT = 220;
const LIVE_CHART_TOP_Y = 28;
const LIVE_CHART_BOTTOM_Y = 192;
const LIVE_CHART_HISTORY_KEY = 'inj_node_live_charts_history_v1';
const LIVE_CHART_RANGES = {
  m5: { windowMs: 5 * 60_000, prefix: 'liveChart5m', momentumMs: 45_000, minimumSpanRatio: 0.00008 },
  m10: { windowMs: 10 * 60_000, prefix: 'liveChart10m', momentumMs: 90_000, minimumSpanRatio: 0.00012 },
  h1: { windowMs: 60 * 60_000, prefix: 'liveChart1h', momentumMs: 9 * 60_000, minimumSpanRatio: 0.00025 }
};

function isLiveChartsActive() {
  const overlay = $('liveChartsDialog');
  return Boolean(overlay && !overlay.hidden && !overlay.classList.contains('mode-parked') && !overlay.classList.contains('is-closing'));
}

function persistLiveChartsHistory(force = false) {
  const chart = state.liveCharts;
  const now = Date.now();
  if (!force && now - number(chart.persistAt) < 60_000) return;
  chart.persistAt = now;
  try {
    const cutoff = now - LIVE_CHART_MAX_WINDOW_MS - 90_000;
    const rows = chart.samples.filter((row) => row.t >= cutoff && row.price > 0);
    const compact = focusLiveRenderSamples(rows, 1200).map((row) => [Math.round(row.t), Number(row.price)]);
    sessionStorage.setItem(LIVE_CHART_HISTORY_KEY, JSON.stringify(compact));
  } catch (_) {}
}

function restoreLiveChartsHistory() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(LIVE_CHART_HISTORY_KEY) || '[]');
    if (!Array.isArray(raw)) return;
    const cutoff = Date.now() - LIVE_CHART_MAX_WINDOW_MS - 90_000;
    const restored = raw
      .map((row) => ({ t: number(row?.[0]), price: number(row?.[1]) }))
      .filter((row) => row.t >= cutoff && row.price > 0)
      .sort((a, b) => a.t - b.t);
    if (!restored.length) return;
    state.liveCharts.samples = restored;
    state.liveCharts.lastSampleAt = restored.at(-1).t;
    state.liveCharts.targetPrice = restored.at(-1).price;
    state.liveCharts.visualPrice = restored.at(-1).price;
  } catch (_) {}
}

function mergeLiveChartsSamples(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const cutoff = Date.now() - LIVE_CHART_MAX_WINDOW_MS - 90_000;
  const combined = [...state.liveCharts.samples, ...rows]
    .filter((row) => row && number(row.t) >= cutoff && number(row.price) > 0)
    .map((row) => ({ t: number(row.t), price: number(row.price) }))
    .sort((a, b) => a.t - b.t);
  const merged = [];
  for (const row of combined) {
    const last = merged.at(-1);
    if (last && Math.abs(row.t - last.t) < 50) {
      last.t = Math.max(last.t, row.t);
      last.price = row.price;
    } else merged.push(row);
  }
  if (merged.length > LIVE_CHART_MAX_SAMPLES) merged.splice(0, merged.length - LIVE_CHART_MAX_SAMPLES);
  state.liveCharts.samples = merged;
  if (merged.length) {
    state.liveCharts.lastSampleAt = Math.max(number(state.liveCharts.lastSampleAt), merged.at(-1).t);
    if (!(state.liveCharts.targetPrice > 0)) state.liveCharts.targetPrice = merged.at(-1).price;
    if (!(state.liveCharts.visualPrice > 0)) state.liveCharts.visualPrice = state.liveCharts.targetPrice;
  }
}

async function loadLiveChartsHistory(force = false) {
  const chart = state.liveCharts;
  const now = Date.now();
  if (!force && now - number(chart.historyLoadedAt) < 55_000) return;
  chart.historyLoadedAt = now;
  try {
    const data = await fetchJson('https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=1m&limit=61', 6500);
    if (!Array.isArray(data)) return;
    const receivedAt = Date.now();
    const rows = data.map((row) => ({ t: Math.min(number(row?.[6] || row?.[0]), receivedAt), price: number(row?.[4]) })).filter((row) => row.t > 0 && row.price > 0);
    mergeLiveChartsSamples(rows);
    persistLiveChartsHistory(true);
    if (isLiveChartsActive()) scheduleLiveChartsRender(true);
  } catch (_) {}
}

function updateLiveChartsTick(rawPrice, rawTime = Date.now()) {
  const price = number(rawPrice);
  if (!(price > 0)) return;
  const chart = state.liveCharts;
  const now = Number(rawTime) || Date.now();
  const minGap = MOBILE_EFFICIENCY ? 1400 : 900;

  chart.lastTradeAt = now;
  chart.targetPrice = price;
  if (!(chart.visualPrice > 0)) chart.visualPrice = price;

  const last = chart.samples.at(-1);
  if (last && now - chart.lastSampleAt < minGap) {
    last.t = now;
    last.price = price;
  } else {
    chart.samples.push({ t: now, price });
    chart.lastSampleAt = now;
  }

  const cutoff = now - LIVE_CHART_MAX_WINDOW_MS - 90_000;
  while (chart.samples.length > 2 && chart.samples[0].t < cutoff) chart.samples.shift();
  if (chart.samples.length > LIVE_CHART_MAX_SAMPLES) chart.samples.splice(0, chart.samples.length - LIVE_CHART_MAX_SAMPLES);
  if (isLiveChartsActive()) scheduleLiveChartsRender();
}

function focusLiveMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function focusLiveSmoothPath(coords) {
  if (!coords?.length) return '';
  if (coords.length < 3) return coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  let path = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  for (let i = 1; i < coords.length - 1; i++) {
    const point = coords[i];
    const next = coords[i + 1];
    const midX = (point.x + next.x) / 2;
    const midY = (point.y + next.y) / 2;
    path += ` Q${point.x.toFixed(2)},${point.y.toFixed(2)} ${midX.toFixed(2)},${midY.toFixed(2)}`;
  }
  const penultimate = coords[coords.length - 2];
  const last = coords.at(-1);
  path += ` Q${penultimate.x.toFixed(2)},${penultimate.y.toFixed(2)} ${last.x.toFixed(2)},${last.y.toFixed(2)}`;
  return path;
}

function focusLiveRenderSamples(samples, maxPoints = 140) {
  if (samples.length <= maxPoints) return samples;
  const result = [];
  const step = (samples.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints - 1; i++) result.push(samples[Math.round(i * step)]);
  result.push(samples.at(-1));
  return result;
}

function liveChartsPriceText(price) {
  if (!(price > 0)) return '—';
  const digits = price < 10 ? 4 : price < 100 ? 3 : 2;
  return money(price, digits);
}

function liveChartsLowerBound(samples, time) {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].t < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

function liveChartsDirection(samples, renderNow, config, latestPrice) {
  if (!samples.length || !(latestPrice > 0)) return 0;
  const targetTime = renderNow - config.momentumMs;
  let index = liveChartsLowerBound(samples, targetTime);
  if (index >= samples.length) index = samples.length - 1;
  if (index > 0 && Math.abs(samples[index - 1].t - targetTime) < Math.abs(samples[index].t - targetTime)) index--;
  const anchor = samples[Math.max(0, index)];
  if (!anchor || !(anchor.price > 0)) return 0;
  const delta = latestPrice - anchor.price;
  const recentSteps = [];
  for (let i = Math.max(1, samples.length - 60); i < samples.length; i++) {
    recentSteps.push(Math.abs(samples[i].price - samples[i - 1].price));
  }
  const typical = focusLiveMedian(recentSteps) || latestPrice * 0.000004;
  const deadzone = Math.max(latestPrice * 0.000015, typical * 1.4);
  return Math.abs(delta) >= deadzone ? Math.sign(delta) : 0;
}

function ensureLiveChartsRuntime() {
  const chart = state.liveCharts;
  chart.scales ||= {};
  chart.renderCache ||= {};
  for (const key of Object.keys(LIVE_CHART_RANGES)) {
    chart.scales[key] ||= { min: 0, max: 0 };
    if (!(key in chart.renderCache)) chart.renderCache[key] = null;
  }
  return chart;
}

function buildLiveChartsPath(samples, visualPrice, rangeKey, renderNow, frameGap) {
  const config = LIVE_CHART_RANGES[rangeKey];
  if (!config || !(visualPrice > 0)) return null;
  const windowEnd = renderNow;
  const windowStart = windowEnd - config.windowMs;
  let firstIndex = liveChartsLowerBound(samples, windowStart);
  const seedIndex = Math.max(0, firstIndex - 1);
  const seedPrice = samples[seedIndex]?.price > 0 ? samples[seedIndex].price : visualPrice;

  let rawMin = Math.min(seedPrice, visualPrice);
  let rawMax = Math.max(seedPrice, visualPrice);
  let lastIndex = samples.length - 1;
  while (lastIndex >= 0 && samples[lastIndex].t > windowEnd) lastIndex--;
  if (firstIndex > lastIndex + 1) firstIndex = lastIndex + 1;

  for (let i = firstIndex; i <= lastIndex; i++) {
    const price = samples[i]?.price;
    if (!(price > 0)) continue;
    if (price < rawMin) rawMin = price;
    if (price > rawMax) rawMax = price;
  }

  const minimumSpan = Math.max(visualPrice * config.minimumSpanRatio, visualPrice < 10 ? 0.00008 : 0.0008);
  let rawSpan = rawMax - rawMin;
  if (rawSpan < minimumSpan) {
    const center = (rawMax + rawMin) / 2;
    rawMin = center - minimumSpan / 2;
    rawMax = center + minimumSpan / 2;
    rawSpan = minimumSpan;
  }
  const targetMin = rawMin - rawSpan * 0.16;
  const targetMax = rawMax + rawSpan * 0.16;
  const scale = ensureLiveChartsRuntime().scales[rangeKey];
  if (!(scale.min > 0) || !(scale.max > 0)) {
    scale.min = targetMin;
    scale.max = targetMax;
  } else {
    const minTau = targetMin < scale.min ? 95 : 1350;
    const maxTau = targetMax > scale.max ? 95 : 1350;
    const minAlpha = 1 - Math.exp(-Math.max(8, frameGap) / minTau);
    const maxAlpha = 1 - Math.exp(-Math.max(8, frameGap) / maxTau);
    scale.min += (targetMin - scale.min) * minAlpha;
    scale.max += (targetMax - scale.max) * maxAlpha;
  }

  let min = scale.min;
  let max = scale.max;
  const liveGuard = Math.max((max - min) * .10, minimumSpan * .12);
  if (visualPrice < min + liveGuard) min = visualPrice - liveGuard;
  if (visualPrice > max - liveGuard) max = visualPrice + liveGuard;
  scale.min = min;
  scale.max = max;
  const span = Math.max(max - min, minimumSpan);

  const maxPoints = MOBILE_EFFICIENCY ? 78 : 110;
  const available = Math.max(0, lastIndex - firstIndex + 1);
  const step = available > maxPoints - 2 ? available / (maxPoints - 2) : 1;
  const coords = [];
  const addCoord = (time, price, isLast = false) => {
    const ratio = Math.max(0, Math.min(1, (time - windowStart) / config.windowMs));
    const x = isLast ? LIVE_CHART_PLOT_RIGHT_X : LIVE_CHART_PLOT_LEFT_X + ratio * (LIVE_CHART_PLOT_RIGHT_X - LIVE_CHART_PLOT_LEFT_X);
    const normalized = Math.max(0, Math.min(1, (price - min) / span));
    const y = LIVE_CHART_BOTTOM_Y - normalized * (LIVE_CHART_BOTTOM_Y - LIVE_CHART_TOP_Y);
    const previous = coords.at(-1);
    if (previous && Math.abs(previous.x - x) < .08 && !isLast) return;
    coords.push({ x, y });
  };

  addCoord(windowStart, seedPrice, false);
  if (available > 0) {
    if (step <= 1) {
      for (let i = firstIndex; i <= lastIndex; i++) addCoord(samples[i].t, samples[i].price, false);
    } else {
      for (let cursor = 0; cursor < available; cursor += step) {
        const i = Math.min(lastIndex, firstIndex + Math.floor(cursor));
        addCoord(samples[i].t, samples[i].price, false);
      }
      if (lastIndex >= firstIndex) addCoord(samples[lastIndex].t, samples[lastIndex].price, false);
    }
  }
  addCoord(windowEnd, visualPrice, true);

  const line = focusLiveSmoothPath(coords);
  const first = coords[0];
  const last = coords.at(-1);
  const area = `${line} L${last.x.toFixed(2)},${LIVE_CHART_VIEWBOX_HEIGHT} L${first.x.toFixed(2)},${LIVE_CHART_VIEWBOX_HEIGHT} Z`;
  const direction = liveChartsDirection(samples, renderNow, config, visualPrice);
  return { line, area, last, min, max, mid: (min + max) / 2, latest: visualPrice, direction };
}

function setLiveChartsText(id, value) {
  const node = $(id);
  if (!node || node.textContent === value) return;
  node.textContent = value;
}

function liveChartYForPrice(price, min, max) {
  const span = Math.max(max - min, 1e-9);
  const normalized = Math.max(0, Math.min(1, (price - min) / span));
  return LIVE_CHART_BOTTOM_Y - normalized * (LIVE_CHART_BOTTOM_Y - LIVE_CHART_TOP_Y);
}

function renderLiveCharts(force = false, timestamp = performance.now(), fullPaths = true) {
  if (!force && !isLiveChartsActive()) return false;
  const chart = ensureLiveChartsRuntime();
  const target = chart.targetPrice > 0 ? chart.targetPrice : (state.price > 0 ? state.price : chart.samples.at(-1)?.price);
  if (!(target > 0)) return false;

  if (!(chart.visualPrice > 0)) chart.visualPrice = target;
  const frameGap = Math.max(8, Math.min(80, timestamp - (chart.visualFrameAt || timestamp - 16)));
  const delta = target - chart.visualPrice;
  const epsilon = Math.max(target * 0.00000025, 0.0000005);
  if (Math.abs(delta) <= epsilon) chart.visualPrice = target;
  else {
    const alpha = 1 - Math.exp(-frameGap / (MOBILE_EFFICIENCY ? 82 : 62));
    chart.visualPrice += delta * alpha;
  }
  chart.visualFrameAt = timestamp;

  const renderNow = Date.now();
  setLiveChartsText('liveChartsHeaderPrice', liveChartsPriceText(chart.visualPrice));

  for (const [rangeKey, config] of Object.entries(LIVE_CHART_RANGES)) {
    let path = chart.renderCache[rangeKey];

    // Expensive work (window scan + path rebuild) runs at a restrained cadence.
    // The dot and live scale marker still glide independently between rebuilds.
    if (fullPaths || !path) {
      path = buildLiveChartsPath(chart.samples, chart.visualPrice, rangeKey, renderNow, frameGap);
      if (!path) continue;
      chart.renderCache[rangeKey] = path;

      const line = $(`${config.prefix}Line`);
      const area = $(`${config.prefix}Area`);
      if (line) line.setAttribute('d', path.line);
      if (area) area.setAttribute('d', path.area);

      const card = $(config.prefix);
      if (card) {
        const directionClass = path.direction > 0 ? 'up' : path.direction < 0 ? 'down' : 'neutral';
        card.classList.remove('up', 'down', 'neutral');
        card.classList.add(directionClass);
      }

      setLiveChartsText(`${config.prefix}Top`, liveChartsPriceText(path.max));
      setLiveChartsText(`${config.prefix}Mid`, liveChartsPriceText(path.mid));
      setLiveChartsText(`${config.prefix}Bottom`, liveChartsPriceText(path.min));
    }

    if (!path) continue;
    const dot = $(`${config.prefix}Dot`);
    const marker = $(`${config.prefix}Marker`);
    const liveY = liveChartYForPrice(chart.visualPrice, path.min, path.max);
    if (dot) {
      dot.setAttribute('cx', String(LIVE_CHART_PLOT_RIGHT_X));
      dot.setAttribute('cy', liveY.toFixed(2));
    }
    setLiveChartsText(`${config.prefix}Live`, liveChartsPriceText(chart.visualPrice));
    if (marker) marker.style.top = `${Math.max(8, Math.min(92, (liveY / LIVE_CHART_VIEWBOX_HEIGHT) * 100))}%`;
  }
  return true;
}

function scheduleLiveChartsRender(force = false) {
  const chart = ensureLiveChartsRuntime();
  if (!isLiveChartsActive() && !force) return;
  if (chart.renderFrame) {
    if (force) chart._forceNext = true;
    return;
  }

  chart.renderFrame = requestAnimationFrame((timestamp) => {
    chart.renderFrame = 0;
    if (!isLiveChartsActive()) return;
    const forceThisFrame = Boolean(force || chart._forceNext);
    chart._forceNext = false;
    chart.lastRenderAt = timestamp;
    chart.lastPathRenderAt = timestamp;
    try { renderLiveCharts(forceThisFrame, timestamp, true); } catch (_) {}
  });
}

function openLiveChartsView() {
  const overlay = $('liveChartsDialog');
  if (!overlay || state.currentView !== 'home') return;
  const chart = ensureLiveChartsRuntime();

  state.currentView = 'charts';
  setHeaderMenuOpen(false);
  setSearchOpen(false);

  // Show the destination synchronously before any chart/history work.
  overlay.hidden = false;
  overlay.classList.remove('is-closing', 'mode-parked');
  overlay.classList.add('mode-active');
  document.body.classList.add('live-charts-open');

  const token = ++chart.openToken;
  if (state.price > 0) {
    chart.targetPrice = state.price;
    if (!(chart.visualPrice > 0)) chart.visualPrice = state.price;
    setLiveChartsText('liveChartsHeaderPrice', liveChartsPriceText(state.price));
  }

  requestAnimationFrame(() => {
    if (token !== chart.openToken || !isLiveChartsActive()) return;
    try {
      if (state.price > 0 && !chart.samples.length) {
        chart.samples.push({ t: Date.now(), price: state.price });
        chart.lastSampleAt = Date.now();
      }
      scheduleLiveChartsRender(true);
    } catch (_) {}

    // Fetch only after the fullscreen surface has painted. This is intentionally
    // delayed enough for WebKit to complete the navigation frame first.
    window.setTimeout(() => {
      if (token !== chart.openToken || !isLiveChartsActive()) return;
      void loadLiveChartsHistory(false);
    }, 420);
  });
}

function closeLiveChartsView({ revealDashboard = true, animate = false } = {}) {
  const overlay = $('liveChartsDialog');
  if (!overlay || overlay.hidden || overlay.classList.contains('is-closing') || overlay.classList.contains('mode-parked')) return;
  state.liveCharts.openToken = number(state.liveCharts.openToken) + 1;
  if (state.liveCharts.renderFrame) {
    cancelAnimationFrame(state.liveCharts.renderFrame);
    state.liveCharts.renderFrame = 0;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!revealDashboard) {
    if (!animate || reduced) {
      restoreEntryGateFromImmersive();
      overlay.classList.remove('is-closing', 'mode-active');
      overlay.classList.add('mode-parked');
      document.body.classList.remove('live-charts-open', 'mode-returning');
      return;
    }
    prepareImmersiveHomeCrossfade();
    overlay.classList.add('is-closing');
    window.setTimeout(() => finishImmersiveHomeCrossfade(overlay, 'live-charts-open'), 460);
    return;
  }

  const finish = () => {
    overlay.classList.remove('is-closing', 'mode-active');
    overlay.classList.add('mode-parked');
    document.body.classList.remove('live-charts-open', 'mode-returning');
    pulseDashboardReveal();
  };
  if (!animate || reduced) { finish(); return; }
  overlay.classList.add('is-closing');
  window.setTimeout(finish, 420);
}

function renderFocusDisplay() {
  const price = $('focusDisplayPrice');
  const worth = $('focusDisplayWorth');
  const priceValue = state.price > 0 ? state.price : NaN;
  setFocusDisplayValue(price, state.price > 0 ? money(state.price, state.price < 10 ? 4 : 3) : '—', priceValue, { roll: true });

  const change = $('focusDisplayChange24h');
  if (change) {
    const next = Number(state.change);
    change.className = `focus-display-change ${next > 0 ? 'positive' : next < 0 ? 'negative' : 'neutral'}`;
    setFocusDisplayValue(change, state.price > 0 ? `${next > 0 ? '+' : ''}${next.toFixed(2)}% · 24H` : '— · 24H', state.price > 0 ? next : NaN);
  }

  const activeWallet = state.wallets.find((wallet) => wallet.address === state.address);
  if ($('focusDisplayWallet')) $('focusDisplayWallet').textContent = activeWallet?.label || (state.address ? shortAddress(state.address) : 'Wallet non caricato');

  const total = currentTotalInj();
  const value = total * state.price;
  if (worth) {
    setFocusDisplayValue(
      worth,
      state.address && state.price > 0 ? money(value, 2) : '—',
      state.address && state.price > 0 ? value : NaN,
      { roll: true }
    );
  }

  if ($('focusDisplayTotalInj')) {
    setFocusDisplayValue($('focusDisplayTotalInj'), state.address ? formatInj(total, 4) : '—', state.address ? total : NaN);
  }

  const dailyReward = state.staked > 0 && state.personalApr > 0
    ? state.staked * (state.personalApr / 100) / 365
    : 0;
  if ($('focusDisplayDailyReward')) {
    setFocusDisplayValue(
      $('focusDisplayDailyReward'),
      dailyReward > 0 ? `+${dailyReward.toLocaleString('it-IT', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} INJ / giorno` : 'Reward / giorno —',
      dailyReward > 0 ? dailyReward : NaN
    );
  }

  if ($('focusDisplayRangeMin')) setFocusDisplayValue($('focusDisplayRangeMin'), state.low > 0 ? money(state.low, state.low < 10 ? 3 : 2) : '—', state.low > 0 ? state.low : NaN);
  if ($('focusDisplayRangeMax')) setFocusDisplayValue($('focusDisplayRangeMax'), state.high > 0 ? money(state.high, state.high < 10 ? 3 : 2) : '—', state.high > 0 ? state.high : NaN);
  const span = state.high - state.low;
  const rangePosition = span > 0 && state.price > 0
    ? Math.max(0, Math.min(100, ((state.price - state.low) / span) * 100))
    : 50;
  if ($('focusDisplayRangeMarker')) $('focusDisplayRangeMarker').style.left = `${rangePosition}%`;
  if ($('focusDisplayRangeFill')) $('focusDisplayRangeFill').style.width = `${rangePosition}%`;
  if ($('focusDisplayApr')) setFocusDisplayValue($('focusDisplayApr'), state.personalApr > 0 ? `${state.personalApr.toFixed(3)}%` : '—', state.personalApr > 0 ? state.personalApr : NaN);
  if ($('focusDisplayStaked')) setFocusDisplayValue($('focusDisplayStaked'), state.address ? formatInj(state.staked, 4) : '—', state.address ? state.staked : NaN);
  if ($('focusDisplayRewards')) setFocusDisplayValue($('focusDisplayRewards'), state.address ? formatInj(state.rewards, 4) : '—', state.address ? state.rewards : NaN);
  renderFocusAmbient();
}

function scheduleFocusControlsHide() {
  window.clearTimeout(state.focusControlsTimer);
  const dialog = $('focusDisplayDialog');
  if (!isFocusDisplayActive()) return;
  state.focusControlsTimer = window.setTimeout(() => {
    dialog.classList.add('controls-hidden');
  }, 3500);
}

function showFocusControls() {
  const dialog = $('focusDisplayDialog');
  if (!isFocusDisplayActive()) return;
  dialog.classList.remove('controls-hidden');
  scheduleFocusControlsHide();
}

function isFocusDisplayActive() {
  const dialog = $('focusDisplayDialog');
  return Boolean(dialog && !dialog.hidden && !dialog.classList.contains('mode-parked') && !dialog.classList.contains('is-closing'));
}

function isPulseViewActive() {
  const overlay = $('pulseViewDialog');
  return Boolean(overlay && !overlay.hidden && !overlay.classList.contains('mode-parked') && !overlay.classList.contains('is-closing'));
}

function openFocusDisplay() {
  const dialog = $('focusDisplayDialog');
  if (!dialog || state.currentView !== 'home') return;
  state.currentView = 'live';
  setHeaderMenuOpen(false);
  setSearchOpen(false);

  // Remove any directional class left from the previous session before the
  // fullscreen layer is exposed. Price and worth are then primed directly in
  // their final fixed per-digit geometry.
  [$('focusDisplayPrice'), $('focusDisplayWorth')].forEach((element) => {
    if (!element) return;
    clearTimeout(element._focusValueTimer);
    element.classList.remove('focus-value-up', 'focus-value-down');
  });
  renderFocusDisplay();
  renderFocusAmbient();
  dialog.hidden = false;
  dialog.classList.remove('controls-hidden', 'is-closing', 'mode-parked');
  dialog.classList.add('mode-active');
  document.body.classList.add('focus-display-open');
  requestAnimationFrame(syncFocusDisplayViewport);
  scheduleFocusControlsHide();
}

function prepareImmersiveHomeCrossfade() {
  const gate = $('entryGate');
  if (!gate) return null;
  state.currentView = 'home';

  // v15.98.21 — Zero-reflow immersive return.
  // Home is already fully painted and kept live underneath Live/Pulse for the
  // whole session. Do not refresh, re-layer, fade, scale or force-layout it at
  // the handoff frame. The outgoing immersive surface is now the ONLY layer
  // that animates, revealing the exact same Home compositor surface below.
  gate.classList.remove('leaving', 'mode-return', 'return-front', 'return-crossfade', 'return-crossfade-visible');
  gate.classList.add('visible', 'immersive-underlay', 'home-return-stable');
  gate.setAttribute('aria-hidden', 'false');
  document.body.classList.add('entry-gate-open', 'mode-returning');
  document.body.classList.remove('entry-live-launch');
  return gate;
}

function finishImmersiveHomeCrossfade(overlay, bodyOpenClass) {
  const gate = $('entryGate');
  overlay?.classList.remove('is-closing', 'mode-active');
  overlay?.classList.add('mode-parked');
  document.body.classList.remove(bodyOpenClass, 'mode-returning', 'entry-live-launch');
  gate?.classList.remove('return-crossfade', 'return-crossfade-visible', 'immersive-underlay', 'mode-return', 'return-front');
  gate?.classList.add('visible');
  gate?.setAttribute('aria-hidden', 'false');
}

function closeFocusDisplay({ revealDashboard = true, animate = false } = {}) {
  const dialog = $('focusDisplayDialog');
  if (!dialog || dialog.hidden || dialog.classList.contains('is-closing') || dialog.classList.contains('mode-parked')) return;
  window.clearTimeout(state.focusControlsTimer);
  dialog.classList.remove('controls-hidden');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!revealDashboard) {
    if (!animate || reduced) {
      restoreEntryGateFromImmersive();
      dialog.classList.remove('is-closing', 'mode-active');
      dialog.classList.add('mode-parked');
      document.body.classList.remove('focus-display-open', 'mode-returning');
      return;
    }
    prepareImmersiveHomeCrossfade();
    dialog.classList.add('is-closing');
    window.setTimeout(() => finishImmersiveHomeCrossfade(dialog, 'focus-display-open'), 620);
    return;
  }

  const finish = () => {
    const gate = $('entryGate');
    dialog.classList.remove('is-closing', 'mode-active');
    dialog.classList.add('mode-parked');
    document.body.classList.remove('focus-display-open', 'mode-returning');
    gate?.classList.remove('mode-return');
    pulseDashboardReveal();
  };

  if (!animate || reduced) { finish(); return; }
  dialog.classList.add('is-closing');
  window.setTimeout(finish, 460);
}

function returnDashboardToEntryGate() {
  const gate = $('entryGate');
  if (!gate) return;

  // v15.99.2 — Instant Dashboard -> Home handoff.
  // The Home DOM is already alive behind Dashboard: reveal that painted surface
  // first, then refresh its data after the navigation frame. This removes the
  // visible freeze caused by renderEntryGate()/sparkline work before reveal.
  state.currentView = 'home';
  document.body.classList.add('dashboard-home-instant-return', 'entry-gate-open');
  document.body.classList.remove('dashboard-home-return', 'dashboard-home-fade', 'mode-returning', 'entry-live-launch');

  gate.classList.remove('leaving', 'immersive-underlay', 'mode-return', 'return-front', 'dashboard-underlay');
  gate.classList.add('visible', 'home-return-stable');
  gate.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    document.body.classList.remove('dashboard-home-instant-return');
    const refreshHome = () => {
      if (state.currentView !== 'home') return;
      renderEntryGate();
      requestAnimationFrame(() => loadEntrySparkline(false));
    };
    if ('requestIdleCallback' in window) requestIdleCallback(refreshHome, { timeout: 180 });
    else setTimeout(refreshHome, 24);
  });
}

function goHome(source = 'internal') {
  // Dashboard may return Home only through the explicit Home tile. Search,
  // chart and every other header control are never valid Home navigation sources.
  if (state.currentView === 'dashboard' && source !== 'dashboard-home-button') return;
  if (state.currentView === 'live' && !['immersive-close', 'immersive-keyboard'].includes(source)) return;
  if (state.currentView === 'pulse' && !['immersive-close', 'immersive-keyboard'].includes(source)) return;
  if (state.currentView === 'charts' && !['immersive-close', 'immersive-keyboard'].includes(source)) return;

  setHeaderMenuOpen(false);
  setSearchOpen(false);

  // iOS can emit a delayed synthetic click after the close control is tapped.
  // Never let that second event start another navigation while the immersive
  // page is already fading away.
  if (immersiveModeTransitioning()) return;

  if (isFocusDisplayActive()) {
    state.currentView = 'home';
    armModeExitLock(1600);
    const gate = $('entryGate');
    gate?.classList.add('mode-return');
    document.body.classList.add('mode-returning');
    requestAnimationFrame(() => closeFocusDisplay({ revealDashboard: false, animate: true }));
    return;
  }

  if (isPulseViewActive()) {
    state.currentView = 'home';
    armModeExitLock(1600);
    const gate = $('entryGate');
    gate?.classList.add('mode-return');
    document.body.classList.add('mode-returning');
    requestAnimationFrame(() => closePulseView({ revealDashboard: false, animate: true }));
    return;
  }

  if (isLiveChartsActive()) {
    state.currentView = 'home';
    armModeExitLock(1600);
    const gate = $('entryGate');
    gate?.classList.add('mode-return');
    document.body.classList.add('mode-returning');
    requestAnimationFrame(() => closeLiveChartsView({ revealDashboard: false, animate: true }));
    return;
  }

  // If Home is already visible, a duplicate/synthetic close event is ignored.
  if ($('entryGate')?.classList.contains('visible') && document.body.classList.contains('entry-gate-open')) return;

  returnDashboardToEntryGate();
}

function pulseDayStorageKey() {
  return 'inj_monitor_pulse_day_v1';
}

function pulseDayId(address = state.address, start = nativeChartPeriodBounds('d1').start) {
  return `${address || ''}:${start}`;
}

function readPulseDaySnapshot(address, start) {
  if (!address || !(start > 0)) return null;
  try {
    const all = JSON.parse(localStorage.getItem(pulseDayStorageKey()) || '{}');
    const row = all?.[address];
    if (!row || number(row.start) !== number(start)) return null;
    if (!(number(row.openPrice) > 0) || !(number(row.baseTotal) > 0)) return null;
    return {
      key: pulseDayId(address, start),
      address,
      start: number(start),
      openPrice: number(row.openPrice),
      baseTotal: number(row.baseTotal),
      baseWorth: number(row.baseWorth) > 0 ? number(row.baseWorth) : number(row.baseTotal) * number(row.openPrice),
      loading: false,
      loadedAt: number(row.loadedAt),
      fallback: Boolean(row.fallback)
    };
  } catch (_) {
    return null;
  }
}

function savePulseDaySnapshot() {
  const row = state.pulseDay;
  if (!row?.address || !(row.start > 0) || !(row.openPrice > 0) || !(row.baseTotal > 0)) return;
  try {
    const all = JSON.parse(localStorage.getItem(pulseDayStorageKey()) || '{}');
    all[row.address] = {
      start: row.start,
      openPrice: row.openPrice,
      baseTotal: row.baseTotal,
      baseWorth: row.baseWorth,
      loadedAt: row.loadedAt || Date.now(),
      fallback: Boolean(row.fallback)
    };
    localStorage.setItem(pulseDayStorageKey(), JSON.stringify(all));
  } catch (_) {}
}

async function loadPulseDayBaseline(force = false) {
  if (!state.address || !(state.price > 0) || !state.lastWalletUpdate) return false;
  const bounds = nativeChartPeriodBounds('d1');
  const key = pulseDayId(state.address, bounds.start);
  const currentTotal = currentTotalInj();
  if (!(currentTotal > 0)) return false;

  if (!force && state.pulseDay.key === key && state.pulseDay.openPrice > 0 && !state.pulseDay.fallback) return true;
  if (state.pulseDay.loading && state.pulseDay.key === key) return state.pulseDay.openPrice > 0;

  const saved = readPulseDaySnapshot(state.address, bounds.start);
  const baseTotal = saved?.baseTotal > 0 ? saved.baseTotal : currentTotal;
  const provisionalOpen = saved?.openPrice > 0
    ? saved.openPrice
    : number(state.nativeChartCache[nativeChartCacheKey('d1', bounds)]?.open) || number(state.marketFrames.d1.open);

  state.pulseDay = {
    key,
    address: state.address,
    start: bounds.start,
    openPrice: provisionalOpen,
    baseTotal,
    baseWorth: provisionalOpen > 0 ? baseTotal * provisionalOpen : 0,
    loading: true,
    loadedAt: saved?.loadedAt || 0,
    fallback: saved?.fallback ?? true
  };

  const requestAddress = state.address;
  try {
    const cacheKey = nativeChartCacheKey('d1', bounds);
    let result = state.nativeChartCache[cacheKey];
    if (!result?.open || force || Date.now() - number(result.loadedAt) > 60_000) {
      result = await fetchNativeChartSeries('d1', bounds);
      state.nativeChartCache[cacheKey] = result;
    }
    if (state.address !== requestAddress || pulseDayId(state.address, bounds.start) !== key) return false;
    const openPrice = number(result?.open);
    if (!(openPrice > 0)) throw new Error('Apertura giornata non disponibile');
    state.pulseDay = {
      key,
      address: requestAddress,
      start: bounds.start,
      openPrice,
      baseTotal,
      baseWorth: baseTotal * openPrice,
      loading: false,
      loadedAt: Date.now(),
      fallback: false
    };
    savePulseDaySnapshot();
    renderPulseView();
    return true;
  } catch (_) {
    const fallbackOpen = provisionalOpen > 0 ? provisionalOpen : number(state.marketFrames.d1.open);
    state.pulseDay = {
      key,
      address: requestAddress,
      start: bounds.start,
      openPrice: fallbackOpen,
      baseTotal,
      baseWorth: fallbackOpen > 0 ? baseTotal * fallbackOpen : 0,
      loading: false,
      loadedAt: Date.now(),
      fallback: true
    };
    if (fallbackOpen > 0) savePulseDaySnapshot();
    renderPulseView();
    return fallbackOpen > 0;
  }
}

function ensurePulseDayBaseline() {
  if (!state.address || !(state.price > 0) || !state.lastWalletUpdate) return false;
  const bounds = nativeChartPeriodBounds('d1');
  const key = pulseDayId(state.address, bounds.start);
  if (state.pulseDay.key === key && state.pulseDay.openPrice > 0) {
    if (state.pulseDay.fallback && !state.pulseDay.loading && Date.now() - number(state.pulseDay.loadedAt) > 60_000) loadPulseDayBaseline(true);
    return true;
  }

  const saved = readPulseDaySnapshot(state.address, bounds.start);
  if (saved) {
    state.pulseDay = saved;
    if (saved.fallback && Date.now() - number(saved.loadedAt) > 60_000) loadPulseDayBaseline(true);
    return true;
  }

  const total = currentTotalInj();
  const provisionalOpen = number(state.nativeChartCache[nativeChartCacheKey('d1', bounds)]?.open) || number(state.marketFrames.d1.open);
  state.pulseDay = {
    key,
    address: state.address,
    start: bounds.start,
    openPrice: provisionalOpen,
    baseTotal: total,
    baseWorth: provisionalOpen > 0 ? total * provisionalOpen : 0,
    loading: false,
    loadedAt: 0,
    fallback: true
  };
  loadPulseDayBaseline(false);
  return provisionalOpen > 0;
}

function schedulePulseControlsHide() {
  window.clearTimeout(state.pulseControlsTimer);
  const overlay = $('pulseViewDialog');
  if (!isPulseViewActive()) return;
  state.pulseControlsTimer = window.setTimeout(() => {
    overlay.classList.add('controls-hidden');
  }, 3500);
}

function showPulseControls() {
  const overlay = $('pulseViewDialog');
  if (!isPulseViewActive()) return;
  overlay.classList.remove('controls-hidden');
  schedulePulseControlsHide();
}

function pulseSignedPercent(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;
}

function pulseSignedInj(value, digits = 4) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} INJ`;
}

function pulseNiceMultiplier(value) {
  const n = Math.max(1, Number(value) || 1);
  if (n <= 1) return 1;
  const exponent = Math.floor(Math.log10(n));
  const power = 10 ** exponent;
  const normalized = n / power;
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((item) => item >= normalized) || 10;
  return step * power;
}

function ensurePulseAutoScaleKey() {
  const dayKey = state.pulseDay?.key || pulseDayId();
  const current = state.pulseAutoScale || {};
  if (current.key === dayKey && current.address === state.address) return;
  state.pulseAutoScale = {
    key: dayKey,
    address: state.address,
    price: 1,
    pnl: 1,
    reward: 1,
    lastRewards: Math.max(0, number(state.rewards))
  };
}

function pulseAdaptiveVisual(value, fullScale = 2, metricKey = 'price') {
  ensurePulseAutoScaleKey();
  const amount = Math.abs(Number(value) || 0);
  const base = Math.max(1e-9, Number(fullScale) || 1);
  if (amount < 1e-10) {
    return { level: 0, multiplier: Math.max(1, number(state.pulseAutoScale?.[metricKey]) || 1) };
  }

  const ratio = amount / base;
  // Auto-zoom: as a candle approaches the safe visual ceiling, widen its scale
  // instead of clipping it. Each metric keeps its own scale because the units differ.
  const required = pulseNiceMultiplier(ratio / 0.92);
  const previous = Math.max(1, number(state.pulseAutoScale?.[metricKey]) || 1);
  const multiplier = Math.max(previous, required);
  state.pulseAutoScale[metricKey] = multiplier;

  const normalized = Math.min(0.96, ratio / multiplier);
  return {
    level: Math.min(32, 5 + normalized * 28),
    multiplier
  };
}

function pulseScaleSuffix(multiplier) {
  const n = Number(multiplier) || 1;
  if (n <= 1.001) return '';
  const text = n.toLocaleString('it-IT', { maximumFractionDigits: n < 10 ? 2 : 0 });
  return ` · AUTO ×${text}`;
}

function pulseExtremesStorageKey() {
  return 'inj_monitor_pulse_extremes_v2';
}

function blankPulseExtremeMetric() {
  return {
    initialized: false,
    // ATH exists only on the positive side of the centre line; ATL only on the negative side.
    positiveHigh: null,
    negativeLow: null,
    high: 0,
    low: 0,
    ghostHigh: null,
    ghostLow: null,
    last: 0,
    regime: 0,
    direction: 0,
    lastFlashAt: 0,
    updatedAt: 0
  };
}

function readPulseExtremes(key) {
  try {
    const all = JSON.parse(localStorage.getItem(pulseExtremesStorageKey()) || '{}');
    const row = all?.[key];
    if (!row || row.address !== state.address) return null;
    return row;
  } catch (_) {
    return null;
  }
}

function savePulseExtremes() {
  const row = state.pulseExtremes;
  if (!row?.key || !row.address) return;
  try {
    const all = JSON.parse(localStorage.getItem(pulseExtremesStorageKey()) || '{}');
    all[row.key] = {
      key: row.key,
      address: row.address,
      price: row.price,
      pnl: row.pnl,
      reward: row.reward,
      updatedAt: Date.now()
    };
    const rows = Object.entries(all)
      .sort((a, b) => number(b?.[1]?.updatedAt) - number(a?.[1]?.updatedAt))
      .slice(0, 20);
    localStorage.setItem(pulseExtremesStorageKey(), JSON.stringify(Object.fromEntries(rows)));
  } catch (_) {}
}

function ensurePulseExtremesKey() {
  const key = state.pulseDay?.key || pulseDayId();
  const current = state.pulseExtremes || {};
  if (current.key === key && current.address === state.address) return;
  const saved = readPulseExtremes(key);
  state.pulseExtremes = saved || {
    key,
    address: state.address,
    price: blankPulseExtremeMetric(),
    pnl: blankPulseExtremeMetric(),
    reward: blankPulseExtremeMetric(),
    updatedAt: Date.now()
  };
  for (const metricKey of ['price', 'pnl', 'reward']) {
    if (!state.pulseExtremes[metricKey]) state.pulseExtremes[metricKey] = blankPulseExtremeMetric();
  }
}

function pulseExtremeEpsilon(metricKey, context = {}) {
  if (metricKey === 'price') return 0.005; // percentage points
  if (metricKey === 'pnl') return Math.max(0.20, Math.max(0, number(context.baseWorth)) * 0.00004);
  if (metricKey === 'reward') return Math.max(0.00001, Math.max(0, number(context.dailyReward)) * 0.001);
  return 1e-9;
}

function resetPulseExtreme(metricKey, value) {
  ensurePulseExtremesKey();
  const n = Number(value) || 0;
  const sign = n > 1e-12 ? 1 : n < -1e-12 ? -1 : 0;
  state.pulseExtremes[metricKey] = {
    ...blankPulseExtremeMetric(),
    initialized: true,
    positiveHigh: sign > 0 ? n : null,
    negativeLow: sign < 0 ? n : null,
    high: sign > 0 ? n : 0,
    low: sign < 0 ? n : 0,
    ghostHigh: sign > 0 ? n : null,
    ghostLow: sign < 0 ? n : null,
    last: n,
    regime: sign,
    updatedAt: Date.now()
  };
  savePulseExtremes();
  return state.pulseExtremes[metricKey];
}

function updatePulseExtreme(metricKey, value, { epsilon = 1e-9, reset = false } = {}) {
  ensurePulseExtremesKey();
  const n = Number(value) || 0;
  if (reset) {
    return { row: resetPulseExtreme(metricKey, n), flash: '' };
  }

  let row = state.pulseExtremes[metricKey] || blankPulseExtremeMetric();
  const signOf = (value) => value > epsilon ? 1 : value < -epsilon ? -1 : 0;
  const currentRegime = signOf(n);

  if (!row.initialized) {
    row = {
      ...blankPulseExtremeMetric(),
      initialized: true,
      positiveHigh: currentRegime > 0 ? n : null,
      negativeLow: currentRegime < 0 ? n : null,
      high: currentRegime > 0 ? n : 0,
      low: currentRegime < 0 ? n : 0,
      ghostHigh: currentRegime > 0 ? n : null,
      ghostLow: currentRegime < 0 ? n : null,
      last: n,
      regime: currentRegime,
      updatedAt: Date.now()
    };
    state.pulseExtremes[metricKey] = row;
    savePulseExtremes();
    return { row, flash: '' };
  }

  const previous = Number(row.last) || 0;
  const diff = n - previous;
  const direction = Math.abs(diff) > epsilon ? (diff > 0 ? 1 : -1) : 0;
  let flash = '';
  const now = Date.now();
  const cooldown = 2400;

  /*
   * Regime-aware extremes:
   * - above 0, only ATH is active/updated;
   * - below 0, only ATL is active/updated;
   * - when crossing zero, the opposite-side ghost is intentionally kept as history.
   * This prevents ATH + ATL from being attached to the same positive/negative excursion.
   */
  if (currentRegime > 0) {
    const previousAth = row.positiveHigh === null || row.positiveHigh === undefined
      ? null
      : Number(row.positiveHigh);
    if (previousAth === null || !Number.isFinite(previousAth) || n > previousAth + epsilon) {
      row.positiveHigh = n;
      row.high = n;
      // The ATH ghost is the highest point reached on the positive side. If live pulls back,
      // it remains behind as the translucent reference candle.
      row.ghostHigh = n;
      if (now - number(row.lastFlashAt) > cooldown) {
        flash = 'high';
        row.lastFlashAt = now;
      }
    }
    row.regime = 1;
  } else if (currentRegime < 0) {
    const previousAtl = row.negativeLow === null || row.negativeLow === undefined
      ? null
      : Number(row.negativeLow);
    if (previousAtl === null || !Number.isFinite(previousAtl) || n < previousAtl - epsilon) {
      row.negativeLow = n;
      row.low = n;
      // The ATL ghost is the lowest point reached on the negative side and stays visible
      // even after the live candle crosses back above zero.
      row.ghostLow = n;
      if (now - number(row.lastFlashAt) > cooldown) {
        flash = 'low';
        row.lastFlashAt = now;
      }
    }
    row.regime = -1;
  }

  if (direction) row.direction = direction;
  row.last = n;
  row.updatedAt = now;
  state.pulseExtremes[metricKey] = row;
  savePulseExtremes();
  return { row, flash };
}

function pulseLevelWithScale(value, fullScale = 2, metricKey = 'price') {
  ensurePulseAutoScaleKey();
  const amount = Math.abs(Number(value) || 0);
  if (amount < 1e-10) return 0;
  const base = Math.max(1e-9, Number(fullScale) || 1);
  const multiplier = Math.max(1, number(state.pulseAutoScale?.[metricKey]) || 1);
  const normalized = Math.min(0.96, (amount / base) / multiplier);
  return Math.min(32, 5 + normalized * 28);
}

function ensurePulseScaleForExtremes(metricKey, fullScale, currentValue, extremeRow) {
  const values = [currentValue, extremeRow?.ghostHigh, extremeRow?.ghostLow]
    .map((value) => Number(value))
    .filter(Number.isFinite);
  if (!values.length) return;
  const farthest = values.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, values[0]);
  pulseAdaptiveVisual(farthest, fullScale, metricKey);
}

function pulseExtremeText(metricKey, value) {
  const n = Number(value) || 0;
  if (metricKey === 'price') return pulseSignedPercent(n);
  if (metricKey === 'pnl') return signedMoney(n, 2);
  return `${Math.max(0, n).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} INJ`;
}

function flashPulseExtreme(id, type) {
  const metric = $(id);
  if (!metric || !type) return;
  const prefix = id.replace('pulseMetric', 'pulse');
  const event = $(`${prefix}Event`);
  const className = type === 'high' ? 'extreme-flash-high' : 'extreme-flash-low';
  const opposite = type === 'high' ? 'extreme-flash-low' : 'extreme-flash-high';
  metric.classList.remove(className, opposite);
  void metric.offsetWidth;
  metric.classList.add(className);
  if (event) {
    event.textContent = type === 'high' ? 'NEW ATH' : 'NEW ATL';
    event.className = `pulse-extreme-event show ${type}`;
  }
  clearTimeout(state.pulseExtremeFlashTimers[id]);
  state.pulseExtremeFlashTimers[id] = window.setTimeout(() => {
    metric.classList.remove(className, opposite);
    if (event) event.className = 'pulse-extreme-event';
  }, 1450);
}

function setPulseExtremeUI(id, metricKey, row, fullScale, flash = '') {
  const metric = $(id);
  if (!metric || !row) return;
  const prefix = id.replace('pulseMetric', 'pulse');
  const hasHigh = row.ghostHigh !== null && row.ghostHigh !== undefined && Number.isFinite(Number(row.ghostHigh));
  const hasLow = row.ghostLow !== null && row.ghostLow !== undefined && Number.isFinite(Number(row.ghostLow));
  metric.classList.toggle('has-ghost-high', hasHigh);
  metric.classList.toggle('has-ghost-low', hasLow);
  metric.classList.toggle('ghost-high-positive', hasHigh && Number(row.ghostHigh) >= 0);
  metric.classList.toggle('ghost-high-negative', hasHigh && Number(row.ghostHigh) < 0);
  metric.classList.toggle('ghost-low-positive', hasLow && Number(row.ghostLow) >= 0);
  metric.classList.toggle('ghost-low-negative', hasLow && Number(row.ghostLow) < 0);

  const highLevel = hasHigh ? pulseLevelWithScale(row.ghostHigh, fullScale, metricKey) : 0;
  const lowLevel = hasLow ? pulseLevelWithScale(row.ghostLow, fullScale, metricKey) : 0;
  metric.style.setProperty('--pulse-high-level', `${Math.max(0, Math.min(32, highLevel))}%`);
  metric.style.setProperty('--pulse-low-level', `${Math.max(0, Math.min(32, lowLevel))}%`);

  const high = $(`${prefix}High`);
  const low = $(`${prefix}Low`);
  if (high) {
    const text = hasHigh ? pulseExtremeText(metricKey, row.ghostHigh) : '—';
    const numeric = hasHigh ? Number(row.ghostHigh) : NaN;
    setPlainNumberValue(high, text, numeric);
  }
  if (low) {
    const text = hasLow ? pulseExtremeText(metricKey, row.ghostLow) : '—';
    const numeric = hasLow ? Number(row.ghostLow) : NaN;
    setPlainNumberValue(low, text, numeric);
  }
  if (flash) flashPulseExtreme(id, flash);
}

function updatePulseRewardScaleAfterClaim(currentRewards, dailyReward) {
  ensurePulseAutoScaleKey();
  const current = Math.max(0, number(currentRewards));
  const previous = Math.max(0, number(state.pulseAutoScale.lastRewards));
  const meaningfulDrop = previous - current > Math.max(0.00005, Math.max(0, number(dailyReward)) * 0.03);
  const looksLikeClaim = previous > 0.00005 && meaningfulDrop && current <= previous * 0.35;
  if (looksLikeClaim) state.pulseAutoScale.reward = 1;
  state.pulseAutoScale.lastRewards = current;
  return looksLikeClaim;
}

function setPulseMetric(id, value, level, deltaText, currentText, metaText) {
  const metric = $(id);
  if (!metric) return;
  const n = Number(value) || 0;
  metric.classList.remove('positive', 'negative', 'neutral');
  metric.classList.add(n > 1e-12 ? 'positive' : n < -1e-12 ? 'negative' : 'neutral');
  metric.style.setProperty('--pulse-level', `${Math.max(0, Math.min(38, Number(level) || 0))}%`);

  const previousLive = metric.dataset.pulseLiveValue === undefined ? NaN : Number(metric.dataset.pulseLiveValue);
  const tolerance = Math.max(1e-10, Math.abs(Number.isFinite(previousLive) ? previousLive : n) * 1e-7);
  metric.classList.remove('trend-up', 'trend-down', 'trend-flat');
  if (Number.isFinite(previousLive) && n > previousLive + tolerance) metric.classList.add('trend-up');
  else if (Number.isFinite(previousLive) && n < previousLive - tolerance) metric.classList.add('trend-down');
  else metric.classList.add('trend-flat');
  metric.dataset.pulseLiveValue = String(n);

  const prefix = id.replace('pulseMetric', 'pulse');
  const delta = $(`${prefix}Delta`);
  const current = $(`${prefix}Value`);
  const meta = $(`${prefix}Meta`);
  const rewardMetric = id === 'pulseMetricReward';
  if (delta) {
    setPlainNumberValue(delta, deltaText, n);
  }
  if (current) {
    const currentNumeric = id === 'pulseMetricPrice' ? state.price
      : id === 'pulseMetricPnl' ? currentTotalInj() * state.price
      : state.rewards;
    setPlainNumberValue(current, currentText, currentNumeric);
  }
  if (meta) meta.textContent = metaText;
}

function pulseMiniStorageKey() {
  return 'inj_monitor_pulse_mini_v1';
}

function ensurePulseMiniKey() {
  const key = state.pulseDay?.key || pulseDayId();
  if (state.pulseMini?.key === key && state.pulseMini.address === state.address) return;
  let saved = null;
  try {
    const all = JSON.parse(localStorage.getItem(pulseMiniStorageKey()) || '{}');
    const candidate = all?.[key];
    if (candidate?.address === state.address) saved = candidate;
  } catch (_) {}
  state.pulseMini = saved || { key, address: state.address, price: [], pnl: [], reward: [], lastSampleAt: 0, lastRewardSampleAt: 0, lastSavedAt: 0 };
  for (const metricKey of ['price', 'pnl', 'reward']) {
    if (!Array.isArray(state.pulseMini[metricKey])) state.pulseMini[metricKey] = [];
  }
  if (!(number(state.pulseMini.lastRewardSampleAt) > 0)) state.pulseMini.lastRewardSampleAt = number(state.pulseMini.reward.at(-1)?.t) || 0;
}

function savePulseMini(force = false) {
  const row = state.pulseMini;
  if (!row?.key || !row.address) return;
  const now = Date.now();
  if (!force && now - number(row.lastSavedAt) < 25_000) return;
  row.lastSavedAt = now;
  try {
    const all = JSON.parse(localStorage.getItem(pulseMiniStorageKey()) || '{}');
    all[row.key] = {
      key: row.key, address: row.address,
      price: row.price.slice(-220), pnl: row.pnl.slice(-220), reward: row.reward.slice(-320),
      lastSampleAt: row.lastSampleAt, lastRewardSampleAt: row.lastRewardSampleAt, lastSavedAt: now
    };
    const trimmed = Object.entries(all).sort((a,b) => number(b?.[1]?.lastSavedAt) - number(a?.[1]?.lastSavedAt)).slice(0, 12);
    localStorage.setItem(pulseMiniStorageKey(), JSON.stringify(Object.fromEntries(trimmed)));
  } catch (_) {}
}

function addPulseMiniSample(priceValue, pnlValue, rewardValue) {
  ensurePulseMiniKey();
  const now = Date.now();
  const row = state.pulseMini;
  const values = { price: Number(priceValue) || 0, pnl: Number(pnlValue) || 0, reward: Math.max(0, Number(rewardValue) || 0) };

  // PRICE and P/L keep their existing fluid cadence.
  const replaceLast = now - number(row.lastSampleAt) < 12_000;
  for (const metricKey of ['price', 'pnl']) {
    const arr = row[metricKey];
    const point = { t: now, v: values[metricKey] };
    if (replaceLast && arr.length) arr[arr.length - 1] = point;
    else arr.push(point);
    if (arr.length > 220) arr.splice(0, arr.length - 220);
  }
  row.lastSampleAt = now;

  // v15.99.59 — Reward history adds exactly one new point every 5 minutes.
  // Between slots the latest point is refreshed in-place, so the live value is
  // current without flooding the timeline with dozens of near-identical points.
  const rewardArr = row.reward;
  const rewardGap = 5 * 60_000;
  const lastRewardAt = number(row.lastRewardSampleAt) || number(rewardArr.at(-1)?.t);
  if (!rewardArr.length || !(lastRewardAt > 0)) {
    rewardArr.push({ t: now, v: values.reward });
    row.lastRewardSampleAt = now;
  } else if (now - lastRewardAt >= rewardGap) {
    rewardArr.push({ t: now, v: values.reward });
    row.lastRewardSampleAt = now;
  } else {
    rewardArr[rewardArr.length - 1] = { t: lastRewardAt, v: values.reward };
  }
  if (rewardArr.length > 320) rewardArr.splice(0, rewardArr.length - 320);
  savePulseMini(false);
}

function pulseMiniPath(points, width = 180, height = 48) {
  const clean = (points || []).map((p) => ({ t: Number(p?.t) || 0, v: Number(p?.v) })).filter((p) => Number.isFinite(p.v));
  if (!clean.length) return { path: '', x: width / 2, y: height / 2 };
  if (clean.length === 1) clean.unshift({ t: clean[0].t - 1, v: clean[0].v });
  const values = clean.map((p) => p.v);
  let min = Math.min(...values), max = Math.max(...values);
  if (Math.abs(max - min) < 1e-12) { min -= 1; max += 1; }
  const pad = 5;
  const xAt = (i) => pad + (i / Math.max(1, clean.length - 1)) * (width - pad * 2);
  const yAt = (v) => pad + (1 - ((v - min) / (max - min))) * (height - pad * 2);
  const pts = clean.map((p, i) => ({ x: xAt(i), y: yAt(p.v) }));
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const mx = (prev.x + cur.x) / 2;
    d += ` C ${mx.toFixed(2)} ${prev.y.toFixed(2)}, ${mx.toFixed(2)} ${cur.y.toFixed(2)}, ${cur.x.toFixed(2)} ${cur.y.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  return { path: d, x: last.x, y: last.y, samples: clean.map((p, i) => ({ t: p.t, v: p.v, x: pts[i].x, y: pts[i].y })), width, height };
}

function pulseMiniValueText(metricKey, value) {
  const numeric = Number(value) || 0;
  if (metricKey === 'price') return `${numeric > 0 ? '+' : numeric < 0 ? '−' : ''}${Math.abs(numeric).toFixed(2)}%`;
  if (metricKey === 'pnl') return `${numeric > 0 ? '+' : numeric < 0 ? '−' : ''}${money(Math.abs(numeric), 2)}`;
  return formatInj(Math.max(0, numeric), 4);
}
function pulseMiniTimeText(timestamp) {
  return new Date(number(timestamp)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function hidePulseMiniInspector(svg) {
  const card = svg?.closest?.('.pulse-mini-card');
  card?.classList.remove('inspecting', 'dragging');
  const cross = svg?.querySelector?.('.pulse-mini-inspect');
  if (cross) cross.setAttribute('visibility', 'hidden');
  const tip = card?.querySelector?.('.pulse-mini-inspector');
  if (tip) tip.hidden = true;
}
function showPulseMiniInspector(svg, metricKey, event) {
  const plot = svg?._pulseMiniPlot;
  if (!svg || !plot?.samples?.length) return;
  const rect = svg.getBoundingClientRect();
  if (!(rect.width > 0)) return;
  const clientX = Number(event?.clientX);
  if (!Number.isFinite(clientX)) return;
  const localX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const targetX = (localX / rect.width) * plot.width;
  let low = 0, high = plot.samples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (plot.samples[mid].x < targetX) low = mid + 1; else high = mid;
  }
  let index = low;
  if (index > 0 && Math.abs(plot.samples[index - 1].x - targetX) <= Math.abs(plot.samples[index].x - targetX)) index -= 1;
  const sample = plot.samples[index];
  const cross = svg.querySelector('.pulse-mini-inspect');
  const line = cross?.querySelector('line');
  const dot = cross?.querySelector('circle');
  if (line) { line.setAttribute('x1', sample.x); line.setAttribute('x2', sample.x); }
  if (dot) { dot.setAttribute('cx', sample.x); dot.setAttribute('cy', sample.y); }
  cross?.setAttribute('visibility', 'visible');
  const card = svg.closest('.pulse-mini-card');
  if (!card) return;
  let tip = card.querySelector('.pulse-mini-inspector');
  if (!tip) {
    tip = document.createElement('span');
    tip.className = 'pulse-mini-inspector';
    tip.innerHTML = '<strong>—</strong><small>—</small>';
    tip.hidden = true;
    card.appendChild(tip);
  }
  tip.querySelector('strong').textContent = pulseMiniValueText(metricKey, sample.v);
  tip.querySelector('small').textContent = pulseMiniTimeText(sample.t);
  tip.style.left = `${Math.max(8, Math.min(92, (sample.x / plot.width) * 100))}%`;
  tip.classList.toggle('flip', sample.x / plot.width > .66);
  tip.hidden = false;
  card.classList.add('inspecting');
}
function bindPulseMiniInteraction(svg, metricKey) {
  if (!svg || svg.dataset.pulseInspectBound === '1') return;
  svg.dataset.pulseInspectBound = '1';
  const touch = { pointerId: null, startX: 0, startY: 0, horizontal: false };
  const inside = (event) => { const r = svg.getBoundingClientRect(); return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom; };
  const release = (id) => { try { if (svg.hasPointerCapture?.(id)) svg.releasePointerCapture?.(id); } catch (_) {} };
  const reset = () => { touch.pointerId = null; touch.horizontal = false; svg.closest('.pulse-mini-card')?.classList.remove('dragging'); };
  svg.addEventListener('pointerdown', (event) => {
    if (!svg._pulseMiniPlot?.samples?.length) return;
    showPulseMiniInspector(svg, metricKey, event);
    if (event.pointerType === 'mouse') return;
    touch.pointerId = event.pointerId; touch.startX = event.clientX; touch.startY = event.clientY; touch.horizontal = false;
  }, { passive: true });
  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') { if (!inside(event)) return hidePulseMiniInspector(svg); showPulseMiniInspector(svg, metricKey, event); return; }
    if (event.pointerId !== touch.pointerId) return;
    if (!inside(event)) { release(event.pointerId); reset(); hidePulseMiniInspector(svg); return; }
    const dx = event.clientX - touch.startX, dy = event.clientY - touch.startY, ax = Math.abs(dx), ay = Math.abs(dy);
    if (!touch.horizontal) {
      if (Math.max(ax, ay) < 4) { showPulseMiniInspector(svg, metricKey, event); return; }
      if (ay > ax * 1.35) { hidePulseMiniInspector(svg); reset(); return; }
      if (ax < 4 || ax < ay * .72) return;
      touch.horizontal = true; svg.closest('.pulse-mini-card')?.classList.add('dragging'); try { svg.setPointerCapture?.(event.pointerId); } catch (_) {}
    }
    if (event.cancelable) event.preventDefault();
    showPulseMiniInspector(svg, metricKey, event);
  }, { passive: false });
  svg.addEventListener('pointerleave', () => hidePulseMiniInspector(svg));
  svg.addEventListener('pointerup', (event) => { release(event.pointerId); reset(); hidePulseMiniInspector(svg); });
  svg.addEventListener('pointercancel', (event) => { release(event.pointerId); reset(); hidePulseMiniInspector(svg); });
}

function renderPulseMiniChart(id, points) {
  const svg = $(id);
  if (!svg) return;
  const graph = pulseMiniPath(points);
  if (!graph.path) { svg.innerHTML = ''; svg._pulseMiniPlot = { samples: [], width: 180, height: 48 }; return; }
  // Keep the endpoint perfectly round in CSS pixels even though these mini SVGs
  // use preserveAspectRatio=none and stretch differently on every viewport.
  const rect = svg.getBoundingClientRect();
  const scaleX = rect.width > 0 ? rect.width / 180 : 1;
  const scaleY = rect.height > 0 ? rect.height / 48 : 1;
  const pxRadius = 3;
  const rx = Math.max(.45, pxRadius / Math.max(.001, scaleX));
  const ry = Math.max(.45, pxRadius / Math.max(.001, scaleY));
  svg.innerHTML = `<path class="pulse-mini-zero" d="M 4 24 H 176"></path><path class="pulse-mini-line" d="${graph.path}"></path><ellipse class="pulse-mini-dot" cx="${graph.x.toFixed(2)}" cy="${graph.y.toFixed(2)}" rx="${rx.toFixed(3)}" ry="${ry.toFixed(3)}"></ellipse><g class="pulse-mini-inspect" visibility="hidden"><line x1="0" y1="3" x2="0" y2="45"></line><circle cx="0" cy="24" r="2.7"></circle></g>`;
  svg._pulseMiniPlot = graph;
}

function renderPulseMiniCharts() {
  ensurePulseMiniKey();
  const charts = [
    ['pulsePriceSparkline', state.pulseMini.price, 'price'],
    ['pulsePnlSparkline', state.pulseMini.pnl, 'pnl'],
    ['pulseRewardSparkline', state.pulseMini.reward, 'reward']
  ];
  charts.forEach(([id, points, metricKey]) => {
    const svg = $(id);
    renderPulseMiniChart(id, points);
    bindPulseMiniInteraction(svg, metricKey);
  });
}

function renderPulseView() {
  const overlay = $('pulseViewDialog');
  if (!overlay) return;
  const clock = $('pulseViewClock');
  if (clock) clock.textContent = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date());

  if (!ensurePulseDayBaseline()) {
    if ($('pulseViewSession')) $('pulseViewSession').textContent = 'Giornata · caricamento…';
    setPulseMetric('pulseMetricPrice', 0, 0, '0.00%', state.price > 0 ? money(state.price, state.price < 10 ? 4 : 3) : '—', 'vs apertura giornata');
    setPulseMetric('pulseMetricPnl', 0, 0, money(0, 2), state.address && state.price > 0 ? money(currentTotalInj() * state.price, 2) : '—', 'vs apertura giornata');
    const rewardVisual = state.rewards > 0 ? pulseAdaptiveVisual(state.rewards, 1, 'reward') : { level: 0, multiplier: 1 };
    setPulseMetric('pulseMetricReward', state.rewards, rewardVisual.level, pulseSignedInj(state.rewards, 4), formatInj(state.rewards, 4), `maturate · reset al claim${pulseScaleSuffix(rewardVisual.multiplier)}`);
    renderPulseMiniCharts();
    return;
  }

  const b = state.pulseDay;
  const total = currentTotalInj();
  const pricePct = b.openPrice > 0 ? ((state.price / b.openPrice) - 1) * 100 : 0;
  // Daily P/L is expressed in currency and uses the wallet's opening-day position as the market baseline.
  // Using the opening quantity prevents staking/unstaking or a reward claim from masquerading as profit/loss.
  const dailyPnl = b.baseTotal > 0 && b.openPrice > 0 ? b.baseTotal * (state.price - b.openPrice) : 0;
  const dailyPnlPct = b.baseWorth > 0 ? (dailyPnl / b.baseWorth) * 100 : 0;
  const dailyReward = state.staked > 0 && state.personalApr > 0 ? state.staked * (state.personalApr / 100) / 365 : 0;
  const rewardScale = dailyReward > 0 ? state.rewards / dailyReward : state.rewards;
  const rewardClaimed = updatePulseRewardScaleAfterClaim(state.rewards, dailyReward);

  ensurePulseExtremesKey();
  const priceExtreme = updatePulseExtreme('price', pricePct, {
    epsilon: pulseExtremeEpsilon('price', { baseWorth: b.baseWorth })
  });
  const pnlExtreme = updatePulseExtreme('pnl', dailyPnl, {
    epsilon: pulseExtremeEpsilon('pnl', { baseWorth: b.baseWorth })
  });
  const rewardExtreme = updatePulseExtreme('reward', state.rewards, {
    epsilon: pulseExtremeEpsilon('reward', { dailyReward }),
    reset: rewardClaimed
  });

  // P/L has its own monetary scale so it does not visually mirror the PRICE candle.
  // The base band is 0.65% of opening worth, with a small currency floor for small wallets.
  const pnlBand = Math.max(5, b.baseWorth * 0.0065);
  ensurePulseScaleForExtremes('price', 2, pricePct, priceExtreme.row);
  ensurePulseScaleForExtremes('pnl', pnlBand, dailyPnl, pnlExtreme.row);
  ensurePulseScaleForExtremes('reward', 1, rewardScale, {
    ghostHigh: dailyReward > 0 && rewardExtreme.row.ghostHigh !== null && rewardExtreme.row.ghostHigh !== undefined && Number.isFinite(Number(rewardExtreme.row.ghostHigh)) ? number(rewardExtreme.row.ghostHigh) / dailyReward : rewardExtreme.row.ghostHigh,
    ghostLow: dailyReward > 0 && rewardExtreme.row.ghostLow !== null && rewardExtreme.row.ghostLow !== undefined && Number.isFinite(Number(rewardExtreme.row.ghostLow)) ? number(rewardExtreme.row.ghostLow) / dailyReward : rewardExtreme.row.ghostLow
  });

  const priceVisual = { level: pulseLevelWithScale(pricePct, 2, 'price'), multiplier: state.pulseAutoScale.price };
  const pnlVisual = { level: pulseLevelWithScale(dailyPnl, pnlBand, 'pnl'), multiplier: state.pulseAutoScale.pnl };
  const rewardVisual = { level: pulseLevelWithScale(rewardScale, 1, 'reward'), multiplier: state.pulseAutoScale.reward };

  setPulseMetric(
    'pulseMetricPrice',
    pricePct,
    priceVisual.level,
    pulseSignedPercent(pricePct),
    state.price > 0 ? money(state.price, state.price < 10 ? 4 : 3) : '—',
    `${b.fallback ? 'vs riferimento 24H' : 'vs apertura giornata'}${pulseScaleSuffix(priceVisual.multiplier)}`
  );
  setPulseMetric(
    'pulseMetricPnl',
    dailyPnl,
    pnlVisual.level,
    signedMoney(dailyPnl, 2),
    state.address && state.price > 0 ? money(total * state.price, 2) : '—',
    `${pulseSignedPercent(dailyPnlPct)} · valore wallet vs apertura${pulseScaleSuffix(pnlVisual.multiplier)}`
  );
  setPulseMetric(
    'pulseMetricReward',
    state.rewards,
    rewardVisual.level,
    pulseSignedInj(state.rewards, 4),
    state.address ? formatInj(state.rewards, 4) : '—',
    dailyReward > 0 ? `maturate · ~${formatInj(dailyReward, 4)}/giorno${pulseScaleSuffix(rewardVisual.multiplier)}` : `maturate · reset al claim${pulseScaleSuffix(rewardVisual.multiplier)}`
  );

  setPulseExtremeUI('pulseMetricPrice', 'price', priceExtreme.row, 2, priceExtreme.flash);
  setPulseExtremeUI('pulseMetricPnl', 'pnl', pnlExtreme.row, pnlBand, pnlExtreme.flash);
  const rewardUiRow = {
    ...rewardExtreme.row,
    ghostHigh: dailyReward > 0 && rewardExtreme.row.ghostHigh !== null && rewardExtreme.row.ghostHigh !== undefined && Number.isFinite(Number(rewardExtreme.row.ghostHigh)) ? number(rewardExtreme.row.ghostHigh) / dailyReward : rewardExtreme.row.ghostHigh,
    ghostLow: dailyReward > 0 && rewardExtreme.row.ghostLow !== null && rewardExtreme.row.ghostLow !== undefined && Number.isFinite(Number(rewardExtreme.row.ghostLow)) ? number(rewardExtreme.row.ghostLow) / dailyReward : rewardExtreme.row.ghostLow
  };
  // Keep reward labels in INJ even though the visual scale is normalized against one day of rewards.
  setPulseExtremeUI('pulseMetricReward', 'reward', rewardUiRow, 1, rewardExtreme.flash);
  const rewardHigh = $('pulseRewardHigh');
  const rewardLow = $('pulseRewardLow');
  if (rewardHigh && rewardExtreme.row.ghostHigh !== null && rewardExtreme.row.ghostHigh !== undefined && Number.isFinite(Number(rewardExtreme.row.ghostHigh))) setPlainNumberValue(rewardHigh, pulseExtremeText('reward', rewardExtreme.row.ghostHigh), Number(rewardExtreme.row.ghostHigh));
  if (rewardLow && rewardExtreme.row.ghostLow !== null && rewardExtreme.row.ghostLow !== undefined && Number.isFinite(Number(rewardExtreme.row.ghostLow))) setPlainNumberValue(rewardLow, pulseExtremeText('reward', rewardExtreme.row.ghostLow), Number(rewardExtreme.row.ghostLow));

  addPulseMiniSample(pricePct, dailyPnl, state.rewards);
  renderPulseMiniCharts();

  if ($('pulseViewSession')) {
    const wallet = state.wallets.find((row) => row.address === state.address);
    $('pulseViewSession').textContent = `${wallet?.label || 'Wallet'} · oggi 00:00 → adesso`;
  }
}

function openPulseView() {
  const overlay = $('pulseViewDialog');
  if (!overlay || state.currentView !== 'home') return;
  state.currentView = 'pulse';
  setHeaderMenuOpen(false);
  setSearchOpen(false);
  ensurePulseDayBaseline();
  renderPulseView();
  overlay.hidden = false;
  overlay.classList.remove('controls-hidden', 'is-closing', 'mode-parked');
  overlay.classList.add('mode-active');
  document.body.classList.add('pulse-view-open');
  schedulePulseControlsHide();
}

function closePulseView({ revealDashboard = true, animate = false } = {}) {
  const overlay = $('pulseViewDialog');
  if (!overlay || overlay.hidden || overlay.classList.contains('is-closing') || overlay.classList.contains('mode-parked')) return;
  window.clearTimeout(state.pulseControlsTimer);
  overlay.classList.remove('controls-hidden');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!revealDashboard) {
    if (!animate || reduced) {
      restoreEntryGateFromImmersive();
      overlay.classList.remove('is-closing', 'mode-active');
      overlay.classList.add('mode-parked');
      document.body.classList.remove('pulse-view-open', 'mode-returning');
      return;
    }
    prepareImmersiveHomeCrossfade();
    overlay.classList.add('is-closing');
    window.setTimeout(() => finishImmersiveHomeCrossfade(overlay, 'pulse-view-open'), 620);
    return;
  }

  const finish = () => {
    const gate = $('entryGate');
    overlay.classList.remove('is-closing', 'mode-active');
    overlay.classList.add('mode-parked');
    document.body.classList.remove('pulse-view-open', 'mode-returning');
    gate?.classList.remove('mode-return');
    pulseDashboardReveal();
  };

  if (!animate || reduced) { finish(); return; }
  overlay.classList.add('is-closing');
  window.setTimeout(finish, 460);
}

function renderMarket() {
  setValue('marketPrice', state.price > 0 ? money(state.price, 4) : '—', state.price || NaN, { roll: true });
  setValue('dayLow', state.low > 0 ? money(state.low, 3) : '—', state.low || NaN);
  setValue('dayHigh', state.high > 0 ? money(state.high, 3) : '—', state.high || NaN);

  const change = $('marketChange');
  const next = Number(state.change);
  setBlinkOnlyElement(change, state.price > 0 ? `${next > 0 ? '+' : ''}${next.toFixed(2)}%` : '—', state.price > 0 ? next : NaN, { flash: false });
  change.className = `market-change ${next > 0 ? 'positive' : next < 0 ? 'negative' : 'neutral'}`;
  if (state.price > 0) {
    change.dataset.numericValue = String(next);
  }
  const amount = $('marketChangeAmount');
  setBlinkOnlyElement(amount, state.price > 0 ? usdt(state.changeAmount, 4) : '— USDT', state.price > 0 ? state.changeAmount : NaN);
  amount.className = state.changeAmount > 0 ? 'positive' : state.changeAmount < 0 ? 'negative' : '';

  const terminalPrice = $('chartHeaderPrice');
  const terminalChange = $('chartHeaderChange');
  if (terminalPrice) {
    setBlinkOnlyElement(
      terminalPrice,
      state.price > 0 ? `$${state.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: state.price < 10 ? 4 : 2 })}` : '$—',
      state.price > 0 ? state.price : NaN
    );
  }
  if (terminalChange) {
    setBlinkOnlyElement(terminalChange, state.price > 0 ? `${next > 0 ? '+' : ''}${next.toFixed(2)}% · 24H` : '—', state.price > 0 ? next : NaN, { flash: false });
    terminalChange.className = next > 0 ? 'positive' : next < 0 ? 'negative' : 'neutral';
  }
  renderMarketTimeframes();
  if (isFocusDisplayActive()) renderFocusDisplay();
  if (isPulseViewActive()) renderPulseView();
}

function renderPortfolio() {
  const totalInj = state.available + state.staked + state.rewards;
  const netWorth = totalInj * state.price;
  const netWorthChange24h = totalInj * state.changeAmount;
  // La barra di allocazione confronta solo INJ realmente in staking e INJ realmente disponibili.
  // Le reward non ancora prelevate fanno parte del patrimonio totale, ma non sono ancora saldo liquido.
  const allocatedInj = state.staked + state.available;
  const stakedShare = allocatedInj > 0 ? (state.staked / allocatedInj) * 100 : 0;
  const liquidShare = allocatedInj > 0 ? (state.available / allocatedInj) * 100 : 0;

  const activeWallet = state.wallets.find((wallet) => wallet.address === state.address);
  $('walletState').textContent = activeWallet ? `${activeWallet.label} · ${shortAddress(state.address)}` : state.address ? shortAddress(state.address) : 'Wallet non caricato';
  setValue('netWorthUsd', state.address ? money(netWorth, 2) : '—', state.address ? netWorth : NaN, { roll: true });
  setValue('netWorthInj', formatInj(totalInj, 4), totalInj);
  setValue('availableInj', formatInj(state.available, 5), state.available);
  setValue('availableUsd', money(state.available * state.price), state.available * state.price);
  const nativeUsdcRow = $('nativeUsdcRow');
  if (nativeUsdcRow) {
    const hasNativeUsdc = state.address && state.nativeUsdc > 0;
    nativeUsdcRow.hidden = !hasNativeUsdc;
    nativeUsdcRow.setAttribute('aria-hidden', hasNativeUsdc ? 'false' : 'true');
    if (hasNativeUsdc) setValue('nativeUsdcBalance', formatUsdc(state.nativeUsdc), state.nativeUsdc, { flash: false });
  }
  setValue('ownedTotalInj', formatInj(totalInj), totalInj);
  setValue('ownedTotalUsd', money(totalInj * state.price), totalInj * state.price);
  const ownedVsStaked = Math.max(0, totalInj - state.staked);
  setValue('ownedVsStakedInj', formatInj(ownedVsStaked), ownedVsStaked);
  setValue('stakedInj', formatInj(state.staked), state.staked);
  setValue('stakedUsd', money(state.staked * state.price), state.staked * state.price);
  setAccruedRewardValue(formatInj(state.rewards, 5), state.rewards);
  setValue('rewardsUsd', money(state.rewards * state.price), state.rewards * state.price, { flash: false });
  setValue('aprValue', state.personalApr > 0 ? `${state.personalApr.toFixed(3)}%` : '—', state.personalApr || NaN);
  setValue('stakedShare', `${stakedShare.toFixed(1)}%`, stakedShare);
  setValue('liquidShare', `${liquidShare.toFixed(1)}%`, liquidShare);
  const worthChange = $('netWorthChange24h');
  if (state.address && state.price > 0) {
    const label = netWorthChange24h > 0 ? 'Guadagno 24h' : netWorthChange24h < 0 ? 'Perdita 24h' : 'Variazione 24h';
    worthChange.className = `worth-change private ${netWorthChange24h > 0 ? 'positive' : netWorthChange24h < 0 ? 'negative' : 'neutral'}`;
    setBlinkOnlyElement(worthChange, `${label} ${signedMoney(netWorthChange24h, 2)} (${state.change > 0 ? '+' : ''}${state.change.toFixed(2)}%)`, netWorthChange24h, { flash: false });
  } else {
    worthChange.textContent = 'Variazione 24h —';
    worthChange.className = 'worth-change private neutral';
  }

  const pnlElement = $('netWorthPnl');
  const averageBuyPrice = currentAverageBuyPrice();
  if (state.address && state.price > 0 && averageBuyPrice > 0) {
    const costBasis = totalInj * averageBuyPrice;
    const pnl = netWorth - costBasis;
    const pnlPercent = averageBuyPrice > 0 ? ((state.price / averageBuyPrice) - 1) * 100 : 0;
    const prefix = pnl > 0 ? '+' : pnl < 0 ? '−' : '';
    pnlElement.className = `worth-change private ${pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral'}`;
    setBlinkOnlyElement(pnlElement, `PnL totale ${prefix}${money(Math.abs(pnl), 2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`, pnl, { flash: false });
  } else {
    pnlElement.textContent = 'PnL totale —';
    pnlElement.className = 'worth-change private neutral';
  }
  renderAveragePriceControl();
  $('allocationBar').style.width = `${Math.max(0, Math.min(100, stakedShare))}%`;
  if (isFocusDisplayActive()) renderFocusDisplay();
  if (isPulseViewActive()) renderPulseView();
}


function currentTotalInj() {
  return state.available + state.staked + state.rewards;
}

function clearRewardSimulation() {
  if (!(state.rewardSimulationPrice > 0) && !$('rewardSimPrice')?.value) return;
  state.rewardSimulationPrice = 0;
  if ($('rewardSimPrice')) $('rewardSimPrice').value = '';
  renderRewardTracker();
}

function compoundDaysForGain(gainInj) {
  const principal = Math.max(0, number(state.staked));
  const dailyRate = Math.max(0, number(state.personalApr)) / 100 / 365;
  const gain = Math.max(0, number(gainInj));
  if (!(principal > 0) || !(dailyRate > 0) || !(gain > 0)) return 0;
  const days = Math.log((principal + gain) / principal) / Math.log(1 + dailyRate);
  return Number.isFinite(days) && days > 0 ? Math.ceil(days) : 0;
}

function rewardEtaCopy(days) {
  if (!(days > 0)) return { duration: '—', date: '—' };
  let duration;
  if (days < 60) duration = `${days} ${days === 1 ? 'giorno' : 'giorni'}`;
  else if (days < 730) {
    const months = days / 30.4375;
    duration = `${months < 10 ? months.toFixed(1).replace('.', ',') : Math.round(months)} mesi`;
  } else {
    const years = days / 365.25;
    duration = `${years.toFixed(1).replace('.', ',')} anni`;
  }
  const targetDate = new Date(Date.now() + days * 86_400_000);
  const date = targetDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: targetDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  return { duration, date };
}

function rewardLiquidEta(missingInj, dailyReward) {
  const missing = Math.max(0, number(missingInj));
  const daily = Math.max(0, number(dailyReward));
  if (!(missing > 0) || !(daily > 0)) return '—';
  const exactHours = missing / (daily / 24);
  if (!Number.isFinite(exactHours) || exactHours <= 0) return '—';
  if (exactHours < 1) return '<1H';
  const totalHours = Math.ceil(exactHours);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) return `${days}G ${hours}H`;
  if (days > 0) return `${days}G`;
  return `${hours}H`;
}

function rewardLiquidityMilestone(liquidValue) {
  const liquid = Math.max(0, number(liquidValue));
  const epsilon = 1e-9;

  // Milestone leggibili che si adattano anche ai wallet con piccoli saldi.
  // Dopo 1 INJ la scala continua naturalmente 2 → 5 → 10 → 25 → 50...
  const milestones = [
    0.01, 0.05, 0.1, 0.25, 0.5,
    1, 2, 5, 10, 25, 50, 100, 250, 500, 1000
  ];

  const index = milestones.findIndex((value) => value > liquid + epsilon);
  if (index >= 0) {
    return {
      goal: milestones[index],
      base: index > 0 ? milestones[index - 1] : 0
    };
  }

  // Oltre la scala predefinita usa una progressione 1 → 2 → 5 per decade.
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, liquid)));
  const ladder = [1, 2, 5, 10].map((step) => step * magnitude);
  const ladderIndex = ladder.findIndex((value) => value > liquid + epsilon);
  if (ladderIndex >= 0) {
    return {
      goal: ladder[ladderIndex],
      base: ladderIndex > 0 ? ladder[ladderIndex - 1] : magnitude / 2
    };
  }

  return { goal: magnitude * 20, base: magnitude * 10 };
}

function rewardLiquidityTargetText(value) {
  const amount = Math.max(0, number(value));
  return amount.toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount < 1 ? 4 : 2
  });
}

function renderRewardLiquidityTarget(active, dailyReward) {
  const liquid = Math.max(0, number(state.available)) + Math.max(0, number(state.rewards));
  const { goal, base } = rewardLiquidityMilestone(liquid);
  const missing = Math.max(0, goal - liquid);
  const span = Math.max(1e-12, goal - base);
  const progress = Math.max(0, Math.min(100, ((liquid - base) / span) * 100));
  const eta = active ? rewardLiquidEta(missing, dailyReward) : '—';
  const goalText = rewardLiquidityTargetText(goal);

  if ($('rewardLiquidTotal')) $('rewardLiquidTotal').textContent = state.address ? formatInj(liquid, 4) : '—';
  if ($('rewardLiquidGoal')) $('rewardLiquidGoal').textContent = state.address ? `${goalText} INJ` : '—';
  if ($('rewardLiquidMissing')) $('rewardLiquidMissing').textContent = state.address ? formatInj(missing, 4) : '—';
  if ($('rewardLiquidEta')) $('rewardLiquidEta').textContent = state.address ? eta : '—';
  if ($('rewardLiquidBar')) $('rewardLiquidBar').style.width = state.address ? `${progress}%` : '0%';

  const panel = $('rewardLiquidNext');
  if (panel) {
    panel.classList.toggle('inactive', !state.address || !active);
    panel.setAttribute('aria-label', state.address
      ? `Disponibile più reward ${formatInj(liquid, 4)}. Mancano ${formatInj(missing, 4)} per arrivare al prossimo target di ${goalText} INJ. Tempo stimato ${eta}.`
      : 'Prossimo target disponibile non disponibile');
  }
}

// v15.99.12 — Selected-wallet reward accumulation ladder.
// The ladder follows the ACTUAL unclaimed reward balance of the active wallet,
// not the amount staked. Each completed decade becomes the new zero point:
// 0 → .001, .001 → .01, .01 → .1, .1 → 1, 1 → 10, ...
// Claiming rewards naturally drops state.rewards and therefore resets the path.
function rewardClaimMilestone(rewardBalance) {
  const rewards = Math.max(0, number(rewardBalance));
  const firstGoal = 0.001;
  if (rewards < firstGoal - 1e-12) return { base: 0, goal: firstGoal };

  const exponent = Math.floor(Math.log10(Math.max(firstGoal, rewards)) + 1e-12);
  const base = Math.max(firstGoal, 10 ** exponent);
  return { base, goal: base * 10 };
}

function rewardClaimValueText(value) {
  const amount = Math.max(0, number(value));
  let digits = 4;
  if (amount < 0.01) digits = 5;
  else if (amount < 0.1) digits = 4;
  else if (amount < 1) digits = 3;
  else if (amount < 10) digits = 2;
  else digits = 1;
  return amount.toLocaleString('it-IT', {
    minimumFractionDigits: amount < 1 ? Math.min(3, digits) : 0,
    maximumFractionDigits: digits
  });
}

function rewardClaimEtaCopy(missingReward, dailyReward) {
  const missing = Math.max(0, number(missingReward));
  const daily = Math.max(0, number(dailyReward));
  if (missing <= 1e-12) return 'Step completato';
  if (!(daily > 0)) return 'ETA non disponibile';

  const totalMinutes = (missing / daily) * 24 * 60;
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return 'ETA non disponibile';
  if (totalMinutes < 1) return '< 1 min al prossimo step';
  if (totalMinutes < 60) return `~ ${Math.ceil(totalMinutes)} min al prossimo step`;
  if (totalMinutes < 48 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `~ ${hours}h${minutes ? ` ${minutes}m` : ''} al prossimo step`;
  }
  const days = totalMinutes / 1440;
  if (days < 60) return `~ ${days.toLocaleString('it-IT', { maximumFractionDigits: days < 10 ? 1 : 0 })} giorni al prossimo step`;
  const months = days / 30.4375;
  return `~ ${months.toLocaleString('it-IT', { maximumFractionDigits: months < 12 ? 1 : 0 })} mesi al prossimo step`;
}

function renderRewardClaimLadder(dailyReward) {
  const hasWallet = Boolean(state.address);
  const currentReward = hasWallet ? Math.max(0, number(state.rewards)) : 0;
  const { base, goal } = rewardClaimMilestone(currentReward);
  const span = Math.max(1e-12, goal - base);
  const progress = hasWallet ? Math.max(0, Math.min(100, ((currentReward - base) / span) * 100)) : 0;
  const missing = hasWallet ? Math.max(0, goal - currentReward) : 0;
  const eta = hasWallet ? rewardClaimEtaCopy(missing, dailyReward) : '—';
  const baseText = base > 0 ? `${rewardClaimValueText(base)} INJ` : '0 INJ';
  const goalText = `${rewardClaimValueText(goal)} INJ`;

  if ($('rewardAutoTargetLabel')) $('rewardAutoTargetLabel').textContent = hasWallet ? `→ ${goalText}` : '—';
  if ($('rewardAutoTargetEta')) $('rewardAutoTargetEta').textContent = hasWallet ? eta : '—';
  if ($('rewardAutoTargetBase')) $('rewardAutoTargetBase').textContent = baseText;
  if ($('rewardAutoTargetGoal')) $('rewardAutoTargetGoal').textContent = goalText;
  if ($('rewardAutoTargetCurrent')) $('rewardAutoTargetCurrent').textContent = hasWallet ? `${rewardClaimValueText(currentReward)} INJ` : '—';
  if ($('rewardAutoTargetMissing')) $('rewardAutoTargetMissing').textContent = hasWallet ? `${rewardClaimValueText(missing)} INJ` : '—';
  if ($('rewardAutoTargetProgress')) $('rewardAutoTargetProgress').textContent = hasWallet ? `${progress.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%` : '—';
  if ($('rewardAutoTargetBar')) $('rewardAutoTargetBar').style.width = `${progress}%`;
  if ($('rewardAutoTargetDot')) $('rewardAutoTargetDot').style.left = `${progress}%`;

  const panel = $('rewardAutoTarget');
  if (panel) {
    panel.classList.toggle('inactive', !hasWallet);
    panel.classList.toggle('at-stage-start', hasWallet && progress < 0.01);
    panel.setAttribute('data-wallet', state.address || '');
    panel.setAttribute('aria-label', hasWallet
      ? `Wallet selezionato. Reward maturati ${currentReward.toFixed(6)} INJ. Step da ${base.toFixed(6)} a ${goal.toFixed(6)} INJ. Mancano ${missing.toFixed(6)} INJ. Avanzamento ${progress.toFixed(1)} percento. ${eta}.`
      : 'Avanzamento reward non disponibile');
  }
}

function renderRewardTracker() {
  const simulationPrice = Math.max(0, number(state.rewardSimulationPrice));
  const simulationActive = simulationPrice > 0;
  const stakingBase = state.staked;
  const valuationPrice = simulationActive ? simulationPrice : state.price;
  const active = stakingBase > 0 && state.personalApr > 0;
  const daily = active ? stakingBase * (state.personalApr / 100) / 365 : 0;
  const hourly = daily / 24;
  const weekly = daily * 7;
  const monthly = daily * 30;
  const yearly = daily * 365;

  $('yieldCard')?.classList.toggle('simulation-active', simulationActive);
  if ($('rewardModePill')) $('rewardModePill').textContent = simulationActive ? 'SIMULAZIONE' : 'LIVE';

  setRewardEstimateValue('hourlyEstimate', hourly, active, 4);
  setPulseOnlyValue('hourlyUsd', active && valuationPrice > 0 ? money(hourly * valuationPrice, 4) : '—', active && valuationPrice > 0 ? hourly * valuationPrice : NaN, { flash: false });
  setRewardEstimateValue('dailyEstimate', daily, active, 4);
  setPulseOnlyValue('dailyUsd', active && valuationPrice > 0 ? money(daily * valuationPrice, 3) : '—', active && valuationPrice > 0 ? daily * valuationPrice : NaN, { flash: false });
  setRewardEstimateValue('weeklyEstimate', weekly, active, 4);
  setPulseOnlyValue('weeklyUsd', active && valuationPrice > 0 ? money(weekly * valuationPrice, 3) : '—', active && valuationPrice > 0 ? weekly * valuationPrice : NaN, { flash: false });
  setRewardEstimateValue('monthlyEstimate', monthly, active, 4);
  setPulseOnlyValue('monthlyUsd', active && valuationPrice > 0 ? money(monthly * valuationPrice) : '—', active && valuationPrice > 0 ? monthly * valuationPrice : NaN, { flash: false });
  setRewardEstimateValue('yearlyEstimate', yearly, active, 4);
  setPulseOnlyValue('yearlyUsd', active && valuationPrice > 0 ? money(yearly * valuationPrice) : '—', active && valuationPrice > 0 ? yearly * valuationPrice : NaN, { flash: false });

  // v15.98.16 — Added USD/day target gauge. Existing Reward Tracker values
  // remain untouched; this is a live visual layer driven by selected wallet,
  // personal APR and current/simulated INJ valuation.
  const dailyUsdValue = active && valuationPrice > 0 ? daily * valuationPrice : 0;

  // v15.98.18 — Self-scaling reward gauge. $2/day remains the first major
  // objective; after it is passed, the target advances automatically through
  // useful daily-income milestones. Wallet changes and market moves therefore
  // require no manual configuration.
  const rewardUsdMilestones = [0.25, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000, 2500, 5000];
  let rewardUsdTarget = rewardUsdMilestones.find((value) => value > dailyUsdValue + 1e-9);
  if (!(rewardUsdTarget > 0)) {
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, dailyUsdValue))));
    rewardUsdTarget = Math.ceil(dailyUsdValue / magnitude + 0.001) * magnitude;
    if (rewardUsdTarget <= dailyUsdValue) rewardUsdTarget += magnitude;
  }
  if (dailyUsdValue < 2) rewardUsdTarget = 2;

  const rawScaleMax = Math.max(rewardUsdTarget * 1.12, dailyUsdValue * 1.08, 0.5);
  const scaleStep = rawScaleMax <= 5 ? 0.5 : rawScaleMax <= 20 ? 1 : rawScaleMax <= 100 ? 5 : rawScaleMax <= 500 ? 25 : 100;
  const rewardUsdScaleMax = Math.max(scaleStep, Math.ceil(rawScaleMax / scaleStep) * scaleStep);
  const markerPct = rewardUsdScaleMax > 0 ? Math.max(0, Math.min(100, (dailyUsdValue / rewardUsdScaleMax) * 100)) : 0;
  const targetPct = rewardUsdScaleMax > 0 ? Math.max(0, Math.min(100, (rewardUsdTarget / rewardUsdScaleMax) * 100)) : 80;
  const gauge = $('rewardUsdProgress');
  if (gauge) {
    gauge.classList.toggle('target-reached', dailyUsdValue >= rewardUsdTarget);
    gauge.classList.toggle('inactive', !active || !(valuationPrice > 0));
    gauge.style.setProperty('--reward-usd-marker', `${markerPct}%`);
    gauge.style.setProperty('--reward-usd-target', `${targetPct}%`);
    gauge.setAttribute('aria-label', active && valuationPrice > 0
      ? `Reward giornaliero ${money(dailyUsdValue, 3)}. Prossimo target ${money(rewardUsdTarget, rewardUsdTarget < 10 ? 2 : 0)} al giorno.`
      : 'Reward giornaliero non disponibile');
  }
  if ($('rewardDailyUsdGauge')) $('rewardDailyUsdGauge').textContent = active && valuationPrice > 0 ? `${money(dailyUsdValue, 3)} / giorno` : '—';
  if ($('rewardUsdTargetValue')) $('rewardUsdTargetValue').textContent = `${money(rewardUsdTarget, rewardUsdTarget < 10 ? 2 : 0)} / giorno`;
  const rewardTargetProgress = rewardUsdTarget > 0 ? Math.max(0, Math.min(100, (dailyUsdValue / rewardUsdTarget) * 100)) : 0;
  if ($('rewardUsdProgressCopy')) $('rewardUsdProgressCopy').textContent = active && valuationPrice > 0
    ? `${rewardTargetProgress.toLocaleString('it-IT', { maximumFractionDigits: rewardTargetProgress < 10 ? 1 : 0 })}% del target`
    : '— verso target';
  if ($('rewardUsdScaleMax')) $('rewardUsdScaleMax').textContent = money(rewardUsdScaleMax, rewardUsdScaleMax < 10 ? 2 : 0);
  if ($('rewardUsdMarker')) $('rewardUsdMarker').setAttribute('aria-label', active && valuationPrice > 0 ? `Reward giornaliero ${money(dailyUsdValue, 3)}` : 'Reward giornaliero non disponibile');

  // Clear any classes left by older builds so this card never flashes red/green.
  $('yieldCard')?.classList.remove('data-flash-up', 'data-flash-down');
  $('yieldCard')?.querySelectorAll('.value-change-up, .value-change-down').forEach((node) => node.classList.remove('value-change-up', 'value-change-down'));

  const milestones = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 25, 50, 100];
  const milestone = milestones.find((value) => value > daily + 1e-9) || Math.ceil(daily / 100) * 100 + 100;
  const required = active ? milestone * 365 / (state.personalApr / 100) : 0;
  const missing = Math.max(0, required - stakingBase);
  if ($('rewardMilestoneHeading')) $('rewardMilestoneHeading').textContent = 'Prossimo livello';
  setPulseOnlyValue('rewardMilestoneLabel', active ? `${milestone.toLocaleString('it-IT')} INJ / giorno` : '—', active ? milestone : NaN, { flash: false });
  setPulseOnlyValue('rewardMilestoneMissing', active ? `${formatInj(missing, 4)} di staking mancanti` : '—', active ? missing : NaN, { flash: false });
  $('rewardMilestoneBar').style.width = active ? `${Math.min(100, (daily / milestone) * 100)}%` : '0%';
  renderRewardClaimLadder(daily);

  if (simulationActive) {
    $('aprMethod').textContent = `Simulazione sui ${formatInj(stakingBase, 4)} realmente delegati in questo wallet, valorizzati a ${usdMoney(simulationPrice)} per INJ. APR netto personale ${state.personalApr.toFixed(3)}%. Clicca fuori dalla card per tornare al prezzo LIVE.`;
  } else if (state.personalApr > 0) {
    $('aprMethod').textContent = `Stima netta sui ${formatInj(state.staked, 4)} realmente delegati. I validator inattivi o jailed producono 0% nel calcolo; le commissioni sono ponderate per quantità delegata.`;
  } else if (state.address && state.staked <= 0) {
    $('aprMethod').textContent = 'L’APR personale apparirà quando l’indirizzo avrà una delegazione attiva.';
  } else {
    $('aprMethod').textContent = 'La stima usa solo gli INJ effettivamente delegati dall’indirizzo, con commissioni e stato di ciascun validator.';
  }
}

function defaultTarget(total) {
  if (!(total > 0)) return 2000;
  const step = total < 1000 ? 100 : total < 5000 ? 500 : 1000;
  return (Math.floor(total / step) + 1) * step;
}

function activeTarget() {
  if (!state.address) return 0;
  let target = number(state.targetByWallet[state.address]);
  const total = currentTotalInj();
  if (!(target > 0)) {
    target = defaultTarget(total);
    state.targetByWallet[state.address] = target;
    saveTargets();
  }
  return target;
}

function liveTargetTotalInj() {
  const base = currentTotalInj();
  if (!state.address || !(state.lastWalletUpdate > 0) || !(state.staked > 0) || !(state.personalApr > 0)) return base;

  // Keep the Target Tracker visually live between blockchain refreshes without
  // pretending stale data can grow forever. Every real wallet refresh resets
  // lastWalletUpdate and therefore re-anchors this estimate to chain data.
  const elapsedMs = Math.max(0, Date.now() - state.lastWalletUpdate);
  const liveWindowMs = Math.min(elapsedMs, 120_000);
  const dailyReward = state.staked * (state.personalApr / 100) / 365;
  return base + dailyReward * (liveWindowMs / 86_400_000);
}

function estimateTargetDays(target, totalNow = liveTargetTotalInj()) {
  if (!(target > totalNow)) return 0;
  const dailyRate = Math.max(0, state.personalApr) / 100 / 365;
  if (!(dailyRate > 0) || !(state.staked + state.rewards > 0)) return Infinity;
  let principal = Math.max(0, state.staked + state.rewards);
  const fixed = Math.max(0, state.available);
  const maxDays = 365 * 40;
  for (let day = 1; day <= maxDays; day++) {
    principal += principal * dailyRate;
    if (fixed + principal >= target) return day;
  }
  return Infinity;
}

function etaText(days) {
  if (!Number.isFinite(days)) return 'Oltre 40 anni / n.d.';
  if (days <= 0) return 'Raggiunto';
  const date = new Date(Date.now() + days * 86400000);
  if (days < 60) return `${days} giorni · ${date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`;
  const months = Math.round(days / 30.4375);
  return `${months} mesi · ${date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}`;
}

function setTargetProgressValue(total, target) {
  const element = $('targetProgressCopy');
  if (!element) return;
  const currentText = number(total).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const targetText = number(target).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  element.classList.add('target-progress-rich');
  element.innerHTML = `<span class="target-progress-current"><span class="target-progress-number">${currentText}</span><span class="target-progress-unit">INJ</span></span><span class="target-progress-separator">/</span><span class="target-progress-goal">${targetText} INJ</span>`;
  element.dataset.plainNumericValue = String(number(total));
}

function setTargetMissingValue(missing) {
  const element = $('targetMissing');
  if (!element) return;
  const missingText = number(missing).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  element.classList.add('target-missing-rich');
  element.innerHTML = `<span class="target-missing-number">${missingText}</span><span class="target-missing-unit"> INJ</span>`;
  element.dataset.plainNumericValue = String(number(missing));
}

function renderTarget() {
  const input = $('targetInput');
  if (!input) return;
  if (!state.address) {
    input.value = '';
    $('targetProgressCopy').textContent = '—';
    $('targetProgressBar').style.width = '0%';
    if ($('targetProgressDot')) $('targetProgressDot').style.left = '0%';
    $('targetMissing').textContent = '—';
    $('targetPercent').textContent = '—';
    $('targetEta').textContent = '—';
    $('targetCard')?.classList.remove('target-reached');
    return;
  }

  const total = liveTargetTotalInj();
  const storedTarget = activeTarget();
  const draftTarget = document.activeElement === input ? number(input.value) : 0;
  const target = draftTarget > 0 ? draftTarget : storedTarget;
  if (document.activeElement !== input) input.value = String(Number(target.toFixed(4)));

  const percent = target > 0 ? Math.max(0, Math.min(100, (total / target) * 100)) : 0;
  const missing = Math.max(0, target - total);

  setTargetProgressValue(total, target);
  $('targetProgressBar').style.width = `${percent}%`;
  if ($('targetProgressDot')) $('targetProgressDot').style.left = `${percent}%`;
  setTargetMissingValue(missing);
  $('targetPercent').textContent = `${percent.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  $('targetEta').textContent = etaText(estimateTargetDays(target, total));
  $('targetCard')?.classList.toggle('target-reached', missing <= 1e-9);
}

function renderValidators() {
  const host = $('validatorList');
  $('validatorCount').textContent = String(state.validators.length);
  host.replaceChildren();

  if (!state.validators.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = state.address ? 'Nessuna delegazione trovata per questo wallet.' : 'Carica un wallet per vedere dove sono delegati gli INJ.';
    host.appendChild(empty);
    return;
  }

  [...state.validators].sort((a, b) => b.amount - a.amount).forEach((validator) => {
    const row = document.createElement('div');
    row.className = 'validator-row';

    const name = document.createElement('div');
    name.className = 'validator-name';
    const title = document.createElement('strong');
    title.textContent = validator.moniker;
    const status = document.createElement('small');
    status.className = `validator-status ${validatorActive(validator) ? '' : 'inactive'}`.trim();
    status.textContent = validatorActive(validator) ? 'Attivo' : validator.jailed ? 'Jailed' : 'Inattivo';
    name.append(title, status);

    const stake = metricCell('Delegati', formatInj(validator.amount, 4), true);
    const commission = metricCell('Commissione', `${(validator.commission * 100).toFixed(2)}%`);
    const netApr = metricCell('APR netto', `${validatorNetApr(validator).toFixed(3)}%`);
    if (!validatorActive(validator) || validator.commission >= 0.1) {
      row.classList.add('validator-alert');
      commission.classList.add('warning');
    }
    row.append(name, stake, commission, netApr);
    host.appendChild(row);
  });
}

function metricCell(label, value, isPrivate = false) {
  const cell = document.createElement('div');
  const small = document.createElement('span');
  const strong = document.createElement('strong');
  small.textContent = label;
  strong.textContent = value;
  if (isPrivate) strong.classList.add('private');
  cell.append(small, strong);
  return cell;
}

function renderAll() {
  renderMarket();
  renderPortfolio();
  renderRewardTracker();
  renderTarget();
  renderValidators();
  renderAggregate();
  renderWalletCards();
  renderEntryConverter();
}

async function refreshAll(showFeedback = true) {
  await Promise.all([
    loadMarket(),
    state.address ? loadWallet(false, state.address) : Promise.resolve()
  ]);
  await refreshWalletSummaries(true);
  if (showFeedback && state.address) toast('Tutti gli account sono aggiornati');
}

const NATIVE_CHART_CONFIG = {
  h1: { label: '1H', interval: '1m', sampleMs: 5_000 },
  d1: { label: '1D', interval: '5m', sampleMs: 30_000 },
  w1: { label: '1S', interval: '15m', sampleMs: 120_000 },
  m1: { label: '1M', interval: '1h', sampleMs: 300_000 },
  y1: { label: 'ALL', interval: '1d', sampleMs: 1_800_000 }
};

function nativeChartPeriodBounds(range, reference = new Date()) {
  const now = new Date(reference);
  let start;
  let end;

  if (range === 'h1') {
    start = new Date(now);
    start.setMinutes(0, 0, 0);
    end = new Date(start);
    end.setHours(end.getHours() + 1);
  } else if (range === 'd1') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (range === 'w1') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (range === 'm1') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
  }

  return { start: start.getTime(), end: end.getTime() };
}

function nativeChartPrice(value) {
  const v = number(value);
  if (!(v > 0)) return '—';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 4 : 2 })}`;
}

function nativeChartDateLabel(timestamp, range = state.nativeChartRange) {
  const date = new Date(timestamp);
  if (range === 'h1' || range === 'd1') {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === 'w1' || range === 'm1') {
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  }
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
}

function nativeChartAxisLabels(range, bounds) {
  const start = new Date(bounds.start);
  const end = new Date(Math.max(bounds.start, bounds.end - 1));

  if (range === 'h1' || range === 'd1') {
    return [
      start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      end.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    ];
  }

  if (range === 'w1') {
    return [
      start.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', ''),
      end.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '')
    ];
  }

  if (range === 'm1') {
    return [
      start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', ''),
      end.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', '')
    ];
  }

  return [
    start.toLocaleDateString('it-IT', { month: 'short' }).replace('.', ''),
    end.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')
  ];
}

function nativeChartCacheKey(range, bounds) {
  return `${range}:${bounds.start}`;
}

async function fetchNativeChartSeries(range, bounds) {
  const config = NATIVE_CHART_CONFIG[range] || NATIVE_CHART_CONFIG.d1;
  const endTime = Math.min(Date.now(), bounds.end - 1);
  const url = `https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=${encodeURIComponent(config.interval)}&startTime=${Math.floor(bounds.start)}&endTime=${Math.floor(endTime)}&limit=1000`;
  const data = await fetchJson(url, 10_000);
  const rows = Array.isArray(data) ? data.filter((row) => number(row?.[1]) > 0 && number(row?.[4]) > 0) : [];
  if (!rows.length) throw new Error('Storico mercato non disponibile');

  const open = number(rows[0][1]);
  const points = [{ t: bounds.start, price: open }];
  rows.forEach((row) => {
    const t = Math.min(Date.now(), number(row[6]) || number(row[0]));
    const price = number(row[4]);
    if (t >= bounds.start && price > 0) points.push({ t, price });
  });

  const min = Math.min(...rows.map((row) => number(row[3])).filter((v) => v > 0), open);
  const max = Math.max(...rows.map((row) => number(row[2])).filter((v) => v > 0), open);
  return { points, open, min, max, start: bounds.start, end: bounds.end, loadedAt: Date.now() };
}

function renderNativeChartControls() {
  document.querySelectorAll('[data-native-chart-range]').forEach((button) => {
    const active = button.dataset.nativeChartRange === state.nativeChartRange;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setNativeChartPlaceholder(mode, message = '') {
  const host = $('nativeChartPlaceholder');
  if (!host) return;
  host.hidden = mode === 'hidden';
  host.classList.toggle('error', mode === 'error');
  const copy = host.querySelector('span');
  if (copy && message) copy.textContent = message;
}

function nativeChartCombinedPoints() {
  const base = Array.isArray(state.nativeChart.points) ? state.nativeChart.points : [];
  const samples = Array.isArray(state.nativeChart.liveSamples) ? state.nativeChart.liveSamples : [];
  const live = state.nativeChart.live?.price > 0 ? [state.nativeChart.live] : [];
  const all = [...base, ...samples, ...live]
    .filter((row) => number(row?.t) > 0 && number(row?.price) > 0)
    .sort((a, b) => a.t - b.t);

  const deduped = [];
  all.forEach((row) => {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(row.t - previous.t) < 800) deduped[deduped.length - 1] = row;
    else deduped.push(row);
  });
  return deduped;
}

function nativeChartPerformance(price, open = state.nativeChart.open) {
  const p = number(price);
  const o = number(open);
  return p > 0 && o > 0 ? ((p / o) - 1) * 100 : 0;
}

function renderNativeChartSummary() {
  const chart = state.nativeChart;
  const current = number(chart.live?.price) || state.price || number(chart.points?.[chart.points.length - 1]?.price);
  const open = number(chart.open);
  const values = nativeChartCombinedPoints().map((row) => number(row.price)).filter((v) => v > 0);
  const low = values.length ? Math.min(number(chart.min) || Infinity, ...values) : number(chart.min);
  const high = values.length ? Math.max(number(chart.max), ...values) : number(chart.max);
  const perf = nativeChartPerformance(current, open);

  if ($('nativeChartOpen')) $('nativeChartOpen').textContent = nativeChartPrice(open);
  if ($('nativeChartLow')) $('nativeChartLow').textContent = nativeChartPrice(low);
  if ($('nativeChartHigh')) $('nativeChartHigh').textContent = nativeChartPrice(high);
  if ($('nativeChartNow')) $('nativeChartNow').textContent = nativeChartPrice(current);
  if ($('chartHeaderPrice')) $('chartHeaderPrice').textContent = nativeChartPrice(current);

  const change = $('chartHeaderChange');
  if (change) {
    const label = state.nativeChartRange === 'y1' ? 'ALL · 1Y' : NATIVE_CHART_CONFIG[state.nativeChartRange]?.label || '1D';
    change.textContent = open > 0 ? `${perf >= 0 ? '+' : ''}${perf.toFixed(2)}% · ${label}` : '—';
    change.className = perf > 0 ? 'positive' : perf < 0 ? 'negative' : 'neutral';
  }
}

function nativeChartSvgText(x, y, text, anchor = 'start', className = '') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${className}">${text}</text>`;
}

function nativeChartColoredSegments(points = []) {
  const segments = [];
  let current = null;

  const sideOf = (perf) => perf > 1e-9 ? 'positive' : perf < -1e-9 ? 'negative' : 'neutral';

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const aSide = sideOf(a.perf);
    const bSide = sideOf(b.perf);

    if (aSide === 'neutral' && bSide === 'neutral') continue;

    const startSide = aSide === 'neutral' ? bSide : aSide;
    if (!current || current.side !== startSide) {
      current = { side: startSide, points: [a] };
      segments.push(current);
    } else if (current.points[current.points.length - 1] !== a) {
      current.points.push(a);
    }

    if (aSide !== 'neutral' && bSide !== 'neutral' && aSide !== bSide) {
      const ratio = Math.abs(a.perf) / Math.max(1e-12, Math.abs(a.perf) + Math.abs(b.perf));
      const cross = {
        t: a.t + (b.t - a.t) * ratio,
        price: a.price + (b.price - a.price) * ratio,
        perf: 0,
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio
      };
      current.points.push(cross);
      current = { side: bSide, points: [cross, b] };
      segments.push(current);
    } else {
      current.points.push(b);
    }
  }

  return segments.filter((segment) => segment.points.length > 1 && segment.side !== 'neutral');
}

function nativeChartSegmentPath(points = []) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  // Smussatura solo visiva: usa gli stessi punti/prezzi reali ma li collega
  // con curve cubiche controllate. I control point vengono limitati al
  // segmento locale per evitare overshoot o falsi picchi sopra/sotto 0%.
  const tension = 0.72;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    let c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    let c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    let c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    let c2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    c1x = clamp(c1x, minX, maxX);
    c2x = clamp(c2x, minX, maxX);
    c1y = clamp(c1y, minY, maxY);
    c2y = clamp(c2y, minY, maxY);

    path += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

function renderNativeChart() {
  cancelAnimationFrame(state.nativeChartRenderFrame);
  state.nativeChartRenderFrame = requestAnimationFrame(() => {
    const host = $('nativeChartHost');
    const svg = $('nativeChartSvg');
    if (!host || !svg || !isChartOpen()) return;

    const rows = nativeChartCombinedPoints();
    if (!rows.length || !(state.nativeChart.open > 0)) {
      svg.replaceChildren();
      return;
    }

    const rect = host.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width));
    const height = Math.max(220, Math.round(rect.height));
    const pad = { l: width < 480 ? 58 : 64, r: 14, t: 22, b: 34 };
    const plotW = Math.max(1, width - pad.l - pad.r);
    const plotH = Math.max(1, height - pad.t - pad.b);
    const periodStart = state.nativeChart.start;
    const periodEnd = state.nativeChart.end;
    const now = Date.now();

    const plotted = rows.map((row) => ({
      ...row,
      perf: nativeChartPerformance(row.price, state.nativeChart.open)
    }));

    // La linea usa sempre tutta la larghezza per il periodo realmente trascorso.
    // Niente spazio vuoto fino a fine ora/giorno/settimana/mese/anno.
    const latestTimestamp = Math.max(periodStart + 1, plotted[plotted.length - 1]?.t || now, Math.min(now, periodEnd));
    const visibleEnd = Math.min(periodEnd, latestTimestamp);

    const perfValues = plotted.map((row) => row.perf);
    const rawMin = Math.min(0, ...perfValues);
    const rawMax = Math.max(0, ...perfValues);
    const maxAbs = Math.max(0.25, Math.abs(rawMin), Math.abs(rawMax));

    // Mantiene la baseline 0% lontana dai bordi anche nei periodi quasi
    // interamente positivi o negativi, senza rendere la scala artificiosamente simmetrica.
    let minPerf = Math.min(rawMin, -maxAbs * 0.28);
    let maxPerf = Math.max(rawMax, maxAbs * 0.28);
    let span = Math.max(0.45, maxPerf - minPerf);
    const margin = Math.max(0.06, span * 0.08);
    minPerf -= margin;
    maxPerf += margin;
    span = maxPerf - minPerf;

    const xFor = (t) => pad.l + Math.max(0, Math.min(1, (t - periodStart) / Math.max(1, visibleEnd - periodStart))) * plotW;
    const yFor = (perf) => pad.t + (1 - ((perf - minPerf) / span)) * plotH;
    const zeroY = yFor(0);
    const bottomY = height - pad.b;
    const points = plotted.map((row) => ({ ...row, x: xFor(row.t), y: yFor(row.perf) }));
    state.nativeChart.renderPoints = points;
    state.nativeChart.geometry = {
      width, height, pad, bottomY, plotRight: width - pad.r, plotW, plotH, zeroY
    };

    const coloredSegments = nativeChartColoredSegments(points);
    const last = points[points.length - 1];
    const [leftLabel, rightLabel] = nativeChartAxisLabels(state.nativeChartRange, { start: periodStart, end: visibleEnd + 1 });
    const topLabel = `${maxPerf >= 0 ? '+' : ''}${maxPerf.toFixed(Math.abs(maxPerf) < 1 ? 2 : 1)}%`;
    const bottomLabel = `${minPerf >= 0 ? '+' : ''}${minPerf.toFixed(Math.abs(minPerf) < 1 ? 2 : 1)}%`;
    const currentPerf = last.perf;
    const currentClass = currentPerf > 0 ? 'positive' : currentPerf < 0 ? 'negative' : 'neutral';
    const midTopY = pad.t + Math.max(0, (zeroY - pad.t) / 2);
    const midBottomY = zeroY + Math.max(0, (bottomY - zeroY) / 2);

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const segmentMarkup = coloredSegments.map((segment) =>
      `<path class="native-chart-line ${segment.side}" d="${nativeChartSegmentPath(segment.points)}"/>`
    ).join('');

    svg.innerHTML = `
      <g class="native-chart-grid">
        <line x1="${pad.l}" y1="${midTopY}" x2="${width - pad.r}" y2="${midTopY}"/>
        <line x1="${pad.l}" y1="${zeroY}" x2="${width - pad.r}" y2="${zeroY}" class="zero"/>
        <line x1="${pad.l}" y1="${midBottomY}" x2="${width - pad.r}" y2="${midBottomY}"/>
      </g>
      ${segmentMarkup}
      <circle class="native-chart-current native-chart-live-dot ${currentClass}" cx="${last.x}" cy="${last.y}" r="4.2"/>
      <g class="native-chart-hover" id="nativeChartHoverGroup" visibility="hidden" aria-hidden="true">
        <line class="native-chart-crosshair native-chart-crosshair-v" id="nativeChartHoverV"/>
        <line class="native-chart-crosshair native-chart-crosshair-h" id="nativeChartHoverH"/>
        <circle class="native-chart-hover-dot" id="nativeChartHoverDot" r="5.5"/>
        <g class="native-chart-axis-chip native-chart-price-chip" id="nativeChartHoverPriceChip">
          <rect width="70" height="24" rx="7"/>
          <text x="35" y="16" text-anchor="middle" id="nativeChartHoverPriceText">—</text>
        </g>
        <g class="native-chart-axis-chip native-chart-time-chip" id="nativeChartHoverTimeChip">
          <rect width="72" height="22" rx="7"/>
          <text x="36" y="15" text-anchor="middle" id="nativeChartHoverTimeText">—</text>
        </g>
      </g>
      ${nativeChartSvgText(pad.l - 8, pad.t + 4, topLabel, 'end', 'axis-value positive-axis')}
      ${nativeChartSvgText(pad.l - 8, zeroY + 4, '0%', 'end', 'axis-zero')}
      ${nativeChartSvgText(pad.l - 8, bottomY + 4, bottomLabel, 'end', 'axis-value negative-axis')}
      ${nativeChartSvgText(pad.l, height - 10, leftLabel, 'start', 'axis-time')}
      ${nativeChartSvgText(width - pad.r, height - 10, rightLabel, 'end', 'axis-time')}
    `;

    setNativeChartPlaceholder('hidden');
    renderNativeChartSummary();

    if (state.nativeChartHover?.active && state.nativeChartHover.t) {
      let nearest = points[0];
      let distance = Math.abs(nearest.t - state.nativeChartHover.t);
      for (let i = 1; i < points.length; i += 1) {
        const nextDistance = Math.abs(points[i].t - state.nativeChartHover.t);
        if (nextDistance < distance) { nearest = points[i]; distance = nextDistance; }
      }
      showNativeChartHover(nearest);
    }
  });
}

function scheduleNativeChartRender() {
  renderNativeChart();
}

async function loadNativeChart(range = state.nativeChartRange, force = false) {
  if (!NATIVE_CHART_CONFIG[range]) range = 'd1';
  state.nativeChartRange = range;
  try { localStorage.setItem('inj_monitor_native_chart_range', range); } catch (_) {}
  renderNativeChartControls();

  const bounds = nativeChartPeriodBounds(range);
  const key = nativeChartCacheKey(range, bounds);
  const cache = state.nativeChartCache[key];
  const config = NATIVE_CHART_CONFIG[range];
  const cacheAge = range === 'h1' ? 30_000 : range === 'd1' ? 60_000 : 5 * 60_000;
  const requestId = ++state.nativeChart.requestId;

  if (!force && cache && Date.now() - cache.loadedAt < cacheAge) {
    state.nativeChart = {
      ...state.nativeChart,
      ...cache,
      points: cache.points.map((row) => ({ ...row })),
      liveSamples: [],
      live: state.price > 0 ? { t: Date.now(), price: state.price } : null,
      loading: false,
      requestId
    };
    renderNativeChart();
    return;
  }

  state.nativeChart.loading = true;
  setNativeChartPlaceholder('loading', 'Caricamento dati…');
  try {
    const result = await fetchNativeChartSeries(range, bounds);
    if (requestId !== state.nativeChart.requestId) return;
    state.nativeChartCache[key] = result;
    state.nativeChart = {
      ...state.nativeChart,
      ...result,
      points: result.points.map((row) => ({ ...row })),
      liveSamples: [],
      live: state.price > 0 ? { t: Date.now(), price: state.price } : null,
      loading: false,
      requestId
    };
    renderNativeChart();
  } catch (error) {
    if (requestId !== state.nativeChart.requestId) return;
    state.nativeChart.loading = false;
    setNativeChartPlaceholder('error', 'Storico non disponibile');
    console.error(error);
  }
}

function updateNativeChartLive(price) {
  const p = number(price);
  if (!(p > 0) || !isChartOpen()) return;
  const bounds = nativeChartPeriodBounds(state.nativeChartRange);
  if (state.nativeChart.start && state.nativeChart.start !== bounds.start) {
    loadNativeChart(state.nativeChartRange, true);
    return;
  }
  if (!(state.nativeChart.open > 0)) return;

  const now = Date.now();
  const config = NATIVE_CHART_CONFIG[state.nativeChartRange] || NATIVE_CHART_CONFIG.d1;
  const samples = state.nativeChart.liveSamples || (state.nativeChart.liveSamples = []);
  const lastSample = samples[samples.length - 1];
  if (!lastSample || now - lastSample.t >= config.sampleMs) samples.push({ t: now, price: p });
  if (samples.length > 800) samples.splice(0, samples.length - 800);
  state.nativeChart.live = { t: now, price: p };
  state.nativeChart.min = state.nativeChart.min > 0 ? Math.min(state.nativeChart.min, p) : p;
  state.nativeChart.max = Math.max(state.nativeChart.max, p);
  scheduleNativeChartRender();
}

function showNativeChartHover(point) {
  const host = $('nativeChartHost');
  const tooltip = $('nativeChartTooltip');
  const geometry = state.nativeChart.geometry;
  const group = document.getElementById('nativeChartHoverGroup');
  if (!host || !tooltip || !geometry || !group || !point) return;

  const { pad, bottomY, plotRight, width } = geometry;
  const x = Math.max(pad.l, Math.min(plotRight, point.x));
  const y = Math.max(pad.t, Math.min(bottomY, point.y));
  const perfClass = point.perf > 0 ? 'positive' : point.perf < 0 ? 'negative' : 'neutral';

  const v = document.getElementById('nativeChartHoverV');
  const h = document.getElementById('nativeChartHoverH');
  const dot = document.getElementById('nativeChartHoverDot');
  const priceChip = document.getElementById('nativeChartHoverPriceChip');
  const timeChip = document.getElementById('nativeChartHoverTimeChip');
  const priceText = document.getElementById('nativeChartHoverPriceText');
  const timeText = document.getElementById('nativeChartHoverTimeText');

  group.setAttribute('visibility', 'visible');
  v?.setAttribute('x1', x); v?.setAttribute('x2', x);
  v?.setAttribute('y1', pad.t); v?.setAttribute('y2', bottomY);
  h?.setAttribute('x1', pad.l); h?.setAttribute('x2', plotRight);
  h?.setAttribute('y1', y); h?.setAttribute('y2', y);

  if (dot) {
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('class', `native-chart-hover-dot ${perfClass}`);
  }

  if (priceText) priceText.textContent = nativeChartPrice(point.price);
  if (timeText) timeText.textContent = nativeChartDateLabel(point.t);

  const priceX = Math.max(pad.l + 4, plotRight - 70);
  const priceY = Math.max(pad.t + 2, Math.min(bottomY - 26, y - 12));
  priceChip?.setAttribute('transform', `translate(${priceX.toFixed(1)} ${priceY.toFixed(1)})`);

  const timeX = Math.max(pad.l, Math.min(plotRight - 72, x - 36));
  timeChip?.setAttribute('transform', `translate(${timeX.toFixed(1)} ${(bottomY + 5).toFixed(1)})`);

  tooltip.replaceChildren();
  const time = document.createElement('span');
  time.textContent = nativeChartDateLabel(point.t);
  const price = document.createElement('strong');
  price.textContent = nativeChartPrice(point.price);
  const perf = document.createElement('b');
  perf.textContent = `${point.perf >= 0 ? '+' : ''}${point.perf.toFixed(2)}%`;
  perf.className = perfClass;
  const label = document.createElement('small');
  label.textContent = 'vs apertura periodo';
  tooltip.append(time, price, perf, label);
  tooltip.hidden = false;

  const tipWidth = 148;
  const tipHeight = 82;
  const left = x > width * 0.62
    ? Math.max(8, x - tipWidth - 14)
    : Math.min(width - tipWidth - 8, x + 14);
  const top = Math.max(8, Math.min(geometry.height - tipHeight - 8, y - tipHeight / 2));
  tooltip.style.transform = `translate(${left}px, ${top}px)`;
}

function nativeChartTooltipAt(event) {
  const host = $('nativeChartHost');
  const points = state.nativeChart.renderPoints || [];
  if (!host || !points.length) return;

  const rect = host.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  if (!Number.isFinite(clientX)) return;
  const geometry = state.nativeChart.geometry;
  if (!geometry) return;
  const x = Math.max(geometry.pad.l, Math.min(geometry.plotRight, clientX - rect.left));

  let nearest = points[0];
  let distance = Math.abs(nearest.x - x);
  for (let i = 1; i < points.length; i += 1) {
    const nextDistance = Math.abs(points[i].x - x);
    if (nextDistance < distance) { nearest = points[i]; distance = nextDistance; }
  }

  state.nativeChartHover = { active: true, t: nearest.t };
  showNativeChartHover(nearest);
}

function hideNativeChartTooltip() {
  state.nativeChartHover = { active: false, t: 0 };
  const tooltip = $('nativeChartTooltip');
  if (tooltip) tooltip.hidden = true;
  document.getElementById('nativeChartHoverGroup')?.setAttribute('visibility', 'hidden');
}

function isChartOpen() {
  const dialog = $('chartDialog');
  return Boolean(dialog && !dialog.hidden && dialog.classList.contains('is-open'));
}

function syncChartViewport() {
  const dialog = $('chartDialog');
  if (!dialog) return;
  // v15.43: the chart is a fixed overlay instead of an HTML <dialog>.
  // Safari therefore cannot resize/center the modal to a partial viewport.
  const width = Math.max(280, Math.round(window.innerWidth || document.documentElement.clientWidth || 0));
  const height = Math.max(260, Math.round(window.innerHeight || document.documentElement.clientHeight || 0));
  dialog.dataset.orientation = width > height ? 'landscape' : 'portrait';
  if (isChartOpen()) requestAnimationFrame(renderNativeChart);
}

function openChartDialog() {
  setHeaderMenuOpen(false);
  setSearchOpen(false);
  const dialog = $('chartDialog');
  if (!dialog) return;
  dialog.hidden = false;
  dialog.classList.add('is-open');
  document.body.classList.add('chart-overlay-open');
  document.documentElement.classList.add('chart-overlay-open');
  syncChartViewport();
  requestAnimationFrame(() => {
    renderNativeChartControls();
    loadNativeChart(state.nativeChartRange, false);
    renderNativeChart();
    if (!state.nativeChartResizeObserver && window.ResizeObserver) {
      state.nativeChartResizeObserver = new ResizeObserver(() => renderNativeChart());
      if ($('nativeChartHost')) state.nativeChartResizeObserver.observe($('nativeChartHost'));
    }
  });
}

function closeChartDialog() {
  const dialog = $('chartDialog');
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.hidden = true;
  document.body.classList.remove('chart-overlay-open');
  document.documentElement.classList.remove('chart-overlay-open');
  hideNativeChartTooltip();
}

function setNativeChartRange(range) {
  if (!NATIVE_CHART_CONFIG[range] || range === state.nativeChartRange && state.nativeChart.open > 0) return;
  state.nativeChart.liveSamples = [];
  loadNativeChart(range, false);
}

function syncPrivacyUi(active) {
  document.body.classList.toggle('privacy-on', active);
  const label = active ? 'Mostra valori saldo' : 'Nascondi valori saldo';
  const title = active ? 'Mostra valori' : 'Nascondi valori';
  [$('privacyButton'), $('entryPrivacyButton')].filter(Boolean).forEach((button) => {
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', title);
  });
}

function togglePrivacy() {
  const active = !document.body.classList.contains('privacy-on');
  syncPrivacyUi(active);
  localStorage.setItem('inj_monitor_privacy', active ? '1' : '0');
}

function formatFreshAge(timestamp) {
  const age = Math.max(0, Date.now() - number(timestamp));
  if (age < 1500) return 'adesso';
  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m fa`;
}

function renderDataFreshness() {
  const badge = $('dataFreshness');
  const menu = $('menuDataFreshness');
  if (!badge || !menu) return;
  if (!navigator.onLine) {
    badge.textContent = 'OFFLINE';
    badge.className = 'data-freshness offline';
    menu.textContent = 'Offline';
    renderSystemStatus();
    if ($('entryGate')?.classList.contains('visible')) renderEntryOverview();
    return;
  }
  const timestamp = state.lastMarketUpdate || 0;
  if (!timestamp) {
    badge.textContent = 'LIVE · —';
    badge.className = 'data-freshness waiting';
    menu.textContent = 'In attesa dei dati live';
    renderSystemStatus();
    if ($('entryGate')?.classList.contains('visible')) renderEntryOverview();
    return;
  }
  const age = Date.now() - timestamp;
  const mode = age < 20_000 ? 'fresh' : age < 60_000 ? 'warn' : 'stale';
  const copy = formatFreshAge(timestamp);
  badge.textContent = `${mode === 'fresh' ? 'LIVE' : mode === 'warn' ? 'LENTO' : 'STALE'} · ${copy}`;
  badge.className = `data-freshness ${mode}`;
  menu.textContent = `Mercato ${copy}${state.lastWalletUpdate ? ` · wallet ${formatFreshAge(state.lastWalletUpdate)}` : ''}`;
  badge.title = `Ultimo dato mercato: ${copy}`;
  if ($('entryGate')?.classList.contains('visible')) renderEntryOverview();
  renderSystemStatus();
  if (isFocusDisplayActive() && $('focusDisplayClock')) $('focusDisplayClock').textContent = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  if (isPulseViewActive()) renderPulseView();
}

function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}

async function installPwa() {
  setHeaderMenuOpen(false);
  if (isStandaloneApp()) {
    toast('INJ Node è già installata');
    return;
  }
  const promptEvent = state.deferredInstallPrompt;
  if (promptEvent) {
    promptEvent.prompt();
    try { await promptEvent.userChoice; } catch (_) {}
    state.deferredInstallPrompt = null;
    updateInstallUi();
    return;
  }
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(isiOS ? 'Su iPhone: Condividi → Aggiungi a schermata Home' : 'Usa il menu del browser → Installa app');
}

function updateInstallUi() {
  const button = $('installAppMenuButton');
  const hint = $('installAppHint');
  if (!button || !hint) return;
  if (isStandaloneApp()) {
    button.classList.add('installed');
    hint.textContent = 'App installata sul dispositivo';
  } else {
    button.classList.remove('installed');
    hint.textContent = state.deferredInstallPrompt ? 'Installazione disponibile' : 'Aggiungi l’app al dispositivo';
  }
}

function registerPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=16.00.8').catch(() => {}), { once: true });
  }
  updateInstallUi();
}

function applyTheme(theme, notify = false) {
  const themes = {
    navy: { label: 'Aurora', color: '#03070b' },
    black: { label: 'Obsidian', color: '#030303' },
    light: { label: 'Chiaro', color: '#eef5ff' },
    amber: { label: 'Midnight Ember', color: '#070b11' }
  };
  const selected = themes[theme] ? theme : 'navy';
  document.documentElement.dataset.theme = selected;
  localStorage.setItem('inj_monitor_theme', selected);
  $('themeButton').dataset.theme = selected;
  $('themeButton').title = `Tema: ${themes[selected].label}`;
  $('themeButton').setAttribute('aria-label', `Tema attuale ${themes[selected].label}. Cambia tema`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--theme-canvas').trim() || themes[selected].color);
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    const active = button.dataset.themeChoice === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (isChartOpen()) requestAnimationFrame(renderNativeChart);
  if (notify) toast(`Tema ${themes[selected].label}`);
}

function setThemePickerOpen(open) {
  $('themeControl').classList.toggle('open', open);
  $('themeButton').setAttribute('aria-expanded', open ? 'true' : 'false');
}


const UI_STYLE_META = {
  elegant: { label: 'Elegant', description: 'Pulito · raffinato · minimale' },
  futuristic: { label: 'Futuristic', description: 'Glass · tech · luminoso' },
  ultra: { label: 'Ultra Premium', description: 'Profondo · luxury · high-end' }
};

function applyUiStyle(style, notify = false) {
  const selected = UI_STYLE_META[style] ? style : 'elegant';
  document.documentElement.dataset.uiStyle = selected;
  localStorage.setItem('inj_monitor_ui_style', selected);
  const label = $('uiStyleLabel');
  if (label) label.textContent = UI_STYLE_META[selected].label;
  $('uiStyleButton')?.setAttribute('aria-label', `Stile interfaccia attuale ${UI_STYLE_META[selected].label}. Cambia stile`);
  document.querySelectorAll('[data-ui-style-choice]').forEach((button) => {
    const active = button.dataset.uiStyleChoice === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (notify) toast(`Stile ${UI_STYLE_META[selected].label}`);
}

function setUiStylePickerOpen(open) {
  $('uiStyleControl')?.classList.toggle('open', open);
  $('uiStyleButton')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

let themeInteractionGuardUntil = 0;

function guardThemeInteraction(ms = 850) {
  themeInteractionGuardUntil = Math.max(themeInteractionGuardUntil, performance.now() + ms);
}

function toggleCurrency() {
  state.currency = state.currency === 'USD' ? 'EUR' : 'USD';
  if ($('currencyValue')) $('currencyValue').textContent = state.currency === 'EUR' ? '€' : '$';
  $('currencyButton').title = state.currency === 'EUR' ? 'Valori in euro' : 'Valori in dollari';
  localStorage.setItem('inj_monitor_currency', state.currency);
  renderAll();
}


// v15.98.23 — Mobile Fast Tap Engine.
// Modern iOS normally synthesizes click quickly, but a dense PWA with nested
// composited layers can still make controls feel hesitant. For coarse touch
// pointers we activate native <button> elements directly on pointerup when the
// finger has not moved, then suppress only the duplicate trusted click Safari
// may dispatch afterwards. Mouse, trackpad and keyboard semantics are untouched.
const mobileFastTap = {
  pointerId: null,
  button: null,
  startX: 0,
  startY: 0,
  moved: false,
  lastButton: null,
  lastAt: 0,
  lastX: 0,
  lastY: 0
};

function bindMobileFastTap() {
  const reset = () => {
    mobileFastTap.pointerId = null;
    mobileFastTap.button = null;
    mobileFastTap.moved = false;
  };

  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    const button = event.target?.closest?.('button:not(:disabled)');
    if (!button || !document.documentElement.contains(button)) return;
    mobileFastTap.pointerId = event.pointerId;
    mobileFastTap.button = button;
    mobileFastTap.startX = event.clientX;
    mobileFastTap.startY = event.clientY;
    mobileFastTap.moved = false;
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (event.pointerId !== mobileFastTap.pointerId || !mobileFastTap.button) return;
    const dx = event.clientX - mobileFastTap.startX;
    const dy = event.clientY - mobileFastTap.startY;
    if ((dx * dx) + (dy * dy) > 144) mobileFastTap.moved = true; // 12 px radius.
  }, { capture: true, passive: true });

  document.addEventListener('pointerup', (event) => {
    if (event.pointerId !== mobileFastTap.pointerId || !mobileFastTap.button) return;
    const button = mobileFastTap.button;
    const releasedOnSameButton = event.target?.closest?.('button') === button;
    const shouldActivate = !mobileFastTap.moved && releasedOnSameButton && !button.disabled && document.documentElement.contains(button);
    reset();
    if (!shouldActivate) return;

    mobileFastTap.lastButton = button;
    mobileFastTap.lastAt = performance.now();
    mobileFastTap.lastX = event.clientX;
    mobileFastTap.lastY = event.clientY;
    // Programmatic click keeps all existing app handlers/guards in one place,
    // but happens immediately on finger release instead of waiting on WebKit.
    button.click();
  }, true);

  document.addEventListener('pointercancel', (event) => {
    if (event.pointerId === mobileFastTap.pointerId) reset();
  }, true);

  document.addEventListener('click', (event) => {
    if (!event.isTrusted || !mobileFastTap.lastButton) return;
    const age = performance.now() - mobileFastTap.lastAt;
    if (age > 850) return;
    const button = event.target?.closest?.('button');
    const sameButton = button === mobileFastTap.lastButton;
    const dx = Number(event.clientX) - mobileFastTap.lastX;
    const dy = Number(event.clientY) - mobileFastTap.lastY;
    // iOS can retarget its delayed synthetic click after a theme picker closes.
    // Suppress that same physical tap even if the DOM underneath changed.
    const sameTapPoint = Number.isFinite(dx) && Number.isFinite(dy) && (dx * dx + dy * dy) <= 900;
    const themeRetargetRisk = mobileFastTap.lastButton?.matches?.('[data-theme-choice], [data-ui-style-choice]');
    if (!sameButton && !sameTapPoint && !themeRetargetRisk) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    mobileFastTap.lastButton = null;
  }, true);
}


// v15.99.57 — Treasury history reset from the Home Control Center.
const TREASURY_GROWTH_HISTORY_KEY = 'inj_node_treasury_growth_v1';
const TREASURY_WORTH_HISTORY_KEY = 'inj_node_treasury_worth_growth_v1';
const TREASURY_PERSISTENCE_DB = 'inj_node_treasury_persistence_v1';
const TREASURY_PERSISTENCE_STORE = 'timelines';

function clearTreasuryIndexedHistory() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve();
    let request;
    try { request = indexedDB.open(TREASURY_PERSISTENCE_DB, 1); } catch (_) { return resolve(); }
    request.onupgradeneeded = () => {
      try {
        const db = request.result;
        if (!db.objectStoreNames.contains(TREASURY_PERSISTENCE_STORE)) db.createObjectStore(TREASURY_PERSISTENCE_STORE, { keyPath: 'key' });
      } catch (_) {}
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(TREASURY_PERSISTENCE_STORE, 'readwrite');
        const store = tx.objectStore(TREASURY_PERSISTENCE_STORE);
        store.delete(TREASURY_GROWTH_HISTORY_KEY);
        store.delete(TREASURY_WORTH_HISTORY_KEY);
        tx.oncomplete = () => { try { db.close(); } catch (_) {} resolve(); };
        tx.onerror = tx.onabort = () => { try { db.close(); } catch (_) {} resolve(); };
      } catch (_) { try { db.close(); } catch (_) {} resolve(); }
    };
  });
}

async function resetTreasuryChartsHistory() {
  const accepted = window.confirm('Azzerare lo storico di Crescita Treasury e Andamento patrimonio? I grafici ripartiranno dai prossimi dati reali.');
  if (!accepted) return;
  try {
    localStorage.removeItem(TREASURY_GROWTH_HISTORY_KEY);
    localStorage.removeItem(TREASURY_WORTH_HISTORY_KEY);
  } catch (_) {}
  await clearTreasuryIndexedHistory();
  setHeaderMenuOpen(false);
  toast('Grafici Treasury azzerati');
}

function bindEvents() {
  bindMobileFastTap();
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    updateInstallUi();
  });
  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    updateInstallUi();
    toast('INJ Node installata');
  });
  $('entryOnboardingForm')?.addEventListener('submit', submitFirstWallet);
  const clearEntryWalletError = () => {
    if ($('entryWalletStatus')?.classList.contains('error')) {
      setEntryOnboardingStatus('Puoi scegliere un nome riconoscibile. L’indirizzo resta salvato solo su questo dispositivo.');
    }
  };
  $('entryWalletInput')?.addEventListener('input', clearEntryWalletError);
  $('entryWalletName')?.addEventListener('input', clearEntryWalletError);
  bindEntrySparkInteraction();
  bindEntryOverviewWalletGestures();
  bindEntryConverter();
  $('addressForm').addEventListener('submit', (event) => {
    event.preventDefault();
    loadWallet(true, $('addressInput').value, $('walletNameInput')?.value || '');
  });
  $('entryMenuButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.currentView !== 'home' || performance.now() < themeInteractionGuardUntil) return;
    const open = !$('headerMenu')?.classList.contains('open');
    if (open) {
      setSearchOpen(false);
      renderMenuWalletContext();
      renderAveragePriceControl();
    }
    setHeaderMenuOpen(open);
  });
  $('menuCloseButton')?.addEventListener('click', () => setHeaderMenuOpen(false));
  $('headerMenuBackdrop')?.addEventListener('click', () => setHeaderMenuOpen(false));
  $('searchButton').addEventListener('click', () => setSearchOpen(!$('headerSearch').classList.contains('open')));
  const dashboardHeaderActions = $('dashboardHeaderActions');
  ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((type) => {
    dashboardHeaderActions?.addEventListener(type, (event) => event.stopPropagation(), type === 'touchstart' ? { passive: true } : false);
  });
  bindDashboardHomeLauncher();
  $('installAppMenuButton')?.addEventListener('click', installPwa);
  $('treasuryResetMenuButton')?.addEventListener('click', resetTreasuryChartsHistory);
  $('systemStatusMenuButton')?.addEventListener('click', openSystemStatus);
  $('entrySystemStatusButton')?.addEventListener('click', openSystemStatus);
  $('focusDisplaySystemButton')?.addEventListener('click', openSystemStatus);
  $('closeSystemStatusButton')?.addEventListener('click', closeSystemStatus);
  $('systemStatusRefreshButton')?.addEventListener('click', async () => { renderSystemStatus(); await Promise.allSettled([loadMarket(), state.address ? loadWallet(false, state.address) : Promise.resolve()]); renderSystemStatus(); });
  $('systemStatusDialog')?.addEventListener('click', (event) => { if (event.target === $('systemStatusDialog')) closeSystemStatus(); });
  $('manageWalletsMenuButton').addEventListener('click', () => {
    setHeaderMenuOpen(false);
    openWalletManager();
  });
  $('closeWalletDialog').addEventListener('click', () => $('walletDialog').close());
  $('refreshMenuButton').addEventListener('click', async () => {
    setHeaderMenuOpen(false);
    await refreshAll(true);
  });
  bindEntryLauncher('entryDashboardButton', enterDashboardFromGate);
  bindEntryLauncher('entryLiveButton', enterLiveViewFromGate);
  bindEntryLauncher('entryPulseButton', enterPulseViewFromGate);
  bindEntryLauncher('entryLiveChartsButton', enterLiveChartsFromGate);
  bindEntryLauncher('entryOrderBookButton', enterOrderBookFromGate);
  bindEntryLauncher('entryPerformanceButton', enterPerformanceTimelineFromGate);
  bindEntryLauncher('entryConverterButton', enterConverterFromGate);
  bindCommandCenterLauncher();
  $('closePerformanceTimelineButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePerformanceTimelineToHome();
  });
  $('closeConverterButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeConverterToHome();
  });
  document.addEventListener('click', (event) => {
    if (Date.now() >= Number(state.modeExitLockUntil || 0)) return;
    if (!event.target?.closest?.('#entryDashboardButton, #entryLiveButton, #entryPulseButton, #entryLiveChartsButton, #entryOrderBookButton, #entryPerformanceButton, #entryCommandCenterButton')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  const closeImmersiveToHome = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    goHome('immersive-close');
  };
  $('closeFocusDisplayButton')?.addEventListener('click', closeImmersiveToHome);
  $('closePulseViewButton')?.addEventListener('click', closeImmersiveToHome);
  $('closeLiveChartsButton')?.addEventListener('click', closeImmersiveToHome);
  $('focusDisplayDialog')?.addEventListener('pointermove', showFocusControls, { passive: true });
  $('focusDisplayDialog')?.addEventListener('pointerdown', showFocusControls, { passive: true });
  $('focusDisplayDialog')?.addEventListener('touchstart', showFocusControls, { passive: true });
  $('pulseViewDialog')?.addEventListener('pointermove', showPulseControls, { passive: true });
  $('pulseViewDialog')?.addEventListener('pointerdown', showPulseControls, { passive: true });
  $('pulseViewDialog')?.addEventListener('touchstart', showPulseControls, { passive: true });
  $('chartButton').addEventListener('click', openChartDialog);
  $('closeChartButton')?.addEventListener('click', closeChartDialog);
  $('chartDialog')?.addEventListener('click', (event) => { if (event.target === $('chartDialog')) closeChartDialog(); });
  document.querySelectorAll('[data-native-chart-range]').forEach((button) => {
    button.addEventListener('click', () => setNativeChartRange(button.dataset.nativeChartRange));
  });
  $('nativeChartHost')?.addEventListener('pointermove', nativeChartTooltipAt);
  $('nativeChartHost')?.addEventListener('pointerdown', nativeChartTooltipAt);
  $('nativeChartHost')?.addEventListener('pointerleave', hideNativeChartTooltip);
  $('nativeChartHost')?.addEventListener('pointerup', hideNativeChartTooltip);
  $('nativeChartHost')?.addEventListener('pointercancel', hideNativeChartTooltip);
  window.addEventListener('resize', () => { syncChartViewport(); syncFocusDisplayViewport(); scheduleLiveChartsRender(true); syncHomeCommandCenter(); }, { passive: true });
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => { syncChartViewport(); syncFocusDisplayViewport(); scheduleLiveChartsRender(true); syncHomeCommandCenter(); });
    setTimeout(() => { syncChartViewport(); syncFocusDisplayViewport(); syncHomeCommandCenter(); }, 180);
  }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { syncChartViewport(); syncFocusDisplayViewport(); }, { passive: true });
  window.visualViewport?.addEventListener('scroll', () => { syncChartViewport(); syncFocusDisplayViewport(); }, { passive: true });
  $('averageBuyPrice').addEventListener('input', () => {
    const settingsAddress = currentSettingsWalletAddress();
    if (!settingsAddress) return;
    const value = Math.max(0, number($('averageBuyPrice').value));
    if (value > 0) state.averagePriceByWallet[settingsAddress] = value;
    else delete state.averagePriceByWallet[settingsAddress];
    renderPortfolio();
  });
  $('averageBuyPrice').addEventListener('change', saveAveragePrices);
  $('aggregateSection').addEventListener('click', toggleAggregate);
  $('aggregateSection').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAggregate();
    }
  });
  $('marketTimeframeToggle').addEventListener('click', () => toggleTimeframes('market'));
  $('rewardTrackerToggle').addEventListener('click', () => toggleTracker('reward'));
  $('targetTrackerToggle').addEventListener('click', () => toggleTracker('target'));
  $('overviewSectionToggle')?.addEventListener('click', () => toggleDashboardSection('overview'));
  $('walletSectionToggle')?.addEventListener('click', () => toggleDashboardSection('wallet'));
  $('stakingSectionToggle')?.addEventListener('click', () => toggleDashboardSection('staking'));
  $('walletGoalsToggle')?.addEventListener('click', () => toggleDashboardSection('goals'));
  $('validatorToggle')?.addEventListener('click', () => toggleDashboardSection('validators'));
  $('marketMatrixToggle')?.addEventListener('click', () => toggleDashboardSection('matrix'));
  $('rewardSimPrice').addEventListener('input', () => {
    state.rewardSimulationPrice = Math.max(0, number($('rewardSimPrice').value));
    renderRewardTracker();
  });
  $('rewardSimPrice').addEventListener('focus', () => {
    requestAnimationFrame(() => $('rewardSimPrice').select());
  });
  $('targetInput').addEventListener('input', () => {
    // Immediate visual feedback while the user is still typing. Persistence is
    // committed on change so partial values do not overwrite the wallet target.
    renderTarget();
  });
  $('targetInput').addEventListener('change', () => {
    if (!state.address) return;
    const typed = number($('targetInput').value);
    const target = typed > 0 ? Math.max(0.001, typed) : activeTarget();
    state.targetByWallet[state.address] = target;
    saveTargets();
    renderTarget();
  });
  $('privacyButton').addEventListener('click', togglePrivacy);
  $('entryPrivacyButton')?.addEventListener('click', togglePrivacy);
  $('themeButton').addEventListener('pointerdown', () => guardThemeInteraction(), { passive: true });
  $('themeButton').addEventListener('click', (event) => {
    event.stopPropagation();
    guardThemeInteraction();
    const open = !$('themeControl').classList.contains('open');
    if (open) {
      setSearchOpen(false);
      setUiStylePickerOpen(false);
    }
    setThemePickerOpen(open);
  });
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('pointerdown', () => guardThemeInteraction(950), { passive: true });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      guardThemeInteraction(950);
      const currencyBeforeTheme = state.currency;
      applyTheme(button.dataset.themeChoice, true);
      // Theme is presentation-only. Explicitly preserve the selected currency.
      state.currency = currencyBeforeTheme;
      setThemePickerOpen(false);
    });
  });
  $('uiStyleButton')?.addEventListener('pointerdown', () => guardThemeInteraction(), { passive: true });
  $('uiStyleButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    guardThemeInteraction();
    const open = !$('uiStyleControl')?.classList.contains('open');
    if (open) {
      setSearchOpen(false);
      setThemePickerOpen(false);
    }
    setUiStylePickerOpen(open);
  });
  document.querySelectorAll('[data-ui-style-choice]').forEach((button) => {
    button.addEventListener('pointerdown', () => guardThemeInteraction(850), { passive: true });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      guardThemeInteraction(850);
      applyUiStyle(button.dataset.uiStyleChoice, true);
      setUiStylePickerOpen(false);
    });
  });
  $('currencyButton').addEventListener('click', (event) => {
    if (performance.now() < themeInteractionGuardUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    toggleCurrency();
  });
  document.addEventListener('pointerdown', (event) => {
    if ($('headerSearch').classList.contains('open') && !$('headerSearch').contains(event.target)) setSearchOpen(false);
    if ($('headerMenu').classList.contains('open') && !$('headerMenu').contains(event.target)) setHeaderMenuOpen(false);
    if ($('themeControl').classList.contains('open') && !$('themeControl').contains(event.target)) setThemePickerOpen(false);
    if (state.rewardSimulationPrice > 0 && !$('yieldCard').contains(event.target)) clearRewardSimulation();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isConverterActive()) { closeConverterToHome(); return; }
    if (event.key === 'Escape' && isPerformanceTimelineActive()) { closePerformanceTimelineToHome(); return; }
    if (event.key === 'Escape' && $('systemStatusDialog')?.open) closeSystemStatus();
    if (event.key === 'Escape' && $('headerSearch').classList.contains('open')) setSearchOpen(false);
    if (event.key === 'Escape' && $('headerMenu').classList.contains('open')) setHeaderMenuOpen(false);
    if (event.key === 'Escape' && $('themeControl').classList.contains('open')) setThemePickerOpen(false);
    if (event.key === 'Escape' && $('uiStyleControl')?.classList.contains('open')) setUiStylePickerOpen(false);
    if (event.key === 'Escape' && state.rewardSimulationPrice > 0) clearRewardSimulation();
    if (event.key === 'Escape' && isChartOpen()) closeChartDialog();
    if (event.key === 'Escape' && isFocusDisplayActive()) goHome('immersive-keyboard');
    if (event.key === 'Escape' && isPulseViewActive()) goHome('immersive-keyboard');
    if (event.key === 'Escape' && isLiveChartsActive()) goHome('immersive-keyboard');
  });
  window.addEventListener('online', () => { renderDataFreshness(); refreshAll(false); });
  window.addEventListener('offline', () => { setStatus('offline', 'Offline'); renderDataFreshness(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      try { state.socket?.close(); } catch (_) {}
      return;
    }
    if (isLiveChartsActive()) void loadLiveChartsHistory(true);
    connectMarketSocket();
    refreshAll(false);
    void loadEntryMarketMatrixAnchors(false);
  });
}


// v15.98.102 — Dashboard navigation is now section-native: macro headings collapse in place.

function bindUniversalPageWheelScroll() {
  if (window.__injUniversalWheelBound) return;
  window.__injUniversalWheelBound = true;
  document.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaY) < 0.01) return;
    if (document.body.classList.contains('chart-overlay-open') || document.body.classList.contains('pulse-view-open') || document.body.classList.contains('focus-display-open')) return;
    const target = event.target instanceof Element ? event.target : null;
    const nested = target?.closest?.('.wallet-manager-list, .header-menu-panel, .search-panel, .entry-wallets, .wallet-mini-strip, .chart-controls');
    if (nested && nested.scrollHeight > nested.clientHeight + 1) {
      const canUp = nested.scrollTop > 0;
      const canDown = nested.scrollTop + nested.clientHeight < nested.scrollHeight - 1;
      if ((event.deltaY < 0 && canUp) || (event.deltaY > 0 && canDown)) return;
    }
    const scroller = document.scrollingElement || document.documentElement;
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return;
    const before = scroller.scrollTop;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const next = Math.max(0, Math.min(max, before + event.deltaY));
    if (Math.abs(next - before) > 0.1) {
      event.preventDefault();
      scroller.scrollTop = next;
    }
  }, { passive: false, capture: true });
}


function syncPublicSiteReturnLink() {
  const link = $('entryPublicSiteLink');
  if (!link) return;
  let returnUrl = '';
  try {
    const current = new URL(window.location.href);
    const candidate = current.searchParams.get('publicReturn');
    if (candidate) {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        parsed.hash = '';
        returnUrl = parsed.toString();
        localStorage.setItem('inj_node_public_site_url', returnUrl);
      }
    }
  } catch (_) {}
  if (!returnUrl) {
    try {
      const saved = localStorage.getItem('inj_node_public_site_url') || '';
      if (saved) {
        const parsed = new URL(saved);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') returnUrl = parsed.toString();
      }
    } catch (_) {}
  }
  if (!returnUrl) {
    link.hidden = true;
    link.removeAttribute('href');
    return;
  }
  link.href = returnUrl;
  link.hidden = false;
}

async function init() {
  bindUniversalPageWheelScroll();
  try {
    state.currency = localStorage.getItem('inj_monitor_currency') === 'EUR' ? 'EUR' : 'USD';
    localStorage.removeItem('inj_monitor_card_style');
    state.nativeChartRange = ['h1', 'd1', 'w1', 'm1', 'y1'].includes(localStorage.getItem('inj_monitor_native_chart_range'))
      ? localStorage.getItem('inj_monitor_native_chart_range')
      : 'd1';
    if ($('currencyValue')) $('currencyValue').textContent = state.currency === 'EUR' ? '€' : '$';
    syncPrivacyUi(localStorage.getItem('inj_monitor_privacy') === '1');
    loadSavedWallets();
    state.entrySelectedAddress = state.wallets.find((wallet) => wallet.address === (localStorage.getItem('inj_monitor_address') || ''))?.address || state.wallets[0]?.address || '';
    loadTargetStorage();
    loadAveragePriceStorage();
    loadMarketFrameCache();
    const savedAddress = localStorage.getItem('inj_monitor_address') || '';
    const initialWallet = state.wallets.find((item) => item.address === savedAddress) || state.wallets[0];
    if (initialWallet) state.address = initialWallet.address;
    $('addressInput').value = state.address;
  } catch (_) {}

  syncPublicSiteReturnLink();
  bindEvents();
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('command-center') === 'pc-only') {
      window.setTimeout(() => commandCenterUnavailableNotice(), 80);
      url.searchParams.delete('command-center');
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch (_) {}
  registerPwa();
  document.body.classList.add('market-data-loading');
  if (state.address && !state.walletSummaries[state.address]?.updated) setWalletSkeleton(true);
  applyTheme(document.documentElement.dataset.theme);
  applyUiStyle(document.documentElement.dataset.uiStyle || localStorage.getItem('inj_monitor_ui_style') || 'elegant');
  setTimeframeCollapsed('market', timeframeCollapsedPreference('market'), false);
  setTrackerCollapsed('reward', trackerCollapsedPreference('reward'), false);
  setTrackerCollapsed('target', trackerCollapsedPreference('target'), false);
  setDashboardCollapsed('overview', dashboardCollapsedPreference('overview'), false);
  setDashboardCollapsed('wallet', dashboardCollapsedPreference('wallet'), false);
  setDashboardCollapsed('staking', dashboardCollapsedPreference('staking'), false);
  setDashboardCollapsed('goals', dashboardCollapsedPreference('goals'), false);
  setDashboardCollapsed('validators', dashboardCollapsedPreference('validators'), false);
  setDashboardCollapsed('matrix', dashboardCollapsedPreference('matrix'), false);
  renderAll();
  renderWalletControls();
  loadEurRate();
  await loadMarket();
  void loadEntryMarketMatrixAnchors(true);
  loadMarketTimeframes(false);
  connectMarketSocket();
  if (state.address) await loadWallet(false, state.address);
  if (state.wallets.length) await refreshWalletSummaries(true);
  state.suppressEffects = false;

  // v15.98.28 — Mobile scheduling keeps live data responsive while avoiding
  // duplicate network/DOM work that would otherwise keep iPhone CPU/GPU awake.
  setInterval(() => {
    if (!document.hidden && (!state.socket || state.socket.readyState !== WebSocket.OPEN)) loadMarket();
  }, 60_000);
  setInterval(() => { if (!document.hidden) loadMarketTimeframes(false); }, 15 * 60_000);
  setInterval(() => { if (!document.hidden) void loadEntryMarketMatrixAnchors(false); }, 2 * 60_000);
  const summaryEvery = MOBILE_EFFICIENCY ? 60_000 : 30_000;
  setTimeout(() => {
    if (!document.hidden) refreshWalletSummaries(false);
    setInterval(() => {
      if (!document.hidden) refreshWalletSummaries(false);
    }, summaryEvery);
  }, 15_000);
  setInterval(() => {
    if (!document.hidden && state.currentView === 'dashboard') renderWalletCards();
  }, MOBILE_EFFICIENCY ? 30_000 : 10_000);
  setInterval(() => { if (!document.hidden) renderDataFreshness(); }, MOBILE_EFFICIENCY ? 3_000 : 1_000);
  // Target Tracker runs as a lightweight live instrument between wallet reads.
  setInterval(() => {
    if (!document.hidden && state.currentView === 'dashboard' && state.address && !$('targetCard')?.classList.contains('tracker-collapsed')) {
      renderTarget();
    }
  }, 1_000);
  renderDataFreshness();
  renderSystemStatus();
  renderFocusAmbient();
  setInterval(() => {
    if (state.address && !document.hidden && !state.loading && ['dashboard','live','pulse','performance'].includes(state.currentView)) loadWallet(false, state.address);
  }, MOBILE_EFFICIENCY ? 45_000 : 30_000);
}

// Document and nested scroll boundaries are handled by viewport.js.

scheduleBootSplashExit();
init();

// v15.37 — INJ Node rebrand. Existing inj_monitor_* localStorage keys intentionally preserved for upgrade compatibility.

// v15.38 — Uniform INJ precision: all INJ amounts display exactly 4 decimal places.

// v15.40 — PWA, Home gate, skeleton loading, data freshness, Live View auto-hide controls, smart reward milestones and INJ Node symbol.

// v15.47 — refined Home, richer Live View, System Status, micro-motion and orbital INJ Node brand.

// v15.48 — Live View top-bar spacing fix + horizontal wallet rail on Entry Home.

// v15.49 — Live View landscape centering + dedicated Pulse View with central-axis performance candles.

// v15.50 — Pulse View candle palette follows Aurora, Obsidian and Light themes.
// v15.55 — Pulse View uses Daily P/L in currency instead of Holdings. PRICE and P/L keep independent visual scales.

// v15.55 — Pulse Extreme Trails: reversal ghosts, persistent H/L markers and ATH/ATL flashes.

// v15.57 — Live View and Pulse View are entry-menu destinations only; exiting either mode returns to the entry gate, never directly to Dashboard.

// v15.57 — Pulse View: sign-correct ghost extremes, side live tracker with direction arc, separate mini day charts.
// v15.58 — Pulse extremes are regime-aware: ATH only above zero, ATL only below zero; crossing preserves the opposite-side ghost and its reached value.

// v15.59 — Live/Pulse use a single close control; exit fades smoothly back to the entry menu with no Dashboard flash.

// v15.64 — Persistent Home underlay: Entry Gate never leaves the compositor while Live/Pulse is open, eliminating the iOS black detach frame.

// v15.65 — Home hierarchy: compact account selector on top, preserved account preview, divider and equal stacked mode launchers.

// v15.67 — Home title restored; wallet rename stays inside each rail card; horizontal wallet swipes update the account preview live.

// v15.68 — Native/PWA icon refresh: opaque INJ Node artwork, new iOS apple-touch-icon URL and cache-busted manifest assets.

// v15.69 — iOS exit navigation lock: prevents delayed/synthetic taps from reopening Live View or Pulse View after returning Home.

// v15.70 — fixed malformed CSS newline block; explicit navigation state; Home launchers require a fresh originating gesture.

// v15.71 — header action isolation + explicit Dashboard Home intent + compositor-safe opaque page handoffs.

// v15.72 — Home launcher block anchored to the bottom; application logic unchanged.
// v15.73 — Home At a Glance: live 24H sparkline, net APR, daily reward, wallet P/L and +1 INJ milestone.

// v15.74 — Home Control Center moved to top-left; Dashboard gets direct Home icon; PRICE card is a local-day autoscaling chart with live wallet P/L.

// v15.75 — Desktop Home grid: aligned two-column layout with supplementary wallet metrics and no internal dead zones.

// v15.80 — Immersive desktop Home: viewport-filling responsive grid for fullscreen/large monitors.

// v15.80 — edge-to-edge mobile Home/Control Center; no outer shell frame or transformed fixed-menu containing block.

// v15.81 — persistent mobile PRICE label + adaptive left drawer Control Center with blurred backdrop.


// v15.83 — Mobile Home PRICE taller plot, transient touch probe and protected autoscaling.

// v15.84 — Home wallet privacy eye synced with the global privacy state.


// v15.85 — Home spark inspector is strictly transient: iOS/global release safety added.


// v15.89 — Home wallet rail adds side peeks + pagination while preserving finger tracking and one-account flick navigation.

// v15.90 — Side-wallet taps now commit persistently; programmatic centering is isolated from gesture snap-back.
// v15.91 — Unified wallet carousel compositor path; removed legacy duplicate slide engine and isolated incoming card paint to eliminate iOS value fragments.
// v15.92 — Fixed mobile transform pinning/malformed CSS so old and incoming wallet cards slide as whole layers without duplicated values.
// v15.95 — Replaced clone-on-shell wallet motion with one clipped three-slot compositor shared by mobile and wide desktop.

// v15.95 smooth interaction guards
(() => {
  const syncDrawerLock = () => {
    document.documentElement.classList.toggle('drawer-open', document.body.classList.contains('drawer-open'));
  };
  const observer = new MutationObserver(syncDrawerLock);
  observer.observe(document.body, {attributes:true, attributeFilter:['class']});
  syncDrawerLock();
})();


// v15.98.17 — Home wallet countervalue switch is geometry-stable: no cross-wallet odometer jump; same-wallet live price rolls remain.

// v15.98.27 — Midnight Ember: cool graphite nocturnal theme shared by Home, Dashboard, Live View and Pulse View, with restrained champagne/copper edge light.
// v15.98.28 — Mobile Fluid: card-swipe wallet switching, safe theme taps, reliable page scrolling and adaptive low-power scheduling.

// v15.98.29 — iOS wallet-search focus guard prevents Safari input auto-zoom and releases focus when the search panel closes.


// v15.98.34 — Three persistent interface styles share all four color themes without continuous decorative animation.


// v15.98.38 — Live View 10M continuous scale: the ribbon never hard-resets, drifts continuously while Live View is open and exposes a dynamic right-edge price scale.

// v15.98.39 — Live Charts moved out of Live View into a dedicated Home destination with vertically stacked 5m/10m/1h continuous charts and readable adaptive price scales.
// v15.98.40 — Stability fix: Live Charts opens before heavy work, dot/price marker render independently from path rebuilds, and mobile sample/path density is reduced.

// v15.98.41 — Live Charts Safe Engine removes permanent animation loops and eager session-history parsing; chart work runs only in short bounded bursts.

// v15.98.43 — Live Charts now runs on an isolated Canvas page to protect the main application thread.


// v15.98.62 — resume the shared visual price clock after iOS/browser visibility suspension.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.marketMotionFrame) cancelAnimationFrame(state.marketMotionFrame);
    state.marketMotionFrame = 0;
    state.marketMotionLastFrame = 0;
    return;
  }
  if ((state.marketTargetPrice > 0 || state.marketRawPrice > 0) && !state.marketMotionFrame) startGlobalMarketMotion(900);
});

// v15.98.67 — Home Market Matrix adds live multi-timeframe momentum consensus without opening another socket.

// v15.98.79 — Order Book isolated from Live Charts; dedicated Home destination.
// Freeze only transient realtime work while Home is in browser history; keep all
// wallet/UI state in memory so history.back() can reveal Home immediately.
window.addEventListener('pagehide', () => {
  try { state.socket?.close(); } catch (_) {}
  if (state.marketMotionFrame) cancelAnimationFrame(state.marketMotionFrame);
  state.marketMotionFrame = 0;
  state.marketMotionLastFrame = 0;
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  requestAnimationFrame(() => {
    try { connectMarketSocket(); } catch (_) {}
    if ((state.marketTargetPrice > 0 || state.marketRawPrice > 0) && !state.marketMotionFrame) {
      try { startGlobalMarketMotion(700); } catch (_) {}
    }
    window.setTimeout(() => {
      try { refreshAll(false); } catch (_) {}
      try { loadEntryMarketMatrixAnchors(false); } catch (_) {}
    }, 180);
  });
});

// v15.99.4 — Home P/L Timeline: persistent 24H candles + viewport-based Y autoscaling and historical horizontal scroll.

// v15.99.8 — Fix Performance Timeline stacking/data hydration + restore immersive desktop Home/fullscreen launcher visibility.

// v15.99.9 — Command Centre readable wall redesign + midnight-to-midnight Performance Timeline session logic.

// v15.99.12 — Reward ladder in Dashboard now follows selected wallet's live unclaimed rewards.

// v15.99.20 — Home INJ Converter (EUR ↔ USD ↔ INJ) + live valuation under Totale posseduto.
// v15.99.21 — INJ Converter moved from Home into its own dedicated section after Performance Timeline.
// v15.99.22 — Dashboard: native Circle USDC on Injective appears under Disponibile only when the selected wallet holds a positive balance.

// v15.99.24 — Performance Timeline Light: minimal proportional bars, 14-day summary/best day, on-demand tooltips and 2s timeline-only live paint throttle.


// v15.99.35 — Treasury is fully isolated in treasury.html / treasury.css / treasury.js.

// v15.99.51 — Performance Timeline: compact vertical histogram candles + optional P/L $/% metric and EMA 7/21 momentum overlay with crossover markers.
