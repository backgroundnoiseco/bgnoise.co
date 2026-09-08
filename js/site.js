  // Decode the obfuscated email (matches the pattern used in index.html). Anchors get a
  // mailto; the header's is a <button>, which copies instead - see the handler below.
  document.querySelectorAll('.email[data-a][data-b]').forEach(el => {
    const addr = atob(el.dataset.a) + '@' + atob(el.dataset.b);
    if (el.tagName === 'A') el.href = 'mailto:' + addr;
    el.textContent = addr;
  });

  // Click-to-copy for the header's address.
  document.querySelectorAll('button.email[data-a][data-b]').forEach(btn => {
    const addr = btn.textContent;
    let t = 0;
    // execCommand is deprecated but it is the only path that works without a secure
    // context (file://, plain http) AND the only fallback when writeText rejects - which
    // it does without transient user activation, or if the permission is denied.
    function legacyCopy(text){
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    }
    function copy(text){
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text)
          .catch(() => { if (!legacyCopy(text)) throw new Error('copy unavailable'); });
      }
      return legacyCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy unavailable'));
    }
    // Last resort: put the address in the user's selection so their own Cmd/Ctrl+C works.
    function selectSelf(el){
      try {
        const r = document.createRange(); r.selectNodeContents(el);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      } catch (_) {}
    }
    btn.addEventListener('click', e => {
      e.stopPropagation();                       // the fan's outside-click handler
      // Pin the width before the label changes, or the right-anchored fan reflows for as
      // long as the feedback shows.
      btn.style.minWidth = btn.offsetWidth + 'px';
      copy(addr).then(() => {
        btn.textContent = 'copied';
        btn.dataset.copied = 'true';
      }).catch(() => {
        // Both paths refused. Select the address in place so the user's own Cmd/Ctrl+C
        // works - and only say so if the selection actually took. Claiming "copied" when
        // nothing was copied is worse than showing no feedback at all.
        selectSelf(btn);
        if (String(getSelection() || '').indexOf('@') >= 0) {
          btn.textContent = 'press \u2318C';
          btn.dataset.copied = 'true';
        }
      }).finally(() => {
        clearTimeout(t);
        t = setTimeout(() => { btn.textContent = addr; delete btn.dataset.copied; }, 1400);
      });
    });
  });



  // Respect the OS reduced-motion preference for programmatic scrolls
  const SCROLL_BEHAVIOR = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  // The layout's two keyframe widths. Everything fluid on the page interpolates between
  // them - in CSS via --kf-x (see the keyframe table at the top of css/site.css), and here
  // for the one piece of positioning JS still owns.
  // KF1 is DERIVED from --maxw rather than duplicated: it is maxw + 64, the width at which
  // the content band stops growing. Narrowing the layout used to mean editing this file and
  // the stylesheet in lockstep, and a stale copy here leaves the project pair still drifting
  // after the band has frozen. Read once and refreshed on resize - never in a hot path.
  const KF0 = 360;
  let KF1 = 1144;   // overwritten by readBandCap() on load; kept in step so it isn't misleading
  function readBandCap(){
    const vp = document.querySelector('.v-port');
    if (!vp) return;
    const maxw = parseFloat(getComputedStyle(vp).getPropertyValue('--maxw'));
    if (maxw > 0) KF1 = maxw + 64;
  }
  readBandCap();
  window.addEventListener('resize', readBandCap);

  // Portrait stage — one scroll-progress value drives everything: the panels translate by
  // (index - progress) * 100%, and the rail reads the same number. No IntersectionObserver,
  // no second source of truth to drift out of sync.
  (function(){
    const root   = document.querySelector('.page[data-page="portrait"]');
    const vport  = document.querySelector('.v-port');
    const track  = document.querySelector('.v-port .stage-track');
    const stage  = document.querySelector('.v-port .stage');
    const outro  = document.querySelector('.v-port .p-outro');
    const panels = [...document.querySelectorAll('.v-port .panel')];
    const marks  = [...document.querySelectorAll('.v-port .p-rail button')];
    if (!root || !vport || !track || !stage || !panels.length) return;
    const last = panels.length - 1;

    // All geometry is measured once (and on real size changes), never in the scroll hot
    // path: reading getComputedStyle/getBoundingClientRect right after writing --progress
    // forces a full synchronous style recalc of everything var-dependent, every frame -
    // which is exactly the Safari jank. The hot path is one scrollTop read + one var write.
    let stickyTopV = 0, trackStart = 0, travel = 1, outroLine = Infinity;
    function measure(){
      const rootTop = root.getBoundingClientRect().top;
      stickyTopV = parseFloat(getComputedStyle(stage).top) || 0;
      travel = Math.max(1, track.offsetHeight - stage.offsetHeight);   // === last * 100svh
      trackStart = track.getBoundingClientRect().top - rootTop + root.scrollTop - stickyTopV;
      // clamp to max scroll: on short pages the outro's top never reaches the sticky
      // line, which used to leave the rail stuck on 03 at the very bottom
      const maxScroll = root.scrollHeight - root.clientHeight;
      outroLine = outro ? Math.min(
        outro.getBoundingClientRect().top - rootTop + root.scrollTop - stickyTopV - 2,
        maxScroll - 2
      ) : Infinity;
      schedule();
    }
    const stickyTop = () => stickyTopV;

    let raf = 0, lastActive = null, lastPanel = -1;
    function update(){
      raf = 0;
      const st = root.scrollTop;
      const p = Math.min(Math.max((st - trackStart) / travel, 0), 1) * last;
      vport.style.setProperty('--progress', p);
      if (vport._onProgress) vport._onProgress(p);   // snake idles when the hero leaves
      // The panels cross-fade in place rather than sliding, so they all sit stacked at
      // inset:0 and opacity:0 does NOT stop hit-testing - without this the last panel in
      // the DOM swallows every click on the page. Written only when the active panel
      // changes, same as the rail, so the hot path stays one read and one var write.
      const pi = Math.round(p);
      if (pi !== lastPanel) {
        lastPanel = pi;
        panels.forEach((el, i) => { el.style.pointerEvents = i === pi ? '' : 'none'; });
      }
      let active = panels[pi].dataset.idx;
      if (st >= outroLine) active = 'contact';
      if (active === lastActive) return;
      lastActive = active;
      marks.forEach(m => {
        const on = m.dataset.s === active;
        m.classList.toggle('on', on);
        if (on) m.setAttribute('aria-current', 'true'); else m.removeAttribute('aria-current');
      });
    }
    function schedule(){ if (!raf) raf = requestAnimationFrame(update); }

    root.addEventListener('scroll', schedule, {passive:true});
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(stage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    measure();

    // expose for the click-to-scroll handler below
    vport._stage = {track, stage, panels, last, stickyTop, update, measure};
  })();

  // Portrait — position each project's phone/info pair. Sizing (title, CTA, shell radius)
  // is now pure CSS via cqb against the .frame container; this only handles the wide-screen
  // composition shift, which is keyed to viewport width and so can't be a container query.
  (function(){
    const slots = [...document.querySelectorAll('.v-port .panel--project')];
    if (!slots.length || typeof ResizeObserver === 'undefined') return;
    function positionAll(){
      slots.forEach(slot => {
        const phone = slot.querySelector('.p-phone');
        const info = slot.querySelector('.p-info');
        if (!phone) return;
        phone.style.transform = '';
        if (info) info.style.transform = '';
        // 566+ places the phone in CSS (absolute, on the band's right edge) so the title
        // can take the wordmark's spot. Only the mobile two-column layout needs this.
        if (window.innerWidth > 565) return;
        const pRect = phone.getBoundingClientRect();
        if (pRect.width <= 0) return;
        // Shift the pair so the phone's centre lands ~37% of width. Past the layout cap
        // freeze the target at a constant offset left of centre, so the pair stops drifting
        // left as the window widens (37% of viewport keeps sliding left of the centred,
        // capped content otherwise). The two branches meet exactly at the cap
        // (0.37 x C === C/2 - C x 0.13 for any C), so there is no step there.
        const CAP_W = KF1;   // = --maxw + 64, read from the CSS
        const phoneCenter = pRect.left + pRect.width / 2;
        const vw = window.innerWidth;
        const target = vw <= CAP_W ? vw * 0.37 : vw / 2 - CAP_W * 0.13;
        // Ease the shift in across the SAME keyframes the CSS uses (--kf-x, 360 -> 1000)
        // rather than switching it on at a threshold. This used to be `vw < 860 ? 0 : full`,
        // which snapped the phone 100px sideways the moment you crossed 860.
        const t = Math.min(1, Math.max(0, (vw - KF0) / (KF1 - KF0)));
        const delta = Math.max(0, Math.round((target - phoneCenter) * t));
        phone.style.transform = 'translateX(' + delta + 'px)';
        if (info) info.style.transform = 'translateX(' + delta + 'px)';
      });
      fitTitles();
    }
    // On narrow windows the info column can run past the frame's right edge and clip the
    // project title. Shrink the title's font just enough that its rendered text fits inside
    // the frame. Measured with a Range (the actual glyph extent), reset to the CSS cqb size
    // each pass so it grows back when there's room. All panels share the same x (inset:0,
    // vertical translate only), so the off-screen panels measure correctly too.
    const frameEl = document.querySelector('.v-port .frame');
    function fitTitles(){
      if (!frameEl) return;
      const fr = frameEl.getBoundingClientRect();
      slots.forEach(slot => {
        const role = slot.querySelector('.p-info .role');
        if (!role) return;
        role.style.fontSize = '';
        const range = document.createRange();
        range.selectNodeContents(role);
        const tr = range.getBoundingClientRect();
        // stop at the panel's content edge, not the frame's - that way the CSS right
        // padding is the single source of breathing room and this can't undercut it
        const pr = slot.getBoundingClientRect();
        const padR = parseFloat(getComputedStyle(slot).paddingRight) || 0;
        // The panel's content edge is the only bound. Above 565 the phone is centred in
        // the frame and the title is MEANT to run across it on a narrow window, so the
        // phone deliberately does not constrain this.
        const avail = Math.min(fr.right, pr.right - padR) - tr.left;
        if (tr.width > avail && avail > 0) {
          const cur = parseFloat(getComputedStyle(role).fontSize);
          role.style.fontSize = Math.max(14, cur * avail / tr.width).toFixed(1) + 'px';
        }
      });
    }
    slots.forEach(slot => {
      const phone = slot.querySelector('.p-phone');
      if (phone) new ResizeObserver(positionAll).observe(phone);
    });
    window.addEventListener('resize', positionAll);
    positionAll();
  })();

// Portrait — sync scroll-padding-top to the sticky header's real height
  (function(){
    const page = document.querySelector('.page[data-page="portrait"]');
    const topNav = document.querySelector('.v-port .p-top');
    if (!page || !topNav || typeof ResizeObserver === 'undefined') return;
    const sync = () => { page.style.setProperty('--p-top-h', topNav.offsetHeight + 'px'); };
    new ResizeObserver(sync).observe(topNav);
    sync();
  })();

  // Portrait rail — grow the section numbers to fill the rail's leftover height.
  // The rail is anchored under the header and level with the info bar's divider, so its
  // height tracks the viewport while the labels don't; the surplus would otherwise sit as
  // dead gaps between the sections. Each number takes leading zeros (00 -> 000 -> 0000)
  // until only a couple of characters of gap are left, so the rail reads as one run.
  (function(){
    const rail = document.querySelector('.v-port .p-rail');
    if (!rail) return;
    const btns = [...rail.querySelectorAll('button')];
    if (btns.length < 2) return;

    const GAP_CH = 2;   // characters of breathing room kept between sections

    // split each label so the zeros can be swapped without touching the accessible name
    const pads = btns.map(b => {
      const label = b.textContent.trim();
      b.setAttribute('aria-label', label);
      b.textContent = label;
      const pad = document.createElement('span');
      pad.className = 'pad';
      pad.setAttribute('aria-hidden', 'true');
      b.insertBefore(pad, b.firstChild);
      return pad;
    });

    // the rail is vertical-rl, so a text run measures along the box's HEIGHT
    const probe = document.createElement('span');
    probe.textContent = '0000000000';
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';

    function padRail(){
      pads.forEach(p => { p.textContent = ''; });
      rail.appendChild(probe);
      const adv = probe.getBoundingClientRect().height / 10;   // advance + letter-spacing
      rail.removeChild(probe);
      if (!(adv > 0)) return;
      const free = rail.getBoundingClientRect().height
                 - btns.reduce((s, b) => s + b.getBoundingClientRect().height, 0)
                 - (btns.length - 1) * GAP_CH * adv;
      // Spend the budget one whole character at a time and hand the remainder out singly
      // rather than splitting four ways and flooring - a floored quarter throws away up to
      // four characters, which lands back in the gaps and makes them drift wide.
      const budget = Math.max(0, Math.floor(free / adv));
      const each = Math.floor(budget / btns.length), spare = budget % btns.length;
      pads.forEach((p, i) => { p.textContent = '0'.repeat(each + (i < spare ? 1 : 0)); });
    }

    // The rail's height has exactly two inputs - the viewport (svh) and the header, which
    // JS measures into --p-top-h. Watch both directly rather than observing the rail: the
    // zeros change its content on every call, and observing what you rewrite invites a loop.
    window.addEventListener('resize', padRail);
    const topNav = document.querySelector('.v-port .p-top');
    if (topNav && typeof ResizeObserver !== 'undefined') new ResizeObserver(padRail).observe(topNav);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(padRail);
    padRail();
  })();

  // Portrait frame — concentric rectangles, drawn as a live <svg> element rather than a
  // data-URI background so the fill can inherit currentColor and tint per panel.
  (function(){
    const frame = document.querySelector('.v-port .frame');
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const STEP = 40;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rects');
    svg.setAttribute('aria-hidden', 'true');
    frame.prepend(svg);
    function render(){
      const r = frame.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // match the section background band, which starts at --cap (= --gutter minus its floor)
      const maxw = parseFloat(getComputedStyle(frame).getPropertyValue('--maxw')) || Infinity;
      const edge = Math.max(0, (r.width - maxw) / 2 - 32);
      const W = r.width - 2 * edge, H = r.height;
      // Collect ring insets, stopping before any rect whose shorter side would be under one
      // STEP — otherwise a frame height that's just past a STEP boundary leaves a thin sliver
      // as the innermost rect. MIN_SIDE keeps the centre rect a sane proportion.
      const MIN_SIDE = STEP;
      const insets = [];
      for (let inset = 0; W - 2 * inset >= MIN_SIDE && H - 2 * inset >= MIN_SIDE; inset += STEP) insets.push(inset);
      // ring colour ramps warm-white (outermost) -> pink (innermost); the CSS fill blends this
      // toward black by --rect-mix so it only shows on the Porcupine panel.
      // Two ramps, split at the same 565px boundary the rest of the mobile layout uses:
      //   > 565  pixel depth against a fixed RAMP_PX. A given ring KEEPS its colour as the
      //          window (and so the ring count) changes - no recolouring while you resize.
      //          240px = 6 steps, the innermost depth at desktop, so the centre reaches full
      //          pink there.
      //   <= 565 index over count, i.e. every ring one even step toward the centre colour.
      //          Mobile only fits ~5 rings, and under the fixed-depth ramp its innermost
      //          stopped at rgb(238,122,180) - pale enough that the project title washed out
      //          against it. Spreading the ramp over however many rings exist takes it to
      //          full pink. The cost is that rings recolour on resize, which is why this is
      //          NOT used at desktop widths, where there is no contrast problem to solve.
      // WHITE and --ringOverlay in the CSS are this same hue lifted toward white, so the
      // ramp stays one family - change PINK and both have to be re-derived, or the outer
      // rings drift magenta while the centre reads red. (Tried retargeting all three onto
      // the badge's #e84264; this magenta-leaning pink was kept instead.)
      const WHITE = [252, 205, 226], PINK = [231, 81, 157];
      const RAMP_PX = 240, evenSteps = window.innerWidth <= 565;
      let out = '';
      insets.forEach((inset, i) => {
        const w = W - 2 * inset, h = H - 2 * inset;
        const t = evenSteps ? (insets.length > 1 ? i / (insets.length - 1) : 1)
                            : Math.min(inset / RAMP_PX, 1);
        const c = WHITE.map((v, k) => Math.round(v + (PINK[k] - v) * t)).join(',');
        out += '<rect x="'+inset+'" y="'+inset+'" width="'+w+'" height="'+h+'" style="--c:rgb('+c+')" fill-opacity="0.15"/>';
      });
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.innerHTML = out;
    }
    new ResizeObserver(render).observe(frame);
    // Exposed for the ?tune overlay: changing --maxw resizes the BAND but not .frame, so the
    // observer never fires and the rings would keep the old geometry while the band moved.
    const vp = document.querySelector('.v-port');
    if (vp) vp._renderRects = render;
  })();

// Portrait rail + Contact nav — click to scroll to section
  (function(){
    const vport = document.querySelector('.v-port');
    if (!vport) return;
    function go(idx){
      const st = vport._stage;
      if (idx === 'contact' || !st) {
        // scroll the container directly - scrollIntoView also scrolls ancestor scrollers
        // (including the window) and can leave the document offset out of bounds
        const t = vport.querySelector('[data-idx="' + idx + '"]');
        const root = document.querySelector('.page[data-page="portrait"]');
        if (t && root) {
          const pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
          root.scrollTo({top: root.scrollTop + t.getBoundingClientRect().top - pad, behavior: SCROLL_BEHAVIOR});
        }
        return;
      }
      const i = st.panels.findIndex(p => p.dataset.idx === idx);
      if (i < 0) return;
      const root = document.querySelector('.page[data-page="portrait"]');
      const travel = st.track.offsetHeight - st.stage.offsetHeight;
      const trackTop = root.scrollTop + st.track.getBoundingClientRect().top - st.stickyTop();
      root.scrollTo({top: trackTop + (i / st.last) * travel, behavior:SCROLL_BEHAVIOR});
    }
    document.querySelectorAll('.v-port .p-rail button').forEach(s => {
      s.addEventListener('click', () => s.dataset.s === 'contact' ? setFan(true) : go(s.dataset.s));
    });
    // Contact fan-out. There is no contact SECTION any more - the header's button reveals
    // the Instagram and email links instead, and the rail's Contact entry opens the same
    // thing rather than scrolling to a target that no longer exists.
    const fanNav = document.querySelector('.v-port .p-contact');
    const fanBtn = fanNav && fanNav.querySelector('.contact-btn');
    function setFan(open){
      if (!fanNav) return;
      fanNav.dataset.open = open ? 'true' : 'false';
      fanBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (fanBtn) {
      setFan(false);
      fanBtn.addEventListener('click', e => {
        e.stopPropagation();                       // or the document handler closes it again
        setFan(fanNav.dataset.open !== 'true');
      });
      // click anywhere else, or Escape, closes it - but not a click on the links themselves,
      // which have to survive long enough to follow
      document.addEventListener('click', e => {
        if (!fanNav.contains(e.target)) setFan(false);
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && fanNav.dataset.open === 'true') { setFan(false); fanBtn.focus(); }
      });
    }
    const toTop = document.querySelector('.v-port .p-foot .to-top');
    if (toTop) {
      toTop.addEventListener('click', (e) => {
        e.preventDefault();
        const root = document.querySelector('.page[data-page="portrait"]');
        if (root) root.scrollTo({top: 0, behavior: SCROLL_BEHAVIOR});
      });
    }
  })();

  // Floating snake - port of FloatingSnakeView from the rng1 app. 30 squares chase a
  // multi-sine path, each rotating on its own seeded speed, head teal -> tail purple.
  // Constants are the app's shipped values (speed .5, head 50, tail 10, delay .2,
  // rotation 50, lfo 5; wiggle and depth are 0 there, so both terms are omitted here).
  (function(){
    const vport = document.querySelector('.v-port');
    if (!vport) return;
    // Exposed as _bootSnake so the ?tune overlay can start it after unwrapping the
    // <template data-disabled="snake">. On the live page the template is never unwrapped,
    // boot() finds no canvas and returns false, and nothing else runs.
    vport._bootSnake = function boot(){
      const cv = document.querySelector('.v-port .hero-snake');
      const badge = document.querySelector('.v-port .panel--hero .p-badge');
      if (!cv || !cv.getContext) return false;
      const ctx = cv.getContext('2d');
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const V_INSET = 24;   // clearance kept from the frame's top and bottom edges

      const N = 30, SPEED = 0.5, TAIL = 10, DELAY = 0.2, ROT = 50, LFO = 5;
      // The app hardcodes head 50. Here the head IS the badge, so the first drawn square
      // takes the badge's rendered width instead - otherwise the body halves in size the
      // moment it leaves the badge. Cached in measure() with everything else; 50 is only
      // the fallback for a page with no badge.
      let HEAD = 50;
      // Body runs from the badge's own pink at the head to --ink at the tail, so the
      // badge reads as the head of one object rather than a sticker on top of it.
      const HEAD_RGB = [232, 66, 100], TAIL_RGB = [234, 230, 220];
      const DEG = Math.PI / 180;

      // Geometry is cached, never read per frame - same rule as the stage driver.
      // The badge rides the snake's head. Its offset basis is cached here, never read per
      // frame: with the transform cleared, how far the badge's centre sits from the canvas's
      // top-left. Both live inside .panel--hero, so the panel's own translateY affects them
      // equally and cancels out of the difference.
      let w = 0, h = 0, baseX = 0, baseY = 0, tx = 0, ty = 0;
      function measure(){
        const r = cv.getBoundingClientRect();
        w = r.width; h = r.height;
        if (badge) {
          if (w && h) {
            // Do NOT clear the transform to measure. ResizeObserver fires continuously while
            // the window is dragged, and clearing it each time snapped the badge back to its
            // CSS spot for a frame before the next rAF re-applied it - which read as violent
            // flicker between the mobile position and the snake. Instead subtract the
            // translate we last wrote: rotation is about the element's centre, so the rect's
            // CENTRE is unaffected by it and only the translate has to come back out.
            const b = badge.getBoundingClientRect();
            baseX = b.left - r.left + b.width / 2 - tx;
            baseY = b.top - r.top + b.height / 2 - ty;
            // The badge is a disc, so a square matching its WIDTH is circumscribed and reads
            // oversized. Inscribe it instead - side = diameter / sqrt(2) - so the square's
            // corners come out exactly to the badge's radius.
            // offsetWidth, not the rect: getBoundingClientRect returns the ROTATED bounding
            // box, which is inflated by up to 1.41x and changes with the spin angle.
            HEAD = badge.offsetWidth / Math.SQRT2;
          } else {
            badge.style.transform = '';   // snake hidden (<=565): hand the badge back to CSS
            tx = ty = 0;
          }
        }
        if (!w || !h) return;               // canvas hidden (<=565): badge keeps its CSS spot
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (reduce) draw(0);
      }

      const seed = i => (((i * 7 + 3) % 13) + 1) * 0.1;

      function posAt(t, cx, cy, rx, ry){
        // the LFO modulates phase, not speed - that is what keeps the path from looping
        const l1 = Math.sin(t * LFO * 0.05) * 2,
              l2 = Math.sin(t * LFO * 0.07 + 1) * 2,
              l3 = Math.sin(t * LFO * 0.06 + 2) * 2;
        return [
          cx + rx * (0.5 * Math.sin(t * SPEED * 0.7 + l1)
                   + 0.3 * Math.sin(t * SPEED * 1.3 + 1.5 + l2)
                   + 0.2 * Math.cos(t * SPEED * 0.5 + 0.8 + l3)),
          // y uses slower terms so it dwells at the extremes
          cy + ry * 1.5 * (0.6 * Math.sin(t * SPEED * 0.4 + 0.5 + l1)
                         + 0.25 * Math.cos(t * SPEED * 0.7 + 2 + l2)
                         + 0.15 * Math.sin(t * SPEED * 0.3 + 1.2 + l3))
        ];
      }

      function draw(t){
        if (!w || !h) return;
        ctx.clearRect(0, 0, w, h);
        // rx keeps the app's 0.38w. ry is DERIVED rather than the app's 0.3h: the vertical
        // reach is 3*ry + HEAD (the y term carries a 1.5 multiplier, so +/-1.5*ry), and at
        // 0.3h that came to more than the canvas is tall - the snake was being clipped at
        // the top and bottom edges. Solving 3*ry + HEAD = h - 2*V_INSET instead leaves
        // exactly V_INSET of clearance from the header and the info bar at any height.
        const cx = w / 2, cy = h / 2, rx = w * 0.38,
              ry = Math.max(0, (h - 2 * V_INSET - HEAD) / 3);
        // The badge IS the head, so segment 0 is never drawn - the badge is moved onto it
        // instead and the squares read as the body trailing behind.
        if (badge) {
          const head = posAt(t, cx, cy, rx, ry);
          // same seeded rotation segment 0 would have had, so the badge spins as the head
          const s0 = seed(0);
          tx = head[0] - baseX; ty = head[1] - baseY;
          badge.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) rotate('
                                + ((t * ROT * (0.4 + s0 * 1.2) + s0 * 360) % 360).toFixed(1) + 'deg)';
        }
        for (let i = N - 1; i >= 1; i--) {   // tail first, segment 0 is the badge
          const p = i / (N - 1);
          const xy = posAt(t - i * DELAY, cx, cy, rx, ry);
          const size = TAIL + (HEAD - TAIL) * (1 - p);
          const s = seed(i);
          ctx.save();
          ctx.translate(xy[0], xy[1]);
          ctx.rotate((t * ROT * (0.4 + s * 1.2) + i * 47 + s * 360) * DEG);
          ctx.fillStyle = 'rgb(' + Math.round(HEAD_RGB[0] + (TAIL_RGB[0] - HEAD_RGB[0]) * p) + ','
                                 + Math.round(HEAD_RGB[1] + (TAIL_RGB[1] - HEAD_RGB[1]) * p) + ','
                                 + Math.round(HEAD_RGB[2] + (TAIL_RGB[2] - HEAD_RGB[2]) * p) + ')';
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.restore();
        }
      }

      let raf = 0;
      function frame(){ raf = requestAnimationFrame(frame); draw(performance.now() / 1000); }
      function start(){ if (!raf && !reduce && w) raf = requestAnimationFrame(frame); }
      function stop(){ if (raf) { cancelAnimationFrame(raf); raf = 0; } }


      // Only run while the hero panel is on screen. The driver hands us the same --progress
      // everything else reads, so this needs no observer and no second source of truth.
      vport._onProgress = p => { p < 1 ? start() : stop(); };
      // For the ?tune overlay, which shows and hides the canvas. measure() is the real
      // switch: the cached size is what start() and draw() both gate on, so re-measuring
      // after the canvas's display changes parks or revives the loop (and, when it parks,
      // hands the badge back to its CSS position).
      vport._snake = {start, stop, measure};
      document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(cv);
      else window.addEventListener('resize', measure);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
      measure();
      start();
      return true;
    };
    vport._bootSnake();
  })();

  // Dev-only debug outlines. Load any page with ?debug to see the bar's top edge as a
  // dashed divider with the active title's ink bottom and the active description's ink top
  // boxed and labelled. Without the flag the file is never fetched. See js/debug.js.
  if (new URLSearchParams(location.search).has('debug')) {
    const dbg = document.createElement('script');
    // Cache-busted on every load. index.html's ?v= covers site.css/site.js, but nothing
    // versions this one, and the overlay is what every spacing decision gets eyeballed
    // against - a stale copy of it is worse than no copy. It is dev-only, so the extra
    // request costs the live page nothing.
    dbg.src = 'js/debug.js?t=' + Date.now();
    document.body.appendChild(dbg);
  }

  // Dev-only tuning overlay - CURRENTLY OFF. js/tune.js is kept for later; uncomment the
  // block below to bring it back, then load any page with ?tune. It was gated on the query
  // string anyway, so the live page never fetched it either way.
  // if (new URLSearchParams(location.search).has('tune')) {
  //   const s = document.createElement('script');
  //   s.src = 'js/tune.js';
  //   document.body.appendChild(s);
  // }
