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

## API routes (built)

`lib/fpl/` is the only place that talks to FPL; `app/api/*/route.ts` are thin
wrappers over it. Cache durations live in `lib/fpl/config.ts`.

| Route | Cache |
|---|---|
| `GET /api/bootstrap` | 1h |
| `GET /api/fixtures` | 24h |
| `GET /api/picks/{managerId}?gw=` | until next deadline; `gw` defaults to current |
| `GET /api/league/{leagueId}?page=` | 1h; page 1 = top 50 |

`getEntry()` (`entry/{id}/`) also exists in `lib/fpl/api.ts` with no route handler —
nothing client-side needs it yet. It's the **only** source of manager name and
team name; `picks/` has neither. §8.3 doesn't list it, so it's cached 1h.

Errors return `{ error: { code, message } }` with `Cache-Control: no-store`.
Codes: `bad_request` 400, `not_found` 404, `picks_not_yet_available` 409,
`forbidden` 502, `unavailable`/`network` 503, `timeout` 504.

Caching uses the **`fetch` Data Cache**, not `use cache`/`cacheComponents`.
`use cache` is in-memory per instance and does not survive Vercel's serverless
runtime, so it would not keep load off FPL's servers; making it durable needs
`use cache: remote`, which costs money and breaks the zero-cost goal. Reasoning
is written up in `lib/fpl/client.ts`.

### /api/bootstrap is a projection, not a faithful proxy

The other three routes return upstream data unchanged. This one does not.

A Next.js cache entry is capped at **2MB** and the upstream payload serialises
to ~2.31MB, so it was silently rejected and every request hit the FPL API.
Trimming the response alone does not fix that (the cap applies to the upstream
body), so the *projection* is the cached unit, via `unstable_cache` in
`lib/fpl/api.ts` — the only free mechanism that persists across serverless
instances and deploys. Result: 1.65MB → 298KB response, 341KB cache entry, 6x
under the limit.

`events`, `teams` and `element_types` pass through whole (~35KB). `elements` is
cut from ~100 fields to these 20 (`lib/fpl/projection.ts`):

```
id, web_name, first_name, second_name, team, element_type,
now_cost, cost_change_event, cost_change_start,
form, total_points, points_per_game, minutes,
expected_goals, expected_assists, expected_goal_involvements,
selected_by_percent, status, news, chance_of_playing_next_round
```

**If a view needs a field that isn't listed, add it** to `FplElement` in
`lib/fpl/types.ts`, to `projectElement`, and to this list. The projection picks
fields explicitly, so TypeScript fails the build if the two drift apart.

## Squad loading (built, §7.1)

`app/page.tsx` is a Server Component reading `?id=`. `lib/fpl/squad.ts`
`loadSquad(managerId)` returns `{ manager, startingXi, bench }` — **this is the
fifteen-row set from §4 that every view adds columns to.** Build views around
it rather than re-deriving picks.

- The page calls `lib/fpl` **directly**, not its own `/api` routes. §8.1 says
  "route handlers", but the real constraint is CORS (constraint 1) and this runs
  server-side; an HTTP hop per render would buy nothing since both share a cache.
- Starting XI vs bench comes from `pick.position` (1–11 / 12–15), **never
  `multiplier`** — Bench Boost gives all fifteen a multiplier ≥ 1.
- The manager ID form is a plain `<form method="get">`. No client JS, no
  hydration; the browser writes §8.2's URL state itself.
- Rank and points come from `picks.entry_history`, not the entry summary, so
  they describe the gameweek on screen.
- Prices: always render via `formatPrice()` in `lib/format.ts` (constraint 4).
- Table wrapper is `overflow-x-auto` + `sticky left-0` first column — §8.5's
  pattern, verified at 320px: page doesn't scroll, table does, column holds.

## Horizon control (§7.6) — shared with Club Blocks

`app/components/horizon-selector.tsx`. Presets **1/3/5/8/10** plus a numeric
input taking any integer from 1 to gameweeks remaining. Out-of-range values
**clamp, never error** (`parseHorizon` → floor/1/38, then `clampHorizon` →
season remainder). Reads/writes one `horizon` URL param so it survives a view
switch — reuse this component in Club Blocks, don't fork it.

**The one Client Component in the app.** §7.6 wants the preset highlight to
follow what's *typed*, before submit, which is browser-only state. It degrades:
presets are real links, the input is in a real GET form. It's keyed on
`view.horizon` at the call site so navigation remounts it — don't reintroduce a
`useEffect` to resync, lint forbids setState-in-effect.

Columns start at the first **unfinished** gameweek, not `is_current`. Once a
gameweek finishes `is_current` still points at it until the next deadline, so
taking §7.2 literally would lead with a dead column and fold a played gameweek
into the score.

## The four views

Rows are the 15 players except where noted.

1. **Fixtures** — "where are my fixture problems?" **Built.** Columns are
   gameweeks (first *unfinished* → GW38), each cell = opponent + H/A, shaded by
   raw FDR. Frozen name column. Blanks = empty cells, doubles = split cells.
   Summary column shows Fixture Score over the §7.6 horizon.
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
Normalised to 0–10 as of requirements v1.7.

```
fixtureValue  = 6 - FDR                                    # FDR 1 → 5, FDR 5 → 1
fixtureScore  = ( sum(6 - FDR) / gameweeksInHorizon ) × 2  # 0–10, 6.0 = average
```

**Divide by gameweeks, never by fixtures.** Gameweeks is a constant for a given
horizon, so it only rescales. Dividing by fixture count is the averaging §6.2
rejects — it would destroy the blanks/doubles handling.

**Never cap above 10.** A double gameweek legitimately exceeds what singles can
reach; §6.1 calls that informative, not an error.

Invert-then-sum handles blanks and doubles with no special-casing: a missing
fixture contributes 0 and lowers the score; an extra fixture adds value and
raises it. No distance decay in v1 (deferred — adds a tuning parameter).

Display to **one decimal place** with fixture count in brackets: `7.2 (5)`,
`4.8 (4)` blank, `14.0 (7)` double. Normalisation makes the count *more*
important, not less — it's what explains a surprising score.

Anchors (horizon-independent): all FDR 1 → 10.0, FDR 2 → 8.0, FDR 3 → 6.0,
FDR 4 → 4.0, FDR 5 → 2.0. Summary colour bands sit symmetrically around 6.0
(`NEUTRAL_SCORE`) at ±0.5 and ±1.5.

Pure horizon/score arithmetic lives in `lib/fpl/horizon.ts`, deliberately
**not** `server-only` — the horizon control is a Client Component and importing
a server-only module from one fails the build. `lib/fpl/fixtures.ts` re-exports
it for server callers.

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
