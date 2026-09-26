(() => {
  const root = document.documentElement;
  // A reload always starts at the gate: don't let the browser restore the old scroll position.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  scrollTo(0, 0);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fit the 393px mock column to narrower phones ---------- */
  // One mock pixel, in real pixels. A phone gets the board stretched to its full width, so no
  // screen ends in a strip of bare paper; a browser window keeps the mock's own size at most.
  //
  // The height is locked to what the screen was when the page opened. In-app browsers — Telegram's
  // above all — shrink their address bar as you scroll down and bring it back as you scroll up,
  // which changes the viewport height by a hundred pixels or so. Anything sized off that height
  // would then be re-laid-out mid-scroll: backgrounds re-crop, text slides, and the page jumps
  // under the finger. So the height only ever changes when the width does, i.e. on rotation.
  let lockedWidth = 0;
  let viewportHeight = innerHeight;
  const fit = () => {
    const width = root.clientWidth;
    if (width === lockedWidth) return; // the address bar moved; nothing here needs redoing
    lockedWidth = width;
    viewportHeight = innerHeight;
    const portraitPhone = width <= 600 && viewportHeight > width;
    const k = portraitPhone ? width / 393 : Math.min(1, width / 393, viewportHeight / 852);
    root.style.setProperty("--k", k.toFixed(4));
    root.style.setProperty("--vh", `${viewportHeight}px`); // the pinned screen only
  };
  fit();
  addEventListener("resize", fit);
  addEventListener("orientationchange", () => { lockedWidth = 0; setTimeout(fit, 120); });

  /* ---------- Preloader: the gate only shows once its art is really there ---------- */
  const loader = document.getElementById("loader");
  // Only what the gate itself shows. The clip, the untied still and the screens below stream in
  // while the guest is still looking at the sealed bow.
  const FIRST_SCREEN = [
    "assets/img/gate-tied.jpg",
    "assets/img/seal-left.png",
    "assets/img/seal-right.png",
  ];
  let loadedCount = 0;
  const steps = FIRST_SCREEN.length + 1; // the gate's own art, plus the fonts
  const bump = () => loader.style.setProperty("--load", (++loadedCount / steps).toFixed(3));
  const waitForImage = (src) => new Promise((done) => {
    const probe = new Image();
    probe.onload = probe.onerror = () => { bump(); done(); };
    probe.src = src; // already requested by the markup, so this resolves off the same load
  });
  // The gate carries no type, so the fonts are given a moment out of politeness and then left to
  // arrive on their own rather than holding the invitation shut.
  const fontsSettled = Promise.race([
    (document.fonts?.ready ?? Promise.resolve()),
    new Promise((done) => setTimeout(done, 2000)),
  ]).then(bump);
  const firstScreenReady = Promise.all([...FIRST_SCREEN.map(waitForImage), fontsSettled]);
  // Never hold the page hostage to a slow asset: after 8s the invitation opens regardless.
  Promise.race([firstScreenReady, new Promise((done) => setTimeout(done, 8000))]).then(() => {
    loader.style.setProperty("--load", "1");
    loader.classList.add("is-done");
    setTimeout(() => loader.remove(), 800);
    // Only now does the untying clip start downloading: it is not needed until the gate is tapped,
    // and holding it back keeps the first screen light on a phone.
    const clip = document.querySelector(".gate__clip");
    if (clip) { clip.preload = "auto"; clip.load(); }
    // Same for the untied still: it is what the clip hands over to, long after this moment.
    for (const art of document.querySelectorAll(".gate__art[data-src]")) art.src = art.dataset.src;
    const track = document.querySelector(".music");
    if (track) { track.preload = "auto"; track.load(); } // ready for the tap that opens the gate
  });

  /* ---------- Language ---------- */
  const LANGS = ["en", "ru", "uz"];
  const lang = {
    current: "en",
    t(key) { return (window.I18N[this.current] || {})[key] ?? window.I18N.en[key] ?? key; },
  };

  // Russian needs a script face with Cyrillic; it is fetched the moment Russian is chosen.
  const loadRussianScript = () => {
    if (document.getElementById("marck")) return;
    const link = document.createElement("link");
    link.id = "marck";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Marck+Script&display=swap";
    document.head.appendChild(link);
  };

  const applyLang = (code) => {
    lang.current = LANGS.includes(code) ? code : "en";
    root.lang = lang.current;
    if (lang.current === "ru") loadRussianScript();
    document.title = lang.t("meta.title");
    for (const el of document.querySelectorAll("[data-i18n]")) {
      const value = lang.t(el.dataset.i18n);
      if (el.innerHTML !== value) el.innerHTML = value;
    }
    for (const el of document.querySelectorAll("[data-i18n-attr]")) {
      for (const pair of el.dataset.i18nAttr.split(",")) {
        const [attr, key] = pair.split(":");
        el.setAttribute(attr.trim(), lang.t(key.trim()));
      }
    }
    // The envelope's label depends on its state, so it is set here rather than from the attribute.
    envelope?.setAttribute("aria-label", lang.t(envelope.classList.contains("is-open") ? "save.closeAria" : "save.openAria"));
    document.querySelector(".lang__code").textContent = lang.current.toUpperCase();
    for (const option of document.querySelectorAll(".lang__menu [data-lang]")) {
      option.setAttribute("aria-selected", String(option.dataset.lang === lang.current));
    }
    try { localStorage.setItem("bow:lang", lang.current); } catch {}
  };

  const langBox = document.querySelector(".lang");
  const langButton = langBox.querySelector(".lang__button");
  const langMenu = langBox.querySelector(".lang__menu");
  const closeLangMenu = () => {
    langMenu.hidden = true;
    langBox.classList.remove("is-open");
    langButton.setAttribute("aria-expanded", "false");
  };
  langButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = langMenu.hidden;
    langMenu.hidden = !open;
    langBox.classList.toggle("is-open", open);
    langButton.setAttribute("aria-expanded", String(open));
  });
  langMenu.addEventListener("click", (e) => {
    const option = e.target.closest("[data-lang]");
    if (!option) return;
    applyLang(option.dataset.lang);
    closeLangMenu();
  });
  addEventListener("click", (e) => { if (!langBox.contains(e.target)) closeLangMenu(); });

  /* ---------- Top bar: hides going down, comes back going up ---------- */
  const topbar = document.getElementById("topbar");
  // The bar takes the colour of whatever screen is under it, so it never sits there as a slab of
  // the wrong shade — least of all a cream one over the wine screen.
  const TINTS = { "screen--wine": "#6b303f", "screen--ivory": "#fcf9f3", "screen--hero": "#f5ede0" };
  const screens = [...document.querySelectorAll(".screen")];
  const tintBar = (y) => {
    const under = screens.find((s) => s.offsetTop <= y + 30 && y + 30 < s.offsetTop + s.offsetHeight);
    if (!under) return;
    const tone = Object.keys(TINTS).find((name) => under.classList.contains(name));
    topbar.style.setProperty("--bar-tint", TINTS[tone] || "#f7f1e7");
    topbar.classList.toggle("is-dark", tone === "screen--wine");
  };
  let lastY = scrollY;
  const onScroll = () => {
    const y = Math.max(0, scrollY);
    const down = y > lastY + 4;
    const up = y < lastY - 4;
    if (down && y > 120) topbar.classList.add("is-hidden");
    else if (up || y < 60) topbar.classList.remove("is-hidden");
    topbar.classList.toggle("is-solid", y > 40); // a backdrop as soon as text could run under it
    tintBar(y);
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- The page stops at the envelope until it is opened ---------- */
  // Rather than pulling the scroll back, which fights a phone's momentum, the screens below the
  // envelope are taken out of the document, so the page genuinely ends there.
  root.classList.add("is-held");
  const releaseAfterDate = () => {
    if (!root.classList.contains("is-held")) return;
    root.classList.remove("is-held");
    measurePin();   // those screens had no size while they were out of the document
    measureBows();
    drawRibbon();
  };

  /* ---------- Smooth scrolling (desktop wheels; phones already glide) ---------- */
  const smooth = { target: scrollY, running: false };
  const maxScroll = () => document.body.scrollHeight - viewportHeight;
  const useSmooth = matchMedia("(pointer: fine)").matches && !reduceMotion;
  if (useSmooth) {
    const step = () => {
      const delta = smooth.target - scrollY;
      if (Math.abs(delta) < 0.5) { smooth.running = false; scrollTo(0, smooth.target); return; }
      scrollTo(0, scrollY + delta * 0.14);
      requestAnimationFrame(step);
    };
    const glideTo = (y) => {
      smooth.target = Math.max(0, Math.min(y, maxScroll()));
      if (!smooth.running) { smooth.running = true; requestAnimationFrame(step); }
    };
    addEventListener("wheel", (e) => {
      if (root.classList.contains("is-locked") || e.ctrlKey) return;
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewportHeight : 1;
      glideTo((smooth.running ? smooth.target : scrollY) + e.deltaY * lines);
    }, { passive: false });
    addEventListener("scroll", () => { if (!smooth.running) smooth.target = scrollY; }, { passive: true });
    window.glideTo = glideTo;
  }
  const scrollToY = (y) => {
    if (useSmooth) window.glideTo(y);
    else scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
  };
  // Anchors are handled here so they glide with the same easing as the wheel.
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    link.addEventListener("click", (e) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      scrollToY(target.getBoundingClientRect().top + scrollY);
    });
  }

  /* ---------- Blocks that lift in on first view ---------- */
  root.classList.add("is-animated");
  const riseObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      riseObserver.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -12% 0px" });
  // The programme rows come in with their own bow instead, so they stay out of the observer.
  document.querySelectorAll(".rise:not(.moment)").forEach((el) => riseObserver.observe(el));

  /* ---------- 4. The thread that ties itself into bows ---------- */
  const ribbon = document.querySelector(".timeline__ribbon");
  const moments = [...document.querySelectorAll(".moment")];
  const bows = moments.map((row) => ({ row, slot: row.querySelector(".moment__marker"), paths: [], knot: 0 }));

  // Offsets, not rects: the rows fade upwards, and that must not move where the bows sit.
  const program = document.getElementById("program");

  // How much scrolling the whole timeline takes, in stage pixels.
  const scrollSpan = () => ribbon.offsetHeight * TRAVEL + bows.length * DWELL + TAIL;

  // The pinned screen is as tall as the viewport (in CSS, so the address bar can't move it) with
  // the animation's length added to the track below it.
  const measurePin = () => {
    const k = parseFloat(getComputedStyle(root).getPropertyValue("--k")) || 1;
    // The board is scaled to the pinned screen's own height when the phone is shorter than the
    // mock, so the last bow is never cut off the bottom.
    const pin = program.querySelector(".pin");
    const board = program.querySelector(".stage");
    const fits = Math.min(k, (viewportHeight || 852) / 780);
    board.style.zoom = fits.toFixed(4);
    program.style.setProperty("--pin-run", `${scrollSpan() * fits}px`);
  };

  const measureBows = () => {
    const stageTop = (el) => {
      let y = 0;
      for (let node = el; node && !node.classList.contains("stage"); node = node.offsetParent) y += node.offsetTop;
      return y;
    };
    const ribbonTop = stageTop(ribbon);
    for (const bow of bows) bow.knot = stageTop(bow.slot) + 12.5 - ribbonTop; // 12.5 = the knot in the icon
  };

  // One fetch for the drawing every bow shares; if it fails the flat icon simply stays.
  fetch("assets/icons/ribbon-marker.svg").then((r) => r.text()).then((markup) => {
    const template = document.createElement("div");
    template.innerHTML = markup;
    const svg = template.querySelector("svg");
    for (const bow of bows) {
      const copy = svg.cloneNode(true);
      bow.slot.replaceChildren(copy);
      bow.slot.classList.add("is-drawn");
      bow.paths = [...copy.querySelectorAll("path[stroke]")].map((path) => {
        const length = path.getTotalLength();
        path.style.strokeDasharray = length;
        path.style.strokeDashoffset = length;
        return { path, length };
      });
    }
    measureBows();
    drawRibbon();
  }).catch(() => {});

  // While the screen is pinned, the scroll pulls the thread down, stopping at every bow for the
  // stretch where it ties itself. Pacing, in stage pixels of scrolling:
  //   DWELL    — how much scrolling one bow is tied over
  //   TRAVEL   — share of the distance to the next bow that costs scrolling (lower = quicker run)
  //   WORDS_AT — how far into a bow's stretch its time and title turn up, so they can be read
  //              while the bow finishes rather than after it
  const DWELL = 480;
  const TRAVEL = 0.3;
  const WORDS_AT = 0.15;
  const TAIL = 160; // a moment on the finished timeline before the screen lets go
  const DRAWN_BY = 0.95; // the bow keeps drawing to the end, so no stretch of scrolling is idle
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const drawRibbon = () => {
    if (!ribbon.offsetHeight) return;

    // Layout pixels, so the rows' own fade-in cannot move the measurements around.
    const run = Math.max(1, program.offsetHeight - viewportHeight);
    const q = clamp01(-program.getBoundingClientRect().top / run);
    let pulled = q * scrollSpan();
    let thread = 0;
    let from = 0;
    const ties = [];
    for (const bow of bows) {
      const knot = bow.knot; // where this bow sits along the thread
      const gap = Math.max(0, knot - from) * TRAVEL;
      if (pulled < gap) { thread = from + Math.max(0, pulled) / TRAVEL; ties.push(0); pulled = -Infinity; continue; }
      if (pulled === -Infinity) { ties.push(0); continue; }
      pulled -= gap;
      thread = knot;
      ties.push(clamp01(pulled / DWELL));
      pulled -= DWELL;
      from = knot;
      if (pulled < 0) pulled = -Infinity;
    }
    if (pulled > 0) thread = from + pulled / TRAVEL;

    ribbon.style.setProperty("--p", reduceMotion ? 1 : clamp01(thread / ribbon.offsetHeight).toFixed(4));
    for (const [i, bow] of bows.entries()) {
      const tied = reduceMotion ? 1 : ties[i];
      bow.row.classList.toggle("is-in", tied > WORDS_AT);
      const drawn = clamp01(tied / DRAWN_BY);
      for (const [j, { path, length }] of bow.paths.entries()) {
        // Loops first, then the tails, then the knot — the order a bow is really tied in.
        const share = clamp01((drawn - j * 0.26) / 0.48);
        path.style.strokeDashoffset = length * (1 - share);
      }
    }
  };
  let ribbonQueued = false;
  const queueRibbon = () => {
    if (ribbonQueued) return;
    ribbonQueued = true;
    requestAnimationFrame(() => { ribbonQueued = false; drawRibbon(); });
  };
  addEventListener("scroll", queueRibbon, { passive: true });
  addEventListener("resize", () => { measurePin(); measureBows(); queueRibbon(); });
  measurePin();
  measureBows();
  drawRibbon();


  /* ---------- Music: a real toggle, with a fade and no pretending when there is no track ---------- */
  const music = document.querySelector(".music");
  const sound = document.querySelector(".sound");
  let fade = null;
  // iPhones ignore volume on an audio element — it is the hardware's business there — so a fade
  // that waits for the volume to arrive would wait forever, and the music would never stop.
  let volumeObeys = null;
  const canFade = () => {
    if (volumeObeys === null) {
      music.volume = 0.5;
      volumeObeys = Math.abs(music.volume - 0.5) < 0.01;
      music.volume = 1;
    }
    return volumeObeys;
  };
  const fadeTo = (to, done) => {
    clearInterval(fade);
    if (!canFade()) { done?.(); return; } // no fade to be had: just do the thing
    let steps = 0;
    fade = setInterval(() => {
      music.volume = Math.max(0, Math.min(1, music.volume + (to > music.volume ? 0.08 : -0.08)));
      if (Math.abs(music.volume - to) < 0.08 || ++steps > 20) {
        music.volume = to;
        clearInterval(fade);
        done?.();
      }
    }, 40);
  };
  const markNoTrack = () => {
    sound.classList.add("is-empty");
    sound.setAttribute("aria-pressed", "false");
    sound.setAttribute("aria-disabled", "true");
    sound.setAttribute("aria-label", lang.t("sound.missing"));
  };
  const markTrackFound = () => {
    sound.classList.remove("is-empty");
    sound.removeAttribute("aria-disabled");
    sound.setAttribute("aria-label", lang.t("sound.label"));
  };
  music.addEventListener("error", markNoTrack);
  music.addEventListener("canplay", markTrackFound);

  const playMusic = () => {
    if (canFade()) music.volume = 0;
    return music.play().then(() => {
      markTrackFound();
      sound.setAttribute("aria-pressed", "true");
      fadeTo(1);
    }, (err) => {
      // Blocked autoplay just means "not yet"; a missing or broken file is what dims the button.
      if (err?.name === "NotAllowedError") sound.setAttribute("aria-pressed", "false");
      else markNoTrack();
    });
  };
  const stopMusic = () => {
    sound.setAttribute("aria-pressed", "false");
    fadeTo(0, () => music.pause());
    // Whatever the fade does or doesn't manage, the music is stopped.
    setTimeout(() => { if (sound.getAttribute("aria-pressed") !== "true") music.pause(); }, 900);
  };
  // A click always tries to play: if a track turns up later, the button comes back to life.
  sound.addEventListener("click", () => {
    sound.getAttribute("aria-pressed") === "true" ? stopMusic() : playMusic();
  });

  /* ---------- 0. Gate: untie, drop the seal, part the lace ---------- */
  const gate = document.getElementById("gate");
  let opened = false;
  const partGate = () => {
    if (gate.classList.contains("is-parting")) return;
    // The untied still goes up first and the clip is only taken away once it has been painted,
    // otherwise the tied still shows through in between.
    gate.classList.add("is-open");
    requestAnimationFrame(() => requestAnimationFrame(() => gate.classList.remove("is-playing")));
    setTimeout(() => {
      gate.classList.add("is-parting");
      root.classList.add("is-revealed");
    }, 60);
    setTimeout(finishGate, 1560);
  };
  const finishGate = () => {
    gate.remove();
    root.classList.remove("is-locked");
    root.classList.add("is-revealed");
  };
  // The whole opening, in beats: the wax shudders, cracks, both halves drop away, the loosened
  // bow sinks into a loose ribbon, and only then do the lace leaves part.
  const GATE_BEATS = [
    [0, "is-cracking"],   // the seal takes the strain
    [240, "is-broken"],   // it snaps along the crack
    [360, "is-falling"],  // the halves are thrown out of frame
    [640, "is-playing"],  // the filmed untying takes over from the still
  ];
  const gateClip = gate.querySelector(".gate__clip");
  const openGate = () => {
    if (opened) return;
    opened = true;
    playMusic(); // the tap is the user gesture browsers need before audio can start
    if (reduceMotion) {
      gate.classList.add("is-open", "is-parting");
      root.classList.add("is-revealed");
      finishGate();
      return;
    }
    for (const [at, beat] of GATE_BEATS) setTimeout(() => gate.classList.add(beat), at);
    setTimeout(() => gateClip.play().catch(partGate), 640);
    // When the ribbon has settled the still takes over again and the leaves slide aside.
    gateClip.addEventListener("ended", partGate, { once: true });
    gateClip.addEventListener("error", partGate, { once: true });
  };
  gate.addEventListener("click", openGate);
  gate.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGate(); }
  });
  gate.focus({ preventScroll: true });

  // ?open skips the gate — handy while working on the screens below it.
  if (new URLSearchParams(location.search).has("open")) {
    opened = true;
    finishGate();
  }

  /* ---------- 3. Save the date envelope ---------- */
  const envelope = document.querySelector(".envelope");
  envelope.addEventListener("click", () => {
    const open = !envelope.classList.contains("is-open");
    if (open) releaseAfterDate(); // once opened the page carries on, even if it is shut again
    envelope.classList.toggle("is-open", open);
    envelope.closest(".screen").classList.toggle("is-open", open);
    envelope.setAttribute("aria-expanded", String(open));
    envelope.setAttribute("aria-label", lang.t(open ? "save.closeAria" : "save.openAria"));
  });

  /* ---------- 5. Calendar / map sheets ---------- */
  let lastFocus = null;
  const openSheet = (sheet) => {
    lastFocus = document.activeElement;
    sheet.hidden = false;
    sheet.getBoundingClientRect(); // commit the closed state so the slide-up transitions
    sheet.classList.add("is-open");
    root.classList.add("is-locked");
    sheet.querySelector(".sheet__close").focus({ preventScroll: true });
  };
  const closeSheet = (sheet) => {
    sheet.classList.remove("is-open");
    root.classList.remove("is-locked");
    setTimeout(() => { sheet.hidden = true; }, reduceMotion ? 0 : 450);
    lastFocus?.focus({ preventScroll: true });
  };
  document.querySelectorAll("[data-sheet]").forEach((button) => {
    const sheet = document.getElementById(`sheet-${button.dataset.sheet}`);
    button.addEventListener("click", () => openSheet(sheet));
    sheet.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", () => closeSheet(sheet)));
  });
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const sheet = document.querySelector(".sheet.is-open");
    if (sheet) closeSheet(sheet);
    else closeLangMenu();
  });

  // The heart on the 18th saves the day to the guest's calendar.
  document.querySelector(".calendar__day").addEventListener("click", () => {
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Invitated//Charlotte & James//EN",
      "BEGIN:VEVENT",
      "UID:charlotte-james-20270918@invitated",
      "DTSTAMP:20260101T000000Z",
      "DTSTART:20270918T143000Z", // 3:30 PM BST
      "DTEND:20270918T220000Z",
      `SUMMARY:${lang.t("cal.summary")}`,
      `LOCATION:${lang.t("cal.location").replace(/,/g, "\\,")}`,
      `DESCRIPTION:${lang.t("cal.description")}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    link.download = "charlotte-james-wedding.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  /* ---------- 7. RSVP (sends nowhere yet) ---------- */
  const rsvp = document.getElementById("rsvp");
  const form = rsvp.querySelector(".reply");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.elements.name;
    const nameOk = name.value.trim().length > 0;
    const attendanceOk = !!form.querySelector("input[name=attendance]:checked");
    name.closest(".field").classList.toggle("is-invalid", !nameOk);
    form.querySelector("fieldset").classList.toggle("is-invalid", !attendanceOk);
    if (!nameOk) { name.focus(); return; }
    if (!attendanceOk) return;

    rsvp.querySelector(".rsvp").hidden = true;
    const thanks = rsvp.querySelector(".thanks");
    thanks.hidden = false;
    rsvp.classList.remove("screen--wine");
    rsvp.classList.add("is-sent");
    thanks.classList.add("is-in");
    scrollToY(rsvp.getBoundingClientRect().top + scrollY);
  });
  form.addEventListener("input", (e) => e.target.closest(".field")?.classList.remove("is-invalid"));
  form.addEventListener("change", (e) => e.target.closest(".field")?.classList.remove("is-invalid"));

  /* ---------- 8. Scratch to reveal ---------- */
  const scratch = document.querySelector(".scratch");
  const canvas = scratch.querySelector(".scratch__cover");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const W = 224, H = 435, ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = W * ratio;
  canvas.height = H * ratio;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "rgba(239, 229, 210, 0.98)"; // #EFE5D2, near solid: the photo is a surprise
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = 48;

  let last = null;
  let strokes = 0;
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };
  const clearedShare = () => {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 4 * 16) { total++; if (data[i] < 40) clear++; }
    return clear / total;
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    last = toCanvas(e);
    scratch.classList.add("is-scratching");
    ctx.beginPath();
    ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!last) return;
    const p = toCanvas(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  const endStroke = () => {
    if (!last) return;
    last = null;
    // The oval covers ~79% of the canvas it is cut from, so this is 35% of what can be scratched.
    if (++strokes >= 2 && clearedShare() > 0.275) scratch.classList.add("is-clear");
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  /* ---------- Start in the language the guest chose last time ---------- */
  let saved = null;
  try { saved = localStorage.getItem("bow:lang"); } catch {}
  applyLang(saved || (LANGS.find((code) => navigator.language?.toLowerCase().startsWith(code)) ?? "en"));
})();
