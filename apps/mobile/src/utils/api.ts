import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createApiClient,
  createAsyncStorageAdapter,
  TOKEN_KEYS,
} from "@repo/api-client";

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export const api = createApiClient({
  baseURL,
  storage: createAsyncStorageAdapter(AsyncStorage),
});

export { TOKEN_KEYS };
