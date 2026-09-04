import type { FplErrorKind } from '@/lib/fpl/errors'

/**
 * The section 7.1 error state: "Clear error state if the ID is invalid or the
 * API is unavailable."
 *
 * The message from the data layer says what went wrong. This adds what the
 * reader can do about it, which differs by kind: a wrong ID is the reader's to
 * fix, a closed gameweek needs waiting out, and an outage needs retrying.
 */
const RECOVERY: Partial<Record<FplErrorKind, string>> = {
  not_found:
    'Check the ID. You can find yours on the FPL site: open the Points tab and take the number from the address bar.',
  bad_request: 'A manager ID is a plain number, with no spaces or punctuation.',
  picks_not_yet_available:
    'Squads stay private until the deadline passes, so this one cannot be loaded yet.',
  forbidden:
    'The FPL API refused the request. This usually needs a fix on our side rather than yours.',
  unavailable:
    'The FPL API is often unavailable around gameweek deadlines. Trying again in a few minutes usually works.',
  network:
    'The FPL API could not be reached. Check your connection and try again.',
  timeout: 'The FPL API took too long to respond. Try again in a moment.',
}

export function ErrorNotice({
  kind,
  message,
}: {
  kind: FplErrorKind
  message: string
}) {
  const recovery = RECOVERY[kind]

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40"
    >
      <h2 className="font-semibold text-red-900 dark:text-red-200">
        {kind === 'not_found' ? 'Squad not found' : 'Could not load that squad'}
      </h2>
      <p className="mt-1 text-sm text-red-800 dark:text-red-300">{message}</p>
      {recovery && (
        <p className="mt-2 text-sm text-red-700/90 dark:text-red-300/80">
          {recovery}
        </p>
      )}
    </div>
  )
}
