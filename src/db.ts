import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Service-role client is used only in the server-side webhook. Never import it into browser code.
export const db = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Client-Info': 'mjl-telegram-store/0.1.0' } },
});

export type Product = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  price: number;
  currency: string;
  description: string | null;
  specifications: Record<string, string>;
  stock_quantity: number;
  status: 'draft' | 'active' | 'archived' | 'out_of_stock';
};
