// The phone page's own words (Show.joinPage; interaction spec, Join ▸ Page settings).

/** A title is a line, the waiting text a short paragraph. */
export const JOIN_PAGE_LIMITS = { title: 80, waiting: 200 } as const;

/** The page's own words as a page shows them: trimmed and capped, or null for the default. */
export const pageWords = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
