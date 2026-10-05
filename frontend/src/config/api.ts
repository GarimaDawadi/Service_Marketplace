import Constants from "expo-constants";
import { Platform } from "react-native";

export const API_PORT = 8001;

function configuredApiUrl(): string | null {
  const publicUrl = process.env.EXPO_PUBLIC_API_URL;
  const extra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  const value = publicUrl?.trim() || extra?.trim();
  return value ? normalizeBaseUrl(value) : null;
}

function hostFromExpo(): string | null {
  const debuggerHost = Constants.expoGoConfig?.debuggerHost;
  if (debuggerHost) return debuggerHost.split(":")[0];
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return hostUri.split(":")[0];
  const manifest = (Constants as { manifest?: { debuggerHost?: string } }).manifest;
  if (manifest?.debuggerHost) return manifest.debuggerHost.split(":")[0];
  return null;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function isTunnelHost(host: string): boolean {
  const value = host.toLowerCase();
  return value.includes("ngrok") || value.endsWith(".exp.direct") || value.includes("expo.dev");
}

export function getApiBaseUrl(): string {
  const configured = configuredApiUrl();
  if (configured) return configured;

  const host = hostFromExpo();
  if (host && host !== "localhost" && host !== "127.0.0.1" && !isTunnelHost(host)) {
    return `http://${host}:${API_PORT}/`;
  }

  // Expo web should use same-origin relative requests; production can reverse-proxy
  // /api and /media to Django without embedding a machine-specific address.
  if (Platform.OS === "web") return "/";

  // Android emulator's host bridge. Physical devices should set EXPO_PUBLIC_API_URL
  // to the reachable LAN or HTTPS API address.
  if (Platform.OS === "android") return `http://10.0.2.2:${API_PORT}/`;
  return `http://127.0.0.1:${API_PORT}/`;
}

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(https?:|data:)/i.test(url)) return url;
  const base = getApiBaseUrl().replace(/\/$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}
