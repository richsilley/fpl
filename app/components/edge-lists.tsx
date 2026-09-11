import Link from 'next/link'

import { scoreTone } from '@/app/components/fixture-visuals'
import type { ChipStatus } from '@/lib/fpl/chips'
import { GATE_LABELS, SELL_REASON_LABELS } from '@/lib/fpl/edge-gates'
import type { EdgePackage, EdgeResult, Move } from '@/lib/fpl/edge-packages'
import { formatPrice } from '@/lib/format'

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
  chips,
  rivalName,
  swapHref,
  horizonGameweeks,
  transfersControl,
}: {
  result: EdgeResult
  chips: ChipStatus[] | null
  rivalName: string | null
  swapHref: ((playerId: number) => string) | null
  horizonGameweeks: number
  /** The primary control, rendered above everything it changes. */
  transfersControl: React.ReactNode
}) {
  const { packages, sells, rejections, convergent, bank } = result

  return (
    <div className="space-y-5">
      {transfersControl}

      {/* Section 7.9 requires this, persistently and above the packages. */}
      <p
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        Rival and league squads are from the last deadline. This assumes nobody
        else makes a transfer before the next one.
      </p>

      {chips && rivalName && <ChipStrip chips={chips} rivalName={rivalName} />}

      <SellGate sells={sells} swapHref={swapHref} />

      {packages.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              {packages.length === 1 ? 'One plan' : `${packages.length} plans`}
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
            />
          ))}
        </section>
      )}

      {rejections.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Considered and cut
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              What the tests rejected, and why.
            </p>
          </div>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {rejections.map((rejection) => (
              <li
                key={rejection.name}
                className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-sm"
              >
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {rejection.name}
                </span>
                <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                  {formatPrice(rejection.price)}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {rejection.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 7.9. The app gets to a shortlist; it does not get to a call. */}
      <p className="max-w-prose text-sm text-neutral-500 dark:text-neutral-400">
        These are shortlists, not final calls. Team news, press conferences and
        returning players change them, and none of that is in the data.
      </p>
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
            : `${sells.length} players have no case to stay`}
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
}: {
  pack: EdgePackage
  rank: number
  best: boolean
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
          <MoveRow key={move.out.id} move={move} />
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

function MoveRow({ move }: { move: Move }) {
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
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {move.in.name}
        </span>
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
              title={GATE_LABELS[gate]}
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
        <span title="Net transfers across all FPL managers this gameweek">
          Market{' '}
          <span
            className={`tabular-nums ${
              move.in.netTransfers > 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {formatNet(move.in.netTransfers)}
          </span>
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

/** Net transfers, rounded to thousands. The magnitude is the signal. */
function formatNet(net: number): string {
  const sign = net > 0 ? '+' : '−'
  const magnitude = Math.abs(net)
  if (magnitude >= 1000) {
    return `${sign}${Math.round(magnitude / 1000)}k`
  }
  return `${sign}${magnitude}`
}

/**
 * A rival's remaining chips.
 *
 * Deliberately no free transfer count: FPL does not publish one, and the only
 * way to infer it breaks around wildcard and free hit weeks (see `chips.ts`).
 */
function ChipStrip({
  chips,
  rivalName,
}: {
  chips: ChipStatus[]
  rivalName: string
}) {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 text-xs dark:border-neutral-800">
      <p className="font-medium text-neutral-700 dark:text-neutral-300">
        Chips {rivalName} has left
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-neutral-600 dark:text-neutral-400">
        {chips.map((chip) => (
          <div key={chip.label} className="flex items-baseline gap-1.5">
            <dt>{chip.label}</dt>
            <dd
              className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${
                chip.remaining === 0
                  ? 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600'
                  : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100'
              }`}
            >
              {chip.remaining} of {chip.total}
            </dd>
            {chip.playedIn.length > 0 && (
              <dd className="text-neutral-400 dark:text-neutral-500">
                used GW{chip.playedIn.join(', GW')}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  )
}
