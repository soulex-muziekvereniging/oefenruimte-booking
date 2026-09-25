import { createClient } from "@supabase/supabase-js";

export type Member = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MembershipRequest = {
  id: string;
  band_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

export type Booking = {
  id: string;
  band_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  price_cents: number;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  mollie_payment_id: string | null;
  cancel_token: string;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  band_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  weekday: number;
  dagdeel_id: string;
  frequency: "weekly" | "biweekly";
  // Eerste repetitie; "om de week" telt vanaf deze dag.
  start_date: string;
  price_cents: number;
  status: "pending_first_payment" | "active" | "lapsed" | "cancelled";
  mollie_customer_id: string | null;
  mollie_first_payment_id: string | null;
  cancel_token: string;
  cancelled_at: string | null;
  term_start_date: string | null;
  term_end_date: string | null;
  active_until: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionPayment = {
  id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  due_date: string;
  grace_until: string;
  status: "unpaid" | "paid" | "waived";
  mollie_payment_id: string | null;
  pay_token: string;
  paid_at: string | null;
  invoice_sent_at: string | null;
  reminder_sent_at: string | null;
  warning_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionSwap = {
  id: string;
  subscription_id: string;
  period_start: string;
  original_date: string;
  new_date: string | null;
  new_dagdeel_id: string | null;
  created_at: string;
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
