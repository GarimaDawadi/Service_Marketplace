import { api, asList } from "./client";

export type ChatMessage = {
  id: number;
  sender: number;
  sender_name: string;
  text: string;
  image_url: string;
  is_read: boolean;
  created_at: string;
};

export type ChatRoom = {
  id: number;
  booking: number;
  customer: number;
  provider: number | null;
  other_user_name: string;
  other_user_photo: string;
  service_title: string;
  last_message: ChatMessage | null;
  unread_count: number;
  is_active: boolean;
  created_at: string;
};

export const chatsApi = {
  listRooms: async (): Promise<ChatRoom[]> => {
    const res = await api.get("api/chat/conversations/");
    return asList<ChatRoom>(res.data);
  },
  getMessages: async (roomId: number): Promise<ChatMessage[]> => {
    const res = await api.get(`api/chat/conversations/${roomId}/messages/`);
    return asList<ChatMessage>(res.data);
  },
  sendMessage: async (roomId: number, text: string): Promise<ChatMessage> => {
    const res = await api.post<ChatMessage>(`api/chat/conversations/${roomId}/send/`, { text });
    return res.data;
  },
  sendAttachment: async (roomId: number, file: { uri: string; name: string; type: string }, text = "") => {
    const form = new FormData();
    form.append("text", text);
    form.append("attachment", file as unknown as Blob);
    const res = await api.post<ChatMessage>(`api/chat/conversations/${roomId}/send/`, form);
    return res.data;
  },
  markRead: (roomId: number) => api.post(`api/chat/conversations/${roomId}/mark-read/`, {}),
  roomForBooking: async (bookingId: number): Promise<ChatRoom> => {
    const res = await api.get<ChatRoom>(`api/chat/conversations/booking/${bookingId}/`);
    return res.data;
  },
};
