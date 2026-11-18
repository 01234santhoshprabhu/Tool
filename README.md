# Scoring & Data Tools

A browser application for inspecting assignment scores, summarizing attendance, comparing datasets, and exporting reports.

[Open the live app](https://01234santhoshprabhu.github.io/Tool/)

## Features

- Import CSV and Excel files and group assignment data by course duration.
- Calculate best-assignment averages and scores out of 25.
- Compare old and new score dumps and cross-check score sheets.
- Summarize attendance by action, cohort, course, and exam date.
- Map programming and manual assignment headers to course-specific labels.
- Filter datasets and export CSV, Excel, or grouped ZIP reports.

## Run locally

Clone the repository, open its directory, and start a static server:

```bash
python -m http.server 8000
```

Open [localhost:8000](http://localhost:8000/). The application opens directly without a Google login.

## Project structure

- `index.html` — application layout and tool panels.
- `js/core-data.js` — file parsing, columnar storage, scoring, and exports.
- `js/assignment-logic.js` — scoring rules and formula configuration.
- `js/attendance.js` — attendance filters and summaries.
- `js/score-diff.js` and `js/score-cross-check.js` — comparison tools.
- `js/data-filter.js` — background filtering with Web Workers.
- `js/pso-tools.js` — programming and manual score processing.
- `css/` — application styles.

## Technologies

JavaScript, HTML, CSS, Web Workers, Papa Parse, SheetJS, JSZip, and Chart.js. Frontend libraries load from CDNs, so an internet connection is needed.

Core file processing runs in the browser. Optional shared saved-run features use the Supabase endpoint configured in `js/score-cross-check.js`.

## Known limitations

- Registration reconciliation can fail when candidates are missing from the assignment dump.
- Saved runs depend on the availability of the configured Supabase backend.
