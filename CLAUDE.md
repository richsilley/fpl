@AGENTS.md

# FPL Squad Matrix

Full requirements: [docs/FPL-Squad-Matrix-v1-Requirements.md](docs/FPL-Squad-Matrix-v1-Requirements.md) (v1.12; v1 feature complete).

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
`forbidden` 502, `unavailable`/`network` 503, `timeout` 504. Full contract in
§8.6. **Never cache a failure** — an outage at a deadline must not be served
for the next hour. Only 200s are stored, so this is automatic for `fetch` but
must be preserved by hand anywhere else.

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
cut from ~100 fields to these 22 (`lib/fpl/projection.ts`):

```
id, web_name, first_name, second_name, team, element_type,
now_cost, cost_change_event, cost_change_start,
form, total_points, points_per_game, minutes,
expected_goals, expected_assists, expected_goal_involvements,
defensive_contribution, defensive_contribution_per_90,
selected_by_percent, status, news, chance_of_playing_next_round
```

`defensive_contribution_per_90` arrives as a number (not a string like the xG
fields) and equals `defensive_contribution / minutes * 90`, so nothing needs
deriving. It is a season average against a per-match threshold — see
`lib/fpl/defcon.ts` for why that makes it a proxy, not a prediction.

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

**All three fifteen-row tables share their geometry** via
`app/components/table-metrics.ts`: header height, row height, frozen player
column width, and the sticky offset for anything pinned beside it. Switching
Fixtures → Form → Ownership must change the columns and *nothing else*; a
one-pixel disagreement reads as the page reloading. The heights are exact
pixels (`h-[57px]`/`h-[45px]`), not `h-14`/`h-11` — those round to 56/44 and
leave the other tables a pixel short of Fixtures, whose two-line fixture chip
sets the real height. Each table also needs the **trailing spacer column**, or
`w-full` shares the surplus out among the real columns.

## URL state (§8.2) — read this before adding a control

All params in `lib/fpl/params.ts`. **Every control is a link or a GET form, and
every one must carry the whole state through** — otherwise changing the horizon
silently resets the sort, or sorting bounces you to another view. Use
`buildHref({id, view, horizon, sort, league, rival})`; it omits values at their default, so
`?id=X` alone is the canonical fixtures/horizon-5 URL §8.2 requires. The
horizon control's GET form needs hidden `view`/`sort` inputs for the same
reason. Invalid values fall back to defaults, never error.

`view` is `fixtures` | `form` | `ownership` | `clubs`, default `fixtures`.
`league`/`rival` pick the Ownership population and are **not** mutually
exclusive: `rival` wins when both are set. Both together means "this rival,
picked from this league" — the league stays so the rival dropdown survives
being used. Entering a league ID does clear the rival.

**Carry params a view doesn't use.** Form has no horizon and hides the control,
but the param still rides through, so switching Form → Fixtures returns to the
horizon you left. `usesHorizon(view)` gates the control and the legend.

## Module map

**`lib/fpl` is the only code that talks to FPL.** Two tiers, and the split is
load-bearing:

| Server-only (`import 'server-only'`) | |
|---|---|
| `client.ts` | the single egress point: user-agent, timeout, cache config, error mapping |
| `api.ts` | one function per endpoint + cache durations |
| `projection.ts` | trims bootstrap to the 22 fields (§5.3) |
| `squad.ts` | `loadSquad()` → the fifteen-row set |
| `views.ts` | `loadMatrixData()` → what every view is built from |
| `fixtures.ts` | fixture index + Fixture Score |
| `clubs.ts` | Club Blocks rows + sorting |
| `reference.ts` | Ownership populations, `compareOwnership()`, `leagueMembers()` |
| `concurrency.ts` | the bounded fan-out for league mode |
| `http.ts` | route-handler helpers |

| Client-safe (**must not** import `server-only`) | |
|---|---|
| `horizon.ts` | horizon parsing/clamping, score formatting |
| `params.ts` | URL state, `buildHref` |
| `ownership.ts` | bands, direction flag, strategy ordering of the bands |
| `defcon.ts` | DefCon thresholds + bar ratio (§7.3) |
| `availability.ts` | status-code mapping |
| `lib/format.ts` | price, rank, points |

The horizon control is a Client Component and imports `params.ts`/`horizon.ts`.
**Adding `import 'server-only'` to anything in the second table breaks the
build.** That's why the pure helpers live apart from the modules that fetch.

## One loader for all views

`loadMatrixData()` in `lib/fpl/views.ts` returns squad + fixture index + teams
+ columns + totalPlayers. **Fixtures and Club Blocks share one fixture index**,
so they can't disagree about a score — a club reading 6.4 in one and 6.0 in the
other would be a visible bug. Add view-specific shaping in its own module
(`clubs.ts`, `reference.ts`), not in the loader.

Shared cell/badge rendering and both colour scales live in
`app/components/fixture-visuals.tsx`. Don't re-implement per view.

## Horizon control (§7.6) — Fixtures and Club Blocks only

`app/components/horizon-selector.tsx`. Presets **1/3/5/7/All** plus a numeric
input taking any integer from 1 to gameweeks remaining. "All" resolves to
the remaining gameweeks — it is a normal horizon value, not a special case. Out-of-range values
**clamp, never error** (`parseHorizon` → floor/1/38, then `clampHorizon` →
season remainder). Reads/writes one `horizon` URL param so it survives a view
switch — reuse this component in Club Blocks, don't fork it.

**Still the only Client Component in the app.** §7.6 wants the preset highlight to
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

1. **Fixtures** — "where are my fixture problems?" **Built.** Columns are the
   gameweeks **in the horizon** (1 selected → 1 column); headers read "GW3".
   A trailing spacer column soaks up leftover width so short horizons don't
   stretch cells across the page. Each cell = opponent + H/A, shaded by
   raw FDR. Frozen name column. Blanks = empty cells, doubles = split cells.
   Summary column shows Fixture Score over the §7.6 horizon.
2. **Form** — "who is playing well / at risk?" **Built, redesigned §7.3.1.**
   Columns in order: price, GW change, season change, pts, PPG, form, mins,
   xGI, DefCon. (No xG/xA, no Status/News columns — those were removed.)

   **Only the bar columns get width** (w-20); everything else is sized to its
   content, Season excepted — it's sized to fit its own header. The table is
   `w-full` **plus a trailing spacer column**; without the spacer the surplus
   redistributes and quietly re-widens the slim columns.

   **Data bars on four columns.** Form and xGI scale to the squad max
   (comparison); **Mins scales to gameweeks × 90** (reliability — a full bar
   means every minute played, regardless of squad); **DefCon scales to the
   player's positional threshold** (10 DEF, 12 MID/FWD), capped so clearing the
   line fills the bar. Muted single tones, never a red-green scale: 15 players
   in one squad is a narrow range. One hue per column (sky/grey/violet/cyan) so
   they read as separate columns. **Anchored left** — right-anchored, short bars
   hide behind their own number.

   **DefCon is a proxy, not a prediction** — see `lib/fpl/defcon.ts`. It's a
   threshold stat capped at two points, so a season average can't tell a player
   who clears the line most weeks from one posting extremes in a few. A real hit
   rate needs `element-summary/{id}/`, which is deferred.

   Headers are centred except Player; data is centred except Player and the bar
   columns, whose numbers stay right-aligned against the end of their own bar.

   Availability is a dot before the name + tinted row + optional news line, not
   columns. Mapping in `lib/fpl/availability.ts`; unknown codes fail to "out".
   GKP xGI renders an em dash — a zero reads as bad, a dash as not applicable.
   Zero price change renders empty, not a dash.

   Sorting is per-group (XI and bench stay split), ties fall back to squad
   order, and the Player header is the way back to squad order.
3. **Ownership** — "is this player worth owning given who else owns them and where
   I sit?" **Built, all three modes.** `compareOwnership()` in
   `lib/fpl/reference.ts` is *the* one function — it takes a population and
   never asks which mode it's in. Only `ownershipOf` differs. **Add a fourth
   population by writing a loader, not by branching the function.**

   **Six fixed columns in every mode**: Player, Global, League, Rival, Diff,
   Flag. Modes fill only what they measure and **dash the rest** (global dashes
   League/Rival/Diff; league dashes Rival; rival dashes League). Don't go back
   to hiding columns per mode — the table then reflowed on every switch. A dash
   means "not measured here", which is not the same as zero.
   Bands: Template ≥40, Popular 15–40, Low 5–15, Differential <5.

   **Rival dropdown** lists the selected league's managers (team — manager, by
   league rank, you excluded). `leagueMembers()` reads the *same cached*
   standings call the league population makes, so it costs no extra request.
   Hidden in global mode. Manual rival ID field stays, for rivals outside your
   leagues.

   **League mode is the app's only fan-out.** Top 50 by league rank, 8 `picks/`
   calls in flight (`PICKS_CONCURRENCY`) — a single call is >1s, so 50 in series
   would be 90s. ~6s cold, ~1.4s cached. Wrapped in `<Suspense>` and the page
   sets `maxDuration = 60`; without both, a cold load blanks the page and can
   exceed the platform default. Failed squads shrink the denominator and are
   reported, they don't break the view. You count in your own league's numbers.

   Rank is taken **within the compared group**, not the whole league — on a big
   league you may sit outside the top 50, and then there's no ahead/behind call.

   **Flag colour is strategy-relative, and reverses with the direction flag.**
   Ahead of the field a differential is a risk; behind, it's how you close the
   gap — same player, opposite meaning. So the colour is not fixed per band: the
   *label* carries the band, the *colour* carries whether that band helps you
   now. Ahead, best→worst is Template, Popular, Low, Differential; behind, the
   exact reverse. Four steps, **two greens and two reds, no amber** — amber
   would read as neutral and there is no neutral. `bandStrategyOrder()` /
   `bandStrategyStep()` in `lib/fpl/ownership.ts`; `unknown` position → grey,
   never a guess. The legend re-orders and re-colours to match. §6.4's
   green-means-good rule holds, because green always means "helps you".

   Direction still lives in one guidance line above the table, never per player
   (§7.4). Denominator is `total_players`; median split; null rank → unknown.
4. **Club Blocks** — "who should I buy?" **Built.** The deliberate exception:
   rows are the **20 clubs**, not the 15 players. Fixture Score over the §7.6
   horizon, sortable (default highest first). Owned count per club with an
   amber "3 max" badge at the three-per-club limit. **Columns, headers and
   widths behave exactly as Fixtures** — horizon selects the columns, "GW3"
   labels, trailing spacer. Keep the two in step.

Build order: all seven steps complete. Remaining work is v2 (§10).

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
