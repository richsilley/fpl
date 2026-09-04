/**
 * Ownership (section 7.4), global mode.
 *
 * Not `server-only`: pure arithmetic over numbers already fetched.
 *
 * Section 7.4 describes three comparison populations sharing one calculation,
 * "one function with three inputs, not three features". This is the first
 * input, the global one, where the reference population is every FPL manager
 * and the ownership figure comes straight from `selected_by_percent`. The
 * league and rival populations are build steps 7 and 8 and change only the
 * denominator, not anything here.
 */

/**
 * How widely a player is owned.
 *
 * Bands rather than a raw percentage because the question in 7.4 is
 * comparative: 4% and 45% are different kinds of pick, not just different
 * numbers. Thresholds follow the way managers already talk about ownership.
 */
export type OwnershipBandId = 'differential' | 'low' | 'popular' | 'template'

export type OwnershipBand = {
  id: OwnershipBandId
  label: string
  /** Lower bound, inclusive, in percent. */
  min: number
  description: string
}

export const OWNERSHIP_BANDS: OwnershipBand[] = [
  {
    id: 'template',
    label: 'Template',
    min: 40,
    description: 'Owned by most managers. Not owning them is the bigger move',
  },
  {
    id: 'popular',
    label: 'Popular',
    min: 15,
    description: 'Widely owned, but far from universal',
  },
  {
    id: 'low',
    label: 'Low',
    min: 5,
    description: 'Owned by a minority',
  },
  {
    id: 'differential',
    label: 'Differential',
    min: 0,
    description: 'Rarely owned. Moves you away from the field, in either direction',
  },
]

export function ownershipBandOf(percent: number): OwnershipBand {
  return (
    OWNERSHIP_BANDS.find((band) => percent >= band.min) ??
    OWNERSHIP_BANDS[OWNERSHIP_BANDS.length - 1]
  )
}

/** `selected_by_percent` arrives as a string. Returns 0 for anything unparseable. */
export function parseOwnership(selectedByPercent: string): number {
  const parsed = Number.parseFloat(selectedByPercent)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Where the manager sits within the reference population (section 7.4's
 * direction flag).
 *
 * Rank within the population, whatever the population is: the overall rank out
 * of every entry in global mode, the league rank out of the compared managers
 * in league mode, one of two in rival mode. `unknown` covers a rank that
 * cannot be established, such as the start of the season before any is
 * published, or a league the manager is not a member of.
 */
export type FieldPosition = 'ahead' | 'behind' | 'unknown'

export type FieldStanding = {
  position: FieldPosition
  /** Rank within the population, and the size of it. */
  rank: number | null
  of: number
  /** Share of the population the manager is ahead of, 0 to 100. */
  betterThanPercent: number | null
  /** One line of guidance, shown above the table, never per player. */
  guidance: string
}

/**
 * How the population is described in the guidance line. Keeping the wording
 * with the population rather than in the view means the three modes read
 * naturally without the view branching on mode.
 */
export type PopulationWording = {
  /** e.g. "the field", "this league", "this rival". */
  subject: string
  /** What the crowd owning something is called, e.g. "most managers". */
  crowd: string
}

export function fieldStanding(
  rank: number | null,
  of: number,
  wording: PopulationWording = { subject: 'the field', crowd: 'most managers' }
): FieldStanding {
  if (rank === null || rank < 1 || of < 1) {
    return {
      position: 'unknown',
      rank,
      of,
      betterThanPercent: null,
      guidance: `There is no rank to read you against ${wording.subject}, so no call on whether to protect a lead or chase one. The ownership figures still stand on their own.`,
    }
  }

  const betterThanPercent = Math.max(0, Math.min(100, (1 - rank / of) * 100))

  // The median splits the population, which is the plain reading of "ahead of
  // or behind the reference population".
  const ahead = rank <= of / 2

  return {
    position: ahead ? 'ahead' : 'behind',
    rank,
    of,
    betterThanPercent,
    // Section 7.4: "Ahead means differentials are a risk and convergence
    // protects the lead. Behind means the opposite."
    guidance: ahead
      ? `You are ahead of ${wording.subject}, so differentials are a risk: every one is a way to lose ground you already hold. Owning what ${wording.crowd} own protects the lead.`
      : `You are behind ${wording.subject}, so owning what ${wording.crowd} own preserves the gap. Differentials are how you close it, which is why they are worth the risk here.`,
  }
}
