/**
 * The manager ID input (section 7.1).
 *
 * A plain GET form pointed at `/`, so submitting navigates to `/?id=...`.
 * That is section 8.2's URL state for free, with no client JavaScript, no
 * router hooks and no hydration: the browser does the work. It also means the
 * back button and a pasted link behave the same way.
 */
export function ManagerIdForm({ currentId }: { currentId?: string }) {
  return (
    <form action="/" method="get" className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[12rem]">
        <label
          htmlFor="id"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Manager ID
        </label>
        <input
          id="id"
          name="id"
          type="text"
          required
          defaultValue={currentId}
          // Numeric keypad on mobile without the spinner and scroll-wheel
          // quirks of type="number".
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder="2695180"
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-600"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-base font-medium text-white transition-colors hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500/40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        Load squad
      </button>
    </form>
  )
}
