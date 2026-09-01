# Remotie — Static Website

100% static. HTML5 + CSS3 + Vanilla ES6. No build step, no dependencies, no framework.

## Deploy (GitHub → Vercel)

```bash
cd "E:\Remotie Bangladesh WEB"
git init
git add -A
git commit -m "Remotie website"
gh repo create remotie-website --public --source=. --push
```

Then import the repo at https://vercel.com/new — framework preset **Other**,
build command **empty**, output directory **.** . Vercel redeploys on every push.

CLI alternative:

```bash
npx vercel --prod
```

## Files

| Path | Purpose |
|---|---|
| `index.html` | Home, About, Services, Clients, Contact, Privacy |
| `styles.css` | Design system, layout, animations |
| `script.js` | Nav, reveals, hero canvas, counters, form |
| `assets/` | Optimised WebP/PNG actually served (261 KB total) |
| `vercel.json` | Security headers + asset caching |
| `.gitignore` | Excludes the source-art folders from the repo |

The original art in `Other Pictures/`, `Profile Picture/` and the `.txt` source
copy stay on disk but are **git-ignored** — the site serves the `assets/` copies.
Delete those lines from `.gitignore` if you want the originals in the repo too.

## Before you go live (1 minute)

1. ~~Formspree~~ — **done.** Live endpoint `https://formspree.io/f/xppzqakj`,
   delivering to `management@remotie.co`. Send one test enquiry after deploy
   and confirm the first submission in the Formspree dashboard (free plan
   requires you to confirm the recipient address once).
2. **Domain** — search/replace `https://remotie.co/` in `index.html`,
   `robots.txt` and `sitemap.xml` with your real domain.

## House rules

- Every `.client__desc` must stay at **255 characters or fewer**.
- Re-run the image optimiser if you add art:
  `ffmpeg -i "in.png" -vf "scale=1100:-2:flags=lanczos" -c:v libwebp -quality 80 "assets/out.webp"`

## Local preview

```bash
npx serve .
```
