import 'server-only'

import { unstable_cache } from 'next/cache'

import {
  CACHE_SECONDS,
  CACHE_TAGS,
  MIN_PICKS_CACHE_SECONDS,
  SEASON_END_BUFFER_SECONDS,
  SEASON_OVER_PICKS_CACHE_SECONDS,
  SETTLED_PICKS_CACHE_SECONDS,
} from './config'
import { fplFetch } from './client'
import { FplApiError } from './errors'
import { projectBootstrap } from './projection'
import type {
  FplBootstrap,
  FplBootstrapRaw,
  FplEntry,
  FplEvent,
  FplFixture,
  FplLeagueStandings,
  FplPicks,
} from './types'

/**
 * The five endpoints from section 5, each with the cache duration from the
 * table in section 8.3.
 */

/**
 * All players, teams, gameweeks, prices, ownership, form, xG, xA, injuries,
 * trimmed to the fields v1 reads. See ./projection.ts.
 *
 * ## Why this one endpoint is cached differently
 *
 * The other three go through the `fetch` Data Cache, which stores the raw HTTP
 * response. That is not available here: a cache entry is capped at 2MB and the
 * upstream payload serialises to about 2.31MB, so it was silently rejected and
 * every call reached the FPL API. Projecting the response does not by itself
 * fix that, because the cap applies to the upstream body, not to what we
 * return from it.
 *
 * So the fetch skips the Data Cache and the projection is cached instead.
 * `unstable_cache` stores `JSON.stringify(result)`, so the cap now applies to
 * the trimmed value, which is far inside it.
 *
 * It carries a deprecation notice in favour of `use cache`, and that is not a
 * mistake here: `use cache` defaults to per-instance memory that does not
 * survive on Vercel's serverless runtime, so it would not actually keep load
 * off FPL's servers. Next's own docs still point at `unstable_cache` for
 * values that must persist across instances and deployments without a paid
 * cache handler. Revisit if section 8.4's zero-cost constraint is ever relaxed
 * enough to add one, at which point this becomes `use cache: remote`.
 */
export const getBootstrap: () => Promise<FplBootstrap> = unstable_cache(
  async () => {
    const raw = await fplFetch<FplBootstrapRaw>('/bootstrap-static/', {
      revalidate: false,
    })
    return projectBootstrap(raw)
  },
  ['fpl-bootstrap'],
  {
    revalidate: CACHE_SECONDS.BOOTSTRAP,
    tags: [CACHE_TAGS.BOOTSTRAP],
  }
)

/** All 380 season fixtures with FDR for both sides. */
export function getFixtures(): Promise<FplFixture[]> {
  return fplFetch<FplFixture[]>('/fixtures/', {
    revalidate: CACHE_SECONDS.FIXTURES,
    tags: [CACHE_TAGS.FIXTURES],
  })
}

/**
 * A manager's fifteen players for a gameweek.
 *
 * ## Two cache lifetimes, decided per gameweek
 *
 * The URL carries both the manager and the gameweek, so the Data Cache is
 * already keyed by the pair. What varies is how long an entry is good for, and
 * the answer is not the same for every gameweek.
 *
 * **The picks are immutable the moment the deadline passes.** The rest of the
 * payload is not: `entry_history` carries the gameweek's points and rank, and
 * those keep moving while matches are played and again when bonus is applied.
 * Caching the whole response for the season on the strength of the picks alone
 * would freeze a score at whatever it read mid-match.
 *
 * So the lifetime follows `data_checked`, which is FPL's own flag for "this
 * gameweek is final, bonus included":
 *
 * - **Settled** (`finished && data_checked`) — nothing in the response can
 *   change again, so it is held to the end of the season.
 * - **Anything else** — the current gameweek, or a finished one still waiting
 *   on bonus — is held only until the next deadline, as before.
 *
 * That is the whole win: in a 38-gameweek season all but the newest gameweek
 * is settled, and a league's fifty squads for a past gameweek are fetched once
 * rather than once a week.
 *
 * Takes `events` rather than loading bootstrap itself so a caller that has
 * already resolved the gameweek does not look it up twice.
 */
export async function getPicks(
  managerId: number,
  gameweek: number,
  events: FplEvent[]
): Promise<FplPicks> {
  assertGameweekIsPlayable(events, gameweek)

  try {
    return await fplFetch<FplPicks>(
      `/entry/${managerId}/event/${gameweek}/picks/`,
      {
        revalidate: picksCacheSeconds(events, gameweek),
        tags: [CACHE_TAGS.PICKS],
      }
    )
  } catch (error) {
    // The API answers 404 both for a manager that does not exist and for one
    // that existed but had not entered this gameweek. Say which we mean.
    if (error instanceof FplApiError && error.kind === 'not_found') {
      throw new FplApiError(
        'not_found',
        `No squad found for manager ${managerId} in gameweek ${gameweek}. Check the manager ID.`,
        { cause: error, upstreamStatus: error.upstreamStatus }
      )
    }
    throw error
  }
}

/**
 * A manager's account summary.
 *
 * Fetched for the manager name and team name in the section 7.1 header, which
 * the `picks/` payload does not carry. Rank and gameweek points come from the
 * picks instead, so they belong to the gameweek on screen.
 */
export async function getEntry(managerId: number): Promise<FplEntry> {
  try {
    return await fplFetch<FplEntry>(`/entry/${managerId}/`, {
      revalidate: CACHE_SECONDS.ENTRY,
      tags: [CACHE_TAGS.ENTRY],
    })
  } catch (error) {
    if (error instanceof FplApiError && error.kind === 'not_found') {
      throw new FplApiError(
        'not_found',
        `No FPL manager found with ID ${managerId}.`,
        { cause: error, upstreamStatus: error.upstreamStatus }
      )
    }
    throw error
  }
}

/**
 * Manager IDs of everyone in a classic league, 50 per page by rank.
 *
 * Section 7.4 caps a mini-league comparison at the top 50, which is exactly
 * page 1. `standings.has_next` tells the caller a larger league needs the
 * top-50-only notice.
 */
export async function getLeagueStandings(
  leagueId: number,
  page = 1
): Promise<FplLeagueStandings> {
  try {
    return await fplFetch<FplLeagueStandings>(
      `/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
      {
        revalidate: CACHE_SECONDS.LEAGUE_STANDINGS,
        tags: [CACHE_TAGS.LEAGUE],
      }
    )
  } catch (error) {
    if (error instanceof FplApiError && error.kind === 'not_found') {
      throw new FplApiError(
        'not_found',
        `No classic league found with ID ${leagueId}.`,
        { cause: error, upstreamStatus: error.upstreamStatus }
      )
    }
    throw error
  }
}

/**
 * The most recent gameweek whose deadline has passed, which is the one
 * section 7.1 loads a squad for.
 *
 * The API's `is_current` event is exactly that: it advances at each deadline,
 * not when the gameweek finishes. Before the first deadline of the season no
 * event is current and there is nothing to load.
 */
export function currentGameweek(events: FplEvent[]): number {
  const current = events.find((event) => event.is_current)
  if (!current) {
    throw new FplApiError(
      'picks_not_yet_available',
      'The season has not started yet, so there are no squads to load.'
    )
  }
  return current.id
}

/**
 * Constraint 3 (section 5): `picks/` only returns data for gameweeks whose
 * deadline has passed. Checked before the call so a pre-deadline request gets
 * a specific error instead of the API's generic 404, which would otherwise be
 * indistinguishable from a bad manager ID.
 */
function assertGameweekIsPlayable(events: FplEvent[], gameweek: number): void {
  const event = events.find((candidate) => candidate.id === gameweek)

  if (!event) {
    throw new FplApiError('not_found', `Gameweek ${gameweek} does not exist.`)
  }

  if (nowInSeconds() < event.deadline_time_epoch) {
    throw new FplApiError(
      'picks_not_yet_available',
      `Squads for gameweek ${gameweek} are private until the deadline on ${event.deadline_time}.`
    )
  }
}

/**
 * How long one gameweek's picks stay cacheable.
 *
 * A gameweek FPL has marked `data_checked` is final — picks, points, rank and
 * bonus all settled — so the response is good until the season rolls over and
 * the same URL starts meaning next season's gameweek 3. Everything else is
 * still moving and gets the short lifetime.
 *
 * A gameweek missing from `events` is treated as unsettled. The caller has
 * already rejected unknown gameweeks, so this only guards against bootstrap
 * being older than the gameweek being asked for.
 */
export function picksCacheSeconds(
  events: FplEvent[],
  gameweek: number
): number {
  const event = events.find((candidate) => candidate.id === gameweek)
  if (event?.finished && event.data_checked) {
    return secondsUntilSeasonEnd(events)
  }
  return secondsUntilNextDeadline(events)
}

/**
 * Seconds until this season's data stops being this season's.
 *
 * Measured from the last deadline plus a buffer, because that final gameweek
 * still has to be played and scored after its deadline passes, and nothing in
 * the payload says "the season is over" more directly.
 *
 * Floored at the short duration so a season already past its end never
 * produces a zero or negative lifetime, which would disable caching entirely
 * at exactly the moment traffic is cheapest to serve.
 */
export function secondsUntilSeasonEnd(events: FplEvent[]): number {
  const last = events[events.length - 1]
  if (!last) {
    return SETTLED_PICKS_CACHE_SECONDS
  }

  const remaining =
    last.deadline_time_epoch + SEASON_END_BUFFER_SECONDS - nowInSeconds()
  return Math.max(MIN_PICKS_CACHE_SECONDS, remaining)
}

/**
 * Seconds until the next deadline, which is when a manager's picks can next
 * change. Falls back to a day once the season is over and no event is next.
 *
 * Bootstrap is itself cached for an hour, so just after a deadline this can
 * still see the deadline that has just passed and return a value at or below
 * the floor. That only means picks are cached for a minute rather than a
 * week, and it corrects itself when bootstrap revalidates.
 */
export function secondsUntilNextDeadline(events: FplEvent[]): number {
  const next = events.find((event) => event.is_next)
  if (!next) {
    return SEASON_OVER_PICKS_CACHE_SECONDS
  }

  const remaining = next.deadline_time_epoch - nowInSeconds()
  return Math.max(MIN_PICKS_CACHE_SECONDS, remaining)
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
