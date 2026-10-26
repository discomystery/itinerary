# Itinerary: plan

A trip planner for dynamic group trips, where plans change fast and not everything
is a neat calendar event.

## Core idea: a richer time model

Every idea (an **Item**) can carry several kinds of time at once:

| Kind | Example | How the app uses it |
|---|---|---|
| **Hard anchor** | Puck drop 7:00p | Never moves. Running late can't push past it. |
| **Soft anchor** | Doors 5:30p (est.) | Nice to make. A fixed block can give up this lead-in time. |
| **Opening hours** | `Mo-Sa 08:00-18:00; Su off` | Constrains *when* it can go; flags closed/partly closed. |
| **Duration** | min 60 / usually 120 / max 180 | Gap-fitting, and how much "running late" can trim. |
| **Daylight preference** | Suomenlinna | Info flag if scheduled after dark (sunset ~4p in Nov). |
| **Nebulous area** | "Wander Kallio" | A circle on the map instead of a pin; no hours. |

Items are the wishlist; **Blocks** place an item on a day. An item can be on
the schedule zero, one, or many times.

## Decisions (v1)

- **Mobile-first web app / PWA**: one codebase, shareable by link.
- **Local-only** (localStorage) first; all data goes through one Zustand store so
  a sync backend (Supabase etc.) can drop in later.
- **Free/open map data**: Leaflet + OpenStreetMap tiles, Nominatim search (pulls
  `opening_hours` when OSM has it), the `opening_hours` library to evaluate hours,
  and `suncalc` for daylight.
- **Transit** is estimated (straight-line × detour ÷ mode speed + overhead) with a
  Google Maps directions link for the real route.
- **Running late suggests fixes** (shorten / move / skip / taxi) rather than just warning.

## v1 features (built)

- **Plan**: day strip with issue dots; timeline with night shading, an hours
  rail on each block (green open / red closed), anchor tick marks, drag to
  move/resize, tap empty time to add, column layout for overlaps; transit chips
  between plans (tap to change mode, ↗ for directions); conflict detection:
  closed, partly open, overlap, late for an anchor, tight connection, after dark.
- **Ideas**: filters (not scheduled, must-dos, everyone's in, needs my vote,
  needs details), per-person voting, "schedule" finds the first open gap each
  day that fits the duration *and* the hours.
- **Map**: day route with numbered stops, everything mode, areas as dashed
  circles, color by type or by group interest heat.
- **Now**: current block with progress, next up with **leave-by** time, next
  hard anchor countdown, **running late +10/15/30/60** with suggestions,
  **open now nearby** that fits before the next plan. "Pretend it's…" lets you
  preview any time before the trip.
- **Trip**: people (colors, "viewing as" switcher for votes), dates, timezone,
  default transit mode, share link / export / import, undo for everything.
- Multi-timezone anchors (e.g. departure from RDU in Eastern time).

## Next (v2 candidates)

1. **Real-time sync + accounts** (Supabase): each person votes as themselves; activity feed.
2. **Group splits**: blocks already have `who?: Id[]`; add per-person lanes and meet-up points.
3. **Smart fill**: "we have 3 free hours, suggest a cluster of nearby must-dos."
4. **Real routing** (OSRM / HSL Digitransit API for Helsinki public transit times).
5. **Offline** service worker (tiles + data) for spotty roaming.
6. Attachments for tickets/confirmations; expense split; import Google Maps lists.
7. Code-split the map and hours libraries (bundle is ~250 KB gzipped).

## Helsinki trip seed (Nov 10–16, 2026)

- Hurricanes vs Kraken at Veikkaus Arena: **Thu Nov 12, 7:00p** and **Sat Nov 14, 8:00p** (from the NHL announcement).
- Doors times and all opening hours are estimates and are marked *unverified*. Check them before relying on them.
- Flights and lodging are placeholders with "needs details" flags.
