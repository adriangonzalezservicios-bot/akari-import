import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const DEFAULT_APPS_SCRIPT_URL =
  process.env.GOOGLE_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbytHLZ3bvYtaeX-RKgQvmx1PZHFse0z08XsggKByD651SrHKRc0uiUGMulyJOuxgs5e/exec';

// In-memory fallback dataset loaded from importar-productos.json
let localProducts: any[] = [];
let localOrders: any[] = [];
let localResellers: any[] = [
  { email: 'revendedor@akari.com', name: 'Distribuidora Central', active: true, updatedAt: new Date().toISOString() }
];
let localHistory: any[] = [];

try {
  const samplePath = path.resolve(__dirname, 'importar-productos.json');
  if (fs.existsSync(samplePath)) {
    const raw = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
    localProducts = raw.map((p: any, idx: number) => ({
      id: p.id || `prod_${idx + 1}_${p.sku || ''}`,
      sku: String(p.sku || '').trim(),
      name: String(p.name || '').trim(),
      description: String(p.description || ''),
      category: String(p.category || 'General'),
      image: String(p.image || 'assets/placeholder.svg'),
      retail: Number(p.retail) || 0,
      wholesale: Number(p.wholesale) || 0,
      active: p.active !== false,
      stock: p.stock === undefined || p.stock === null ? null : Number(p.stock),
      updatedAt: new Date().toISOString()
    }));
    console.log(`Loaded ${localProducts.length} baseline products from importar-productos.json`);
  }
} catch (err) {
  console.warn('Could not load importar-productos.json:', err);
}

// Memory cache for public catalog from upstream
let cachedCatalog: { timestamp: number; data: any } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

async function proxyToAppsScript(action: string, payload: any, token: string = '') {
  const target = DEFAULT_APPS_SCRIPT_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload, token }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await response.text();
    if (!text) {
      throw new Error(`Empty response from upstream (${response.status})`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON response from Google Apps Script');
    }
  } finally {
    clearTimeout(timeout);
  }
}

// Handle all /api requests
app.all('/api', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const action = req.method === 'GET' ? (req.query.action as string || 'catalog') : (req.body?.action || 'catalog');
  const token = req.body?.token || '';
  const body = req.method === 'GET' ? req.query : req.body || {};

  // Check cache for catalog action if no token
  if (action === 'catalog' && !token && cachedCatalog && (Date.now() - cachedCatalog.timestamp < CACHE_TTL_MS)) {
    res.setHeader('X-Akari-Cache', 'HIT');
    return res.json(cachedCatalog.data);
  }

  // Attempt upstream Apps Script
  try {
    const upstreamRes = await proxyToAppsScript(action, body, token);
    if (upstreamRes && upstreamRes.ok) {
      if (action === 'catalog' && !token) {
        cachedCatalog = { timestamp: Date.now(), data: upstreamRes };
      }
      return res.json(upstreamRes);
    } else if (upstreamRes && upstreamRes.ok === false) {
      // If error is authentication/authorization related, return it
      if (upstreamRes.error && /permiso|sesión|acceso/i.test(upstreamRes.error)) {
        return res.json(upstreamRes);
      }
    }
  } catch (err: any) {
    console.warn(`Upstream error for action "${action}":`, err.message);
  }

  // Fallback to local in-memory dataset when upstream is unavailable or offline
  try {
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
      return res.json({ ok: true, products: publicProducts, source: 'local' });
    }

    if (action === 'privateCatalog') {
      return res.json({
        ok: true,
        products: localProducts.filter(p => p.active !== false).map(p => ({ id: p.id, wholesale: p.wholesale }))
      });
    }

    if (action === 'myRole') {
      return res.json({ ok: true, admin: true, reseller: true });
    }

    if (action === 'adminProducts') {
      return res.json({ ok: true, products: localProducts });
    }

    if (action === 'saveProduct') {
      const p = body.product;
      if (!p || !p.sku || !p.name) return res.status(400).json({ ok: false, error: 'SKU y nombre son obligatorios.' });
      const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newProd = {
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

      localHistory.unshift({
        date: new Date().toISOString(),
        user: 'Admin',
        action: 'Producto guardado',
        detail: `${newProd.sku} — ${newProd.name}`
      });
      return res.json({ ok: true, product: newProd });
    }

    if (action === 'deleteProduct') {
      const id = body.id;
      localProducts = localProducts.filter(x => x.id !== id);
      localHistory.unshift({
        date: new Date().toISOString(),
        user: 'Admin',
        action: 'Producto eliminado',
        detail: id
      });
      return res.json({ ok: true });
    }

    if (action === 'bulkUpdateProducts') {
      const ids: string[] = body.ids || [];
      const updates = body.updates || {};
      localProducts = localProducts.map(p => {
        if (!ids.includes(p.id)) return p;
        const modified = { ...p };
        if (updates.active !== undefined) modified.active = updates.active;
        if (updates.category) modified.category = updates.category;
        if (updates.stock !== undefined) modified.stock = updates.stock;
        if (updates.retailPrice !== undefined) modified.retail = updates.retailPrice;
        if (updates.wholesalePrice !== undefined) modified.wholesale = updates.wholesalePrice;
        if (updates.retailPct !== undefined) modified.retail = Math.round(modified.retail * (1 + updates.retailPct / 100));
        if (updates.wholesalePct !== undefined) modified.wholesale = Math.round(modified.wholesale * (1 + updates.wholesalePct / 100));
        return modified;
      });
      localHistory.unshift({
        date: new Date().toISOString(),
        user: 'Admin',
        action: 'Edición masiva',
        detail: `${ids.length} productos actualizados`
      });
      return res.json({ ok: true, count: ids.length });
    }

    if (action === 'createOrder') {
      const order = body.order;
      if (!order || !order.customerName || !order.items?.length) {
        return res.status(400).json({ ok: false, error: 'Pedido incompleto.' });
      }
      const orderNumber = `AK-${Date.now().toString().slice(-6)}`;
      const savedOrder = {
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
      localOrders.unshift(savedOrder);
      localHistory.unshift({
        date: new Date().toISOString(),
        user: order.customerName,
        action: 'Nuevo pedido',
        detail: `${orderNumber} (${order.priceType}) - Total $${order.total}`
      });
      return res.json({ ok: true, orderNumber, order: savedOrder });
    }

    if (action === 'adminOrders') {
      return res.json({ ok: true, orders: localOrders });
    }

    if (action === 'updateOrder') {
      const { id, status } = body;
      const order = localOrders.find(o => o.id === id);
      if (order) {
        order.status = status;
        localHistory.unshift({
          date: new Date().toISOString(),
          user: 'Admin',
          action: 'Pedido actualizado',
          detail: `${order.orderNumber} -> ${status}`
        });
      }
      return res.json({ ok: true, order });
    }

    if (action === 'adminResellers') {
      return res.json({ ok: true, resellers: localResellers });
    }

    if (action === 'saveReseller') {
      const { reseller } = body;
      const existing = localResellers.find(r => r.email.toLowerCase() === reseller.email.toLowerCase());
      if (existing) {
        existing.name = reseller.name;
        existing.active = reseller.active !== false;
        existing.updatedAt = new Date().toISOString();
      } else {
        localResellers.push({
          email: reseller.email,
          name: reseller.name,
          active: reseller.active !== false,
          updatedAt: new Date().toISOString()
        });
      }
      return res.json({ ok: true });
    }

    if (action === 'adminHistory') {
      return res.json({ ok: true, history: localHistory });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || 'Error en el servidor local' });
  }
});

// Serve static assets directory if needed
app.use('/assets', express.static(path.resolve(__dirname, 'assets')));

// Vite integration
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Akari Import server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
