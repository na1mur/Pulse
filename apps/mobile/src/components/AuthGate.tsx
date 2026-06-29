import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getUserIdFromAccessToken } from "@repo/api-client";
import { bootstrapUserSession } from "@repo/queries";
import {
  appStorage,
  hasValidSession,
  startSessionTokenRefresh,
  stopSessionTokenRefresh,
  tokenStorage,
} from "@/utils/api";
import { rehydrateUserPersistedStores } from "@/store/rehydrateUserStores";

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [authenticated, setAuthenticated] = useState<boolean | undefined>(
    undefined,
  );

  useEffect(() => {
    let active = true;

    async function initAuth() {
      const valid = await hasValidSession();
      if (!active) return;

      if (valid) {
        const accessToken = await tokenStorage.getAccessToken();
        const userId = accessToken
          ? getUserIdFromAccessToken(accessToken)
          : null;

        if (userId) {
          await bootstrapUserSession({
            userId,
            queryClient,
            rehydrateStores: rehydrateUserPersistedStores,
            goalStorageBackend: appStorage,
          });
        }

        startSessionTokenRefresh();
      }

      setAuthenticated(valid);
    }

    void initAuth();

    return () => {
      active = false;
      stopSessionTokenRefresh();
    };
  }, [queryClient]);

  if (authenticated === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (!authenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return children;
}
