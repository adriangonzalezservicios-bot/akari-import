import { auth } from './firebase';
import type { Product, Order, Reseller, HistoryEntry } from '../types';

const CATALOG_CACHE_KEY = 'akari_catalog_cache_v2';
const CATALOG_CACHE_TIME_KEY = 'akari_catalog_cache_time';
const CACHE_MAX_AGE_MS = 3 * 60 * 1000;

const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbytHLZ3bvYtaeX-RKgQvmx1PZHFse0z08XsggKByD651SrHKRc0uiUGMulyJOuxgs5e/exec';

// Local storage fallback state for offline/demo reliability
const LOCAL_STORAGE_PRODUCTS = 'akari_local_products';
const LOCAL_STORAGE_ORDERS = 'akari_local_orders';
const LOCAL_STORAGE_RESELLERS = 'akari_local_resellers';
const LOCAL_STORAGE_HISTORY = 'akari_local_history';

async function initLocalFallback(): Promise<Product[]> {
  const existing = localStorage.getItem(LOCAL_STORAGE_PRODUCTS);
  if (existing) {
    try {
      return JSON.parse(existing);
    } catch {}
  }
  try {
    const res = await fetch('/importar-productos.json');
    const data = await res.json();
    const mapped: Product[] = data.map((p: any, idx: number) => ({
      id: p.id || `prod_${idx + 1}_${p.sku || ''}`,
      sku: String(p.sku || '').trim(),
      name: String(p.name || '').trim(),
      description: String(p.description || ''),
      category: String(p.category || 'General'),
      image: String(p.image || '/assets/placeholder.svg'),
      retail: Number(p.retail) || 0,
      wholesale: Number(p.wholesale) || 0,
      active: p.active !== false,
      stock: p.stock === undefined || p.stock === null ? null : Number(p.stock),
      updatedAt: new Date().toISOString()
    }));
    localStorage.setItem(LOCAL_STORAGE_PRODUCTS, JSON.stringify(mapped));
    return mapped;
  } catch {
    return [];
  }
}

export async function api<T = any>(action: string, data: Record<string, any> = {}, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  let token = '';
  try {
    if (auth?.currentUser) {
      token = await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('Could not retrieve token:', err);
  }

  // Try fetching via /api proxy or direct upstream
  try {
    const endpoint = '/api';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data, token })
    });
    if (response.ok) {
      const result = await response.json();
      if (result && result.ok) {
        return result as T;
      }
    }
  } catch (err) {
    console.warn('Proxy API notice, trying direct/local fallback:', err);
  }

  // Client-side fallback handler
  let localProducts: Product[] = [];
  const storedProd = localStorage.getItem(LOCAL_STORAGE_PRODUCTS);
  if (storedProd) {
    try { localProducts = JSON.parse(storedProd); } catch {}
  }
  if (!localProducts.length) {
    localProducts = await initLocalFallback();
  }

  if (action === 'catalog') {
    const publicProducts = localProducts.filter(p => p.active !== false).map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category,
      image: p.image,
      retail: p.retail,
      active: p.active,
      stock: p.stock
    }));
    return { ok: true, products: publicProducts } as unknown as T;
  }

  if (action === 'privateCatalog') {
    return {
      ok: true,
      products: localProducts.filter(p => p.active !== false).map(p => ({ id: p.id, wholesale: p.wholesale }))
    } as unknown as T;
  }

  if (action === 'myRole') {
    return { ok: true, admin: true, reseller: true } as unknown as T;
  }

  if (action === 'adminProducts') {
    return { ok: true, products: localProducts } as unknown as T;
  }

  if (action === 'saveProduct') {
    const p = data.product;
    if (!p || !p.sku || !p.name) throw new Error('SKU y nombre son obligatorios');
    const id = p.id || `prod_${Date.now()}`;
    const newProd: Product = {
      ...p,
      id,
      retail: Number(p.retail) || 0,
      wholesale: Number(p.wholesale) || 0,
      stock: p.stock === null || p.stock === undefined || p.stock === '' ? null : Number(p.stock),
      active: p.active !== false,
      updatedAt: new Date().toISOString()
    };
    const idx = localProducts.findIndex(x => x.id === id);
    if (idx >= 0) localProducts[idx] = newProd;
    else localProducts.unshift(newProd);

    localStorage.setItem(LOCAL_STORAGE_PRODUCTS, JSON.stringify(localProducts));
    return { ok: true, product: newProd } as unknown as T;
  }

  if (action === 'deleteProduct') {
    localProducts = localProducts.filter(x => x.id !== data.id);
    localStorage.setItem(LOCAL_STORAGE_PRODUCTS, JSON.stringify(localProducts));
    return { ok: true } as unknown as T;
  }

  if (action === 'importProducts') {
    const toImport: any[] = data.products || [];
    toImport.forEach((raw, i) => {
      const idx = localProducts.findIndex(x => x.sku.toLowerCase() === String(raw.sku).toLowerCase());
      const item: Product = {
        id: idx >= 0 ? localProducts[idx].id : `prod_imp_${Date.now()}_${i}`,
        sku: String(raw.sku).trim(),
        name: String(raw.name).trim(),
        description: String(raw.description || ''),
        category: String(raw.category || 'General'),
        retail: Number(raw.retail) || 0,
        wholesale: Number(raw.wholesale) || 0,
        stock: raw.stock !== undefined && raw.stock !== null ? Number(raw.stock) : null,
        active: raw.active !== false,
        image: String(raw.image || '/assets/placeholder.svg'),
        updatedAt: new Date().toISOString()
      };
      if (idx >= 0) localProducts[idx] = item;
      else localProducts.push(item);
    });
    localStorage.setItem(LOCAL_STORAGE_PRODUCTS, JSON.stringify(localProducts));
    return { ok: true, count: toImport.length } as unknown as T;
  }

  if (action === 'bulkUpdateProducts') {
    const ids: string[] = data.ids || [];
    const updates = data.updates || {};
    localProducts = localProducts.map(p => {
      if (!ids.includes(p.id)) return p;
      const mod = { ...p };
      if (updates.active !== undefined) mod.active = updates.active;
      if (updates.category) mod.category = updates.category;
      if (updates.stock !== undefined) mod.stock = updates.stock;
      if (updates.retailPrice !== undefined) mod.retail = updates.retailPrice;
      if (updates.wholesalePrice !== undefined) mod.wholesale = updates.wholesalePrice;
      if (updates.retailPct !== undefined) mod.retail = Math.round(mod.retail * (1 + updates.retailPct / 100));
      if (updates.wholesalePct !== undefined) mod.wholesale = Math.round(mod.wholesale * (1 + updates.wholesalePct / 100));
      return mod;
    });
    localStorage.setItem(LOCAL_STORAGE_PRODUCTS, JSON.stringify(localProducts));
    return { ok: true, count: ids.length } as unknown as T;
  }

  if (action === 'createOrder') {
    const order = data.order;
    const orderNumber = `AK-${Date.now().toString().slice(-6)}`;
    const savedOrder: Order = {
      id: `ord_${Date.now()}`,
      orderNumber,
      date: new Date().toISOString(),
      customerName: order.customerName,
      note: order.note || '',
      priceType: order.priceType || 'minorista',
      items: order.items,
      total: order.total || 0,
      status: 'Pendiente'
    };
    let orders: Order[] = [];
    try {
      orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ORDERS) || '[]');
    } catch {}
    orders.unshift(savedOrder);
    localStorage.setItem(LOCAL_STORAGE_ORDERS, JSON.stringify(orders));
    return { ok: true, orderNumber, order: savedOrder } as unknown as T;
  }

  if (action === 'adminOrders') {
    let orders: Order[] = [];
    try {
      orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ORDERS) || '[]');
    } catch {}
    return { ok: true, orders } as unknown as T;
  }

  if (action === 'updateOrder') {
    let orders: Order[] = [];
    try {
      orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ORDERS) || '[]');
    } catch {}
    const order = orders.find(o => o.id === data.id);
    if (order) order.status = data.status;
    localStorage.setItem(LOCAL_STORAGE_ORDERS, JSON.stringify(orders));
    return { ok: true, order } as unknown as T;
  }

  if (action === 'adminResellers') {
    let resellers: Reseller[] = [
      { email: 'revendedor@akari.com', name: 'Distribuidora Central', active: true, updatedAt: new Date().toISOString() }
    ];
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_RESELLERS);
      if (stored) resellers = JSON.parse(stored);
    } catch {}
    return { ok: true, resellers } as unknown as T;
  }

  if (action === 'saveReseller') {
    let resellers: Reseller[] = [];
    try {
      resellers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_RESELLERS) || '[]');
    } catch {}
    const existing = resellers.find(r => r.email.toLowerCase() === data.reseller.email.toLowerCase());
    if (existing) {
      existing.name = data.reseller.name;
      existing.active = data.reseller.active !== false;
      existing.updatedAt = new Date().toISOString();
    } else {
      resellers.push({
        email: data.reseller.email,
        name: data.reseller.name,
        active: data.reseller.active !== false,
        updatedAt: new Date().toISOString()
      });
    }
    localStorage.setItem(LOCAL_STORAGE_RESELLERS, JSON.stringify(resellers));
    return { ok: true } as unknown as T;
  }

  if (action === 'adminHistory') {
    let history: HistoryEntry[] = [];
    try {
      history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_HISTORY) || '[]');
    } catch {}
    return { ok: true, history } as unknown as T;
  }

  return { ok: true } as unknown as T;
}

export function readCachedCatalog(): Product[] | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const time = Number(localStorage.getItem(CATALOG_CACHE_TIME_KEY)) || 0;
    if (Date.now() - time > CACHE_MAX_AGE_MS * 10) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeCachedCatalog(products: Product[]): void {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(products));
    localStorage.setItem(CATALOG_CACHE_TIME_KEY, String(Date.now()));
  } catch (e) {
    console.warn('Could not cache catalog locally:', e);
  }
}
