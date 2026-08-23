import { useState } from "react";
import {
  View,
  Text,
  Platform,
  TextInput,
  Alert,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react-native";
import { deactivateUserSession } from "@repo/queries";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen, ScreenScroll } from "@/components/Screen";
import { ThemeSelector } from "@/components/ThemeToggle";
import { ThemedText } from "@/components/ThemeShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
  useUserSettings,
} from "@/hooks/usePulseQueries";
import { useThemeColors } from "@/hooks/useThemeColors";
import { stopSessionTokenRefresh, tokenStorage } from "@/utils/api";
import { openBatteryOptimizationSettings } from "@/utils/batteryOptimization";

function getTagErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const data = (
      error as { response?: { data?: { error?: unknown } } }
    ).response?.data;
    if (typeof data?.error === "string") return data.error;
  }
  return "Could not save that tag. Try a different name.";
}

function TagManager() {
  const colors = useThemeColors();
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.input,
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      await createTag.mutateAsync(name);
      setNewName("");
    } catch (err) {
      setError(getTagErrorMessage(err));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setError(null);
    try {
      await updateTag.mutateAsync({ id: editingId, name });
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setError(getTagErrorMessage(err));
    }
  };

  const handleDelete = (tag: { id: string; name: string }) => {
    Alert.alert(
      "Delete tag",
      `"${tag.name}" will be removed. Sessions using this tag will become untagged.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setError(null);
              try {
                await deleteTag.mutateAsync(tag.id);
                if (editingId === tag.id) {
                  setEditingId(null);
                  setEditingName("");
                }
              } catch (err) {
                setError(getTagErrorMessage(err));
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New tag name"
          placeholderTextColor={colors.muted}
          maxLength={50}
          style={[inputStyle, { flex: 1 }]}
          onSubmitEditing={() => void handleAdd()}
        />
        <Button
          label="Add"
          variant="outline"
          disabled={!newName.trim() || createTag.isPending}
          onPress={() => void handleAdd()}
        />
      </View>
      {error ? (
        <ThemedText className="text-sm" destructive>
          {error}
        </ThemedText>
      ) : null}
      {tags.length === 0 ? (
        <ThemedText className="text-sm text-neutral-500">No tags yet.</ThemedText>
      ) : (
        <View
          className="rounded-lg overflow-hidden"
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          {tags.map((tag, index) => (
            <View
              key={tag.id}
              className="flex-row items-center gap-2 px-3 py-2"
              style={
                index < tags.length - 1
                  ? { borderBottomWidth: 1, borderBottomColor: colors.border }
                  : undefined
              }
            >
              {editingId === tag.id ? (
                <>
                  <TextInput
                    value={editingName}
                    onChangeText={setEditingName}
                    maxLength={50}
                    style={[inputStyle, { flex: 1, paddingVertical: 6 }]}
                    autoFocus
                    onSubmitEditing={() => void handleSaveEdit()}
                  />
                  <Pressable
                    onPress={() => void handleSaveEdit()}
                    disabled={!editingName.trim() || updateTag.isPending}
                  >
                    <ThemedText className="text-sm font-medium">Save</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setEditingId(null)}>
                    <ThemedText className="text-sm text-neutral-500">
                      Cancel
                    </ThemedText>
                  </Pressable>
                </>
              ) : (
                <>
                  <ThemedText className="flex-1 text-sm">{tag.name}</ThemedText>
                  <Pressable
                    onPress={() => {
                      setEditingId(tag.id);
                      setEditingName(tag.name);
                      setError(null);
                    }}
                  >
                    <ThemedText className="text-sm font-medium">
                      Rename
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(tag)}>
                    <ThemedText className="text-sm font-medium" destructive>
                      Delete
                    </ThemedText>
                  </Pressable>
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const { data: settings } = useUserSettings();

  const handleLogout = async () => {
    stopSessionTokenRefresh();
    deactivateUserSession(queryClient);
    await tokenStorage.clearTokens();
    router.replace("/(auth)/login");
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" showBack hideSettings />
      <ScreenScroll>
        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Appearance</ThemedText>
          <ThemeSelector />
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Tags</ThemedText>
          <ThemedText className="text-sm text-neutral-500">
            Add, rename, or delete tags used when starting a session. Deleting a
            tag untags past sessions that used it.
          </ThemedText>
          <TagManager />
        </Card>

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">Account</ThemedText>
          {settings?.name ? (
            <View
              className="p-3 rounded-lg"
              style={{ backgroundColor: colors.mutedSurface }}
            >
              <ThemedText className="font-medium">{settings.name}</ThemedText>
            </View>
          ) : null}
          <View
            className="p-3 rounded-lg"
            style={{ backgroundColor: colors.mutedSurface }}
          >
            <ThemedText>{settings?.email ?? "—"}</ThemedText>
          </View>
        </Card>

        {Platform.OS === "android" ? (
          <Card className="p-4 gap-3">
            <ThemedText className="text-lg font-semibold">
              Background sync
            </ThemedText>
            <ThemedText className="text-sm text-neutral-500">
              Allow Pulse to stay active while your timer is running so desktop
              and mobile stay in sync. Disable battery optimization for the best
              results on Android 12 and newer.
            </ThemedText>
            <Button
              variant="outline"
              onPress={() => void openBatteryOptimizationSettings()}
            >
              <Text style={{ color: colors.foreground, fontSize: 14 }}>
                Open battery optimization settings
              </Text>
            </Button>
          </Card>
        ) : null}

        <Card className="p-4 gap-3">
          <ThemedText className="text-lg font-semibold">About</ThemedText>
          <ThemedText className="text-sm text-neutral-500">
            Version 0.0.5
          </ThemedText>
        </Card>

        <Card
          className="p-4 gap-3"
          style={{ borderColor: `${colors.destructive}66` }}
        >
          <ThemedText className="text-lg font-semibold" destructive>
            Danger Zone
          </ThemedText>
          <Button variant="destructive" onPress={handleLogout}>
            <LogOut size={16} color={colors.destructive} />
            <Text
              style={{
                color: colors.destructive,
                marginLeft: 8,
                fontSize: 14,
                fontWeight: "500",
              }}
            >
              Logout
            </Text>
          </Button>
        </Card>
      </ScreenScroll>
    </Screen>
  );
}
