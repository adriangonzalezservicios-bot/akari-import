import React, { useMemo } from 'react';
import type { Product } from '../types';
import { money } from '../utils/format';
import { Plus } from 'lucide-react';

interface CatalogProps {
  products: Product[];
  loading: boolean;
  statusText: string;
  category: string;
  onCategoryChange: (cat: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  search: string;
  isReseller: boolean;
  onAddToCart: (p: Product) => void;
  onZoom: (image: string, title: string) => void;
}

export const Catalog: React.FC<CatalogProps> = ({
  products,
  loading,
  statusText,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  search,
  isReseller,
  onAddToCart,
  onZoom,
}) => {
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category.trim());
    });
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      if (p.active === false) return false;
      if (category !== 'Todas' && (p.category || 'General') !== category) return false;
      if (q) {
        const text = `${p.name} ${p.sku} ${p.description || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    const getPrice = (p: Product) => {
      return isReseller && p.wholesale != null ? Number(p.wholesale) : Number(p.retail || 0);
    };

    if (sort === 'price-asc') {
      list.sort((a, b) => getPrice(a) - getPrice(b));
    } else if (sort === 'price-desc') {
      list.sort((a, b) => getPrice(b) - getPrice(a));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }

    return list;
  }, [products, category, search, sort, isReseller]);

  const fallbackImg = '/assets/placeholder.svg';

  return (
    <section id="catalogo" className="catalog">
      <div className="section-head">
        <div>
          <p className="eyebrow" style={{ color: 'var(--red)' }}>NUESTRO CATÁLOGO</p>
          <h2>Lista de precios</h2>
          <p id="catalogStatus" className="muted">{statusText}</p>
        </div>
      </div>

      <div className="filters-bar" role="search">
        <label htmlFor="categoryList">
          Categoría
          <select
            id="categoryList"
            className="category-list"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filtrar por categoría"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'Todas' ? 'Todas las categorías' : c}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="sort">
          Orden
          <select
            id="sort"
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="name">Nombre A–Z</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
          </select>
        </label>
      </div>

      {loading && products.length === 0 ? (
        <div className="products">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="product product-skeleton">
              <div className="skeleton-block" />
              <div className="product-main">
                <div className="skeleton-line" style={{ width: '30%' }} />
                <div className="skeleton-line" style={{ width: '80%' }} />
                <div className="skeleton-line" style={{ width: '50%' }} />
              </div>
              <div className="product-side">
                <div className="skeleton-line" style={{ width: '60px' }} />
                <div className="skeleton-line" style={{ width: '90px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          No encontramos productos con esa búsqueda.
        </div>
      ) : (
        <div id="products" className="products" aria-live="polite">
          {filtered.map((p) => {
            const price = isReseller && p.wholesale != null ? p.wholesale : p.retail;
            const isOutOfStock = p.stock === 0;

            return (
              <article key={p.id} className="product">
                <div
                  className="product-image"
                  onClick={() => onZoom(p.image || fallbackImg, p.name)}
                  title="Click para ampliar"
                >
                  <img
                    loading="lazy"
                    src={p.image || fallbackImg}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = fallbackImg;
                    }}
                    alt={p.name}
                  />
                </div>

                <div className="product-main">
                  <div className="sku-row">
                    <span className="sku">{p.sku}</span>
                    {isOutOfStock ? (
                      <span className="stock-badge">Sin stock</span>
                    ) : p.stock !== null && p.stock !== undefined && p.stock > 0 ? (
                      <span className="stock-badge ok">{p.stock} u.</span>
                    ) : null}
                  </div>
                  <h3>{p.name}</h3>
                  <p className="desc">{p.description || 'Consultar detalles del producto.'}</p>
                </div>

                <div className="product-side">
                  <div>
                    <div className="price">{money(price)}</div>
                    <div className="price-note">
                      {isReseller ? 'Precio mayorista' : 'Precio minorista'}
                    </div>
                  </div>
                  <button
                    className="add"
                    disabled={isOutOfStock}
                    onClick={() => onAddToCart(p)}
                    title={isOutOfStock ? 'Sin stock disponible' : 'Agregar al pedido'}
                  >
                    {isOutOfStock ? (
                      'Sin stock'
                    ) : (
                      <>
                        <Plus size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 2 }} />
                        Agregar
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
