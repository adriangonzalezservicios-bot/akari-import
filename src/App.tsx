import React, { useState, useEffect, useCallback } from 'react';
import type { Product } from './types';
import { api, readCachedCatalog, writeCachedCatalog } from './services/api';
import { subscribeAuth, logoutUser } from './services/firebase';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Catalog } from './components/Catalog';
import { ContactSection } from './components/ContactSection';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { LoginModal } from './components/LoginModal';
import { ImageModal } from './components/ImageModal';
import { LegalModal } from './components/LegalModal';
import { AdminPanel } from './components/AdminPanel';
import { MessageCircle } from 'lucide-react';
import { WHATSAPP_PHONE } from './utils/format';

export const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState('Preparando catálogo…');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [sort, setSort] = useState('name');

  // Cart
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('akari_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Modals & Navigation
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [zoom, setZoom] = useState<{ image: string; title: string } | null>(null);
  const [legalModal, setLegalModal] = useState<'terminos' | 'privacidad' | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auth & Roles
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isReseller, setIsReseller] = useState(false);

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  // Save cart changes
  useEffect(() => {
    try {
      localStorage.setItem('akari_cart', JSON.stringify(cart));
    } catch (e) {
      console.warn('Could not save cart:', e);
    }
  }, [cart]);

  // Load catalog
  const loadCatalog = useCallback(async () => {
    const cached = readCachedCatalog();
    if (cached && cached.length && !products.length) {
      setProducts(cached);
      setStatusText(`${cached.length} productos (caché local) · actualizando…`);
    }

    try {
      const data = await api<{ ok: boolean; products: Product[] }>('catalog', {}, 'GET');
      let prodList = data.products || [];
      writeCachedCatalog(prodList);

      // If user is reseller or admin, get wholesale prices
      if (user) {
        try {
          const roleRes = await api<{ ok: boolean; admin: boolean; reseller: boolean }>('myRole');
          const isAdm = !!roleRes.admin;
          const isRes = !!roleRes.reseller || isAdm;
          setIsAdmin(isAdm);
          setIsReseller(isRes);

          if (isRes) {
            const privRes = await api<{ ok: boolean; products: { id: string; wholesale: number }[] }>('privateCatalog');
            const privMap: Record<string, number> = {};
            (privRes.products || []).forEach((p) => {
              privMap[p.id] = p.wholesale;
            });
            prodList = prodList.map((p) => ({
              ...p,
              wholesale: privMap[p.id] !== undefined ? privMap[p.id] : p.wholesale,
            }));
          }
        } catch (err) {
          console.warn('Role verification notice:', err);
        }
      }

      setProducts(prodList);
      setStatusText(
        `${prodList.length} productos disponibles${isReseller ? ' · Lista mayorista habilitada' : ''}`
      );
    } catch (err: any) {
      console.warn('Catalog fetch notice:', err);
      if (!products.length && cached && cached.length) {
        setProducts(cached);
        setStatusText(`${cached.length} productos (modo sin conexión)`);
      } else if (!products.length) {
        setStatusText('Catálogo inicial cargado.');
      }
    } finally {
      setLoading(false);
    }
  }, [user, isReseller, products.length]);

  // Subscribe to Auth changes
  useEffect(() => {
    const unsubscribe = subscribeAuth(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const role = await api<{ ok: boolean; admin: boolean; reseller: boolean }>('myRole');
          setIsAdmin(!!role.admin);
          setIsReseller(!!role.reseller || !!role.admin);
        } catch {
          setIsAdmin(false);
          setIsReseller(false);
        }
      } else {
        setIsAdmin(false);
        setIsReseller(false);
        setShowAdmin(false);
      }
      loadCatalog();
    });
    return () => unsubscribe();
  }, [loadCatalog]);

  // Handle Cart
  const handleAddToCart = (product: Product) => {
    setCart((prev) => ({
      ...prev,
      [product.id]: (prev[product.id] || 0) + 1,
    }));
    showToast('Producto agregado al pedido');
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const nextQty = (prev[productId] || 0) + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: nextQty };
    });
  };

  const handleRemoveCartItem = (productId: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
  };

  const handleClearCart = () => {
    setCart({});
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const handleAuthButtonClick = async () => {
    if (user) {
      if (showAdmin) {
        setShowAdmin(false);
      }
      await logoutUser();
      setUser(null);
      setIsAdmin(false);
      setIsReseller(false);
      showToast('Sesión cerrada');
      loadCatalog();
    } else {
      setIsLoginOpen(true);
    }
  };

  return (
    <div>
      <Header
        search={search}
        onSearchChange={setSearch}
        cartCount={cartCount}
        onOpenCart={() => setIsCartOpen(true)}
        isAdmin={isAdmin}
        isReseller={isReseller}
        userEmail={user?.email || null}
        onOpenLogin={handleAuthButtonClick}
        onToggleAdmin={() => setShowAdmin((prev) => !prev)}
        showAdmin={showAdmin}
      />

      <main>
        {showAdmin ? (
          <AdminPanel
            onShowToast={showToast}
            onRefreshCatalog={loadCatalog}
          />
        ) : (
          <>
            <Hero />
            <Catalog
              products={products}
              loading={loading}
              statusText={statusText}
              category={category}
              onCategoryChange={setCategory}
              sort={sort}
              onSortChange={setSort}
              search={search}
              isReseller={isReseller}
              onAddToCart={handleAddToCart}
              onZoom={(image, title) => setZoom({ image, title })}
            />
            <ContactSection />
          </>
        )}
      </main>

      <Footer onOpenLegal={(type) => setLegalModal(type)} />

      {/* Floating WhatsApp Action Button */}
      {!showAdmin && (
        <a
          href={`https://wa.me/${WHATSAPP_PHONE}`}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-float"
          aria-label="Contactar por WhatsApp"
        >
          <MessageCircle size={18} />
          <span>Consultar por WhatsApp</span>
        </a>
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        products={products}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        isReseller={isReseller}
        onShowToast={showToast}
      />

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={() => {
          showToast('Bienvenido a Akari Import');
          loadCatalog();
        }}
        onShowToast={showToast}
      />

      {/* Image Preview Modal */}
      <ImageModal
        image={zoom?.image || null}
        title={zoom?.title || ''}
        onClose={() => setZoom(null)}
      />

      {/* Legal Modal */}
      <LegalModal
        type={legalModal}
        onClose={() => setLegalModal(null)}
      />

      {/* Toast */}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
};
