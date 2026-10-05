export const Routes = {
  INDEX: "/",
  HOME: "/home",
  CUSTOMER_HOME: "/home",
  LOGIN: "/login",
  REGISTER: "/register",
  OTP: "/otp",
  ADMIN_ACCESS: "/admin-access",
  CHOOSE_SERVICES: "/choose-services",
  SEARCH: "/search",
  BOOK: "/book",
  BOOKINGS: "/bookings",
  CHAT: "/chat",
  NOTIFICATIONS: "/notifications",
  PROFILE: "/profile",
  PROVIDER_ONBOARDING: "/provider-onboarding",
  PROVIDER_KYC: "/provider-kyc",
  PROVIDER_HOME: "/provider-home",
  PROVIDER_SERVICES: "/provider-services",
  PROVIDER_BOOKINGS: "/provider-bookings",
  PROVIDER_AVAILABILITY: "/provider-availability",
} as const;

export type AppRoute = (typeof Routes)[keyof typeof Routes];

/** @deprecated use Routes.HOME */
export const RoutesLegacy = { CUSTOMER_HOME: Routes.HOME, SPLASH: Routes.INDEX };
