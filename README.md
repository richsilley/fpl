# FPL Squad Matrix

A free, no-login web tool for Fantasy Premier League. Enter any manager ID and
their fifteen players load as fifteen fixed rows. The rows never change; each
**view swaps the columns** to answer a different question about the squad.

> An FPL squad is a table with fifteen rows. Every useful question is a
> different set of columns.

State lives entirely in the URL, so every view is shareable and there are no
accounts, no login and no database.

## The four views

| View | Question it answers |
|---|---|
| **Fixtures** | Where are my fixture problems? |
| **Form** | Who is playing well, and who is at risk? |
| **Ownership** | Is this player worth owning, given who else owns them and where I sit? |
| **Club Blocks** | Who should I buy? |

Fixtures and Club Blocks are scored by **Fixture Score**, a 0–10 measure of how
good a run of fixtures is, where 6.0 is an average run and higher is better. It
handles blank and double gameweeks without special-casing. The full definition
and the reasoning behind it are in section 6 of the requirements.

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000> and enter a manager ID, or go straight to a
squad:

```
http://localhost:3000/?id=2695180
```

Your own manager ID is in the address bar on the FPL site when you open your
Points tab: `/entry/2695180/event/2` means your ID is `2695180`.

```bash
npm run build   # production build
npm run lint    # eslint
npx tsc --noEmit  # typecheck
```

## URL parameters

Everything the app displays is addressable. `?id=` alone lands on the Fixtures
view at a five-gameweek horizon.

| Parameter | Values | Default |
|---|---|---|
| `id` | Manager ID | none — shows the ID entry form |
| `view` | `fixtures`, `form`, `ownership`, `clubs` | `fixtures` |
| `horizon` | 1 to the gameweeks remaining | `5` |
| `sort` | Club Blocks order: `score`/`club`/`owned`, each `-asc` or `-desc` | `score-desc` |
| `league` | League ID for the Ownership comparison | none — global |
| `rival` | Manager ID for the Ownership comparison | none — global |

Invalid values fall back to the default rather than erroring.

## How it is put together

```
app/
  page.tsx           the matrix: reads the URL, picks a view
  components/        one table per view, plus the shared controls
  api/               route handlers over the FPL API
lib/
  fpl/               the only code that talks to FPL
  format.ts          price, rank and points formatting
docs/                the requirements, which are the source of truth
```

- **Next.js App Router on Vercel**, targeting zero running cost: no database,
  no paid APIs, no AI calls.
- **Almost entirely server-rendered.** The horizon control is the only Client
  Component, and it still works without JavaScript.
- **`lib/fpl` is the only code that talks to FPL.** The API sends no CORS
  headers, so the browser can never call it directly.
- **Caching is what keeps it free**, and keeps load off FPL's servers:
  bootstrap 1 hour, fixtures 24 hours, a manager's picks until the next
  deadline.

## Data

All data comes from the undocumented public FPL API. No key, no cost. It is
undocumented, so it changes without warning: response shapes shift over the
summer, and the API goes down around gameweek deadlines and through the
off-season. The constraints that have actually bitten are listed in section 5.4
of the requirements, and are worth reading before changing anything in
`lib/fpl`.

## Documentation

- **[docs/FPL-Squad-Matrix-v1-Requirements.md](docs/FPL-Squad-Matrix-v1-Requirements.md)**
  — the source of truth. What each view does and why, the Fixture Score
  definition, the API constraints, and the decisions taken along the way with
  their reasoning.
- **[CLAUDE.md](CLAUDE.md)** — the working notes: conventions, the traps that
  cost time, and what to read before touching a given area.

## Status

v1 is feature complete: all seven build steps are done. There is no automated
test suite; section 11 of the requirements lists that and the other known risks.
Ideas deliberately held back for v2 are in section 10.
