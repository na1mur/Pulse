// D-13, Appendix A: how long each credential lives, in seconds.

/** The access token: short, so a revoked device stops working within minutes at the latest. */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
/** The refresh credential: 30 days, extended with every rotation. */
export const REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
/** US-4.1: the verification link is valid for 24 hours. */
export const VERIFY_EMAIL_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
