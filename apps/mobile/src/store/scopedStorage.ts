import { createUserScopedPersistStorage } from "@repo/api-client";
import { asyncStorage } from "./storage";

export const scopedPersistStorage =
  createUserScopedPersistStorage(asyncStorage);
