// Tag normalization shared by the renderer (tag editor UI) and the main
// process (bimm.json writer). Keeping one implementation means what the user
// sees in the editor is exactly what lands on disk.

export const TAG_SEPARATOR = ',';

/** Trims surrounding whitespace; the only per-tag normalization we apply. */
export const normalizeTag = (tag: string): string => tag.trim();

/**
 * Splits a comma-delimited string (typed or pasted) into trimmed, non-empty
 * tags. Handles the trailing-comma case (`"rock,"` -> `['rock']`) for free.
 */
export const splitTagInput = (value: string): string[] =>
  value
    .split(TAG_SEPARATOR)
    .map(normalizeTag)
    .filter((tag) => tag.length > 0);

/**
 * Case-insensitive membership test, so adding "Rock" to a list already holding
 * "rock" is a no-op rather than a near-duplicate pill.
 */
export const hasTag = (tags: readonly string[], tag: string): boolean => {
  const needle = normalizeTag(tag).toLowerCase();

  return tags.some((existing) => normalizeTag(existing).toLowerCase() === needle);
};

/**
 * Trims, drops empties, and removes case-insensitive duplicates while keeping
 * the first occurrence (so the user's original casing and ordering survive).
 */
export const normalizeTagList = (tags: readonly string[]): string[] => {
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = normalizeTag(tag);

    if (trimmed.length > 0 && !hasTag(normalized, trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized;
};

/** Appends `additions` to `tags`, skipping empties and duplicates. */
export const addTags = (tags: readonly string[], additions: readonly string[]): string[] =>
  normalizeTagList([...tags, ...additions]);

/** Removes every case-insensitive match of `tag`. */
export const removeTag = (tags: readonly string[], tag: string): string[] => {
  const needle = normalizeTag(tag).toLowerCase();

  return tags.filter((existing) => normalizeTag(existing).toLowerCase() !== needle);
};
