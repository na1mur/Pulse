/** R-29: trimmed, internal whitespace collapsed to single spaces; the user's casing is kept. */
export function normalizeTagName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * R-29: what a tag name is unique by (tags.name_key): the normalised name, Unicode NFKC and
 * lower-case, computed here rather than in SQL so it does not depend on the database locale
 * (the same reasoning as `emailKey`).
 */
export function tagNameKey(name: string): string {
  return normalizeTagName(name).normalize('NFKC').toLowerCase();
}
