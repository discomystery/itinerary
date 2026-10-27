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

## Design language (v1.1)

- **Matte chrome, paper plans.** The app frame is flat and solid. Only plans get
  paper texture and a soft lift, so they read as the content.
- **Plans are real objects.** Events are tickets (the stub holds the hard time),
  flights are boarding passes, transit is an HSL-style fare, bookings are
  reservation cards (dashed until booked), lodging is a key card, places are
  postcards (stamp + time), areas are folded maps, notes are sticky notes.
- **One skeleton** for every object: body (glyph + what/when, title, one detail)
  and a fixed 64px signature column, so times line up down the page.
  Sizes: compact (list), detail (sheets), tile (two-up Ideas).
- **Kind glyphs** (Lucide icons) name each object instead of colored stripes.
- **Transit is a rail** between plans with a tappable pill per leg
  ("21 min · leave 3:54p"). Tight connections turn amber. Tap for a sheet that
  compares walk / transit / taxi with leave-by times and opens directions.
- **Daylight**: a horizon bar under the date (dotted night, solid ink day, red
  now tick) and "SUNSET 3:59P" set on the rail where it falls.
- **Plan** has a List view (default) and a calendar-style Day view where travel
  time is a striped lead-in above each plan.

## Adding lots of ideas (v1.2)

- **Paste a list** (Ideas → List): one idea per line from a text, notes, a blog
  list or Google Maps links. Bullets, `#tags`, "Title – note", "Title (note)",
  a leading day ("Sat: …") and section headers ("Food:") are understood. Kind
  hints come from words like dinner, sauna, museum, bar, neighborhood, tickets.
  Google Maps place links give the name and pin directly.
- Everything lands in an **Inbox**. Each idea is looked up on OpenStreetMap in
  the background (one per second, Nominatim's limit) to fill in the pin,
  address, hours and website.
- **Review one card at a time**: check or change the map match, vote, then Keep,
  Skip (or swipe), Later, or "Keep and place it" on a suggested day. Day
  suggestions respect opening hours and prefer the day the list mentioned, then
  days with plans nearby.
- Next options: Google Takeout saved lists, browse nearby by category, and
  AI extraction from any text once there's a backend.

## Papermap baseline (v1.3)

The app is **Papermap**: old-school travel paper is the design language.

- **Header band**: the folded-map wordmark and who you're voting as, then each
  tab's title, subtitle and controls on the same white band. Under it, the
  matte desk with small-caps section labels and one white panel style.
- **Cards unfold.** Tap a plan to open its second row: the details it would
  print (seat, gate, door code, meeting point…) beside a stub (QR, postmark,
  key, CUSTOMER COPY). Directions · Edit · More are printed along the bottom.
  Times print with a small a/p so long ones fit the 64px column.
- **Card kinds** (`src/lib/cards.ts`): ticket (event, timed entry), boarding
  pass (flight, train, ferry, coach), transit fare (single, day pass), transfer
  chit, reservation, hotel key card, rental key tag (rental, hostel), rental
  agreement (car), tour voucher, city pass, postcard, folded map, sticky note.
  Each kind has its own fields (`details`), and stays, cars and passes span
  from their first time to their last.
- **Spanning items** show as full cards only on days they have a block; on the
  days between they're slim ribbons at the top of the day ("Night 3 of 5").
- **Postcards** stamp VISITED (tap the dashed box) at a different angle from
  the hours postmark, with faint cancellation lines behind the note.
- **Now** is a dashboard: the next leg drawn on a scrap of map (the leave flag
  slides toward the ✕ and turns amber, then red), a ticket stub for the next
  fixed time (or sunset), a fare card for travel left today, then today's plans
  and open-nearby. Late? +15 / +30 / +60 opens the fix-it sheet.
- **Ideas** tiles are one height; the airmail envelope is the Inbox.
- **Trip**: a trip card, people (You / Vote as), a leather **documents wallet**
  (passports, entry rules, insurance, loyalty; never on the plan and left out
  of share links), share and back up, and a Preview-a-time switch.

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
