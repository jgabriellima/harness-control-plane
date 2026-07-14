/**
 * Deck postMessage bridge for sandboxed iframe previews.
 * Adapted from nexu-io/open-design apps/web/src/runtime/srcdoc.ts (Apache-2.0).
 */

function injectBeforeHeadEnd(doc: string, injection: string): string {
  const match = doc.match(/<\/head>/i);
  if (!match || match.index === undefined) {
    return `${doc}\n${injection}`;
  }
  const index = match.index;
  return `${doc.slice(0, index)}${injection}${doc.slice(index)}`;
}

function injectBeforeBodyEnd(doc: string, injection: string): string {
  const match = doc.match(/<\/body>/i);
  if (!match || match.index === undefined) {
    return `${doc}\n${injection}`;
  }
  const index = match.index;
  return `${doc.slice(0, index)}${injection}${doc.slice(index)}`;
}

function detectArtifactKeyboardNavigation(artifactHtml: string): boolean {
  const registersKeydown =
    /addEventListener\s*\(\s*['"]keydown['"]/i.test(artifactHtml) ||
    /\bonkeydown\b/i.test(artifactHtml);
  if (!registersKeydown) {
    return false;
  }
  return /\bArrow(?:Right|Left)\b|\bPage(?:Up|Down)\b|\bkeyCode\b/.test(artifactHtml);
}

/** Inject deck navigation bridge and stage centering fix into an HTML document. */
export function injectDesignDeckBridge(
  doc: string,
  options: {
    initialSlideIndex?: number;
    clickNavigation?: boolean;
    artifactHasKeydownNavigation?: boolean;
  } = {},
): string {
  const initialSlideIndex = options.initialSlideIndex ?? 0;
  const safeInitialSlideIndex = Number.isFinite(initialSlideIndex)
    ? Math.max(0, Math.floor(initialSlideIndex))
    : 0;
  const hasInlineKeydownListener =
    options.artifactHasKeydownNavigation ?? detectArtifactKeyboardNavigation(doc);
  const isFrameworkDeck = /\bid\s*=\s*["']deck-stage["']/i.test(doc);
  const clickNavigation = !!options.clickNavigation && !isFrameworkDeck;
  const styleFix = isFrameworkDeck
    ? ''
    : `<style data-od-deck-fix>
.stage, .deck-stage, .deck-shell { place-content: center !important; }
</style>`;

  const script = `<script data-od-deck-bridge>(function(){
  var initialSlideIndex = ${safeInitialSlideIndex};
  var didRestoreInitialSlide = initialSlideIndex <= 0;
  var odHasArtifactKeydownListener = ${JSON.stringify(hasInlineKeydownListener)};
  function slides(){
    var structured = document.querySelectorAll('deck-stage > .slide, .deck > .slide, .deck-stage > .slide, .deck-shell > .slide, body > .slide');
    if (structured.length) return structured;
    return document.querySelectorAll('.slide');
  }
  function activeIndex(list){
    if (!list || !list.length) return 0;
    for (var i=0; i<list.length; i++) {
      var cl = list[i].classList;
      if (cl && (cl.contains('is-active') || cl.contains('active') || cl.contains('current'))) return i;
    }
    for (var j=0; j<list.length; j++) {
      try {
        var cs = window.getComputedStyle(list[j]);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') return j;
      } catch (_) {}
    }
    return 0;
  }
  function report(){
    try {
      var list = slides();
      var i = activeIndex(list);
      window.parent.postMessage({ type: 'od:slide-state', active: i, count: list.length }, '*');
    } catch (_) {}
  }
  function setActive(target){
    var list = slides();
    if (!list.length || target < 0 || target >= list.length) return false;
    for (var k=0; k<list.length; k++) {
      list[k].classList.remove('active','is-active','current');
      if (list[k].style) list[k].style.display = k === target ? '' : 'none';
    }
    list[target].classList.add('active');
    report();
    return true;
  }
  function go(action){
    var list = slides();
    if (!list.length) return;
    var i = activeIndex(list);
    var target = i;
    if (action === 'next') target = Math.min(list.length - 1, i + 1);
    else if (action === 'prev') target = Math.max(0, i - 1);
    else if (action === 'first') target = 0;
    else if (action === 'last') target = list.length - 1;
    if (target !== i) setActive(target);
    else report();
  }
  function gotoIndex(idx){
    var list = slides();
    if (!list.length) return;
    var target = Math.max(0, Math.min(list.length - 1, idx));
    setActive(target);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:slide') return;
    if (data.action === 'go' && typeof data.index === 'number') gotoIndex(data.index);
    else go(data.action);
  });
  if (${JSON.stringify(clickNavigation)}) {
    document.addEventListener('click', function(ev){
      if (ev.button !== undefined && ev.button !== 0) return;
      var list = slides();
      if (!list.length) return;
      ev.preventDefault();
      if (ev.clientX < window.innerWidth / 2) go('prev');
      else go('next');
    }, true);
  }
  function nudgeResize(){
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
  }
  function chaseFirstLayout(){
    var attempts = 0;
    function tick(){
      attempts += 1;
      nudgeResize();
      if (window.innerWidth > 0 && attempts >= 2) return;
      if (attempts < 30) setTimeout(tick, 50);
    }
    tick();
  }
  window.addEventListener('load', function(){
    setTimeout(function(){
      if (!didRestoreInitialSlide && initialSlideIndex > 0) gotoIndex(initialSlideIndex);
      didRestoreInitialSlide = true;
      report();
      chaseFirstLayout();
    }, 200);
  });
  if (document.readyState === 'complete') chaseFirstLayout();
})();</script>`;

  const withFix = styleFix ? injectBeforeHeadEnd(doc, styleFix) : doc;
  return injectBeforeBodyEnd(withFix, script);
}
