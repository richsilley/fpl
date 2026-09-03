@AGENTS.md

# FPL Squad Matrix

Full requirements: [docs/FPL-Squad-Matrix-v1-Requirements.md](docs/FPL-Squad-Matrix-v1-Requirements.md) (v1.1, approved for build).

## What this is

A free, no-login web tool. Enter any FPL manager ID and their 15 players load as
15 fixed rows. The rows never change within a session; each **view swaps the
columns** to answer a different question. State lives entirely in the URL
(`/?id=1234567&view=fixtures&horizon=5`), so every view is shareable and no
accounts or storage are needed.

Non-goals for v1: no AI/LLM, no accounts/login/saved state, no chip/transfer
calendar, no season planner, no writing transfers back to FPL, no points
projection.

## Tech stack

- Next.js on Vercel (hobby tier — target cost is zero)
- All FPL API calls in server-side route handlers, **never from the browser**
- No database in v1; caching does the work instead
- Mobile is the primary target: frozen first column + horizontal scroll on every view

Caching: `bootstrap-static` 1h, `fixtures` 24h, a manager's `picks` rest of
gameweek (immutable once deadline passes), league standings 1h.

## The four views

Rows are the 15 players except where noted.

1. **Fixtures** — "where are my fixture problems?" Columns are gameweeks (current
   → GW38), each cell = opponent + H/A, shaded by raw FDR. Frozen name column.
   Blanks = empty cells, doubles = split cells. Summary column shows Fixture
   Score over a selectable horizon (3/5/8/10 GWs).
2. **Form** — "who is playing well / at risk?" Columns: price, price change this
   GW, price change since season start, form, total points, PPG, minutes, xG, xA,
   xGI, availability status, injury news text. Availability visually obvious: red
   = out, amber + % = doubtful, no flag = available.
3. **Ownership** — "is this player worth owning given who else owns them and where
   I sit?" One function, three reference populations (identical calc, only the
   denominator changes): Overall rank (`selected_by_percent`), Mini league (top
   50 by league rank, one `picks/` call each, cache for the GW; larger leagues
   show a top-50 notice), Single rival (one `picks/` call). Columns: global
   ownership %, reference ownership %, difference. Shows one line of ahead/behind
   guidance derived from the user's rank within the population.
4. **Club Blocks** — "who should I buy?" The deliberate exception: rows are the
   **20 clubs**, not the 15 players. Sole metric is Fixture Score over a
   selectable horizon, sortable highest first. Flags which clubs the user already
   holds players from and how many (three-per-club limit).

Build order: (1) API routes w/ caching + headers, (2) squad loading, (3)
Fixtures, (4) Club Blocks, (5) Form, (6) Ownership global, (7) Ownership
league/rival. Steps 1–3 are a shippable tool on their own.

## Fixture Score

A single number for how good a run of fixtures is. Used in the Fixtures summary
column and as the only metric in Club Blocks. **Higher is better.**

```
fixtureValue  = 6 - FDR                          # FDR 1 → 5, FDR 5 → 1
fixtureScore  = sum(6 - FDR) for all fixtures in the horizon
```

Invert-then-sum handles blanks and doubles with no special-casing: a missing
fixture contributes 0 and lowers the score; an extra fixture adds value and
raises it. No distance decay in v1 (deferred — adds a tuning parameter).

Display as score with fixture count in brackets: `18 (5)`, `21 (6)` double,
`15 (4)` blank. The count lets the user judge quality vs quantity themselves.

**Do not call this FDR** — users expect low FDR = good, and this inverts that.
Label it **Fixture Score**. Colour rule is constant: green = good everywhere.
Individual fixture cells show raw FDR (green = low); summary and Club Block cells
show Fixture Score (green = high).

Detecting (neither is flagged by the API; inert until ~GW18 when cup rounds /
postponements resolve): **blank** = team has no fixture object with that `event`
number; **double** = two fixture objects share the same `event` for that team.

## FPL API constraints

Data source: undocumented public API at `https://fantasy.premierleague.com/api/`.
Endpoints: `bootstrap-static/` (players, teams, GWs, prices, ownership, form, xG,
xA, injuries), `fixtures/` (all 380 + FDR both sides),
`entry/{id}/event/{gw}/picks/`, `entry/{id}/`, `leagues-classic/{id}/standings/`.

1. **CORS** — API sends no CORS headers; all calls must be server-side.
2. **User agent** — API returns 403 to non-browser-looking requests; set a
   browser user-agent header on every server call.
3. **Picks are private before the deadline** — `picks/` only returns data for
   GWs whose deadline has passed, so rival comparison is always retrospective.
4. **Prices are in tenths** — `now_cost: 75` means £7.5m.
5. **Availability** — the API goes down around GW deadlines and through the
   June–July off-season; response shapes occasionally change over the summer
   (re-check each August).
