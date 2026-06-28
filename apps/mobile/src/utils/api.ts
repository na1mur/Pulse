import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const api = axios.create({
  baseURL: "http://localhost:3001", // Or use local computer's IP address (e.g. 192.168.x.x) for physical testing
});

// Interceptor to attach access token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("pulse-access-token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to handle token refresh automatically
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem("pulse-refresh-token");
        if (!refreshToken) throw new Error("No refresh token");

        const response = await axios.post(
          "http://localhost:3001/auth/refresh",
          {
            refreshToken,
          },
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        await AsyncStorage.setItem("pulse-access-token", accessToken);
        await AsyncStorage.setItem("pulse-refresh-token", newRefreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (err) {
        console.error("Session expired:", err);
        await AsyncStorage.removeItem("pulse-access-token");
        await AsyncStorage.removeItem("pulse-refresh-token");
      }
    }
    return Promise.reject(error);
  },
);
