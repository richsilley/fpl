/**
 * What every column on the Form table means (section 7.3).
 *
 * It used to explain three things and justify the rest: why xP has no bar, why
 * the bars use different denominators, why availability is a dot. That is
 * design reasoning, which belongs in the code and the requirements — a reader
 * looking at "DefCon 8.4" wants to know what it counts, not why it is drawn
 * the way it is. So it now defines every column, in table order, and argues
 * for none of them.
 */
export function FormLegend() {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
      {/* One entry per row, each free to run the full width of the table
          above. Laid out in columns under a full-width table, every definition
          wrapped into fragments while two thirds of the line sat empty. */}
      <dl className="space-y-1.5">
        <Entry term="Availability">
          the dot beside each name. Green is fit, amber is doubtful, red is out.
          Team news appears under the name when there is any.
        </Entry>
        <Entry term="Price">
          current price. Rises and falls as managers buy and sell.
        </Entry>
        <Entry term="GW">
          price change this gameweek. Blank means no movement.
        </Entry>
        <Entry term="Season">
          price change since the season started. Your profit or loss on that
          player.
        </Entry>
        <Entry term="Pts">total points this season.</Entry>
        <Entry term="PPG">
          points per game. Season points divided by matches played.
        </Entry>
        <Entry term="Mins">average minutes played per match.</Entry>
        <Entry term="Form">average points over the last 30 days.</Entry>
        <Entry term="xGI">
          expected goal involvements, so expected goals plus expected assists.
        </Entry>
        <Entry term="DefCon">
          defensive contributions per 90. A defender needs 10 in a match to earn
          the two points, a midfielder or forward needs 12.
        </Entry>
        <Entry term="xP">
          Fantasy Premier League&rsquo;s own expected points for the next
          gameweek.
        </Entry>
        <Entry term="Market">
          how many managers have bought this player this gameweek, less how many
          have sold. Green is the market buying, red the market selling. It is
          the only column here that measures opinion rather than something that
          has happened on a pitch.
        </Entry>
      </dl>
    </div>
  )
}

/**
 * One definition. The term and its text run on as a single line so the pair
 * reads as a sentence rather than as two columns to look across.
 */
function Entry({
  term,
  children,
}: {
  term: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="inline font-medium text-neutral-700 dark:text-neutral-300">
        {term}
      </dt>{' '}
      <dd className="inline">&mdash; {children}</dd>
    </div>
  )
}
