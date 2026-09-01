/* =====================================================================
   REMOTIE  |  script.js
   Vanilla ES6. No dependencies, no frameworks, no build step.
   ---------------------------------------------------------------------
   01 Helpers & frame scheduler   07 Hero particle field
   02 Preloader                   08 Headline rotator
   03 Scroll reveals              09 Animated counters
   04 Geometry cache              10 Contact form
   05 Scroll pipeline & nav       11 Image fallback + misc
   06 Pointer effects             12 Boot
   ---------------------------------------------------------------------
   PERFORMANCE CONTRACT
   * Exactly one `scroll` listener and one `pointermove` listener exist
     on the page. Both do nothing but record a number and request a
     frame. All reading and writing happens inside that frame.
   * No layout property (offsetTop, offsetWidth, getBoundingClientRect)
     is ever read during a scroll or a pointer move. Geometry is
     measured once, cached, and re-measured only on resize or load.
   * Every DOM write is guarded by a comparison, so a class or a style
     is only touched when its value actually changes.
   ===================================================================== */
"use strict";

/* ------------------------------------------------------------------ */
/* 01 · HELPERS & FRAME SCHEDULER                                      */
/* ------------------------------------------------------------------ */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE_POINTER = window.matchMedia("(pointer: fine)").matches;
/* Decorative GPU work is desktop-only. Mirrors the 899px CSS breakpoint. */
const RICH = FINE_POINTER && window.innerWidth >= 900 && !REDUCED;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

/** Debounce by `wait` ms. */
function debounce(fn, wait = 180) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---- shared pointer bus -------------------------------------------
   One `pointermove` listener for the entire page. Anything that needs
   the cursor reads `ptr`, either by subscribing to the shared frame or,
   like the hero canvas, by sampling it inside a loop it already runs.
   ------------------------------------------------------------------ */
const ptr = { x: -9999, y: -9999, active: false };
const ptrSubs = [];
let ptrQueued = false;

function flushPointer() {
  ptrQueued = false;
  for (const s of ptrSubs) s.onFrame();
}

function onPointer(sub) { ptrSubs.push(sub); }

function initPointerBus() {
  if (!FINE_POINTER) return;

  document.addEventListener("pointermove", e => {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.active = true;
    if (ptrQueued) return;
    ptrQueued = true;
    requestAnimationFrame(flushPointer);
  }, { passive: true });

  const leave = () => {
    ptr.x = -9999;
    ptr.y = -9999;
    ptr.active = false;
    for (const s of ptrSubs) if (s.onLeave) s.onLeave();
  };

  document.addEventListener("pointerleave", leave, { passive: true });
  window.addEventListener("blur", leave, { passive: true });
}

/* Bottom-centre toast. */
const toast = (() => {
  const el = $("#toast");
  let timer = 0;
  return (message, ms = 4200) => {
    if (!el) return;
    el.textContent = message;
    el.classList.add("is-shown");
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove("is-shown"), ms);
  };
})();

/* ------------------------------------------------------------------ */
/* 02 · PRELOADER                                                      */
/* ------------------------------------------------------------------ */
function initPreloader() {
  const loader = $("#preloader");
  const fill = $("#preloaderFill");
  if (!loader) return;

  let progress = 0;
  /* 220ms cadence rather than 140ms: this runs while the browser is
     still parsing and decoding, which is exactly when the main thread
     is scarcest. It writes a transform, never a width. */
  const tick = setInterval(() => {
    progress = Math.min(progress + Math.random() * 0.16 + 0.08, 0.92);
    if (fill) fill.style.transform = "scaleX(" + progress.toFixed(3) + ")";
  }, 220);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(tick);
    if (fill) fill.style.transform = "scaleX(1)";
    setTimeout(() => {
      loader.classList.add("is-done");
      document.body.classList.add("is-ready");
      /* Remove the node so its layer is released rather than kept
         around invisible for the life of the page. */
      setTimeout(() => loader.remove(), 700);
    }, 220);
  };

  if (document.readyState === "complete") setTimeout(finish, 260);
  else window.addEventListener("load", () => setTimeout(finish, 260), { once: true });

  /* Safety net: never trap the visitor behind the loader. */
  setTimeout(finish, 4000);
}

/* ------------------------------------------------------------------ */
/* 03 · SCROLL REVEALS                                                 */
/* ------------------------------------------------------------------ */
function initReveals() {
  const items = $$("[data-reveal]");
  if (!items.length) return;

  if (REDUCED || !("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("is-visible"));
    return;
  }

  for (const el of items) {
    const delay = parseInt(el.dataset.delay || "0", 10);
    if (delay) el.style.setProperty("--d", delay + "ms");
  }

  let remaining = items.length;
  const io = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
      /* Tear the observer down once its work is done so it stops
         holding references to every node on the page. */
      if (--remaining <= 0) obs.disconnect();
    }
  }, { threshold: 0.1, rootMargin: "0px 0px -8% 0px" });

  for (const el of items) io.observe(el);
}

/* ------------------------------------------------------------------ */
/* 04 · GEOMETRY CACHE                                                 */
/* ------------------------------------------------------------------ */
/* Everything the scroll pipeline needs to know about the page layout
   is measured here, in one batch, well away from any scroll frame. */
const geo = {
  scrollMax: 0,
  sections: [],   // [{ id, top }]
  links: [],      // [{ el, id, left, width }]
  navReady: false
};

function measureGeometry() {
  geo.scrollMax = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight
  );

  for (const s of geo.sections) {
    const el = document.getElementById(s.id);
    s.top = el ? el.offsetTop : 0;
  }

  let measured = false;
  for (const l of geo.links) {
    l.left = l.el.offsetLeft;
    l.width = l.el.offsetWidth;
    if (l.width > 0) measured = true;
  }
  geo.navReady = measured;
}

/* ------------------------------------------------------------------ */
/* 05 · SCROLL PIPELINE, NAV TABS, SCROLL SPY, MOBILE MENU             */
/* ------------------------------------------------------------------ */
/* Module state shared by the single scroll frame. */
const view = {
  y: 0,
  stuck: null,
  topShown: null,
  progress: -1,
  activeId: "",
  pillId: "",
  rectsStale: false
};

let scrollQueued = false;
let els = {};

function onScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(applyScrollFrame);
}

function applyScrollFrame() {
  scrollQueued = false;

  /* window.scrollY is served from the compositor during a scroll and
     does not force a synchronous layout the way offsetTop does. */
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  view.y = y;
  view.rectsStale = true;

  /* --- sticky header (write only on state change) --- */
  const stuck = y > 24;
  if (stuck !== view.stuck) {
    view.stuck = stuck;
    if (els.header) els.header.classList.toggle("is-stuck", stuck);
  }

  /* --- progress bar: scaleX, never width --- */
  if (els.bar) {
    const p = clamp(y / geo.scrollMax, 0, 1);
    if (Math.abs(p - view.progress) > 0.002) {
      view.progress = p;
      els.bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    }
  }

  /* --- back-to-top button --- */
  const showTop = y > window.innerHeight * 0.8;
  if (showTop !== view.topShown) {
    view.topShown = showTop;
    if (els.toTop) els.toTop.classList.toggle("is-shown", showTop);
  }

  /* --- scroll spy against cached offsets --- */
  spyFromCache(y);
}

function spyFromCache(y) {
  const list = geo.sections;
  if (!list.length) return;

  const line = y + window.innerHeight * 0.32;
  let id = list[0].id;
  for (let i = 0; i < list.length; i++) {
    if (list[i].top <= line) id = list[i].id;
  }
  /* the very bottom of the page always belongs to the last tab */
  if (y >= geo.scrollMax - 4) id = list[list.length - 1].id;

  setActiveTab(id);
}

function setActiveTab(id) {
  if (id === view.activeId) return;   // no DOM writes on an unchanged tab
  view.activeId = id;

  for (const l of geo.links) {
    l.el.classList.toggle("is-active", l.id === id);
  }
  movePill(id);
}

/* The pill is a 100px box. Sliding it is one transform, so the browser
   never re-runs layout for the nav while you scroll. */
const PILL_BASE = 100;
function movePill(id) {
  const pill = els.pill;
  if (!pill || !geo.navReady) return;

  const l = geo.links.find(x => x.id === id);
  if (!l || !l.width) return;

  view.pillId = id;
  pill.style.transform =
    "translate3d(" + l.left + "px,-50%,0) scaleX(" + (l.width / PILL_BASE).toFixed(4) + ")";
  pill.classList.add("is-ready");
}

function initNavigation() {
  els.header = $("#header");
  els.bar = $("#scrollBar");
  els.toTop = $("#toTop");
  els.pill = $("#navPill");

  const links = $$("[data-nav]");
  geo.links = links.map(el => ({
    el,
    id: (el.getAttribute("href") || "").slice(1),
    left: 0,
    width: 0
  }));
  geo.sections = geo.links
    .filter(l => document.getElementById(l.id))
    .map(l => ({ id: l.id, top: 0 }));

  measureGeometry();

  /* hover preview of the pill, restored on leave */
  const nav = $("#nav");
  if (nav) {
    nav.addEventListener("pointerover", e => {
      const a = e.target.closest ? e.target.closest("[data-nav]") : null;
      if (a) movePill((a.getAttribute("href") || "").slice(1));
    }, { passive: true });
    nav.addEventListener("pointerleave", () => movePill(view.activeId), { passive: true });
    nav.addEventListener("focusin", e => {
      const a = e.target.closest ? e.target.closest("[data-nav]") : null;
      if (a) movePill((a.getAttribute("href") || "").slice(1));
    });
    nav.addEventListener("focusout", () => movePill(view.activeId));
  }

  /* THE only scroll listener on the page */
  window.addEventListener("scroll", onScroll, { passive: true });

  const remeasure = debounce(() => {
    measureGeometry();
    view.activeId = "";          // force a re-evaluation
    applyScrollFrame();
    movePill(view.activeId);
  }, 150);

  window.addEventListener("resize", remeasure, { passive: true });
  window.addEventListener("orientationchange", remeasure, { passive: true });

  /* Images finishing later change scrollHeight, so re-measure once the
     page has fully settled instead of guessing at boot. */
  window.addEventListener("load", () => {
    measureGeometry();
    applyScrollFrame();
    movePill(view.activeId);
  }, { once: true });

  applyScrollFrame();

  if (els.toTop) {
    els.toTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
    });
  }

  /* ---------------------- mobile menu ---------------------- */
  const burger = $("#burger");
  const menu = $("#mobileMenu");
  if (!burger || !menu) return;

  let hideTimer = 0;

  const closeMenu = () => {
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open menu");
    menu.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!menu.classList.contains("is-open")) menu.hidden = true;
    }, 380);
  };

  const openMenu = () => {
    clearTimeout(hideTimer);
    menu.hidden = false;
    /* two frames: one to un-hide, one to let the transition catch */
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("is-open")));
    burger.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Close menu");
    document.body.classList.add("is-locked");
  };

  burger.addEventListener("click", () => {
    if (menu.classList.contains("is-open")) closeMenu(); else openMenu();
  });

  /* one delegated listener instead of one per link */
  menu.addEventListener("click", e => {
    if (e.target === menu || (e.target.closest && e.target.closest("[data-mobile-link]"))) closeMenu();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) closeMenu();
  });
}

/* ------------------------------------------------------------------ */
/* 06 · POINTER EFFECTS  (spotlight, magnetic buttons, card tilt)      */
/* ------------------------------------------------------------------ */
/* Previously every card and every button carried its own pointermove
   handler that called getBoundingClientRect on each event. With ~30
   cards that is a forced synchronous layout dozens of times a second,
   which is what made the page feel like it was sticking.

   Now: one `pointerover` listener plus the shared pointer bus.
   Rectangles are read once when the pointer enters an element and
   reused until it leaves or the page scrolls. All writes land in a
   single animation frame. */
function initPointerEffects() {
  if (!RICH) return;

  const spot = $("#spotlight");
  const magnet = { el: null, rect: null };
  const card = { el: null, rect: null, tilt: false };

  let spotLive = false;

  const resetMagnet = el => {
    if (!el) return;
    el.style.transform = "";
    el.classList.remove("is-magnetised");
  };
  const resetCard = el => {
    if (!el) return;
    if (el.hasAttribute("data-tilt")) el.style.transform = "";
  };

  document.addEventListener("pointerover", e => {
    const t = e.target;
    if (!t || !t.closest) return;

    const m = t.closest(".magnetic");
    if (m !== magnet.el) {
      resetMagnet(magnet.el);
      magnet.el = m;
      magnet.rect = m ? m.getBoundingClientRect() : null;
      if (m) m.classList.add("is-magnetised");
    }

    const c = t.closest("[data-tilt],[data-spot]");
    if (c !== card.el) {
      resetCard(card.el);
      card.el = c;
      card.rect = c ? c.getBoundingClientRect() : null;
      card.tilt = c ? c.hasAttribute("data-tilt") : false;
    }
  }, { passive: true });

  onPointer({
    onLeave() {
      resetMagnet(magnet.el); magnet.el = null; magnet.rect = null;
      resetCard(card.el); card.el = null; card.rect = null;
      if (spot && spotLive) { spot.classList.remove("is-live"); spotLive = false; }
    },

    onFrame() {
      const px = ptr.x, py = ptr.y;

      /* A scroll invalidates every cached viewport rectangle. Re-read at
         most one per element, once per scroll, instead of per event. */
      if (view.rectsStale) {
        view.rectsStale = false;
        if (magnet.el) magnet.rect = magnet.el.getBoundingClientRect();
        if (card.el) card.rect = card.el.getBoundingClientRect();
      }

      if (spot) {
        if (!spotLive) { spot.classList.add("is-live"); spotLive = true; }
        spot.style.transform = "translate3d(" + px + "px," + py + "px,0)";
      }

      if (magnet.el && magnet.rect) {
        const r = magnet.rect;
        const x = (px - r.left - r.width / 2) * 0.28;
        const y = (py - r.top - r.height / 2) * 0.28;
        magnet.el.style.transform =
          "translate3d(" + x.toFixed(2) + "px," + (y - 3).toFixed(2) + "px,0)";
      }

      if (card.el && card.rect) {
        const r = card.rect;
        const nx = (px - r.left) / r.width;
        const ny = (py - r.top) / r.height;

        /* custom properties drive the CSS glow; no layout, paint only */
        card.el.style.setProperty("--px", (nx * 100).toFixed(1) + "%");
        card.el.style.setProperty("--py", (ny * 100).toFixed(1) + "%");

        if (card.tilt) {
          const rx = (ny - 0.5) * -6;
          const ry = (nx - 0.5) * 6;
          card.el.style.transform =
            "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) translateY(-5px)";
        }
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* 07 · HERO PARTICLE FIELD                                            */
/* ------------------------------------------------------------------ */
/* The old loop called beginPath/stroke once per connected pair, which
   at 86 particles is up to 3,655 separate path submissions per frame,
   plus a Math.hypot per pair. This version:
     * compares squared distances, so there is no square root in the
       inner loop at all;
     * batches every line into three alpha buckets and issues one
       stroke per bucket;
     * batches every dot into a single fill;
     * reuses flat arrays instead of allocating, so the garbage
       collector never has to interrupt a frame.
   Four draw calls per frame instead of thousands. */
function initHeroCanvas() {
  const canvas = $("#heroCanvas");
  if (!canvas || !RICH) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const NEON = "163,255,18";
  const LINK = 128;
  const LINK2 = LINK * LINK;
  const REPEL = 130;
  const REPEL2 = REPEL * REPEL;
  const BUCKETS = 3;

  let w = 0, h = 0, dpr = 1;
  let px = 0, py = 0, pr = 0;       // particle x / y / radius, flat arrays
  let vx = 0, vy = 0;
  let count = 0;
  let frame = 0;
  let running = false;
  let inView = true;
  /* Canvas position in DOCUMENT space, measured once per build. Cursor
     coordinates are converted with window.scrollY, which is free, so
     the render loop never touches getBoundingClientRect. */
  let originX = 0, originY = 0;

  const seg = [];                    // one reusable array per alpha bucket
  for (let b = 0; b < BUCKETS; b++) seg.push([]);

  function build(width, height) {
    w = width; h = height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Sparser than before. Link cost grows with the square of this. */
    count = clamp(Math.round((w * h) / 26000), 18, 54);

    px = new Float32Array(count);
    py = new Float32Array(count);
    pr = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      px[i] = Math.random() * w;
      py[i] = Math.random() * h;
      vx[i] = (Math.random() - 0.5) * 0.3;
      vy[i] = (Math.random() - 0.5) * 0.3;
      pr[i] = Math.random() * 1.4 + 0.7;
    }
  }

  function draw() {
    if (!running) return;
    frame = requestAnimationFrame(draw);

    ctx.clearRect(0, 0, w, h);

    /* sample the shared cursor and convert it into canvas space */
    const hasPointer = ptr.active;
    const cx = ptr.x + window.scrollX - originX;
    const cy = ptr.y + window.scrollY - originY;

    /* ---- integrate ---- */
    for (let i = 0; i < count; i++) {
      let x = px[i] + vx[i];
      let y = py[i] + vy[i];

      if (x < -20) x = w + 20; else if (x > w + 20) x = -20;
      if (y < -20) y = h + 20; else if (y > h + 20) y = -20;

      if (hasPointer) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < REPEL2 && d2 > 0.01) {
          const inv = 0.7 / Math.sqrt(d2);   // one sqrt, only when close
          x += dx * inv;
          y += dy * inv;
        }
      }

      px[i] = x;
      py[i] = y;
    }

    /* ---- links, bucketed by distance, one stroke per bucket ---- */
    for (let i = 0; i < count; i++) {
      const xi = px[i], yi = py[i];
      for (let j = i + 1; j < count; j++) {
        const dx = xi - px[j];
        if (dx > LINK || dx < -LINK) continue;      // cheap reject
        const dy = yi - py[j];
        if (dy > LINK || dy < -LINK) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK2) continue;

        const b = (d2 / LINK2 * BUCKETS) | 0;
        const s = seg[b < BUCKETS ? b : BUCKETS - 1];
        s.push(xi, yi, px[j], py[j]);
      }
    }

    ctx.lineWidth = 1;
    for (let b = 0; b < BUCKETS; b++) {
      const s = seg[b];
      if (s.length) {
        ctx.beginPath();
        for (let k = 0; k < s.length; k += 4) {
          ctx.moveTo(s[k], s[k + 1]);
          ctx.lineTo(s[k + 2], s[k + 3]);
        }
        ctx.strokeStyle = "rgba(" + NEON + "," + (0.17 * (1 - b / BUCKETS)).toFixed(3) + ")";
        ctx.stroke();
        s.length = 0;              // reuse the array, allocate nothing
      }
    }

    /* ---- dots, one fill for the whole field ---- */
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      ctx.moveTo(px[i] + pr[i], py[i]);
      ctx.arc(px[i], py[i], pr[i], 0, 6.283185307179586);
    }
    ctx.fillStyle = "rgba(" + NEON + ",.55)";
    ctx.fill();
  }

  const start = () => {
    if (running || !inView || document.hidden) return;
    running = true;
    draw();
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(frame);
  };

  /* Mobile browsers fire `resize` constantly as the URL bar collapses.
     Rebuilding the field on each of those is pure waste, so only a real
     width change or a large height change counts. */
  const measureOrigin = () => {
    const rect = canvas.getBoundingClientRect();
    originX = rect.left + window.scrollX;
    originY = rect.top + window.scrollY;
    return rect;
  };

  const onResize = debounce(() => {
    const rect = measureOrigin();
    if (Math.abs(rect.width - w) < 2 && Math.abs(rect.height - h) < 90) return;
    const wasRunning = running;
    stop();
    build(rect.width, rect.height);
    if (wasRunning) start();
  }, 220);

  const rect0 = measureOrigin();
  build(rect0.width, rect0.height);
  start();

  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("load", measureOrigin, { once: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (inView) start(); else stop();
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });
}

/* ------------------------------------------------------------------ */
/* 08 · HEADLINE ROTATOR                                               */
/* ------------------------------------------------------------------ */
function initRotator() {
  const words = $$(".rotator__word");
  if (words.length < 2 || REDUCED) return;

  let i = 0;
  let timer = 0;

  const step = () => {
    words[i].classList.remove("is-active");
    i = (i + 1) % words.length;
    words[i].classList.add("is-active");
  };

  const start = () => { if (!timer) timer = setInterval(step, 2600); };
  const stop = () => { clearInterval(timer); timer = 0; };

  start();

  /* A timer that keeps firing in a background tab is a battery leak. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  /* Stop once the hero has scrolled away; there is nothing to see. */
  const hero = $(".hero");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) start(); else stop();
    }, { threshold: 0 }).observe(hero);
  }
}

/* ------------------------------------------------------------------ */
/* 09 · ANIMATED COUNTERS                                              */
/* ------------------------------------------------------------------ */
function initCounters() {
  const nums = $$("[data-count]");
  if (!nums.length) return;

  const run = el => {
    const target = parseFloat(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || "";
    if (REDUCED) { el.textContent = target + suffix; return; }

    const duration = 1400;
    const startedAt = performance.now();
    let last = -1;

    const step = now => {
      const t = clamp((now - startedAt) / duration, 0, 1);
      const value = Math.round(target * easeOutCubic(t));
      if (value !== last) {          // skip redundant text writes
        last = value;
        el.textContent = value + suffix;
      }
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (!("IntersectionObserver" in window)) { nums.forEach(run); return; }

  let remaining = nums.length;
  const io = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      run(entry.target);
      obs.unobserve(entry.target);
      if (--remaining <= 0) obs.disconnect();
    }
  }, { threshold: 0.5 });

  for (const el of nums) io.observe(el);
}

/* ------------------------------------------------------------------ */
/* 10 · CONTACT FORM                                                   */
/* ------------------------------------------------------------------ */
const BOOKING_URL = "https://calendar.app.google/h3mkX4AewUQiM3AU6";
const INBOX = "management@remotie.co";

function initContactForm() {
  const form = $("#contactForm");
  if (!form) return;

  const status = $("#formStatus");
  const submit = $("#formSubmit");
  const fields = ["name", "email", "phone", "location", "query"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const PHONE_RE = /^[+()\d][\d\s\-().]{6,23}$/;

  const errorFor = input => $('[data-error-for="' + input.id + '"]', form);
  const wrap = input => input.closest(".field");

  const validate = input => {
    const value = input.value.trim();
    let message = "";

    if (!value) {
      message = "This field is required.";
    } else if (input.id === "email" && !EMAIL_RE.test(value)) {
      message = "Enter a valid email address, for example you@company.com";
    } else if (input.id === "phone" && !PHONE_RE.test(value)) {
      message = "Enter a reachable phone number with the country code.";
    } else if (input.id === "name" && value.length < 2) {
      message = "Please enter your full name.";
    } else if (input.id === "location" && value.length < 2) {
      message = "City and country helps us match your timezone.";
    } else if (input.id === "query" && value.length < 10) {
      message = "A sentence or two about your goals, please.";
    }

    const box = wrap(input);
    const slot = errorFor(input);
    if (box) {
      box.classList.toggle("is-invalid", Boolean(message));
      box.classList.toggle("is-valid", !message);
    }
    if (slot && slot.textContent !== message) slot.textContent = message;
    return !message;
  };

  /* two delegated listeners rather than ten */
  form.addEventListener("blur", e => {
    if (fields.includes(e.target)) validate(e.target);
  }, true);

  form.addEventListener("input", e => {
    const box = fields.includes(e.target) ? wrap(e.target) : null;
    if (box && box.classList.contains("is-invalid")) validate(e.target);
  });

  const say = (message, kind) => {
    if (!status) return;
    status.className = "form__status is-shown " + (kind === "ok" ? "is-ok" : "is-err");
    status.innerHTML = message;
  };

  const busy = on => {
    if (!submit) return;
    submit.classList.toggle("is-busy", on);
    submit.disabled = on;
    const label = $(".btn__label", submit);
    if (label) label.textContent = on ? "Sending" : "Send Enquiry";
  };

  /* Used when the network or the endpoint is unavailable. */
  const mailtoFallback = data => {
    const body =
      "Name: " + data.name + "\n" +
      "Email: " + data.email + "\n" +
      "Phone: " + data.phone + "\n" +
      "Location: " + data.location + "\n\n" +
      "Enquiry:\n" + data.query + "\n";
    window.location.href =
      "mailto:" + INBOX +
      "?subject=" + encodeURIComponent("New enquiry from " + data.name) +
      "&body=" + encodeURIComponent(body);

    say(
      "Your email app is opening with the message ready to send. " +
      'Would rather skip it? <a href="' + BOOKING_URL + '" target="_blank" rel="noopener noreferrer">Book a meeting instead</a>.',
      "ok"
    );
    toast("Email draft opened. Just hit send.");
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();

    /* honeypot: accept bot submissions silently and do nothing */
    const trap = form.querySelector('[name="_gotcha"]');
    if (trap && trap.value) return;

    let ok = true;
    for (const f of fields) { if (!validate(f)) ok = false; }

    if (!ok) {
      const firstBad = fields.find(f => {
        const box = wrap(f);
        return box && box.classList.contains("is-invalid");
      });
      if (firstBad) {
        firstBad.focus({ preventScroll: true });
        firstBad.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
      }
      say("Please complete the highlighted fields before sending.", "err");
      return;
    }

    const data = {};
    for (const f of fields) data[f.id] = f.value.trim();

    if (!form.action || form.action.indexOf("formspree.io") === -1) {
      mailtoFallback(data);
      return;
    }

    busy(true);
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      });

      if (!res.ok) throw new Error("Formspree responded with " + res.status);

      form.reset();
      for (const f of $$(".field", form)) f.classList.remove("is-valid", "is-invalid");
      say(
        "Thank you, your enquiry is in. We reply within one business day. " +
        'Want to move faster? <a href="' + BOOKING_URL + '" target="_blank" rel="noopener noreferrer">Book a meeting now</a>.',
        "ok"
      );
      toast("Enquiry sent. We will be in touch shortly.");
    } catch (err) {
      say(
        "That did not send. Email us directly at " +
        '<a href="mailto:' + INBOX + '">' + INBOX + '</a> or ' +
        '<a href="' + BOOKING_URL + '" target="_blank" rel="noopener noreferrer">book a meeting</a>.',
        "err"
      );
      toast("Message could not be sent. Please use email or the calendar.");
    } finally {
      busy(false);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 11 · IMAGE FALLBACK, YEAR, BOOKING TELEMETRY HOOK                   */
/* ------------------------------------------------------------------ */
/* `error` does not bubble, so one capturing listener on the document
   covers every image on the page. If a logo file is missing the card
   shows the branded monogram instead of a broken-image icon. */
function swapToMark(img) {
  if (!img || img.dataset.swapped || !img.dataset.fallback) return;
  img.dataset.swapped = "1";
  const mark = document.createElement("span");
  mark.className = img.classList.contains("client__logo") ? "client__mark" : "logo-fallback";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = img.dataset.fallback;
  img.replaceWith(mark);
}

function initImageFallback() {
  document.addEventListener("error", e => {
    const t = e.target;
    if (t && t.tagName === "IMG") swapToMark(t);
  }, true);

  /* catch anything that already failed before this script ran */
  for (const img of $$("img[data-fallback]")) {
    if (img.complete && img.naturalWidth === 0) swapToMark(img);
  }
}

function initMisc() {
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* In-page scrolling is handled entirely by CSS (`scroll-behavior`
     plus `scroll-padding-top`). The previous build attached a click
     handler to every anchor on the page to do the same thing in JS. */

  /* One delegated hook for booking-click analytics. */
  document.addEventListener("click", e => {
    if (!e.target.closest || !e.target.closest("[data-book]")) return;
    if (typeof window.gtag === "function") {
      window.gtag("event", "book_meeting_click", { event_category: "conversion" });
    }
    if (typeof window.fbq === "function") window.fbq("track", "Schedule");
  }, { passive: true });
}

/* ------------------------------------------------------------------ */
/* 12 · BOOT                                                           */
/* ------------------------------------------------------------------ */
function boot() {
  const root = document.documentElement;
  root.classList.add("js");
  root.classList.remove("no-js");

  const tasks = [
    initPreloader,
    initReveals,
    initPointerBus,
    initNavigation,
    initPointerEffects,
    initHeroCanvas,
    initRotator,
    initCounters,
    initContactForm,
    initImageFallback,
    initMisc
  ];

  for (const fn of tasks) {
    try { fn(); }
    catch (err) { console.error("[Remotie] " + fn.name + " failed:", err); }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
