# FPL Squad Matrix — v1 Requirements

**Version:** 1.14
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
selected_by_percent, status, news, chance_of_playing_next_round
```

`defensive_contribution_per_90` is supplied by the API as a number and equals `defensive_contribution / minutes * 90`, so it needs no derivation. It is a season average against a per-match threshold; see 7.3 for why that makes it a proxy rather than a prediction.

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

### 6.7 Custom difficulty rating

FPL's FDR is set before a ball is kicked and never moves. A promoted side that turns out to be decent keeps its easy rating all season; a big club in freefall keeps its hard one. An alternative rating, derived from results, is offered alongside it and **toggled per 8.2 so a shared link carries which one produced it**.

**FPL's own rating is the default.** Nobody is shown a derived number without having asked for it.

#### Data

Everything comes from `fixtures/`, which every view already loads. `team_h_score`, `team_a_score` and `finished` are enough to reconstruct both the table and recent form. **No new endpoints, and no new fields in the `elements` projection.**

**The `teams` array's own `played`, `points` and `position` are not populated by FPL** — they sit at zero or null all season — so they are ignored and the results are counted from the fixtures instead. `strength` is likewise null; `strength_overall_home` and `strength_overall_away` *are* populated and are what the prior reads. Those two were already in the payload, since `teams` passes through the projection whole (5.3); only the type had not named them.

#### The model

For each club:

```
observed = points per game over their last 6 completed matches
prior    = FPL's overall strength, mapped onto the same points-per-game scale
weight   = played / (played + 6)
strength = weight x observed + (1 - weight) x prior
```

**Early in the season the rating is mostly the prior, and that is deliberate.** After two matches `weight` is 0.25, so three quarters of a club's rating is still FPL's pre-season opinion. Two results are not evidence, and a rating that swung wildly on them would be worse than the static one it replaces. Confidence in the observed record grows with the season: two thirds by GW12, six sevenths by GW38.

**The six-match window is what lets a rating fall when form does.** `weight` only ever rises, so if `observed` read the whole season a club's rating would converge and then freeze — which is the exact failing of the static FDR. Reading form over a rolling window means a good side on a bad run becomes easier to play, and the rating still says something current at GW38.

Note that `weight` counts *all* matches played while `observed` reads only the last six. That is not an inconsistency: how confident we are grows with the whole season's evidence, while what we are confident about is the club's current form.

#### Home advantage

One figure for the division, measured from all completed fixtures as total home points minus total away points per match, applied as a **constant offset** rather than by splitting each club's record.

Half a season gives a club nine or ten home games, far too few to separate a real home effect from noise, while the league-wide figure has hundreds of matches behind it. The offset is split evenly either side, so the league's mean difficulty is unchanged: playing the away side is easier by as much as playing the home side is harder.

Early in the season this figure is itself noisy and will be larger than it ends up. It settles as matches accumulate, on the same principle as everything else here.

#### Output

Strength is mapped **linearly across the twenty clubs onto 1 to 5**, fractions allowed, with a strong opponent scoring high to match FPL's convention. The venue offset is then applied and the result clamped to 1–5.

**Clamping costs something and is still right.** The strongest club reads 5 whether at home or away, so its home advantage is invisible. The alternative — widening the scale to fit the offset — would mean no club ever reached either end of it, which is worse.

**Nothing downstream changes.** Fixture Score, the colour bands and Club Blocks all read the same field they always did; only the number in it differs. The one adjustment is that cell shading rounds to the nearest band, since a fractional rating would otherwise match no band at all. The five bands themselves are untouched.

**Both horizon views share one rating.** It is chosen once, in the URL, and one fixture index is built from it, so Fixtures and Club Blocks cannot disagree about a club.

#### Deferred

Goal difference and margin of victory are ignored: points per game is what the league table runs on and what managers already think in. Attack and defence strengths are ignored too, so the rating cannot say a club is hard to score against but easy to beat.

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

#### 7.1.1 Viewing another manager's squad

Any of the user's league rivals can be loaded into **all four views**, so the whole matrix can be pointed at someone else's squad.

The control is a two-step cascade — **View as → from league → team** — and sits above the view tabs, because whose squad you are looking at outranks which columns you are looking at. It stays on every view: switching view keeps the borrowed squad, switching squad keeps the view.

- The league dropdown lists the user's own mini leagues (5.1)
- Choosing one lists that league's managers, ordered by league rank, **excluding the user themselves**
- The team dropdown does not exist until a league is chosen, rather than appearing empty and disabled
- Choosing a team loads it immediately; there is no confirm button (7.4.2)
- A **one-press "Back to my team"** is on screen the whole time a borrowed squad is, including on the error page if that squad fails to load

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

**Club Blocks does the same** (7.5). Both views treat the shared horizon identically, so switching between them changes the rows and the columns stay put.

**Below the `sm` breakpoint the summary column is hidden** and the score moves under the player name instead. Kept as a column it consumes most of a phone's width and no fixtures are visible at all, which defeats the view. See 8.5.

### 7.3 View 2 — Form

**Question answered:** who is playing well, and who is at risk?

Columns, in order: price, price change this gameweek, price change since season start, total points, points per game, form, minutes, expected goal involvements, and defensive contribution per 90.

Availability should be visually obvious. Red for out, amber for doubtful with the percentage chance shown, no flag for available.

#### 7.3.1 Presentation

Every column here is a number, and presented flat they read as a wall of them. The data is unchanged; the hierarchy comes from three devices.

**Price block.** Price, GW change and Season change sit together as three right-aligned columns, ruled off from the performance columns. Movement is coloured by direction, green for a rise and red for a fall, consistent with 6.4's rule that green means good: a rise lifts the owner's team value.

**No change renders as an empty cell, not a dash.** Most players have not moved in a given week, and a column of placeholders hides the handful of rows that did.

**Column order:** Price, GW, Season, Pts, PPG, Form, Mins, xGI, DefCon. The bar columns are grouped at the end so the only wide columns in the table sit together rather than being interleaved with tight ones.

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

The sort lives in the `sort` URL parameter, shared with Club Blocks (8.2). The two vocabularies do not overlap and each view falls back to its own default on a value it does not recognise, so the parameter can ride through a view switch and be restored on return.

**"Visually obvious" means visible without scrolling.** This is why availability lives in the frozen player column rather than in Status and News columns of its own. Those columns are off screen at exactly the width where the flag matters most, and they were removed for it: the dot, the tinted row and the news line all travel with the frozen column.

**The flag carries text, not only colour.** The dot's title and its screen-reader text give the state in words, and the news line spells out the reason and the percentage whenever there is one, so nothing depends on distinguishing red from amber.

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

**Columns are fixed across all three modes:** Player, Global, League, Rival, Diff, Flag, always in that order. Only the cells the selected mode can fill carry a value; the rest render an em dash. Global mode dashes League, Rival and Diff; league mode dashes Rival; rival mode dashes League.

The reason is that the table must not reflow when the population changes. Three different column sets meant re-finding every column on each switch, which made comparing two populations harder than reading either one. A dash is also the honest answer: "this mode does not measure that" is a different statement from "this measures zero", and the two must not look alike.

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

### 7.5 View 4 — Club Blocks

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

Shared by the Fixtures and Club Blocks views. Both must read from the same `horizon` URL parameter, so switching between the views preserves it.

- **Preset buttons** for 1, 3, 5, 7 and **All**, for one-click switching. A horizon of 1 shows the next gameweek only, which is the most common question at a deadline. **All** is not a fixed number: it resolves to the gameweeks remaining, so it moves as the season does and is highlighted whenever the applied horizon happens to be the whole remainder
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
| `sort` | Club Blocks: `score`/`club`/`owned`, each `-asc` or `-desc`. Form: `squad`, or `price`/`gw`/`season`/`form`/`points`/`ppg`/`mins`/`xgi` with a direction | Club Blocks `score-desc`, Form `squad` |
| `league` | League ID | None. Ownership falls back to global mode |
| `rival` | Manager ID of a single rival | None. Ownership falls back to global mode |
| `as` | Manager whose squad is shown, when not `id` | None. Shows the user's own squad |
| `asleague` | League the view-as picker is listing | None. No team dropdown yet |
| `rating` | `fpl` or `custom` difficulty (6.7) | `fpl`, FPL's own rating |

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
| `fixtures` | 24 hours | Changes rarely |
| A manager's `picks` | Rest of gameweek | Immutable once the deadline passes |
| League standings | 1 hour | Updates during and after matches |
| `entry/{id}/` | 1 hour | Not in the original table. Only the manager name, team name and league list are read from it, and none of those change in practice; this matches the standings duration rather than inventing a longer one |

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
4. ~~Club Blocks view (reuses the fixture data already fetched)~~ **Done**
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
