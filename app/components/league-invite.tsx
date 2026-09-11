/**
 * The app's own mini league (section 7.8).
 *
 * The one place the app asks the reader for anything. It appears twice — at
 * the foot of the home page, and at the foot of the Options dialog — because
 * those are the two moments a reader is not mid-task: before they have loaded
 * a squad, and after they have gone looking for settings. Anywhere else it
 * would interrupt the thing they came to do.
 *
 * **The code and the link are one constant each**, not typed out per copy. Two
 * places quoting a join code that has drifted apart is worse than not offering
 * one, since a wrong code fails silently — FPL shows a generic error and never
 * says which half was wrong.
 *
 * The auto-join URL is shown in full rather than hidden behind link text. It
 * goes to a third-party site and does something on the reader's account, so
 * they get to see where it points before they follow it, and it is the form
 * they can paste to someone else.
 */

export const LEAGUE_CODE = '6jkodk'
export const LEAGUE_JOIN_URL = `https://fantasy.premierleague.com/leagues/auto-join/${LEAGUE_CODE}`

export function LeagueInvite({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 dark:border-neutral-800 ${
        compact ? 'px-3 py-2.5' : 'px-4 py-3'
      }`}
    >
      <p
        className={`font-semibold text-neutral-900 dark:text-neutral-50 ${
          compact ? 'text-sm' : 'text-base'
        }`}
      >
        Join The Edge mini league
      </p>
      <p
        className={`mt-1 text-neutral-600 dark:text-neutral-300 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        {/* No full stop after the code. The chip is padded, so a period sits a
            clear space off the end of it and reads as a stray mark — the same
            reason the "Sign in at fantasy.premierleague.com" step ends on its
            link. */}
        Play against everyone else using this app. League code{' '}
        <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50">
          {LEAGUE_CODE}
        </code>
      </p>
      {/* New tab, and `break-all`: it is a long URL that must not push a phone
          sideways, and the reader is mid-page rather than finished with it. */}
      <p className="mt-2">
        <a
          href={LEAGUE_JOIN_URL}
          target="_blank"
          rel="noreferrer noopener"
          className={`break-all font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 hover:decoration-neutral-900 dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-neutral-100 dark:hover:decoration-neutral-100 ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {LEAGUE_JOIN_URL}
        </a>
      </p>
    </div>
  )
}
