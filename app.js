import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { readCachedCatalog, writeCachedCatalog, showSkeletons } from './catalog-cache.js';

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n) || 0);
const wa = '5491133672920';

let auth = null, user = null, products = [], privatePrices = {}, cart = {}, category = 'Todas', reseller = false, admin = false;
const imgFallback = 'assets/placeholder.svg';

function toast(t) {
  const e = $('#toast');
  e.textContent = t;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 3200);
}

async function api(action, data = {}, method = 'POST') {
  const token = user ? await user.getIdToken() : '';
  const res = await fetch('/api', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify({ action, ...data, token })
  });
  let out;
  try { out = await res.json(); } catch { throw new Error('Respuesta inválida del servidor'); }
  if (!res.ok || out.ok === false) throw new Error(out.error || 'Error de conexión');
  return out;
}

function shownPrice(p) {
  return reseller && p.wholesale != null ? Number(p.wholesale) : Number(p.retail || 0);
}

function clean(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderCategories() {
  const cats = ['Todas', ...new Set(products.map(p => p.category || 'General'))].sort((a, b) => {
    if (a === 'Todas') return -1;
    if (b === 'Todas') return 1;
    return a.localeCompare(b, 'es');
  });
  const sel = $('#categoryList');
  if (!sel) return;
  const cur = category;
  sel.innerHTML = cats.map(c => {
    const label = c === 'Todas' ? 'Todas las categorías' : c;
    return `<option value="${clean(c)}" ${c === cur ? 'selected' : ''}>${clean(label)}</option>`;
  }).join('');
}

function renderProducts() {
  const q = $('#search').value.trim().toLowerCase();
  const sort = $('#sort').value;
  let list = products.filter(p =>
    p.active !== false &&
    (category === 'Todas' || (p.category || 'General') === category) &&
    `${p.name} ${p.sku} ${p.description}`.toLowerCase().includes(q)
  );
  if (sort === 'price-asc') list.sort((a, b) => shownPrice(a) - shownPrice(b));
  else if (sort === 'price-desc') list.sort((a, b) => shownPrice(b) - shownPrice(a));
  else list.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  $('#products').innerHTML = list.length
    ? list.map(p => `
      <article class="product">
        <div class="product-image" data-zoom="${clean(p.image || imgFallback)}" data-title="${clean(p.name)}">
          <img loading="lazy" src="${clean(p.image || imgFallback)}" onerror="this.onerror=null;this.src='${imgFallback}'" alt="${clean(p.name)}">
        </div>
        <div class="product-main">
          <div class="sku-row">
            <span class="sku">${clean(p.sku)}</span>
            ${p.stock === 0 ? '<span class="stock-badge">Sin stock</span>' : (p.stock > 0 ? `<span class="stock-badge ok">${p.stock} u.</span>` : '')}
          </div>
          <h3>${clean(p.name)}</h3>
          <p class="desc">${clean(p.description || 'Consultar detalles del producto.')}</p>
        </div>
        <div class="product-side">
          <div>
            <div class="price">${money(shownPrice(p))}</div>
            <div class="price-note">${reseller ? 'Precio mayorista' : 'Precio minorista'}</div>
          </div>
          <button class="add" data-add="${clean(p.id)}"${p.stock === 0 ? ' disabled title="Sin stock"' : ''}>${p.stock === 0 ? 'Sin stock' : '+ Agregar'}</button>
        </div>
      </article>
    `).join('')
    : '<div class="empty">No encontramos productos con esa búsqueda.</div>';

  $('#catalogStatus').textContent =
    `${list.length} productos disponibles${reseller ? ' · Lista mayorista habilitada' : ''}`;
}

function renderCart() {
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const items = ids.map(id => products.find(p => p.id === id)).filter(Boolean);
  $('#cartCount').textContent = ids.reduce((s, id) => s + cart[id], 0);
  $('#cartItems').innerHTML = items.length
    ? items.map(p => `
      <div class="cart-row">
        <div>
          <b>${clean(p.name)}</b>
          <small>SKU ${clean(p.sku)} · ${money(shownPrice(p))} c/u</small>
        </div>
        <div class="qty">
          <button data-qty="${p.id}" data-delta="-1">−</button>
          <b>${cart[p.id]}</b>
          <button data-qty="${p.id}" data-delta="1">+</button>
          <button data-remove="${p.id}" aria-label="Quitar">×</button>
        </div>
      </div>
    `).join('')
    : '<p class="muted">Todavía no agregaste productos.</p>';
  $('#cartTotal').textContent = money(items.reduce((s, p) => s + shownPrice(p) * cart[p.id], 0));
}

function openCart() {
  $('#drawerBackdrop').classList.remove('hidden');
  $('#cartDrawer').classList.add('open');
}
function closeCart() {
  $('#drawerBackdrop').classList.add('hidden');
  $('#cartDrawer').classList.remove('open');
}

async function refresh() {
  const cached = readCachedCatalog();
  if (cached && cached.length && !products.length) {
    products = cached;
    renderCategories();
    renderProducts();
    $('#catalogStatus').textContent = cached.length + ' productos (caché local) · actualizando…';
  } else if (!products.length) {
    showSkeletons(8);
    $('#catalogStatus').textContent = 'Cargando catálogo…';
  }

  try {
    const d = await api('catalog', {}, 'GET');
    products = d.products || [];
    writeCachedCatalog(products.map(p => ({
      id: p.id, sku: p.sku, name: p.name, description: p.description,
      category: p.category, image: p.image, retail: p.retail, active: p.active, stock: p.stock
    })));
    if (user) {
      try {
        const role = await api('myRole');
        reseller = !!role.reseller;
        admin = !!role.admin;
        if (reseller) {
          const priv = await api('privateCatalog');
          privatePrices = Object.fromEntries((priv.products || []).map(p => [p.id, p.wholesale]));
          products = products.map(p => ({ ...p, wholesale: privatePrices[p.id] }));
        }
      } catch (e) {
        reseller = false;
        admin = false;
        toast('No se pudo verificar tu cuenta: ' + e.message);
      }
    }
    renderCategories();
    renderProducts();
    renderCart();
    updateLoginButton();
  } catch (e) {
    if (products.length) {
      $('#catalogStatus').textContent = products.length + ' productos (sin conexión al servidor)';
      toast('Mostrando última versión guardada. ' + e.message);
    } else {
      $('#catalogStatus').textContent = 'No se pudo cargar el catálogo (' + e.message + ').';
      $('#products').innerHTML = '<div class="empty">No pudimos cargar los productos. Revisá tu conexión e intentá de nuevo.</div>';
      toast(e.message);
    }
  }
}

function updateLoginButton() {
  $('#loginOpen').textContent = admin ? 'Panel administrador' : reseller ? 'Revendedor · salir' : user ? 'Salir' : 'Login revendedores';
  $('#loginOpen').classList.toggle('outline', true);
}

async function submitOrder() {
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  if (!ids.length) {
    $('#orderMessage').textContent = 'Agregá al menos un producto.';
    return;
  }
  const name = $('#customerName').value.trim();
  if (!name) {
    $('#orderMessage').textContent = 'Ingresá tu nombre o comercio.';
    return;
  }
  const lines = ids.map(id => {
    const p = products.find(x => x.id === id);
    return { productId: id, sku: p.sku, name: p.name, quantity: cart[id], unitPrice: shownPrice(p) };
  });
  const total = lines.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  const order = {
    customerName: name,
    note: $('#customerNote').value.trim(),
    priceType: reseller ? 'mayorista' : 'minorista',
    items: lines,
    total
  };
  $('#submitOrder').disabled = true;
  $('#orderMessage').textContent = 'Registrando pedido online…';
  try {
    const result = await api('createOrder', { order });
    const message = [
      `PEDIDO AKARI IMPORT ${result.orderNumber || ''}`,
      `Cliente: ${name}`,
      `Tipo de lista: ${order.priceType}`,
      '',
      ...lines.map(x => `${x.quantity} x ${x.name} | SKU ${x.sku} | ${money(x.unitPrice * x.quantity)}`),
      '',
      `TOTAL ESTIMADO: ${money(total)}`,
      order.note ? `Comentario: ${order.note}` : '',
      'Solicito confirmar stock, envío y forma de pago.'
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    toast('Pedido registrado. Se abrió WhatsApp.');
    cart = {};
    renderCart();
    $('#orderMessage').textContent = 'Pedido registrado online.';
    closeCart();
  } catch (e) {
    $('#orderMessage').textContent = `No se pudo registrar: ${e.message}. No se abrió WhatsApp para evitar perder el pedido.`;
  } finally {
    $('#submitOrder').disabled = false;
  }
}

$('#search').addEventListener('input', renderProducts);
$('#searchClear').addEventListener('click', () => { $('#search').value = ''; renderProducts(); });
$('#sort').addEventListener('change', renderProducts);
$('#categoryList')?.addEventListener('change', e => {
  category = e.target.value || 'Todas';
  renderProducts();
});
$('#products').addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]');
  if (z) {
    const img = $('#zoomImg') || $('#zoomImage');
    const title = $('#zoomTitle');
    const modal = $('#zoomModal') || $('#imageModal');
    if (img) img.src = z.dataset.zoom;
    if (title) title.textContent = z.dataset.title;
    if (modal) modal.classList.remove('hidden');
    return;
  }
  const b = e.target.closest('[data-add]');
  if (b) {
    if (b.disabled) return;
    cart[b.dataset.add] = (cart[b.dataset.add] || 0) + 1;
    renderCart();
    toast('Producto agregado al pedido');
  }
});
$('#cartOpen').addEventListener('click', openCart);
$('#cartClose').addEventListener('click', closeCart);
$('#drawerBackdrop').addEventListener('click', closeCart);
$('#cartItems').addEventListener('click', e => {
  const q = e.target.closest('[data-qty]');
  const r = e.target.closest('[data-remove]');
  if (q) {
    const id = q.dataset.qty;
    cart[id] = Math.max(0, (cart[id] || 0) + Number(q.dataset.delta));
    if (!cart[id]) delete cart[id];
    renderCart();
  }
  if (r) {
    delete cart[r.dataset.remove];
    renderCart();
  }
});
$('#submitOrder').addEventListener('click', submitOrder);

$('#loginOpen').addEventListener('click', async () => {
  if (user) {
    if (admin) { window.location.href = 'admin.html'; return; }
    await signOut(auth);
    user = null;
    reseller = false;
    admin = false;
    await refresh();
    toast('Sesión cerrada');
    return;
  }
  $('#loginModal').classList.remove('hidden');
});

if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REEMPLAZAR_API_KEY') {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  onAuthStateChanged(auth, async u => { user = u; await refresh(); });
} else {
  refresh();
  $('#catalogStatus').textContent = 'Configuración pendiente: completá firebase-config.js y conectá Google Sheets.';
}
