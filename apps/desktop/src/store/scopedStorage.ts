import {
  createUserScopedPersistStorage,
  type PersistStateStorage,
} from "@repo/api-client";

const localPersistStorage: PersistStateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
  },
};

export const scopedPersistStorage =
  createUserScopedPersistStorage(localPersistStorage);
