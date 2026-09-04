# FPL Squad Matrix — v1 Requirements

**Version:** 1.8
**Date:** 4 September 2026
**Status:** Approved for build. Steps 1 to 6 of the build order are complete

---

## 1. Purpose

A free, no-login web tool that loads any FPL manager's fifteen players into a fixed set of rows, then lets the user switch the columns to answer different questions about that squad.

The core insight: an FPL squad is a table with fifteen rows. Every useful question is a different set of columns.

## 2. Goals

- Load any squad from a manager ID with no account or login
- Answer three distinct questions from one interface
- Cost nothing to run at small-to-moderate scale
- Be shareable by URL, so a mini league adopts it organically
- Work on mobile

## 3. Non-goals for v1

Explicitly excluded, with reasoning:

| Excluded | Why |
|---|---|
| AI or LLM features | Adds per-request cost, which breaks the free-to-run goal |
| User accounts, login, saved state | Requires a database and auth; URL state replaces it |
| Chip and transfer calendar | Personal state, not derived data. Doesn't fit the matrix. Not transferable to other users |
| Whole-season planning tools | Low value, high complexity |
| Writing transfers back to FPL | Requires OIDC authentication; out of scope entirely |
| Points projection or expected-points model | Separate project |

## 4. Core concept

**Rows are always the fifteen players.** They load once and never change within a session.

**Views change the columns.** Four views in v1, three of which use the fifteen-player row set.

The one deliberate exception is the Club Blocks view, which uses twenty club rows instead. It earns the exception because it answers "who should I buy," which a fifteen-player matrix structurally cannot.

## 5. Data sources

### 5.1 Upstream API

All data comes from the undocumented public FPL API at `https://fantasy.premierleague.com/api/`. No API key, no cost, no rate limit published.

| Endpoint | Provides |
|---|---|
| `bootstrap-static/` | All players, teams, gameweeks, prices, ownership %, form, xG, xA, injury status and news |
| `fixtures/` | All 380 season fixtures with FDR for both sides |
| `entry/{manager_id}/event/{gw}/picks/` | A manager's fifteen players for a gameweek |
| `entry/{manager_id}/` | Manager summary including their leagues |
| `leagues-classic/{league_id}/standings/` | Manager IDs of everyone in a league |

### 5.2 Internal routes

The app does not expose the FPL API directly. Each upstream endpoint is proxied by a server-side route, which is where caching, headers and error translation live.

| Internal route | Upstream |
|---|---|
| `GET /api/bootstrap` | `bootstrap-static/` |
| `GET /api/fixtures` | `fixtures/` |
| `GET /api/picks/{id}?gw=` | `entry/{id}/event/{gw}/picks/` |
| `GET /api/league/{id}?page=` | `leagues-classic/{id}/standings/` |

### 5.3 Bootstrap projection

**`/api/bootstrap` returns a projection, not a faithful proxy.**

Two separate problems, with two separate fixes. They are easy to confuse.

**Problem 1: mobile payload.** The full `bootstrap-static` response is roughly 2.3MB, far too large to send to a phone, which conflicts with section 8.5. **Fixed by the projection.** Trimming to the fields the views need reduces the response to roughly 300KB.

**Problem 2: server-side caching.** Next.js's Data Cache rejects items over 2MB, and **the limit applies to the upstream response body, not to what the route returns.** Projecting the output therefore did nothing for caching on its own. **Fixed by changing the cached unit:** `bootstrap-static` is fetched with `cache: 'no-store'`, and the trimmed result is what gets cached.

**Do not remove the caching wrapper on the grounds that the projection made it unnecessary.** It did not. The two fixes are independent and both are required.

The views require roughly twenty of the hundred-odd fields per player. The route returns only those.

**Retained from `elements`:**

```
id, web_name, first_name, second_name, team, element_type,
now_cost, cost_change_event, cost_change_start,
form, total_points, points_per_game, minutes,
expected_goals, expected_assists, expected_goal_involvements,
selected_by_percent, status, news, chance_of_playing_next_round
```

**Retained in full:** `teams`, `element_types`, `events`. These are small and the views depend on them.

Any new view requiring a field outside this list must add it here first. The projection is invisible from reading the endpoint, so it must be documented rather than inferred.

The alternative fix, a KV or Redis cache handler exempt from the size limit, was rejected because it carries a cost and section 8.4 sets the target at zero.

### 5.3.1 Caching implementation note

The projection is cached using `unstable_cache`, which is deprecated in Next.js 16 but retained deliberately. Its replacement, `use cache`, defaults to per-instance in-memory storage that does not survive Vercel's serverless runtime, and the durable variant `use cache: remote` requires a paid cache handler, which breaches section 8.4. `unstable_cache` continues to write to Vercel's Data Cache, which is free on all plans and persists across deployments.

Revisit when `use cache` has a free durable path on Vercel. Until then this is the only option that satisfies both the cost and the durability requirement.

**Coupling risk.** The upstream fetch uses `cache: 'no-store'` because the caching happens one layer up. If the `unstable_cache` wrapper is ever removed or bypassed, the route silently falls back to pulling 2.3MB from FPL on every single request with no caching at all. The failure is silent and will not surface in tests. These two settings must be changed together or not at all.

**Why CDN caching alone is insufficient.** `/api/picks` calls `getBootstrap()` internally for deadline logic, and internal server-side calls do not traverse the CDN. Without a server-side cache, every picks request triggers a full upstream fetch, which league mode multiplies by up to 50.

### 5.4 Known constraints

1. **CORS.** The API sends no CORS headers. All calls must be made server-side. A browser cannot call it directly.
2. **User agent.** The API returns 403 to requests that don't look like a browser. Set a browser user-agent header on all server calls.
3. **Picks are private before the deadline.** `picks/` only returns data for gameweeks whose deadline has passed. Rival comparison is therefore always retrospective. **FPL returns an identical 404 for a bad manager ID and for a pre-deadline gameweek.** Check the deadline before calling, and return a distinct 409 for the not-yet-available case, so users are not told to check an ID that is correct.
4. **Prices are in tenths.** `now_cost: 75` means £7.5m.
5. **Availability.** The API goes down around gameweek deadlines and through the June–July off-season. Response shapes occasionally change over the summer.
6. **Maintenance pages return 200 with HTML.** A failing API can return a success status carrying an HTML body. Reject responses that are not valid JSON, or a maintenance page will be cached as though it were data.
7. **Payload size.** `bootstrap-static` exceeds Next.js's 2MB Data Cache limit. See 5.3.
8. **Do not use `multiplier` to split starters from bench.** Under Bench Boost every one of the fifteen picks has a multiplier of 1 or higher, so the usual `multiplier > 0` test returns fifteen starters and an empty bench. Use `pick.position` instead: 1 to 11 are the starting XI, 12 to 15 are the bench in order. This affects any view that distinguishes the XI from the bench.
9. **Manager and team names are not in the picks payload.** They come from `entry/{id}/`, which is a separate call. Rank and points for a specific gameweek do come from picks, via `entry_history`.

## 6. Fixture Score

A single number expressing how good a run of fixtures is. Used in the Fixtures view summary column and as the sole metric in the Club Blocks view.

### 6.1 Definition

For each fixture in the horizon, invert the FDR:

```
fixtureValue = 6 - FDR
```

An FDR of 1 becomes 5. An FDR of 5 becomes 1.

Sum the inverted values across every fixture falling within the horizon, divide by the number of **gameweeks** in the horizon, and scale to a 0 to 10 range:

```
fixtureScore = ( sum(6 - FDR) / gameweeksInHorizon ) × 2
```

**Higher is better.** Display to one decimal place.

**Divide by gameweeks, never by fixtures.** Gameweeks is a known constant for a given horizon, so the division is a pure rescaling that preserves every comparison. Dividing by fixture count would be the averaging rejected in 6.2 and would destroy the blanks and doubles handling.

**Scores above 10 are valid.** A double gameweek can exceed the maximum achievable by single fixtures. This is informative, not an error. Do not cap it.

### 6.1.1 Why normalise

Without normalisation the score scales with the horizon, so a 3-gameweek view produces numbers up to 15 and a 10-gameweek view produces numbers up to 50. Changing the horizon then appears to change the meaning of the number.

Normalising fixes this and has a second benefit: it makes horizons comparable to one another. A score of 8.4 describes the same quality of fixture run whether measured over one gameweek or ten. A 1-gameweek horizon becomes meaningful, which it is not under a raw sum.

### 6.2 Why inversion rather than sum or average of raw FDR

Raw FDR runs backwards, where low is good. Summing raw FDR means a blank gameweek adds nothing and therefore appears beneficial, while a double gameweek adds difficulty and therefore appears harmful. Both are the opposite of the truth. Averaging corrects the magnitude but not the direction, and discards fixture count entirely.

Inverting first makes blanks and doubles fall out of the arithmetic correctly with no special-case handling. A missing fixture contributes zero and lowers the score. An extra fixture contributes value and raises it.

### 6.3 Display

Render as the score to one decimal place, followed by the fixture count in brackets:

```
7.2 (5)    normal run
6.0 (4)    contains a blank, and the count shows why the score fell
8.4 (6)    contains a double, and the count shows where the lift came from
```

**The fixture count is more important under normalisation, not less.** Dividing by gameweeks compresses the range, so the count is what explains an unexpected score. It also lets the user judge how much a double is worth to them, rather than the app encoding that judgement.

### 6.4 Naming and colour

**Do not label this FDR.** Users are trained that low FDR is good, and this metric inverts that. Label it **Fixture Score**.

Colour logic must stay consistent across the app: green means good everywhere. Individual fixture cells show raw FDR, where green is a low number. Summary and Club Block cells show Fixture Score, where green is a high number. The colour is the constant; the number is not.

**Bands.** Fixture cells map one band per FDR value, 1 to 5. Fixture Score bands sit symmetrically around **6.0**, the score of an all-average run:

| Score | Band |
|---|---|
| 7.5 and above | Strong green |
| 6.5 to 7.5 | Green |
| 5.5 to 6.5 | Neutral |
| 4.5 to 5.5 | Red |
| Below 4.5 | Strong red |

Normalisation is what makes fixed thresholds possible: the score no longer scales with the horizon, so a band means the same thing at a horizon of 1 as at 10. The anchors are deliberate — a whole horizon of FDR 2 scores 8.0 and lands in the top band, a whole horizon of FDR 4 scores 4.0 and lands in the bottom one. Scores above 10 from a double gameweek fall in the top band and are not capped.

Both views must use one implementation of these scales. A club reading green in the Fixtures view and neutral in Club Blocks is a bug the user can see.

Expect the summary column to look mostly neutral at long horizons. Averaging over ten gameweeks genuinely compresses the spread, and most squads do have average fixture runs. This is honest rather than a fault to tune away.

### 6.5 Detecting blanks and doubles

Neither is flagged in the API.

- **Blank:** the team has no fixture object with that `event` number
- **Double:** two fixture objects share the same `event` number for that team

Blanks and doubles do not exist in the fixture list at the start of a season. They appear once cup rounds and postponements are resolved, typically from GW18 onwards. Build the logic now, expect it to be inert until then.

### 6.6 Deferred

Distance decay, weighting nearer gameweeks more heavily than distant ones, is deliberately excluded from v1. It is closer to how managers actually think but introduces a tuning parameter and makes the number harder to explain.

## 7. Functional requirements

### 7.1 Squad loading

- User enters a manager ID, or arrives via a URL containing one
- App fetches the most recent completed gameweek's picks
- Fifteen players render as rows, starting XI first, bench in order
- Manager name, team name, overall rank and gameweek points shown as a header
- Clear error state if the ID is invalid or the API is unavailable

### 7.2 View 1 — Fixtures

**Question answered:** where are my fixture problems?

- Columns are gameweeks, from the current one through GW38
- Each cell shows the opponent, home/away indicator, and is shaded by FDR
- Player name column is frozen; gameweek columns scroll horizontally
- Blanks shown as empty cells, doubles as split cells
- A summary column shows the **Fixture Score** (section 6) over a user-selected horizon, displayed as score with fixture count in brackets
- Horizon control per section 7.6

**"The current one" means the first gameweek not yet finished, not the API's `is_current`.** The two differ for most of the week. `is_current` advances at each deadline and stays on a gameweek after it finishes, so taking it literally would lead with a column of results nobody can act on, and would fold a played gameweek into the Fixture Score, which is meant to describe the run ahead. Mid-gameweek the first unfinished gameweek is the one being played; once it finishes it becomes the next one. The same start gameweek drives both views.

**The horizon is banded in the column headers** so the reader can see which gameweeks the summary score covers.

**Below the `sm` breakpoint the summary column is hidden** and the score moves under the player name instead. Kept as a column it consumes most of a phone's width and no fixtures are visible at all, which defeats the view. See 8.5.

### 7.3 View 2 — Form

**Question answered:** who is playing well, and who is at risk?

Columns: price, price change this gameweek, price change since season start, form, total points, points per game, minutes, xG, xA, expected goal involvements, availability status, and injury news text.

Availability should be visually obvious. Red for out, amber for doubtful with the percentage chance shown, no flag for available.

**"Visually obvious" means visible without scrolling.** The availability flag sits in the frozen player column as well as in its own Status column. Twelve columns do not fit on a phone, so a flag that lives only in the Status column is off screen at exactly the width where it matters most. The Status column carries the fuller wording and the News column the reason.

**The flag carries text, not only colour.** "Out" or the percentage, so the state survives greyscale and colour blindness.

**Five API status codes collapse to the three states above.** `a` is available; `d` is doubtful; `i` injured, `s` suspended and `u` unavailable are all out, as is `n` and anything unrecognised. Defaulting an unknown code to out rather than available is deliberate: showing an unfit player as fit is the more costly error. Percentages come from `chance_of_playing_next_round`, which is occasionally null even for a doubt, so fall back to the word.

**Price movements are signed and coloured by direction,** green for a rise and red for a fall, consistent with 6.4's rule that green means good: a rise lifts the owner's team value. No change renders as an em dash rather than a zero, so the eye goes to the movements. Both movement fields are in tenths like the price itself (constraint 4).

This view has no horizon and no Fixture Score, so the horizon control (7.6) and the fixture colour legend are not shown on it. The `horizon` parameter is still carried through the view switcher, so returning to Fixtures or Club Blocks restores the horizon the user left.

### 7.4 View 3 — Ownership

**Question answered:** is this player worth owning, given who else owns them and where I sit?

The comparison population is selectable:

| Mode | Reference population | Source |
|---|---|---|
| Overall rank | All FPL managers | `selected_by_percent` from `bootstrap-static` |
| Mini league | Every manager in a chosen league | Standings, then one `picks/` call per manager |
| Single rival | One manager | One `picks/` call |

**This is one function with three inputs, not three features.** The calculation is identical; only the denominator changes.

Columns: global ownership %, reference population ownership %, and the difference between them.

**Direction flag.** The app derives whether the user is ahead of or behind the reference population, using their rank within it. Ahead means differentials are a risk and convergence protects the lead. Behind means the opposite. Display this as a single line of guidance above the table, not as advice per player.

**League size cap: 50 managers.** A mini league requires one API call per manager. Fetch the top 50 by current league rank and no more. If the league is larger, show a notice stating that the comparison covers the top 50 only. Cache all fetched squads for the remainder of the gameweek.

#### 7.4.1 Global mode as built

Build step 6 delivered the global population only. The league and rival populations are step 7 and change the denominator, not the presentation.

In global mode the reference population *is* the global one, so the three columns above collapse: reference ownership would repeat the global figure and the difference would always be zero. Rendering two dead columns would be worse than not rendering them. Global mode therefore shows ownership and the flag, and the second and third columns arrive with the populations that give them meaning.

**Flags, not raw percentages alone.** The question in 7.4 is comparative, so ownership is banded: Template at 40% and above, Popular 15 to 40, Low 5 to 15, Differential below 5. The percentage is still shown, with a bar scaled to 100 rather than to the highest value in the squad, so a player looks the same in every squad.

**The bands must not be coloured good or bad.** This is the direction flag's whole point: ahead of the field a differential is a risk, behind it a differential is the way to close the gap. The same 4% player means opposite things to two managers, so shading it green or red is wrong for one of them and breaks 6.4's rule that green means good everywhere. The bands are neutral; the single guidance line carries the direction.

**The flag must survive a narrow screen.** As with availability in 7.3, the flag moves into the frozen player column below the `sm` breakpoint rather than scrolling out of view.

**Direction flag denominator.** Global mode reads the manager's overall rank against `total_players` from `bootstrap-static`, which is why that field is retained in the projection in 5.3. The split is the median: ahead is the better half of the field. Before any rank is published the flag reads as unknown rather than guessing.

This view has no horizon, so like the Form view it does not show the horizon control, but it carries the parameter through.

### 7.5 View 4 — Club Blocks

**Question answered:** who should I buy?

- Rows are the twenty Premier League clubs
- **Fixture Score** (section 6) over a selectable horizon, displayed as score with fixture count in brackets
- Horizon control per section 7.6
- Sortable, highest score first
- Indicate which clubs the user already holds players from, and how many, to surface the three-per-club limit

**Gameweek columns.** The view shows the same gameweek columns as the Fixtures view, from the start gameweek through GW38, with the horizon banded in the headers. The score still covers the horizon alone.

Two reasons. "Who should I buy" is partly a question about what comes *after* the run being scored, so the columns beyond the horizon are useful rather than noise. And a table showing only the horizon leaves most of the width empty at short horizons, which section 8.5 rules out.

**Sorting** is by club, Fixture Score or owned count, either direction, and lives in the `sort` URL parameter rather than component state so a sorted table is a link someone can send (see 8.2). Ties break on club name so the order is stable. Note that clubs sort on the name FPL supplies, which is `Spurs`, not `Tottenham`.

**Owned indicator.** A count per club, with the player names alongside where width allows. A club at the three-player limit is called out explicitly rather than leaving the reader to notice the number, because at three the Fixture Score means something different: buying another player from that club requires selling one first.

**Shares the fixture data with the Fixtures view.** Both read one index built from a single `fixtures/` fetch, over the same horizon. This is a correctness requirement, not only an efficiency one: the two views must never disagree about a club's score.

### 7.6 Horizon control

Shared by the Fixtures and Club Blocks views. Both must read from the same `horizon` URL parameter, so switching between the views preserves it.

- **Preset buttons** for 1, 3, 5, 8 and 10 gameweeks, for one-click switching. A horizon of 1 shows the next gameweek only, which is the most common question at a deadline
- **Numeric input** accepting any integer from 1 to the number of gameweeks remaining in the season
- Clicking a preset sets the numeric input
- Typing a custom value clears the preset highlight; typing a value that matches a preset highlights it
- Values outside the valid range clamp to the nearest valid value rather than erroring

A horizon of 1 is valid and useful. The normalised Fixture Score (6.1.1) makes a single-gameweek reading directly comparable to a ten-gameweek one.

## 8. Technical requirements

### 8.1 Architecture

- Next.js deployed on Vercel
- **The browser must never call the FPL API directly.** This is the actual constraint, driven by CORS (see 5.4). Server Components and route handlers both satisfy it, since both run on the server
- Server Components should call the data layer in `lib/fpl` directly. Calling the app's own `/api` routes from a Server Component adds a network hop for no benefit
- The `/api` routes exist as the surface for client-side callers, and are where caching, headers and error translation live
- No database in v1

**The app is server-rendered throughout, with one exception.** The horizon control is a Client Component because 7.6 asks for the preset highlight to follow what is being typed, before submission, and that state exists only in the browser. It degrades: the presets are real links and the input sits in a real GET form, so the control still works with JavaScript disabled. Everything else, including sorting and view switching, is plain navigation.

Keep it that way. A control that could be a link should be a link, because 8.2 requires the state to be in the URL regardless, and a link gets that for free.

Shared code imported by a Client Component must not be marked `server-only`, which is a build error. Pure helpers such as the horizon arithmetic and URL building therefore live apart from the modules that touch the FPL API.

### 8.2 State

Application state lives entirely in the URL:

```
/?id=1234567&view=fixtures&horizon=5
/?id=1234567&view=ownership&league=987654
```

This makes every view shareable by construction and removes the need for accounts or storage.

**Parameters and defaults**

| Parameter | Values | Default when absent |
|---|---|---|
| `id` | Manager ID | None. Show the ID entry form |
| `view` | `fixtures`, `form`, `ownership`, `clubs` | `fixtures` |
| `horizon` | Any integer from 1 to the gameweeks remaining in the season | `5` |
| `sort` | Club Blocks ordering: `score`, `club` or `owned`, each `-asc` or `-desc` | `score-desc` |
| `league` | League ID | None. Ownership falls back to global mode |

`?id=1234567` alone must land on the fixtures view at a 5-gameweek horizon. Nobody should need to type a `view` parameter to reach the main function of the app.

**Changing any control updates the URL.** This is what makes state shareable and makes the browser back button work. A link sent to someone else must reproduce exactly what the sender was looking at.

**Every control must carry the whole state, not just its own parameter.** Changing the horizon must preserve the view and the sort; sorting must preserve the view and the horizon; switching view must preserve the horizon (7.6 requires this) and the sort. A control that emits only its own parameter silently resets the others, which reads as a bug and breaks the shareable-link guarantee. This applies equally to any GET form, which submits only its own fields and therefore needs the rest carried as hidden inputs.

Parameters at their default value may be omitted from generated links, which keeps shared URLs short. `?id=X` is the canonical form of the default view.

Invalid parameter values fall back to the default rather than erroring. A `view` naming a stage not yet built falls back to `fixtures` rather than rendering an empty shell, and only built views are offered as tabs.

**A parameter a view does not use is still carried through it.** The Form view has no horizon, so it does not show the horizon control, but switching to it and back must return the user to the horizon they left. Dropping a parameter because the current view ignores it makes the view switcher lose state, which 7.6 rules out.

### 8.3 Caching

Required, both for performance and to avoid placing load on FPL's servers.

| Data | Cache duration | Reason |
|---|---|---|
| `bootstrap-static` | 1 hour | Prices change once daily |
| `fixtures` | 24 hours | Changes rarely |
| A manager's `picks` | Rest of gameweek | Immutable once the deadline passes |
| League standings | 1 hour | Updates during and after matches |

### 8.4 Cost

Target is zero. Vercel's hobby tier, no database, no AI calls, no paid data. Caching is what keeps this true as usage grows.

### 8.5 Responsive layout

**Build mobile-first, but treat desktop as the primary surface for v1.**

These are two separate things and the distinction matters.

**Mobile-first is a build order, not a priority.** Write the narrow layout first, then widen it with breakpoints. Narrow-to-wide is additive; wide-to-narrow requires overrides that accumulate and break. A fifteen-row grid with 38 columns is precisely the layout that fails on a phone, so it must be built with narrow in mind from the start.

**Desktop is where this will actually be used at present**, so it must look properly considered at 1440px rather than merely unbroken. Use the available width: show more gameweek columns before horizontal scrolling begins, rather than rendering a narrow table floating in a wide empty page.

**Verify every view at both 380px and 1440px** before considering it complete. Measure rather than eyeball: a headless screenshot taken by setting a window size can clip the page and look like an overflow that is not there. Check `document.documentElement.scrollWidth` against the viewport width.

The frozen first column with horizontal scroll is the core pattern at all widths.

**Only the table may scroll sideways. The page must not.** Two traps make it do so anyway, both found the hard way:

1. **Absolutely positioned descendants escape the scroll container.** Screen-reader-only labels inside cells are `position: absolute`. Without a positioned ancestor their containing block is the viewport, so `overflow-x: auto` does not clip them, and the ones in far-right columns stretch the document to the full width of the table. Give the scroll container `position: relative`. Setting `overflow-x: hidden` does *not* fix this; only a containing block does.
2. **A cell's shading will not fill a taller row.** A block inside a table cell cannot resolve a percentage height unless the cell declares a definite height. Where the first column is two lines tall and the fixture cell is one, the shading falls short of the row. Declaring any definite height on the cell resolves it; the cell still stretches to the row.

**Narrow layouts must keep the fixture columns visible.** Summary columns that sit between the frozen name column and the fixtures will consume the whole width of a phone. Hide them below `sm` and fold their content under the name instead. A view where no fixtures are visible until the user scrolls has failed at that width, even though nothing is broken.

**Do not leave dead width inside a full-width table.** A table that stretches to fill the page distributes surplus into whichever column has no fixed width, which produces a large empty gutter mid-table. Either give the columns something useful to hold or reduce the table's width.

Mobile becomes the primary surface once the tool is shared beyond the author, since most people check FPL on a phone. The layout should not need rebuilding when that happens.

## 9. Build order

1. ~~Server-side API routes with caching and correct headers~~ **Done**
2. ~~Squad loading and row rendering~~ **Done**
3. ~~Fixtures view (the highest-value view, build it first)~~ **Done**
4. ~~Club Blocks view (reuses the fixture data already fetched)~~ **Done**
5. ~~Form view (no new data required; `bootstrap-static` is already loaded)~~ **Done**
6. ~~Ownership view, global mode only~~ **Done**
7. Ownership view, league and rival modes

Steps 1 to 3 constitute a genuinely useful tool on their own. Ship there if needed.

Step 5 needed no new fetching and no new fields: every column in 7.3 was already in the projection list in 5.3, which was derived from that section. Check any further view against that list before starting, since a missing field will not reach the browser.

Step 6 needed no new fetching either: global ownership is `selected_by_percent`, and the direction flag's denominator is `total_players`, both already in the projection.

Step 7 is the first to need new fetching, and the first to need a per-manager fan-out. See the 50-manager cap in 7.4 and the caching row for picks in 8.3. It is also the first step where the reference-population columns in 7.4 become meaningful, so it adds columns to the Ownership view rather than only a mode selector. See 7.4.1.

## 10. Deferred to v2

- Alternative player suggestions: same position, price within a set band, better block score over the selected horizon, sorted
- Effective ownership including captaincy
- Price change prediction, which would require storing daily snapshots and therefore a database
- Historical squad comparison across gameweeks

## 11. Resolved decisions

All three v1 open questions are now closed.

| Question | Decision | Detail |
|---|---|---|
| Mini-league size cap | **50 managers** | Top 50 by league rank. Larger leagues show a notice. See 7.4 |
| Difficulty source | **FPL's own FDR** | Free, requires no explanation to users, and no derivation work. Revisit post-v1 if it proves too crude |
| Blank and double handling | **Invert then sum** | Fixture Score. Blanks and doubles resolve correctly with no special-casing. See section 6 |

### Remaining risks

1. FPL's FDR is set pre-season and does not update to reflect form. A club whose fixtures look easy on paper may not be. Accepted for v1
2. Response shapes on the undocumented API can change over the summer break, requiring a re-check each August
3. Blank and double logic cannot be tested against live data until cup postponements are confirmed, typically from GW18. **Partly mitigated:** the logic has been verified against synthetic fixture data covering a blank, a double, an unscheduled fixture with a null `event`, and a double taking the score above 10. It remains unverified against real postponements
4. There is no automated test suite. The verifications above were run through a temporary route and then deleted, so they do not protect against regression. Section 6 arithmetic, the blank and double handling, and the status-code mapping in 7.3 are the parts most worth covering if one is added
5. Most squads have no unavailable players, so the availability states in 7.3 will not appear in casual testing. The rendering was verified against a squad holding one loaned-out player and one 50% doubt, found by scanning the overall league. Re-check against a real flagged squad after any change to that column rather than assuming an all-available squad proves it works
