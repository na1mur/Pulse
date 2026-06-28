import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:3001",
});

// Interceptor to attach access token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pulse-access-token");
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
        const refreshToken = localStorage.getItem("pulse-refresh-token");
        if (!refreshToken) throw new Error("No refresh token");

        const response = await axios.post(
          "http://localhost:3001/auth/refresh",
          {
            refreshToken,
          },
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        localStorage.setItem("pulse-access-token", accessToken);
        localStorage.setItem("pulse-refresh-token", newRefreshToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (err) {
        console.error("Session expired:", err);
        localStorage.removeItem("pulse-access-token");
        localStorage.removeItem("pulse-refresh-token");
      }
    }
    return Promise.reject(error);
  },
);
