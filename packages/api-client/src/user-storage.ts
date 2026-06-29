import { decodeJwtPayload } from "./tokens";

let activeUserId: string | null = null;

export const GOAL_STORAGE_KEYS = {
  daily: "pulse-last-goal-hours",
  weekly: "pulse-last-weekly-goal-hours",
  monthly: "pulse-last-monthly-goal-hours",
} as const;

export const PERSIST_STORE_KEYS = {
  timer: "pulse-timer-storage",
  offline: "pulse-offline-storage",
} as const;

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface PersistStateStorage {
  getItem(name: string): Promise<string | null> | string | null;
  setItem(name: string, value: string): Promise<void> | void;
  removeItem(name: string): Promise<void> | void;
}

export interface GoalSettingsSnapshot {
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  monthlyTargetMinutes: number;
}

export function activateUserSession(userId: string | null): void {
  activeUserId = userId;
}

export function getActiveUserId(): string | null {
  return activeUserId;
}

export function getUserIdFromAccessToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.userId === "string" ? payload.userId : null;
}

export function scopeStorageKey(userId: string, key: string): string {
  return `pulse:${userId}:${key}`;
}

async function resolve<T>(value: T | Promise<T>): Promise<T> {
  return value;
}

export function createUserScopedStorage(
  backend: KeyValueStorage,
  getUserId: () => string | null = getActiveUserId,
): KeyValueStorage {
  return {
    getItem: async (key) => {
      const userId = getUserId();
      if (!userId) return null;
      return resolve(backend.getItem(scopeStorageKey(userId, key)));
    },
    setItem: async (key, value) => {
      const userId = getUserId();
      if (!userId) return;
      await resolve(backend.setItem(scopeStorageKey(userId, key), value));
    },
    removeItem: async (key) => {
      const userId = getUserId();
      if (!userId) return;
      await resolve(backend.removeItem(scopeStorageKey(userId, key)));
    },
  };
}

export function createUserScopedPersistStorage(
  baseStorage: PersistStateStorage,
  getUserId: () => string | null = getActiveUserId,
): PersistStateStorage {
  return {
    getItem: async (name) => {
      const userId = getUserId();
      if (!userId) return null;

      const scopedKey = scopeStorageKey(userId, name);
      const scopedValue = await resolve(baseStorage.getItem(scopedKey));
      if (scopedValue !== null) {
        return scopedValue;
      }

      const legacyValue = await resolve(baseStorage.getItem(name));
      if (legacyValue !== null) {
        await resolve(baseStorage.setItem(scopedKey, legacyValue));
        return legacyValue;
      }

      return null;
    },
    setItem: async (name, value) => {
      const userId = getUserId();
      if (!userId) return;
      await resolve(baseStorage.setItem(scopeStorageKey(userId, name), value));
    },
    removeItem: async (name) => {
      const userId = getUserId();
      if (!userId) return;
      await resolve(baseStorage.removeItem(scopeStorageKey(userId, name)));
    },
  };
}

export async function persistGoalSettingsToLocal(
  storage: KeyValueStorage,
  settings: GoalSettingsSnapshot,
): Promise<void> {
  const dailyHours = Math.round(settings.dailyTargetMinutes / 60);
  const weeklyHours = Math.round(settings.weeklyTargetMinutes / 60);
  const monthlyHours = Math.round(settings.monthlyTargetMinutes / 60);

  if (settings.dailyTargetMinutes > 0) {
    await resolve(
      storage.setItem(GOAL_STORAGE_KEYS.daily, String(dailyHours || 8)),
    );
  }

  if (settings.weeklyTargetMinutes > 0) {
    await resolve(
      storage.setItem(GOAL_STORAGE_KEYS.weekly, String(weeklyHours || 40)),
    );
  }

  if (settings.monthlyTargetMinutes > 0) {
    await resolve(
      storage.setItem(GOAL_STORAGE_KEYS.monthly, String(monthlyHours || 160)),
    );
  }
}

export function parsePersistedJsonState<T extends object>(
  raw: string | null,
  fallback: T,
): T {
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { state?: Partial<T> };
    if (parsed.state && typeof parsed.state === "object") {
      return { ...fallback, ...parsed.state };
    }
  } catch {
    // Ignore malformed persisted state.
  }

  return fallback;
}

export async function migrateLegacyGoalStorage(
  backend: KeyValueStorage,
  userId: string,
): Promise<void> {
  const scoped = createUserScopedStorage(backend, () => userId);
  const legacyKeys = [
    GOAL_STORAGE_KEYS.daily,
    GOAL_STORAGE_KEYS.weekly,
    GOAL_STORAGE_KEYS.monthly,
  ] as const;

  for (const key of legacyKeys) {
    const scopedValue = await resolve(scoped.getItem(key));
    if (scopedValue !== null) continue;

    const legacyValue = await resolve(backend.getItem(key));
    if (legacyValue !== null) {
      await resolve(scoped.setItem(key, legacyValue));
    }
  }
}
