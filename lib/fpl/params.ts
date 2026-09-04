/**
 * URL state (section 8.2): which view, which horizon, which sort.
 *
 * Not `server-only`. The horizon control is a Client Component and builds
 * links with `buildHref`, so this has to be importable from both sides.
 *
 * Section 8.2: "Invalid parameter values fall back to the default rather than
 * erroring." Every parser here does that.
 */

import { DEFAULT_HORIZON, type Horizon } from './horizon'

/** The four views in section 8.2's parameter table. */
export const VIEWS = ['fixtures', 'form', 'ownership', 'clubs'] as const
export type ViewId = (typeof VIEWS)[number]

/**
 * Section 8.2: "`?id=1234567` alone must land on the fixtures view at a
 * 5-gameweek horizon."
 */
export const DEFAULT_VIEW: ViewId = 'fixtures'

/**
 * Views that exist. All four are now built, though Ownership currently offers
 * only the global reference population; its league and rival modes are the
 * remaining build step.
 *
 * Ordered so the three fifteen-row views sit together and the club-row
 * exception (section 4) sits at the end.
 */
export const BUILT_VIEWS = [
  'fixtures',
  'form',
  'ownership',
  'clubs',
] as const satisfies readonly ViewId[]

/** Views whose columns are driven by the horizon (sections 7.2, 7.5 and 7.6). */
export const HORIZON_VIEWS: readonly ViewId[] = ['fixtures', 'clubs']

export function usesHorizon(view: ViewId): boolean {
  return HORIZON_VIEWS.includes(view)
}

export const VIEW_LABELS: Record<ViewId, string> = {
  fixtures: 'Fixtures',
  form: 'Form',
  ownership: 'Ownership',
  clubs: 'Club Blocks',
}

export function parseView(value: string | undefined): ViewId {
  return (BUILT_VIEWS as readonly string[]).includes(value ?? '')
    ? (value as ViewId)
    : DEFAULT_VIEW
}

/**
 * Club Blocks sort (section 7.5, "sortable, highest score first").
 *
 * Field and direction share one parameter so a sorted table is one link, and
 * clicking the active column flips it.
 */
export const CLUB_SORTS = [
  'score-desc',
  'score-asc',
  'club-asc',
  'club-desc',
  'owned-desc',
  'owned-asc',
] as const
export type ClubSort = (typeof CLUB_SORTS)[number]

/** Section 7.5: highest score first. */
export const DEFAULT_CLUB_SORT: ClubSort = 'score-desc'

export function parseClubSort(value: string | undefined): ClubSort {
  return (CLUB_SORTS as readonly string[]).includes(value ?? '')
    ? (value as ClubSort)
    : DEFAULT_CLUB_SORT
}

export type ClubSortField = 'score' | 'club' | 'owned'

export function splitClubSort(sort: ClubSort): {
  field: ClubSortField
  descending: boolean
} {
  const [field, direction] = sort.split('-')
  return { field: field as ClubSortField, descending: direction === 'desc' }
}

/** The direction a column sorts on first: most useful, not always ascending. */
const FIRST_DIRECTION: Record<ClubSortField, 'asc' | 'desc'> = {
  score: 'desc',
  owned: 'desc',
  club: 'asc',
}

/**
 * What clicking a column header should sort by: flip the direction if that
 * column is already active, otherwise start with its natural direction.
 */
export function nextClubSort(
  field: ClubSortField,
  current: ClubSort
): ClubSort {
  const active = splitClubSort(current)
  if (active.field !== field) {
    return `${field}-${FIRST_DIRECTION[field]}` as ClubSort
  }
  return `${field}-${active.descending ? 'asc' : 'desc'}` as ClubSort
}

/**
 * Section 8.2: `league` selects the mini-league population, and `rival` its
 * single-manager counterpart. Neither present means global mode.
 *
 * A URL carrying both is ambiguous, so `league` wins and `rival` is ignored.
 * The mode selector always sets one and clears the other, so this only ever
 * arises from a hand-edited URL.
 */
export function ownershipModeOf(
  league: string | undefined,
  rival: string | undefined
): 'global' | 'league' | 'rival' {
  if (league) return 'league'
  if (rival) return 'rival'
  return 'global'
}

/** A manager or league ID from the URL. Returns null for anything invalid. */
export function parseEntityId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export type AppState = {
  id: string
  view?: ViewId
  horizon?: Horizon
  sort?: ClubSort
  /** Mini-league population for the Ownership view (section 7.4). */
  league?: string | null
  /** Single-rival population for the Ownership view (section 7.4). */
  rival?: string | null
}

/**
 * Builds a URL for a piece of state, leaving out anything at its default.
 *
 * Section 8.2 blesses the bare `?id=` form, so omitting defaults keeps shared
 * links short without changing what they render.
 */
export function buildHref({
  id,
  view,
  horizon,
  sort,
  league,
  rival,
}: AppState): string {
  const params = new URLSearchParams()
  params.set('id', id)
  if (view && view !== DEFAULT_VIEW) {
    params.set('view', view)
  }
  if (horizon !== undefined && horizon !== DEFAULT_HORIZON) {
    params.set('horizon', String(horizon))
  }
  if (sort && sort !== DEFAULT_CLUB_SORT) {
    params.set('sort', sort)
  }
  // Explicit null clears the parameter, which is how the mode selector
  // switches populations without leaving the previous one in the URL.
  if (league) {
    params.set('league', league)
  }
  if (rival) {
    params.set('rival', rival)
  }
  return `/?${params.toString()}`
}
