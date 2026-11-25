// Small enhancements. Every page still works without JavaScript.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Header: solid background once scrolled ---------- */
  const header = $("[data-header]");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  const toggle = $("[data-nav-toggle]");
  if (toggle) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("nav-open", open);
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
    $$("#site-nav a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  }

  /* ---------- Email links (assembled here to keep the address away from spam bots) ---------- */
  $$("[data-email]").forEach((a) => {
    const addr = `${a.dataset.u}@${a.dataset.d}`;
    a.href = `mailto:${addr}`;
    if (a.hasAttribute("data-email-text")) a.textContent = addr;
  });

  /* ---------- Fade-in on scroll ---------- */
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // reveal when it scrolls into view, or straight away if it's already above the viewport
          if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- Work filters: All / Available / Sold ---------- */
  const filters = $("[data-filters]");
  if (filters) {
    const cards = $$("[data-grid] [data-status]");
    const empty = $("[data-empty]");
    const apply = (filter, updateUrl = true) => {
      $$("button", filters).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
      let shown = 0;
      cards.forEach((card) => {
        const show = filter === "all" || card.dataset.status === filter;
        card.hidden = !show;
        if (show) {
          shown++;
          card.classList.add("is-in");
        }
      });
      if (empty) empty.hidden = shown > 0;
      if (updateUrl) {
        const url = new URL(window.location.href);
        if (filter === "all") url.searchParams.delete("filter");
        else url.searchParams.set("filter", filter);
        history.replaceState(null, "", url);
      }
    };
    filters.hidden = false;
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (btn) apply(btn.dataset.filter);
    });
    const initial = new URLSearchParams(window.location.search).get("filter");
    apply(["available", "sold"].includes(initial) ? initial : "all", false);
  }

  /* ---------- Artwork gallery: dots for the mobile swipe carousel ---------- */
  const gallery = $("[data-gallery]");
  const dots = $$("[data-gallery-dots] span");
  if (gallery && dots.length) {
    gallery.addEventListener(
      "scroll",
      () => {
        const i = Math.round(gallery.scrollLeft / gallery.clientWidth);
        dots.forEach((d, n) => d.classList.toggle("is-active", n === i));
      },
      { passive: true },
    );
  }

  /* ---------- Lightbox ---------- */
  const zoomLinks = $$("[data-zoom]");
  if (zoomLinks.length && typeof HTMLDialogElement === "function") {
    const dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.setAttribute("aria-label", "Enlarged image");
    dlg.innerHTML = `
      <figure><img alt=""><figcaption></figcaption></figure>
      <button class="lb-prev" type="button" aria-label="Previous image">←</button>
      <button class="lb-next" type="button" aria-label="Next image">→</button>
      <button class="lb-close" type="button" aria-label="Close">×</button>`;
    document.body.append(dlg);
    const img = $("img", dlg);
    const cap = $("figcaption", dlg);
    const many = zoomLinks.length > 1;
    $(".lb-prev", dlg).hidden = !many;
    $(".lb-next", dlg).hidden = !many;
    let index = 0;

    // Use the largest optimised WebP rather than the multi-megabyte original.
    const bestSrc = (a) => {
      const set = $('source[type="image/webp"]', a)?.getAttribute("srcset");
      if (!set) return a.href;
      return set.split(",").pop().trim().split(" ")[0];
    };
    const show = (n) => {
      index = (n + zoomLinks.length) % zoomLinks.length;
      const a = zoomLinks[index];
      img.src = bestSrc(a);
      img.alt = $("img", a)?.alt || "";
      cap.textContent = a.dataset.caption || "";
    };
    zoomLinks.forEach((a, n) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        show(n);
        dlg.showModal();
      }),
    );
    $(".lb-prev", dlg).addEventListener("click", () => show(index - 1));
    $(".lb-next", dlg).addEventListener("click", () => show(index + 1));
    $(".lb-close", dlg).addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.tagName === "FIGURE") dlg.close();
    });
    dlg.addEventListener("keydown", (e) => {
      if (!many) return;
      if (e.key === "ArrowLeft") show(index - 1);
      if (e.key === "ArrowRight") show(index + 1);
    });
  }

  /* ---------- Share ---------- */
  $$("[data-share]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const data = { title: btn.dataset.title || document.title, url: window.location.href };
      try {
        if (navigator.share) {
          await navigator.share(data);
        } else {
          await navigator.clipboard.writeText(data.url);
          const label = btn.textContent;
          btn.textContent = "Link copied";
          setTimeout(() => (btn.textContent = label), 2000);
        }
      } catch {
        /* user cancelled */
      }
    });
  });

  /* ---------- Contact form ---------- */
  const form = $("[data-contact-form]");
  if (form) {
    const params = new URLSearchParams(window.location.search);
    const about = params.get("about");
    if (about) {
      const sold = params.has("sold");
      $("[data-about]", form).hidden = false;
      $("[data-about-title]", form).textContent = about;
      form.elements.painting.value = about;
      form.elements._subject.value = `Website enquiry: ${about}`;
      form.elements.topic.value = "Buying a painting";
      if (!form.elements.message.value) {
        form.elements.message.value = sold
          ? `Hello Sarah,\n\nI love “${about}”. Do you have any similar work available?\n\n`
          : `Hello Sarah,\n\nI’m interested in “${about}”.\n\n`;
      }
    }

    const status = $("[data-form-status]", form);
    const button = $('button[type="submit"]', form);
    const success = $("[data-form-success]");
    const fail = (msg) => {
      status.dataset.state = "error";
      status.textContent = msg;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.dataset.state = "";
      if (form.getAttribute("action").includes("YOUR_FORM_ID")) {
        fail("The contact form isn’t connected yet. Please email instead.");
        return;
      }
      button.disabled = true;
      status.textContent = "Sending…";
      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        form.hidden = true;
        success.hidden = false;
        success.focus();
      } catch {
        fail("Sorry, something went wrong. Please try again, or send an email instead.");
      } finally {
        button.disabled = false;
        if (status.dataset.state !== "error") status.textContent = "";
      }
    });
  }
})();
