// Auth group (spec 7.2, AUTH-01..AUTH-12). D-30: credential operations are online-only and carry
// no command ID; completing first sign-in is a data write and does.
import { z } from 'zod';
import { Device, Platform, Preferences, Tag, User } from '../entities.js';
import { Id, Instant, Revision, TimeZoneName, commandFields } from '../primitives.js';

/** Appendix A: passwords are 8-128 characters. Other limits here: Appendix A "Other field limits". */
export const Password = z.string().min(8).max(128);
const Email = z.email().max(254);
/** Single-use email token (verification, reset, email change) as it appears in the link. */
const EmailToken = z.string().min(1).max(512);

/** Spec 6 Device: the installing device identifies itself when it signs in. */
export const DeviceInfo = z.strictObject({
  // Appendix A "Other field limits": name 1-100, app version 1-32 characters.
  id: Id,
  name: z.string().trim().min(1).max(100),
  platform: Platform,
  appVersion: z.string().min(1).max(32),
});

/** Access and refresh credentials (D-13: access 15 min, refresh 30 days rotating). */
export const AuthSession = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: Instant,
  refreshToken: z.string(),
  refreshTokenExpiresAt: Instant,
  user: User,
});

export const RegisterRequest = z.strictObject({ email: Email, password: Password });
export const VerifyEmailRequest = z.strictObject({ token: EmailToken });
export const ResendVerificationRequest = z.strictObject({ email: Email });
export const LoginRequest = z.strictObject({
  email: Email,
  password: Password,
  device: DeviceInfo,
});

// ADR-0003: both credential forms, for sign-in and re-authentication alike; T1.6's OAuth ADR
// narrows them for both at once.
export const GoogleCredential = z.discriminatedUnion('kind', [
  /** Android Credential Manager returns an ID token. */
  z.strictObject({ kind: z.literal('idToken'), idToken: z.string().min(1).max(4096) }),
  /** Windows: authorization code + PKCE from the loopback redirect; the server exchanges it. */
  z.strictObject({
    kind: z.literal('authorizationCode'),
    code: z.string().min(1).max(2048),
    codeVerifier: z.string().min(43).max(128),
    redirectUri: z.url({ protocol: /^http$/, hostname: /^(127\.0\.0\.1|localhost)$/ }),
  }),
]);
export const GoogleSignInRequest = z.strictObject({
  credential: GoogleCredential,
  device: DeviceInfo,
});

/**
 * D-31: the password or a fresh Google sign-in, before an email change or account deletion. The
 * Google proof is the same credential sign-in takes, so a Windows account (authorization code +
 * PKCE) can re-authenticate too.
 */
export const Reauthentication = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('password'), password: Password }),
  z.strictObject({ method: z.literal('google'), credential: GoogleCredential }),
]);

export const RefreshRequest = z.strictObject({ refreshToken: z.string().min(1).max(512) });
export const DeviceParams = z.strictObject({ deviceId: Id });
export const DeviceList = z.object({ devices: z.array(Device) });

export const ChangePasswordRequest = z.strictObject({
  currentPassword: Password,
  newPassword: Password,
});
export const ChangeEmailRequest = z.strictObject({
  newEmail: Email,
  reauthentication: Reauthentication,
});
export const ConfirmEmailChangeRequest = z.strictObject({ token: EmailToken });
export const RequestPasswordResetRequest = z.strictObject({ email: Email });
export const ResetPasswordRequest = z.strictObject({
  token: EmailToken,
  newPassword: Password,
});

/** AUTH-12, R-15: confirm the timezone; the server creates the starter tags (TAG-07). */
export const CompleteFirstSignInRequest = z.strictObject({
  ...commandFields,
  timezone: TimeZoneName,
});
export const CompleteFirstSignInResult = z.object({
  revision: Revision,
  preferences: Preferences,
  tags: z.array(Tag),
});

/** AUTH-08 / US-4.6: type DELETE plus password or Google re-authentication. */
export const DeleteAccountRequest = z.strictObject({
  confirmation: z.literal('DELETE'),
  reauthentication: Reauthentication,
});
