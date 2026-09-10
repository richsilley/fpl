import Link from 'next/link'

import { scoreTone } from '@/app/components/fixture-visuals'
import type { ChipStatus } from '@/lib/fpl/chips'
import type { EdgeRow } from '@/lib/fpl/edge'
import { formatPrice } from '@/lib/format'

/**
 * The Edge (section 7.9): ranked buy and sell suggestions.
 *
 * ## Every row shows its working
 *
 * This is the one view in the app that gives answers rather than evidence.
 * Every other view lays out numbers and leaves the judgement to the reader;
 * this one has already judged. That earns it an obligation the others do not
 * have: **a row has to show what put it there.**
 *
 * So each carries the projection, the fixture score, the form and the
 * ownership behind its rank. A player suggested because of a fixture swing
 * looks visibly different from one suggested because of form, and a reader who
 * disagrees can see exactly which input they disagree with. Without that, a
 * bad suggestion does not just cost one transfer — it undermines the four
 * views that were right.
 */
export function EdgeLists({
  buy,
  sell,
  directionLine,
  chips,
  rivalName,
  swapHref,
  horizonGameweeks,
}: {
  buy: EdgeRow[]
  sell: EdgeRow[]
  /** The derived direction, in words. Section 7.9. */
  directionLine: string
  /** Only in rival scope. Null everywhere else. */
  chips: ChipStatus[] | null
  rivalName: string | null
  /** Opens the replacement panel for a squad player. Null disables it. */
  swapHref: ((playerId: number) => string) | null
  horizonGameweeks: number
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {directionLine}
        </p>
      </div>

      {/* Section 7.9 requires this, persistently and above the lists. Every
          rival and league figure on this page is a deadline-old snapshot, and
          a recommendation built on one is only as good as that assumption. */}
      <p
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        Rival and league squads are from the last deadline. This assumes nobody
        else makes a transfer before the next one.
      </p>

      {chips && rivalName && <ChipStrip chips={chips} rivalName={rivalName} />}

      <EdgeTable
        title="Consider buying"
        subtitle={`Ranked best first, over the next ${horizonGameweeks} gameweek${horizonGameweeks === 1 ? '' : 's'}.`}
        rows={buy}
        horizonGameweeks={horizonGameweeks}
        swapHref={null}
        empty="No player clears the quality threshold for this horizon and scope. That is a real answer, not a missing one: in a settled week with no fixture swing there may be nothing worth a transfer. Try a longer horizon, or come back after the next round of fixtures."
      />

      <EdgeTable
        title="Consider selling"
        subtitle="Your fifteen, worst first. Click a name to see replacements."
        rows={sell}
        horizonGameweeks={horizonGameweeks}
        swapHref={swapHref}
        empty="No squad loaded."
      />
    </div>
  )
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

function EdgeTable({
  title,
  subtitle,
  rows,
  horizonGameweeks,
  swapHref,
  empty,
}: {
  title: string
  subtitle: string
  rows: EdgeRow[]
  horizonGameweeks: number
  swapHref: ((playerId: number) => string) | null
  empty: string
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
      </div>

      {rows.length === 0 ? (
        // Section 7.9: say so, rather than showing nothing. An empty list with
        // no explanation reads as a broken page.
        <p className="max-w-prose rounded-lg border border-neutral-200 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          {empty}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="h-[45px]">
                <Th className="sticky left-0 z-20 w-52 min-w-52 border-r text-left">
                  Player
                </Th>
                <Th className="w-16 min-w-16" title="Current price">
                  Price
                </Th>
                <Th
                  className="w-24 min-w-24"
                  title={`Expected points over the next ${horizonGameweeks} gameweek${horizonGameweeks === 1 ? '' : 's'}, from the projection model`}
                >
                  Projected
                </Th>
                <Th
                  className="w-24 min-w-24"
                  title="How far your risk setting and your position moved this player from its raw projection"
                >
                  Strategy
                </Th>
                <Th
                  className="w-24 min-w-24"
                  title="Fixture Score over the horizon. Higher is better, 6.0 is average"
                >
                  Fixtures
                </Th>
                <Th
                  className="w-16 min-w-16"
                  title="Average points over the last 30 days"
                >
                  Form
                </Th>
                <Th
                  className="w-20 min-w-20"
                  title="Ownership within the selected scope"
                >
                  Owned
                </Th>
                <th
                  aria-hidden
                  className="w-auto border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800"
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row
                  key={row.playerId}
                  row={row}
                  href={swapHref === null ? null : swapHref(row.playerId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Th({
  className,
  title,
  children,
}: {
  className: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <th
      scope="col"
      title={title}
      className={`border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-right font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${className}`}
    >
      {children}
    </th>
  )
}

function Row({ row, href }: { row: EdgeRow; href: string | null }) {
  const background = 'bg-white dark:bg-neutral-900'

  return (
    <tr className="h-[45px]">
      <th
        scope="row"
        className={`sticky left-0 z-10 w-52 min-w-52 border-b border-r border-neutral-200 px-3 py-1.5 text-left font-normal dark:border-neutral-800 ${background}`}
      >
        <span className="flex items-baseline gap-1.5">
          {href ? (
            <Link
              href={href}
              scroll={false}
              className="truncate font-medium text-neutral-900 underline decoration-dotted underline-offset-4 hover:decoration-solid dark:text-neutral-100"
            >
              {row.name}
            </Link>
          ) : (
            <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
              {row.name}
            </span>
          )}
          <span className="shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
            {row.clubShort} {row.position}
          </span>
        </span>
      </th>

      <Td>{formatPrice(row.price)}</Td>

      {/* The headline number, and the one the backtest scores. */}
      <Td strong>{row.projection.points.toFixed(1)}</Td>

      {/* Signed on purpose: a reader has to be able to see when a player is
          here because of the strategy rather than the projection. */}
      <Td
        className={
          row.strategy.adjustment > 0.05
            ? 'text-emerald-700 dark:text-emerald-400'
            : row.strategy.adjustment < -0.05
              ? 'text-rose-700 dark:text-rose-400'
              : 'text-neutral-400 dark:text-neutral-500'
        }
      >
        {formatSigned(row.strategy.adjustment)}
      </Td>

      <Td>
        <span
          className={`inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 tabular-nums ${scoreTone(row.fixtureScore)}`}
        >
          <span className="font-semibold">{row.fixtureScore.toFixed(1)}</span>
          <span className="text-[11px] opacity-70">({row.fixtureCount})</span>
        </span>
      </Td>

      <Td>{row.form.toFixed(1)}</Td>
      <Td>{row.ownership.toFixed(1)}%</Td>

      <td
        aria-hidden
        className={`w-auto border-b border-neutral-100 dark:border-neutral-800/70 ${background}`}
      />
    </tr>
  )
}

function Td({
  children,
  strong = false,
  className = '',
}: {
  children: React.ReactNode
  strong?: boolean
  className?: string
}) {
  return (
    <td
      className={`border-b border-l border-neutral-100 px-2 py-1.5 text-right tabular-nums dark:border-neutral-800/70 ${
        strong
          ? 'font-semibold text-neutral-900 dark:text-neutral-50'
          : 'text-neutral-700 dark:text-neutral-300'
      } ${className}`}
    >
      {children}
    </td>
  )
}

function formatSigned(value: number): string {
  if (Math.abs(value) < 0.05) {
    return '—'
  }
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`
}
