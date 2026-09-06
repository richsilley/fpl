import { Overlay } from '@/app/components/overlay'

/**
 * The menu drawer (section 7.8): everything that is not one of the four views.
 *
 * Loading a squad and borrowing someone else's are both things you do once and
 * then stop thinking about, but they used to occupy the top third of every
 * page — two bordered cards above the tabs, competing with the thing the app
 * is actually for. Moving them behind a button costs one click on the rare
 * occasion they are wanted and gives the views the top of the page back.
 *
 * A drawer rather than a dropdown because it holds two full controls, one of
 * them a two-step cascade, and both want room to breathe at 380px.
 */
export function AppMenu({
  closeHref,
  children,
}: {
  closeHref: string
  children: React.ReactNode
}) {
  return (
    <Overlay closeHref={closeHref} label="Menu" align="drawer">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Menu
        </h2>
        <CloseButton href={closeHref} />
      </div>
      <div className="space-y-6 p-4">{children}</div>
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

/** A titled block inside the drawer. */
export function MenuSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </h3>
      {children}
    </section>
  )
}
