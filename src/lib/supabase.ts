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
  price_cents: number;
  status: "pending_first_payment" | "active" | "cancelled";
  mollie_customer_id: string | null;
  mollie_mandate_id: string | null;
  mollie_subscription_id: string | null;
  mollie_first_payment_id: string | null;
  cancel_token: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
