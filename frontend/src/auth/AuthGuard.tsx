import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { getItem, StorageKeys } from "../utils/storage";
import { resolveAuthenticatedRoute } from "../navigation/workflow";
import { Routes } from "../navigation/routes";
import type { UserProfile } from "../services/api/userApi";
import { BACKGROUND, PRIMARY } from "../theme/colors";

const authRoutes = new Set([
  Routes.LOGIN,
  Routes.REGISTER,
  "/forgot-password",
  "/reset-password",
  Routes.OTP,
]);

function isPublicMarketplaceRoute(pathname: string) {
  return pathname === Routes.SEARCH || pathname.startsWith("/service/") || pathname.startsWith("/categories");
}

function isProviderRoute(pathname: string) {
  return pathname.startsWith("/provider-");
}

function isCustomerOnlyRoute(pathname: string) {
  return pathname === "/dashboard" || pathname === "/book" || pathname === "/bookings";
}

function isBookingDetail(pathname: string) {
  return /^\/bookings\/\d+$/.test(pathname);
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const lastToken = useRef<string | null | undefined>(undefined);
  const session = useRef<{ user: UserProfile | null; route: string } | null>(null);

  useEffect(() => {
    let active = true;
    setAllowed(false);

    const check = async () => {
      const token = await getItem(StorageKeys.TOKEN);
      if (!token) {
        lastToken.current = null;
        session.current = null;
        if (pathname === Routes.INDEX) {
          router.replace(Routes.LOGIN);
          return;
        }
        if (authRoutes.has(pathname) || isPublicMarketplaceRoute(pathname)) {
          if (active) setAllowed(true);
          return;
        }
        router.replace(Routes.LOGIN);
        return;
      }

      if (lastToken.current !== token || !session.current) {
        const result = await resolveAuthenticatedRoute();
        lastToken.current = token;
        session.current = { user: result.user, route: result.route };
      }
      const current = session.current;
      if (!current?.user) {
        lastToken.current = null;
        session.current = null;
        router.replace(Routes.LOGIN);
        return;
      }
      const user = current.user;
      const role = user.role.toUpperCase();
      const isProvider = role === "PROVIDER" || role === "FREELANCER";
      const isAdmin = role === "ADMIN" || role === "STAFF";

      if (!user.is_otp_verified) {
        if (pathname !== Routes.OTP) {
          router.replace(Routes.OTP);
          return;
        }
        if (active) setAllowed(true);
        return;
      }

      if (pathname === Routes.INDEX || authRoutes.has(pathname)) {
        router.replace(current.route as never);
        return;
      }

      if (isAdmin) {
        if (pathname !== Routes.ADMIN_ACCESS) {
          router.replace(Routes.ADMIN_ACCESS);
          return;
        }
        if (active) setAllowed(true);
        return;
      }

      if (isProvider && isCustomerOnlyRoute(pathname) && !isBookingDetail(pathname)) {
        router.replace(Routes.PROVIDER_HOME);
        return;
      }
      if (!isProvider && isProviderRoute(pathname)) {
        router.replace(Routes.CUSTOMER_HOME);
        return;
      }
      if (active) setAllowed(true);
    };

    check().catch(() => {
      if (active) router.replace(Routes.LOGIN);
    });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!allowed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BACKGROUND }}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </View>
    );
  }
  return <>{children}</>;
}
