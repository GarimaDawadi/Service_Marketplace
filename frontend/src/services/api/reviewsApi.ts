import { api, asList } from "./client";

export type ReviewItem = {
  id: number;
  booking: number;
  reviewer: number;
  customer_name: string;
  provider: number;
  service_title: string;
  rating: number;
  comment: string;
  created_at: string;
};

export const reviewsApi = {
  byProvider: async (providerId: number): Promise<ReviewItem[]> => {
    const res = await api.get("api/reviews/reviews/", { params: { freelancer: providerId } });
    return asList<ReviewItem>(res.data);
  },
  create: async (data: { booking: number; rating: number; comment: string }): Promise<ReviewItem> => {
    const res = await api.post<ReviewItem>("api/reviews/reviews/", data);
    return res.data;
  },
  openDispute: async (data: { booking: number; reason: string }) => {
    const res = await api.post("api/reviews/disputes/", data);
    return res.data;
  },
};
