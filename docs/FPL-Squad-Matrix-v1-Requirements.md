# FPL Squad Matrix — v1 Requirements

**Version:** 1.21
**Date:** 5 September 2026
**Status:** Built. All seven build order steps are complete; v1 is feature complete

---

## 1. Purpose

A free, no-login web tool that loads any FPL manager's fifteen players into a fixed set of rows, then lets the user switch the columns to answer different questions about that squad.

The core insight: an FPL squad is a table with fifteen rows. Every useful question is a different set of columns.

## 2. Goals

- Load any squad from a manager ID with no account or login
- Answer four distinct questions from one interface, one per view
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

The one deliberate exception is the Teams view, which uses twenty club rows instead. It earns the exception because it answers "who should I buy," which a fifteen-player matrix structurally cannot.

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

The app does not expose the FPL API directly. Upstream calls go through a server-side data layer, which is where the user-agent header, caching and error translation live. Four of the five endpoints also have a route handler in front of them, for any client-side caller.

| Internal route | Upstream |
|---|---|
| `GET /api/bootstrap` | `bootstrap-static/` |
| `GET /api/fixtures` | `fixtures/` |
| `GET /api/picks/{id}?gw=` | `entry/{id}/event/{gw}/picks/` |
| `GET /api/league/{id}?page=` | `leagues-classic/{id}/standings/` |

**`entry/{id}/` has no route handler.** It is reached only through the data layer, because nothing client-side needs it: it supplies the manager and team names for the section 7.1 header and the manager's own leagues for section 7.4, both of which are rendered on the server. Add a route for it when something in the browser needs it, not before.

Views render on the server and call the data layer directly rather than fetching these routes over HTTP. See 8.1.

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
defensive_contribution, defensive_contribution_per_90,
ep_next,
selected_by_percent, status, news, chance_of_playing_next_round
```

`defensive_contribution_per_90` is supplied by the API as a number and equals `defensive_contribution / minutes * 90`, so it needs no derivation. It is a season average against a per-match threshold; see 7.3 for why that makes it a proxy rather than a prediction.

`ep_next` **arrives as a string**, like `form` and `points_per_game`, and is parsed rather than read. It is typed to accept either, since the field is numeric by nature and nothing stops FPL sending it as a number. Every element carries a value, so a missing one would be a change worth noticing rather than a normal case.

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

A single number expressing how good a run of fixtures is. Used in the Fixtures view summary column and as the sole metric in the Teams view.

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

Both views must use one implementation of these scales. A club reading green in the Fixtures view and neutral in Teams is a bug the user can see.

Expect the summary column to look mostly neutral at long horizons. Averaging over ten gameweeks genuinely compresses the spread, and most squads do have average fixture runs. This is honest rather than a fault to tune away.

### 6.5 Detecting blanks and doubles

Neither is flagged in the API.

- **Blank:** the team has no fixture object with that `event` number
- **Double:** two fixture objects share the same `event` number for that team

Blanks and doubles do not exist in the fixture list at the start of a season. They appear once cup rounds and postponements are resolved, typically from GW18 onwards. Build the logic now, expect it to be inert until then.

### 6.6 Deferred

Distance decay, weighting nearer gameweeks more heavily than distant ones, is deliberately excluded from v1. It is closer to how managers actually think but introduces a tuning parameter and makes the number harder to explain.

### 6.7 Difficulty rating: three modes

FPL's FDR is set before a ball is kicked and never moves. A promoted side that turns out to be decent keeps its easy rating all season; a big club in freefall keeps its hard one. Two derived alternatives sit alongside it, **toggled per 8.2 so a shared link carries which one produced it**.

| `rating=` (labelled **View**) | Matrix colour | Fixture Score | Team Strength |
|---|---|---|---|
| `fpl` *(default)*, shown as **FDR (FPL)** | FPL integers | from FPL FDR | ours |
| `form`, shown as **FDR (Form)** | `plainFDR` | from `plainFDR` | ours |
| `blend`, shown as **FDR × Strength** | `blendFDR` | **from `plainFDR`** | ours |

**FPL's own rating is the default.** Nobody is shown a derived number without having asked for it. An unrecognised value falls back to `fpl`, which includes the retired `custom` from the previous two-mode version.

**Fixture Score never uses `blendFDR`, in any mode.** In blend mode it shows exactly what form mode shows. If it blended, it and the Team Strength column beside it would both carry team quality, and the view would be counting the same thing twice within one row. **Blend mode changes matrix colours and nothing else.**

This is enforced structurally rather than by convention: a rating is a *pair* of functions, `colour` and `score`, so the separation cannot be lost by someone reading the wrong field.

**Team Strength is always this app's figure, in every mode including `fpl`,** because FPL publishes nothing form-aware to put in that column. The column is labelled *(ours)* so it is not mistaken for an FPL number while the toggle reads FPL.

#### Data

Everything comes from `fixtures/`, which every view already loads. `team_h_score`, `team_a_score` and `finished` reconstruct both the table and recent form. **No new endpoints, and no new fields in the `elements` projection.**

**The `teams` array's own `played`, `points` and `position` are never populated by FPL** — they sit at zero all season — so results are counted from the fixtures instead. `strength` is likewise null; `strength_overall_home` and `strength_overall_away` *are* populated, and are the pre-season prior.

#### Constants

Declared at the top of `difficulty.ts` and never inlined. These are the numbers to revisit once a few gameweeks have been watched.

| Constant | Value | Why |
|---|---|---|
| `ALPHA` | 0.5 | Own-strength weight when blending. Half means the opponent matters twice as much as you do, which is the right order: who you play swings a fixture more than who you are |
| `PRIOR_WEIGHT` | 10 | Shrinkage for club strength, in matches. Observed form only reaches parity with the prior at ten matches, and the window caps at six, so the prior always keeps the larger share |
| `HOME_ADVANTAGE_PRIOR` | 0.33 | Historical Premier League home advantage, in points per game |
| `HA_PRIOR_WEIGHT` | 60 | Shrinkage for home advantage. Far larger than `PRIOR_WEIGHT` because the historical figure is well established while a season's own is noisy for a long time |
| `FORM_WINDOW` | 6 | Matches in the form window |
| `GD_BLEND` | 0.6 | Weight on goal difference against points |
| `GD_TO_PPG` | 0.55 | Converts goal difference per game onto the points-per-game scale |
| `SEASON_PRIOR_MIN` | 8 | Matches before the prior switches from FPL's strength to the club's own season form |

#### Stage 1: club strength

Computed once per request for all twenty clubs.

```
leagueMeanPPG = total points awarded / total team-matches played
window        = that club's last FORM_WINDOW completed matches
n             = matches in window (caps at FORM_WINDOW)
GDpg          = goal difference per match, within window
PPG           = points per match, within window

observed = GD_BLEND x (leagueMeanPPG + GD_TO_PPG x GDpg)
         + (1 - GD_BLEND) x PPG

prior    = season-to-date PPG   if played >= SEASON_PRIOR_MIN
           FPL strength mapped  otherwise

w        = n / (n + PRIOR_WEIGHT)
strength = w x observed + (1 - w) x prior
```

**The weight counts matches in the window, not matches played.** The window caps at six, so the weight caps with it: 0.167 at two matches, 0.375 once the window fills, and flat from GW7 to GW38. An earlier version divided by matches played and climbed to 0.86, which meant trusting the same six matches more in May than in October — confidence rising while the evidence behind it stood still.

**The prior becomes the club's own season form once there is enough of it.** FPL's strengths are set pre-season and never update, so anchoring to them in April is anchoring to a July guess. Below `SEASON_PRIOR_MIN` there is not yet a season to anchor to, and the pre-season view is the best available.

**Observed form blends goal difference with points.** After two matches PPG has six possible values and throws the margin away. Brighton at 7:4 and Ipswich at 4:8 are both on three points and are not the same team. Goal difference is recentred on the league mean so both halves of the blend sit on one scale.

#### Stage 2: home advantage

One figure for the division. **Do not split each club's record by venue** — that halves the sample for no gain, and half a season gives a club only nine or ten home games.

```
observed = (total home points - total away points) / matches played
w        = matchesPlayed / (matchesPlayed + HA_PRIOR_WEIGHT)
HA_ppg   = w x observed + (1 - w) x HOME_ADVANTAGE_PRIOR
HA_fdr   = HA_ppg x 4 / (maxStrength - minStrength)
```

Shrunk exactly as club strength is, and for the same reason. Twenty matches into a season the raw figure read 0.600 points per game, roughly double the historical value; taking that at face value would have overstated every home fixture in the table. Shrunk, it lands at 0.397.

#### Stage 3: fixture difficulty

```
oppFDR   = 1 + 4 x (strength[opponent] - min) / (max - min)
ownFDR   = the same mapping applied to the club itself

plainFDR = oppFDR
blendFDR = 3 + ((oppFDR - 3) - ALPHA x (ownFDR - 3)) / (1 + ALPHA)

venue    : subtract HA_fdr/2 at home, add HA_fdr/2 away
clamp    : [1, 5]
```

Mapped linearly across the twenty clubs so the scale always spans 1 to 5. Not inverted: a strong opponent is a *high* number, FPL's convention and what `6 - FDR` expects.

**Clamping costs something and is still right.** The strongest club reads 5 whether home or away, so its venue swing is invisible. Widening the scale to fit the offset instead would mean no club ever reached either end of it, which is worse.

#### What blend mode does to a row, and why it is not a bug

Subtracting the venue term, which cancels, the difference between the two ratings is exactly:

```
blendFDR - plainFDR = -(ALPHA / (1 + ALPHA)) x ((oppFDR - 3) + (ownFDR - 3))
```

Verified against the implementation to a worst-case error of 6e-16 across every unclamped cell.

Three consequences, all expected:

1. **Blending cannot reorder a row.** `blendFDR` is an increasing function of `oppFDR`, so a club's easiest fixture stays its easiest. What changes is where the row sits relative to other rows, not the pattern inside it.
2. **A club far from average moves as a block.** Arsenal and Manchester City, at the top of the scale, have every one of their 34 cells move down. Coventry, at the bottom, has every cell move up.
3. **A club near average does not, and cannot.** The shift depends on the *sum* of both terms, so for a club at `ownFDR ≈ 3` the own term vanishes and only the compression by `1 / (1 + ALPHA)` is left, which pulls easy fixtures up and hard fixtures down. Mid-table rows therefore show cells moving both ways. **This is the formula behaving correctly, not a defect**: the mean shift is still in the right direction (Chelsea −0.29, Crystal Palace +0.36), and the ordering within the row is untouched.

#### Team Strength

```
teamStrength = 10 x (strength[club] - min) / (max - min)
```

Immediately right of Fixture Score, on the same 0 to 10 scale with the same colour bands, so the two read as a pair: how good the run is, and how good the club is. An easy run for a weak side is a different proposition from an easy run for a strong one. Sortable, one decimal place.

**Both horizon views carry it**, on the Fixtures view against each player's club. The pair answers one question, and it would be odd for the answer to be available on one of the two views that ask it. On Fixtures it is not frozen — two pinned columns leave a phone almost no room to scroll the gameweeks — so Fixture Score stays with the name and Team Strength is the first column to scroll.

**These are real columns at every width, phones included.** They used to collapse below the `sm` breakpoint into a row of bare badges under the club name. That left three numbers with no headings, unreadable unless you already knew what they were, and it took the sort with it: the headers are the only way to reorder the table, so the view lost its one interaction on the device where scanning twenty rows needs it most. The table already scrolls sideways behind a frozen first column, which is the pattern every other view uses; these columns simply join that scroll.

#### Matrix cells

**Cells show opponent and venue only. Never a difficulty number, in any mode.** Each cell already carries two pieces of information and a third is unreadable across 36 columns at 380px.

The number is behind hover on desktop and tap on mobile. Tap works because the chip carries `tabindex="-1"`: focusable by pointer, skipped by the keyboard. A full fixture table is 540 cells, and putting every one in the tab order would wreck keyboard navigation for the sake of a figure the `title` and the screen-reader text already carry.

#### Deferred

Attack and defence strengths are still ignored, so the rating cannot say a club is hard to score against but easy to beat.

## 7. Functional requirements

### 7.1 Squad loading

- User enters a manager ID, or arrives via a URL containing one
- App fetches the most recent completed gameweek's picks
- Fifteen players render as rows, starting XI first, bench in order
- Clear error state if the ID is invalid or the API is unavailable

**Header.** Manager name and team name, then six figures in **two visually separated groups**:

| Group | Figures |
|---|---|
| Gameweek | GW*n* points, GW rank, Top *x*% |
| Overall | Overall points, Overall rank, Top *x*% |

Each group carries the same three shapes — points, rank, and that rank as a share of the field — so the gameweek and the season can be read straight down against each other. Top *x*% is that group's rank divided by `total_players`, to one decimal place.

**The groups need no headings, but they do need the separation.** The visible labels already say GW and Overall, so a heading would be a third level of text carrying nothing new. Without a boundary, though, six equal tiles read as one undifferentiated strip and the two "Top" figures look like a mistake. Two devices do the work together, because either alone was too weak: a rule, and a gutter several times the gap between tiles inside a group. Proximity carries most of it; the rule confirms it.

All six describe the gameweek on screen rather than live values, which is why the gameweek is named in the points label. They come from the picks payload's `entry_history`, not the entry summary, so they stay consistent with the squad being shown. Between a deadline and the first kickoff this correctly reads 0 points with no rank yet.

**Top *x*% is floored at 0.1%.** One decimal place runs out of resolution around rank 5,200 in a field of ten million, and everything above that rounded to "0.0%", which reads as missing data rather than as the best possible answer. 0.1% is the smallest figure the scale can honestly express, so it stops there; the exact standing is in the rank beside it.

**Top *x*% is the inverse framing of the Ownership view's "ahead of *y*% of managers".** Both are shown deliberately: the header answers "how am I doing", section 7.4 answers "how much room is there above me". They should always sum to 100.

The header is sticky and carries the menu button; see 7.8 for the shell it sits in.

#### 7.1.1 Viewing another manager's squad

Any of the user's league rivals can be loaded into **all four views**, so the whole matrix can be pointed at someone else's squad.

The control is a two-step cascade — **View as → from league → team** — and sits above the view tabs, because whose squad you are looking at outranks which columns you are looking at. It stays on every view: switching view keeps the borrowed squad, switching squad keeps the view.

- The league dropdown lists the user's own mini leagues (5.1)
- Choosing one lists that league's managers, ordered by league rank, **excluding the user themselves**
- The team dropdown does not exist until a league is chosen, rather than appearing empty and disabled
- Choosing a team loads it immediately; there is no confirm button (7.4.2)
- A **one-press "Back to my team"** is on screen the whole time a borrowed squad is, including on the error page if that squad fails to load. It lives **in the header**, next to the team name, and the whole header bar turns amber (7.8)

**A flat list of every rival was rejected.** Without the league that gives it context, a team name means nothing, and the league is what decides which managers can be fetched at all.

**The user's own manager ID never leaves `id`.** The borrowed one goes in `as`. That is what makes reverting a single link with nothing to reconstruct, and it is why the league list stays the user's rather than silently becoming the borrowed manager's the moment the control is used.

### 7.2 View 1 — Fixtures

**Question answered:** where are my fixture problems?

- **Columns are the gameweeks in the selected horizon**, starting at the current one. Selecting 5 shows five columns; selecting 1 shows one. Gameweeks outside the window are not dimmed or banded, they are not rendered. **All** shows the rest of the season, through GW38
- Column headers read `GW3`, `GW4` and so on, not bare numbers
- Each cell shows the opponent, home/away indicator, and is shaded by FDR
- Player name column is frozen; gameweek columns scroll horizontally
- Blanks shown as empty cells, doubles as split cells
- A summary column shows the **Fixture Score** (section 6) over a user-selected horizon, displayed as score with fixture count in brackets
- Horizon control per section 7.6

**"The current one" means the first gameweek not yet finished, not the API's `is_current`.** The two differ for most of the week. `is_current` advances at each deadline and stays on a gameweek after it finishes, so taking it literally would lead with a column of results nobody can act on, and would fold a played gameweek into the Fixture Score, which is meant to describe the run ahead. Mid-gameweek the first unfinished gameweek is the one being played; once it finishes it becomes the next one. The same start gameweek drives both views.

**The horizon selects the columns, not just the score.** Banding the horizon inside a full-season table was the earlier behaviour and is superseded: the matrix now only ever shows the run being scored, so the summary column and the cells beside it always describe the same gameweeks.

**Column widths scale to the number on show,** so a one-gameweek view is not a single hairline column and a full-season view still fits a useful stretch on screen. A trailing spacer column absorbs any width left over, which keeps the real columns at their intended size rather than stretching them across the page at short horizons.

**Teams does the same** (7.5). Both views treat the shared horizon identically, so switching between them changes the rows and the columns stay put.

**Below the `sm` breakpoint the summary column is hidden** and the score moves under the player name instead. Kept as a column it consumes most of a phone's width and no fixtures are visible at all, which defeats the view. See 8.5.

### 7.3 View 2 — Form

**Question answered:** who is playing well, and who is at risk?

Columns, in order: price, price change this gameweek, price change since season start, total points, points per game, form, minutes, expected goal involvements, defensive contribution per 90, and FPL's expected points for the next gameweek.

Availability should be visually obvious. Red for out, amber for doubtful with the percentage chance shown, no flag for available.

#### 7.3.1 Presentation

Every column here is a number, and presented flat they read as a wall of them. The data is unchanged; the hierarchy comes from three devices.

**Price block.** Price, GW change and Season change sit together as three right-aligned columns, ruled off from the performance columns. Movement is coloured by direction, green for a rise and red for a fall, consistent with 6.4's rule that green means good: a rise lifts the owner's team value.

**No change renders as an empty cell, not a dash.** Most players have not moved in a given week, and a column of placeholders hides the handful of rows that did.

**Column order:** Availability, Price, GW, Season, Pts, PPG, xP, Form, Mins, xGI, DefCon. The bar columns are grouped at the end so the only wide columns sit together rather than being interleaved with tight ones. xP sits with the returns it summarises, before the bars.

**Availability sits inside the player cell, after the club: name, club, dot.** It had a column of its own for a while, which reads well on a laptop and badly on a phone: a column costs a fixed slice of width in the frozen cell that is already the widest thing on screen, and in a normal week all fifteen are green — a column's worth of space to say nothing is wrong.

A dot is small enough to sit beside the name and still be the only coloured thing in the cell, which is what makes an exception findable. Green available, amber doubtful, red out. **Nothing is lost by shrinking the marker**: the reason and the chance of playing are on the news line below the name, and the title and screen-reader text always carry the state in words, so colour never carries it alone.

**Mins is minutes per match, not the season total.** A total becomes abstract the moment clubs have played different numbers of matches, which blanks and doubles guarantee. The denominator is that club's **started** fixtures counted from `fixtures/`, which is right through blanks and doubles; the `teams` array's own `played` is never populated. The bar runs against the 90 available rather than against the squad, so a full bar means every minute played.

**The bar hues are one step stronger than they were, and spread further apart**: blue, grey, purple, teal. Four columns need four that separate at a glance, and the earlier pastels were too close to tell apart, which defeated the point of giving each column its own.

**Alignment.** Every header except Player is centred, and every data cell is centred except Player and the bar columns. The bar columns keep their numbers right-aligned: centring one would set it adrift from the end of its own bar, which is the one place in the table where a value has a length to sit against.

**The table occupies the same geometry as the Fixtures view.** Same left edge, same width, same header height, same row height, so switching between the two views does not appear to move the table. The two share the row and header heights as constants rather than each setting its own, and the Form table absorbs its leftover width in a trailing spacer column exactly as Fixtures does — without it, a full-width table redistributes the spare width across the real columns and the slim numeric ones stop being slim.

**Widths are deliberately uneven, and that is the compaction rule.** The plain numeric columns are sized to their contents and no wider, because padding between bare numbers is only distance for the eye to travel. The bar columns are wider, because there the space *is* the data: a bar needs room to read as a length. **Only the bar columns carry whitespace.** Season is the one exception among the tight columns: it is sized to fit its own header, because a truncated heading is not compaction.

**Data bars behind four columns:** Form, Minutes, xGI and DefCon. Not the others. The number stays fully legible on top.

**Bars are anchored left, not right.** Anchored right, a short bar sits entirely behind its own right-aligned number and disappears, so the smallest values — the ones most worth spotting — showed nothing at all. From the left, every value has a visible length.

**One hue per bar column**, so they read as separate columns rather than one band and a row can be scanned across without losing which is which. They remain muted and are **deliberately not a red-to-green scale**: these bars compare fifteen players within one squad, a narrow range, and a strong scale would imply the lowest is bad in absolute terms when it may not be.

The hues are drawn from ones this app does not already use for meaning. Green is good, red is bad and amber is a doubt elsewhere, so all three are avoided here.

The scales differ, and the difference is the point:

| Bar | Drawn against | Reads as |
|---|---|---|
| Form, xGI | The highest value in that column across the fifteen | A comparison within the squad |
| Minutes | Minutes *available*, gameweeks played × 90 | Reliability. A player who has played every minute is always full, whoever else is in the squad |
| DefCon | The player's own positional threshold | Progress towards the two points, not a comparison with team-mates |

**xGI and DefCon are an em dash for goalkeepers,** not `0.00`. A zero reads as a bad value; a dash correctly reads as not applicable.

#### 7.3.2 Defensive contribution (DefCon)

FPL awards two points for clearing a threshold of qualifying defensive actions in a match: **10 for a defender, 12 for a midfielder or forward**. Goalkeepers are outside the rule entirely.

The column shows `defensive_contribution_per_90` as a bar whose full width is the player's own positional threshold. A player at or above their threshold fills the bar completely; beyond it the extra earns nothing, so showing more would overstate them.

**The per-90 rate is a proxy, not a prediction.** DefCon is a threshold stat capped at two points — a player either clears the line in a match or does not, and beating it by a mile scores the same as scraping it. A season average cannot distinguish a player who clears the line most weeks from one who posts extreme scores in a few, yet only the first reliably banks the points. The figure indicates whether a player is in the right territory; it does not forecast returns.

The honest measure is a **hit rate**: in what share of their matches did they actually clear the threshold. That needs per-gameweek history from `element-summary/{id}/`, one call per player, which is outside the projection in 5.3 and is **deferred beyond v1**.

**Availability is not a column.** A small coloured dot sits immediately before the player name, green available, amber doubtful, red for injured, suspended or unavailable. When there is news it appears as a second line beneath the name at a smaller size, with the chance of playing appended when the API gives one. The row background is tinted when the status is anything other than available.

In a normal week no player has news, so that second line does not exist and the table is quieter for it. That is the intended state, not an empty one.

**Sorting.** Every numeric column sorts on clicking its header, and clicking the active column reverses it. The default is squad order, starting XI then bench. Since clicking a sorted column only ever flips its direction, the Player header is the way back, and it says so explicitly whenever a sort is applied.

Sorting happens **within each group**, so the starting XI and the bench stay separated whatever the order. That split is structural (7.1), not merely the default ordering. Ties fall back to squad order so equal values keep a stable, meaningful sequence.

The sort lives in the `sort` URL parameter, shared with Teams (8.2). The two vocabularies do not overlap and each view falls back to its own default on a value it does not recognise, so the parameter can ride through a view switch and be restored on return.

**"Visually obvious" means visible without scrolling.** This is why availability lives in the frozen player column rather than in Status and News columns of its own. Those columns are off screen at exactly the width where the flag matters most, and they were removed for it: the dot, the tinted row and the news line all travel with the frozen column.

**The flag carries text, not only colour.** The dot's title and its screen-reader text give the state in words, and the news line spells out the reason and the percentage whenever there is one, so nothing depends on distinguishing red from amber.

**Five API status codes collapse to the three states above.** `a` is available; `d` is doubtful; `i` injured, `s` suspended and `u` unavailable are all out, as is `n` and anything unrecognised. Defaulting an unknown code to out rather than available is deliberate: showing an unfit player as fit is the more costly error. Percentages come from `chance_of_playing_next_round`, which is occasionally null even for a doubt, so fall back to the word.

**Price movements are signed and coloured by direction,** green for a rise and red for a fall, consistent with 6.4's rule that green means good: a rise lifts the owner's team value. No change renders as an empty cell, not a dash or a zero (see 7.3.1), so the eye goes only to what moved. Both movement fields are in tenths like the price itself (constraint 4).

This view has no horizon and no Fixture Score, so the horizon control (7.6) and the fixture colour legend are not shown on it. The `horizon` parameter is still carried through the view switcher, so returning to Fixtures or Teams restores the horizon the user left.

#### 7.3.3 xP (FPL)

FPL's own expected points for the next gameweek, from `ep_next`. **Not this app's number**, and the header says so: `xP (FPL)`, not `xP`. A figure sitting in this app's table is naturally read as this app's figure, and this one is a third party's prediction.

Far right, past the bar columns and ruled off from them.

**No data bar, deliberately.** Every bar to its left is an input the reader weighs for themselves. This is FPL's summary of those same inputs, so a bar would set it competing with the columns it is derived from instead of reading as a conclusion drawn after them.

Sortable like the other numeric columns.

**The legend says whose number it is.** The Form view had no legend before this column; it has one now, because the disclaimer has to live somewhere a reader will find it without hovering a header.

### 7.4 View 3 — Ownership

**Question answered:** is this player worth owning, given who else owns them and where I sit?

The comparison population is selectable:

| Mode | Reference population | Source |
|---|---|---|
| Overall rank | All FPL managers | `selected_by_percent` from `bootstrap-static` |
| Mini league | Every manager in a chosen league | Standings, then one `picks/` call per manager |
| Single rival | One manager | One `picks/` call |

**This is one function with three inputs, not three features.** The calculation is identical; only the denominator changes.

**The player column is the shared one**, identical in width and formatting to Fixtures and Form, so switching view leaves it exactly where it was. That is the part that must not move, and pinning it is what frees the rest.

**The comparison columns appear rather than filling with dashes:**

| Mode | Columns |
|---|---|
| global | Global, Flag |
| league | Global, League, Diff, Flag |
| rival | Global, League, Rival, Diff, Flag |

An earlier version kept all six always and dashed the unused ones, to stop the table reflowing. That traded a reflow for four dead columns on the view most people open first.

**League stays visible in rival mode.** A rival is picked out of a league, and "they own him, and so does half the league" is a different fact from "they own him and nobody else does". Both populations are built when both are selected; the league fan-out is cached and is usually already warm from having chosen the rival there.

**Global and League are wide and carry bars**, in two hues with high contrast, because they sit side by side and the whole point is telling them apart at a glance.

**Rival ownership is a property of the whole row, so the row carries it.** Players the rival does not own are greyed back and the ones they do own stay crisp with a filled "Owns" chip. The question in rival mode is "which of mine do they also have", and that is answered by scanning names, not by reading across to a column of yes and no.

**The population picker floats** behind a "Compare against …" button that names the current selection (7.8). The button gets **its own row, under the view's question and above the guidance**, and runs full width on a phone. Floated to the right of the guidance it and a paragraph of prose fought for one line and neither survived a narrow screen. It was a permanent card of links and ID forms above the table, which was the untidiest thing on the page and pushed the table down on the one view where the table *is* the comparison.

**Rival dropdown.** When a mini league is selected, offer that league's managers as a dropdown: team name with manager name, ordered by league rank, excluding the user themselves. **Selecting one runs the comparison immediately; there is no Compare button** (7.4.2). **This costs no extra API call** — the standings response the league comparison already fetches carries `entry`, `player_name` and `entry_name` for every row. Hide the dropdown entirely in global mode, where there is no league to populate it from. Keep the manual rival manager ID field for rivals outside the user's leagues.

**Direction flag.** The app derives whether the user is ahead of or behind the reference population, using their rank within it. Ahead means differentials are a risk and convergence protects the lead. Behind means the opposite. Display this as a single line of guidance above the table, not as advice per player.

**The Flag column is coloured relative to that direction, on a diverging green-to-red scale.**

The label carries the band and never changes. The colour carries whether being in that band helps or hurts the user's current position, and reverses when the direction does.

| Position | Best → worst |
|---|---|
| Ahead | Template, Popular, Low, Differential |
| Behind | Differential, Low, Popular, Template |

Four steps applied to that ordering: green tint with dark green text, pale green with mid green, pale red with mid red, red tint with dark red. **Two greens and two reds, no amber.** An amber middle would read as neutral, and there is no neutral here: every band either helps or hurts. The split between helping and hurting must be legible without reading a single label, which is why the two pale steps sit adjacent — that boundary is the strongest edge in the column.

The colour uses the same ahead-or-behind value as the guidance line, so the two can never disagree.

The legend re-orders and re-colours with the table, and states plainly that green marks the bands helping the current position. Re-ordering is deliberate: it is the clearest possible statement that the ranking is a consequence of where the user sits, not a property of the bands.

Where there is no rank to read the user against, there is no direction, and the chips stay grey. Colouring them anyway would be inventing advice.

**League size cap: 50 managers.** A mini league requires one API call per manager. Fetch the top 50 by current league rank and no more. If the league is larger, show a notice stating that the comparison covers the top 50 only. Cache all fetched squads for the remainder of the gameweek.

#### 7.4.2 Dropdowns act on selection

**A dropdown loads its choice on selection. It gets no Go button.** Choosing an option from a list of teams has exactly one possible meaning, so a second press to confirm asks the reader to say the same thing twice. This applies to the rival dropdown here and to both view-as dropdowns in 7.1.1.

**Text fields keep their button.** Unlike a dropdown, a partly typed ID looks identical to a finished one, so there is no moment at which the user has unambiguously finished and nothing to act on until they say so.

**It still works without JavaScript.** A select that acts on change is the one control that cannot be a plain link, so it is the second and last piece of client JavaScript in the app after the horizon control (7.6). Each one stays wrapped in a real GET form carrying the whole URL state as hidden fields, with the submit button rendered inside `<noscript>`. The no-JS path is therefore exactly the button this replaces, and 8.2's rule that every control is a link or a GET form still holds.

#### 7.4.1 As built

All three populations are built. `compareOwnership` is the one function section 7.4 asks for: it takes a population and returns a row per player, and never asks which mode it is in. The three loaders differ only in how they arrive at an ownership lookup and a rank, which is the "only the denominator changes" the section describes.

**Global mode dashes three of its six columns rather than hiding them.** The reference population *is* the global one, so a reference figure would repeat the global one and the difference would always be zero. An earlier build dropped those columns entirely; the table then changed shape on every mode switch, which cost more than the empty cells saved. Dashes say the same thing without moving anything.

**Fetching cost and why the cap exists.** A single `picks/` call takes well over a second, so fifty in series would be well over a minute. They run eight at a time: fifty squads land in about six seconds cold, and under a second and a half once cached. Each manager's picks are cached for the rest of the gameweek by the same rule as the user's own (8.3), so that cost falls once per league per gameweek, not once per page view.

**The fan-out is streamed.** The squad header, tabs and population selector render immediately and the table arrives when the fan-out completes, rather than the whole page waiting. The page also raises its execution ceiling above the platform default, which a cold fifty-squad load would otherwise exceed.

**A failed squad shrinks the population, it does not break the view.** One manager's picks failing, for instance because they joined the league after the gameweek, is reported in the notice and excluded from the denominator. Only a total failure is an error.

**The manager counts in their own league's population.** The figure is meant to be that league's ownership, and leaving one squad out would make it neither the league's nor anyone else's.

**Rival mode is a population of one,** so ownership is 0 or 100 and the difference against global carries the whole signal. The cell reads as owned or not rather than as a percentage; the calculation is unchanged, only the wording. Ahead or behind is decided on overall rank, since a two-manager population has no other ordering.

**Rank is taken within the compared group, not the whole league.** On a league larger than the cap the manager may sit outside the top 50, in which case there is no ahead-or-behind call to make and the flag says so rather than guessing.

**The manager's own leagues are offered directly.** The entry payload already carries them (5.1), so requiring a league ID for a league they are in would be a pointless step. Only leagues people actually created are listed: FPL enrols everyone into global ones, and comparing against a few million managers is what global mode already does.

**Flags, not raw percentages alone.** The question in 7.4 is comparative, so ownership is banded: Template at 40% and above, Popular 15 to 40, Low 5 to 15, Differential below 5. The percentage is still shown, with a bar scaled to 100 rather than to the highest value in the squad, so a player looks the same in every squad.

**The bands are coloured by strategy, never by band.** Ahead of the field a differential is a risk; behind, it is the way to close the gap. The same 4% player means opposite things to two managers, so a fixed colour per band would be wrong for one of them. The resolution is not to leave the chips neutral but to make the colour follow the direction flag: the scale reverses with it, so green always means "this helps you" and 6.4's green-means-good rule holds in both states. The guidance line still carries the direction in words, and the legend repeats it.

**Colour is never the only carrier.** Each chip also states its step in screen-reader text, and the legend spells the ordering out, so the helps-or-hurts message survives greyscale and colour blindness.

**`league` and `rival` are no longer mutually exclusive, and `rival` wins.** A rival picked from the dropdown keeps the league in the URL: `rival` is the population, `league` is the list the picker was built from. Clearing it on selection would make the dropdown vanish the moment it was used, leaving no way back to the league's other managers. Entering a *league* ID still clears the rival, because a rival from the old league has no place in a new one.

**The table matches the other fifteen-row views.** Same frozen player column width and formatting, same header and row heights, same trailing spacer, all from shared constants, so switching between Fixtures, Form and Ownership changes the columns and nothing else. On a narrow screen the six columns scroll behind the frozen name column, exactly as the other two views do.

**Direction flag denominator.** Global mode reads the manager's overall rank against `total_players` from `bootstrap-static`, which is why that field is retained in the projection in 5.3. The split is the median: ahead is the better half of the field. Before any rank is published the flag reads as unknown rather than guessing.

This view has no horizon, so like the Form view it does not show the horizon control, but it carries the parameter through.

### 7.5 View 4 — Teams

**Labelled "Teams"; the URL parameter stays `view=clubs`.** Renaming a value that is in every shared link, to match a label, would break them for nothing.

**Question answered:** who should I buy?

- Rows are the twenty Premier League clubs
- **Fixture Score** (section 6) over a selectable horizon, displayed as score with fixture count in brackets
- Horizon control per section 7.6
- Sortable, highest score first
- Indicate which clubs the user already holds players from, and how many, to surface the three-per-club limit

**Gameweek columns.** Identical to the Fixtures view (7.2): the horizon selects the columns, so choosing five gameweeks shows five, and headers read `GW3` rather than a bare number. The cells on screen are always the ones the score is computed from, and switching between the two views keeps the same run of gameweeks in place.

Column widths scale to the number on show, and a trailing spacer absorbs any width left over so a short horizon does not stretch the columns across the page.

**Sorting** is by club, Fixture Score or owned count, either direction, and lives in the `sort` URL parameter rather than component state so a sorted table is a link someone can send (see 8.2). Ties break on club name so the order is stable. Note that clubs sort on the name FPL supplies, which is `Spurs`, not `Tottenham`.

**Owned indicator.** A count per club, with the player names alongside where width allows. A club at the three-player limit is called out explicitly rather than leaving the reader to notice the number, because at three the Fixture Score means something different: buying another player from that club requires selling one first.

**Shares the fixture data with the Fixtures view.** Both read one index built from a single `fixtures/` fetch, over the same horizon. This is a correctness requirement, not only an efficiency one: the two views must never disagree about a club's score.

### 7.6 Horizon control

Shared by the Fixtures and Teams views. Both must read from the same `horizon` URL parameter, so switching between the views preserves it.

- **Preset buttons** for 1, 3, 5, 7 and **All**, for one-click switching. A horizon of 1 shows the next gameweek only, which is the most common question at a deadline. **All** is not a fixed number: it resolves to the gameweeks remaining, so it moves as the season does and is highlighted whenever the applied horizon happens to be the whole remainder
- **Numeric input** accepting any integer from 1 to the number of gameweeks remaining in the season
- Clicking a preset sets the numeric input
- Typing a custom value clears the preset highlight; typing a value that matches a preset highlights it
- Values outside the valid range clamp to the nearest valid value rather than erroring

A horizon of 1 is valid and useful. The normalised Fixture Score (6.1.1) makes a single-gameweek reading directly comparable to a ten-gameweek one.

### 7.7 Scratch squad editing

Modelling transfers that have not been made. **Nothing persists server-side and no login is involved.**

#### The URL holds a diff, not a squad

`?id=2695180&out=427,318&in=351,290` — two positionally paired lists of player IDs.

The base fifteen still load from FPL on every request, so the scratch squad stays current: prices, form and availability keep updating underneath the changes, and a link shared today shows today's data rather than a snapshot of whenever it was made. Storing the resulting squad would have frozen it, and put fifteen IDs in every URL to express what is usually a single move.

- The scratch squad **persists across every view switch**, so `out` and `in` are carried like any other parameter (8.2)
- A **reset** control clears all changes; **undo** removes the most recent pair
- **A stale pair is dropped, never fatal.** After a gameweek rolls over, a saved link can name a player who has left the squad. Drop the pair, show a dismissible notice, and render the rest of the plan

#### Replacement panel

Clicking a player's name opens it. The name is the target because it already identifies the player; a replace button on every row would add fifteen controls to a table whose point is density.

- **Same position only**, and **every player in the game**, not a shortlist
- **Ranked by the metric of the current view**, reusing the column sort when one is applied. The panel opens ordered by the question the reader was asking a moment ago
- Defaults per view: Fixtures by Fixture Score over the current horizon, Form by form, Ownership by ownership with the direction set by whether the manager is ahead of or behind the population (7.4)
- Each row shows name, club, price, and the **signed cost difference**: `+£3.2m`, `−£0.5m`, `level`
- A secondary line carries `ep_next` (7.3.3)
- **"Only show what I can afford"**, default off
- **A search box filters by player or club in one field.** "bruno" finds every Bruno, "haaland" finds Haaland, "arsenal" finds every Arsenal player. One box, not a field selector
- Selecting performs the swap and closes the panel

#### Do not filter or hide

**Unaffordable players and players who would breach the three-per-club limit must still appear**, with the cost difference shown and a flag.

This is a planning surface, not a validator. Invalid intermediate states are legitimate: the reader may be part-way through funding a move, and the app cannot know which of four players from one club they intend to drop. FPL itself rejects an invalid *final* squad. **The job is to make problems impossible to miss, not impossible to create.**

**The one exception is a duplicate player.** Already-owned players are listed and flagged, but are not selectable. Unlike being over budget or over the club limit, there is no further transfer that makes a duplicate legal — FPL has no concept of one — and taking it would silently leave a fourteen-player squad. A hand-edited URL that asks for one has the pair dropped, with the same notice as a stale pair.

#### Budget

`available = bank + value of players sold − cost of players bought`, recalculated after every swap so the cost annotations update as a move is funded.

`bank` and `value` come from `picks.entry_history`. **These are last-deadline figures and lag price changes, and the UI says so.** FPL does not republish them as prices move. Selling prices in FPL also depend on the purchase price, which is not in any payload here, so the sold value uses the current price and the figure is an estimate either way.

#### Warnings

A persistent summary strip, always visible, not scrolled away — so it is sticky rather than merely placed at the top. Over budget and a fourth player from one club are both conditions that can be created three swaps earlier and only discovered when the transfers are made for real.

- **"Over budget by £0.8m"** when available funds go negative
- **"4 Sunderland players"** when any club exceeds three
- When a club is over the limit, **highlight every row for that club**, not just the newest, since any of them could be the one dropped. The mark is an accent down the frozen player column, so it survives horizontal scrolling on a phone and does not collide with the availability tints in 7.3

**Warnings are informational and never block a swap.**

### 7.8 App shell

The app is four views over one squad. Everything else is chrome, and chrome had taken the top third of every page: a title, a manager ID form, a view-as card, and only then the tabs. The eye landed on the least important thing first.

#### The menu

**Loading a squad and viewing as another manager live in a drawer** behind an **Options** button at the right-hand end of the header, shaped like the Ownership view's "Compare against" button. It sits after the figures rather than before the team name: the identity is what the bar is for and should be read first, and a control ahead of it took the position of most importance to say the least. Both open a panel of settings over the page, and two different shapes for one idea made the app look like two apps. Both are done once and then forgotten, so they cost one click on the rare occasion they are wanted and give the views the top of the page back. A drawer rather than a dropdown because it holds two full controls, one a two-step cascade, and both want room at 380px.

Before a squad is loaded there is no header and no menu, so the title and the ID form stay on the page.

#### The header is the one permanent bar

**Sticky at every width**, because whose squad you are looking at is the fact every view depends on, and the menu button travels with it. The scratch-squad strip (7.7) rides in the same sticky container, so the two can never overlap.

On a phone the six tiles would eat a third of the screen while stuck to the top, so they collapse to a single line of small text. The identity and the menu, which is what the bar is really for, stay at every width.

**Viewing another manager's squad turns the whole bar amber and puts the way back beside the team name.** That is a statement about what you are looking at, so it belongs with the name of what you are looking at, and it must be reachable without opening anything. The view-as picker in the menu therefore carries no second copy of the button.

#### The four views are the loudest thing on the page

Segmented buttons filling the width, larger text, the selected one filled rather than underlined. As understated tabs they lost the fight to the cards above them; those have gone, and these have been given the weight the hierarchy always implied.

#### Overlays float; they never push

The menu, the Ownership population picker (7.4) and the replacement panel (7.7) are all floating panels over a dimmed backdrop. In the document flow, opening one shoved everything below it down the page — the table you were reading moved out from under you at the moment you asked a question about it.

**They are URL state, not component state.** `?panel=menu`, `?panel=population` and `?swap=<id>`. Opening is a link and the backdrop is a link, so an overlay needs no client JavaScript, survives the back button, and cannot get stuck open. Clicking anywhere outside the panel lands on the backdrop and navigates to the closed URL, which is dismiss-on-click-away for free.

Unlike the scratch squad, these are **not** carried between views: an overlay is a momentary act, and arriving on a new view with a dialogue already open over it would be surprising.

**A step that narrows a choice keeps the overlay open; a step that answers it closes.** Picking a league in the view-as cascade produces the list of teams to read next, so the drawer stays; picking a team is the act the drawer exists for, so it closes. The same rule governs the Ownership population picker: league keeps it open, rival closes it. Loading a squad closes the drawer for the same reason.

#### One gutter for the whole page

The sticky bars bleed to the window edge but pad themselves back to the same gutter as the content below, and both are capped at the same width and centred. The menu button, the view tabs and every table therefore start on exactly the same vertical line, and the margins are equal on both sides. Before this the bars were centred within a maximum width while the page content ran the full window, so the two disagreed by however wide the window was.

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
| `sort` | Teams: `score`/`club`/`owned`, each `-asc` or `-desc`. Form: `squad`, or `price`/`gw`/`season`/`form`/`points`/`ppg`/`mins`/`xgi` with a direction | Teams `score-desc`, Form `squad` |
| `league` | League ID | None. Ownership falls back to global mode |
| `rival` | Manager ID of a single rival | None. Ownership falls back to global mode |
| `as` | Manager whose squad is shown, when not `id` | None. Shows the user's own squad |
| `asleague` | League the view-as picker is listing | None. No team dropdown yet |
| `rating` | `fpl` or `custom` difficulty (6.7) | `fpl`, FPL's own rating |
| `out` | Player IDs transferred out, comma separated (7.7) | None. No changes modelled |
| `in` | Their positionally paired replacements (7.7) | None |
| `swap` | Squad player whose replacement panel is open (7.7) | None. Panel closed |
| `panel` | `menu` or `population`: which overlay is open (7.8) | None. No overlay |

`league` and `rival` select the Ownership view's reference population. They are **not** mutually exclusive: a URL carrying both means "compare against this rival, chosen from this league", and `rival` is the population. `league` alone is league mode. See 7.4 for why the league is kept.

`?id=1234567` alone must land on the fixtures view at a 5-gameweek horizon. Nobody should need to type a `view` parameter to reach the main function of the app.

**Changing any control updates the URL.** This is what makes state shareable and makes the browser back button work. A link sent to someone else must reproduce exactly what the sender was looking at.

**Every control must carry the whole state, not just its own parameter.** Changing the horizon must preserve the view and the sort; sorting must preserve the view and the horizon; switching view must preserve the horizon (7.6 requires this) and the sort. A control that emits only its own parameter silently resets the others, which reads as a bug and breaks the shareable-link guarantee. This applies equally to any GET form, which submits only its own fields and therefore needs the rest carried as hidden inputs.

**The pass-through parameters travel as one object, not one prop at a time.** Threading them individually worked at two and stopped scaling at four, and the failure mode is silent: a forgotten prop does not break the build, it loses one parameter on one particular click. Passing them together means a control cannot carry half of them. `view`, `horizon` and `sort` stay explicit, because each is set by some control rather than only passed on.

Parameters at their default value may be omitted from generated links, which keeps shared URLs short. `?id=X` is the canonical form of the default view.

Invalid parameter values fall back to the default rather than erroring. A `view` naming a stage not yet built falls back to `fixtures` rather than rendering an empty shell, and only built views are offered as tabs.

**A parameter a view does not use is still carried through it.** The Form view has no horizon, so it does not show the horizon control, but switching to it and back must return the user to the horizon they left. Dropping a parameter because the current view ignores it makes the view switcher lose state, which 7.6 rules out.

### 8.3 Caching

Required, both for performance and to avoid placing load on FPL's servers.

| Data | Cache duration | Reason |
|---|---|---|
| `bootstrap-static` | 1 hour | Prices change once daily |
| `fixtures` | 1 hour | The fixture *list* changes rarely, but the same payload carries `started`, `finished` and the scores, and those change every match day. See below |
| A manager's `picks` | Rest of gameweek | Immutable once the deadline passes |
| League standings | 1 hour | Updates during and after matches |
| `entry/{id}/` | 1 hour | Not in the original table. Only the manager name, team name and league list are read from it, and none of those change in practice; this matches the standings duration rather than inventing a longer one |

**`fixtures` was 24 hours and is now 1, matching `bootstrap-static`.** Two features divide one payload by the other — the form-based difficulty rating (6.7) reads results, and the Form view's average minutes (7.3) divides minutes from bootstrap by matches from fixtures. At 24 hours they disagreed mid-gameweek: the minutes knew a club had played three matches while the fixtures still said two, and the average came out at 135 minutes per match. **Any two figures divided by each other have to come from payloads of the same age.**

**"Rest of gameweek" is computed, not fixed.** It is the time remaining until the next deadline, since that is when a manager's picks can next change. A stale deadline can only shorten it, never extend it past the next one.

**The picks duration is what makes league mode affordable.** The same cache serves the user's own squad and every squad fetched for a mini-league comparison, so a fifty-manager league costs fifty calls once per gameweek rather than once per page view. See 7.4.1.

**Nothing that failed is cached.** Only successful responses are stored, so an outage around a deadline is retried rather than served from cache for the next hour. See 8.6.

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

### 8.6 Errors

Section 7.1 asks for a clear error state. This is the contract behind it, shared by the route handlers and the views so both describe a failure the same way.

Every failure is classified into one of these, rather than surfacing a raw upstream status:

| Code | HTTP | Means |
|---|---|---|
| `bad_request` | 400 | The ID was not a positive whole number |
| `not_found` | 404 | No such manager, league or gameweek |
| `picks_not_yet_available` | 409 | The gameweek's deadline has not passed. See constraint 3 |
| `forbidden` | 502 | The FPL API rejected the request, most likely the user-agent check |
| `unavailable` | 503 | The FPL API is erroring, or returned something that is not JSON |
| `network` | 503 | The FPL API could not be reached |
| `timeout` | 504 | The FPL API did not answer in time |

Route handlers return `{ error: { code, message } }`.

**`picks_not_yet_available` exists because FPL returns 404 for two different things.** Without it, a user with a perfectly good ID is told to check it. See constraint 3.

**Error responses are never cached**, at any layer. An outage around a deadline must not be served for the following hour, and a user retrying must actually retry.

**The message says what went wrong; the view says what to do about it.** A wrong ID is the reader's to fix, a closed gameweek needs waiting out, an outage needs retrying. Keeping the two apart means the data layer does not have to guess who is reading.

**Failures inside a fan-out are not view failures.** In league mode a squad that cannot be loaded is dropped from the population and reported in the notice; only a total failure is an error. See 7.4.1.

## 9. Build order

1. ~~Server-side API routes with caching and correct headers~~ **Done**
2. ~~Squad loading and row rendering~~ **Done**
3. ~~Fixtures view (the highest-value view, build it first)~~ **Done**
4. ~~Teams view (reuses the fixture data already fetched)~~ **Done**
5. ~~Form view (no new data required; `bootstrap-static` is already loaded)~~ **Done**
6. ~~Ownership view, global mode only~~ **Done**
7. ~~Ownership view, league and rival modes~~ **Done**

Steps 1 to 3 constitute a genuinely useful tool on their own. Ship there if needed.

Step 5 needed no new fetching and no new fields: every column in 7.3 was already in the projection list in 5.3, which was derived from that section. Check any further view against that list before starting, since a missing field will not reach the browser.

Step 6 needed no new fetching either: global ownership is `selected_by_percent`, and the direction flag's denominator is `total_players`, both already in the projection.

Step 7 was the first to need new fetching and the first per-manager fan-out. See 7.4.1 for how the cap, concurrency, caching and streaming interact; the 50-manager cap in 7.4 and the picks caching row in 8.3 are what make it affordable.

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
6. League mode is the only part of the app that fans out across managers, and the only place a slow or rate-limited FPL API would be felt sharply. Cold, it is fifty calls; cached, none. If FPL ever throttles bursts, the concurrency in 7.4.1 is the dial to turn down, at the cost of a slower first load
7. Squads are cached for the rest of the gameweek, which is correct for picks but means a league comparison does not reflect transfers made after it was first loaded. That is the same staleness the rest of the app accepts, and it resolves at the next deadline
