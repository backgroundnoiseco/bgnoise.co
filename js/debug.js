/* Dev-only debug outlines. Loaded ONLY when ?debug is in the URL - js/site.js injects it,
   so the live page never fetches or parses this.

   It draws the one relationship being tuned: the bar's top edge as the divider, the INK
   bottom of the active title above it, and the INK top of the active description below it,
   with both distances labelled. Ink, not boxes - Range.getClientRects() is what every
   measurement in this thread has used, and the boxes sit several px away from the glyphs.

   Nothing here reads layout in a scroll handler that the site depends on; it runs its own
   rAF loop while the page is being dragged around and stops when idle. */
(function(){
  if (!new URLSearchParams(location.search).has('debug')) return;
  const vport = document.querySelector('.v-port');
  const frame = document.querySelector('.v-port .frame');
  const bar   = document.querySelector('.v-port .p-sub');
  if (!vport || !frame || !bar) return;

  const layer = document.createElement('div');
  layer.style.cssText = `position:fixed;inset:0;z-index:99998;pointer-events:none;
    font:10px/1.35 ui-monospace,Menlo,monospace;`;
  document.body.appendChild(layer);

  const mk = css => { const el = document.createElement('div');
    el.style.cssText = 'position:fixed;pointer-events:none;' + css;
    layer.appendChild(el); return el; };

  const divider  = mk('height:0;border-top:1px dashed #ff3b6b;');
  const titleBox = mk('border:1px solid #1fcbc4;');
  const descBox  = mk('border:1px solid #e8c84a;');
  const aboveTag = mk('color:#1fcbc4;background:rgba(0,0,0,.8);padding:1px 4px;white-space:nowrap;');
  const belowTag = mk('color:#e8c84a;background:rgba(0,0,0,.8);padding:1px 4px;white-space:nowrap;');
  const panel    = mk(`left:12px;bottom:12px;color:#eae6dc;background:rgba(10,10,10,.94);
    border:1px solid #333;padding:8px 10px;white-space:pre;border-radius:4px;`);

  const ink = el => { const r = document.createRange(); r.selectNodeContents(el);
    const rects = [...r.getClientRects()];
    if (!rects.length) return null;
    return {left:Math.min(...rects.map(x=>x.left)), right:Math.max(...rects.map(x=>x.right)),
            top:Math.min(...rects.map(x=>x.top)), bottom:Math.max(...rects.map(x=>x.bottom))}; };

  const place = (el, b) => { el.style.left = b.left+'px'; el.style.top = b.top+'px';
    el.style.width = Math.max(0,b.right-b.left)+'px'; el.style.height = Math.max(0,b.bottom-b.top)+'px'; };

  // Which row is on screen: the panels cross-fade, so read the same --progress they do.
  function activeIndex(){
    const p = parseFloat(getComputedStyle(vport).getPropertyValue('--progress')) || 0;
    return Math.round(p);
  }

  function draw(){
    const fr = frame.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const i  = activeIndex();
    const panels = [...document.querySelectorAll('.v-port .panel')];
    const subs   = [...document.querySelectorAll('.v-port .sub-panel')];
    const pan = panels[i], sub = subs[i];
    if (!pan || !sub) return;

    // title = the wordmark on the hero row, the project name on the others
    const titleEl = pan.querySelector('h1') || pan.querySelector('.role');
    const descEl  = sub.querySelector('.tag') || sub.querySelector('.feats');
    const t = titleEl && ink(titleEl), dsc = descEl && ink(descEl);

    divider.style.left = fr.left+'px'; divider.style.top = br.top+'px';
    divider.style.width = fr.width+'px'; divider.style.height = '0px';

    let above = null, below = null;
    if (t) { place(titleBox, t); above = br.top - t.bottom;
      aboveTag.textContent = 'above ' + above.toFixed(1);
      aboveTag.style.left = (t.right + 8)+'px'; aboveTag.style.top = (t.bottom - 12)+'px'; }
    if (dsc) { place(descBox, dsc); below = dsc.top - br.top;
      belowTag.textContent = 'below ' + below.toFixed(1);
      belowTag.style.left = (dsc.right + 8)+'px'; belowTag.style.top = dsc.top+'px'; }

    panel.textContent =
      `row ${i}  ${innerWidth}x${innerHeight}\n` +
      `title ink -> bar top   ${above===null?'-':above.toFixed(1)}\n` +
      `bar top -> desc ink    ${below===null?'-':below.toFixed(1)}\n` +
      `difference             ${(above===null||below===null)?'-':(below-above).toFixed(1)}\n` +
      `bar height             ${br.height.toFixed(1)}\n` +
      `bar padding-top        ${getComputedStyle(bar).paddingTop}\n` +
      `frame height           ${fr.height.toFixed(1)}`;
  }

  // Runs while things move, idles otherwise - this is a dev overlay, but there is no reason
  // for it to spin a frame loop against a page that is sitting still.
  let raf = 0, until = 0;
  function loop(){ draw(); if (performance.now() < until) raf = requestAnimationFrame(loop); else raf = 0; }
  // Draw synchronously as well as scheduling: rAF is throttled in a background tab, and
  // an overlay that silently stops tracking is worse than no overlay.
  function wake(){ draw(); until = performance.now() + 400; if (!raf) raf = requestAnimationFrame(loop); }

  addEventListener('resize', wake, {passive:true});
  const scroller = document.querySelector('.page[data-page="portrait"]');
  if (scroller) scroller.addEventListener('scroll', wake, {passive:true});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  draw();
})();
