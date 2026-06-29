import {
  createApiClient,
  createLocalStorageAdapter,
  TOKEN_KEYS,
} from "@repo/api-client";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = createApiClient({
  baseURL,
  storage: createLocalStorageAdapter(),
});

export { TOKEN_KEYS };
