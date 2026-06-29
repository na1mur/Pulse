import axios from "axios";
import type { TokenStorage } from "./index";

const DEFAULT_REFRESH_BUFFER_MS = 60_000;
const PROACTIVE_REFRESH_LEAD_MS = 2 * 60_000;

async function resolve<T>(value: T | Promise<T>): Promise<T> {
  return value;
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  const encodedPayload = parts[1];
  if (!encodedPayload) return null;

  try {
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    if (typeof atob !== "function") return null;
    const json = atob(padded);
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

export function getAccessTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (typeof payload?.exp !== "number") return null;
  return payload.exp * 1000;
}

export function isAccessTokenExpired(
  token: string,
  bufferMs = DEFAULT_REFRESH_BUFFER_MS,
): boolean {
  const expiryMs = getAccessTokenExpiryMs(token);
  if (!expiryMs) return true;
  return Date.now() >= expiryMs - bufferMs;
}

function getRefreshErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: number } }).response?.status ===
      "number"
  ) {
    return (error as { response: { status: number } }).response.status;
  }
  return undefined;
}

const refreshPromises = new WeakMap<TokenStorage, Promise<string | null>>();

export interface RefreshTokensOptions {
  onTokenRefreshed?: () => void;
  onSessionExpired?: () => void;
}

export async function refreshTokens(
  baseURL: string,
  storage: TokenStorage,
  options?: RefreshTokensOptions,
): Promise<string | null> {
  const existing = refreshPromises.get(storage);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const refreshToken = await resolve(storage.getRefreshToken());
      if (!refreshToken) return null;

      const response = await axios.post(`${baseURL}/auth/refresh`, {
        refreshToken,
      });

      const { accessToken, refreshToken: newRefreshToken } = response.data;
      await resolve(storage.setTokens(accessToken, newRefreshToken));
      options?.onTokenRefreshed?.();
      return accessToken as string;
    } catch (error) {
      const status = getRefreshErrorStatus(error);
      if (status === 401 || status === 400) {
        await resolve(storage.clearTokens());
        options?.onSessionExpired?.();
      }
      return null;
    } finally {
      refreshPromises.delete(storage);
    }
  })();

  refreshPromises.set(storage, promise);
  return promise;
}

export async function ensureValidAccessToken(
  baseURL: string,
  storage: TokenStorage,
  options?: RefreshTokensOptions,
): Promise<boolean> {
  const refreshToken = await resolve(storage.getRefreshToken());
  if (!refreshToken) return false;

  const accessToken = await resolve(storage.getAccessToken());
  if (accessToken && !isAccessTokenExpired(accessToken)) {
    return true;
  }

  const newAccessToken = await refreshTokens(baseURL, storage, options);
  return newAccessToken !== null;
}

const schedulerTimers = new WeakMap<
  TokenStorage,
  ReturnType<typeof setTimeout>
>();

export function startTokenRefreshScheduler(
  baseURL: string,
  storage: TokenStorage,
  options?: RefreshTokensOptions,
): () => void {
  stopTokenRefreshScheduler(storage);

  const scheduleNext = async () => {
    const accessToken = await resolve(storage.getAccessToken());
    if (!accessToken) return;

    const expiryMs = getAccessTokenExpiryMs(accessToken);
    if (!expiryMs) return;

    const delay = Math.max(
      expiryMs - PROACTIVE_REFRESH_LEAD_MS - Date.now(),
      0,
    );
    const timer = setTimeout(async () => {
      schedulerTimers.delete(storage);

      const refreshToken = await resolve(storage.getRefreshToken());
      if (!refreshToken) return;

      const currentAccessToken = await resolve(storage.getAccessToken());
      if (
        currentAccessToken &&
        !isAccessTokenExpired(currentAccessToken, PROACTIVE_REFRESH_LEAD_MS)
      ) {
        scheduleNext();
        return;
      }

      const refreshed = await refreshTokens(baseURL, storage, options);
      if (refreshed) {
        scheduleNext();
      }
    }, delay);

    schedulerTimers.set(storage, timer);
  };

  void scheduleNext();

  return () => stopTokenRefreshScheduler(storage);
}

export function stopTokenRefreshScheduler(storage: TokenStorage): void {
  const timer = schedulerTimers.get(storage);
  if (timer) {
    clearTimeout(timer);
    schedulerTimers.delete(storage);
  }
}
