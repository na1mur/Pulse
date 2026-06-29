import {
  createApiClient,
  createLocalStorageAdapter,
  TOKEN_KEYS,
} from "@repo/api-client";
import { reconnectTimerSocket } from "@/hooks/useSocketSync";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = createApiClient({
  baseURL,
  storage: createLocalStorageAdapter(),
  onTokenRefreshed: () => {
    reconnectTimerSocket();
  },
});

export { TOKEN_KEYS };
