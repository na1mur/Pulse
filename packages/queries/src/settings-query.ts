import type { AxiosInstance } from "axios";
import type { UserSettings } from "@repo/types";
import { queryKeys } from "./query-keys";

export const settingsQueryOptions = (api: AxiosInstance) => ({
  queryKey: queryKeys.settings,
  queryFn: async () => (await api.get("/settings")).data as UserSettings,
  staleTime: 0,
  refetchOnMount: "always" as const,
});
