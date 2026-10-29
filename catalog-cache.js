const CATALOG_LS_KEY = 'akari_catalog_v1';

export function readCachedCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.products) || !data.savedAt) return null;
    if (Date.now() - data.savedAt > 30 * 60 * 1000) return null;
    return data.products;
  } catch { return null; }
}

export function writeCachedCatalog(list) {
  try {
    localStorage.setItem(CATALOG_LS_KEY, JSON.stringify({ products: list, savedAt: Date.now() }));
  } catch {}
}

export function showSkeletons(n = 8) {
  const box = document.querySelector('#products');
  if (!box) return;
  box.innerHTML = Array.from({ length: n }, () => `
    <article class="product product-skeleton" aria-hidden="true">
      <div class="product-image skeleton-block"></div>
      <div class="product-main">
        <div class="skeleton-line w40"></div>
        <div class="skeleton-line w80"></div>
        <div class="skeleton-line w60"></div>
      </div>
      <div class="product-side">
        <div class="skeleton-line w50"></div>
        <div class="skeleton-line w70" style="height:36px;border-radius:10px"></div>
      </div>
    </article>`).join('');
}
