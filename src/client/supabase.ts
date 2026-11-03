"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let c: SupabaseClient | null = null;
export function browserDb(): SupabaseClient {
  c ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } });
  return c;
}
