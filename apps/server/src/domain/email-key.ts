/**
 * The key an account email is unique by (users.email_key), like a tag's name key.
 *
 * Rule: trim surrounding whitespace, normalise to Unicode NFKC, lower-case. NFKC folds the
 * compatibility forms that look alike (fullwidth letters, the Kelvin sign, ligatures) and puts
 * composed and decomposed accents in one form; `toLowerCase` folds case with the full Unicode
 * mapping, so the result does not depend on the PostgreSQL cluster's locale (a `lower(email)`
 * index folds only ASCII on a `C`-locale cluster, which external databases often are).
 *
 * Every code path that writes or looks up an account by email must use this function; the
 * original `email` is kept as the user typed it for display and for sending mail. Changing this
 * rule later needs a migration that recomputes every stored key.
 */
export function emailKey(email: string): string {
  return email.trim().normalize('NFKC').toLowerCase();
}
