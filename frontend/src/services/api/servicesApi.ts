import { api, asList } from "./client";

export type ServiceImage = { id: number; image_url: string; caption: string };

export type ServiceItem = {
  id: number;
  provider: number;
  provider_name: string;
  provider_verified: boolean;
  freelancer?: number;
  category: number;
  category_name?: string;
  title: string;
  description: string;
  price: string;
  starting_price?: string;
  price_max?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "INACTIVE";
  service_mode?: "REMOTE" | "LOCAL" | "BOTH";
  location: string;
  distance_km?: number | null;
  duration_minutes?: number | null;
  delivery_days?: number | null;
  client_requirements?: string;
  tags?: string;
  images?: ServiceImage[];
  avg_rating?: number;
  review_count?: number;
  created_at: string;
};

export type CategoryItem = {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  is_active: boolean;
};

export type ListServicesParams = {
  lat?: number;
  lng?: number;
  city?: string;
  search?: string;
  max_km?: number;
  category?: number;
  service_mode?: "REMOTE" | "LOCAL" | "BOTH";
  mine?: boolean;
};

export type ProviderAvailability = {
  id: number;
  freelancer: number;
  weekday: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  is_blocked: boolean;
  note: string;
};

export type AvailabilityInput = Omit<ProviderAvailability, "id" | "freelancer">;

export const servicesApi = {
  list: async (params: ListServicesParams = {}): Promise<ServiceItem[]> => {
    const query: Record<string, string | number> = {};
    if (params.city) query.location = params.city;
    if (params.search?.trim()) query.search = params.search.trim();
    if (params.category != null) query.category = params.category;
    if (params.service_mode) query.service_mode = params.service_mode;
    if (params.mine) query.mine = "1";
    const res = await api.get("api/catalog/services/", { params: query });
    return asList<ServiceItem>(res.data);
  },
  get: async (id: number): Promise<ServiceItem> => {
    const res = await api.get<ServiceItem>(`api/catalog/services/${id}/`);
    return res.data;
  },
  listCategories: async (): Promise<CategoryItem[]> => {
    const res = await api.get("api/catalog/categories/");
    return asList<CategoryItem>(res.data);
  },
  create: async (data: {
    category: number;
    title: string;
    description: string;
    starting_price: string;
    status?: "DRAFT" | "PUBLISHED";
    service_mode: "REMOTE" | "LOCAL" | "BOTH";
    delivery_days?: number;
    duration_minutes?: number;
    client_requirements?: string;
    tags?: string;
    location?: string;
    travel_radius_km?: number;
  }): Promise<ServiceItem> => {
    const res = await api.post<ServiceItem>("api/catalog/services/", data);
    return res.data;
  },
  update: async (id: number, data: Partial<ServiceItem>): Promise<ServiceItem> => {
    const res = await api.patch<ServiceItem>(`api/catalog/services/${id}/`, data);
    return res.data;
  },
  uploadImage: async (serviceId: number, uri: string, name: string, mimeType = "image/jpeg") => {
    const form = new FormData();
    form.append("service", String(serviceId));
    form.append("image", { uri, name, type: mimeType } as unknown as Blob);
    const res = await api.post("api/catalog/service-images/", form);
    return res.data;
  },
  listAvailability: async (freelancerId?: number): Promise<ProviderAvailability[]> => {
    const res = await api.get("api/catalog/availability/", {
      params: freelancerId ? { freelancer: freelancerId } : {},
    });
    return asList<ProviderAvailability>(res.data);
  },
  createAvailability: async (data: AvailabilityInput): Promise<ProviderAvailability> => {
    const res = await api.post<ProviderAvailability>("api/catalog/availability/", data);
    return res.data;
  },
  updateAvailability: async (id: number, data: Partial<AvailabilityInput>): Promise<ProviderAvailability> => {
    const res = await api.patch<ProviderAvailability>(`api/catalog/availability/${id}/`, data);
    return res.data;
  },
  deleteAvailability: async (id: number): Promise<void> => {
    await api.delete(`api/catalog/availability/${id}/`);
  },
};
