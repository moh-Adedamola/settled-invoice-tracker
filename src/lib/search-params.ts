/**
 * Search-param helpers for URL-held list state.
 *
 * Filter, sort and page state lives in the URL rather than React state so a
 * filtered view is shareable, bookmarkable and survives a refresh — and so the
 * server component can read it directly instead of the client fetching after
 * hydration.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function allValues(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

export function toURLSearchParams(params: RawSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of allValues(value)) {
      if (item !== '') out.append(key, item);
    }
  }
  return out;
}

/**
 * Returns a new query string with `patch` applied. `null` removes a key.
 *
 * Any change to filters or sort resets `page` — landing on page 4 of a result
 * set that now has two pages is a dead end the user did not ask for.
 */
export function patchQuery(
  current: URLSearchParams,
  patch: Record<string, string | string[] | null>,
  options: { resetPage?: boolean } = {},
): string {
  const next = new URLSearchParams(current);

  for (const [key, value] of Object.entries(patch)) {
    next.delete(key);
    if (value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== '') next.append(key, item);
    }
  }

  if (options.resetPage !== false && !('page' in patch)) next.delete('page');

  const query = next.toString();
  return query ? `?${query}` : '';
}

/** True when anything narrowing the result set is set. */
export function hasActiveFilters(params: URLSearchParams, keys: string[]): boolean {
  return keys.some((key) => params.getAll(key).some((value) => value !== ''));
}
