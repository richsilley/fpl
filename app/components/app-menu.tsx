import { Overlay } from '@/app/components/overlay'

/**
 * The Options dialog (section 7.8): everything that is not one of the four
 * views.
 *
 * Loading a squad and borrowing someone else's are both things you do once and
 * then stop thinking about, but they used to occupy the top third of every
 * page — two bordered cards above the tabs, competing with the thing the app
 * is actually for. Moving them behind a button costs one click on the rare
 * occasion they are wanted and gives the views the top of the page back.
 *
 * ## A centred dialog, not a left drawer
 *
 * It was a drawer pinned to the left edge, which made the app's one settings
 * panel look like a different kind of object from the population picker and
 * the replacement panel, both of which float in the middle. Three panels doing
 * the same job now open the same way, from the same component, and dismiss the
 * same way. It is narrower than the other two because it holds a short stack
 * of controls rather than a table.
 */
export function AppMenu({
  closeHref,
  children,
}: {
  closeHref: string
  children: React.ReactNode
}) {
  return (
    <Overlay closeHref={closeHref} label="Options" width="narrow">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Options
        </h2>
        <CloseButton href={closeHref} />
      </div>
      <div className="space-y-6 overflow-y-auto p-4">{children}</div>
    </Overlay>
  )
}

export function CloseButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      Close
    </a>
  )
}

/**
 * A titled block inside the dialog.
 *
 * Sentence case, not the small caps it used to be: these are headings like any
 * other, and two of them now carry a line of helper text underneath, which all
 * caps sat badly above.
 */
export function MenuSection({
  title,
  children,
  hint,
}: {
  title: string
  children: React.ReactNode
  /** Sits under the controls: what this does, once you have looked at it. */
  hint?: React.ReactNode
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        {title}
      </h3>
      {children}
      {hint && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
    </section>
  )
}
