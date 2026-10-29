/**
 * AKARI IMPORT - Backend Google Apps Script
 * Implementar como Aplicación web: Ejecutar como Yo, acceso Cualquier persona.
 * Propiedades: FIREBASE_WEB_API_KEY, ADMIN_EMAILS
 */
const TABS = { products: 'Productos', orders: 'Pedidos', resellers: 'Revendedores', history: 'Historial', settings: 'Configuracion' };
const HEADERS = {
  products: ['id', 'sku', 'name', 'description', 'category', 'image', 'retail', 'wholesale', 'active', 'stock', 'updatedAt'],
  orders: ['id', 'orderNumber', 'date', 'uid', 'customerName', 'note', 'priceType', 'itemsJson', 'total', 'status'],
  resellers: ['email', 'name', 'active', 'updatedAt'],
  history: ['date', 'user', 'action', 'detail'],
  settings: ['key', 'value']
};
function setupAkari() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(key => {
    let sheet = ss.getSheetByName(TABS[key]);
    if (!sheet) sheet = ss.insertSheet(TABS[key]);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS[key]);
  });
  return 'Hojas listas: ' + Object.values(TABS).join(', ');
}
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'catalog';
    return json_(handle_(action, {}, ''));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(handle_(body.action || '', body, body.token || ''));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function handle_(action, b, token) {
  if (action === 'health') return health_();
  if (action === 'catalog') {
    return { ok: true, products: rows_('products').filter(p => p.active).map(publicProduct_) };
  }
  if (action === 'createOrder') return withLock_(() => createOrder_(b.order, token));
  const ident = verify_(token);
  if (!ident) throw Error('Iniciá sesión nuevamente.');
  const role = role_(ident);
  if (action === 'myRole') return { ok: true, admin: role.admin, reseller: role.reseller };
  if (action === 'privateCatalog') {
    if (!role.admin && !role.reseller) throw Error('No tenés permiso para ver precios mayoristas.');
    return { ok: true, products: rows_('products').filter(p => p.active).map(p => ({ id: p.id, wholesale: p.wholesale })) };
  }
  if (!role.admin) throw Error('Acceso exclusivo para administración.');
  switch (action) {
    case 'adminProducts': return { ok: true, products: rows_('products') };
    case 'saveProduct': return withLock_(() => saveProduct_(b.product, ident));
    case 'deleteProduct': return withLock_(() => deleteProduct_(b.id, ident));
    case 'importProducts': return withLock_(() => importProducts_(b.products, ident));
    case 'adminOrders': return { ok: true, orders: rows_('orders').reverse() };
    case 'updateOrder': return withLock_(() => updateOrder_(b, ident));
    case 'adminResellers': return { ok: true, resellers: rows_('resellers') };
    case 'saveReseller': return withLock_(() => saveReseller_(b.reseller, ident));
    case 'setReseller': return withLock_(() => setReseller_(b, ident));
    case 'createFirebaseAccount': return createFirebaseAccount_(b.email, b.password);
    case 'resetResellerPassword': return resetResellerPassword_(b, ident);
    case 'bulkUpdateProducts': return withLock_(() => bulkUpdateProducts_(b, ident));
    case 'upsertProducts': return withLock_(() => upsertProducts_(b, ident));
    case 'setProductImage': return withLock_(() => setProductImage_(b, ident));
    case 'adminHistory': return { ok: true, history: rows_('history').reverse().slice(0, 200) };
    default: throw Error('Acción desconocida: ' + action);
  }
}
function health_() {
  const props = PropertiesService.getScriptProperties();
  const tabs = Object.values(TABS).map(n => ({ name: n, exists: !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n) }));
  return {
    ok: true,
    version: 5,
    hasFirebaseKey: !!props.getProperty('FIREBASE_WEB_API_KEY'),
    hasAdminEmails: !!props.getProperty('ADMIN_EMAILS'),
    tabs: tabs,
    productCount: rows_('products').length
  };
}
function verify_(token) {
  if (!token) return null;
  const key = firebaseKey_();
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key);
  const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !data.users || !data.users[0]) return null;
  const u = data.users[0];
  return { uid: u.localId, email: u.email };
}
function role_(u) {
  const admins = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
  const admin = admins.indexOf(String(u.email || '').toLowerCase()) >= 0;
  const reseller = rows_('resellers').some(r => r.active && String(r.email).toLowerCase() === String(u.email).toLowerCase());
  return { admin: admin, reseller: reseller || admin };
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function safe_(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  return v === undefined || v === null ? '' : String(v);
}
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function rows_(key) {
  const sheet = ss_().getSheetByName(TABS[key]);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.filter(r => r.some(x => x !== '' && x !== null)).map(r => {
    const o = {};
    headers.forEach((k, i) => { o[k] = r[i]; });
    if (key === 'products') {
      o.id = String(o.id);
      o.sku = String(o.sku);
      o.active = o.active === true || String(o.active).toUpperCase() === 'TRUE';
      o.retail = Number(o.retail) || 0;
      o.wholesale = Number(o.wholesale) || 0;
      o.stock = (o.stock === '' || o.stock === null || o.stock === undefined) ? null : Number(o.stock);
      if (o.stock !== null && !isFinite(o.stock)) o.stock = null;
    }
    if (key === 'resellers') o.active = o.active === true || String(o.active).toUpperCase() === 'TRUE';
    if (key === 'orders') {
      o.id = String(o.id);
      o.total = Number(o.total) || 0;
      try { o.items = JSON.parse(o.itemsJson || '[]'); } catch (err) { o.items = []; }
    }
    return o;
  });
}
function write_(key, items) {
  const headers = HEADERS[key];
  const sheet = ss_().getSheetByName(TABS[key]);
  sheet.clearContents();
  sheet.appendRow(headers);
  if (!items.length) return;
  if (key === 'products') sheet.getRange(2, 1, items.length, 2).setNumberFormat('@');
  const matrix = items.map(o => headers.map(h => (o[h] === undefined || o[h] === null ? '' : safe_(o[h]))));
  sheet.getRange(2, 1, items.length, headers.length).setValues(matrix);
}
function log_(u, action, detail) {
  ss_().getSheetByName(TABS.history).appendRow([new Date(), safe_(u.email), action, safe_(String(detail).slice(0, 500))]);
}
function publicProduct_(p) {
  return { id: p.id, sku: p.sku, name: p.name, description: p.description, category: p.category, image: p.image, retail: p.retail, active: p.active, stock: p.stock };
}
function saveProduct_(p, u) {
  if (!p || !p.sku || !p.name) throw Error('SKU y nombre son obligatorios.');
  const all = rows_('products');
  const id = p.id || Utilities.getUuid();
  const o = {
    id: id,
    sku: String(p.sku).trim(),
    name: String(p.name).trim(),
    description: String(p.description || ''),
    category: String(p.category || 'General'),
    image: String(p.image || ''),
    retail: Number(p.retail) || 0,
    wholesale: Number(p.wholesale) || 0,
    active: !!p.active,
    stock: (p.stock === '' || p.stock === null || p.stock === undefined) ? null : Number(p.stock),
    updatedAt: new Date()
  };
  if (o.stock !== null && !isFinite(o.stock)) o.stock = null;
  if (o.stock !== null) o.stock = Math.max(0, Math.floor(o.stock));
  if (o.image && !/^https:\/\//i.test(o.image) && !o.image.startsWith('assets/')) throw Error('La imagen debe ser una URL HTTPS.');
  const i = all.findIndex(x => x.id === id);
  if (i < 0) all.push(o); else all[i] = o;
  write_('products', all);
  log_(u, 'Producto guardado', o.sku + ' — ' + o.name);
  return { ok: true, product: o };
}
function deleteProduct_(id, u) {
  const all = rows_('products').filter(p => p.id !== id);
  write_('products', all);
  log_(u, 'Producto eliminado', id);
  return { ok: true };
}
function importProducts_(arr, u) {
  if (!Array.isArray(arr) || !arr.length) throw Error('Sin productos para importar.');
  const all = rows_('products');
  const bySku = {};
  all.forEach(p => { bySku[String(p.sku).toUpperCase()] = p; });
  let n = 0;
  arr.forEach(raw => {
    if (!raw || !raw.sku || !raw.name) return;
    const sku = String(raw.sku).trim();
    const existing = bySku[sku.toUpperCase()];
    const o = {
      id: existing ? existing.id : Utilities.getUuid(),
      sku: sku,
      name: String(raw.name).trim(),
      description: String(raw.description || ''),
      category: String(raw.category || 'General'),
      image: String(raw.image || ''),
      retail: Number(raw.retail) || 0,
      wholesale: Number(raw.wholesale) || 0,
      active: raw.active !== false,
      stock: raw.stock === undefined || raw.stock === null || raw.stock === '' ? null : Math.max(0, Math.floor(Number(raw.stock))),
      updatedAt: new Date()
    };
    if (o.stock !== null && !isFinite(o.stock)) o.stock = null;
    if (existing) {
      const i = all.findIndex(x => x.id === existing.id);
      all[i] = o;
    } else all.push(o);
    bySku[sku.toUpperCase()] = o;
    n++;
  });
  write_('products', all);
  log_(u, 'Importación', n + ' productos');
  return { ok: true, count: n };
}
function createOrder_(order, token) {
  if (!order || !order.customerName || !Array.isArray(order.items) || !order.items.length) throw Error('Pedido incompleto.');
  const products = rows_('products');
  const byId = {};
  products.forEach(p => { byId[p.id] = p; });
  const lines = order.items.map(i => {
    const p = byId[i.productId];
    if (!p || !p.active) throw Error('Producto no disponible: ' + (i.sku || i.productId));
    const qty = Math.max(1, Math.min(999, Math.floor(Number(i.quantity)) || 1));
    const unit = order.priceType === 'mayorista' ? (Number(p.wholesale) || Number(p.retail) || 0) : (Number(p.retail) || 0);
    return { productId: p.id, sku: p.sku, name: p.name, quantity: qty, unitPrice: unit };
  });
  const total = lines.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  let uid = '';
  const ident = token ? verify_(token) : null;
  if (ident) uid = ident.uid;
  const id = Utilities.getUuid();
  const orderNumber = 'AK' + Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyMMddHHmmss');
  const row = {
    id: id, orderNumber: orderNumber, date: new Date(), uid: uid,
    customerName: String(order.customerName).trim(), note: String(order.note || ''),
    priceType: order.priceType === 'mayorista' ? 'mayorista' : 'minorista',
    itemsJson: JSON.stringify(lines), total: total, status: 'nuevo'
  };
  const all = rows_('orders');
  all.push(row);
  write_('orders', all);
  return { ok: true, orderNumber: orderNumber, total: total };
}
function money_(n) { return '$' + Number(n).toLocaleString('es-AR'); }
function updateOrder_(b, u) {
  const all = rows_('orders');
  const i = all.findIndex(o => o.id === String(b.id));
  if (i < 0) throw Error('Pedido no encontrado.');
  if (b.status) all[i].status = String(b.status);
  write_('orders', all);
  log_(u, 'Pedido actualizado', all[i].orderNumber + ' ' + all[i].status);
  return { ok: true };
}
function saveReseller_(r, u) {
  if (!r || !r.email) throw Error('Email obligatorio.');
  const all = rows_('resellers');
  const email = String(r.email).trim().toLowerCase();
  const i = all.findIndex(x => String(x.email).toLowerCase() === email);
  const o = { email: email, name: String(r.name || ''), active: r.active !== false, updatedAt: new Date() };
  if (i < 0) all.push(o); else all[i] = o;
  write_('resellers', all);
  log_(u, 'Revendedor', email);
  return { ok: true, reseller: o };
}
function firebaseKey_() {
  const k = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!k) throw Error('Falta FIREBASE_WEB_API_KEY en propiedades del script.');
  return k;
}
function firebasePost_(endpoint, payload) {
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/' + endpoint + '?key=' + encodeURIComponent(firebaseKey_()), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), data: JSON.parse(res.getContentText() || '{}') };
}
function createFirebaseAccount_(email, password) {
  const r = firebasePost_('accounts:signUp', { email: email, password: password, returnSecureToken: true });
  if (r.code !== 200) throw Error(r.data.error && r.data.error.message ? r.data.error.message : 'No se pudo crear la cuenta');
  return { ok: true, email: email };
}
function resetResellerPassword_(b, u) {
  const r = firebasePost_('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: b.email });
  if (r.code !== 200) throw Error(r.data.error && r.data.error.message ? r.data.error.message : 'No se pudo enviar el enlace');
  log_(u, 'Reset password', b.email);
  return { ok: true };
}
function roundTo_(n, step) {
  const s = Number(step) > 1 ? Number(step) : 1;
  return Math.max(0, Math.round(n / s) * s);
}
function bulkUpdateProducts_(b, u) {
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
  if (!ids.length) throw Error('No hay productos seleccionados.');
  if (ids.length > 1000) throw Error('Demasiados productos en una sola operación.');
  const ch = b.changes || {};
  const hasCategory = typeof ch.category === 'string' && ch.category.trim() !== '';
  const hasActive = typeof ch.active === 'boolean';
  const retailPct = ch.retailPercent === undefined || ch.retailPercent === null || ch.retailPercent === '' ? 0 : Number(ch.retailPercent);
  const wholesalePct = ch.wholesalePercent === undefined || ch.wholesalePercent === null || ch.wholesalePercent === '' ? 0 : Number(ch.wholesalePercent);
  if (!isFinite(retailPct) || !isFinite(wholesalePct)) throw Error('Los porcentajes deben ser números.');
  if (retailPct < -90 || retailPct > 500 || wholesalePct < -90 || wholesalePct > 500) throw Error('Los porcentajes deben estar entre -90 y 500.');
  const hasRetailPrice = ch.retailPrice !== undefined && ch.retailPrice !== null && ch.retailPrice !== '';
  const hasWholesalePrice = ch.wholesalePrice !== undefined && ch.wholesalePrice !== null && ch.wholesalePrice !== '';
  const retailPrice = hasRetailPrice ? Number(ch.retailPrice) : null;
  const wholesalePrice = hasWholesalePrice ? Number(ch.wholesalePrice) : null;
  if (hasRetailPrice && (!isFinite(retailPrice) || retailPrice < 0)) throw Error('Precio minorista fijo inválido.');
  if (hasWholesalePrice && (!isFinite(wholesalePrice) || wholesalePrice < 0)) throw Error('Precio mayorista fijo inválido.');
  const hasStock = ch.stock !== undefined && ch.stock !== null && ch.stock !== '';
  const stockVal = hasStock ? Number(ch.stock) : null;
  if (hasStock && (!isFinite(stockVal) || stockVal < 0)) throw Error('Cantidad de stock inválida.');
  const stockOut = ch.stockOut === true;
  if (!hasCategory && !hasActive && !retailPct && !wholesalePct && !hasRetailPrice && !hasWholesalePrice && !hasStock && !stockOut) throw Error('No indicaste ningún cambio.');
  const wanted = {};
  ids.forEach(id => { wanted[id] = true; });
  const all = rows_('products');
  let count = 0;
  all.forEach(p => {
    if (!wanted[p.id]) return;
    if (hasCategory) p.category = ch.category.trim();
    if (hasActive) p.active = ch.active;
    if (retailPct) p.retail = roundTo_(p.retail * (1 + retailPct / 100), ch.roundTo);
    if (wholesalePct) p.wholesale = roundTo_(p.wholesale * (1 + wholesalePct / 100), ch.roundTo);
    if (hasRetailPrice) p.retail = money2_(retailPrice);
    if (hasWholesalePrice) p.wholesale = money2_(wholesalePrice);
    if (stockOut) p.stock = 0;
    else if (hasStock) p.stock = Math.floor(stockVal);
    p.updatedAt = new Date();
    count++;
  });
  if (!count) throw Error('Ninguno de los productos seleccionados existe.');
  write_('products', all);
  const resumen = [];
  if (hasCategory) resumen.push('categoría=' + ch.category.trim());
  if (hasActive) resumen.push('publicado=' + ch.active);
  if (retailPct) resumen.push('minorista ' + retailPct + '%');
  if (wholesalePct) resumen.push('mayorista ' + wholesalePct + '%');
  if (hasRetailPrice) resumen.push('minorista=$' + retailPrice);
  if (hasWholesalePrice) resumen.push('mayorista=$' + wholesalePrice);
  if (stockOut) resumen.push('sin stock');
  else if (hasStock) resumen.push('stock=' + Math.floor(stockVal));
  log_(u, 'Edición masiva', count + ' productos · ' + resumen.join(' · '));
  return { ok: true, count: count };
}
function normSku_(s) { return String(s === undefined || s === null ? '' : s).trim().toUpperCase(); }
function validImage_(s) { return !s || /^https:\/\//i.test(s) || s.indexOf('assets/') === 0; }
function money2_(n) { return Math.round(n * 100) / 100; }
function upsertProducts_(b, u) {
  const items = Array.isArray(b.products) ? b.products : [];
  if (!items.length) throw Error('Sin filas para aplicar.');
  const all = rows_('products');
  const byId = {};
  all.forEach(p => { byId[p.id] = p; });
  let created = 0, updated = 0;
  items.forEach(rec => {
    if (!rec) return;
    const id = rec.id ? String(rec.id) : '';
    if (id && byId[id]) {
      const p = byId[id];
      if (rec.sku !== undefined) p.sku = String(rec.sku).trim();
      if (rec.name !== undefined) p.name = String(rec.name).trim();
      if (rec.description !== undefined) p.description = String(rec.description);
      if (rec.category !== undefined) p.category = String(rec.category || 'General');
      if (rec.image !== undefined) p.image = String(rec.image || '');
      if (rec.retail !== undefined) p.retail = Number(rec.retail) || 0;
      if (rec.wholesale !== undefined) p.wholesale = Number(rec.wholesale) || 0;
      if (rec.active !== undefined) p.active = !!rec.active;
      if (rec.stock !== undefined) {
        p.stock = rec.stock === null || rec.stock === '' ? null : Math.max(0, Math.floor(Number(rec.stock)));
        if (p.stock !== null && !isFinite(p.stock)) p.stock = null;
      }
      p.updatedAt = new Date();
      updated++;
    } else {
      if (!rec.sku || !rec.name) return;
      const o = {
        id: Utilities.getUuid(), sku: String(rec.sku).trim(), name: String(rec.name).trim(),
        description: String(rec.description || ''), category: String(rec.category || 'General'),
        image: String(rec.image || ''), retail: Number(rec.retail) || 0, wholesale: Number(rec.wholesale) || 0,
        active: rec.active !== false,
        stock: rec.stock === undefined || rec.stock === null || rec.stock === '' ? null : Math.max(0, Math.floor(Number(rec.stock))),
        updatedAt: new Date()
      };
      if (o.stock !== null && !isFinite(o.stock)) o.stock = null;
      all.push(o);
      byId[o.id] = o;
      created++;
    }
  });
  write_('products', all);
  log_(u, 'Upsert Excel', 'nuevos=' + created + ' modificados=' + updated);
  return { ok: true, created: created, updated: updated };
}
function photoFolder_() {
  const name = 'Akari Import - Fotos de productos';
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}
function setProductImage_(b, u) {
  if (!b || !b.id || !b.data) throw Error('Faltan datos de imagen.');
  const all = rows_('products');
  const p = all.find(x => x.id === String(b.id));
  if (!p) throw Error('Producto no encontrado.');
  const bytes = Utilities.base64Decode(b.data);
  const blob = Utilities.newBlob(bytes, b.mimeType || 'image/jpeg', (b.filename || p.sku || 'foto') + '.jpg');
  const folder = photoFolder_();
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  const url = 'https://drive.google.com/uc?export=view&id=' + file.getId();
  p.image = url;
  p.updatedAt = new Date();
  write_('products', all);
  log_(u, 'Foto producto', p.sku);
  return { ok: true, url: url };
}
function autorizarPermisos() {
  photoFolder_();
  return 'Permisos de Drive OK';
}
function setReseller_(b, u) {
  const all = rows_('resellers');
  const r = all.find(x => String(x.email).toLowerCase() === String(b.email).toLowerCase());
  if (!r) throw Error('Revendedor no encontrado.');
  r.active = !!b.active;
  r.updatedAt = new Date();
  write_('resellers', all);
  log_(u, 'Permiso revendedor', r.email + ' activo=' + r.active);
  return { ok: true };
}
