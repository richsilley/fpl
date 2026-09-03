import { formatPoints, formatPrice } from '@/lib/format'
import type { Squad, SquadPlayer } from '@/lib/fpl/squad'

/**
 * The fifteen rows (sections 4 and 7.1): starting XI first, then the bench in
 * order.
 *
 * The frozen first column inside a horizontally scrolling wrapper is the
 * pattern section 8.5 calls for on every view. There are few enough columns
 * here not to need it yet, but the Fixtures view adds a column per gameweek to
 * this same shape, so it is set up now rather than retrofitted.
 */
export function SquadTable({ squad }: { squad: Squad }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {squad.manager.teamName}, gameweek {squad.manager.gameweek}: starting
          eleven followed by the bench in order.
        </caption>
        <thead>
          <tr className="bg-neutral-50 text-left dark:bg-neutral-800/60">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              Player
            </th>
            <th
              scope="col"
              className="px-3 py-2 font-medium text-neutral-600 dark:text-neutral-300"
            >
              Pos
            </th>
            <th
              scope="col"
              className="px-3 py-2 font-medium text-neutral-600 dark:text-neutral-300"
            >
              Club
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right font-medium text-neutral-600 dark:text-neutral-300"
            >
              Price
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right font-medium text-neutral-600 dark:text-neutral-300"
            >
              Pts
            </th>
          </tr>
        </thead>

        <tbody>
          {squad.startingXi.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}

          <tr>
            <th
              colSpan={5}
              scope="colgroup"
              className="border-y border-neutral-200 bg-neutral-100 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-400"
            >
              Bench
            </th>
          </tr>

          {squad.bench.map((player) => (
            <PlayerRow key={player.id} player={player} isBench />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerRow({
  player,
  isBench = false,
}: {
  player: SquadPlayer
  isBench?: boolean
}) {
  const rowTint = isBench
    ? 'bg-neutral-50/60 dark:bg-neutral-900/40'
    : 'bg-white dark:bg-neutral-900'

  return (
    <tr
      className={`border-t border-neutral-100 dark:border-neutral-800/70 ${rowTint}`}
    >
      <th
        scope="row"
        className={`sticky left-0 z-10 px-3 py-2 text-left font-normal ${rowTint}`}
      >
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-neutral-900 dark:text-neutral-100">
            {player.name}
          </span>
          {player.isCaptain && <Armband label="C" title="Captain" />}
          {player.isViceCaptain && <Armband label="V" title="Vice-captain" />}
          <AvailabilityFlag player={player} />
        </span>
      </th>
      <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">
        {player.position}
      </td>
      <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400">
        {player.club}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
        {/* Constraint 4: now_cost is in tenths, so 75 renders as £7.5m. */}
        {formatPrice(player.price)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
        {formatPoints(player.totalPoints)}
      </td>
    </tr>
  )
}

function Armband({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-bold leading-none text-white dark:bg-neutral-200 dark:text-neutral-900"
    >
      {label}
      <span className="sr-only"> ({title})</span>
    </span>
  )
}

/**
 * A minimal injury or suspension marker.
 *
 * Section 7.3 owns the full availability treatment in the Form view. This is
 * only enough that a squad list does not hide an injured player, using the
 * `status` and `news` already in the bootstrap projection.
 */
function AvailabilityFlag({ player }: { player: SquadPlayer }) {
  if (player.status === 'a') {
    return null
  }

  const doubtful = player.status === 'd'
  const description = player.news || (doubtful ? 'Doubtful' : 'Unavailable')
  const chance =
    player.chanceOfPlaying === null ? '' : ` (${player.chanceOfPlaying}%)`

  return (
    <span
      title={`${description}${chance}`}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        doubtful ? 'bg-amber-500' : 'bg-red-600'
      }`}
    >
      <span className="sr-only">{`${description}${chance}`}</span>
    </span>
  )
}
