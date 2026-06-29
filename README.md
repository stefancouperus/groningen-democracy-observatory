# Groningen Democracy Observatory dashboard

This directory is the sanitised, student-facing Quarto website. Its rendered output is `_site/`.

- Live dashboard: <https://stefancouperus.github.io/groningen-democracy-observatory/>
- GitHub repository: <https://github.com/stefancouperus/groningen-democracy-observatory>

## Local editing workflow

This directory is a standalone Git repository. Make all student-facing dashboard changes here, preview them locally, and push ordinary commits to GitHub:

```sh
cd /Users/stefancouperus/Desktop/AES_assignment_democracy/dashboard
quarto preview
```

After checking the preview, stop it with `Ctrl+C`, then validate and commit:

```sh
quarto render
node scripts/audit_public.mjs
git status
git add -A
git commit -m "Describe the dashboard change"
git push
```

Every push to `main` starts the GitHub Actions workflow in `.github/workflows/pages.yml`. It renders the Quarto site, runs the public-content audit, and deploys `_site/` to GitHub Pages. The generated `_site/` directory and local Quarto caches are deliberately ignored; they are not committed.

## Build and validate from the parent project

Run from the repository root:

```sh
node scripts/test_dashboard_content.mjs
node scripts/prepare_dashboard_site.mjs
quarto render dashboard
node scripts/audit_dashboard_public.mjs
```

Preview locally:

```sh
quarto preview dashboard
```

The preparation script copies only approved public metadata, case files, briefs, search vocabulary, and flags into `dashboard/data/` and `dashboard/assets/flags/`. The public audit fails if the rendered site includes restricted paths, instructor keys, real-country names, relevance classifications, or diagnostic metadata.

## Student routes

- `/` — country-selection start page;
- `/entopia/` — Entopia dashboard;
- `/moreland/` — Moreland dashboard; and
- `/govistan/` — Govistan dashboard.

## GitHub Pages and repository boundary

The GitHub repository starts at this `dashboard/` directory. Do **not** initialise or publish the parent workspace: `data/instructor/`, `data/raw/`, and the living design document contain analogue mappings and answer-key material.

The dashboard repository contains only approved student-facing source and data. Its GitHub Actions workflow publishes the rendered `_site/` directory as a Pages artifact. The audit runs before every deployment and blocks publication if restricted identifiers appear.

For changes to case data or metadata, regenerate this directory from the parent project and run the parent project's restricted-content audit before committing. The standalone public repository deliberately does not contain the analogue names or instructor answer key, including in its audit code.

GitHub Pages is static hosting. A client-side password screen cannot protect direct URLs or data files. Future login must be supplied by an external access layer, university single sign-on, or another host with authenticated routing.

## Current limitations

- Student-created groups are stored in local browser storage and do not sync between devices.
- Clipboard image copying depends on browser permission; PNG and SVG downloads remain available as fallbacks.
- The site requires network access to load the pinned Observable Plot module from jsDelivr.
- Authentication is intentionally not implemented in this version.
