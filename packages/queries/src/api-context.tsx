import { createContext, useContext, type ReactNode } from "react";
import type { AxiosInstance } from "axios";

const ApiContext = createContext<AxiosInstance | null>(null);

export function ApiProvider({
  api,
  children,
}: {
  api: AxiosInstance;
  children: ReactNode;
}) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi() {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error("useApi must be used within ApiProvider");
  }
  return api;
}
