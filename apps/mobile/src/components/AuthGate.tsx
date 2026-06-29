import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import {
  hasValidSession,
  startSessionTokenRefresh,
  stopSessionTokenRefresh,
} from "@/utils/api";

export function AuthGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | undefined>(
    undefined,
  );

  useEffect(() => {
    let active = true;

    hasValidSession().then((valid) => {
      if (!active) return;
      setAuthenticated(valid);
      if (valid) {
        startSessionTokenRefresh();
      }
    });

    return () => {
      active = false;
      stopSessionTokenRefresh();
    };
  }, []);

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
