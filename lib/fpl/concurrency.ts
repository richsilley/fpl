import 'server-only'

/**
 * Runs `worker` over `items`, at most `limit` at a time.
 *
 * The mini-league population needs one `picks/` call per manager (section
 * 7.4), and a single call takes well over a second. Sequentially fifty of
 * those is a minute and a half; all fifty at once is a burst of load on an
 * API section 8.3 exists to protect. This sits between the two.
 *
 * Failures are collected rather than thrown. One manager's picks failing, for
 * instance because they joined the league late and have none for the
 * gameweek, should shrink the comparison population, not destroy the view.
 */
export async function mapWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  worker: (item: Item) => Promise<Result>
): Promise<{ results: Result[]; failures: number }> {
  const results: Result[] = []
  let failures = 0
  let next = 0

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++
      try {
        results.push(await worker(items[index]))
      } catch {
        failures += 1
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  )

  return { results, failures }
}
