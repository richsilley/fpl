/**
 * The geometry the Fixtures and Form tables share.
 *
 * Both views render the same fifteen rows in the same place on the page, so
 * switching between them should change the columns and nothing else. If the
 * rows are even a pixel apart the whole table appears to jump, which reads as
 * the page reloading rather than a tab changing.
 *
 * The numbers are the Fixtures table's own natural heights, set by the two-line
 * fixture chip. Fixtures is the constraint because its cells cannot be made
 * shorter without cramping the chip, so Form matches it rather than the other
 * way round. They are exact pixel values, not `h-14`/`h-11`: those round to 56
 * and 44, one short, and Form would then sit a pixel high on every row.
 */

/** Two-line header: the column label above its gameweek or sort caret. */
export const MATRIX_HEADER_HEIGHT = 'h-[57px]'

/** One player row, which is the height of a fixture chip plus its padding. */
export const MATRIX_ROW_HEIGHT = 'h-[45px]'

/**
 * The frozen player column, identical in Fixtures, Form and Ownership.
 *
 * Same reasoning as the heights: it is the one column every fifteen-row view
 * shares, so if the three disagree about its width the names slide sideways on
 * every view switch. Wide enough for the longest web name plus a club code at
 * the `sm` breakpoint, and narrow enough on a phone that at least one data
 * column is visible beside it.
 */
export const MATRIX_PLAYER_COLUMN =
  'w-[8.5rem] min-w-[8.5rem] sm:w-44 sm:min-w-44'

/**
 * Where that column ends, for anything stuck immediately to its right.
 *
 * Must be kept in step with `MATRIX_PLAYER_COLUMN` by hand: a sticky offset
 * cannot read a sibling's width, so the two are only correct together.
 */
export const MATRIX_PLAYER_COLUMN_END = 'left-[8.5rem] sm:left-44'
