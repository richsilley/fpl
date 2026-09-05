import type { Squad, SquadPlayer } from './squad'
import type { FplBootstrap, FplElement } from './types'

/**
 * Scratch squad editing (section 7.7): modelling transfers that have not been
 * made.
 *
 * Not `server-only`: pure arithmetic over data the caller already fetched.
 *
 * ## The URL holds a diff, not a squad
 *
 * `?out=427,318&in=351,290` — two positionally paired lists. The base fifteen
 * still load from FPL on every request, so the scratch squad stays current:
 * prices, form and availability keep updating underneath the changes, and a
 * link shared today still shows today's data rather than a snapshot of
 * whenever it was made.
 *
 * Storing the resulting squad instead would have frozen it, and would have put
 * fifteen IDs in every URL to express what is usually a single move.
 *
 * ## Nothing here validates
 *
 * Section 7.7 is explicit that this is a planning surface. A squad part-way
 * through funding a move is over budget, and a squad about to shed a defender
 * may briefly hold four from one club. Both are legitimate intermediate
 * states, and FPL itself rejects an invalid *final* squad, so there is no need
 * to reject one here. The job is to make problems impossible to miss, which is
 * what `ScratchWarnings` is for, not impossible to create.
 */

/**
 * The FPL squad rule the warnings surface.
 *
 * Defined here rather than in `clubs.ts`, which is `server-only`: this module
 * has to stay importable from both sides, and a single shared constant is
 * better than the same 3 written twice. `clubs.ts` re-exports it, so the Club
 * Blocks view still reads it from where it always did.
 */
export const MAX_PLAYERS_PER_CLUB = 3

/** One modelled transfer. Both are player IDs. */
export type ScratchPair = { out: number; in: number }

/**
 * A pair the base squad no longer supports.
 *
 * After a gameweek rolls over, or after a real transfer, a saved link can name
 * a player who has left the squad. Section 7.7: drop the pair and say so,
 * never fail — the rest of the plan is still worth showing.
 */
export type DroppedPair = ScratchPair & {
  reason: 'not-in-squad' | 'unknown-player' | 'already-owned'
}

export type ScratchBudget = {
  /** Bank at the last deadline, in tenths. */
  bank: number
  /** Squad value at the last deadline, in tenths. */
  squadValue: number
  /** Current prices of the players moved out, in tenths. */
  sold: number
  /** Current prices of the players moved in, in tenths. */
  bought: number
  /** `bank + sold - bought`, in tenths. Negative means over budget. */
  available: number
}

export type ScratchWarnings = {
  /** How far over budget, in tenths. Zero when within it. */
  overBudget: number
  /** Clubs above the three-per-club limit, with their counts. */
  clubsOverLimit: { teamId: number; clubName: string; count: number }[]
  /** Team IDs of those clubs, for tinting every row that belongs to one. */
  overLimitTeamIds: Set<number>
}

export type ScratchSquad = {
  squad: Squad
  /** Pairs actually applied, oldest first. */
  applied: ScratchPair[]
  /** Pairs the base squad could not support. See `DroppedPair`. */
  dropped: DroppedPair[]
  budget: ScratchBudget
  warnings: ScratchWarnings
}

/** True when any change is being modelled. */
export function hasScratch(pairs: ScratchPair[]): boolean {
  return pairs.length > 0
}

/**
 * Reads the paired `out` and `in` parameters.
 *
 * Anything malformed is dropped rather than raised, per section 8.2: a
 * hand-edited or truncated URL should degrade to fewer changes, never to an
 * error page. Unpaired trailing IDs are ignored for the same reason, and a
 * pair naming the same player twice is a no-op worth discarding.
 */
export function parseScratch(
  out: string | undefined,
  incoming: string | undefined
): ScratchPair[] {
  const outIds = parseIdList(out)
  const inIds = parseIdList(incoming)
  const pairs: ScratchPair[] = []

  for (let index = 0; index < Math.min(outIds.length, inIds.length); index++) {
    if (outIds[index] !== inIds[index]) {
      pairs.push({ out: outIds[index], in: inIds[index] })
    }
  }

  return pairs
}

function parseIdList(value: string | undefined): number[] {
  if (!value) {
    return []
  }
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
}

/** The two URL parameters for a set of pairs, or nulls to clear them. */
export function serialiseScratch(pairs: ScratchPair[]): {
  out: string | null
  in: string | null
} {
  if (pairs.length === 0) {
    return { out: null, in: null }
  }
  return {
    out: pairs.map((pair) => pair.out).join(','),
    in: pairs.map((pair) => pair.in).join(','),
  }
}

/** Adds a move, replacing any existing move that already sold that player. */
export function withSwap(
  pairs: ScratchPair[],
  outId: number,
  inId: number
): ScratchPair[] {
  // Swapping the same slot twice is a correction, not a second transfer, so
  // the earlier pair is replaced rather than stacked. Without this, moving A
  // to B and then B to C would leave a pair naming a player who is no longer
  // in the squad, which the loader would then have to drop.
  const rewritten = pairs.map((pair) =>
    pair.in === outId ? { out: pair.out, in: inId } : pair
  )
  const corrected = rewritten.some((pair) => pair.in === inId)

  const next = corrected ? rewritten : [...pairs, { out: outId, in: inId }]

  // A move that lands back on the original player is not a change at all.
  return next.filter((pair) => pair.out !== pair.in)
}

/** Removes the most recent pair. Section 7.7's undo. */
export function withoutLastSwap(pairs: ScratchPair[]): ScratchPair[] {
  return pairs.slice(0, -1)
}

/**
 * Applies the diff to the loaded squad.
 *
 * The incoming player takes the outgoing player's squad position and armband,
 * so the starting XI, the bench order and the captaincy all survive a swap.
 * That is what makes the scratch squad readable in every view without any of
 * them knowing it is a scratch squad at all.
 */
export function applyScratch(
  squad: Squad,
  pairs: ScratchPair[],
  bootstrap: FplBootstrap,
  toPlayer: (
    element: FplElement,
    slot: Pick<SquadPlayer, 'squadPosition' | 'isCaptain' | 'isViceCaptain'>
  ) => SquadPlayer
): ScratchSquad {
  const players = [...squad.startingXi, ...squad.bench]
  const bySlot = new Map(players.map((player) => [player.id, player]))
  const elements = new Map(
    bootstrap.elements.map((element) => [element.id, element])
  )

  const applied: ScratchPair[] = []
  const dropped: DroppedPair[] = []
  let sold = 0
  let bought = 0

  for (const pair of pairs) {
    const outgoing = bySlot.get(pair.out)
    const incoming = elements.get(pair.in)

    // Section 7.7: a stale pair is dropped, never fatal. The most common cause
    // is a link saved before a gameweek rolled over.
    if (!outgoing) {
      dropped.push({ ...pair, reason: 'not-in-squad' })
      continue
    }
    if (!incoming) {
      dropped.push({ ...pair, reason: 'unknown-player' })
      continue
    }
    // A squad cannot hold the same player twice, and unlike being over budget
    // or over the club limit there is no further transfer that makes it legal,
    // so this is not a legitimate intermediate state — it is a fifteen-player
    // squad quietly becoming fourteen. The panel does not offer these, so this
    // only catches a hand-edited URL.
    if (bySlot.has(pair.in)) {
      dropped.push({ ...pair, reason: 'already-owned' })
      continue
    }

    sold += outgoing.price
    bought += incoming.now_cost

    bySlot.delete(pair.out)
    bySlot.set(
      pair.in,
      toPlayer(incoming, {
        squadPosition: outgoing.squadPosition,
        isCaptain: outgoing.isCaptain,
        isViceCaptain: outgoing.isViceCaptain,
      })
    )
    applied.push(pair)
  }

  const next = [...bySlot.values()].sort(
    (a, b) => a.squadPosition - b.squadPosition
  )

  const budget: ScratchBudget = {
    bank: squad.manager.bank,
    squadValue: squad.manager.squadValue,
    sold,
    bought,
    available: squad.manager.bank + sold - bought,
  }

  return {
    squad: {
      manager: squad.manager,
      startingXi: next.filter((player) => player.squadPosition <= 11),
      bench: next.filter((player) => player.squadPosition > 11),
    },
    applied,
    dropped,
    budget,
    warnings: warningsFor(next, budget),
  }
}

/**
 * What is wrong with the squad as it stands.
 *
 * Both of these are reported for the squad on screen whether or not anything
 * has been changed, since a real squad cannot breach either rule and so will
 * simply produce none.
 */
function warningsFor(
  players: SquadPlayer[],
  budget: ScratchBudget
): ScratchWarnings {
  const byClub = new Map<number, SquadPlayer[]>()
  for (const player of players) {
    const existing = byClub.get(player.teamId) ?? []
    existing.push(player)
    byClub.set(player.teamId, existing)
  }

  const clubsOverLimit = [...byClub.entries()]
    .filter(([, owned]) => owned.length > MAX_PLAYERS_PER_CLUB)
    .map(([teamId, owned]) => ({
      teamId,
      clubName: owned[0].clubName,
      count: owned.length,
    }))
    .sort((a, b) => b.count - a.count || a.clubName.localeCompare(b.clubName))

  return {
    overBudget: budget.available < 0 ? -budget.available : 0,
    clubsOverLimit,
    // Every row of an offending club is tinted, not just the newest arrival:
    // any of them could be the one the reader decides to drop, so singling out
    // the most recent would be the app guessing at their plan.
    overLimitTeamIds: new Set(clubsOverLimit.map((club) => club.teamId)),
  }
}
