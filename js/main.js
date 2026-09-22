(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fit the 393px mock column to narrower phones ---------- */
  const fit = () => root.style.setProperty("--k", Math.min(1, root.clientWidth / 393).toFixed(4));
  fit();
  addEventListener("resize", fit);

  /* ---------- Blocks that lift in on first view ---------- */
  root.classList.add("is-animated");
  const risers = document.querySelectorAll(".rise, .timeline__ribbon");
  const riseObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      riseObserver.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -12% 0px" });
  risers.forEach((el) => riseObserver.observe(el));

  /* ---------- Music ---------- */
  const music = document.querySelector(".music");
  const sound = document.querySelector(".sound");
  const setSound = (on) => {
    sound.setAttribute("aria-pressed", String(on));
    if (on) music.play().catch(() => sound.setAttribute("aria-pressed", "false")); // no track yet
    else music.pause();
  };
  sound.addEventListener("click", () => setSound(sound.getAttribute("aria-pressed") !== "true"));

  /* ---------- 0. Gate: untie, drop the seal, part the lace ---------- */
  const gate = document.getElementById("gate");
  const reveal = () => root.classList.add("is-revealed");
  let opened = false;

  const openGate = () => {
    if (opened) return;
    opened = true;
    setSound(true); // the tap is the user gesture browsers need before audio can start
    gate.classList.add("is-open");
    const untie = reduceMotion ? 0 : 900;
    setTimeout(() => {
      gate.classList.add("is-parting");
      reveal();
    }, untie);
    setTimeout(() => {
      gate.remove();
      root.classList.remove("is-locked");
    }, untie + (reduceMotion ? 0 : 1500));
  };
  gate.addEventListener("click", openGate);
  gate.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGate(); }
  });
  gate.focus({ preventScroll: true });

  // ?open skips the gate — handy while working on the screens below it.
  if (new URLSearchParams(location.search).has("open")) {
    opened = true;
    gate.remove();
    root.classList.remove("is-locked");
    reveal();
  }

  /* ---------- 3. Save the date envelope ---------- */
  const envelope = document.querySelector(".envelope");
  envelope.addEventListener("click", () => {
    const open = !envelope.classList.contains("is-open");
    envelope.classList.toggle("is-open", open);
    envelope.closest(".screen").classList.toggle("is-open", open);
    envelope.setAttribute("aria-expanded", String(open));
    envelope.setAttribute("aria-label", open ? "Close the envelope" : "Open the envelope");
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
      "SUMMARY:Charlotte & James — Wedding",
      "LOCATION:Rosewood Manor\\, The Cotswolds\\, England",
      "DESCRIPTION:Guests arrive from 3:30 PM. Ceremony at 4:00 PM.",
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
    rsvp.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
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
  ctx.fillStyle = "rgba(239, 229, 210, 0.91)"; // #EFE5D2 at 91%, as in the mock
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = 44;

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
    // Circle-in-a-rect: the oval is ~79% of the canvas, so ~45% cleared shows most of the photo.
    if (++strokes >= 2 && clearedShare() > 0.45) scratch.classList.add("is-clear");
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  /* ---------- Back to top ---------- */
  document.querySelectorAll('a[href="#top"]').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }));
})();
