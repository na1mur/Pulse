import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createAsyncStorageAdapter,
  createApiClient,
  TOKEN_KEYS,
  type TokenStorage,
} from "@repo/api-client";
import { router } from "expo-router";

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

export async function hasValidSession(): Promise<boolean> {
  const [access, refresh] = await Promise.all([
    tokenStorage.getAccessToken(),
    tokenStorage.getRefreshToken(),
  ]);
  return Boolean(access && refresh);
}

let tokenRefreshHandler: (() => void) | undefined;

export function setTokenRefreshHandler(handler: () => void) {
  tokenRefreshHandler = handler;
}

export const api = createApiClient({
  baseURL,
  storage: tokenStorage,
  onSessionExpired: () => {
    router.replace("/(auth)/login");
  },
  onTokenRefreshed: () => {
    tokenRefreshHandler?.();
    void reconnectTimerSocket();
  },
});

export { TOKEN_KEYS };
