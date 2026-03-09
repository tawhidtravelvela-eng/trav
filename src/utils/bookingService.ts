import { supabase } from "@/integrations/supabase/client";

interface BookingData {
  type: string;
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  total: number;
  bookingId: string;
  confirmationData?: Record<string, any>;
  tenantId?: string | null;
}

export const saveBooking = async (data: BookingData, status: string = "Paid"): Promise<string | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return null;

  const { data: row, error } = await supabase.from("bookings").insert({
    user_id: user.id,
    booking_id: data.bookingId,
    type: data.type,
    title: data.title,
    subtitle: data.subtitle,
    details: data.details as any,
    total: data.total,
    status,
    ...(data.tenantId ? { tenant_id: data.tenantId } : {}),
    ...(data.confirmationData ? { confirmation_data: data.confirmationData } as any : {}),
  }).select("id").single();

  return error ? null : row.id;
};

export const updateBookingStatus = async (id: string, status: string): Promise<boolean> => {
  const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
  return !error;
};

export const processBkashPayment = async (amount: number, bookingId: string): Promise<{ success: boolean; bkashURL?: string; paymentID?: string; id_token?: string; error?: string }> => {
  const { data, error } = await supabase.functions.invoke("bkash-payment", {
    body: {
      action: "create",
      amount,
      bookingId,
      callbackURL: `${window.location.origin}/booking/confirmation`,
    },
  });
  if (error || !data?.success) return { success: false, error: data?.error || error?.message || "bKash payment creation failed" };
  return { success: true, bkashURL: data.bkashURL, paymentID: data.paymentID, id_token: data.id_token };
};

export const executeBkashPayment = async (paymentID: string, id_token: string): Promise<{ success: boolean; transactionStatus?: string; trxID?: string; error?: string }> => {
  const { data, error } = await supabase.functions.invoke("bkash-payment", {
    body: { action: "execute", paymentID, id_token },
  });
  if (error || !data?.success) return { success: false, error: data?.error || error?.message || "bKash execution failed" };
  return { success: true, transactionStatus: data.transactionStatus, trxID: data.trxID };
};
