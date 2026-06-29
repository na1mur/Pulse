import {
  createApiClient,
  createLocalStorageAdapter,
  TOKEN_KEYS,
} from "@repo/api-client";
import {
  reconnectTimerSocket,
  runTokenRefreshHandler,
} from "@/hooks/useSocketSync";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function notifySessionChanged() {
  window.dispatchEvent(new Event("pulse-session-changed"));
}

export const api = createApiClient({
  baseURL,
  storage: createLocalStorageAdapter(),
  onTokenRefreshed: () => {
    runTokenRefreshHandler();
    reconnectTimerSocket();
    notifySessionChanged();
  },
  onSessionExpired: () => {
    notifySessionChanged();
  },
});

export { TOKEN_KEYS };
