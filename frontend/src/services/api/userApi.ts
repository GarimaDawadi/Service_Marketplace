import { api } from "./client";

export type UserProfile = {
  id: number;
  username: string;
  email: string;
  role: string;
  phone: string | null;

  is_otp_verified?: boolean;
  is_active_account?: boolean;
  date_joined?: string;

  profile_photo?: string | null;
  kyc_status?: string;
  is_verified?: boolean;

  client_profile?: Record<string, unknown>;
  freelancer_profile?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  kyc?: { status: string; rejection_reason?: string };
};

function normalizeUserProfile(data: UserProfile): UserProfile {
  const nested = (data.freelancer_profile || data.client_profile || data.profile) as Record<string, unknown> | undefined;
  return {
    ...data,
    kyc_status: data.kyc_status || String(nested?.kyc_status || ""),
    is_verified: data.is_verified ?? Boolean(nested?.is_verified),
  };
}

export const userApi = {
  // ------------------------------------------
  // Current logged-in user
  // ------------------------------------------

  me: async (): Promise<UserProfile> => {
    const response = await api.get<UserProfile>("api/auth/me/");
    return normalizeUserProfile(response.data);
  },

  // ------------------------------------------
  // Save profile information
  // ------------------------------------------

  updateProfile: async (data: {
    username?: string;
    email?: string;
    phone?: string;
    full_name?: string;
    bio?: string;
    location?: string;
    address?: string;
    professional_title?: string;
    experience_years?: number;
    languages?: string;
    education?: string;
    certifications?: string;
  }): Promise<UserProfile> => {
    const response = await api.patch<UserProfile>("api/auth/profile/", data);
    return normalizeUserProfile(response.data);
  },

  // ------------------------------------------
  // Upload profile picture
  // ------------------------------------------

  uploadPhoto: async (formData: FormData): Promise<UserProfile> => {
    await api.post("api/auth/profile/photo/", formData);
    return userApi.me();
  },

  // ------------------------------------------
  // Delete profile picture
  // ------------------------------------------

  deletePhoto: async (): Promise<UserProfile> => {
    await api.delete("api/auth/profile/photo/delete/");
    return userApi.me();
  },

  // ------------------------------------------
  // Change password
  // ------------------------------------------

  changePassword: (
    current_password: string,
    new_password: string
  ) =>
    api
      .post<{ message: string }>(
        "api/auth/password/change/",
        {
          current_password,
          new_password,
        }
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Existing client profile
  // ------------------------------------------

  clientProfile: () =>
    api
      .get(
        "api/auth/client-profile/"
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Existing freelancer profile
  // ------------------------------------------

  freelancerProfile: () =>
    api
      .get(
        "api/auth/freelancer-profile/"
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Legacy methods (removed - use accounts endpoints)
  // ------------------------------------------
};