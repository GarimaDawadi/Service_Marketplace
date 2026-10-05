import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuth } from "../auth/auth";
import { Routes } from "../navigation/routes";
import { BORDER, CARD, PRIMARY, TEXT_MUTED } from "../theme/colors";

type Tab = { label: string; icon: string; route: string };

const customerTabs: Tab[] = [
  { label: "Home", icon: "⌂", route: Routes.HOME },
  { label: "Explore", icon: "⌕", route: Routes.SEARCH },
  { label: "Bookings", icon: "▣", route: Routes.BOOKINGS },
  { label: "Messages", icon: "✉", route: Routes.CHAT },
  { label: "Profile", icon: "●", route: Routes.PROFILE },
];

const providerTabs: Tab[] = [
  { label: "Home", icon: "⌂", route: Routes.PROVIDER_HOME },
  { label: "Services", icon: "◇", route: Routes.PROVIDER_SERVICES },
  { label: "Bookings", icon: "▣", route: Routes.PROVIDER_BOOKINGS },
  { label: "Messages", icon: "✉", route: Routes.CHAT },
  { label: "Profile", icon: "●", route: Routes.PROFILE },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;
    getAuth().then((auth) => {
      if (!active) return;
      setRole(auth.role ?? "");
      setIsLoggedIn(Boolean(auth.token));
    });
    return () => { active = false; };
  }, [pathname]);

  const normalizedRole = role.toUpperCase();
  const provider = normalizedRole === "PROVIDER" || normalizedRole === "FREELANCER";
  const tabs = provider ? providerTabs : customerTabs;
  const mainTabRoutes = new Set(tabs.map((tab) => tab.route));
  const shouldShow = isLoggedIn && ![Routes.LOGIN, Routes.REGISTER, Routes.OTP, Routes.ADMIN_ACCESS, "/forgot-password", "/reset-password"].includes(pathname as never) && mainTabRoutes.has(pathname);

  if (!shouldShow) return null;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const active = pathname === tab.route || (tab.route === Routes.BOOKINGS && pathname.startsWith("/bookings/"));
        return (
          <TouchableOpacity
            key={tab.route}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            onPress={() => router.replace(tab.route as never)}
            style={styles.tab}
          >
            <Text style={[styles.icon, active && styles.activeText]}>{tab.icon}</Text>
            <Text style={[styles.label, active && styles.activeText]} numberOfLines={1}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4, gap: 2 },
  icon: { fontSize: 20, color: TEXT_MUTED, fontWeight: "700" },
  label: { fontSize: 10, color: TEXT_MUTED, fontWeight: "600" },
  activeText: { color: PRIMARY },
});
