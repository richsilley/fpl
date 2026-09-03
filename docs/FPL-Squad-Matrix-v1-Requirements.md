# FPL Squad Matrix — v1 Requirements

**Version:** 1.1
**Date:** 3 September 2026
**Status:** Approved for build

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

All data comes from the undocumented public FPL API at `https://fantasy.premierleague.com/api/`. No API key, no cost, no rate limit published.

| Endpoint | Provides |
|---|---|
| `bootstrap-static/` | All players, teams, gameweeks, prices, ownership %, form, xG, xA, injury status and news |
| `fixtures/` | All 380 season fixtures with FDR for both sides |
| `entry/{manager_id}/event/{gw}/picks/` | A manager's fifteen players for a gameweek |
| `entry/{manager_id}/` | Manager summary including their leagues |
| `leagues-classic/{league_id}/standings/` | Manager IDs of everyone in a league |

### Known constraints

1. **CORS.** The API sends no CORS headers. All calls must be made server-side. A browser cannot call it directly.
2. **User agent.** The API returns 403 to requests that don't look like a browser. Set a browser user-agent header on all server calls.
3. **Picks are private before the deadline.** `picks/` only returns data for gameweeks whose deadline has passed. Rival comparison is therefore always retrospective.
4. **Prices are in tenths.** `now_cost: 75` means £7.5m.
5. **Availability.** The API goes down around gameweek deadlines and through the June–July off-season. Response shapes occasionally change over the summer.

## 6. Fixture Score

A single number expressing how good a run of fixtures is. Used in the Fixtures view summary column and as the sole metric in the Club Blocks view.

### 6.1 Definition

For each fixture in the horizon, invert the FDR:

```
fixtureValue = 6 - FDR
```

An FDR of 1 becomes 5. An FDR of 5 becomes 1.

Sum the inverted values across every fixture falling within the horizon:

```
fixtureScore = sum(6 - FDR) for all fixtures in horizon
```

**Higher is better.**

### 6.2 Why inversion rather than sum or average of raw FDR

Raw FDR runs backwards, where low is good. Summing raw FDR means a blank gameweek adds nothing and therefore appears beneficial, while a double gameweek adds difficulty and therefore appears harmful. Both are the opposite of the truth. Averaging corrects the magnitude but not the direction, and discards fixture count entirely.

Inverting first makes blanks and doubles fall out of the arithmetic correctly with no special-case handling. A missing fixture contributes zero and lowers the score. An extra fixture contributes value and raises it.

### 6.3 Display

Render as the score followed by the fixture count in brackets:

```
18 (5)
21 (6)   ← contains a double
15 (4)   ← contains a blank
```

Showing the count lets the user see whether a high score came from quality or quantity, without the app encoding a judgement about how much a double is worth.

### 6.4 Naming and colour

**Do not label this FDR.** Users are trained that low FDR is good, and this metric inverts that. Label it **Fixture Score**.

Colour logic must stay consistent across the app: green means good everywhere. Individual fixture cells show raw FDR, where green is a low number. Summary and Club Block cells show Fixture Score, where green is a high number. The colour is the constant; the number is not.

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
- A summary column shows the **Fixture Score** (section 6) over a user-selected horizon (3, 5, 8 or 10 gameweeks), displayed as score with fixture count in brackets

### 7.3 View 2 — Form

**Question answered:** who is playing well, and who is at risk?

Columns: price, price change this gameweek, price change since season start, form, total points, points per game, minutes, xG, xA, expected goal involvements, availability status, and injury news text.

Availability should be visually obvious. Red for out, amber for doubtful with the percentage chance shown, no flag for available.

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

### 7.5 View 4 — Club Blocks

**Question answered:** who should I buy?

- Rows are the twenty Premier League clubs
- **Fixture Score** (section 6) over a selectable horizon (3, 5, 8, 10 gameweeks), displayed as score with fixture count in brackets
- Sortable, highest score first
- Indicate which clubs the user already holds players from, and how many, to surface the three-per-club limit

## 8. Technical requirements

### 8.1 Architecture

- Next.js deployed on Vercel
- All FPL API calls made in server-side route handlers, never from the browser
- No database in v1

### 8.2 State

Application state lives entirely in the URL:

```
/?id=1234567&view=fixtures&horizon=5
/?id=1234567&view=ownership&league=987654
```

This makes every view shareable by construction and removes the need for accounts or storage.

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

### 8.5 Mobile

Mobile is the primary target, not an afterthought. Frozen first column with horizontal scroll is the core pattern for every view.

## 9. Build order

1. Server-side API routes with caching and correct headers
2. Squad loading and row rendering
3. Fixtures view (the highest-value view, build it first)
4. Club Blocks view (reuses the fixture data already fetched)
5. Form view (no new data required; `bootstrap-static` is already loaded)
6. Ownership view, global mode only
7. Ownership view, league and rival modes

Steps 1 to 3 constitute a genuinely useful tool on their own. Ship there if needed.

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
3. Blank and double logic cannot be tested against live data until cup postponements are confirmed, typically from GW18
