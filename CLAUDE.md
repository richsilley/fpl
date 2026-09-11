@AGENTS.md

# FPL Squad Matrix

Full requirements: [docs/FPL-Squad-Matrix-v1-Requirements.md](docs/FPL-Squad-Matrix-v1-Requirements.md) (v1.31; v1 feature complete).

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

Caching: `bootstrap-static` 1h, `fixtures` **1h**, a manager's `picks` rest of
gameweek (immutable once deadline passes), league standings 1h.

**`fixtures` is 1h, not the 24h §8.3 originally specified.** The fixture list
changes rarely but the same payload carries `started`/`finished`/scores, and
two features divide bootstrap figures by fixture figures (§6.7 rating, §7.3
average minutes). At 24h they disagreed mid-gameweek and Mins read 135 per
match. **Any two figures divided by each other need payloads of the same age.**

## API routes (built)

`lib/fpl/` is the only place that talks to FPL; `app/api/*/route.ts` are thin
wrappers over it. Cache durations live in `lib/fpl/config.ts`.

| Route | Cache |
|---|---|
| `GET /api/bootstrap` | 1h |
| `GET /api/fixtures` | 1h |
| `GET /api/picks/{managerId}?gw=` | settled gameweek → rest of season; otherwise until next deadline |
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

**Picks have two lifetimes, and `data_checked` picks between them.** The picks
themselves are immutable at the deadline, but the same payload carries
`entry_history` — the gameweek's points and rank — which keeps moving while
matches run and again when bonus lands. So a gameweek FPL has marked
`finished && data_checked` is held to the end of the season; anything else is
held to the next deadline, as before (`picksCacheSeconds`). In a 38-gameweek
season all but the newest gameweek is settled.

**It is bounded to the season, not cached forever, because FPL reuses gameweek
numbers.** `/entry/123/event/3/picks/` means a different squad next season at
the same URL, so an unbounded entry would serve last season's data after the
rollover.

**Identical in-flight requests are coalesced** (`inFlight` in `client.ts`). The
Data Cache only helps once a response exists; until then a burst of readers on
one cold league each start their own fan-out. Coalescing collapses that to one
call per distinct URL. **Per instance only** — cross-instance dedup needs shared
state, which costs money. It is not a cache: entries are dropped the moment the
request settles either way, so §8.3's never-cache-a-failure rule is unaffected
and the next caller retries.

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
cut from ~100 fields to these 25 (`lib/fpl/projection.ts`):

```
id, web_name, first_name, second_name, team, element_type,
now_cost, cost_change_event, cost_change_start,
form, total_points, points_per_game, minutes,
expected_goals, expected_assists, expected_goal_involvements,
defensive_contribution, defensive_contribution_per_90,
ep_next,
selected_by_percent, transfers_in_event, transfers_out_event,
status, news, chance_of_playing_next_round
```

`defensive_contribution_per_90` arrives as a number (not a string like the xG
fields) and equals `defensive_contribution / minutes * 90`, so nothing needs
deriving. It is a season average against a per-match threshold — see
`lib/fpl/defcon.ts` for why that makes it a proxy, not a prediction.

`ep_next` **arrives as a string** (`"5.0"`) — parsed in `squad.ts`, typed
`string | number` since nothing stops FPL sending a number.

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
- Header is **two visually separated groups** — GW points/GW rank/Top%, then
  Overall points/Overall rank/Top% — split by a rule *and* a wide gutter,
  because either alone read as one strip of six. No headings: the labels
  already say GW and Overall. Between a deadline and first kickoff it correctly
  shows 0 points and dashes for rank.
- `formatTopPercent` is **floored at 0.1%**. One decimal runs out around rank
  5,200 of ten million, and "0.0%" read as missing data rather than as the best
  answer there is.
- Prices: always render via `formatPrice()` in `lib/format.ts` (constraint 4).
- Table wrapper is `overflow-x-auto` + `sticky left-0` first column — §8.5's
  pattern, verified at 320px: page doesn't scroll, table does, column holds.

**View as another manager (§7.1.1).** `loadMatrixData(as ?? id)` — every view
renders the borrowed squad. The picker sits *above* the tabs and persists
across all four. Its league list comes from `loadManagerLeagues(myId)`, **not**
from `data.squad.manager`: while a rival's squad is loaded that object is
*theirs*, so reading leagues off it would swap the user's leagues for the
borrowed manager's. Both fetches are cached and both degrade to "no picker"
rather than an error page. The error path keeps its own "Back to my team" link,
or a rival whose squad won't load strands the reader.

**Score and strength columns are real columns at every width.** They used to
collapse below `sm` into bare badges under the name — three numbers with no
headings, and on Teams it killed the sort, since the headers are the only way
to reorder. The tables already scroll sideways behind a frozen first column;
these join that scroll. Do not reintroduce `hidden sm:table-cell` here.

**All three fifteen-row tables share their geometry** via
`app/components/table-metrics.ts`: header height, row height, frozen player
column width, and the sticky offset for anything pinned beside it. Switching
Fixtures → Form → Ownership must change the columns and *nothing else*; a
one-pixel disagreement reads as the page reloading. The heights are exact
pixels (`h-[57px]`/`h-[45px]`), not `h-14`/`h-11` — those round to 56/44 and
leave the other tables a pixel short of Fixtures, whose two-line fixture chip
sets the real height. Each table also needs the **trailing spacer column**, or
`w-full` shares the surplus out among the real columns.

## Scratch squad (§7.7)

`?out=427,318&in=351,290` — **a positionally paired diff, not a squad.** The
base fifteen still load from FPL every request, so a shared link stays current
instead of freezing a snapshot. `applyScratch` substitutes players into the
loaded squad keeping squad position and armband, so **no view knows it is
rendering a scratch squad**.

- **A stale pair is dropped, never fatal** (`dropped`, with a dismissible
  notice). A link saved before a rollover names players who have left.
- **Duplicates are the one thing refused.** Over budget and 4-per-club are
  legitimate intermediate states you can transfer your way out of; a duplicate
  is not, and would silently leave 14 players. Owned rows are listed and
  flagged but not clickable, and `applyScratch` drops a hand-edited one.
- **Never filter the panel.** Unaffordable and club-limit rows stay, flagged.
  It is a planning surface, not a validator.
- Budget is `bank + sold - bought`. `bank`/`value` are **last-deadline**
  figures that do not move with prices — the strip says so, and must keep
  saying so.
- `ReplacementPanel` is a Client Component (with the horizon control,
  `AutoSubmitSelect` and `OverlayKeys`): search filters as you type. Rows
  are still server-built links, so the swap itself needs no JS.
- Ranking follows the reader: the active column sort, else the view default
  (`rankingFor`). Ownership needs the ahead/behind direction, which
  `populationDirection` gets from one cached call rather than waiting on the
  fifty-squad fan-out. `rankingFor` returns **two names**: `label` for the
  description sentence, `column` for the heading over the values.
- **The panel explains its own badges.** A footer defines `in squad`,
  `over budget` and `4th <club>`, then says why unusable rows are listed at
  all. Both were previously written down only in the requirements.

## App shell (§7.8)

**The app is four views over one squad; everything else is chrome.** Load-squad
and view-as live in the **Options dialog**, not on the page. The four views are
segmented buttons at full width — the loudest thing below the header.

- **Header, scratch strip and view tabs are one sticky stack** (`page.tsx`),
  so they cannot overlap — none of the three positions itself. The tabs are in
  it because switching view is the primary act, and on a long table scrolling
  used to strand the reader with no way across without returning to the top.
  All three pad back to the same gutter.
- **The header carries the manager ID** beside the team and manager names. It
  is what a reader hands to someone else to reproduce what they are looking at,
  and it is otherwise only in the address bar. Beside the name it names, so a
  borrowed squad's ID is never mistaken for your own.
- On a phone the six stat tiles collapse to one line of text; sticky tiles
  would eat a third of the screen.
- **Viewing as → the whole header turns amber and holds "Back to my team".**
  The picker in Options deliberately has no second copy of that button.
- **Overlays float over a backdrop; they never push the page down.** Options,
  Ownership population picker, replacement panel. All three are **URL state**
  (`panel=menu`, `panel=population`, `swap=<id>`) — opening is a link, the
  backdrop is a link, so click-away dismissal is free and needs no JS. Unlike
  `out`/`in`, `panel` and `swap` are **not** carried between views.
- **All three are the same centred dialog**, differing only in `width`
  (`narrow` for Options, `wide` for the other two). Options was a left drawer,
  which made the app's one settings panel look like a different kind of object
  from the other two. Do not reintroduce a drawer variant.
- **`OverlayKeys` adds Escape and focus return** to every overlay — the two
  things a link cannot express. It renders nothing and is an enhancement only:
  without JS the backdrop and Close still dismiss. Focus is captured on mount
  and restored on unmount if the node is still connected.
- **Narrowing a choice keeps an overlay open; answering it closes.** Picking a
  league carries `panel` through (it produces the list to read next); picking a
  team or a rival does not. Same rule in Options and the population picker.
- **The manager dropdown is present but disabled** until a league is chosen. It
  used to be absent, which left no sign that a second step followed, so picking
  a league looked like it did nothing.
- **The view tabs report being pressed** (`TabPending`, `useLinkStatus`). Every
  view is the same route with different search params, so switching is a server
  round trip and the tabs cannot know which is selected until it returns:
  measured 200ms warm, 350ms on 4G, 740ms for Ownership in league mode, with
  **nothing changing on screen** for the whole of it. A press with no reaction
  reads as ignored, not slow, and people press again. Feedback now lands in
  under 30ms. **Not `loading.tsx`**, which the Next docs otherwise prefer: the
  header, scratch strip and tabs all live in `page.tsx`, so a route-level
  fallback would blank the tab you just pressed and flash the whole shell —
  and moving the shell to a layout is not possible, since it is built from
  `searchParams`, which layouts do not receive. That leaves a dynamic route
  with no loading file, which is the case `useLinkStatus` documents itself for.
  It is `aria-hidden` and decorative, so the no-JS path is unaffected.
- **One gutter for the whole page.** The sticky bars bleed to the window edge
  but pad back to the same gutter, and bars and content share `max-w-[1600px]`
  centred. Menu button, tabs and every table start on the same line. Change the
  padding in one place and you must change it in all three (`page.tsx`,
  `squad-header`, `scratch-strip`) or they drift apart.

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

`as`/`asleague` drive **view-as** (§7.1.1): `as` is the manager whose squad is
rendered, `asleague` is the league its picker is listing. **`id` always stays
the user's own team** — that is what makes "Back to my team" one link, and what
keeps the league list theirs rather than the borrowed manager's.

`rating` picks the fixture difficulty: `fpl` (default), `form` or `blend`
(§6.7), labelled **View** with options FDR (FPL) / FDR (Form) / FDR × Strength.
`panel` opens an overlay: `menu` or `population` (§7.8).

**Pass-through params travel as one `CarriedState` object**, not five props.
Threading them individually failed silently: a forgotten prop loses one
parameter on one click and the build still passes. `view`/`horizon`/`sort`
stay explicit, since each is *set* by some control.

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
| `projection.ts` | trims bootstrap to the 25 fields (§5.3) |
| `squad.ts` | `loadSquad()` → the fifteen-row set |
| `views.ts` | `loadMatrixData()` → what every view is built from |
| `fixtures.ts` | fixture index + Fixture Score |
| `clubs.ts` | Teams rows + sorting |
| `reference.ts` | Ownership populations, `compareOwnership()`, `leagueMembers()` |
| `concurrency.ts` | the bounded fan-out for league mode |
| `http.ts` | route-handler helpers |
| `replacements.ts` | ranked replacement candidates (§7.7) |

| Client-safe (**must not** import `server-only`) | |
|---|---|
| `horizon.ts` | horizon parsing/clamping, score formatting |
| `params.ts` | URL state, `buildHref`, `carriedFields`, `CarriedState` |
| `ownership.ts` | bands, direction flag, strategy ordering of the bands |
| `defcon.ts` | DefCon thresholds + bar ratio (§7.3) |
| `difficulty.ts` | the three difficulty modes + Team Strength (§6.7) |
| `scratch.ts` | the scratch-squad diff, budget and warnings (§7.7) |
| `availability.ts` | status-code mapping |
| `lib/format.ts` | price, rank, points, net transfers |

Two Client Components import `params.ts`/`horizon.ts`: the horizon control and
`auto-submit-select.tsx`. **Adding `import 'server-only'` to anything in the
second table breaks the build.** That's why the pure helpers live apart from
the modules that fetch.

**Dropdowns act on selection; there is no Go button** (§7.4.2) — used by the
view-as cascade and the Ownership rival picker. `AutoSubmitSelect` is the only
reason a second Client Component exists: a select that reacts to change cannot
be a plain link. It still wraps a real GET form carrying the whole state, with
the submit button inside `<noscript>`, so the no-JS path is the button it
replaces. **Text fields keep their button** — a half-typed ID looks like a
finished one, so there's no moment to act on.

## One loader for all views

`loadMatrixData()` in `lib/fpl/views.ts` returns squad + fixture index + teams
+ columns + totalPlayers. **Fixtures and Teams share one fixture index**,
so they can't disagree about a score — a club reading 6.4 in one and 6.0 in the
other would be a visible bug. Add view-specific shaping in its own module
(`clubs.ts`, `reference.ts`), not in the loader.

Shared cell/badge rendering and both colour scales live in
`app/components/fixture-visuals.tsx` — `FixtureCell`, `ScoreBadge`,
`StrengthBadge`, `fdrTone`, `scoreTone`. Don't re-implement per view. The two
`StrengthBadge` copies were identical until one of them needed the display
floor below, which is exactly how the two views start disagreeing.

**Team Strength has its own colour bands** (`strengthTone`), not Fixture
Score's. They share a 0-to-10 axis and nothing else. Fixture Score *clusters*
around 6.0 (an all-average run scores exactly that), so bands at ±0.5/±1.5 pick
out real outliers. Team Strength is *uniform by construction* — a linear
rescale across the twenty clubs — with a midpoint of 5.0. Read through Fixture
Score's bands, 18 of 20 clubs came out green or red, which says only "above or
below average". Bands are now 7.5 / 6 / 4 / 2.5, giving 5/3/4/3/5 across the
league. **Colour only** — nothing that sorts or ranks sees this.

**Team Strength is floored at 0.5 for display only** (`MIN_DISPLAYED_STRENGTH`).
The scale is linear across the twenty clubs, so the bottom club lands on exactly
0.0 by construction, and "0.0" reads as a figure that failed to load rather than
as the lowest one there is. Nothing that sorts, ranks or colours sees the floor,
so the bottom club is still bottom and still shaded as such.

## Horizon control (§7.6) — Fixtures and Teams only

`app/components/horizon-selector.tsx`. Presets **1/3/5/7/All** plus a numeric
input taking any integer from 1 to gameweeks remaining. "All" resolves to
the remaining gameweeks — it is a normal horizon value, not a special case. Out-of-range values
**clamp, never error** (`parseHorizon` → floor/1/38, then `clampHorizon` →
season remainder). Reads/writes one `horizon` URL param so it survives a view
switch — reuse this component in Teams, don't fork it.

**Still the only Client Component in the app.** §7.6 wants the preset highlight to
follow what's *typed*, before submit, which is browser-only state. It degrades:
presets are real links, the input is in a real GET form. It's keyed on
`view.horizon` at the call site so navigation remounts it — don't reintroduce a
`useEffect` to resync, lint forbids setState-in-effect.

**Columns start at the first gameweek whose deadline has not passed** —
`firstUpcomingGameweek` compares `deadline_time_epoch` against now. A gameweek
leaves the matrix at its deadline, not when it finishes; those are days apart
(Friday deadline, Monday final whistle) and everything this view is for happens
before the deadline. After it the team is locked, so the column offers a plan
that can no longer be made and the Fixture Score describes a run already under
way. It was `!finished` and showed a dead GW3 all weekend.

Read the timestamp, not the `is_current` / `finished` flags: same instant,
but a value we compare ourselves rather than a flag we wait for FPL to flip,
and deadlines are fixed dates so an hour-old cached `events` cannot make it
stale. `getCurrentGameweek()` (for `picks/`) still uses `is_current` and must —
that one *is* asking about the gameweek being played.

## Writing copy

Applies to every string a reader sees — headings, labels, tooltips, legends.

- **Sentence case for all headings.** Proper nouns and the four view names keep
  their capitals; nothing else does.
- **Bold only for things the user clicks or types.** Not for emphasis. A legend
  full of bold is a legend with no emphasis left.
- **No exclamation marks. Never "simply" or "just"** — both tell a stuck reader
  that their problem is easy, which is the least useful thing to say.
- **Say what a thing is for, not what it is.** "Plan around what's ahead" over
  "a grid of fixtures". Someone choosing a tab is choosing a job.
- **A control group labels its shared word once.** The difficulty buttons read
  FPL / Form / Blended under a "Difficulty" label, not "FDR (FPL)" three times.
  What differs goes on the buttons; what they share goes on the label.
- **The legend describes every mode, whichever is selected.** It used to swap
  its last paragraph for the live mode, so the only way to learn what a mode did
  was to switch to it — backwards, since the text exists to help you choose.
  It also keeps the block the same height, so nothing reflows on a switch.
- **Every legend is a single column**, one entry per row, each free to run the
  full width of the table above. Laid out in two or three columns under a
  full-width table, every definition broke into fragments a third of the page
  wide while the rest of the line sat empty, and the Ownership one had to hide
  its band descriptions below `lg` to fit. Do not reintroduce `grid-cols-*`
  here.
- **The rows are clickable and the page has to say so** (`TRANSFER_HINT` in
  `page.tsx`). It is the least discoverable thing in the app and it opens the
  whole scratch squad. The example names a *different* view on purpose:
  "ranked by the view you're in" is abstract until contrasted with what the
  same list looks like elsewhere. Teams gets none — its rows are clubs.
  **It sits directly above the table, at `text-xs` and one step lighter than
  the subtitle.** It is an aside about how to use the rows, so it belongs next
  to them; under the subtitle and at subtitle size it read as a second subtitle
  and pushed the table down the page.

## The Edge (§7.9) — a gate, not a score

**Rebuilt.** The first version ranked 600 players on one continuous number and
put Khalaili — 0.2% owned, form 2.0 — top of the buy list. An arithmetic that
never asks whether anyone would actually pick a player will always find someone
nobody wants.

**A move qualifies by passing two of three binary tests** (`edge-gates.ts`),
never a weighted sum. No weights means nothing to tune and nothing arbitrary to
defend.

| Test | Passes when |
|---|---|
| Raises the floor | Projected points beat the sell by a margin scaled to the horizon |
| Money moves the right way | Selling a faller, buying a riser or a hold |
| Would be picked anyway | Top quartile of its position over `LONG_HORIZON` (6) |

**Hard disqualifiers run first**, because each is a fact about the move rather
than an argument for it: under 60 minutes a match, under 1% owned *and* out of
form, unavailable, fourth from a club, unaffordable against the specific sell.
Khalaili is cut by the second of those.

**`transfers_in_event` and `transfers_out_event` are the market signal.** They
were in the payload and unused. `isFalling`/`isRising` read price change *or*
net transfers — the first is what happened, the second is what is about to. A
player being sold by a quarter of a million has not fallen yet and will.

**The sell list is a gate too.** Ranking all fifteen worst-first manufactures a
case against whoever came last. A player is flagged only on two of four: hard
fixtures, form below the **position median** among regular starters, falling
price, fitness doubt. A week with no sells is a valid answer and the view says
so. The median is per position and recomputed each request — a fixed threshold
flagged the first-choice goalkeeper for being a goalkeeper.

**Buys are always paired to sells** (`edge-packages.ts`). Budget binds them:
funds run across the whole package, so every plan is affordable end to end
rather than move by move.

**Output is two to four packages, varied on one axis at a time** — spend all
versus bank one, safest versus highest ceiling. Safest takes the best
projection over the selected horizon, breaking ties towards *more* owned;
ceiling takes the best long-horizon projection, breaking ties towards *less*
owned. Identical packages are deduplicated, so two is common and honest. Close
candidates become alternatives inside a package, not packages of their own.

**A fixture against a club you own demotes, it does not veto**
(`CONFLICT_PENALTY`). Rejecting outright cut De Cuyper, who the GW4 log went on
to pick — in a 0-0 both he and the owned defender bank a clean sheet, so they
only pull apart on the attacking side.

**Badges name the benefit, not the check** — More points / Better value /
Long-term pick. The rule with its threshold lives in `GATE_TOOLTIPS`, so the
plain label and the exact number never compete for the same space.
`GATE_CHECK_NAMES` carries the same three for the rejection sentence; badge and
rejection used to give one rule two names.

**Rejections are gone.** They were interesting to whoever wrote the rules and
confusing to everyone else. In their place, **best available by position** —
three keepers, five of everything else, over the horizon, **price agnostic**
and excluding players already owned. The packages answer what is affordable;
this answers what is worth reaching for, which is the question that decides
whether to sell two players to fund one. Each row carries a one-line benefit
naming the strongest single thing about that player.

**Any suggested player opens a detail panel** (`?player=<id>`, the same
`Overlay` as every other), showing ownership with bars, the fixture matrix over
the horizon, and the form figures. It reuses `FixtureCell`, `OwnershipBar` and
the DefCon helpers rather than restating them, so a fixture cannot read amber
on the Fixtures view and green here. Reachable from the picks list and from the
incoming player in any package.

**Controls, in order: scope, horizon, transfers.** Each narrows the question
the next one answers, and all three stay visible — the horizon was briefly
behind a disclosure, which hid the control that most changes what the
suggestions are. Difficulty is fixed to Form and risk is gone. Difficulty × risk × horizon was
fifty-odd combinations that barely moved the output. Risk was removed rather
than demoted: the package axis already runs safest to highest ceiling, so a
risk control would have been a second dial on the same thing.

**Transfers is asked, not derived.** FPL publishes no free transfer count, and
inferring one from transfer history breaks around wildcard and free hit weeks.
Same reason a rival's free transfers are never shown.

**Layer 1 (`edge-projection.ts`) is unchanged** and still feeds Tests 1 and 3.
It remains separately falsifiable via `scripts/backtest-projection.mjs`.

## The four views

Rows are the 15 players except where noted.

1. **Fixtures** — "where are my fixture problems?" **Built.** Columns are the
   gameweeks **in the horizon** (1 selected → 1 column); headers read "GW3".
   A trailing spacer column soaks up leftover width so short horizons don't
   stretch cells across the page. Each cell = opponent + H/A, shaded by
   raw FDR. Blanks = empty cells, doubles = split cells.
   Summary column shows Fixture Score over the §7.6 horizon.

   **Only the name column is frozen.** Fixture Score was pinned beside it,
   which cost about half a phone's width before a single gameweek was visible —
   the summary of the run covering the run. It scrolls like everything else.

   **Sortable by Fixture Score and Team Strength**, with the Player header as
   the way back to squad order, exactly as Form does it (`FixturesSort` in
   `params.ts`). Sorted per group so XI and bench stay split; ties fall back to
   squad order, which matters here because eleven players from six clubs
   produce a lot of them. The field names match `CLUB_SORTS` on purpose, so
   leaving Fixtures sorted by strength and switching to Teams lands sorted by
   strength.
2. **Form** — spot who's delivering and who's on the decline. **Built,
   redesigned §7.3.1.** Columns in order: price, GW change, season change, pts,
   PPG, **mins**, form, xGI, DefCon, **xP**, **Market**. (No xG/xA, no
   Status/News columns — those were removed.)

   **Market is net transfers this gameweek**, `transfers_in_event -
   transfers_out_event`, worded rather than printed raw: "311k buying", "72k
   selling", "level". It is last on Form, last on Ownership, and a Stat in the
   player detail panel, and all three render it through
   `formatNetTransfers`/`netTransferTone` in `lib/format.ts` — three surfaces
   wording the same figure differently is how they start disagreeing. Green is
   buying, red is selling, per §6.4. It sits at the end because it is the only
   column on either table that measures opinion rather than something that has
   already happened on a pitch.

   **Plain figures, then bars.** Pts/PPG/Mins are read one row at a time; the
   four bar columns are read down, comparing players. Keeping the two kinds
   apart gives the table one wide block instead of wide and narrow interleaved.

   **Only the bar columns get width**; everything else is sized to its
   content, Season and Mins excepted — those are sized to fit their own headers.
   The table is `w-full` **plus a trailing spacer column**; without the spacer
   the surplus redistributes and quietly re-widens the slim columns.

   **Data bars on four columns: Form, xGI, DefCon, xP.** Form, xGI and xP scale
   to the squad max (all three ask "which of these fifteen"); **DefCon scales to
   the player's positional threshold** (10 DEF, 12 MID/FWD), capped so clearing
   the line fills the bar. Muted single tones, never a red-green scale: 15
   players in one squad is a narrow range. One hue per column
   (sky/violet/teal/slate) so they read as separate columns. **Anchored left** —
   right-anchored, short bars hide behind their own number.

   **Mins is not a bar.** It was, scaled to 90, which made a reliability reading
   out of a figure the reader mostly wants as a number; it now sits with the
   plain per-match figures beside PPG and takes the grey that bar gave up.

   **DefCon is a proxy, not a prediction** — see `lib/fpl/defcon.ts`. It's a
   threshold stat capped at two points, so a season average can't tell a player
   who clears the line most weeks from one posting extremes in a few. A real hit
   rate needs `element-summary/{id}/`, which is deferred.

   Headers are centred except Player; data is centred except Player and the bar
   columns, whose numbers stay right-aligned against the end of their own bar.

   **Availability is a dot inside the player cell** — name, club, dot. It had
   its own column, which reads well on a laptop and badly on a phone: a fixed
   slice of the frozen cell to say "nothing is wrong" in a week when all
   fifteen are green. The reason and the chance are on the news line below, and
   the title carries the state in words, so colour is never alone.

   **Mins is per match**, divided by that club's **started** fixtures from
   `fixtures/` (blanks and doubles handled; `teams.played` is never
   populated). Both figures must come from payloads of the same age — see the
   `fixtures` cache note. Before a club has played, it renders an em dash, not
   a zero.

   **`xP` is FPL's `ep_next`, not ours** — the header says whose it is
   because a number in our table reads as our number. Far right, ruled off from
   the bars beside it: the one prediction on a table of measurements. Note that
   FPL currently sets `ep_next` equal to `form` for ~92% of players, so the two
   columns look cloned early in a season; they diverge as matches accumulate.

   Availability is a dot before the name + tinted row + optional news line, not
   columns. Mapping in `lib/fpl/availability.ts`; unknown codes fail to "out".
   GKP xGI renders an em dash — a zero reads as bad, a dash as not applicable.
   Zero price change renders empty, not a dash.

   Sorting is per-group (XI and bench stay split), ties fall back to squad
   order, and the Player header is the way back to squad order. **Every column
   sorts on the value it displays** — `sortValue` takes `matchesPlayed` because
   Mins shows a per-match average while `player.minutes` is a season total, and
   sorting on the total ordered the column by a number that is not in it.
3. **Ownership** — "is this player worth owning given who else owns them and where
   I sit?" **Built, all three modes.** `compareOwnership()` in
   `lib/fpl/reference.ts` is *the* one function — it takes a population and
   never asks which mode it's in. Only `ownershipOf` differs. **Add a fourth
   population by writing a loader, not by branching the function.**

   **Columns appear per mode; they are not dashed.** global → Global, Flag,
   Market. league → Global, League, Diff, Flag, Market. rival → Global, League,
   Rival, Diff, Flag, Market. An earlier version kept all six always and dashed the unused ones to
   stop the table reflowing; that traded a reflow for four dead columns on the
   view most people open first. The frozen player column is pinned by the
   shared `table-metrics` width, so the part that must not move does not.
   Bands: Template ≥40, Popular 15–40, Low 5–15, Differential <5.

   **Every header carries a tooltip**, including Flag. The two that name a
   selection append which one is live, since "the selected league" is only
   answerable from the header if you already know what is selected.

   **Rival dropdown** lists the selected league's managers (team — manager, by
   league rank, you excluded). `leagueMembers()` reads the *same cached*
   standings call the league population makes, so it costs no extra request.
   Hidden in global mode. Manual rival ID field stays, for rivals outside your
   leagues.

   **League mode is the app's only fan-out.** Top 50 by league rank, 8 `picks/`
   calls in flight (`PICKS_CONCURRENCY`) — in series that would be minutes.
   **Measured on production, 8 cold 50-manager leagues: 569ms median, 814ms
   worst; warm 259ms median.** Eight simultaneous readers on eight different
   cold leagues finish in 933ms wall clock. **Do not raise the concurrency to
   chase a faster cold load** — 8 per instance is a deliberate ceiling on what
   this app can aim at an undocumented API with no appeals process if it blocks
   us, and the number is nowhere near being the bottleneck. Wrapped in `<Suspense>` and the page
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
   never a guess. §6.4's green-means-good rule holds, because green always
   means "helps you".

   **The legend lists the bands by ownership, not by strategy**, most owned to
   least, and that order is fixed. It used to re-order with the direction; the
   two ideas read better split — the list says what a band *is*, the paragraph
   under it says what it is *worth to you*. The chips are still coloured by
   position, so the reversal is still visible, carried by colour rather than by
   shuffling four rows the reader has just learned. **That closing paragraph is
   a claim about where the reader actually sits, so it has an `ahead` and a
   `behind` wording** — keep both true if either is edited.

   Direction still lives in one guidance line above the table, never per player
   (§7.4). Denominator is `total_players`; median split; null rank → unknown.
4. **Teams** — "who should I buy?" **Built.** Labelled *Teams*; the URL value
   stays `view=clubs`, because it is in every shared link. The deliberate
   exception:
   rows are the **20 clubs**, not the 15 players. Fixture Score over the §7.6
   horizon, sortable (default highest first). Owned count per club with an
   amber "3 max" badge at the three-per-club limit. **Columns, headers and
   widths behave exactly as Fixtures** — horizon selects the columns, "GW3"
   labels, trailing spacer. Keep the two in step.

Build order: all seven steps complete. Remaining work is v2 (§10).

## Fixture Score

A single number for how good a run of fixtures is. Used in the Fixtures summary
column and as the only metric in Teams. **Higher is better.**
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

## Three difficulty modes (§6.7)

`?rating=fpl` (default) | `form` | `blend`. Anything else falls back to `fpl`,
including the retired `custom`. Derived from `fixtures/` — **no new endpoints,
no new projection fields**. `lib/fpl/difficulty.ts`.

| mode | matrix colour | Fixture Score | Team Strength |
|---|---|---|---|
| `fpl` | FPL integers | FPL FDR | ours |
| `form` | plain | plain | ours |
| `blend` | blended | **plain** | ours |

**Fixture Score NEVER blends, in any mode.** Blend mode is identical to form
mode for the score; it changes cell colours only. If it blended, it and the
Team Strength column beside it would both carry team quality and the row would
count it twice. This is why a rating is a **pair** — `{ colour, score }` — so
the split is structural and cannot be lost by reading the wrong field.
**Team Strength is always ours, even in `fpl` mode**, since FPL publishes
nothing form-aware. **Both horizon views carry the column** — Fixtures against
each player's club, Teams against the club row. On Fixtures it is not frozen:
two pinned columns leave a phone no room to scroll the gameweeks.

**Two-stage shrinkage**, all constants named at the top of the file, never
inlined:

```
observed = GD_BLEND(leagueMeanPPG + GD_TO_PPG x GDpg) + (1-GD_BLEND)PPG
prior    = season PPG if played >= SEASON_PRIOR_MIN, else FPL strength mapped
w        = n / (n + PRIOR_WEIGHT)          <- n is WINDOW matches, caps at 6
strength = w x observed + (1-w) x prior

HA_ppg   = wHA x observed + (1-wHA) x HOME_ADVANTAGE_PRIOR
```

- **`w` uses window matches, not matches played.** It caps at 0.375 from GW6
  and stays there to GW38. Dividing by matches played climbed to 0.86 — more
  confidence in the same six matches in May than in October. Do not change
  this back.
- **The prior switches to season form at 8 matches.** FPL's strengths never
  update, so anchoring to them in April anchors to a July guess.
- **Home advantage is league-wide and shrunk.** Never split a club's record by
  venue. Raw was 0.600 ppg at 20 matches, ~2x historical; shrunk to 0.397.

**Blend mode's row behaviour is expected, not a bug.** Exactly:

```
blendFDR - plainFDR = -(ALPHA/(1+ALPHA)) x ((oppFDR-3) + (ownFDR-3))
```

(verified against the implementation to 6e-16). So: blending **cannot reorder
a row** — the position of the row moves, the ordering inside it does not. A
club far from average moves as a block (Arsenal/Man City all 34 cells down,
Coventry all up). **A mid-table club shows cells moving both ways**, because
at `ownFDR ≈ 3` the own term vanishes and only the `1/(1+ALPHA)` compression
remains. That is the formula working; do not "fix" it.

**Cells never print a number**, in any mode — opponent and venue only. A third
figure is unreadable across 36 columns at 380px. The value is behind hover and
tap; the chip is `tabindex="-1"` so a pointer can focus it but the keyboard
skips all 540.

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
