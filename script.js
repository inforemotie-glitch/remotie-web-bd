/* =====================================================================
   REMOTIE  —  script.js
   Vanilla ES6. No dependencies, no frameworks, no build step.
   ---------------------------------------------------------------------
   01 Helpers            07 Hero particle field
   02 Preloader          08 Headline rotator
   03 Scroll reveals     09 Animated counters
   04 Header & progress  10 Contact form (Formspree + mailto fallback)
   05 Nav tabs & spy     11 Logo fallback + misc
   06 Pointer effects    12 Boot
   ===================================================================== */
"use strict";

/* ------------------------------------------------------------------ */
/* 01 · HELPERS                                                        */
/* ------------------------------------------------------------------ */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE_POINTER = window.matchMedia("(pointer: fine)").matches;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

/** Throttle to one call per animation frame. */
function raf(fn) {
  let ticking = false;
  return (...args) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; fn(...args); });
  };
}

/** Debounce by `wait` ms. */
function debounce(fn, wait = 180) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/** Bottom-centre toast. */
const toast = (() => {
  const el = $("#toast");
  let timer;
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
  const tick = setInterval(() => {
    progress = Math.min(progress + Math.random() * 18 + 6, 92);
    if (fill) fill.style.width = progress + "%";
  }, 140);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(tick);
    if (fill) fill.style.width = "100%";
    setTimeout(() => {
      loader.classList.add("is-done");
      document.body.classList.add("is-ready");
      setTimeout(() => loader.remove(), 800);
    }, 260);
  };

  if (document.readyState === "complete") setTimeout(finish, 400);
  else window.addEventListener("load", () => setTimeout(finish, 400), { once: true });

  // Safety net: never trap the visitor behind the loader.
  setTimeout(finish, 4500);
}

/* ------------------------------------------------------------------ */
/* 03 · SCROLL REVEALS                                                 */
/* ------------------------------------------------------------------ */
function initReveals() {
  const items = $$("[data-reveal]");
  if (!items.length) return;

  const showAll = () => items.forEach(el => el.classList.add("is-visible"));
  if (REDUCED || !("IntersectionObserver" in window)) return showAll();

  items.forEach(el => {
    const delay = parseInt(el.dataset.delay || "0", 10);
    if (delay) el.style.setProperty("--d", delay + "ms");
  });

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  items.forEach(el => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* 04 · HEADER STATE, SCROLL PROGRESS, BACK-TO-TOP                     */
/* ------------------------------------------------------------------ */
function initScrollChrome() {
  const header = $("#header");
  const bar = $("#scrollBar");
  const toTop = $("#toTop");

  const update = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    const max = document.documentElement.scrollHeight - window.innerHeight;

    if (header) header.classList.toggle("is-stuck", y > 24);
    if (bar) bar.style.width = (max > 0 ? clamp((y / max) * 100, 0, 100) : 0) + "%";
    if (toTop) toTop.classList.toggle("is-shown", y > window.innerHeight * 0.8);
  };

  window.addEventListener("scroll", raf(update), { passive: true });
  window.addEventListener("resize", debounce(update, 120));
  update();

  if (toTop) {
    toTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
    });
  }
}

/* ------------------------------------------------------------------ */
/* 05 · NAV TABS, SLIDING PILL, SCROLL SPY, MOBILE MENU                */
/* ------------------------------------------------------------------ */
function initNavigation() {
  const links = $$("[data-nav]");
  const pill = $("#navPill");
  const sections = links
    .map(l => document.getElementById(l.getAttribute("href").slice(1)))
    .filter(Boolean);

  /* --- sliding pill behind the active tab --- */
  const movePill = target => {
    if (!pill || !target) return;
    pill.style.width = target.offsetWidth + "px";
    pill.style.transform = "translate(" + target.offsetLeft + "px,-50%)";
    pill.classList.add("is-ready");
  };

  const setActive = id => {
    let active = null;
    links.forEach(link => {
      const on = link.getAttribute("href") === "#" + id;
      link.classList.toggle("is-active", on);
      if (on) active = link;
    });
    movePill(active || links[0]);
  };

  links.forEach(link => {
    link.addEventListener("mouseenter", () => movePill(link));
    link.addEventListener("focus", () => movePill(link));
  });
  const nav = $("#nav");
  if (nav) nav.addEventListener("mouseleave", () => movePill($(".nav__link.is-active")));

  /* --- scroll spy --- */
  const spy = () => {
    const line = window.scrollY + window.innerHeight * 0.32;
    let current = sections[0];
    sections.forEach(sec => { if (sec.offsetTop <= line) current = sec; });
    // bottom of page always highlights the last visible tab target
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
      current = sections[sections.length - 1];
    }
    if (current) setActive(current.id);
  };

  window.addEventListener("scroll", raf(spy), { passive: true });
  window.addEventListener("resize", debounce(() => {
    movePill($(".nav__link.is-active"));
    spy();
  }, 140));
  window.addEventListener("load", () => setTimeout(spy, 60));
  spy();

  /* --- mobile menu --- */
  const burger = $("#burger");
  const menu = $("#mobileMenu");
  if (!burger || !menu) return;

  const closeMenu = () => {
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open menu");
    menu.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    setTimeout(() => { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 420);
  };

  const openMenu = () => {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add("is-open"));
    burger.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Close menu");
    document.body.classList.add("is-locked");
  };

  burger.addEventListener("click", () => {
    menu.classList.contains("is-open") ? closeMenu() : openMenu();
  });
  $$("[data-mobile-link]").forEach(a => a.addEventListener("click", closeMenu));
  menu.addEventListener("click", e => { if (e.target === menu) closeMenu(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) closeMenu();
  });
}

/* ------------------------------------------------------------------ */
/* 06 · POINTER EFFECTS — spotlight, magnetic buttons, card tilt       */
/* ------------------------------------------------------------------ */
function initPointerEffects() {
  if (REDUCED || !FINE_POINTER) return;

  /* cursor-following ambient spotlight */
  const spot = $("#spotlight");
  if (spot) {
    const move = raf(e => {
      spot.style.setProperty("--mx", e.clientX + "px");
      spot.style.setProperty("--my", e.clientY + "px");
    });
    window.addEventListener("pointermove", move, { passive: true });
  }

  /* per-card spotlight (services + pillars) */
  $$("[data-spot], .pillar").forEach(card => {
    card.addEventListener("pointermove", e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--px", ((e.clientX - r.left) / r.width) * 100 + "%");
      card.style.setProperty("--py", ((e.clientY - r.top) / r.height) * 100 + "%");
    }, { passive: true });
  });

  /* magnetic buttons */
  $$(".magnetic").forEach(btn => {
    const strength = 0.28;
    btn.addEventListener("pointermove", e => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * strength;
      const y = (e.clientY - r.top - r.height / 2) * strength;
      btn.style.transform = "translate(" + x + "px," + (y - 3) + "px)";
    });
    btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
    btn.addEventListener("blur", () => { btn.style.transform = ""; });
  });

  /* subtle 3D tilt */
  $$("[data-tilt]").forEach(card => {
    const MAX = 6;
    card.addEventListener("pointermove", e => {
      const r = card.getBoundingClientRect();
      const rx = (((e.clientY - r.top) / r.height) - 0.5) * -MAX;
      const ry = (((e.clientX - r.left) / r.width) - 0.5) * MAX;
      card.style.transform =
        "perspective(900px) rotateX(" + rx + "deg) rotateY(" + ry + "deg) translateY(-5px)";
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });
}

/* ------------------------------------------------------------------ */
/* 07 · HERO PARTICLE FIELD                                            */
/* ------------------------------------------------------------------ */
function initHeroCanvas() {
  const canvas = $("#heroCanvas");
  if (!canvas || REDUCED) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const NEON = "163,255,18";
  let w = 0, h = 0, dpr = 1, particles = [], frame = 0, running = true;
  const pointer = { x: -9999, y: -9999 };

  const sizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const density = clamp(Math.round((w * h) / 17000), 26, 86);
    particles = Array.from({ length: density }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r: Math.random() * 1.5 + 0.7
    }));
  };

  const draw = () => {
    if (!running) return;
    frame = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;

      // gentle repulsion from the cursor
      const dx = p.x - pointer.x, dy = p.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 130 && dist > 0.01) {
        p.x += (dx / dist) * 0.7;
        p.y += (dy / dist) * 0.7;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + NEON + ",.55)";
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d > 132) continue;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = "rgba(" + NEON + "," + (0.16 * (1 - d / 132)).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  };

  let inView = true;
  const start = () => { if (!running && inView) { running = true; draw(); } };
  const stop = () => { running = false; cancelAnimationFrame(frame); };

  sizeCanvas();
  draw();

  window.addEventListener("resize", debounce(sizeCanvas, 200));
  window.addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
  }, { passive: true });
  window.addEventListener("pointerleave", () => { pointer.x = pointer.y = -9999; });

  // Pause the loop when the hero is off-screen or the tab is hidden.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      inView ? start() : stop();
    }, { threshold: 0 }).observe(canvas);
  }
  document.addEventListener("visibilitychange", () => {
    document.hidden ? stop() : start();
  });
}

/* ------------------------------------------------------------------ */
/* 08 · HEADLINE ROTATOR                                               */
/* ------------------------------------------------------------------ */
function initRotator() {
  const words = $$(".rotator__word");
  if (words.length < 2 || REDUCED) return;

  let i = 0;
  setInterval(() => {
    words[i].classList.remove("is-active");
    i = (i + 1) % words.length;
    words[i].classList.add("is-active");
  }, 2600);
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

    const duration = 1500;
    const startedAt = performance.now();

    const step = now => {
      const t = clamp((now - startedAt) / duration, 0, 1);
      el.textContent = Math.round(target * easeOutCubic(t)) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (!("IntersectionObserver" in window)) return nums.forEach(run);

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      run(entry.target);
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.5 });

  nums.forEach(el => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* 10 · CONTACT FORM — validation, Formspree, mailto fallback          */
/* ------------------------------------------------------------------ */
const BOOKING_URL = "https://calendar.app.google/h3mkX4AewUQiM3AU6";
const INBOX = "info.remotie@gmail.com";

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
      message = "Enter a valid email address, e.g. you@company.com";
    } else if (input.id === "phone" && !PHONE_RE.test(value)) {
      message = "Enter a reachable phone number with country code.";
    } else if (input.id === "name" && value.length < 2) {
      message = "Please enter your full name.";
    } else if (input.id === "location" && value.length < 2) {
      message = "City and country helps us match your timezone.";
    } else if (input.id === "query" && value.length < 10) {
      message = "A sentence or two about your goals, please.";
    }

    const box = wrap(input);
    const slot = errorFor(input);
    if (box) box.classList.toggle("is-invalid", Boolean(message));
    if (box) box.classList.toggle("is-valid", !message);
    if (slot) slot.textContent = message;
    return !message;
  };

  fields.forEach(input => {
    input.addEventListener("blur", () => validate(input));
    input.addEventListener("input", () => {
      const box = wrap(input);
      if (box && box.classList.contains("is-invalid")) validate(input);
    });
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

  /** Opens a pre-filled email when Formspree is not configured yet. */
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
      'Prefer to skip it? <a href="' + BOOKING_URL + '" target="_blank" rel="noopener noreferrer">Book a meeting instead</a>.',
      "ok"
    );
    toast("Email draft opened — just hit send.");
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();

    // honeypot: silently accept bot submissions and do nothing
    const trap = form.querySelector('[name="_gotcha"]');
    if (trap && trap.value) return;

    const results = fields.map(validate);
    if (results.includes(false)) {
      const firstBad = fields.find(f => wrap(f) && wrap(f).classList.contains("is-invalid"));
      if (firstBad) {
        firstBad.focus({ preventScroll: true });
        firstBad.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
      }
      say("Please complete the highlighted fields before sending.", "err");
      return;
    }

    const data = {};
    fields.forEach(f => { data[f.id] = f.value.trim(); });

    // Formspree endpoint not configured yet -> guaranteed mailto fallback
    if (form.action.includes("YOUR_FORM_ID")) {
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

      if (res.ok) {
        form.reset();
        $$(".field", form).forEach(f => f.classList.remove("is-valid", "is-invalid"));
        say(
          "Thank you &mdash; your enquiry is in. We reply within one business day. " +
          'Want to move faster? <a href="' + BOOKING_URL + '" target="_blank" rel="noopener noreferrer">Book a meeting now</a>.',
          "ok"
        );
        toast("Enquiry sent. We will be in touch shortly.");
      } else {
        throw new Error("Formspree responded with " + res.status);
      }
    } catch (err) {
      say(
        "That did not send. Email us directly at " +
        '<a href="mailto:' + INBOX + '">' + INBOX + '</a> or ' +
        '<a href="' + BOOKING_URL + '" target="_blank" rel="noopener noreferrer">book a meeting</a>.',
        "err"
      );
      toast("Message could not be sent — please use email or the calendar.");
    } finally {
      busy(false);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 11 · LOGO FALLBACK, YEAR, ANCHORS, BOOKING TELEMETRY HOOK           */
/* ------------------------------------------------------------------ */

/** If /Profile Picture/logo.png is missing, draw a branded monogram instead. */
function initLogoFallback() {
  $$("img[data-fallback]").forEach(img => {
    const swap = () => {
      if (img.dataset.swapped) return;
      img.dataset.swapped = "1";
      const mark = document.createElement("span");
      mark.className = "logo-fallback";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = img.dataset.fallback || "R";
      img.replaceWith(mark);
    };
    img.addEventListener("error", swap);
    if (img.complete && img.naturalWidth === 0) swap();
  });
}

function initMisc() {
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Smooth in-page scrolling that also respects reduced motion.
  $$('a[href^="#"]').forEach(link => {
    link.addEventListener("click", e => {
      const id = link.getAttribute("href");
      if (!id || id === "#" || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", id);
    });
  });

  // Single place to plug analytics for booking clicks (GA4, Meta, etc.).
  $$("[data-book]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (typeof window.gtag === "function") {
        window.gtag("event", "book_meeting_click", { event_category: "conversion" });
      }
      if (typeof window.fbq === "function") window.fbq("track", "Schedule");
    });
  });
}

/* ------------------------------------------------------------------ */
/* 12 · BOOT                                                           */
/* ------------------------------------------------------------------ */
function boot() {
  document.documentElement.classList.add("js");
  [
    initPreloader,
    initReveals,
    initScrollChrome,
    initNavigation,
    initPointerEffects,
    initHeroCanvas,
    initRotator,
    initCounters,
    initContactForm,
    initLogoFallback,
    initMisc
  ].forEach(fn => {
    try { fn(); }
    catch (err) { console.error("[Remotie] " + fn.name + " failed:", err); }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
