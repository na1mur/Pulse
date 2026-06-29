import axios, { type AxiosInstance } from "axios";

export interface TokenStorage {
  getAccessToken(): Promise<string | null> | string | null;
  getRefreshToken(): Promise<string | null> | string | null;
  setTokens(accessToken: string, refreshToken: string): Promise<void> | void;
  clearTokens(): Promise<void> | void;
}

export interface CreateApiClientOptions {
  baseURL: string;
  storage: TokenStorage;
  onSessionExpired?: () => void;
  onTokenRefreshed?: () => void;
}

async function resolve<T>(value: T | Promise<T>): Promise<T> {
  return value;
}

export function createApiClient({
  baseURL,
  storage,
  onSessionExpired,
  onTokenRefreshed,
}: CreateApiClientOptions): AxiosInstance {
  const api = axios.create({ baseURL });

  api.interceptors.request.use(async (config) => {
    const token = await resolve(storage.getAccessToken());
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config as typeof error.config & {
        _retry?: boolean;
      };

      if (
        error.response?.status === 401 &&
        originalRequest &&
        !originalRequest._retry
      ) {
        originalRequest._retry = true;
        try {
          const refreshToken = await resolve(storage.getRefreshToken());
          if (!refreshToken) throw new Error("No refresh token");

          const response = await axios.post(`${baseURL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data;
          await resolve(storage.setTokens(accessToken, newRefreshToken));
          onTokenRefreshed?.();

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          return api(originalRequest);
        } catch (err) {
          console.error("Session expired:", err);
          await resolve(storage.clearTokens());
          onSessionExpired?.();
        }
      }
      return Promise.reject(error);
    },
  );

  return api;
}

export const TOKEN_KEYS = {
  access: "pulse-access-token",
  refresh: "pulse-refresh-token",
  email: "pulse-user-email",
} as const;

export function createLocalStorageAdapter(): TokenStorage {
  return {
    getAccessToken: () => localStorage.getItem(TOKEN_KEYS.access),
    getRefreshToken: () => localStorage.getItem(TOKEN_KEYS.refresh),
    setTokens: (accessToken, refreshToken) => {
      localStorage.setItem(TOKEN_KEYS.access, accessToken);
      localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
    },
    clearTokens: () => {
      localStorage.removeItem(TOKEN_KEYS.access);
      localStorage.removeItem(TOKEN_KEYS.refresh);
      localStorage.removeItem(TOKEN_KEYS.email);
    },
  };
}

export function createAsyncStorageAdapter(asyncStorage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}): TokenStorage {
  return {
    getAccessToken: () => asyncStorage.getItem(TOKEN_KEYS.access),
    getRefreshToken: () => asyncStorage.getItem(TOKEN_KEYS.refresh),
    setTokens: async (accessToken, refreshToken) => {
      await asyncStorage.setItem(TOKEN_KEYS.access, accessToken);
      await asyncStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
    },
    clearTokens: async () => {
      await asyncStorage.removeItem(TOKEN_KEYS.access);
      await asyncStorage.removeItem(TOKEN_KEYS.refresh);
      await asyncStorage.removeItem(TOKEN_KEYS.email);
    },
  };
}
