/* INJ Node v15.99.80 — one viewport measurement for every full-page surface. */
(() => {
  'use strict';
  const root = document.documentElement;
  let frame = 0;
  let probe;
  let lastHeight = 0;
  let lastScroll = -1;
  const editable = () => document.activeElement?.matches('input,textarea,[contenteditable="true"]');

  function measure() {
    frame = 0;
    const scroll = Math.max(0, window.scrollY || 0);
    if (scroll !== lastScroll) { root.style.setProperty('--inj-document-top', scroll + 'px'); lastScroll = scroll; }
    if (!probe && document.body) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100dvh;visibility:hidden;pointer-events:none;contain:strict;';
      document.body.appendChild(probe);
    }
    const visual = window.visualViewport;
    // A software keyboard reduces the usable area; pinch zoom must remain native.
    if (visual && Math.abs(visual.scale - 1) > 0.02) return;
    const keyboard = editable() && visual && visual.height < window.innerHeight * 0.8;
    const cssHeight = probe?.getBoundingClientRect().height || 0;
    const height = Math.ceil(keyboard ? visual.height : Math.max(window.innerHeight || 0, cssHeight, visual?.height || 0));
    if (height > 0 && height !== lastHeight) {
      root.style.setProperty('--inj-viewport-height', height + 'px');
      lastHeight = height;
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure);
  }
  function syncTheme() {
    const css = getComputedStyle(root);
    const color = (css.getPropertyValue('--canvas') || css.getPropertyValue('--theme-canvas') || css.getPropertyValue('--bg')).trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }

  // Only reject an outward gesture at a real boundary. Never move scrollTop:
  // rewriting the position here causes the visible one-pixel snap on release.
  let gesture = null;
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    gesture = { target: event.target, x: touch.clientX, y: touch.clientY, lastY: touch.clientY };
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 1 || event.defaultPrevented) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    const step = touch.clientY - gesture.lastY;
    gesture.lastY = touch.clientY;
    if (Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) < 4 || Math.abs(step) < 0.2) return;
    if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.02) return;
    const documentScroller = document.scrollingElement || root;
    let node = gesture.target instanceof Element ? gesture.target : gesture.target?.parentElement;
    while (node && node !== documentScroller) {
      const css = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        const end = node.scrollHeight - node.clientHeight;
        if ((step > 0 && node.scrollTop > 1) || (step < 0 && node.scrollTop < end - 1)) return;
        // A nested panel owns its scroll: don't hand the gesture to Home behind it.
        if (event.cancelable) event.preventDefault();
        return;
      }
      node = node.parentElement;
    }
    if (getComputedStyle(root).overflowY === 'hidden') {
      if (event.cancelable) event.preventDefault();
      return;
    }
    const end = Math.max(0, documentScroller.scrollHeight - documentScroller.clientHeight);
    if ((step > 0 && documentScroller.scrollTop <= 1) ||
        (step < 0 && documentScroller.scrollTop >= end - 1)) {
      if (event.cancelable) event.preventDefault();
    }
  }, { passive: false });
  const releaseGesture = () => { gesture = null; };
  document.addEventListener('touchend', releaseGesture, { passive: true });
  document.addEventListener('touchcancel', releaseGesture, { passive: true });

  root.dataset.injViewport = '80';
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', () => { schedule(); syncTheme(); });
  window.addEventListener('orientationchange', () => { schedule(); setTimeout(schedule, 250); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  document.addEventListener('focusout', () => setTimeout(schedule, 250));
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { measure(); syncTheme(); }, { once: true });
  else { measure(); syncTheme(); }
})();
