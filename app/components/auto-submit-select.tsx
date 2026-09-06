'use client'

import { useRouter } from 'next/navigation'

/**
 * A `<select>` that loads its choice immediately, with no Go button.
 *
 * ## Why this is a Client Component
 *
 * Every other control in the app is a link or a submit button, which needs no
 * JavaScript. A select that acts on change cannot be: something has to notice
 * the change. This is the second Client Component in the app, after the
 * horizon control, and for the same kind of reason.
 *
 * ## It still works without JavaScript
 *
 * The select is wrapped in a real GET form carrying the whole URL state as
 * hidden fields, with a submit button that only appears inside `<noscript>`.
 * So the no-JS path is exactly the Go button this replaces, and the JS path
 * skips it. Nothing is lost, and section 8.2's rule that every control is a
 * link or a GET form still holds.
 *
 * With JavaScript the change handler routes to the option's own precomputed
 * href instead of submitting, which keeps the navigation client-side and lets
 * the Ownership view's `<Suspense>` boundaries stream rather than the whole
 * document reloading.
 */
export function AutoSubmitSelect({
  id,
  name,
  label,
  value,
  placeholder,
  options,
  hidden,
  submitLabel,
  className = '',
  disabled = false,
}: {
  id: string
  /** The parameter this select sets. */
  name: string
  label: string
  /** The currently selected value, or '' for none. */
  value: string
  /** The empty option's text, e.g. "Choose a manager…". */
  placeholder: string
  /** `href` is where JavaScript navigates; `value` is what the form submits. */
  options: { value: string; label: string; href: string }[]
  /** URL state to preserve on submit, from `carriedFields`. */
  hidden: { name: string; value: string }[]
  /** Only ever seen with JavaScript disabled. */
  submitLabel: string
  className?: string
  /** Shown but not yet usable, when an earlier step has to come first. */
  disabled?: boolean
}) {
  const router = useRouter()

  return (
    <form action="/" method="get" className={`min-w-0 ${className}`}>
      {hidden
        // The select writes this one itself; a hidden field of the same name
        // would submit both values.
        .filter((field) => field.name !== name)
        .map((field) => (
          <input
            key={field.name}
            type="hidden"
            name={field.name}
            value={field.value}
          />
        ))}

      <label
        htmlFor={id}
        className={`block text-xs font-medium ${
          disabled
            ? 'text-neutral-400 dark:text-neutral-600'
            : 'text-neutral-600 dark:text-neutral-400'
        }`}
      >
        {label}
      </label>

      <select
        id={id}
        name={name}
        defaultValue={value}
        disabled={disabled}
        onChange={(event) => {
          const chosen = options.find(
            (option) => option.value === event.currentTarget.value
          )
          if (chosen) {
            router.push(chosen.href)
          } else {
            // The placeholder was re-selected. Submitting sends an empty
            // value, which every parser reads as "not set" and so clears it.
            event.currentTarget.form?.requestSubmit()
          }
        }}
        className="mt-1 w-full max-w-[22rem] rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/30 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <noscript>
        <button
          type="submit"
          className="mt-1 rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {submitLabel}
        </button>
      </noscript>
    </form>
  )
}
