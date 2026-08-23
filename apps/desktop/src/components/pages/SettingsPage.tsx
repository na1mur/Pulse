import { useState } from "react";
import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
  useUserSettings,
} from "@/hooks/usePulseQueries";
import { useDesktopSettings } from "@/hooks/useDesktopSettings";

interface SettingsPageProps {
  onLogout: () => void;
}

function getTagErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const data = (
      error as { response?: { data?: { error?: unknown } } }
    ).response?.data;
    if (typeof data?.error === "string") return data.error;
  }
  return "Could not save that tag. Try a different name.";
}

function SettingToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-primary"
      />
    </div>
  );
}

function TagManager() {
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setError(null);
    try {
      await deleteTag.mutateAsync(pendingDelete.id);
      if (editingId === pendingDelete.id) {
        setEditingId(null);
        setEditingName("");
      }
      setPendingDelete(null);
    } catch (err) {
      setError(getTagErrorMessage(err));
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag name"
          maxLength={50}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!newName.trim() || createTag.isPending}
          onClick={() => void handleAdd()}
        >
          Add
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-2 px-3 py-2">
              {editingId === tag.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={50}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSaveEdit();
                      }
                      if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleSaveEdit()}
                    disabled={!editingName.trim() || updateTag.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-foreground">
                    {tag.name}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditingName(tag.name);
                      setError(null);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setPendingDelete({ id: tag.id, name: tag.name })
                    }
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <AppDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete tag"
        maxWidthClassName="max-w-md"
        scrollable={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deleteTag.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {pendingDelete
            ? `"${pendingDelete.name}" will be removed. Sessions using this tag will become untagged.`
            : null}
        </p>
      </AppDialog>
    </>
  );
}

export function SettingsPage({ onLogout }: SettingsPageProps) {
  const { data: settings } = useUserSettings();
  const {
    settings: desktopSettings,
    loaded,
    updateSettings,
  } = useDesktopSettings();
  const isElectron = Boolean(window.electron?.isDesktop);

  return (
    <div className="max-w-2xl space-y-6">
      {isElectron && loaded ? (
        <Card className="p-6 space-y-6">
          <h3 className="text-lg font-semibold text-foreground">Desktop</h3>
          <div className="space-y-4">
            <SettingToggle
              id="minimize-to-tray"
              label="Minimize to system tray on close"
              description="Keep Pulse running in the background when you close the window so timer sync stays active."
              checked={desktopSettings.minimizeToTray}
              onCheckedChange={(checked) =>
                void updateSettings({ minimizeToTray: checked })
              }
            />
            <SettingToggle
              id="open-at-login"
              label="Launch at login"
              description="Start Pulse automatically when you sign in to Windows."
              checked={desktopSettings.openAtLogin}
              onCheckedChange={(checked) =>
                void updateSettings({ openAtLogin: checked })
              }
            />
          </div>
        </Card>
      ) : null}

      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <ThemeToggle />
            <p className="text-xs text-muted-foreground mt-2">
              Choose how Pulse looks on your device
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Tags</h3>
          <p className="text-xs text-muted-foreground">
            Add, rename, or delete tags used when starting a session. Deleting a
            tag untags past sessions that used it.
          </p>
        </div>
        <TagManager />
      </Card>

      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Account</h3>
        <div className="space-y-4">
          {settings?.name ? (
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm font-medium text-foreground">
                {settings.name}
              </p>
            </div>
          ) : null}
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-sm text-foreground">{settings?.email ?? "—"}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">About</h3>
        <p className="text-sm text-muted-foreground">Version 0.0.5</p>
      </Card>

      <Card className="p-6 space-y-4 border-destructive/30">
        <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
        <Button variant="destructive" onClick={onLogout} className="gap-2">
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </Card>
    </div>
  );
}
