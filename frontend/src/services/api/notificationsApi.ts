import { api, asList } from "./client";

export type NotificationItem = {
  id: number;
  title: string;
  body: string;
  event_type: string;
  is_read: boolean;
  created_at: string;
};

export const notificationsApi = {
  list: async (): Promise<NotificationItem[]> => {
    const res = await api.get("api/notifications/");
    return asList<NotificationItem>(res.data);
  },
  markRead: (id: number) => api.post(`api/notifications/${id}/read/`, {}),
  markAllRead: () => api.post("api/notifications/read-all/", {}),
};
