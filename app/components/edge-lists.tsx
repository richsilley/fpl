import Link from 'next/link'

import { ChipStrip } from '@/app/components/chip-strip'
import { scoreTone } from '@/app/components/fixture-visuals'
import type { ChipStatus } from '@/lib/fpl/chips'
import {
  GATE_LABELS,
  GATE_TOOLTIPS,
  SELL_REASON_LABELS,
} from '@/lib/fpl/edge-gates'
import type {
  EdgePackage,
  EdgeResult,
  Move,
  PositionPicks,
} from '@/lib/fpl/edge-packages'
import { spellNumber } from '@/lib/fpl/edge-packages'
import {
  formatNetTransfers,
  formatPrice,
  netTransferTone,
} from '@/lib/format'

/**
 * The Edge (section 7.9): complete transfer packages.
 *
 * ## Packages, not rankings
 *
 * The first build showed two ranked lists, buy and sell, generated
 * independently. That produced suggestions the reader could not fund and a
 * manufactured sell case for whoever happened to come fifteenth. This shows
 * two to four complete plans, each a set of paired moves that has been checked
 * against the money end to end.
 *
 * ## It shows its working, and it shows what it rejected
 *
 * Every move names the tests it passed. Below the packages, the candidates
 * that were considered and cut, each with the specific reason. That second
 * list is where trust is built: a bare ranking throws away the reasoning, and
 * a recommendation nobody can argue with is a recommendation nobody can check.
 */
export function EdgeLists({
  result,
  picks,
  chips,
  rivalName,
  swapHref,
  detailHref,
  horizonGameweeks,
  scopeLabel,
  transfersControl,
}: {
  result: EdgeResult
  picks: PositionPicks[]
  chips: ChipStatus[] | null
  rivalName: string | null
  swapHref: ((playerId: number) => string) | null
  /** Opens the player panel (section 7.9). */
  detailHref: (playerId: number) => string
  horizonGameweeks: number
  scopeLabel: string
  /** The primary control, rendered above everything it changes. */
  transfersControl: React.ReactNode
}) {
  const { packages, sells, convergent, bank } = result

  return (
    <div className="space-y-5">
      {transfersControl}

      {chips && rivalName && <ChipStrip chips={chips} rivalName={rivalName} />}

      <SellGate sells={sells} swapHref={swapHref} />

      {packages.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              {packages.length === 1
                ? 'One suggestion'
                : `${spellNumber(packages.length)} suggestions`}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Ranked best first, over the next {horizonGameweeks} gameweek
              {horizonGameweeks === 1 ? '' : 's'}. You have {formatPrice(bank)}{' '}
              in the bank.
            </p>
          </div>

          {/* Section 7.9: when every route ends on the same fifteen, say so.
              It changes the question from which squad to which order. */}
          {convergent && (
            <p className="max-w-prose rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              These end on the same fifteen. You are not choosing a destination,
              you are choosing a route.
            </p>
          )}

          {packages.map((pack, index) => (
            <PackageCard
              key={pack.id}
              pack={pack}
              rank={index + 1}
              best={index === 0}
              detailHref={detailHref}
            />
          ))}
        </section>
      )}

      <BestPicks
        picks={picks}
        detailHref={detailHref}
        scopeLabel={scopeLabel}
        horizonGameweeks={horizonGameweeks}
      />
    </div>
  )
}

/**
 * The sell gate's verdict.
 *
 * Section 7.9: a week with nobody to sell is a valid and common answer, and
 * saying so plainly is the point. Ranking all fifteen worst-first would
 * manufacture a case against whoever came last.
 */
function SellGate({
  sells,
  swapHref,
}: {
  sells: EdgeResult['sells']
  swapHref: ((playerId: number) => string) | null
}) {
  if (sells.length === 0) {
    return (
      <p className="max-w-prose rounded-lg border border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          Nobody in your squad has a case against them this week.
        </span>{' '}
        No player trips two of the four sell tests, so there is no transfer to
        make. That is a normal answer, not a missing one.
      </p>
    )
  }

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
          {sells.length === 1
            ? 'One player has no case to stay'
            : `${spellNumber(sells.length)} players have no case to stay`}
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Everyone else does. Each of these trips at least two sell tests.
        </p>
      </div>
      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {sells.map(({ player, reasons }) => (
          <li
            key={player.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2 text-sm"
          >
            {swapHref ? (
              <Link
                href={swapHref(player.id)}
                scroll={false}
                className="font-medium text-neutral-900 underline decoration-dotted underline-offset-4 dark:text-neutral-100"
              >
                {player.name}
              </Link>
            ) : (
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {player.name}
              </span>
            )}
            <span className="text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
              {player.clubShort} {player.position}
            </span>
            <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
              {formatPrice(player.price)}
            </span>
            <span className="flex flex-wrap gap-1">
              {reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                >
                  {SELL_REASON_LABELS[reason]}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PackageCard({
  pack,
  rank,
  best,
  detailHref,
}: {
  pack: EdgePackage
  rank: number
  best: boolean
  detailHref: (playerId: number) => string
}) {
  return (
    <article
      className={`rounded-lg border px-4 py-3 ${
        best
          ? 'border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          {rank}. {pack.title}
        </h4>
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {formatPrice(pack.moneyLeft)} left
          {pack.banked > 0 &&
            ` · ${pack.banked} transfer${pack.banked === 1 ? '' : 's'} banked`}
        </p>
      </div>

      <ul className="mt-2 space-y-1.5">
        {pack.moves.map((move) => (
          <MoveRow key={move.out.id} move={move} detailHref={detailHref} />
        ))}
      </ul>

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-emerald-700 dark:text-emerald-400">
            Gains
          </dt>
          <dd className="text-neutral-600 dark:text-neutral-400">
            {pack.gains}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-medium text-rose-700 dark:text-rose-400">
            Costs
          </dt>
          <dd className="text-neutral-600 dark:text-neutral-400">
            {pack.costs}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function MoveRow({
  move,
  detailHref,
}: {
  move: Move
  detailHref: (playerId: number) => string
}) {
  return (
    <li className="rounded-md bg-white px-3 py-2 text-sm dark:bg-neutral-950/40">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-neutral-500 line-through dark:text-neutral-500">
          {move.out.name}
        </span>
        <span className="tabular-nums text-neutral-400 dark:text-neutral-600">
          {formatPrice(move.out.price)}
        </span>
        <span aria-hidden className="text-neutral-400">
          &rarr;
        </span>
        <Link
          href={detailHref(move.in.id)}
          scroll={false}
          className="font-medium text-neutral-900 underline decoration-dotted underline-offset-4 hover:decoration-solid dark:text-neutral-100"
        >
          {move.in.name}
        </Link>
        <span className="text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
          {move.in.clubShort}
        </span>
        <span className="tabular-nums text-neutral-600 dark:text-neutral-300">
          {formatPrice(move.in.price)}
        </span>

        {/* The tests this pair passed. Two of three is the bar, so naming them
            is what separates a move that raised the floor from one that moved
            money — which are different recommendations. */}
        <span className="flex flex-wrap gap-1">
          {move.gates.passed.map((gate) => (
            <span
              key={gate}
              title={GATE_TOOLTIPS[gate]}
              className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
            >
              {GATE_LABELS[gate]}
            </span>
          ))}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span>
          Projected{' '}
          <span className="font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
            {move.in.projected.toFixed(1)}
          </span>{' '}
          against {move.out.projected.toFixed(1)}
        </span>
        <span className="inline-flex items-baseline gap-1">
          Fixtures
          <span
            className={`rounded px-1 tabular-nums ${scoreTone(move.in.fixtureScore)}`}
          >
            {move.in.fixtureScore.toFixed(1)}
          </span>
        </span>
        <span>
          Form <span className="tabular-nums">{move.in.form.toFixed(1)}</span>
        </span>
        <span>
          Owned{' '}
          <span className="tabular-nums">{move.in.ownership.toFixed(1)}%</span>
        </span>
        {/* The market's own opinion, which nothing else in the app shows. */}
        {/* "Market +345k" did not say what was being counted. The plain form
            needs no tooltip at all. */}
        <span
          className={netTransferTone(move.in.netTransfers)}
        >
          {formatNetTransfers(move.in.netTransfers)}
        </span>
      </div>

      {move.alternativeNote && (
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          Alternative: {move.alternativeNote}
        </p>
      )}
    </li>
  )
}

/**
 * The best available player in each position over the horizon (section 7.9).
 *
 * This replaced a "considered and cut" list. Rejections were interesting to
 * whoever wrote the rules and confusing to everyone else: a reader wants to
 * know who to buy, not who an algorithm declined to suggest.
 *
 * **Price agnostic on purpose.** The packages above already answer what is
 * affordable today; this answers what is worth reaching for, which is the
 * question that decides whether to sell two players to fund one. Filtering it
 * by budget would hide exactly those targets.
 */
function BestPicks({
  picks,
  detailHref,
  scopeLabel,
  horizonGameweeks,
}: {
  picks: PositionPicks[]
  detailHref: (playerId: number) => string
  scopeLabel: string
  horizonGameweeks: number
}) {
  const withPlayers = picks.filter((group) => group.players.length > 0)
  if (withPlayers.length === 0) {
    return null
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
          Best available, by position
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Over the next {spellNumber(horizonGameweeks).toLowerCase()} gameweek
          {horizonGameweeks === 1 ? '' : 's'}, whatever the price. Players you
          do not already own. Click a name for their fixtures, form and
          ownership.
        </p>
      </div>

      {withPlayers.map((group) => (
        <div key={group.position}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {POSITION_NAMES[group.position] ?? group.position}
          </h4>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {group.players.map((player) => (
              <li key={player.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link
                    href={detailHref(player.id)}
                    scroll={false}
                    className="text-sm font-medium text-neutral-900 underline decoration-dotted underline-offset-4 hover:decoration-solid dark:text-neutral-100"
                  >
                    {player.name}
                  </Link>
                  <span className="text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
                    {player.clubShort}
                  </span>
                  <span className="text-sm tabular-nums text-neutral-600 dark:text-neutral-300">
                    {formatPrice(player.price)}
                  </span>
                  <span className="ml-auto flex flex-wrap items-baseline gap-x-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span>
                      Projected{' '}
                      <span className="font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
                        {player.projected.toFixed(1)}
                      </span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      Fixtures
                      <span
                        className={`rounded px-1 tabular-nums ${scoreTone(player.fixtureScore)}`}
                      >
                        {player.fixtureScore.toFixed(1)}
                      </span>
                    </span>
                    {/* Numbers, not bars: this is a shortlist to scan, and the
                        bars belong on the Ownership view where comparing
                        fifteen of them is the job. */}
                    <span title={`Owned across ${scopeLabel}`}>
                      Owned{' '}
                      <span className="tabular-nums">
                        {player.ownership.toFixed(1)}%
                      </span>
                    </span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {player.benefit}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

const POSITION_NAMES: Record<string, string> = {
  GKP: 'Goalkeepers',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards',
}
