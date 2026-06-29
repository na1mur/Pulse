import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createAsyncStorageAdapter,
  createApiClient,
  ensureValidAccessToken,
  startTokenRefreshScheduler,
  stopTokenRefreshScheduler,
  TOKEN_KEYS,
  type TokenStorage,
} from "@repo/api-client";
import { router } from "expo-router";
import { reconnectTimerSocket } from "@/hooks/useSocketSync";

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

const webStorage = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(
      typeof localStorage !== "undefined" ? localStorage.getItem(key) : null,
    ),
  setItem: (key: string, value: string): Promise<void> => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
    return Promise.resolve();
  },
};

const storageBackend = Platform.OS === "web" ? webStorage : AsyncStorage;

export const tokenStorage: TokenStorage =
  createAsyncStorageAdapter(storageBackend);

/** Shared storage for non-token keys (theme, goal prefs, email). */
export const appStorage = storageBackend;

const tokenCallbacks = {
  onTokenRefreshed: () => {
    tokenRefreshHandler?.();
    void reconnectTimerSocket();
  },
  onSessionExpired: () => {
    stopTokenRefresh();
    router.replace("/(auth)/login");
  },
};

let tokenRefreshHandler: (() => void) | undefined;
let stopTokenRefresh = () => {};

export function setTokenRefreshHandler(handler: () => void) {
  tokenRefreshHandler = handler;
}

export async function hasValidSession(): Promise<boolean> {
  return ensureValidAccessToken(baseURL, tokenStorage, tokenCallbacks);
}

export function startSessionTokenRefresh(): void {
  stopTokenRefresh();
  stopTokenRefresh = startTokenRefreshScheduler(
    baseURL,
    tokenStorage,
    tokenCallbacks,
  );
}

export function stopSessionTokenRefresh(): void {
  stopTokenRefresh();
  stopTokenRefreshScheduler(tokenStorage);
}

export const api = createApiClient({
  baseURL,
  storage: tokenStorage,
  ...tokenCallbacks,
});

export { TOKEN_KEYS };
