# Sarah Olivia Thảo — website

A fast, static portfolio site built with [Eleventy](https://www.11ty.dev/) and hosted free on GitHub Pages.

**Live at <https://jgeewax.github.io/sarah-thao/>.** Every push to `main` rebuilds and publishes it (progress in the **Actions** tab).

```text
src/
  _data/site.json          ← name, email, Instagram, contact-form address, domain
  artworks/<painting>/     ← one folder per painting: photos + index.md
  index.njk                ← home page
  work.njk                 ← portfolio grid (All / Available / Sold)
  about.njk, contact.njk, privacy.md
  assets/                  ← CSS, JavaScript, fonts, logo (motion.js / motion.css = the animations)
```

## Preview on your computer

```sh
npm install      # first time only
npm start        # then open http://localhost:8080
```

The preview refreshes on its own whenever you save a file.

## Add a new painting

1. Make a folder in `src/artworks/`, named how you want the web address to read, e.g. `src/artworks/morning-meadow/` → `/work/morning-meadow/`.
2. Put the photos in it. Use full-size photos; the site resizes and compresses them automatically. The **first** photo is the one shown in grids, so a straight-on, tightly cropped shot of the canvas works best.
3. Add an `index.md` file in that folder:

```markdown
---
title: Morning Meadow
year: 2026
medium: Oil and acrylic on canvas
size: 40 × 51 cm (16 × 20 in)
price: £1,500
status: available        # available or sold
order: 1                 # lower numbers appear first
featured: true           # show on the home page
images:
  - src: morning-meadow.jpg
    alt: Describe the painting for people who can't see it.
  - src: morning-meadow-detail.jpg
    alt: Close-up of the brushwork.
    caption: Detail
---

Original painting, signed by the artist.
```

The first painting in the order also becomes the big image on the home page.

**Marking something sold:** change `status: available` to `status: sold`. The price is hidden and a red dot appears.

You can do all of this in the browser on github.com: open the repository, choose **Add file → Upload files**, and the site rebuilds itself within a couple of minutes.

## Turn on the contact form (one-time, ~5 minutes)

The form uses [Formspree](https://formspree.io), which emails each message to you. The free plan is plenty for an artist's site.

1. Sign up at formspree.io with the email address that should receive messages, and create a new form.
2. Copy its endpoint. It looks like `https://formspree.io/f/abcdwxyz`.
3. Paste it into `src/_data/site.json` as `formAction`.

Until then, the form tells visitors to email instead. Spam protection (a hidden honeypot field) is already built in.

## Publish on GitHub Pages

1. Create a repository on GitHub and push this folder to its `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` now builds and publishes the site (see the **Actions** tab). It will first appear at `https://<username>.github.io/<repository>/`.

## Use your own domain

1. **Settings → Pages → Custom domain**: enter your domain (e.g. `www.example.com`) and save.
2. At your domain registrar, add these DNS records:
   - `www` → **CNAME** → `<username>.github.io`
   - the bare domain (`@`) → **A** records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, and optionally **AAAA** records `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
3. Once the DNS check passes (minutes to a few hours), tick **Enforce HTTPS**.
4. Change `url` in `src/_data/site.json` from `https://jgeewax.github.io/sarah-thao` to the new domain, e.g. `"url": "https://www.example.com"` (no trailing slash). It's used for link previews on social media, the sitemap and search-engine metadata. Links inside the site adjust by themselves.
5. Recommended: verify the domain under your GitHub account's **Settings → Pages** so no one else can claim it.

## The animations

All of the motion lives in two files, `src/assets/js/motion.js` and `src/assets/css/motion.css`, separate from the code the site needs to function.

- **Opening sequence** (home page): six brush strokes paint a twilight, the SoT signature writes itself, then it's wiped away to reveal the site. It plays once per visit, when the home page is the first page someone lands on, and any click, key press or scroll skips it. **To watch it again, add `?intro` to the address**, e.g. `http://localhost:8080/?intro`.
- **Paint-in**: the first time a page is seen in a visit, paintings appear stroke by stroke. After that they simply show, so browsing stays quick.
- **Page changes**: a painting glides between the grid and its own page (Chrome, Edge and Safari; other browsers just load the page normally).
- **Details**: tilt and highlight on hover, a "View" cursor badge, headlines rising word by word, the marquee, drifting colour in the hero.

Visitors whose device is set to *reduce motion* get none of this: everything just appears.

To change the opening's colours or strokes, edit the `composition` list in `motion.js` (positions are fractions of the screen; colours are hue, saturation, lightness). To remove the opening entirely, delete the `intro-cover` block in `src/_includes/base.njk`.

## Fonts and licences

Fraunces and Be Vietnam Pro are served from this site (no Google requests) under the SIL Open Font License.
