import {
  activateUserSession,
  createApiClient,
  createLocalStorageAdapter,
  createUserScopedStorage,
  ensureValidAccessToken,
  startTokenRefreshScheduler,
  stopTokenRefreshScheduler,
  TOKEN_KEYS,
} from "@repo/api-client";
import {
  reconnectTimerSocket,
  runTokenRefreshHandler,
} from "@/hooks/useSocketSync";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const rawStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  },
};

const storage = createLocalStorageAdapter();

export const userScopedAppStorage = createUserScopedStorage(rawStorage);

export { rawStorage };

function notifySessionChanged() {
  window.dispatchEvent(new Event("pulse-session-changed"));
}

const tokenCallbacks = {
  onTokenRefreshed: () => {
    runTokenRefreshHandler();
    reconnectTimerSocket();
    notifySessionChanged();
  },
  onSessionExpired: () => {
    stopSessionTokenRefresh();
    activateUserSession(null);
    notifySessionChanged();
  },
};

let stopTokenRefresh = () => {};

export async function hasValidSession(): Promise<boolean> {
  return ensureValidAccessToken(baseURL, storage, tokenCallbacks);
}

export function startSessionTokenRefresh(): void {
  stopTokenRefresh();
  stopTokenRefresh = startTokenRefreshScheduler(
    baseURL,
    storage,
    tokenCallbacks,
  );
}

export function stopSessionTokenRefresh(): void {
  stopTokenRefresh();
  stopTokenRefreshScheduler(storage);
}

export const api = createApiClient({
  baseURL,
  storage,
  ...tokenCallbacks,
});

export { TOKEN_KEYS, storage };
