/**
 * shopApi.ts — Olive Shop API client (uses local auth helpers, no imports from api.ts)
 */
import { supabase } from './supabase';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://livingolive.adroomai.com';

async function shopAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Session expired. Please log in again.');
  return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}

async function shopGet<T = unknown>(path: string): Promise<T> {
  const headers = await shopAuthHeader();
  const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new Error(`Server error (${res.status})`);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || (json as any).error) throw new Error((json as any).error ?? `Request failed (${res.status})`);
  return json as T;
}

async function shopPost<T = unknown>(path: string, body: object): Promise<T> {
  const headers = await shopAuthHeader();
  const res = await fetch(`${API}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new Error(`Server error (${res.status})`);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || (json as any).error) throw new Error((json as any).error ?? `Request failed (${res.status})`);
  return json as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopChurch = {
  id: string; name: string; slug: string;
  logo_url: string | null; description: string | null;
};

export type ShopCategory = {
  id: string; church_id: string; name: string;
  icon: string; color: string; sort_order: number;
};

export type ShopProduct = {
  id: string; church_id: string; category_id: string | null;
  title: string; description: string | null;
  price: number; currency: string; is_free: boolean;
  product_type: 'physical' | 'digital' | 'media';
  thumbnail_url: string | null; stock_count: number | null;
  churchName: string;
  shop_categories: { name: string; icon: string; color: string } | null;
};

export type ShopOrder = {
  id: string; product_id: string; amount: number; currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  flw_tx_ref: string | null; delivery_address: string | null;
  created_at: string;
  shop_products: {
    id: string; title: string; thumbnail_url: string | null;
    product_type: string; media_url: string | null;
  } | null;
};

// ── API functions ─────────────────────────────────────────────────────────────

export async function getMyShopChurch(): Promise<{ church_id: string; churches: ShopChurch } | null> {
  const r = await shopGet<any>('/api/shop/my-church');
  return r.membership ?? null;
}

export async function getAllChurches(): Promise<ShopChurch[]> {
  const r = await shopGet<any>('/api/shop/churches');
  return r.churches ?? [];
}

export async function getShopCategories(): Promise<ShopCategory[]> {
  const r = await shopGet<any>('/api/shop/categories');
  return r.categories ?? [];
}

export async function getShopProducts(opts: { categoryId?: string; page?: number } = {}): Promise<{ products: ShopProduct[]; churchName: string }> {
  const params = new URLSearchParams();
  if (opts.categoryId) params.set('category_id', opts.categoryId);
  if (opts.page) params.set('page', String(opts.page));
  const qs = params.toString();
  const r  = await shopGet<any>(`/api/shop/products${qs ? `?${qs}` : ''}`);
  return { products: r.products ?? [], churchName: r.churchName ?? '' };
}

export async function getShopProduct(id: string): Promise<ShopProduct> {
  const r = await shopGet<any>(`/api/shop/products/${id}`);
  return r.product;
}

export async function getMyOrders(): Promise<ShopOrder[]> {
  const r = await shopGet<any>('/api/shop/my-orders');
  return r.orders ?? [];
}

export async function initiateShopOrder(opts: {
  productId: string; buyerName?: string; deliveryAddress?: string;
}): Promise<{ free?: boolean; paymentLink?: string; txRef?: string; orderId: string }> {
  return shopPost('/api/shop/orders/initiate', opts) as any;
}

export async function verifyShopOrder(txRef: string): Promise<{ ok: boolean; order: ShopOrder }> {
  return shopPost('/api/shop/orders/verify', { txRef }) as any;
}

export async function getDownloadLink(orderId: string): Promise<{ mediaUrl: string; title: string }> {
  const r = await shopGet<any>(`/api/shop/download/${orderId}`);
  return { mediaUrl: r.mediaUrl, title: r.title };
}
