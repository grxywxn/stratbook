# Stratbook

A small Windows app for planning Rainbow Six Siege strats and keeping operator guides.

- Strats per map and bomb site: lineup and jobs, plan by phase, notes, tags, and a win/loss log
- Strat board: draw on each floor's blueprint with operator tokens, paths, utility markers and notes, per phase; export as PNG
- Blueprints: import your own image for each floor and pin callout labels on it
- Operator guides with original emblems (or your own picture), loadout, tips, counters and favourite maps
- Stats: win rate by side, map, site, strat and operator
- Search everything with Ctrl+K; export and import a full backup

Built with Tauri 2 and plain HTML/CSS/JS. Data lives in `%APPDATA%\com.grxywxn.stratbook`.

The installer is built by GitHub Actions on every push to `main` (see Releases).
