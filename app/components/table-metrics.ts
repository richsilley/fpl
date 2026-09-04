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
