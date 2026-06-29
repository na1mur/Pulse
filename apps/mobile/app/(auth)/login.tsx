import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { bootstrapUserSession } from "@repo/queries";
import type { User } from "@repo/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeShell, ThemedText } from "@/components/ThemeShell";
import { Button } from "@/components/ui/Button";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  appStorage,
  startSessionTokenRefresh,
  tokenStorage,
  TOKEN_KEYS,
} from "@/utils/api";
import { rehydrateUserPersistedStores } from "@/store/rehydrateUserStores";

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const inputStyle = {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.input,
    paddingHorizontal: 12,
    color: colors.foreground,
  };

  const handleSubmit = async () => {
    setError(null);
    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    const url = isLogin ? `${baseURL}/auth/login` : `${baseURL}/auth/register`;

    try {
      const response = await axios.post(url, { email, password });
      const { accessToken, refreshToken, user } = response.data as {
        accessToken: string;
        refreshToken: string;
        user: User;
      };
      await tokenStorage.setTokens(accessToken, refreshToken);
      await appStorage.setItem(TOKEN_KEYS.email, email);
      await bootstrapUserSession({
        userId: user.id,
        queryClient,
        rehydrateStores: rehydrateUserPersistedStores,
        goalStorageBackend: appStorage,
      });
      startSessionTokenRefresh();
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: unknown } } };
      const apiError = axiosErr.response?.data?.error;
      setError(
        typeof apiError === "string"
          ? apiError
          : "An unexpected error occurred.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemeShell className="justify-center p-4">
      <View className="absolute top-12 right-4">
        <ThemeToggle />
      </View>

      <ScrollView
        contentContainerClassName="grow justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <View className="w-full max-w-md self-center gap-6">
          <View className="items-center gap-2">
            <Image
              source={require("../../../assets/branding/logo-wordmark.png")}
              style={{ width: 192, height: 192 }}
              resizeMode="contain"
              accessibilityLabel="Pulse"
            />
            <ThemedText className="text-neutral-500 text-center">
              {isLogin
                ? "Welcome back. Let's track your productivity."
                : "Create an account to start tracking your time."}
            </ThemedText>
          </View>

          {error && (
            <Text
              style={{
                color: colors.destructive,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
          )}

          <View className="gap-4">
            <View className="gap-2">
              <ThemedText className="text-sm font-medium">Email</ThemedText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                style={inputStyle}
                placeholderTextColor={colors.muted}
              />
            </View>

            <View className="gap-2">
              <ThemedText className="text-sm font-medium">Password</ThemedText>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                style={inputStyle}
                placeholderTextColor={colors.muted}
              />
            </View>

            {!isLogin && (
              <View className="gap-2">
                <ThemedText className="text-sm font-medium">
                  Confirm Password
                </ThemedText>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
            )}

            <Button
              label={isLogin ? "Sign In" : "Create Account"}
              size="lg"
              onPress={handleSubmit}
              disabled={isLoading}
              className="mt-2"
            />
          </View>

          <Pressable
            onPress={() => setIsLogin(!isLogin)}
            className="items-center"
          >
            <ThemedText className="text-sm text-neutral-500">
              {isLogin
                ? "Don't have an account? "
                : "Already have an account? "}
              <Text style={{ color: colors.foreground, fontWeight: "500" }}>
                {isLogin ? "Sign up" : "Sign in"}
              </Text>
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemeShell>
  );
}
