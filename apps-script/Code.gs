/**
 * AKARI IMPORT - Backend en Google Apps Script (versión corregida).
 *
 * Implementar como Aplicación web:
 *   Ejecutar como: Yo
 *   Quién tiene acceso: Cualquier persona
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   FIREBASE_WEB_API_KEY = API Key web de Firebase
 *   ADMIN_EMAILS         = correo(s) administrador, separados por coma
 *
 * Diagnóstico: abrí  URL_DEL_SCRIPT/exec?action=health  en el navegador.
 */

const TABS = {
  products: 'Productos',
  orders: 'Pedidos',
  resellers: 'Revendedores',
  history: 'Historial',
  settings: 'Configuracion'
};

const HEADERS = {
  products: ['id', 'sku', 'name', 'description', 'category', 'image', 'retail', 'wholesale', 'active', 'updatedAt'],
  orders: ['id', 'orderNumber', 'date', 'uid', 'customerName', 'note', 'priceType', 'itemsJson', 'total', 'status'],
  resellers: ['email', 'name', 'active', 'updatedAt'],
  history: ['date', 'user', 'action', 'detail'],
  settings: ['key', 'value']
};

/* ---------- Preparación inicial (ejecutar una sola vez desde el editor) ---------- */

function setupAkari() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(key => {
    let sheet = ss.getSheetByName(TABS[key]);
    if (!sheet) sheet = ss.insertSheet(TABS[key]);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS[key]);
  });
  return 'Hojas listas: ' + Object.values(TABS).join(', ');
}

/* ---------- Entradas HTTP ---------- */

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

/* ---------- Enrutador de acciones ---------- */

function handle_(action, b, token) {
  // Públicas
  if (action === 'health') return health_();
  if (action === 'catalog') {
    return { ok: true, products: rows_('products').filter(p => p.active).map(publicProduct_) };
  }
  if (action === 'createOrder') return withLock_(() => createOrder_(b.order, token));

  // Requieren sesión
  const ident = verify_(token);
  if (!ident) throw Error('Iniciá sesión nuevamente.');
  const role = role_(ident);

  if (action === 'myRole') return { ok: true, admin: role.admin, reseller: role.reseller };

  if (action === 'privateCatalog') {
    if (!role.admin && !role.reseller) throw Error('No tenés permiso para ver precios mayoristas.');
    return {
      ok: true,
      products: rows_('products').filter(p => p.active).map(p => ({ id: p.id, wholesale: p.wholesale }))
    };
  }

  // Solo administración
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
    case 'resetResellerPassword': return resetResellerPassword_(b, ident);
    case 'bulkUpdateProducts': return withLock_(() => bulkUpdateProducts_(b, ident));
    case 'setProductImage': return setProductImage_(b, ident);
    case 'upsertProducts': return withLock_(() => upsertProducts_(b, ident));
    case 'adminHistory': return { ok: true, history: rows_('history').reverse().slice(0, 500) };
    default: throw Error('Acción no reconocida.');
  }
}

/* ---------- Diagnóstico (no expone claves ni correos) ---------- */

function health_() {
  const props = PropertiesService.getScriptProperties();
  const sheets = {};
  Object.keys(TABS).forEach(key => { sheets[key] = !!ss_().getSheetByName(TABS[key]); });
  return {
    ok: true,
    version: 4,
    firebaseKeyConfigured: !!props.getProperty('FIREBASE_WEB_API_KEY'),
    adminEmailsConfigured: !!(props.getProperty('ADMIN_EMAILS') || '').trim(),
    sheets: sheets,
    productsInSheet: sheets.products ? rows_('products').length : 0
  };
}

/* ---------- Seguridad y permisos ---------- */

function verify_(token) {
  if (!token) return null;
  const key = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!key) throw Error('Falta configurar FIREBASE_WEB_API_KEY en Apps Script.');
  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) return null;
  const data = JSON.parse(res.getContentText());
  const user = data.users && data.users[0];
  if (!user || user.disabled) return null;
  return { uid: user.localId, email: (user.email || '').toLowerCase() };
}

function role_(u) {
  const admins = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '';
  const isAdmin = admins.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(u.email);
  const reseller = rows_('resellers').find(x => String(x.email).toLowerCase() === u.email && x.active);
  return { admin: isAdmin, reseller: !!reseller };
}

// Evita que dos escrituras simultáneas se pisen entre sí.
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// Evita inyección de fórmulas: un texto que empiece con = + - @ se guarda como texto.
function safe_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

/* ---------- Acceso a la planilla ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function rows_(key) {
  const sheet = ss_().getSheetByName(TABS[key]);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(r => r.some(x => x !== '' && x !== null))
    .map(r => {
      const o = {};
      headers.forEach((k, i) => { o[k] = r[i]; });
      if (key === 'products') {
        o.id = String(o.id);
        o.sku = String(o.sku); // SKU numérico en la planilla se lee igual como texto
        o.active = o.active === true || String(o.active).toUpperCase() === 'TRUE';
        o.retail = Number(o.retail) || 0;
        o.wholesale = Number(o.wholesale) || 0;
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
  if (key === 'products') {
    // id y SKU como texto para no perder ceros a la izquierda ni duplicar al reimportar
    sheet.getRange(2, 1, items.length, 2).setNumberFormat('@');
  }
  const matrix = items.map(o => headers.map(h => (o[h] === undefined || o[h] === null ? '' : safe_(o[h]))));
  sheet.getRange(2, 1, items.length, headers.length).setValues(matrix);
}

function log_(u, action, detail) {
  ss_().getSheetByName(TABS.history).appendRow([new Date(), safe_(u.email), action, safe_(String(detail).slice(0, 500))]);
}

function publicProduct_(p) {
  return { id: p.id, sku: p.sku, name: p.name, description: p.description, category: p.category, image: p.image, retail: p.retail, active: p.active };
}

/* ---------- Productos ---------- */

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
    updatedAt: new Date()
  };
  if (o.image && !/^https:\/\//i.test(o.image) && !o.image.startsWith('assets/')) {
    throw Error('La imagen debe ser una URL HTTPS.');
  }
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
  if (!Array.isArray(arr)) throw Error('Lista de productos inválida.');
  const all = rows_('products');
  arr.forEach(src => {
    const sku = String(src.sku || src.code || '').trim();
    if (!sku) return;
    const old = all.find(p => p.sku === sku);
    const wholesale = Number(src.wholesale !== undefined && src.wholesale !== null ? src.wholesale : src.mayor) || 0;
    let image = String(src.image || src.img || '');
    if (image && !/^https:\/\//i.test(image) && !image.startsWith('assets/')) image = ''; // imagen no válida: se deja vacía y el producto se importa igual
    const item = {
      id: old ? old.id : Utilities.getUuid(),
      sku: sku,
      name: String(src.name || src.short || sku),
      description: String(src.description || ''),
      category: String(src.category || 'General'),
      image: image,
      retail: Number(src.retail) || 0,
      wholesale: wholesale,
      active: src.active !== false,
      updatedAt: new Date()
    };
    if (old) Object.assign(old, item); else all.push(item);
  });
  write_('products', all);
  log_(u, 'Importación de productos', arr.length + ' registros procesados');
  return { ok: true, count: arr.length };
}

/* ---------- Pedidos ---------- */

function createOrder_(order, token) {
  if (!order || !Array.isArray(order.items) || !order.items.length) throw Error('El pedido está vacío.');
  const ident = token ? verify_(token) : null;
  const role = ident ? role_(ident) : { admin: false, reseller: false };
  const priceType = order.priceType === 'mayorista' ? 'mayorista' : 'minorista';
  if (priceType === 'mayorista' && !role.reseller && !role.admin) {
    throw Error('No tenés permiso para usar precios mayoristas.');
  }

  // Los precios se recalculan acá con la planilla; se ignora lo que mande el navegador.
  const catalog = rows_('products');
  let total = 0;
  const items = order.items.slice(0, 200).map(i => {
    const p = catalog.find(x => x.id === String(i.productId) && x.active);
    if (!p) throw Error('Un producto ya no está disponible. Actualizá el catálogo.');
    const unit = priceType === 'mayorista' ? p.wholesale : p.retail;
    if (unit <= 0) throw Error('Hay un producto sin precio válido. Contactá a Akari Import.');
    const qty = Math.max(1, Math.min(999, Math.floor(Number(i.quantity)) || 1));
    total += unit * qty;
    return { productId: p.id, sku: p.sku, name: p.name, quantity: qty, unitPrice: unit };
  });

  const sheet = ss_().getSheetByName(TABS.orders);
  const id = Utilities.getUuid();
  const num = 'AK-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + String(sheet.getLastRow()).padStart(4, '0');
  sheet.appendRow([
    id,
    num,
    new Date(),
    ident ? ident.uid : 'guest',
    safe_(String(order.customerName || 'Cliente').slice(0, 120)),
    safe_(String(order.note || '').slice(0, 1000)),
    priceType,
    JSON.stringify(items),
    total,
    'Nuevo'
  ]);
  log_({ email: ident ? ident.email : 'cliente web' }, 'Pedido creado', num + ' · ' + money_(total));
  return { ok: true, orderNumber: num, total: total };
}

function money_(n) { return '$' + Number(n).toLocaleString('es-AR'); }

function updateOrder_(b, u) {
  const sheet = ss_().getSheetByName(TABS.orders);
  const v = sheet.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(b.id)) {
      sheet.getRange(i + 1, 10).setValue(String(b.status || 'Nuevo'));
      log_(u, 'Estado de pedido', v[i][1] + ' → ' + b.status);
      return { ok: true };
    }
  }
  throw Error('Pedido no encontrado');
}

/* ---------- Revendedores ---------- */

// Guarda al revendedor. Si se envía una contraseña, crea además su cuenta en Firebase.
// Si la cuenta ya existía, no se cambia su contraseña (ver resetResellerPassword_).
function saveReseller_(r, u) {
  if (!r || !r.email) throw Error('Correo obligatorio.');
  const email = String(r.email).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Error('El correo no es válido.');

  let account = 'sin-cambios';
  const password = r.password ? String(r.password) : '';
  if (password) {
    if (password.length < 8) throw Error('La contraseña debe tener al menos 8 caracteres.');
    account = createFirebaseAccount_(email, password); // 'creada' | 'existente' (o lanza error)
  }

  const all = rows_('resellers');
  const o = { email: email, name: String(r.name || ''), active: !!r.active, updatedAt: new Date() };
  const i = all.findIndex(x => String(x.email).toLowerCase() === email);
  if (i < 0) all.push(o); else all[i] = o;
  write_('resellers', all);
  // La contraseña nunca se guarda en la planilla ni en el historial.
  log_(u, 'Revendedor guardado', email + ' activo=' + o.active + ' cuenta=' + account);
  return { ok: true, account: account };
}

const FIREBASE_ERRORS_ = {
  OPERATION_NOT_ALLOWED: 'Firebase no permite crear cuentas con correo y contraseña. Activá Email/Password en Authentication → Sign-in method.',
  ADMIN_ONLY_OPERATION: 'Firebase tiene desactivado el alta de usuarios. En Authentication → Settings → User actions, activá "Enable create (sign-up)".',
  INVALID_EMAIL: 'El correo no es válido.',
  WEAK_PASSWORD: 'Firebase considera débil la contraseña. Usá al menos 8 caracteres.',
  EMAIL_NOT_FOUND: 'Ese correo no tiene cuenta en Firebase.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Probá de nuevo en unos minutos.'
};

function firebaseKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!key) throw Error('Falta configurar FIREBASE_WEB_API_KEY en Apps Script.');
  return key;
}

function firebasePost_(endpoint, payload) {
  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:' + endpoint + '?key=' + encodeURIComponent(firebaseKey_()),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
  );
  let data = {};
  try { data = JSON.parse(res.getContentText() || '{}'); } catch (err) { data = {}; }
  return { status: res.getResponseCode(), data: data };
}

function firebaseCode_(data) {
  const raw = (data && data.error && data.error.message) || '';
  return String(raw).split(' ')[0]; // "WEAK_PASSWORD : Password should..." -> "WEAK_PASSWORD"
}

// Crea la cuenta con correo y contraseña. Devuelve 'creada' o 'existente'.
function createFirebaseAccount_(email, password) {
  const r = firebasePost_('signUp', { email: email, password: password, returnSecureToken: false });
  if (r.status === 200) return 'creada';
  const code = firebaseCode_(r.data);
  if (code === 'EMAIL_EXISTS') return 'existente';
  throw Error(FIREBASE_ERRORS_[code] || ('No se pudo crear la cuenta en Firebase (' + (code || r.status) + ').'));
}

// Envía al revendedor un correo de Firebase para que elija una contraseña nueva.
function resetResellerPassword_(b, u) {
  const email = String((b && b.email) || '').toLowerCase().trim();
  if (!email) throw Error('Correo obligatorio.');
  const known = rows_('resellers').some(x => String(x.email).toLowerCase() === email);
  if (!known) throw Error('Ese correo no está en la lista de revendedores.');
  const r = firebasePost_('sendOobCode', { requestType: 'PASSWORD_RESET', email: email });
  if (r.status !== 200) {
    const code = firebaseCode_(r.data);
    throw Error(FIREBASE_ERRORS_[code] || ('No se pudo enviar el correo (' + (code || r.status) + ').'));
  }
  log_(u, 'Restablecer contraseña', email);
  return { ok: true };
}

/* ---------- Edición masiva de productos ---------- */

function roundTo_(n, step) {
  const s = Number(step) > 1 ? Number(step) : 1;
  return Math.max(0, Math.round(n / s) * s);
}

// b.ids: lista de ids. b.changes: { category, active, retailPercent, wholesalePercent, roundTo }
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
  if (retailPct < -90 || retailPct > 500 || wholesalePct < -90 || wholesalePct > 500) {
    throw Error('Los porcentajes deben estar entre -90 y 500.');
  }
  if (!hasCategory && !hasActive && !retailPct && !wholesalePct) throw Error('No indicaste ningún cambio.');

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
  log_(u, 'Edición masiva', count + ' productos · ' + resumen.join(' · '));
  return { ok: true, count: count };
}

/* ---------- Actualización de productos desde Excel ---------- */

function normSku_(s) { return String(s === undefined || s === null ? '' : s).trim().toUpperCase(); }

function validImage_(s) { return !s || /^https:\/\//i.test(s) || s.indexOf('assets/') === 0; }

function money2_(n) { return Math.round(n * 100) / 100; }

// b.rows: [{ row?, id?, sku, name, description?, category?, image?, retail?, wholesale?, active? }]
// - Se busca el producto por id; si no hay id (o no existe), por SKU; si tampoco, se crea uno nuevo.
// - Un campo ausente (undefined) no se modifica. Permite cambiar el SKU de un producto existente.
// - Todo o nada: si alguna fila es inválida o el resultado dejaría SKU repetidos, no se escribe nada.
function upsertProducts_(b, u) {
  const input = Array.isArray(b.rows) ? b.rows : null;
  if (!input) throw Error('Lista de filas inválida.');
  if (!input.length) throw Error('No hay filas para aplicar.');
  if (input.length > 3000) throw Error('Demasiadas filas en una sola carga (máximo 3000).');

  const all = rows_('products');
  const byId = {}, bySku = {};
  all.forEach(p => { byId[p.id] = p; bySku[normSku_(p.sku)] = p; });

  const errors = [];
  const touchedBy = {};  // id de producto existente -> etiqueta de la fila que lo modifica
  const plan = [];       // { target: producto existente | null, data: campos a aplicar }

  input.forEach((r, idx) => {
    const label = 'Fila ' + (r && r.row ? r.row : idx + 1);
    if (!r || typeof r !== 'object') { errors.push(label + ': datos inválidos.'); return; }
    const data = {};
    let bad = false;
    const fail = msg => { errors.push(label + ': ' + msg); bad = true; };

    data.sku = String(r.sku === undefined || r.sku === null ? '' : r.sku).trim();
    if (!data.sku) fail('falta el SKU.');
    data.name = String(r.name === undefined || r.name === null ? '' : r.name).trim();
    if (!data.name) fail('falta el nombre.');

    if (r.description !== undefined && r.description !== null) data.description = String(r.description);
    if (r.category !== undefined && r.category !== null) data.category = String(r.category).trim() || 'General';
    if (r.image !== undefined && r.image !== null) {
      data.image = String(r.image).trim();
      if (!validImage_(data.image)) fail('la imagen debe ser una URL que empiece con https://.');
    }
    ['retail', 'wholesale'].forEach(k => {
      const v = r[k];
      if (v === undefined || v === null || v === '') return;
      const n = Number(v);
      if (!isFinite(n) || n < 0) fail('el precio ' + (k === 'retail' ? 'minorista' : 'mayorista') + ' no es válido.');
      else data[k] = money2_(n);
    });
    if (r.active !== undefined && r.active !== null) {
      if (typeof r.active !== 'boolean') fail('el valor de "publicado" no es válido.');
      else data.active = r.active;
    }
    if (bad) return;

    const id = String(r.id === undefined || r.id === null ? '' : r.id).trim();
    const target = (id && byId[id]) || bySku[normSku_(data.sku)] || null;
    if (target) {
      // Mismo SKU salvo mayúsculas/espacios: se conserva el original (no es un cambio real).
      if (normSku_(data.sku) === normSku_(target.sku)) data.sku = target.sku;
      if (touchedBy[target.id]) { errors.push(label + ': modifica el mismo producto que la ' + touchedBy[target.id].toLowerCase() + '.'); return; }
      touchedBy[target.id] = label;
    }
    plan.push({ target: target, data: data, label: label });
  });

  // SKU únicos en el resultado final (permite intercambiar SKU entre dos productos).
  const finalSku = {};
  const newSku = {};
  plan.forEach(it => { if (it.target) newSku[it.target.id] = it.data.sku; });
  all.forEach(p => {
    const sku = normSku_(newSku[p.id] !== undefined ? newSku[p.id] : p.sku);
    (finalSku[sku] = finalSku[sku] || []).push(p.sku);
  });
  plan.filter(it => !it.target).forEach(it => {
    const sku = normSku_(it.data.sku);
    (finalSku[sku] = finalSku[sku] || []).push(it.data.sku + ' (' + it.label.toLowerCase() + ')');
  });
  Object.keys(finalSku).forEach(k => {
    if (finalSku[k].length > 1) errors.push('SKU repetido "' + k + '": quedaría en más de un producto.');
  });

  if (errors.length) {
    throw Error(errors.slice(0, 12).join('\n') + (errors.length > 12 ? '\n… y ' + (errors.length - 12) + ' errores más.' : ''));
  }

  let created = 0, updated = 0, unchanged = 0;
  plan.forEach(it => {
    if (it.target) {
      let changed = false;
      Object.keys(it.data).forEach(k => {
        if (it.target[k] !== it.data[k]) { it.target[k] = it.data[k]; changed = true; }
      });
      if (changed) { it.target.updatedAt = new Date(); updated++; } else unchanged++;
    } else {
      all.push({
        id: Utilities.getUuid(), sku: it.data.sku, name: it.data.name,
        description: it.data.description !== undefined ? it.data.description : '',
        category: it.data.category !== undefined ? it.data.category : 'General',
        image: it.data.image !== undefined ? it.data.image : '',
        retail: it.data.retail !== undefined ? it.data.retail : 0,
        wholesale: it.data.wholesale !== undefined ? it.data.wholesale : 0,
        active: it.data.active !== undefined ? it.data.active : true,
        updatedAt: new Date()
      });
      created++;
    }
  });

  if (created || updated) write_('products', all);
  log_(u, 'Actualización desde Excel', created + ' nuevos · ' + updated + ' modificados · ' + unchanged + ' sin cambios');
  return { ok: true, created: created, updated: updated, unchanged: unchanged };
}

/* ---------- Fotos de productos (se guardan en Google Drive) ---------- */

function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('PHOTO_FOLDER_ID');
  if (saved) {
    try { return DriveApp.getFolderById(saved); } catch (err) { /* la carpeta ya no existe: se crea otra */ }
  }
  const folder = DriveApp.createFolder('Akari Import - Fotos de productos');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

// b: { id, filename, mimeType, data (base64) }. Sube la foto y la asigna al producto.
function setProductImage_(b, u) {
  const id = String((b && b.id) || '');
  if (!id) throw Error('Falta el producto.');
  const mime = String(b.mimeType || '');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) throw Error('Formato de imagen no permitido (usá JPG, PNG o WEBP).');
  const b64 = String(b.data || '').replace(/^data:[^,]+,/, '');
  if (!b64) throw Error('La imagen está vacía.');
  if (b64.length > 7 * 1024 * 1024) throw Error('La imagen es demasiado grande (máximo 5 MB).');
  if (!rows_('products').some(p => p.id === id)) throw Error('El producto no existe.');

  const name = String(b.filename || 'foto.jpg').replace(/[^\w.\- ]/g, '_').slice(0, 80);
  const file = photoFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';

  return withLock_(() => {
    const sheet = ss_().getSheetByName(TABS.products);
    const values = sheet.getRange(1, 1, sheet.getLastRow(), HEADERS.products.length).getValues();
    const head = values[0];
    const cId = head.indexOf('id'), cImg = head.indexOf('image'), cUpd = head.indexOf('updatedAt'), cSku = head.indexOf('sku');
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][cId]) === id) {
        sheet.getRange(i + 1, cImg + 1).setValue(url);
        sheet.getRange(i + 1, cUpd + 1).setValue(new Date());
        log_(u, 'Foto de producto', String(values[i][cSku]));
        return { ok: true, url: url };
      }
    }
    throw Error('El producto no existe.');
  });
}

/* ---------- Autorización (ejecutar una vez desde el editor tras actualizar) ---------- */

function autorizarPermisos() {
  const folder = photoFolder_();
  LockService.getScriptLock();
  UrlFetchApp.getRequest('https://identitytoolkit.googleapis.com/');
  return 'Permisos autorizados. Carpeta de fotos: ' + folder.getUrl();
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
