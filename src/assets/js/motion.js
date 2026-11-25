// The animated layer. Everything here is decoration: the site works without it, and none of it
// runs for visitors whose device asks for reduced motion (that's decided in the <head> script,
// which adds the `motion` class this file and motion.css are gated on).
(() => {
  window.__motion = true;
  const root = document.documentElement;
  if (!root.classList.contains("motion")) return;

  const $ = (sel, r = document) => r.querySelector(sel);
  const $$ = (sel, r = document) => [...r.querySelectorAll(sel)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const fontsReady = document.fonts ? Promise.race([document.fonts.ready, sleep(1500)]) : Promise.resolve();

  // The "paint-in" entrances play the first time a page is seen in a visit, then get out of the way.
  const seen = root.classList.contains("seen");
  try {
    sessionStorage.setItem("sot:" + location.pathname, "1");
  } catch {
    /* storage unavailable: animations simply replay */
  }

  /* =====================================================================
     A small bristle-brush engine
     A stroke is a row of bristles dragged along a curve. Each bristle has
     its own paint, thickness, wobble and lag, so edges come out ragged and
     the body streaky, like a loaded flat brush on canvas.
     ===================================================================== */

  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash = (str) => [...String(str)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  // smooth 1-D noise, so neighbouring bristles behave alike (clumps of paint, fingers at the tip)
  const noise = (seed) => {
    const rnd = rng(seed);
    const pts = Array.from({ length: 64 }, rnd);
    return (x) => {
      const i = Math.floor(x);
      const f = x - i;
      const a = pts[i & 63];
      const b = pts[(i + 1) & 63];
      return a + (b - a) * f * f * (3 - 2 * f);
    };
  };

  function makeStroke({ from, to, bow = 0, width, gap = 3, seed = 1, dry = 0, ragged = 0.07, delay = 0, duration = 600, style }) {
    const rnd = rng(seed);
    const toneNoise = noise(seed + 11);
    const lagNoise = noise(seed + 23);
    const mixNoise = noise(seed + 37);
    const n = Math.max(6, Math.round(width / gap));
    const stroke = {
      from,
      to,
      mid: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + bow],
      length: Math.hypot(to[0] - from[0], to[1] - from[1]) + Math.abs(bow),
      delay,
      duration,
      done: false,
    };
    stroke.bristles = Array.from({ length: n }, (_, i) => {
      const u = i / (n - 1) - 0.5; // position across the brush: -0.5 … 0.5
      const edge = (Math.abs(u) * 2) ** 4; // ≈0 in the middle, 1 at the very edge
      const hair = rnd() < 0.14; // a few stiff hairs leave fine light and dark ridges
      const bristle = {
        i,
        off: u * width + (rnd() - 0.5) * gap,
        lag: lagNoise(i / 9) * ragged + rnd() * 0.025 + edge * rnd() * 0.1, // touches down in fingers…
        end: 1 - (rnd() < dry ? rnd() * 0.3 : rnd() * 0.02) - edge * rnd() * 0.12, // …and runs dry at the edges
        thick: hair ? gap * 0.7 : gap * (1.8 + rnd() * 1.2),
        tone: hair ? (rnd() < 0.5 ? 0.05 : 0.95) : clamp(toneNoise(i / 7) * 0.85 + rnd() * 0.15, 0, 1),
        mix: mixNoise(i / 11),
        wobble: [rnd() * 1.4, 1.5 + rnd() * 4, rnd() * 6.283],
        t: 0,
      };
      bristle.paint = style(bristle);
      return bristle;
    });
    return stroke;
  }

  function pointAt(s, t, off) {
    const mt = 1 - t;
    const x = mt * mt * s.from[0] + 2 * mt * t * s.mid[0] + t * t * s.to[0];
    const y = mt * mt * s.from[1] + 2 * mt * t * s.mid[1] + t * t * s.to[1];
    const dx = 2 * mt * (s.mid[0] - s.from[0]) + 2 * t * (s.to[0] - s.mid[0]);
    const dy = 2 * mt * (s.mid[1] - s.from[1]) + 2 * t * (s.to[1] - s.mid[1]);
    const len = Math.hypot(dx, dy) || 1;
    return [x - (dy / len) * off, y + (dx / len) * off];
  }

  // Advance a stroke to progress p (0…1), drawing only the new length of each bristle.
  // Bristles overlap their neighbours, so the order they're laid in matters: leaders first,
  // stragglers last. A trailing bristle then always sits on top of a leading one, at every point
  // along the stroke, and the body stays clean instead of showing stitch marks every frame.
  function drawStroke(ctx, s, p) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const b of s.bristles) b.next = clamp((p - b.lag) / (1 - b.lag), 0, 1) * b.end;
    s.bristles.sort((a, b) => b.next - a.next);
    for (const b of s.bristles) {
      const tb = b.next;
      if (tb <= b.t) continue;
      const steps = Math.max(1, Math.ceil(((tb - b.t) * s.length) / 36));
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const t = b.t + ((tb - b.t) * k) / steps;
        const pressure = 0.86 + 0.14 * Math.sin(Math.PI * t);
        const [x, y] = pointAt(s, t, b.off * pressure + Math.sin(t * b.wobble[1] * 6.283 + b.wobble[2]) * b.wobble[0]);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = b.paint;
      ctx.lineWidth = b.thick;
      ctx.stroke();
      b.t = tb;
    }
  }

  // Play a set of strokes. Resolves when they're finished; `.cancel()` stops early.
  function play(ctx, strokes, composite = "source-over") {
    let raf = 0;
    let stop;
    const promise = new Promise((resolve) => {
      const t0 = performance.now();
      const frame = (now) => {
        ctx.globalCompositeOperation = composite;
        let pending = false;
        for (const s of strokes) {
          if (s.done) continue;
          const elapsed = (now - t0 - s.delay) / s.duration;
          if (elapsed > 0) {
            drawStroke(ctx, s, easeInOut(Math.min(elapsed, 1)));
            if (elapsed >= 1) s.done = true;
          }
          if (!s.done) pending = true;
        }
        if (pending) raf = requestAnimationFrame(frame);
        else resolve();
      };
      stop = () => {
        cancelAnimationFrame(raf);
        resolve();
      };
      raf = requestAnimationFrame(frame);
    });
    promise.cancel = stop;
    return promise;
  }

  // Horizontal bands of strokes that together cover a w × h surface, alternating direction.
  function bands(w, h, count, { seed, widthScale = 1.75, duration, stagger, order, gap, dry, ragged, flip = false, style }) {
    const rnd = rng(seed);
    const bandH = h / count;
    return Array.from({ length: count }, (_, k) => {
      const leftToRight = (k % 2 === 0) !== flip;
      const y = (k + 0.5) * bandH;
      const a = [-0.1 * w, y + (rnd() - 0.5) * bandH * 0.36];
      const b = [1.1 * w, y + (rnd() - 0.5) * bandH * 0.36];
      return makeStroke({
        from: leftToRight ? a : b,
        to: leftToRight ? b : a,
        bow: (rnd() - 0.5) * bandH * 0.8,
        width: bandH * widthScale,
        gap,
        dry,
        ragged,
        seed: seed * 31 + k,
        delay: (order ? order.indexOf(k) : k) * stagger,
        duration,
        style: (bristle) => style(bristle, k),
      });
    });
  }

  /* =====================================================================
     Paint-in: an image appears stroke by stroke, painted with itself
     ===================================================================== */

  async function paintIn(art, delay = 0) {
    const img = $("img", art);
    if (!img || art.dataset.painted) return;
    art.dataset.painted = "1";
    const show = () => art.classList.add("is-painted");
    try {
      if (!img.complete) {
        await new Promise((done) => {
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 4000);
        });
      }
      if (img.decode) await img.decode().catch(() => {});
      const w = img.clientWidth;
      const h = img.clientHeight;
      if (!w || !h || !img.naturalWidth) return show();

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.className = "paint-canvas";
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");

      // the "paint" is the picture itself
      const texture = document.createElement("canvas");
      texture.width = canvas.width;
      texture.height = canvas.height;
      texture.getContext("2d").drawImage(img, 0, 0, texture.width, texture.height);
      const paint = ctx.createPattern(texture, "no-repeat");

      art.append(canvas);
      const count = clamp(Math.round((h / w) * 4.6), 4, 7);
      const strokes = bands(canvas.width, canvas.height, count, {
        seed: hash(img.currentSrc || img.src),
        duration: 620,
        stagger: 105,
        gap: 3 * dpr,
        dry: 0.22,
        ragged: 0.14,
        style: () => paint,
      });
      strokes.forEach((s) => (s.delay += delay));
      await play(ctx, strokes);
      show(); // the real image fades in underneath, filling any last streaks
      canvas.classList.add("is-done");
      setTimeout(() => canvas.remove(), 900);
    } catch {
      show();
    }
  }

  /* =====================================================================
     Hero: the name rises letter by letter, the painting paints itself
     ===================================================================== */

  const hero = $(".hero");

  // Split a line into letters, then nudge each one back to where the font's kerning had it.
  function splitLetters(line, startIndex) {
    const node = line.firstChild;
    if (!node || node.nodeType !== 3) return startIndex;
    const chars = [...node.textContent];
    const range = document.createRange();
    const lefts = [];
    let pos = 0;
    for (const ch of chars) {
      range.setStart(node, pos);
      range.setEnd(node, pos + ch.length);
      lefts.push(range.getBoundingClientRect().left);
      pos += ch.length;
    }
    line.textContent = "";
    line.classList.add("is-measuring");
    let index = startIndex;
    const spans = chars.map((ch) => {
      if (/\s/.test(ch)) {
        line.append(" ");
        return null;
      }
      const span = document.createElement("span");
      span.className = "ch";
      span.textContent = ch;
      span.style.setProperty("--i", index++);
      line.append(span);
      return span;
    });
    const fontSize = parseFloat(getComputedStyle(line).fontSize) || 16;
    spans.forEach((span, i) => {
      if (!span) return;
      const drift = lefts[i] - span.getBoundingClientRect().left;
      if (Math.abs(drift) > 0.15) span.style.marginLeft = `${(drift / fontSize).toFixed(4)}em`;
    });
    line.classList.remove("is-measuring");
    return index;
  }

  const heroReady = hero
    ? fontsReady.then(() => {
        const title = $(".hero-title", hero);
        if (!title) return;
        title.setAttribute("aria-label", title.textContent.replace(/\s+/g, " ").trim());
        let index = 0;
        $$(".line", title).forEach((line) => {
          index = splitLetters(line, index);
          line.setAttribute("aria-hidden", "true");
        });
        title.classList.add("is-split");
      })
    : Promise.resolve();

  let heroStarted = false;
  function startHero() {
    if (heroStarted || !hero) return;
    heroStarted = true;
    heroReady.then(() => {
      hero.classList.add("hero-in");
      const art = $("[data-paint]", hero);
      if (art && !seen) paintIn(art, 260);
    });
  }

  /* =====================================================================
     The opening: paint a twilight in five strokes, sign it, wipe it away
     ===================================================================== */

  const SIGNATURE = [
    // guide strokes that follow the SoT monogram in writing order: [path, width, start, end]
    ["M378 112C376.3 105.3 375.2 85.3 368 72C360.8 58.7 351 42 335 32C319 22 292 13.3 272 12C252 10.7 229.7 16 215 24C200.3 32 190.7 47 184 60C177.3 73 173.7 87 175 102C176.3 117 182.5 132.3 192 150C201.5 167.7 218.5 186.7 232 208C245.5 229.3 260.2 255 273 278C285.8 301 299.3 322.3 309 346C318.7 369.7 326.7 397.3 331 420C335.3 442.7 337.5 461.7 335 482C332.5 502.3 325.8 524 316 542C306.2 560 292.7 577.3 276 590C259.3 602.7 237 612.7 216 618C195 623.3 171.7 624.8 150 622C128.3 619.2 105 612 86 601C67 590 48.2 573.5 36 556C23.8 538.5 17 516.7 13 496C9 475.3 8.5 452.7 12 432C15.5 411.3 22.7 390.3 34 372C45.3 353.7 64 336.2 80 322C96 307.8 113.3 296 130 287C146.7 278 164.3 272.3 180 268C195.7 263.7 216.7 262.2 224 261", 58, 0, 0.56],
    ["M394 224C390.7 227.7 376.7 236 374 246C371.3 256 372 274.3 378 284C384 293.7 398.3 303.7 410 304C421.7 304.3 439.3 296.7 448 286C456.7 275.3 463.3 255 462 240C460.7 225 450.3 205.3 440 196C429.7 186.7 412 182.3 400 184C388 185.7 375.3 193.7 368 206C360.7 218.3 358 249.3 356 258", 50, 0.58, 0.74],
    ["M370 142C381.7 139.7 415 133 440 128C465 123 489.7 116.3 520 112C550.3 107.7 605 103.7 622 102", 44, 0.76, 0.87],
    ["M508 118C509 135 511.7 184.7 514 220C516.3 255.3 518.7 289.7 522 330C525.3 370.3 532 440 534 462", 52, 0.87, 1],
  ];
  const SIG_W = 627;
  const SIG_H = 640;

  function signatureWriter(canvas, image) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    const ctx = canvas.getContext("2d");
    const scale = canvas.width / SIG_W;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    canvas.after(svg);
    const guides = SIGNATURE.map(([d, width, start, end]) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", d);
      svg.append(el);
      return { path: new Path2D(d), width, start, end, length: el.getTotalLength() };
    });
    svg.remove();

    // Draw the signature up to progress p: reveal the real brush-drawn mark along the guide strokes.
    return (p) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#fff";
      for (const g of guides) {
        const local = easeInOut(clamp((p - g.start) / (g.end - g.start), 0, 1));
        if (local <= 0) continue;
        ctx.lineWidth = g.width;
        ctx.setLineDash([g.length * local, g.length * 2]);
        ctx.stroke(g.path);
      }
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = "source-in";
      ctx.drawImage(image, 0, 0, SIG_W, SIG_H);
      ctx.fillStyle = "#f6f2ec"; // sign in pale paint, as on the canvases
      ctx.fillRect(0, 0, SIG_W, SIG_H);
    };
  }

  async function runIntro() {
    const cover = $("[data-intro]");
    const canvas = cover && $(".intro-canvas", cover);
    const end = () => {
      startHero();
      if (cover) {
        cover.classList.add("is-leaving");
        setTimeout(() => cover.remove(), 450);
      }
      setTimeout(() => root.classList.remove("intro"), 450);
    };
    if (!canvas || !canvas.getContext) return end();

    // Any click, key or scroll skips straight to the site.
    let skipped = false;
    let current = null;
    let releaseSkip;
    const skipSignal = new Promise((r) => (releaseSkip = r));
    const skip = () => {
      if (skipped) return;
      skipped = true;
      if (current) current.cancel();
      releaseSkip();
    };
    const skipEvents = ["pointerdown", "keydown", "wheel", "touchmove"];
    skipEvents.forEach((type) => window.addEventListener(type, skip, { passive: true, once: true }));
    const pause = (ms) => Promise.race([sleep(ms), skipSignal]);

    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const W = (canvas.width = Math.round(window.innerWidth * dpr));
      const H = (canvas.height = Math.round(window.innerHeight * dpr));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f6f2ec";
      ctx.fillRect(0, 0, W, H);
      cover.classList.add("is-running"); // the canvas is the paper now

      const sigCanvas = $(".intro-sig", cover);
      const sigImage = $(".intro-sig-src", cover);
      await Promise.race([Promise.all([fontsReady, sigImage.decode().catch(() => {})]), sleep(1200), skipSignal]);
      await pause(120);

      // 1. A twilight in six strokes: dusk sky, plum haze, a rose cloud, pale meadow light,
      //    dark earth and one highlight. Positions are fractions of the screen.
      const composition = [
        { from: [-0.1, 0.13], to: [1.1, 0.05], bow: 0.1, width: 0.31, hsl: [320, 17, 68], streak: [208, 30, 80] },
        { from: [1.1, 0.47], to: [-0.1, 0.42], bow: -0.07, width: 0.3, hsl: [330, 22, 52], streak: [345, 38, 66] },
        { from: [-0.1, 0.3], to: [1.1, 0.24], bow: 0.06, width: 0.25, hsl: [346, 46, 78], streak: [350, 52, 70] },
        { from: [1.1, 0.66], to: [-0.1, 0.72], bow: -0.09, width: 0.24, hsl: [105, 22, 85], streak: [140, 20, 64] },
        { from: [-0.1, 0.9], to: [1.1, 0.97], bow: -0.07, width: 0.3, hsl: [335, 32, 12], streak: [338, 46, 24] },
        { from: [0.2, 0.86], to: [0.84, 0.805], bow: 0.03, width: 0.04, hsl: [335, 32, 90], streak: [322, 26, 78], duration: 440 },
      ];
      const paintDuration = 580;
      const paintStagger = 95;
      const earthLands = paintStagger * 4 + paintDuration; // when the dark ground under the signature is down
      if (!skipped) {
        current = play(
          ctx,
          composition.map((c, k) =>
            makeStroke({
              from: [c.from[0] * W, c.from[1] * H],
              to: [c.to[0] * W, c.to[1] * H],
              bow: c.bow * H,
              width: c.width * H,
              gap: 3 * dpr,
              ragged: 0.09,
              seed: 71 + k * 13,
              delay: k * paintStagger,
              duration: c.duration || paintDuration,
              // clumps of bristles pick up the second colour; tone gives the ridges
              style: (bristle) => {
                const [h, sat, l] = bristle.mix > 0.7 ? c.streak : c.hsl;
                return `hsl(${h} ${sat}% ${clamp(l + (bristle.tone - 0.5) * 10, 4, 96)}%)`;
              },
            }),
          ),
        );
        const painting = current;

        // 2. Sign it, bottom right, while the last stroke is still landing.
        await pause(earthLands - 140);
        if (!skipped && sigImage.naturalWidth) {
          const write = signatureWriter(sigCanvas, sigImage);
          const t0 = performance.now();
          const signDuration = 600;
          await new Promise((done) => {
            const frame = (now) => {
              const p = clamp((now - t0) / signDuration, 0, 1);
              write(p);
              if (p < 1 && !skipped) requestAnimationFrame(frame);
              else done();
            };
            requestAnimationFrame(frame);
          });
        }
        await painting;
        if (!skipped) {
          // fix the signature into the painting so it gets wiped away with it
          const box = sigCanvas.getBoundingClientRect();
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(sigCanvas, box.left * dpr, box.top * dpr, box.width * dpr, box.height * dpr);
          sigCanvas.style.visibility = "hidden";
        }
        await pause(220);
      }

      // 3. Dry-brush it away to reveal the site.
      if (!skipped) {
        startHero();
        current = play(ctx, bands(W, H, 5, { seed: 23, widthScale: 1.85, duration: 560, stagger: 75, gap: 4 * dpr, dry: 0.1, ragged: 0.12, flip: true, style: () => "#000" }), "destination-out");
        await current;
      }
    } catch {
      /* fall through to the site */
    }
    skipEvents.forEach((type) => window.removeEventListener(type, skip));
    end();
  }

  if (root.classList.contains("intro")) runIntro();
  else startHero();

  /* =====================================================================
     Scroll entrances: headlines rise word by word, figures unveil,
     gallery paintings paint themselves in
     ===================================================================== */

  function splitWords(el) {
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
              frag.append(" ");
              continue;
            }
            const word = document.createElement("span");
            word.className = "w";
            const inner = document.createElement("span");
            inner.className = "wi";
            inner.textContent = part;
            word.append(inner);
            frag.append(word);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && !child.matches("svg")) {
          walk(child);
        }
      }
    };
    walk(el);
    $$(".wi", el).forEach((w, i) => w.style.setProperty("--i", i));
    el.classList.add("is-split");
  }
  $$("[data-split]").forEach(splitWords);

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        let batch = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting && entry.boundingClientRect.bottom >= 0) continue;
          const el = entry.target;
          io.unobserve(el);
          if (el.matches("[data-paint]")) paintIn(el, entry.isIntersecting ? batch++ * 150 : 0);
          else el.classList.add("is-in");
        }
      },
      { rootMargin: "0px 0px -7% 0px", threshold: 0.1 },
    );
    $$("[data-split], [data-unveil]").forEach((el) => io.observe(el));
    if (!seen) $$("[data-paint]").forEach((el) => !el.closest(".hero") && io.observe(el));
  } else {
    $$("[data-split], [data-unveil]").forEach((el) => el.classList.add("is-in"));
    $$("[data-paint]").forEach((el) => el.classList.add("is-painted"));
  }

  /* =====================================================================
     Depth on scroll
     ===================================================================== */

  const layers = $$("[data-parallax], [data-spin]").map((el) => ({
    el,
    drift: parseFloat(el.dataset.parallax || "0"),
    spin: parseFloat(el.dataset.spin || "0"),
    y: 0,
  }));
  if (layers.length) {
    const measure = () => {
      for (const l of layers) {
        const prev = l.el.style.translate;
        l.el.style.translate = "none";
        const r = l.el.getBoundingClientRect();
        l.y = r.top + window.scrollY + r.height / 2;
        l.el.style.translate = prev;
      }
      update();
    };
    let ticking = false;
    const update = () => {
      ticking = false;
      const mid = window.scrollY + window.innerHeight / 2;
      for (const l of layers) {
        const d = mid - l.y;
        if (Math.abs(d) > window.innerHeight * 1.5) continue;
        if (l.drift) l.el.style.translate = `0 ${(d * l.drift).toFixed(1)}px`;
        if (l.spin) l.el.style.rotate = `${(d * l.spin).toFixed(2)}deg`;
      }
    };
    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);
    measure();
  }

  /* =====================================================================
     Marquee: drifts on its own, hurries (and turns) with your scroll
     ===================================================================== */

  $$("[data-marquee]").forEach((marquee) => {
    const track = $(".marquee-track", marquee);
    if (!track) return;
    [...track.children].forEach((child) => track.append(child.cloneNode(true)));
    let x = 0;
    let dir = 1;
    let velocity = 0;
    let lastY = window.scrollY;
    let lastT = 0;
    let raf = 0;
    const tick = (now) => {
      const dt = lastT ? Math.min(48, now - lastT) / 16.67 : 1;
      lastT = now;
      const y = window.scrollY;
      velocity = lerp(velocity, y - lastY, 0.18);
      lastY = y;
      if (velocity > 0.8) dir = 1;
      else if (velocity < -0.8) dir = -1;
      const period = (track.scrollWidth + parseFloat(getComputedStyle(track).columnGap || 0)) / 2;
      x -= dir * (0.7 + Math.abs(velocity) * 0.32) * dt;
      if (x <= -period) x += period;
      if (x > 0) x -= period;
      track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) skewX(${clamp(velocity * -0.22, -7, 7).toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !raf) {
        lastT = 0;
        lastY = window.scrollY;
        raf = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }).observe(marquee);
  });

  /* =====================================================================
     Pointer play (mouse only): paintings tilt and catch the light,
     a "View" badge follows the cursor, the hero's colour washes drift after it
     ===================================================================== */

  if (finePointer) {
    $$("[data-tilt]").forEach((el) => {
      let raf = 0;
      let event;
      const apply = () => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const px = clamp((event.clientX - r.left) / r.width, 0, 1);
        const py = clamp((event.clientY - r.top) / r.height, 0, 1);
        el.style.setProperty("--ry", `${((px - 0.5) * 9).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${((0.5 - py) * 7).toFixed(2)}deg`);
        el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
      };
      el.addEventListener("pointermove", (e) => {
        event = e;
        el.classList.add("is-tilting");
        if (!raf) raf = requestAnimationFrame(apply);
      });
      el.addEventListener("pointerleave", () => {
        cancelAnimationFrame(raf);
        raf = 0;
        el.classList.remove("is-tilting");
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      });
    });

    // cursor badge
    root.classList.add("has-cursor");
    const cursor = document.createElement("div");
    cursor.className = "cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.innerHTML = '<span class="cursor-disc"><span class="cursor-label"></span></span>';
    document.body.append(cursor);
    const label = $(".cursor-label", cursor);
    let tx = -200;
    let ty = -200;
    let cx = tx;
    let cy = ty;
    let active = false;
    let cursorRaf = 0;
    const follow = () => {
      cx = lerp(cx, tx, 0.22);
      cy = lerp(cy, ty, 0.22);
      cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      cursorRaf = active || Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3 ? requestAnimationFrame(follow) : 0;
    };
    const setTarget = (target) => {
      const on = !!target;
      if (on) label.textContent = target.dataset.cursor;
      if (on && !active) {
        cx = tx;
        cy = ty;
      }
      active = on;
      cursor.classList.toggle("is-active", on);
      if (!cursorRaf) cursorRaf = requestAnimationFrame(follow);
    };
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      setTarget(e.target.closest ? e.target.closest("[data-cursor]") : null);
    }, { passive: true });
    window.addEventListener("scroll", () => {
      if (!active && tx < 0) return;
      const under = document.elementFromPoint(tx, ty);
      setTarget(under && under.closest ? under.closest("[data-cursor]") : null);
    }, { passive: true });
    document.addEventListener("pointerleave", () => setTarget(null));
    window.addEventListener("pointerdown", () => cursor.classList.add("is-pressed"));
    window.addEventListener("pointerup", () => cursor.classList.remove("is-pressed"));
    window.addEventListener("pagehide", () => setTarget(null));

    // hero colour washes lean toward the cursor
    const washes = hero ? $$(".wash", hero) : [];
    if (washes.length) {
      let mx = 0;
      let my = 0;
      let wx = 0;
      let wy = 0;
      let washRaf = 0;
      const drift = () => {
        wx = lerp(wx, mx, 0.05);
        wy = lerp(wy, my, 0.05);
        washes.forEach((wash, i) => {
          const depth = (i + 1) * 46;
          wash.style.translate = `${(wx * depth).toFixed(1)}px ${(wy * depth).toFixed(1)}px`;
        });
        washRaf = Math.abs(wx - mx) + Math.abs(wy - my) > 0.002 ? requestAnimationFrame(drift) : 0;
      };
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        mx = (e.clientX - r.left) / r.width - 0.5;
        my = (e.clientY - r.top) / r.height - 0.5;
        if (!washRaf) washRaf = requestAnimationFrame(drift);
      }, { passive: true });
    }
  }
})();
