import React, { useState } from 'react';
import type { CartItem, Product } from '../types';
import { money, buildWhatsAppOrderMessage, getWhatsAppUrl } from '../utils/format';
import { api } from '../services/api';
import { X, Trash2, Send, ExternalLink, CheckCircle } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: Record<string, number>;
  products: Product[];
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  isReseller: boolean;
  onShowToast: (msg: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  products,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  isReseller,
  onShowToast,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderMessage, setOrderMessage] = useState('');
  const [completedOrder, setCompletedOrder] = useState<{
    orderNumber: string;
    waUrl: string;
    messageText: string;
  } | null>(null);

  if (!isOpen) return null;

  const getShownPrice = (p: Product) => {
    return isReseller && p.wholesale != null ? Number(p.wholesale) : Number(p.retail || 0);
  };

  const itemIds = Object.keys(cart).filter((id) => (cart[id] || 0) > 0);
  const cartItems: CartItem[] = itemIds
    .map((id) => {
      const p = products.find((prod) => prod.id === id);
      return p ? { product: p, quantity: cart[id] } : null;
    })
    .filter((x): x is CartItem => x !== null);

  const total = cartItems.reduce((sum, item) => {
    return sum + getShownPrice(item.product) * item.quantity;
  }, 0);

  const handleSubmitOrder = async () => {
    if (!cartItems.length) {
      setOrderMessage('Agregá al menos un producto.');
      return;
    }
    if (!customerName.trim()) {
      setOrderMessage('Ingresá tu nombre o comercio.');
      return;
    }

    setSubmitting(true);
    setOrderMessage('Registrando pedido online…');

    try {
      const lineItems = cartItems.map((item) => ({
        productId: item.product.id,
        sku: item.product.sku,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: getShownPrice(item.product),
      }));

      const priceType = isReseller ? 'mayorista' : 'minorista';
      const orderPayload = {
        customerName: customerName.trim(),
        note: customerNote.trim(),
        priceType,
        items: lineItems,
        total,
      };

      const result = await api<{ ok: boolean; orderNumber?: string }>('createOrder', {
        order: orderPayload,
      });

      const orderNumber = result.orderNumber || `AK-${Date.now().toString().slice(-6)}`;
      const messageText = buildWhatsAppOrderMessage(
        orderNumber,
        customerName.trim(),
        priceType,
        lineItems,
        total,
        customerNote.trim()
      );
      const waUrl = getWhatsAppUrl(messageText);

      setCompletedOrder({
        orderNumber,
        waUrl,
        messageText,
      });

      // Try opening WhatsApp link
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      onShowToast(`¡Pedido ${orderNumber} registrado!`);
      onClearCart();
      setCustomerNote('');
    } catch (err: any) {
      setOrderMessage(`No se pudo registrar: ${err.message || 'Error de conexión'}.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="cart-drawer" aria-label="Carrito de compras">
        <header>
          <h2>Tu pedido</h2>
          <button onClick={onClose} aria-label="Cerrar carrito">
            <X size={20} />
          </button>
        </header>

        {completedOrder ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <CheckCircle size={48} color="var(--emerald-dark)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>Pedido registrado</h3>
            <p className="muted" style={{ margin: '6px 0 16px' }}>
              Número de pedido: <b>{completedOrder.orderNumber}</b>
            </p>
            <p style={{ fontSize: 13, marginBottom: 20 }}>
              Si no se abrió la ventana de WhatsApp automáticamente, hacé click abajo:
            </p>
            <a
              href={completedOrder.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="primary full"
              style={{ display: 'inline-flex', gap: 8, textDecoration: 'none', marginBottom: 12 }}
            >
              <Send size={16} />
              Abrir WhatsApp con mi pedido
            </a>
            <button
              className="outline"
              style={{ width: '100%' }}
              onClick={() => {
                setCompletedOrder(null);
                onClose();
              }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {cartItems.length === 0 ? (
                <p className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
                  Todavía no agregaste productos.
                </p>
              ) : (
                cartItems.map((item) => (
                  <div key={item.product.id} className="cart-row">
                    <div>
                      <b>{item.product.name}</b>
                      <small>
                        SKU {item.product.sku} · {money(getShownPrice(item.product))} c/u
                      </small>
                    </div>
                    <div className="qty">
                      <button
                        onClick={() => onUpdateQty(item.product.id, -1)}
                        aria-label="Disminuir cantidad"
                      >
                        −
                      </button>
                      <b style={{ minWidth: 20, textAlign: 'center', fontSize: 13 }}>
                        {item.quantity}
                      </b>
                      <button
                        onClick={() => onUpdateQty(item.product.id, 1)}
                        aria-label="Aumentar cantidad"
                      >
                        +
                      </button>
                      <button
                        onClick={() => onRemoveItem(item.product.id)}
                        aria-label="Quitar producto"
                        style={{ color: '#b91c1c' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <footer className="cart-footer">
              <div className="cart-total">
                <span>Total estimado</span>
                <strong>{money(total)}</strong>
              </div>

              <label>
                Nombre o comercio
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Tu nombre o empresa"
                />
              </label>

              <label>
                Comentario
                <textarea
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  rows={2}
                  placeholder="Opcional (horario de entrega, consultas, etc.)"
                />
              </label>

              {orderMessage && (
                <p style={{ color: 'var(--red)', fontSize: 12, margin: '2px 0' }}>
                  {orderMessage}
                </p>
              )}

              <button
                className="primary full"
                onClick={handleSubmitOrder}
                disabled={submitting || cartItems.length === 0}
              >
                {submitting ? 'Registrando...' : 'Confirmar y abrir WhatsApp'}
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
};
