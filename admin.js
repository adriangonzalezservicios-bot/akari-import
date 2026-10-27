import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n) || 0);
const PLACEHOLDER = 'assets/placeholder.svg';

let auth, user;
let products = [];
const selected = new Set();   // ids tildados para la edición masiva
let photoItems = [];          // fotos elegidas con "Examinar" (carga en bloque)
let rowPhotoTarget = null;    // producto al que se le sube una foto desde la tabla
let busy = false;

/* ------------------------------------------------------------------ utilidades */

async function api(action, data = {}) {
  const token = await user.getIdToken();
  const res = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data, token })
  });
  const raw = await res.text();
  if (!raw) throw new Error('El servidor devolvió una respuesta vacía. Revisá la conexión con Google Sheets.');
  let out;
  try { out = JSON.parse(raw); } catch { throw new Error('Respuesta inválida del servidor.'); }
  if (!res.ok || out.ok === false) throw new Error(out.error || 'Error de conexión');
  return out;
}

function status(text) { $('#status').textContent = text; }

function showMsg(target, html, isError) {
  target.innerHTML = `<div class="msg${isError ? ' err' : ''}">${html}</div>`;
}

const hasPhoto = p => !!p.image && !/placeholder/i.test(p.image);
const norm = s => String(s ?? '').trim().toUpperCase();

function setBusy(on) {
  busy = on;
  ['#photosPick', '#photosUpload', '#photosClear', '#bulkApply', '#importBtn'].forEach(sel => { const el = $(sel); if (el) el.disabled = on; });
  if (!on) updatePhotoButtons();
}

/* ------------------------------------------------------------------ productos: tabla y filtros */

function filteredProducts() {
  const q = $('#productSearch').value.trim().toLowerCase();
  const cat = $('#productCategoryFilter').value;
  const photo = $('#productPhotoFilter').value;
  const state = $('#productStateFilter').value;
  return products.filter(p =>
    (!q || `${p.sku} ${p.name}`.toLowerCase().includes(q)) &&
    (!cat || (p.category || 'General') === cat) &&
    (!photo || (photo === 'con') === hasPhoto(p)) &&
    (!state || (state === 'pub') === (p.active !== false))
  );
}

function refreshCategoryFilter() {
  const select = $('#productCategoryFilter');
  const current = select.value;
  const cats = [...new Set(products.map(p => p.category || 'General'))].sort((a, b) => a.localeCompare(b, 'es'));
  select.innerHTML = '<option value="">Todas</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  select.value = cats.includes(current) ? current : '';
}

function renderProducts() {
  const list = filteredProducts();
  $('#productRows').innerHTML = list.map(p => `
    <tr>
      <td><input type="checkbox" data-sel="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''} aria-label="Seleccionar ${esc(p.sku)}"></td>
      <td><img class="thumb" loading="lazy" src="${esc(p.image || PLACEHOLDER)}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"></td>
      <td>${esc(p.sku)}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.category || 'General')}</td>
      <td>${money(p.retail)}</td>
      <td>${money(p.wholesale)}</td>
      <td><span class="pill ${p.active ? 'ok' : 'off'}">${p.active ? 'Publicado' : 'Oculto'}</span></td>
      <td>
        <button class="action" data-edit="${esc(p.id)}">Editar</button>
        <button class="action" data-photo="${esc(p.id)}">Foto</button>
        <button class="action" data-delete="${esc(p.id)}">Eliminar</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9">No hay productos con esos filtros.</td></tr>';
  updateSelectionUI(list);
  $('#filterCount').textContent = `${list.length} de ${products.length} productos · ${products.filter(p => !hasPhoto(p)).length} sin foto`;
}

function updateSelectionUI(list = filteredProducts()) {
  for (const id of [...selected]) if (!products.some(p => p.id === id)) selected.delete(id);
  $('#selCount').textContent = `${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`;
  const all = $('#selectAll');
  const inView = list.filter(p => selected.has(p.id)).length;
  all.checked = list.length > 0 && inView === list.length;
  all.indeterminate = inView > 0 && inView < list.length;
}

async function loadProducts() {
  const d = await api('adminProducts');
  products = d.products || [];
  refreshCategoryFilter();
  renderProducts();
  rebuildPhotoMatches();
}

function clearForm() {
  ['id', 'sku', 'name', 'retail', 'wholesale', 'image', 'description'].forEach(id => { $('#' + id).value = ''; });
  $('#category').value = 'General';
  $('#active').checked = true;
}

['#productSearch', '#productCategoryFilter', '#productPhotoFilter', '#productStateFilter'].forEach(sel => {
  $(sel).addEventListener('input', renderProducts);
});

$('#selectAll').addEventListener('change', e => {
  for (const p of filteredProducts()) { if (e.target.checked) selected.add(p.id); else selected.delete(p.id); }
  renderProducts();
});

$('#productRows').addEventListener('change', e => {
  const cb = e.target.closest('[data-sel]');
  if (!cb) return;
  if (cb.checked) selected.add(cb.dataset.sel); else selected.delete(cb.dataset.sel);
  updateSelectionUI();
});

$('#productRows').addEventListener('click', async e => {
  const ed = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  const ph = e.target.closest('[data-photo]');
  if (ed) {
    const p = products.find(x => x.id === ed.dataset.edit);
    if (!p) return;
    for (const k of ['id', 'sku', 'name', 'retail', 'wholesale', 'category', 'image', 'description']) $('#' + k).value = p[k] ?? '';
    $('#active').checked = p.active !== false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (ph && !busy) {
    rowPhotoTarget = ph.dataset.photo;
    $('#rowPhotoFile').click();
  }
  if (del && confirm('¿Eliminar este producto?')) {
    try { await api('deleteProduct', { id: del.dataset.delete }); await loadProducts(); status('Producto eliminado.'); }
    catch (err) { status(err.message); }
  }
});

$('#productForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const p = {
      id: $('#id').value, sku: $('#sku').value.trim(), name: $('#name').value.trim(),
      retail: Number($('#retail').value), wholesale: Number($('#wholesale').value),
      category: $('#category').value.trim() || 'General', image: $('#image').value.trim(),
      description: $('#description').value.trim(), active: $('#active').checked
    };
    await api('saveProduct', { product: p });
    clearForm();
    await loadProducts();
    status('Producto guardado en Google Sheets.');
  } catch (err) { status('Error: ' + err.message); }
});
$('#clearForm').addEventListener('click', clearForm);

/* ------------------------------------------------------------------ modificación masiva */

$('#bulkApply').addEventListener('click', async () => {
  if (busy) return;
  const ids = [...selected];
  if (!ids.length) { status('Primero tildá los productos que querés modificar.'); return; }

  const changes = {};
  const parts = [];
  const cat = $('#bulkCategory').value.trim();
  if (cat) { changes.category = cat; parts.push(`categoría "${cat}"`); }
  const act = $('#bulkActive').value;
  if (act !== '') { changes.active = act === 'true'; parts.push(changes.active ? 'publicar' : 'ocultar'); }
  const rp = $('#bulkRetail').value.trim(), wp = $('#bulkWholesale').value.trim();
  if (rp !== '') { changes.retailPercent = Number(rp); parts.push(`minorista ${Number(rp) > 0 ? '+' : ''}${Number(rp)}%`); }
  if (wp !== '') { changes.wholesalePercent = Number(wp); parts.push(`mayorista ${Number(wp) > 0 ? '+' : ''}${Number(wp)}%`); }
  if ((rp !== '' && !isFinite(Number(rp))) || (wp !== '' && !isFinite(Number(wp)))) { status('Los porcentajes deben ser números.'); return; }
  if (!parts.length) { status('Indicá al menos un cambio (categoría, publicación o porcentaje).'); return; }
  if (changes.retailPercent !== undefined || changes.wholesalePercent !== undefined) changes.roundTo = Number($('#bulkRound').value);

  if (!confirm(`Se modificarán ${ids.length} productos:\n• ${parts.join('\n• ')}\n\nEsta acción cambia los datos en Google Sheets. ¿Continuar?`)) return;
  setBusy(true);
  try {
    status('Aplicando cambios…');
    const r = await api('bulkUpdateProducts', { ids, changes });
    ['#bulkCategory', '#bulkRetail', '#bulkWholesale'].forEach(s => { $(s).value = ''; });
    $('#bulkActive').value = '';
    await loadProducts();
    status(`Listo: se modificaron ${r.count} productos (${parts.join(', ')}).`);
  } catch (err) { status('No se pudo aplicar: ' + err.message); }
  finally { setBusy(false); }
});

/* ------------------------------------------------------------------ fotos */

async function resizeToJpegBase64(file, max = 900, quality = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { throw new Error('No se pudo leer la imagen. Usá JPG, PNG o WEBP (las fotos HEIC del iPhone no se pueden procesar).'); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';                       // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    fr.readAsDataURL(blob);
  });
  return String(dataUrl).split(',')[1];
}

async function uploadPhotoFor(product, file) {
  const data = await resizeToJpegBase64(file);
  const r = await api('setProductImage', { id: product.id, filename: `${product.sku}.jpg`, mimeType: 'image/jpeg', data });
  product.image = r.url;
  return r.url;
}

// Relaciona cada archivo con un producto por el nombre del archivo (sin extensión) = SKU.
function rebuildPhotoMatches() {
  const used = new Set();
  for (const it of photoItems) {
    if (it.state === 'done') { used.add(norm(it.sku)); continue; }
  }
  for (const it of photoItems) {
    if (it.state === 'done' || it.state === 'uploading') continue;
    const key = norm(it.file.name.replace(/\.[^.]+$/, ''));
    const p = products.find(x => norm(x.sku) === key);
    it.product = p || null;
    it.sku = p ? p.sku : '';
    if (!p) { it.state = 'nomatch'; it.note = 'No hay ningún producto con ese SKU'; }
    else if (used.has(key)) { it.state = 'dup'; it.note = 'Otro archivo ya usa este SKU; se omite'; }
    else { it.state = 'ready'; it.note = hasPhoto(p) ? 'Reemplazará la foto actual' : 'Lista para subir'; used.add(key); }
  }
  renderPhotoList();
}

function renderPhotoList() {
  $('#photosTableWrap').classList.toggle('hidden', !photoItems.length);
  const pill = { ready: 'ok', done: 'ok', nomatch: 'bad', dup: 'warn', error: 'bad', uploading: 'warn' };
  const label = { ready: 'Lista', done: 'Subida', nomatch: 'Sin producto', dup: 'Repetida', error: 'Error', uploading: 'Subiendo…' };
  $('#photosRows').innerHTML = photoItems.map(it => `
    <tr>
      <td>${esc(it.file.name)}</td>
      <td>${it.product ? `${esc(it.product.sku)} — ${esc(it.product.name)}` : '—'}</td>
      <td><span class="pill ${pill[it.state] || 'off'}">${label[it.state] || it.state}</span> <span class="muted small">${esc(it.note || '')}</span></td>
    </tr>`).join('');
  updatePhotoButtons();
}

function updatePhotoButtons() {
  const ready = photoItems.filter(i => i.state === 'ready').length;
  $('#photosUpload').disabled = busy || !ready;
  $('#photosUpload').textContent = ready ? `Subir ${ready} foto${ready === 1 ? '' : 's'}` : 'Subir fotos';
  $('#photosClear').disabled = busy || !photoItems.length;
}

$('#photosPick').addEventListener('click', () => { if (!busy) $('#photosFile').click(); });

$('#photosFile').addEventListener('change', e => {
  const files = [...e.target.files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
  e.target.value = '';
  if (!files.length) { status('No se eligió ninguna imagen.'); return; }
  const have = new Set(photoItems.map(i => i.file.name + '|' + i.file.size));
  for (const f of files) if (!have.has(f.name + '|' + f.size)) photoItems.push({ file: f, state: 'ready', note: '', product: null, sku: '' });
  rebuildPhotoMatches();
  const ready = photoItems.filter(i => i.state === 'ready').length;
  status(`${photoItems.length} archivos elegidos: ${ready} coinciden con un SKU.`);
});

$('#photosClear').addEventListener('click', () => { photoItems = []; renderPhotoList(); status('Lista de fotos vaciada.'); });

$('#photosUpload').addEventListener('click', async () => {
  if (busy) return;
  const todo = photoItems.filter(i => i.state === 'ready');
  if (!todo.length) return;
  if (!confirm(`Se subirán ${todo.length} fotos a tu Google Drive y se asignarán a sus productos. ¿Continuar?`)) return;
  setBusy(true);
  const bar = $('#photosProgress');
  bar.classList.remove('hidden'); bar.max = todo.length; bar.value = 0;
  let ok = 0, fail = 0;
  for (const it of todo) {
    it.state = 'uploading'; it.note = ''; renderPhotoList();
    status(`Subiendo ${ok + fail + 1} de ${todo.length}: ${it.file.name}…`);
    try { await uploadPhotoFor(it.product, it.file); it.state = 'done'; it.note = 'Foto asignada'; ok++; }
    catch (err) { it.state = 'error'; it.note = err.message; fail++; }
    bar.value = ok + fail;
    renderPhotoList();
  }
  bar.classList.add('hidden');
  renderProducts();
  setBusy(false);
  status(`Fotos: ${ok} subidas${fail ? `, ${fail} con error (se pueden reintentar)` : ''}.`);
});

$('#rowPhotoFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  const p = products.find(x => x.id === rowPhotoTarget);
  if (!file || !p || busy) return;
  setBusy(true);
  try { status(`Subiendo foto de ${p.sku}…`); await uploadPhotoFor(p, file); renderProducts(); status(`Foto de ${p.sku} actualizada.`); }
  catch (err) { status('No se pudo subir la foto: ' + err.message); }
  finally { setBusy(false); rowPhotoTarget = null; }
});

/* ------------------------------------------------------------------ importación inicial */

$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const arr = JSON.parse(await file.text());
    if (!Array.isArray(arr)) throw Error('El JSON debe ser una lista de productos');
    if (!confirm(`Se importarán ${arr.length} productos. Los productos con el mismo SKU se actualizarán. ¿Continuar?`)) return;
    status('Importando productos…');
    let count = 0;
    for (let i = 0; i < arr.length; i += 20) {
      await api('importProducts', { products: arr.slice(i, i + 20) });
      count += Math.min(20, arr.length - i);
      status(`Importados ${count} de ${arr.length}…`);
    }
    await loadProducts();
    status(`Importación finalizada: ${count} productos. Revisá precios minoristas antes de publicar.`);
  } catch (err) { status('No se pudo importar: ' + err.message); }
  finally { e.target.value = ''; }
});

/* ------------------------------------------------------------------ pedidos e historial */

async function loadOrders() {
  const d = await api('adminOrders');
  const states = ['Nuevo', 'En preparación', 'Finalizado', 'Cancelado'];
  $('#orderRows').innerHTML = (d.orders || []).map(o => `
    <tr>
      <td>${esc(o.orderNumber)}</td><td>${esc(o.date)}</td><td>${esc(o.customerName)}</td><td>${esc(o.priceType)}</td><td>${money(o.total)}</td>
      <td><select data-state="${esc(o.id)}">${states.map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="action" data-order-save="${esc(o.id)}">Guardar</button></td>
    </tr>`).join('') || '<tr><td colspan="7">Todavía no hay pedidos.</td></tr>';
}

$('#orderRows').addEventListener('click', async e => {
  const b = e.target.closest('[data-order-save]');
  if (!b) return;
  const sel = $(`[data-state="${CSS.escape(b.dataset.orderSave)}"]`);
  try { await api('updateOrder', { id: b.dataset.orderSave, status: sel.value }); status('Estado de pedido actualizado.'); }
  catch (err) { status(err.message); }
});

async function loadHistory() {
  const d = await api('adminHistory');
  $('#historyRows').innerHTML = (d.history || []).map(h =>
    `<tr><td>${esc(h.date)}</td><td>${esc(h.user)}</td><td>${esc(h.action)}</td><td>${esc(h.detail)}</td></tr>`
  ).join('') || '<tr><td colspan="4">Sin actividad registrada todavía.</td></tr>';
}

/* ------------------------------------------------------------------ revendedores */

async function loadResellers() {
  const d = await api('adminResellers');
  $('#resellerRows').innerHTML = (d.resellers || []).map(r => `
    <tr>
      <td>${esc(r.email)}</td><td>${esc(r.name)}</td>
      <td><span class="pill ${r.active ? 'ok' : 'off'}">${r.active ? 'Activo' : 'Desactivado'}</span></td>
      <td>
        <button class="action" data-reseller-toggle="${esc(r.email)}" data-active="${!r.active}">${r.active ? 'Desactivar' : 'Activar'}</button>
        <button class="action" data-reseller-reset="${esc(r.email)}">Enviar enlace de nueva contraseña</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="4">Todavía no hay revendedores.</td></tr>';
}

function generatePassword(len = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin 0/O, 1/l/I
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map(n => alphabet[n % alphabet.length]).join('');
}

$('#genPassword').addEventListener('click', () => { $('#resellerPassword').value = generatePassword(); });

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

$('#resellerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const out = $('#resellerResult');
  const email = $('#resellerEmail').value.trim().toLowerCase();
  const password = $('#resellerPassword').value;
  if (password && password.length < 8) { showMsg(out, 'La contraseña debe tener al menos 8 caracteres.', true); return; }
  try {
    const r = await api('saveReseller', { reseller: { email, name: $('#resellerName').value.trim(), active: $('#resellerActive').checked, password } });
    if (r.account === 'creada') {
      const site = location.origin;
      const text = `Acceso mayorista Akari Import\nSitio: ${site}\nUsuario: ${email}\nContraseña: ${password}`;
      out.innerHTML = `<div class="msg"><b>Cuenta creada y habilitada.</b> Pasale estos datos al revendedor:
        <div class="credentials" id="credText">${esc(text)}</div>
        <button type="button" class="action" id="copyCred">Copiar datos</button>
        <span class="muted small"> La contraseña solo se muestra ahora; no queda guardada en ningún lado.</span></div>`;
      $('#copyCred').addEventListener('click', async ev => { ev.target.textContent = (await copyText(text)) ? '¡Copiado!' : 'No se pudo copiar'; });
    } else if (r.account === 'existente') {
      showMsg(out, `<b>Revendedor guardado.</b> Ese correo ya tenía cuenta, así que su contraseña <b>no se cambió</b>. Si la olvidó, usá "Enviar enlace de nueva contraseña" en la tabla.`);
    } else {
      showMsg(out, `<b>Revendedor guardado.</b> No se creó ninguna cuenta porque no ingresaste contraseña. Si todavía no tiene cuenta, cargá una contraseña y guardá de nuevo.`);
    }
    e.target.reset();
    $('#resellerActive').checked = true;
    await loadResellers();
    status('Revendedor guardado.');
  } catch (err) { showMsg(out, esc(err.message), true); status(err.message); }
});

$('#resellerRows').addEventListener('click', async e => {
  const t = e.target.closest('[data-reseller-toggle]');
  const rs = e.target.closest('[data-reseller-reset]');
  try {
    if (t) { await api('setReseller', { email: t.dataset.resellerToggle, active: t.dataset.active === 'true' }); await loadResellers(); }
    if (rs && confirm(`Se enviará un correo a ${rs.dataset.resellerReset} para que elija una contraseña nueva. ¿Continuar?`)) {
      await api('resetResellerPassword', { email: rs.dataset.resellerReset });
      showMsg($('#resellerResult'), `Se envió el correo de nueva contraseña a <b>${esc(rs.dataset.resellerReset)}</b>. Pedile que revise también la carpeta de spam.`);
      status('Correo de restablecimiento enviado.');
    }
  } catch (err) { status(err.message); showMsg($('#resellerResult'), esc(err.message), true); }
});

/* ------------------------------------------------------------------ pestañas y sesión */

document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', async () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
  ['products', 'orders', 'resellers', 'history'].forEach(k => $('#' + k + 'Panel').classList.toggle('hidden', k !== b.dataset.tab));
  try {
    if (b.dataset.tab === 'orders') await loadOrders();
    if (b.dataset.tab === 'resellers') await loadResellers();
    if (b.dataset.tab === 'history') await loadHistory();
  } catch (e) { status(e.message); }
}));

$('#logout').addEventListener('click', () => signOut(auth).then(() => { location.href = 'index.html'; }));

if (firebaseConfig.apiKey === 'REEMPLAZAR_API_KEY') {
  status('Configurá Firebase antes de ingresar.');
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  onAuthStateChanged(auth, async u => {
    user = u;
    if (!u) { location.href = 'index.html'; return; }
    try {
      const role = await api('myRole');
      if (!role.admin) { status('Acceso denegado: solo administrador.'); await signOut(auth); location.href = 'index.html'; return; }
      await loadProducts();
      status('Sesión administrativa verificada.');
    } catch (e) { status(e.message); }
  });
}
