import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const StorageKeys = {
  TOKEN: "token",
  REFRESH_TOKEN: "refresh_token",
  ROLE: "role",
  USERNAME: "username",
  EMAIL: "email",
  PROFILE_COMPLETED: "profile_completed",
  KYC_STATUS: "kyc_status",
  SERVICES: "services",
  VIEWED_SERVICES: "viewed_services",
  SEARCH_HISTORY: "search_history",
} as const;

const sensitiveKeys = new Set<string>([StorageKeys.TOKEN, StorageKeys.REFRESH_TOKEN]);
const canUseSecureStore = Platform.OS !== "web";

export async function getItem(key: string): Promise<string | null> {
  if (canUseSecureStore && sensitiveKeys.has(key)) {
    const value = await SecureStore.getItemAsync(key);
    if (value !== null) return value;
    // Migrate credentials saved by older builds from AsyncStorage into the OS keychain.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    }
    return legacy;
  }
  return AsyncStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (canUseSecureStore && sensitiveKeys.has(key)) {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeItems(keys: string[]): Promise<void> {
  const secureKeys = canUseSecureStore ? keys.filter((key) => sensitiveKeys.has(key)) : [];
  const regularKeys = keys.filter((key) => !sensitiveKeys.has(key) || !canUseSecureStore);
  await Promise.all(secureKeys.map((key) => SecureStore.deleteItemAsync(key)));
  if (regularKeys.length) await AsyncStorage.multiRemove(regularKeys);
}
