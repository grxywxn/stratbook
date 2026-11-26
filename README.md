# Stratbook

A small Windows app for planning Rainbow Six Siege strats and keeping operator guides.

- Strats per map and bomb site: lineup and jobs, plan by phase, notes, tags, and a win/loss log
- Strat board: drag operators and utility onto each floor's blueprint; draw routes, arrows, freehand marks, labelled zones and notes, per phase; export as PNG
- Blueprints: import your own image for each floor and pin callout labels on it
- Operator guides with colour emblems (or your own pictures, imported one by one or as a pack), loadouts to pick from, tips, counters and favourite maps
- Arsenal: every weapon and secondary gadget with silhouettes, carriers, attachments, recoil notes and ratings
- Maps home with a generated banner and colour for every map (or your own banner)
- Stats: win rate by side, map, site, strat and operator
- Search everything with Ctrl+K; export and import a full backup

Built with Tauri 2 and plain HTML/CSS/JS. Data lives in `%APPDATA%\com.grxywxn.stratbook`.

The installer is built by GitHub Actions on every push to `main` (see Releases).
