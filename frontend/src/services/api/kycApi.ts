import { api, asList } from "./client";

export type ProviderProfilePayload = {
  professional_title?: string;
  bio?: string;
  experience_years?: number;
  location?: string;
  education?: string;
  certifications?: string;
  skill_ids?: number[];
};

export type ProviderProfile = {
  id: number;
  professional_title: string;
  bio: string;
  experience_years: number;
  location: string;
  education: string;
  certifications: string;
  kyc_status: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | string;
  rejection_reason: string;
  is_verified: boolean;
  profile_completed: boolean;
};

export type KycSubmission = {
  id: number;
  legal_name: string;
  document_type: string;
  document_number: string;
  status: string;
  rejection_reason: string;
  submitted_at: string;
  reviewed_at: string | null;
};

export const kycApi = {
  getProfile: async (): Promise<ProviderProfile> => {
    const res = await api.get<ProviderProfile>("api/auth/freelancer-profile/");
    return res.data;
  },
  saveProfile: async (data: ProviderProfilePayload): Promise<ProviderProfile> => {
    const res = await api.patch<ProviderProfile>("api/auth/freelancer-profile/", data);
    return res.data;
  },
  latestSubmission: async (): Promise<KycSubmission | null> => {
    const res = await api.get("api/auth/kyc/");
    return asList<KycSubmission>(res.data)[0] ?? null;
  },
  submitKyc: async (formData: FormData): Promise<KycSubmission> => {
    const res = await api.post<KycSubmission>("api/auth/kyc/", formData);
    return res.data;
  },
};
