import { api, asList } from "./client";

export type PaymentItem = {
  id: number;
  booking: number;
  payer: number;
  amount: string;
  gateway: string;
  status: "INITIATED" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUNDED" | string;
  transaction_uuid: string;
  gateway_ref: string;
  verified_at: string | null;
};

export type PaymentInitiation = {
  payment: PaymentItem;
  checkout_url: string;
  esewa: {
    amount: string;
    total_amount: string;
    transaction_uuid: string;
    product_code: string;
    success_url: string;
    failure_url: string;
    signed_field_names: string;
    signature: string;
    form_url: string;
    checkout_url?: string;
  };
};

export const paymentsApi = {
  listForBooking: async (booking: number): Promise<PaymentItem[]> => {
    const res = await api.get("api/payments/payments/", { params: { booking } });
    return asList<PaymentItem>(res.data);
  },
  initiate: async (booking: number): Promise<PaymentInitiation> => {
    const res = await api.post<PaymentInitiation>("api/payments/payments/initiate/", { booking });
    return res.data;
  },
  verify: async (paymentId: number): Promise<PaymentItem> => {
    const res = await api.post<PaymentItem>(`api/payments/payments/${paymentId}/verify/`, {});
    return res.data;
  },
};
