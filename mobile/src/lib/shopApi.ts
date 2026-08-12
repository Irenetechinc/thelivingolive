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

async function shopPut<T = unknown>(path: string, body: object): Promise<T> {
  const headers = await shopAuthHeader();
  const res = await fetch(`${API}${path}`, {
    method: 'PUT', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new Error(`Server error (${res.status})`);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || (json as any).error) throw new Error((json as any).error ?? `Request failed (${res.status})`);
  return json as T;
}

async function shopDelete<T = unknown>(path: string): Promise<T> {
  const headers = await shopAuthHeader();
  const res = await fetch(`${API}${path}`, {
    method: 'DELETE', headers, signal: AbortSignal.timeout(20_000),
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
  image_urls?: string[];
  condition?: string | null;
  shipping_cost?: number;
  return_policy?: string | null;
  estimated_delivery?: string | null;
  import_fee_info?: string | null;
  specifications?: Record<string, string>;
  available_colors?: string[];
  available_sizes?: string[];
  pickup_available?: boolean;
  delivery_available?: boolean;
  churchName: string;
  shop_categories: { name: string; icon: string; color: string } | null;
  seller?: {
    id: string; name: string; description: string | null;
    email: string | null; phone: string | null; website: string | null; logoUrl: string | null;
    about?: string | null; address?: string | null; policies?: string | null;
  } | null;
};

export type ShopCartItem = {
  id: string; product_id: string; quantity: number;
  selected_color: string | null; selected_size: string | null;
  shop_products: ShopProduct | null;
};

export type ShopOrder = {
  id: string; product_id: string; amount: number; currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  flw_tx_ref: string | null; delivery_address: string | null;
  quantity?: number; selected_color?: string | null; selected_size?: string | null;
  fulfillment_method?: 'pickup' | 'delivery'; invoice_number?: string | null;
  collection_code?: string | null; collection_qr?: string | null;
  tracking_status?: string | null; tracking_events?: { status: string; note?: string; at: string }[];
  shipping_cost?: number; paid_at?: string | null;
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

export async function getShopCategories(churchId?: string): Promise<ShopCategory[]> {
  const qs = churchId ? `?church_id=${encodeURIComponent(churchId)}` : '';
  const r = await shopGet<any>(`/api/shop/categories${qs}`);
  return r.categories ?? [];
}

export async function getShopProducts(opts: { categoryId?: string; page?: number; churchId?: string } = {}): Promise<{ products: ShopProduct[]; churchName: string }> {
  const params = new URLSearchParams();
  if (opts.categoryId) params.set('category_id', opts.categoryId);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.churchId) params.set('church_id', opts.churchId);
  const qs = params.toString();
  const r  = await shopGet<any>(`/api/shop/products${qs ? `?${qs}` : ''}`);
  return { products: r.products ?? [], churchName: r.churchName ?? '' };
}

export async function getShopProduct(id: string): Promise<ShopProduct> {
  const r = await shopGet<any>(`/api/shop/products/${id}`);
  return r.product;
}

export async function getShopProductDetail(id: string): Promise<{ product: ShopProduct; relatedProducts: ShopProduct[] }> {
  const r = await shopGet<any>(`/api/shop/products/${id}`);
  return { product: r.product, relatedProducts: r.relatedProducts ?? [] };
}

export async function getShopOrder(orderId: string): Promise<ShopOrder> {
  const r = await shopGet<any>(`/api/shop/orders/${orderId}`);
  return r.order;
}

export async function getShopCart(): Promise<ShopCartItem[]> {
  const r = await shopGet<any>('/api/shop/cart');
  return r.items ?? [];
}

export async function addShopCartItem(opts: {
  productId: string; quantity: number; selectedColor?: string | null; selectedSize?: string | null;
}): Promise<ShopCartItem> {
  const r = await shopPost<any>('/api/shop/cart', opts);
  return r.item;
}

export async function updateShopCartItem(id: string, quantity: number): Promise<ShopCartItem> {
  const r = await shopPut<any>(`/api/shop/cart/${id}`, { quantity });
  return r.item;
}

export async function removeShopCartItem(id: string): Promise<void> {
  await shopDelete(`/api/shop/cart/${id}`);
}

export async function getShopWishlist(): Promise<ShopProduct[]> {
  const r = await shopGet<any>('/api/shop/wishlist');
  return (r.items ?? []).map((item: any) => item.shop_products).filter(Boolean);
}

export async function addShopWishlist(productId: string): Promise<void> {
  await shopPost(`/api/shop/wishlist/${productId}`, {});
}

export async function removeShopWishlist(productId: string): Promise<void> {
  await shopDelete(`/api/shop/wishlist/${productId}`);
}

export async function getMyOrders(): Promise<ShopOrder[]> {
  const r = await shopGet<any>('/api/shop/my-orders');
  return r.orders ?? [];
}

export async function initiateShopOrder(opts: {
  productId: string; buyerName?: string; deliveryAddress?: string; shippingName?: string;
  shippingPhone?: string; fulfillmentMethod?: 'pickup' | 'delivery'; quantity?: number;
  selectedColor?: string | null; selectedSize?: string | null;
}): Promise<{ free?: boolean; paymentLink?: string; txRef?: string; orderId: string; invoiceNumber?: string; collectionCode?: string }> {
  return shopPost('/api/shop/orders/initiate', opts) as any;
}

export async function initiateShopCartOrder(opts: {
  buyerName?: string; deliveryAddress?: string; shippingName?: string; shippingPhone?: string;
  fulfillmentMethod?: 'pickup' | 'delivery';
}): Promise<{ paymentLink?: string; txRef?: string; orderId: string; invoiceNumber?: string }> {
  return shopPost('/api/shop/orders/cart', opts) as any;
}

export async function verifyShopOrder(txRef: string): Promise<{ ok: boolean; order: ShopOrder }> {
  return shopPost('/api/shop/orders/verify', { txRef }) as any;
}

export async function getDownloadLink(orderId: string): Promise<{ mediaUrl: string; title: string }> {
  const r = await shopGet<any>(`/api/shop/download/${orderId}`);
  return { mediaUrl: r.mediaUrl, title: r.title };
}
