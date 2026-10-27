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
  ['#photosPick', '#photosUpload', '#photosClear', '#bulkApply', '#importBtn', '#excelDownload', '#excelPick'].forEach(sel => { const el = $(sel); if (el) el.disabled = on; });
  if (!on) updatePhotoButtons();
  syncExcelApply();
}

// El botón "Aplicar" del Excel solo se habilita si hay algo para aplicar y no hay errores pendientes
// (salvo que se haya tildado "Omitir las filas con error").
function excelApplyAllowed() {
  if (busy || !excelPlan) return false;
  const c = excelPlan.counts;
  if (!(c.new + c.mod)) return false;
  const skip = $('#excelSkip');
  return c.error === 0 || !!(skip && skip.checked);
}
function syncExcelApply() {
  const btn = $('#excelApply');
  if (btn) btn.disabled = !excelApplyAllowed();
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

/* ------------------------------------------------------------------ Excel: descargar y actualizar */

// ID va al final: es interno y no se debe tocar. Un ID vacío = producto nuevo.
const EXCEL_COLS = [
  { key: 'sku', header: 'SKU', width: 16, aliases: ['sku', 'codigo', 'cod'] },
  { key: 'name', header: 'Nombre', width: 42, aliases: ['nombre', 'producto', 'titulo'] },
  { key: 'description', header: 'Descripción (detalle)', width: 48, aliases: ['descripcion', 'descripcion (detalle)', 'detalle'] },
  { key: 'category', header: 'Categoría', width: 18, aliases: ['categoria', 'rubro'] },
  { key: 'image', header: 'Imagen (URL https)', width: 44, aliases: ['imagen', 'imagen (url https)', 'imagen url', 'url imagen', 'foto', 'image'] },
  { key: 'retail', header: 'Precio minorista', width: 17, aliases: ['precio minorista', 'minorista', 'precio', 'retail', 'precio publico'] },
  { key: 'wholesale', header: 'Precio mayorista', width: 17, aliases: ['precio mayorista', 'mayorista', 'wholesale'] },
  { key: 'active', header: 'Publicado en tienda', width: 20, aliases: ['publicado en tienda', 'publicado', 'activo', 'activo en tienda', 'visible', 'mostrar', 'estado', 'en tienda'] },
  { key: 'id', header: 'ID (no modificar)', width: 38, aliases: ['id', 'id (no modificar)', 'id interno'] }
];
const FIELD_LABEL = { sku: 'SKU', name: 'Nombre', description: 'Descripción', category: 'Categoría', image: 'Imagen', retail: 'Precio minorista', wholesale: 'Precio mayorista', active: 'Publicado' };
const DIFF_FIELDS = ['sku', 'name', 'description', 'category', 'image', 'retail', 'wholesale', 'active'];
const MAX_EXCEL_ROWS = 3000;

const YES_WORDS = ['si', 's', 'yes', 'y', 'true', 'verdadero', '1', 'mostrar', 'publicado', 'publicar', 'activo', 'visible', 'x'];
const NO_WORDS = ['no', 'n', 'false', 'falso', '0', 'no mostrar', 'ocultar', 'oculto', 'no publicado', 'no publicar', 'inactivo', 'no visible', 'despublicado'];

let excelLibPromise = null;
let excelPlan = null;

function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelLibPromise) {
    excelLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/exceljs.min.js';
      s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('No se pudo iniciar el componente de Excel.')));
      s.onerror = () => { excelLibPromise = null; reject(new Error('No se pudo cargar el componente de Excel (vendor/exceljs.min.js).')); };
      document.head.appendChild(s);
    });
  }
  return excelLibPromise;
}

const stripAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const normHeader = s => stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
const money2 = n => Math.round(n * 100) / 100;

function plainValue(v, preferLink) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if (v.hyperlink && (preferLink || !v.text)) return String(v.hyperlink);
    if ('text' in v) return plainValue(v.text, false);
    if ('result' in v) return plainValue(v.result, preferLink);
    return '';
  }
  return v;
}

// Acepta 1234, "1.234", "1.234,50", "1,234.50", "$ 1.234", etc. Devuelve NaN si no es un número.
function parseMoney(v) {
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^\d.,\-]/g, '');
  if (!/\d/.test(s)) return NaN;
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (d > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

// true / false / null (no reconocido)
function parseActive(v) {
  if (typeof v === 'boolean') return v;
  const s = stripAccents(String(v)).toLowerCase().replace(/\s+/g, ' ').trim();
  if (YES_WORDS.includes(s)) return true;
  if (NO_WORDS.includes(s)) return false;
  return null;
}

// Convierte enlaces de "compartir" de Google Drive en una URL que se puede mostrar como imagen.
function normalizeImage(s) {
  const m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(s) || /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/.exec(s);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : s;
}

const moneyExact = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0);

function fmtVal(k, v) {
  if (k === 'retail' || k === 'wholesale') return moneyExact(v);
  if (k === 'active') return v ? 'Sí' : 'No';
  const s = String(v ?? '');
  if (!s) return '(vacío)';
  return s.length > 45 ? s.slice(0, 44) + '…' : s;
}

/* ---------- descargar ---------- */

async function downloadExcel() {
  const scope = $('#excelScope').value;
  const list = scope === 'filtrados' ? filteredProducts() : scope === 'seleccionados' ? products.filter(p => selected.has(p.id)) : products;
  if (!list.length) { status(scope === 'seleccionados' ? 'No hay productos seleccionados.' : 'No hay productos para descargar.'); return; }
  status('Preparando el Excel…');
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Akari Import';
  wb.created = new Date();

  const ws = wb.addWorksheet('Productos', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = EXCEL_COLS.map(c => ({ header: c.header, key: c.key, width: c.width }));
  list.forEach(p => ws.addRow({
    sku: String(p.sku), name: p.name || '', description: p.description || '', category: p.category || 'General',
    image: p.image || '', retail: Number(p.retail) || 0, wholesale: Number(p.wholesale) || 0,
    active: p.active !== false ? 'Sí' : 'No', id: String(p.id)
  }));

  const idx = key => EXCEL_COLS.findIndex(c => c.key === key) + 1;
  const letter = key => ws.getColumn(idx(key)).letter;
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5D46' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.getColumn(idx('sku')).numFmt = '@';
  ws.getColumn(idx('id')).numFmt = '@';
  ws.getColumn(idx('id')).font = { color: { argb: 'FF999999' } };
  ws.getColumn(idx('retail')).numFmt = '#,##0.00';
  ws.getColumn(idx('wholesale')).numFmt = '#,##0.00';
  header.getCell(idx('id')).font = { bold: true, color: { argb: 'FFDDDDDD' } };
  // Desplegable Sí/No también en filas vacías al final, para productos nuevos.
  const lastRow = list.length + 1 + 300;
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`${letter('active')}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Sí,No"'], showErrorMessage: true,
      errorTitle: 'Publicado en tienda', error: 'Elegí Sí o No.'
    };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXCEL_COLS.length } };

  const help = wb.addWorksheet('Instrucciones');
  help.getColumn(1).width = 110;
  [
    'CÓMO ACTUALIZAR LOS PRODUCTOS CON ESTE EXCEL',
    '',
    '1. Editá la hoja "Productos" y guardá el archivo como .xlsx.',
    '2. En el panel de administración, tocá "Subir Excel editado…". Vas a ver una vista previa de los cambios antes de aplicarlos.',
    '',
    'COLUMNAS',
    '• SKU: código del producto. Se puede cambiar: modificá la celda sin tocar el ID.',
    '• Nombre: obligatorio.',
    '• Descripción (detalle): texto libre.',
    '• Categoría: si queda vacía se usa "General".',
    '• Imagen (URL https): dirección de la foto. Los enlaces de "compartir" de Google Drive se convierten solos (el archivo debe estar compartido como "Cualquier persona con el enlace"). Vacía = sin foto.',
    '• Precio minorista / Precio mayorista: números. Una celda de precio vacía NO modifica el precio (en un producto nuevo queda en 0).',
    '• Publicado en tienda: Sí o No. También se entiende: Mostrar, No mostrar, Visible, Oculto, Activo, Inactivo, 1, 0.',
    '• ID (no modificar): identifica al producto. Dejalo vacío para crear un producto nuevo.',
    '',
    'IMPORTANTE',
    '• Los productos que borres de este Excel NO se eliminan de la tienda. Para ocultar uno, poné "No" en Publicado en tienda.',
    '• No repitas un SKU: el sistema avisa y no aplica nada hasta que lo corrijas.',
    '• Si no querés modificar una columna, podés borrarla del Excel completa (excepto SKU).',
    '• Las fotos se pueden subir también con "Cargar fotos en bloque" en el panel.'
  ].forEach((t, i) => { const c = help.getCell(`A${i + 1}`); c.value = t; c.alignment = { wrapText: true, vertical: 'top' }; if (i === 0 || t === 'COLUMNAS' || t === 'IMPORTANTE') c.font = { bold: true }; });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `akari-productos-${new Date().toLocaleDateString('sv-SE')}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  status(`Excel descargado: ${list.length} productos. Editalo y subilo con "Subir Excel editado…".`);
}

/* ---------- leer y comparar ---------- */

async function parseExcelFile(file) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(await file.arrayBuffer()); }
  catch { throw new Error('No se pudo leer el archivo. Tiene que ser un Excel .xlsx (no .xls ni .csv).'); }
  const ws = wb.getWorksheet('Productos') || wb.worksheets[0];
  if (!ws) throw new Error('El Excel no tiene hojas.');

  const colKey = {};
  const ignored = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, c) => {
    const original = String(plainValue(cell.value)).trim();
    const h = normHeader(original);
    if (!h) return;
    const def = EXCEL_COLS.find(x => x.aliases.includes(h));
    if (def && !Object.values(colKey).includes(def.key)) colKey[c] = def.key; else ignored.push(original);
  });
  const has = k => Object.values(colKey).includes(k);
  if (!has('sku')) throw new Error('No encontré la columna "SKU" en la primera fila de la hoja "Productos".');

  const records = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const raw = {};
    for (const [c, key] of Object.entries(colKey)) raw[key] = plainValue(row.getCell(Number(c)).value, key === 'image');
    if (Object.values(raw).every(v => String(v).trim() === '')) return;
    records.push({ n, raw });
  });
  if (records.length > MAX_EXCEL_ROWS) throw new Error(`El Excel tiene ${records.length} filas; el máximo por carga es ${MAX_EXCEL_ROWS}.`);
  if (!records.length) throw new Error('El Excel no tiene filas con datos.');
  return buildPlan(records, has, ignored);
}

function buildPlan(records, has, ignored) {
  const byId = new Map(products.map(p => [p.id, p]));
  const bySku = new Map(products.map(p => [norm(p.sku), p]));
  const touchedBy = new Map();
  const items = [];

  for (const { n, raw } of records) {
    const rec = { row: n };
    const errors = [], warnings = [];
    const txt = k => String(raw[k] ?? '').trim();

    rec.sku = txt('sku');
    if (!rec.sku) errors.push('falta el SKU');
    if (has('id')) rec.id = txt('id');
    if (has('name')) { rec.name = txt('name'); if (!rec.name) errors.push('falta el nombre'); }
    if (has('description')) rec.description = txt('description');
    if (has('category')) rec.category = txt('category');
    if (has('image')) {
      rec.image = normalizeImage(txt('image'));
      if (rec.image && !/^https:\/\//i.test(rec.image) && !rec.image.startsWith('assets/')) errors.push('la imagen debe empezar con https://');
    }
    for (const k of ['retail', 'wholesale']) {
      if (!has(k) || txt(k) === '') continue;
      const v = parseMoney(raw[k]);
      if (!isFinite(v) || v < 0) errors.push(`el precio ${k === 'retail' ? 'minorista' : 'mayorista'} "${txt(k)}" no es válido`);
      else rec[k] = money2(v);
    }
    if (has('active') && txt('active') !== '') {
      const a = parseActive(raw.active);
      if (a === null) errors.push(`"${txt('active')}" no se entiende en Publicado en tienda (usá Sí o No)`);
      else rec.active = a;
    }

    const target = (rec.id && byId.get(rec.id)) || (rec.sku && bySku.get(norm(rec.sku))) || null;
    if (target) {
      if (norm(rec.sku) === norm(target.sku)) rec.sku = target.sku;
      if (!has('name')) rec.name = target.name;
      if (touchedBy.has(target.id)) errors.push(`repite el producto de la fila ${touchedBy.get(target.id)}`);
      else touchedBy.set(target.id, n);
    } else if (!has('name')) {
      errors.push('falta la columna Nombre para crear productos nuevos');
    }

    const changes = [];
    if (target && !errors.length) {
      for (const k of DIFF_FIELDS) {
        if (rec[k] === undefined) continue;
        const from = k === 'active' ? target.active !== false
          : k === 'category' ? (target.category || 'General')
          : (k === 'retail' || k === 'wholesale') ? money2(Number(target[k]) || 0)
          : String(target[k] ?? '').trim();
        const to = k === 'category' ? (rec.category || 'General') : rec[k];
        if (from !== to) changes.push({ k, from, to });
      }
    }
    if (!target && !errors.length) {
      if (!(rec.retail > 0)) warnings.push('sin precio minorista (queda en $0)');
      if (rec.active !== false && !(rec.retail > 0)) warnings.push('quedaría publicado con precio $0');
    }
    items.push({ n, rec, target, errors, warnings, changes, status: errors.length ? 'error' : !target ? 'new' : changes.length ? 'mod' : 'same' });
  }

  // SKU únicos en el resultado final (se permite intercambiar SKU entre productos).
  const newSkuOf = new Map(items.filter(i => i.target && !i.errors.length).map(i => [i.target.id, i.rec.sku]));
  const owners = new Map();
  const add = (sku, label, item) => { const k = norm(sku); if (!owners.has(k)) owners.set(k, []); owners.get(k).push({ label, item }); };
  for (const p of products) add(newSkuOf.has(p.id) ? newSkuOf.get(p.id) : p.sku, `producto "${p.name}"`, null);
  for (const i of items) if (!i.target && !i.errors.length) add(i.rec.sku, `fila ${i.n}`, i);
  for (const [k, list] of owners) {
    if (list.length < 2) continue;
    for (const { item } of list) if (item) { item.errors.push(`el SKU "${k}" quedaría repetido`); item.status = 'error'; }
    for (const i of items) {
      if (i.target && !i.errors.length && norm(i.rec.sku) === k) { i.errors.push(`el SKU "${k}" quedaría repetido`); i.status = 'error'; }
    }
  }

  const counts = { new: 0, mod: 0, same: 0, error: 0 };
  items.forEach(i => { counts[i.status]++; });
  return { items, counts, ignored };
}

/* ---------- vista previa y aplicar ---------- */

function renderExcelPlan() {
  const box = $('#excelResult');
  if (!excelPlan) { box.innerHTML = ''; return; }
  const { items, counts, ignored } = excelPlan;
  const rank = { error: 0, new: 1, mod: 2, same: 3 };
  const shown = items.filter(i => i.status !== 'same').sort((a, b) => rank[a.status] - rank[b.status] || a.n - b.n);
  const LIMIT = 300;
  const label = { error: ['bad', 'Error'], new: ['ok', 'Nuevo'], mod: ['warn', 'Modifica'] };

  const rows = shown.slice(0, LIMIT).map(i => {
    const [cls, name] = label[i.status];
    let detail;
    if (i.status === 'error') detail = i.errors.map(esc).join('; ');
    else if (i.status === 'new') detail = `${esc(i.rec.name || '')}${i.rec.retail ? ' · ' + money(i.rec.retail) : ''}${i.warnings.length ? ` <span class="muted">(${esc(i.warnings.join('; '))})</span>` : ''}`;
    else detail = i.changes.map(c => `<b>${esc(FIELD_LABEL[c.k])}</b>: ${esc(fmtVal(c.k, c.from))} → ${esc(fmtVal(c.k, c.to))}`).join('<br>');
    return `<tr><td>${i.n}</td><td>${esc(i.rec.sku)}</td><td><span class="pill ${cls}">${name}</span></td><td>${detail}</td></tr>`;
  }).join('');

  const applicable = counts.new + counts.mod;
  const blocked = counts.error > 0;
  box.innerHTML = `
    <div class="msg ${blocked ? 'err' : ''}">
      <b>Vista previa:</b>
      <span class="pill ok">${counts.new} nuevos</span>
      <span class="pill warn">${counts.mod} modificados</span>
      <span class="pill off">${counts.same} sin cambios</span>
      <span class="pill ${blocked ? 'bad' : 'off'}">${counts.error} con errores</span>
      ${ignored.length ? `<div class="muted small">Columnas ignoradas: ${ignored.map(esc).join(', ')}</div>` : ''}
      ${blocked ? '<div class="small">Hay filas con errores. Corregilas en el Excel y subilo de nuevo, o elegí omitirlas.</div>' : ''}
    </div>
    ${shown.length ? `<div class="tablewrap"><table><thead><tr><th>Fila</th><th>SKU</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${shown.length > LIMIT ? `<p class="muted small">Se muestran las primeras ${LIMIT} de ${shown.length} filas con cambios o errores.</p>` : ''}` : '<p class="muted">No hay cambios para aplicar.</p>'}
    <div class="row-btn" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px">
      ${blocked ? '<label><input type="checkbox" id="excelSkip"> Omitir las filas con error y aplicar el resto</label>' : ''}
      <button type="button" class="primary" id="excelApply" ${applicable && !blocked ? '' : 'disabled'}>Aplicar ${applicable} cambio${applicable === 1 ? '' : 's'}</button>
      <button type="button" class="action" id="excelDiscard">Descartar</button>
    </div>`;
  syncExcelApply();
}

$('#excelResult').addEventListener('change', e => {
  if (e.target.id === 'excelSkip') syncExcelApply();
});

$('#excelResult').addEventListener('click', async e => {
  if (e.target.id === 'excelDiscard') { excelPlan = null; renderExcelPlan(); status('Se descartó el Excel.'); return; }
  if (e.target.id !== 'excelApply' || !excelApplyAllowed()) return;
  const send = excelPlan.items.filter(i => i.status === 'new' || i.status === 'mod');
  if (!send.length) return;
  const sameCount = excelPlan.counts.same, errorCount = excelPlan.counts.error;
  const nNew = send.filter(i => i.status === 'new').length, nMod = send.length - nNew;
  if (!confirm(`Se aplicarán ${send.length} cambios en Google Sheets:\n• ${nNew} productos nuevos\n• ${nMod} productos modificados\n\nSi querés tener un respaldo, descargá antes el Excel actual. ¿Continuar?`)) return;
  setBusy(true);
  try {
    status('Aplicando cambios…');
    const rows = send.map(i => ({ ...i.rec, id: i.target ? i.target.id : undefined }));
    const r = await api('upsertProducts', { rows });
    excelPlan = null;
    await loadProducts();
    showMsg($('#excelResult'), `<b>Listo.</b> ${r.created} nuevos, ${r.updated} modificados, ${sameCount} sin cambios${errorCount ? `, ${errorCount} filas con error omitidas` : ''}.`);
    status(`Excel aplicado: ${r.created} nuevos y ${r.updated} modificados.`);
  } catch (err) {
    showMsg($('#excelResult'), `<b>No se aplicó nada.</b><br>${esc(err.message).replace(/\n/g, '<br>')}`, true);
    status('No se pudo aplicar el Excel: ' + err.message.split('\n')[0]);
  } finally { setBusy(false); }
});

$('#excelDownload').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try { await downloadExcel(); } catch (err) { status('No se pudo generar el Excel: ' + err.message); }
  finally { setBusy(false); }
});

$('#excelPick').addEventListener('click', () => { if (!busy) $('#excelFile').click(); });

$('#excelFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || busy) return;
  setBusy(true);
  try {
    status('Leyendo el Excel…');
    excelPlan = await parseExcelFile(file);
    renderExcelPlan();
    const c = excelPlan.counts;
    status(`Excel leído: ${c.new} nuevos, ${c.mod} modificados, ${c.same} sin cambios, ${c.error} con errores. Revisá la vista previa.`);
  } catch (err) {
    excelPlan = null;
    showMsg($('#excelResult'), esc(err.message), true);
    status(err.message);
  } finally { setBusy(false); }
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
