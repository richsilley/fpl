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
 * The two are **not** mutually exclusive, and `rival` wins when both are set.
 * A rival is normally picked from a league's own manager list, so the pair
 * reads as "compare me against this manager, chosen from this league": `rival`
 * is the population, `league` is where the picker got its options. Dropping the
 * league on selection would make the dropdown vanish the moment it was used.
 *
 * `league` alone is still league mode, so nothing about the league links
 * changes; only a URL with both behaves differently from before.
 */
export function ownershipModeOf(
  league: string | undefined,
  rival: string | undefined
): 'global' | 'league' | 'rival' {
  if (rival) return 'rival'
  if (league) return 'league'
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

/**
 * Form view sort (section 7.3).
 *
 * Shares the `sort` parameter with Club Blocks. The two vocabularies do not
 * overlap, and each view falls back to its own default when it sees a value it
 * does not recognise, which section 8.2 already requires. The upshot is that
 * leaving Form sorted, visiting Club Blocks and coming back restores the Form
 * sort, because the parameter rides through untouched.
 */
export type FormSortField =
  | 'squad'
  | 'price'
  | 'gw'
  | 'season'
  | 'form'
  | 'points'
  | 'ppg'
  | 'mins'
  | 'xgi'
  | 'defcon'

/** Squad order, the default: starting XI then bench, as section 7.1 loads it. */
export const DEFAULT_FORM_SORT = 'squad' as const

export type FormSort =
  'squad' | `${Exclude<FormSortField, 'squad'>}-${'asc' | 'desc'}`

const SORTABLE_FORM_FIELDS: Exclude<FormSortField, 'squad'>[] = [
  'price',
  'gw',
  'season',
  'form',
  'points',
  'ppg',
  'mins',
  'xgi',
  'defcon',
]

export function parseFormSort(value: string | undefined): FormSort {
  if (value === 'squad') {
    return 'squad'
  }
  const [field, direction] = (value ?? '').split('-')
  const known =
    SORTABLE_FORM_FIELDS.includes(field as Exclude<FormSortField, 'squad'>) &&
    (direction === 'asc' || direction === 'desc')
  return known ? (value as FormSort) : DEFAULT_FORM_SORT
}

export function splitFormSort(sort: FormSort): {
  field: FormSortField
  descending: boolean
} {
  if (sort === 'squad') {
    return { field: 'squad', descending: false }
  }
  const [field, direction] = sort.split('-')
  return { field: field as FormSortField, descending: direction === 'desc' }
}

/**
 * What clicking a header should sort by.
 *
 * Numeric columns open descending, because "who has the most" is the question
 * being asked of every one of them, and clicking the active column reverses.
 */
export function nextFormSort(
  field: FormSortField,
  current: FormSort
): FormSort {
  if (field === 'squad') {
    return 'squad'
  }
  const active = splitFormSort(current)
  if (active.field !== field) {
    return `${field}-desc`
  }
  return `${field}-${active.descending ? 'asc' : 'desc'}`
}

/** Either view's sort vocabulary. They share one parameter; see `parseFormSort`. */
export type AnySort = ClubSort | FormSort

export type AppState = {
  id: string
  view?: ViewId
  horizon?: Horizon
  /**
   * Carried as written. A value one view does not understand still rides
   * through, so leaving Form sorted and returning restores it (see
   * `parseFormSort`). Each view parses it in its own vocabulary.
   */
  sort?: string | null
  /** Mini-league population for the Ownership view (section 7.4). */
  league?: string | null
  /** Single-rival population for the Ownership view (section 7.4). */
  rival?: string | null
  /**
   * Manager whose squad is on screen, when it is not the one in `id`.
   *
   * `id` stays the user's own team throughout, which is what makes reverting a
   * single link and keeps the league list in the picker theirs rather than the
   * borrowed squad's.
   */
  as?: string | null
  /** Which league the view-as picker is listing. See `as`. */
  asLeague?: string | null
}

/**
 * The parameters every control passes through untouched.
 *
 * Section 8.2 requires each control to carry the whole state, or changing the
 * horizon silently drops the population you were comparing against. Threading
 * these one prop at a time worked at two and stopped scaling at four, and the
 * failure is silent: a forgotten prop does not break the build, it just loses
 * the parameter on one particular click. Passing them as one object means a
 * control cannot carry half of them.
 *
 * `view`, `horizon` and `sort` are deliberately *not* here: each is set by
 * some control, so they stay explicit at the call site.
 */
export type CarriedState = Pick<
  AppState,
  'league' | 'rival' | 'as' | 'asLeague'
>

/** Drops the view-as target, and the league list that fed it. */
export function withoutViewAs(carry: CarriedState): CarriedState {
  return { ...carry, as: null, asLeague: null }
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
  as,
  asLeague,
}: AppState): string {
  const params = new URLSearchParams()
  params.set('id', id)
  if (view && view !== DEFAULT_VIEW) {
    params.set('view', view)
  }
  if (horizon !== undefined && horizon !== DEFAULT_HORIZON) {
    params.set('horizon', String(horizon))
  }
  // Either view's default is omitted, so a table at rest has a clean URL
  // whichever view produced it.
  if (sort && sort !== DEFAULT_CLUB_SORT && sort !== DEFAULT_FORM_SORT) {
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
  if (as) {
    params.set('as', as)
  }
  if (asLeague) {
    params.set('asleague', asLeague)
  }
  return `/?${params.toString()}`
}

/**
 * The hidden fields a GET form needs to preserve state a `buildHref` link
 * would have carried.
 *
 * A form only submits its own controls, so anything not represented here is
 * dropped on submit. Values at their default are still written: harmless in a
 * form, and cheaper than teaching the caller which ones matter.
 */
export function carriedFields(
  state: AppState
): { name: string; value: string }[] {
  const href = buildHref(state)
  const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
  return [...params.entries()].map(([name, value]) => ({ name, value }))
}
