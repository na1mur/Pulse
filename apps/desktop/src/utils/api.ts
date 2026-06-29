import {
  createApiClient,
  createLocalStorageAdapter,
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

const storage = createLocalStorageAdapter();

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
