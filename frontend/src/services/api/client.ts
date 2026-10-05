import axios from "axios";
import { getApiBaseUrl } from "../../config/api";
import { getItem, removeItems, setItem, StorageKeys } from "../../utils/storage";

export const api = axios.create({
  timeout: 60000,
});

function isFormDataBody(data: unknown): boolean {
  return (
    typeof FormData !== "undefined" &&
    data !== null &&
    typeof data === "object" &&
    typeof (data as FormData).append === "function"
  );
}

api.interceptors.request.use(async (config) => {
  config.baseURL = getApiBaseUrl();
  const token = await getItem(StorageKeys.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config.headers) {
    // Prevent stale Authorization headers from being reused.
    delete (config.headers as any).Authorization;
  }

  if (!isFormDataBody(config.data) && config.data !== undefined && config.data !== null) {
    config.headers.set("Content-Type", "application/json");
  }

  return config;
});

// If a stale/invalid token exists, DRF can return 401.
// Attempt a silent token refresh first; if that also fails, clear auth data.
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (resp) => resp,
  async (err) => {
    const status = err?.response?.status;
    const originalConfig = err?.config as (
      | (typeof err.config & { __retry401?: boolean })
      | undefined
    );

    if (status !== 401 || !originalConfig || originalConfig.__retry401) {
      return Promise.reject(err);
    }

    originalConfig.__retry401 = true;
    const refreshToken = await getItem(StorageKeys.REFRESH_TOKEN);

    if (refreshToken) {
      // If a refresh is already in-flight, queue this request
      if (isRefreshing) {
        return new Promise<typeof err>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          if (originalConfig.headers) {
            originalConfig.headers.Authorization = `Bearer ${newToken}`;
          }
          return api.request(originalConfig);
        });
      }

      isRefreshing = true;
      try {
        const refreshRes = await axios.post<{ access: string }>(
          `${getApiBaseUrl()}api/auth/token/refresh/`,
          { refresh: refreshToken }
        );
        const newAccessToken = refreshRes.data.access;
        await setItem(StorageKeys.TOKEN, newAccessToken);
        processQueue(null, newAccessToken);

        if (originalConfig.headers) {
          originalConfig.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api.request(originalConfig);
      } catch (refreshErr) {
        // Refresh failed — clear everything and force re-login
        processQueue(refreshErr, null);
        await removeItems([
          StorageKeys.TOKEN,
          StorageKeys.REFRESH_TOKEN,
          StorageKeys.ROLE,
          StorageKeys.USERNAME,
          StorageKeys.EMAIL,
          StorageKeys.PROFILE_COMPLETED,
          StorageKeys.KYC_STATUS,
          StorageKeys.SERVICES,
        ]);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // No refresh token available — clear auth data and retry without token
    await removeItems([
      StorageKeys.TOKEN,
      StorageKeys.REFRESH_TOKEN,
      StorageKeys.ROLE,
      StorageKeys.USERNAME,
      StorageKeys.EMAIL,
      StorageKeys.PROFILE_COMPLETED,
      StorageKeys.KYC_STATUS,
      StorageKeys.SERVICES,
    ]);
    if (originalConfig.headers) {
      delete originalConfig.headers.Authorization;
    }
    return api.request(originalConfig);
  }
);

export function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : fallback;
  }
  if (err.code === "ECONNABORTED") {
    return "Request timed out. Check that Django is running.";
  }
  if (err.response?.status === 413) {
    return "Image is too large. Try a smaller photo or lower quality.";
  }
  if (err.message === "Network Error" || !err.response) {
    return `Cannot reach server at ${getApiBaseUrl()}. Start Django with: python manage.py runserver 0.0.0.0:8001`;
  }
  const data = err.response.data as
    | {
        error?: string;
        detail?: string;
        message?: string;
        [key: string]: unknown;
      }
    | string
    | string[];

  if (typeof data === "string" && data.trim()) return data;
  if (Array.isArray(data) && data.length > 0) return String(data[0]);

  const obj = (data ?? {}) as {
    error?: string;
    detail?: string;
    message?: string;
    [key: string]: unknown;
  };
  if (obj.error) {
    if (obj.message) return String(obj.message);
    return String(obj.error);
  }
  if (obj.detail) return String(obj.detail);
  if (obj.message) return String(obj.message);

  const statusCode = err.response.status;
  if (statusCode === 401) return "Your session expired. Please sign in again.";
  if (statusCode === 403) return "You do not have permission to perform this action.";
  if (statusCode === 404) return "This item is no longer available.";
  if (statusCode === 409) return "This action conflicts with the current booking state. Refresh and try again.";
  if (statusCode === 422) return "Please check the highlighted fields and try again.";
  if (statusCode >= 500) return "The server could not complete this request. Please retry.";

  // Handle DRF field errors like {"slot_id": ["Select an available time slot."]}
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
  }

  return fallback;
}
