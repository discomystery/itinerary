# itinerary

A mobile-first trip planner for fast-changing group trips. It supports hard and
soft times, opening hours, nebulous "go wander here" areas, transit gaps, group
interest voting, and a day-of **Now** view with "running late" fixes.

See [docs/PLAN.md](docs/PLAN.md) for the feature plan and roadmap.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # scheduling / hours / reflow logic
npm run build
```

Pushes to `main` deploy automatically to GitHub Pages (`.github/workflows/deploy.yml`).

Data lives in your browser (localStorage). Use **Trip → Share link / Export** to
send a copy to someone else. It comes pre-loaded with a Helsinki NHL Global Series
trip; **Trip → Reset** brings it back.
