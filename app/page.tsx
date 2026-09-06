import { ClubBlocksTable } from '@/app/components/club-blocks-table'
import { ErrorNotice } from '@/app/components/error-notice'
import { FixturesLegend } from '@/app/components/fixtures-legend'
import { FixturesTable } from '@/app/components/fixtures-table'
import { FormLegend } from '@/app/components/form-legend'
import { FormTable } from '@/app/components/form-table'
import { HorizonSelector } from '@/app/components/horizon-selector'
import { Suspense } from 'react'

import Link from 'next/link'

import { ManagerIdForm } from '@/app/components/manager-id-form'
import { OwnershipModeSelector } from '@/app/components/ownership-mode-selector'
import { OwnershipTable } from '@/app/components/ownership-table'
import { AppMenu, MenuSection } from '@/app/components/app-menu'
import { Overlay } from '@/app/components/overlay'
import { RatingToggle } from '@/app/components/rating-toggle'
import { ReplacementPanel } from '@/app/components/replacement-panel'
import { ScratchStrip } from '@/app/components/scratch-strip'
import { SquadHeader } from '@/app/components/squad-header'
import { ViewAsSelector } from '@/app/components/view-as-selector'
import { ViewTabs } from '@/app/components/view-tabs'
import { buildClubBlocks } from '@/lib/fpl/clubs'
import { FplApiError } from '@/lib/fpl/errors'
import { parseHorizon, type Horizon } from '@/lib/fpl/fixtures'
import {
  buildHref,
  ownershipModeOf,
  parseClubSort,
  parseEntityId,
  parseFormSort,
  parsePanel,
  parseRating,
  parseView,
  usesHorizon,
  VIEW_LABELS,
  withoutViewAs,
  type CarriedState,
  type ClubSort,
  type RatingSource,
  type ViewId,
} from '@/lib/fpl/params'
import {
  compareOwnership,
  globalPopulation,
  leagueMembers,
  leaguePopulation,
  populationDirection,
  LEAGUE_MANAGER_CAP,
  referenceContext,
  rivalPopulation,
  type LeagueMember,
  type ReferenceMode,
  type ReferencePopulation,
} from '@/lib/fpl/reference'
import {
  buildReplacements,
  rankingFor,
  type Replacement,
} from '@/lib/fpl/replacements'
import {
  applyScratch,
  parseScratch,
  serialiseScratch,
  withSwap,
  withoutLastSwap,
  type ScratchPair,
  type ScratchSquad,
} from '@/lib/fpl/scratch'
import {
  loadManagerLeagues,
  squadPlayerFrom,
  type Squad,
  type SquadPlayer,
} from '@/lib/fpl/squad'
import { loadMatrixData, type MatrixData } from '@/lib/fpl/views'
import { getBootstrap } from '@/lib/fpl/api'

/**
 * The league population makes up to fifty `picks/` calls. They are cached for
 * the rest of the gameweek, so this ceiling is only reached the first time a
 * league is opened in a gameweek, but the default of ten seconds is not
 * enough for that first load.
 */
export const maxDuration = 60

/** The question each view answers, from sections 7.2 to 7.5. */
const VIEW_QUESTIONS: Record<ViewId, string> = {
  fixtures: 'Where are my fixture problems?',
  form: 'Who is playing well, and who is at risk?',
  ownership:
    'Is this player worth owning, given who else owns them and where I sit?',
  clubs: 'Who should I buy?',
}

/**
 * The matrix: fifteen player rows, with the columns changing per view
 * (section 4).
 *
 * A Server Component reading `?id=`, `?view=`, `?horizon=` and `?sort=`.
 * Section 8.2 puts state in the URL, so every control is a plain navigation
 * and a shared link reproduces the exact view. Invalid values fall back to
 * their defaults rather than erroring, so `?id=X` alone lands on the fixtures
 * view at a 5-gameweek horizon.
 *
 * Almost everything renders on the server. The only client JavaScript is the
 * horizon control, which needs it for the live preset highlight section 7.6
 * asks for, and which still works without it.
 *
 * On section 8.1, "all FPL API calls made in server-side route handlers, never
 * from the browser": this calls lib/fpl directly rather than fetching its own
 * /api routes over HTTP. The constraint that matters is constraint 1, that the
 * API sends no CORS headers and so cannot be called from a browser, and this
 * runs on the server. Going out through our own route handler would add a
 * network hop per render for nothing, since both paths share the same cache.
 */
export default async function Page({ searchParams }: PageProps<'/'>) {
  const params = await searchParams
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value

  // `?id=1&id=2` parses as an array. Take the first rather than failing.
  const managerId = first(params.id)?.trim()
  const view = parseView(first(params.view))
  const horizon = parseHorizon(first(params.horizon))
  const rawSort = first(params.sort)
  const sort = parseClubSort(rawSort)
  const leagueId = parseEntityId(first(params.league))
  const rivalId = parseEntityId(first(params.rival))
  const asId = parseEntityId(first(params.as))
  const asLeagueId = parseEntityId(first(params.asleague))
  const rating = parseRating(first(params.rating))
  // Section 7.7. A malformed pair is dropped rather than raised, so a
  // truncated link degrades to fewer changes and never to an error page.
  const scratchPairs = parseScratch(first(params.out), first(params.in))
  const swapFor = parseEntityId(first(params.swap))
  const dismissedStale = first(params.stale) === 'ok'
  const panel = parsePanel(first(params.panel))
  // An unparseable league or rival ID falls back to global rather than
  // erroring, per section 8.2.
  const ownershipMode = ownershipModeOf(
    leagueId === null ? undefined : String(leagueId),
    rivalId === null ? undefined : String(rivalId)
  )

  return (
    <main className="w-full flex-1 px-5 pb-10 pt-4 sm:px-8 lg:px-12">
      {/* Before a squad is loaded there is no header and no menu to put the
          form in, so it stays on the page. Once one is loaded, everything here
          moves into the menu and the views take the top of the page. */}
      {!managerId && (
        <div className="mx-auto w-full max-w-[1600px]">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            FPL Squad Matrix
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Load any manager&rsquo;s fifteen players, then switch the columns to
            answer a different question.
          </p>
          <div className="mt-4">
            <ManagerIdForm currentId={managerId} />
          </div>
        </div>
      )}

      <div className={managerId ? '' : 'mx-auto w-full max-w-[1600px] mt-8'}>
        {managerId ? (
          <MatrixSection
            managerId={managerId}
            view={view}
            horizon={horizon}
            sort={sort}
            rawSort={rawSort ?? null}
            ownershipMode={ownershipMode}
            leagueId={leagueId}
            rivalId={rivalId}
            asId={asId}
            asLeagueId={asLeagueId}
            rating={rating}
            scratchPairs={scratchPairs}
            swapFor={swapFor}
            dismissedStale={dismissedStale}
            panel={panel}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  )
}

async function MatrixSection({
  managerId,
  view,
  horizon,
  sort,
  rawSort,
  ownershipMode,
  leagueId,
  rivalId,
  asId,
  asLeagueId,
  rating,
  scratchPairs,
  swapFor,
  dismissedStale,
  panel,
}: {
  managerId: string
  view: ViewId
  horizon: Horizon
  sort: ClubSort
  /** The sort exactly as the URL had it, so carriers do not lose the other view's value. */
  rawSort: string | null
  ownershipMode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
  /** Manager being viewed as, when it is not the one in `id`. */
  asId: number | null
  /** League the view-as picker is listing. */
  asLeagueId: number | null
  /** Which fixture difficulty rating to score with (section 6.7). */
  rating: RatingSource
  /** Modelled transfers, oldest first (section 7.7). */
  scratchPairs: ScratchPair[]
  /** Squad player whose replacement panel is open, if any. */
  swapFor: number | null
  /** The stale-pair notice has been dismissed for this link. */
  dismissedStale: boolean
  /** Which overlay the URL asks for (section 7.8). */
  panel: 'menu' | 'population' | null
}) {
  const myId = parseManagerId(managerId)
  // Viewing as yourself is the same as not viewing as anyone. Collapsing it
  // here means the rest of the page has one question to ask, not two, and a
  // hand-edited `as=` holding your own ID cannot produce a "Back to my team"
  // button that goes nowhere.
  const viewedId = asId !== null && asId !== myId ? asId : null

  const carry: CarriedState = {
    league: leagueId === null ? null : String(leagueId),
    rival: rivalId === null ? null : String(rivalId),
    as: viewedId === null ? null : String(viewedId),
    asLeague: asLeagueId === null ? null : String(asLeagueId),
    rating,
    ...serialiseScratch(scratchPairs),
  }

  let data: MatrixData
  try {
    data = await loadMatrixData(viewedId ?? myId, horizon, rating)
  } catch (error) {
    const fplError =
      error instanceof FplApiError
        ? error
        : new FplApiError(
            'unavailable',
            'Something went wrong loading that squad.',
            { cause: error }
          )

    if (!(error instanceof FplApiError)) {
      console.error('[matrix] unexpected error', error)
    }

    return (
      <div className="space-y-4">
        <ErrorNotice kind={fplError.kind} message={fplError.message} />
        {/* A borrowed squad that will not load must not strand the reader on
            an error page with no way back to their own. */}
        {viewedId !== null && (
          <Link
            href={buildHref({
              id: managerId,
              view,
              horizon,
              sort: rawSort,
              ...withoutViewAs(carry),
            })}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-900"
          >
            <span aria-hidden>&larr;</span>
            Back to my team
          </Link>
        )}
      </div>
    )
  }

  // Cached, and already fetched inside `loadMatrixData`, so this is a cache
  // read rather than a second trip to FPL.
  const bootstrap = await getBootstrap()

  // Section 7.7: from here down, `view` is the squad with the modelled
  // transfers applied. No view knows it is looking at a scratch squad.
  const scratch = applyScratch(
    data.squad,
    scratchPairs,
    bootstrap,
    (element, slot) => squadPlayerFrom(element, slot, bootstrap)
  )
  const viewData: MatrixData = { ...data, squad: scratch.squad }
  const scratchPlayers = [...scratch.squad.startingXi, ...scratch.squad.bench]

  const base = { id: managerId, view, horizon: data.horizon, sort: rawSort }

  // Opening and closing the panel only ever changes `swap`; the plan and every
  // other parameter ride through untouched.
  const swapHref = (playerId: number) =>
    buildHref({ ...base, ...carry, swap: String(playerId) })
  const closePanelHref = buildHref({ ...base, ...carry })

  const resetHref = buildHref({
    ...base,
    ...carry,
    ...serialiseScratch([]),
    swap: null,
  })
  const undoHref = buildHref({
    ...base,
    ...carry,
    ...serialiseScratch(withoutLastSwap(scratch.applied)),
    swap: null,
  })
  // Dismissing the stale notice must not touch the plan: it only records that
  // the reader has seen it.
  const dismissStaleHref = buildHref({
    ...base,
    ...carry,
    ...serialiseScratch(scratch.applied),
  })

  // Overlays are pure URL state: opening one is a link and so is the backdrop
  // that closes it (section 7.8).
  const menuHref = buildHref({ ...base, ...carry, panel: 'menu' })
  const populationHref = buildHref({ ...base, ...carry, panel: 'population' })
  const closeOverlayHref = buildHref({ ...base, ...carry })
  const backToMyTeamHref = buildHref({ ...base, ...withoutViewAs(carry) })

  return (
    <div className="space-y-5">
      {/* One sticky stack, so the header and the scratch strip cannot overlap
          and both survive scrolling (sections 7.1 and 7.7). */}
      <div className="sticky top-0 z-40 -mx-5 -mt-4 mb-1 sm:-mx-8 lg:-mx-12">
        <SquadHeader
          manager={data.squad.manager}
          totalPlayers={data.totalPlayers}
          menuHref={menuHref}
          viewingAs={viewedId !== null}
          backHref={backToMyTeamHref}
        />
        <ScratchStrip
          scratch={scratch}
          resetHref={resetHref}
          undoHref={undoHref}
          dismissHref={`${dismissStaleHref}&stale=ok`}
          showDropped={!dismissedStale}
        />
      </div>

      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        {panel === 'menu' && (
          <AppMenu closeHref={closeOverlayHref}>
            <MenuSection title="Load a squad">
              <ManagerIdForm currentId={managerId} />
            </MenuSection>
            <MenuSection title="View as another manager">
              {/* Its own boundary: the league list is a cached call, and a slow
                one must not hold up the drawer that is already open. */}
              <Suspense
                key={`viewas-${asLeagueId ?? 'none'}-${viewedId ?? 'me'}`}
                fallback={<ViewAsPlaceholder />}
              >
                <ViewAsSection
                  managerId={managerId}
                  myId={myId}
                  viewedManager={viewedId === null ? null : data.squad.manager}
                  asLeagueId={asLeagueId}
                  view={view}
                  horizon={data.horizon}
                  sort={rawSort}
                  carry={carry}
                  panel={panel}
                />
              </Suspense>
            </MenuSection>
          </AppMenu>
        )}

        <ViewTabs
          managerId={managerId}
          view={view}
          horizon={data.horizon}
          sort={rawSort}
          carry={carry}
        />

        {swapFor !== null && view !== 'clubs' && (
          <ReplacementSection
            outgoing={
              scratchPlayers.find((player) => player.id === swapFor) ?? null
            }
            squad={scratchPlayers}
            data={viewData}
            bootstrap={bootstrap}
            currentView={view}
            rawSort={rawSort}
            ownershipMode={ownershipMode}
            leagueId={leagueId}
            rivalId={rivalId}
            myId={myId}
            totalPlayers={data.totalPlayers}
            scratch={scratch}
            base={base}
            carry={carry}
            closeHref={closePanelHref}
          />
        )}

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {VIEW_LABELS[view]}
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {VIEW_QUESTIONS[view]}
                {usesHorizon(view) &&
                  ` Gameweek ${data.startGameweek} onwards.`}
              </p>
            </div>
            {/* Only the two horizon-driven views get these. Showing them on the
              Form view would offer settings that change nothing there. Both
              parameters are still carried through, so switching back to
              Fixtures returns to the horizon and rating you left (7.6, 6.7).

              Both controls appear on both horizon views, so the two can never
              be scored differently in the same session.

              The applied horizon, not the requested one, so a clamped value
              shows what is actually on screen. Keyed on it so a navigation
              remounts the control and its input picks up the new value. */}
            {usesHorizon(view) && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
                <RatingToggle
                  managerId={managerId}
                  rating={rating}
                  view={view}
                  horizon={data.horizon}
                  sort={rawSort}
                  carry={carry}
                />
                <HorizonSelector
                  key={`${view}-${data.horizon}`}
                  managerId={managerId}
                  horizon={data.horizon}
                  maxHorizon={data.maxHorizon}
                  view={view}
                  sort={rawSort}
                  carry={carry}
                />
              </div>
            )}
          </div>

          {view === 'clubs' ? (
            <ClubBlocksTable
              blocks={buildClubBlocks({
                teams: data.teams,
                fixtures: data.fixtures,
                squad: viewData.squad,
                startGameweek: data.startGameweek,
                horizon: data.horizon,
                sort,
                teamStrength: data.teamStrength,
              })}
              managerId={managerId}
              horizon={data.horizon}
              startGameweek={data.startGameweek}
              sort={sort}
              carry={carry}
            />
          ) : view === 'form' ? (
            <FormTable
              squad={viewData.squad}
              managerId={managerId}
              sort={parseFormSort(rawSort ?? undefined)}
              horizon={data.horizon}
              carry={carry}
              swapHref={swapHref}
              overLimitTeamIds={scratch.warnings.overLimitTeamIds}
              matchesPlayed={data.matchesPlayed}
            />
          ) : view === 'ownership' ? (
            <>
              {/* Floating, so opening it does not push the table it
                describes down the page (section 7.8). The rival dropdown needs
                the league's manager list, one cached standings call, behind
                its own boundary so a slow fetch costs the dropdown alone. */}
              {panel === 'population' && (
                <Overlay closeHref={closeOverlayHref} label="Compare against">
                  <div className="max-h-[calc(100vh-6rem)] overflow-y-auto">
                    <Suspense
                      key={`selector-${leagueId ?? 'none'}`}
                      fallback={
                        <OwnershipModeSelector
                          managerId={managerId}
                          manager={data.squad.manager}
                          mode={ownershipMode}
                          leagueId={leagueId}
                          rivalId={rivalId}
                          horizon={data.horizon}
                          sort={sort}
                          members={null}
                          carry={carry}
                          closeHref={closeOverlayHref}
                        />
                      }
                    >
                      <ModeSelectorSection
                        managerId={managerId}
                        manager={data.squad.manager}
                        mode={ownershipMode}
                        leagueId={leagueId}
                        rivalId={rivalId}
                        horizon={data.horizon}
                        sort={sort}
                        carry={carry}
                        closeHref={closeOverlayHref}
                      />
                    </Suspense>
                  </div>
                </Overlay>
              )}
              {/* The league population is one picks call per manager, up to
                fifty, and a single call runs over a second. Streaming means
                the squad header, tabs and selector are on screen immediately
                rather than the page hanging on the fan-out. Everything is
                cached for the rest of the gameweek, so this only bites the
                first time a league is opened. */}
              <Suspense
                key={`${ownershipMode}-${leagueId ?? rivalId ?? 'global'}`}
                fallback={<OwnershipLoading mode={ownershipMode} />}
              >
                <OwnershipSection
                  squad={viewData.squad}
                  totalPlayers={data.totalPlayers}
                  mode={ownershipMode}
                  leagueId={leagueId}
                  rivalId={rivalId}
                  swapHref={swapHref}
                  overLimitTeamIds={scratch.warnings.overLimitTeamIds}
                  populationHref={populationHref}
                />
              </Suspense>
            </>
          ) : (
            <FixturesTable
              view={viewData}
              swapHref={swapHref}
              overLimitTeamIds={scratch.warnings.overLimitTeamIds}
            />
          )}

          {/* The legend explains fixture shading and the Fixture Score, neither
            of which the Form view shows. */}
          {usesHorizon(view) && <FixturesLegend rating={rating} />}
          {view === 'form' && <FormLegend />}
        </section>
      </div>
    </div>
  )
}

/**
 * The replacement panel for one squad player (section 7.7).
 *
 * Server side, because ranking every player in the position needs the whole
 * bootstrap and, on the Fixtures view, a Fixture Score per club over the
 * current horizon. Only the open panel is ever built, so this is one
 * position's worth of rows rather than fifteen panels nobody asked for.
 *
 * The ranking follows the reader: whatever column they have sorted, or the
 * view's own default. See `rankingFor`.
 */
async function ReplacementSection({
  outgoing,
  squad,
  data,
  bootstrap,
  currentView,
  rawSort,
  ownershipMode,
  leagueId,
  rivalId,
  myId,
  totalPlayers,
  scratch,
  base,
  carry,
  closeHref,
}: {
  /** Null when the URL names a player who is not in the squad. */
  outgoing: SquadPlayer | null
  squad: SquadPlayer[]
  data: MatrixData
  bootstrap: Awaited<ReturnType<typeof getBootstrap>>
  currentView: ViewId
  rawSort: string | null
  ownershipMode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
  myId: number
  totalPlayers: number
  scratch: ScratchSquad
  base: { id: string; view: ViewId; horizon: number; sort: string | null }
  carry: CarriedState
  closeHref: string
}) {
  // A hand-edited or stale `swap` names nobody. Rendering nothing is right:
  // the squad below is still correct and there is nothing to warn about.
  if (outgoing === null) {
    return null
  }

  // Only the Ownership view reads the direction, and only to decide which end
  // of the ownership scale helps. Elsewhere it would be a wasted call.
  const direction =
    currentView === 'ownership'
      ? await populationDirection({
          mode: ownershipMode,
          leagueId,
          rivalId,
          managerId: myId,
          overallRank: data.squad.manager.overallRank,
          totalPlayers,
        })
      : 'unknown'

  const ranking = rankingFor(
    currentView,
    parseFormSort(rawSort ?? undefined),
    data.horizon,
    direction
  )

  const replacements: (Replacement & { href: string })[] = buildReplacements({
    outgoing,
    squad,
    bootstrap,
    fixtures: data.fixtures,
    startGameweek: data.startGameweek,
    horizon: data.horizon,
    ranking,
    available: scratch.budget.available,
    overLimitTeamIds: scratch.warnings.overLimitTeamIds,
  }).map((row) => ({
    ...row,
    // Selecting is a plain navigation, so the swap itself needs no
    // JavaScript. The panel closes because `swap` is absent from the target.
    href: buildHref({
      ...base,
      ...carry,
      ...serialiseScratch(withSwap(scratch.applied, outgoing.id, row.id)),
    }),
  }))

  return (
    <Overlay closeHref={closeHref} label={`Replace ${outgoing.name}`}>
      <ReplacementPanel
        outgoingName={outgoing.name}
        outgoingClub={outgoing.club}
        outgoingPrice={outgoing.price}
        position={outgoing.position}
        rankingLabel={ranking.label}
        available={scratch.budget.available}
        replacements={replacements}
        closeHref={closeHref}
      />
    </Overlay>
  )
}

/**
 * The view-as picker, with the user's own leagues and the chosen league's
 * managers.
 *
 * The leagues have to come from the user's entry rather than from the squad on
 * screen: while a rival's squad is loaded, `data.squad.manager` is *theirs*,
 * and reading the list off it would quietly swap your leagues for the borrowed
 * manager's the moment you used the control. `getEntry` is cached, and when
 * you are viewing your own team this is the same call `loadSquad` just made.
 *
 * Neither fetch is worth an error panel. Losing the picker leaves every view
 * working, so a failure degrades to no picker rather than to no page.
 */
async function ViewAsSection({
  managerId,
  myId,
  viewedManager,
  asLeagueId,
  view,
  horizon,
  sort,
  carry,
  panel,
}: {
  managerId: string
  myId: number
  /** The borrowed squad's manager, or null when viewing your own. */
  viewedManager: Squad['manager'] | null
  asLeagueId: number | null
  view: ViewId
  horizon: Horizon
  sort: string | null
  carry: CarriedState
  /** Which overlay is open, so narrowing a choice does not close it. */
  panel: 'menu' | 'population' | null
}) {
  let leagues: Squad['manager']['leagues'] = []
  try {
    leagues = await loadManagerLeagues(myId)
  } catch (error) {
    console.error('[viewas] could not load leagues', error)
    return null
  }

  let members: LeagueMember[] | null = null
  if (asLeagueId !== null) {
    try {
      // Your own team is excluded: "view as" only means someone else.
      members = await leagueMembers(asLeagueId, myId)
    } catch (error) {
      console.error('[viewas] could not load league members', error)
    }
  }

  return (
    <ViewAsSelector
      managerId={managerId}
      leagues={leagues}
      members={members}
      viewingAs={
        viewedManager === null
          ? null
          : { id: viewedManager.id, teamName: viewedManager.teamName }
      }
      view={view}
      horizon={horizon}
      sort={sort}
      carry={carry}
      panel={panel}
    />
  )
}

/**
 * Holds the picker's height while its league list loads, so the tabs and table
 * below it do not jump once it arrives.
 */
function ViewAsPlaceholder() {
  return (
    <div
      aria-hidden
      className="h-[4.75rem] rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800"
    />
  )
}

/**
 * The population selector, with the selected league's managers loaded for the
 * rival dropdown.
 *
 * Costs no extra request: `leagueMembers` reads the same cached standings call
 * the league comparison makes. A failure here is not worth an error panel — the
 * mode links and both ID forms still work — so it falls back to the selector
 * without a dropdown.
 */
async function ModeSelectorSection({
  managerId,
  manager,
  mode,
  leagueId,
  rivalId,
  horizon,
  sort,
  carry,
  closeHref,
}: {
  managerId: string
  manager: Squad['manager']
  mode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
  horizon: Horizon
  sort: ClubSort
  carry: CarriedState
  closeHref: string
}) {
  let members: LeagueMember[] | null = null
  if (leagueId !== null) {
    try {
      members = await leagueMembers(leagueId, manager.id)
    } catch (error) {
      console.error('[ownership] could not load league members', error)
    }
  }

  return (
    <OwnershipModeSelector
      managerId={managerId}
      manager={manager}
      mode={mode}
      leagueId={leagueId}
      rivalId={rivalId}
      horizon={horizon}
      sort={sort}
      members={members}
      carry={carry}
      closeHref={closeHref}
    />
  )
}

/**
 * Builds the reference population and renders the Ownership table.
 *
 * Separated so it can sit behind its own `<Suspense>` boundary: the league
 * population is the one slow path in the app, and the rest of the page has no
 * reason to wait for it.
 */
async function OwnershipSection({
  squad,
  totalPlayers,
  mode,
  leagueId,
  rivalId,
  swapHref,
  overLimitTeamIds,
  populationHref,
}: {
  squad: Squad
  totalPlayers: number
  mode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
  swapHref: (playerId: number) => string
  overLimitTeamIds: Set<number>
  populationHref: string
}) {
  const players = [...squad.startingXi, ...squad.bench]

  let reference: ReferencePopulation
  let league: ReferencePopulation | null = null
  let rival: ReferencePopulation | null = null
  try {
    // A rival is picked out of a league and the league column stays beside
    // them (section 7.4), so both are built when both are selected. The league
    // fan-out is cached, and in rival mode it is usually already warm from
    // having chosen the rival there.
    const built = await Promise.all([
      leagueId === null
        ? null
        : buildPopulation({
            mode: 'league',
            players,
            squad,
            totalPlayers,
            leagueId,
            rivalId: null,
          }),
      rivalId === null
        ? null
        : buildPopulation({
            mode: 'rival',
            players,
            squad,
            totalPlayers,
            leagueId: null,
            rivalId,
          }),
    ])
    league = built[0]
    rival = built[1]
    reference =
      rival ??
      league ??
      (await buildPopulation({
        mode: 'global',
        players,
        squad,
        totalPlayers,
        leagueId: null,
        rivalId: null,
      }))
  } catch (error) {
    const fplError =
      error instanceof FplApiError
        ? error
        : new FplApiError(
            'unavailable',
            'Could not build the comparison population.',
            { cause: error }
          )

    if (!(error instanceof FplApiError)) {
      console.error('[ownership] unexpected error', error)
    }

    return <ErrorNotice kind={fplError.kind} message={fplError.message} />
  }

  // `compareOwnership` is still the one function section 7.4 asks for: called
  // once per population, and never asking which one it has.
  const active = compareOwnership(players, reference)
  const leagueRows = league ? compareOwnership(players, league) : null
  const rivalRows = rival ? compareOwnership(players, rival) : null

  return (
    <OwnershipTable
      rows={active.map((row, index) => ({
        player: row.player,
        globalPercent: row.globalPercent,
        leaguePercent: leagueRows ? leagueRows[index].referencePercent : null,
        rivalOwns: rivalRows ? rivalRows[index].referencePercent > 0 : null,
        difference: mode === 'global' ? null : row.difference,
      }))}
      reference={reference}
      teamName={squad.manager.teamName}
      leagueLabel={league?.label ?? null}
      rivalLabel={rival?.label ?? null}
      swapHref={swapHref}
      overLimitTeamIds={overLimitTeamIds}
      populationHref={populationHref}
    />
  )
}

async function buildPopulation({
  mode,
  players,
  squad,
  totalPlayers,
  leagueId,
  rivalId,
}: {
  mode: ReferenceMode
  players: Squad['startingXi']
  squad: Squad
  totalPlayers: number
  leagueId: number | null
  rivalId: number | null
}): Promise<ReferencePopulation> {
  if (mode === 'league' && leagueId !== null) {
    const { events } = await referenceContext()
    return leaguePopulation(
      leagueId,
      squad.manager.id,
      squad.manager.gameweek,
      events
    )
  }

  if (mode === 'rival' && rivalId !== null) {
    const { events } = await referenceContext()
    return rivalPopulation(
      rivalId,
      squad.manager.overallRank,
      squad.manager.gameweek,
      events
    )
  }

  return globalPopulation(
    new Map(players.map((player) => [player.id, player])),
    squad.manager.overallRank,
    totalPlayers
  )
}

function OwnershipLoading({ mode }: { mode: ReferenceMode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700"
    >
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {mode === 'league'
          ? `Loading up to ${LEAGUE_MANAGER_CAP} squads from the league…`
          : 'Loading the comparison…'}
      </p>
      {mode === 'league' && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          This takes a moment the first time. Squads are then cached for the
          rest of the gameweek.
        </p>
      )}
    </div>
  )
}

/**
 * Validates the id before it reaches the data layer, so a typo produces a
 * useful message instead of a pointless round trip to the FPL API.
 *
 * Mirrors `parseId` in lib/fpl/http.ts, which does the same job for the route
 * handlers. Kept separate because the wording here is aimed at a reader
 * looking at the page rather than at an API consumer.
 */
function parseManagerId(value: string): number {
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FplApiError('bad_request', `"${value}" is not a manager ID.`)
  }
  return parsed
}

function EmptyState() {
  return (
    <div className="max-w-3xl rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Enter a manager ID to load a squad.
      </p>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
        Yours is in the address bar on the FPL site when you open your Points
        tab, for example{' '}
        <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
          /entry/2695180/event/2
        </code>{' '}
        means your ID is 2695180.
      </p>
    </div>
  )
}
