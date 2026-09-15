/**
 * How much of the ledger a given reader may see.
 *
 * Its own module, deliberately: the query layer needs this type, and pulling it
 * from `auth/guard` would drag `next/navigation` into modules that cron jobs,
 * the PDF renderer and the round-trip guard script all import outside a request.
 *
 * ## The parameter is REQUIRED everywhere it appears
 *
 * Not optional with a default of `'all'`. A default is the wrong shape for a
 * safety boundary: the failure mode of forgetting it would be a live client's
 * name on a public page, and it would look exactly like working code. Required
 * means the compiler lists every call site and each one has to say, in writing,
 * which reader it is answering.
 *
 * That is why adding a scope to a query is a breaking change here rather than a
 * quiet addition — the breakage IS the review.
 */
export type ReadScope =
  /** A signed-in reader: the real books, demo rows included. */
  | 'all'
  /** A signed-out visitor: demo rows only, enforced in the SQL. */
  | 'demo';
