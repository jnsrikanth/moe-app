# Tailwind CSS — Offline (Precompiled) Setup

This project uses Tailwind in a 100% offline way on the CloudPC by precompiling a single CSS file on your Mac and committing it to the repo.

## One-time on your Mac

1) Install Tailwind CLI (choose one):
- Using the standalone binary (no Node required):
  - Download from https://github.com/tailwindlabs/tailwindcss/releases
  - Place `tailwindcss` binary in your PATH (e.g., /usr/local/bin)
- OR using npx (if you have Node locally):
  - `npx tailwindcss -v`

2) Build the CSS

From repo root:
```
tailwindcss -i web/static/css/tw.css -o web/static/css/tailwind.dist.css --minify
```

3) Commit the generated file
```
git add web/static/css/tailwind.dist.css
git commit -m "build(tailwind): add precompiled tailwind css"
```

The Python dashboard will load `tailwind.dist.css` directly; no build step or npm is used on the CloudPC.

## Files
- tailwind.config.js — Tailwind config (content scanning)
- web/static/css/tw.css — Tailwind source (imports + a few base utilities)
- web/static/css/tailwind.dist.css — GENERATED artifact (commit this file)

## Notes
- You can keep using `web/static/css/styles.css` for small overrides. Load `tailwind.dist.css` first, then `styles.css`.
- The theme toggle (light/dark) will still work as it uses CSS variables on `:root` and Tailwind classes are neutral.