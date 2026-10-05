import { userApi, type UserProfile } from "../services/api/userApi";
import { StorageKeys, getItem, setItem } from "../utils/storage";
import { Routes, type AppRoute } from "./routes";

function routeForRole(role: string): AppRoute {
  const normalized = role.trim().toUpperCase();
  if (normalized === "PROVIDER" || normalized === "FREELANCER") return Routes.PROVIDER_HOME;
  if (normalized === "CLIENT" || normalized === "CUSTOMER") return Routes.CUSTOMER_HOME;
  if (normalized === "ADMIN" || normalized === "STAFF") return Routes.ADMIN_ACCESS;
  return Routes.LOGIN;
}

async function cacheIdentity(user: UserProfile) {
  await Promise.all([
    setItem(StorageKeys.ROLE, user.role),
    setItem(StorageKeys.USERNAME, user.username),
    setItem(StorageKeys.EMAIL, user.email),
    user.kyc_status ? setItem(StorageKeys.KYC_STATUS, user.kyc_status) : Promise.resolve(),
  ]);
}

export async function resolveAuthenticatedRoute(): Promise<{ route: AppRoute; user: UserProfile | null }> {
  const token = await getItem(StorageKeys.TOKEN);
  if (!token) return { route: Routes.LOGIN, user: null };
  try {
    const user = await userApi.me();
    await cacheIdentity(user);
    if (!user.is_otp_verified) return { route: Routes.OTP, user };
    return { route: routeForRole(user.role), user };
  } catch {
    return { route: Routes.LOGIN, user: null };
  }
}

/** Fetches the canonical backend role instead of trusting the client-side role value. */
export async function getPostLoginRoute(_role?: string): Promise<AppRoute> {
  const result = await resolveAuthenticatedRoute();
  return result.route;
}

/** Called by the Expo Router entry route on every cold start. */
export async function resolveInitialRoute(): Promise<AppRoute> {
  return (await resolveAuthenticatedRoute()).route;
}
