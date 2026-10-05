import { api, asList } from "./client";

export type CounterOffer = {
  id: number;
  booking: number;
  created_by: number;
  created_by_email?: string;
  amount: string;
  message: string;
  scope: string;
  deadline: string | null;
  revision_limit: number | null;
  additional_requirements: string;
  status: "ACTIVE" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | string;
  created_at: string;
};

export type BookingDeliverable = {
  id: number;
  booking: number;
  uploaded_by: number;
  title: string;
  note: string;
  description: string;
  link_url: string;
  file_url: string;
  created_at: string;
};

export type BookingItem = {
  id: number;
  client: number;
  freelancer: number | null;
  service: number | null;
  category: number | null;
  booking_type: string;
  service_mode: "LOCAL" | "REMOTE" | string;
  title: string;
  description: string;
  requirements: string;
  rejection_reason: string;
  proposed_price: string;
  agreed_price: string | null;
  deadline: string | null;
  appointment_start: string | null;
  appointment_end: string | null;
  location_address: string;
  location_city: string;
  latitude: string | null;
  longitude: string | null;
  revision_limit: number;
  revisions_used: number;
  status: string;
  paid_at: string | null;
  completed_at: string | null;
  service_title?: string;
  client_name?: string;
  client_email?: string;
  freelancer_name?: string;
  counter_offers?: CounterOffer[];
  deliverables?: BookingDeliverable[];
  can_review?: boolean;
  created_at: string;
  updated_at: string;
};

type CreateBookingData = {
  service: number;
  title?: string;
  description?: string;
  requirements?: string;
  proposed_price?: string | number;
  booking_type?: string;
  service_mode: "LOCAL" | "REMOTE";
  appointment_start?: string;
  appointment_end?: string;
  location_address?: string;
  location_city?: string;
  latitude?: number;
  longitude?: number;
  revision_limit?: number;
};

export const bookingsApi = {
  listBookings: async (status?: string): Promise<BookingItem[]> => {
    const res = await api.get("api/bookings/projects/", { params: status ? { status } : {} });
    return asList<BookingItem>(res.data);
  },
  getBooking: async (bookingId: number): Promise<BookingItem> => {
    const res = await api.get<BookingItem>(`api/bookings/projects/${bookingId}/`);
    return res.data;
  },
  createBooking: async (data: CreateBookingData): Promise<BookingItem> => {
    const res = await api.post<BookingItem>("api/bookings/projects/", data);
    return res.data;
  },
  acceptBooking: async (bookingId: number): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/accept/`, {});
    return res.data;
  },
  rejectBooking: async (bookingId: number, message = ""): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/reject/`, { message });
    return res.data;
  },
  cancelBooking: async (bookingId: number): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/cancel/`, {});
    return res.data;
  },
  counterOffer: async (bookingId: number, data: {
    amount: string | number;
    message?: string;
    scope?: string;
    deadline?: string;
    revision_limit?: number;
    additional_requirements?: string;
  }): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/counter-offer/`, data);
    return res.data;
  },
  acceptCounterOffer: async (bookingId: number): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/accept/`, {});
    return res.data;
  },
  rejectCounterOffer: async (bookingId: number, message = ""): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/reject/`, { message });
    return res.data;
  },
  startWork: async (bookingId: number): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/start-work/`, {});
    return res.data;
  },
  submitDeliverable: async (bookingId: number, data: {
    title: string;
    note?: string;
    description?: string;
    link_url?: string;
    file?: { uri: string; name: string; type: string };
  }): Promise<BookingItem> => {
    let body: FormData | Omit<typeof data, "file">;
    if (data.file) {
      const form = new FormData();
      form.append("title", data.title);
      if (data.note) form.append("note", data.note);
      if (data.description) form.append("description", data.description);
      if (data.link_url) form.append("link_url", data.link_url);
      form.append("file", data.file as unknown as Blob);
      body = form;
    } else {
      const { file: _file, ...json } = data;
      body = json;
    }
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/deliver/`, body);
    return res.data;
  },
  requestRevision: async (bookingId: number, message: string): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/revision/`, { message });
    return res.data;
  },
  complete: async (bookingId: number): Promise<BookingItem> => {
    const res = await api.post<BookingItem>(`api/bookings/projects/${bookingId}/complete/`, {});
    return res.data;
  },
};
