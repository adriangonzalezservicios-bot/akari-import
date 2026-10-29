import React, { useState, useEffect } from 'react';
import type { Product, Order, Reseller, HistoryEntry } from '../types';
import { api } from '../services/api';
import { money } from '../utils/format';
import * as XLSX from 'xlsx';
import {
  Package,
  ShoppingBag,
  Users,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Search,
  RefreshCw
} from 'lucide-react';

interface AdminPanelProps {
  onShowToast: (msg: string) => void;
  onRefreshCatalog: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onShowToast, onRefreshCatalog }) => {
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'resellers' | 'history'>('products');
  const [loading, setLoading] = useState(false);

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingProduct, setEditingProduct] = useState<Partial<Product>>({
    sku: '',
    name: '',
    retail: 0,
    wholesale: 0,
    category: 'General',
    stock: null,
    image: '',
    description: '',
    active: true,
  });

  // Bulk edit state
  const [bulkActive, setBulkActive] = useState<string>('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStockStatus, setBulkStockStatus] = useState('');
  const [bulkStockQty, setBulkStockQty] = useState('');
  const [bulkRetailPct, setBulkRetailPct] = useState('');
  const [bulkWholesalePct, setBulkWholesalePct] = useState('');
  const [bulkRetailPrice, setBulkRetailPrice] = useState('');
  const [bulkWholesalePrice, setBulkWholesalePrice] = useState('');

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Resellers state
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [resellerEmail, setResellerEmail] = useState('');
  const [resellerName, setResellerName] = useState('');
  const [resellerPass, setResellerPass] = useState('');
  const [credentialsText, setCredentialsText] = useState('');

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Load data for active tab
  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'products') {
        const res = await api<{ ok: boolean; products: Product[] }>('adminProducts');
        setProducts(res.products || []);
      } else if (activeTab === 'orders') {
        const res = await api<{ ok: boolean; orders: Order[] }>('adminOrders');
        setOrders(res.orders || []);
      } else if (activeTab === 'resellers') {
        const res = await api<{ ok: boolean; resellers: Reseller[] }>('adminResellers');
        setResellers(res.resellers || []);
      } else if (activeTab === 'history') {
        const res = await api<{ ok: boolean; history: HistoryEntry[] }>('adminHistory');
        setHistory(res.history || []);
      }
    } catch (err: any) {
      onShowToast(`Error: ${err.message || 'No se pudieron cargar los datos'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Product Form Save
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct.sku || !editingProduct.name) {
      onShowToast('SKU y Nombre son obligatorios');
      return;
    }

    try {
      await api('saveProduct', { product: editingProduct });
      onShowToast('Producto guardado correctamente');
      setEditingProduct({
        sku: '',
        name: '',
        retail: 0,
        wholesale: 0,
        category: 'General',
        stock: null,
        image: '',
        description: '',
        active: true,
      });
      loadData();
      onRefreshCatalog();
    } catch (err: any) {
      onShowToast(`Error al guardar: ${err.message}`);
    }
  };

  // Product Delete
  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este producto?')) return;
    try {
      await api('deleteProduct', { id });
      onShowToast('Producto eliminado');
      loadData();
      onRefreshCatalog();
    } catch (err: any) {
      onShowToast(`Error: ${err.message}`);
    }
  };

  // Selection toggle
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p) => p.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Bulk Apply
  const handleBulkApply = async () => {
    if (!selectedIds.length) {
      onShowToast('Seleccioná al menos un producto en la tabla');
      return;
    }

    const updates: Record<string, any> = {};
    if (bulkActive !== '') updates.active = bulkActive === '1';
    if (bulkCategory.trim()) updates.category = bulkCategory.trim();
    if (bulkStockStatus === 'out') updates.stock = 0;
    else if (bulkStockStatus === 'qty' && bulkStockQty !== '') updates.stock = Number(bulkStockQty);

    if (bulkRetailPrice !== '') updates.retailPrice = Number(bulkRetailPrice);
    if (bulkWholesalePrice !== '') updates.wholesalePrice = Number(bulkWholesalePrice);
    if (bulkRetailPct !== '') updates.retailPct = Number(bulkRetailPct);
    if (bulkWholesalePct !== '') updates.wholesalePct = Number(bulkWholesalePct);

    try {
      await api('bulkUpdateProducts', { ids: selectedIds, updates });
      onShowToast(`Cambios aplicados a ${selectedIds.length} productos`);
      setSelectedIds([]);
      loadData();
      onRefreshCatalog();
    } catch (err: any) {
      onShowToast(`Error en edición masiva: ${err.message}`);
    }
  };

  // Excel Export
  const handleExportExcel = () => {
    const dataToExport = products.map((p) => ({
      ID: p.id,
      SKU: p.sku,
      Nombre: p.name,
      Descripcion: p.description || '',
      Categoria: p.category || 'General',
      Minorista: p.retail,
      Mayorista: p.wholesale || 0,
      Stock: p.stock !== null ? p.stock : '',
      Activo: p.active ? 'SI' : 'NO',
      Imagen: p.image || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
    XLSX.writeFile(workbook, `Akari_Productos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    onShowToast('Planilla de Excel descargada');
  };

  // Excel Import
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        const importedProducts = jsonData.map((row) => ({
          sku: String(row.SKU || row.sku || '').trim(),
          name: String(row.Nombre || row.name || '').trim(),
          description: String(row.Descripcion || row.description || ''),
          category: String(row.Categoria || row.category || 'General'),
          retail: Number(row.Minorista || row.retail) || 0,
          wholesale: Number(row.Mayorista || row.wholesale) || 0,
          stock: row.Stock !== undefined && row.Stock !== '' ? Number(row.Stock) : null,
          active: String(row.Activo || row.active).toUpperCase() !== 'NO',
          image: String(row.Imagen || row.image || ''),
        }));

        await api('importProducts', { products: importedProducts });
        onShowToast(`Se importaron ${importedProducts.length} productos desde Excel`);
        loadData();
        onRefreshCatalog();
      } catch (err: any) {
        onShowToast(`Error al procesar el archivo Excel: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Initial JSON Import
  const handleImportInitial = async () => {
    try {
      const res = await fetch('/importar-productos.json');
      const data = await res.json();
      await api('importProducts', { products: data });
      onShowToast(`Se cargaron ${data.length} productos del catálogo inicial`);
      loadData();
      onRefreshCatalog();
    } catch (err: any) {
      onShowToast(`Error: ${err.message}`);
    }
  };

  // Photos by SKU
  const handlePhotosUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    let matchedCount = 0;
    Array.from(files).forEach((file) => {
      const filenameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      // find product by SKU matching name
      const targetProd = products.find(
        (p) => p.sku.toLowerCase() === filenameWithoutExt.toLowerCase()
      );
      if (targetProd) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          await api('saveProduct', {
            product: { ...targetProd, image: base64 },
          });
          matchedCount++;
        };
        reader.readAsDataURL(file);
      }
    });

    setTimeout(() => {
      onShowToast(`Fotos procesadas para SKUs coincidentes`);
      loadData();
      onRefreshCatalog();
    }, 1500);
    e.target.value = '';
  };

  // Reseller Save
  const handleSaveReseller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resellerEmail.trim() || !resellerName.trim()) {
      onShowToast('Completá email y nombre del revendedor');
      return;
    }

    try {
      await api('saveReseller', {
        reseller: {
          email: resellerEmail.trim(),
          name: resellerName.trim(),
          active: true,
        },
      });

      if (resellerPass) {
        setCredentialsText(
          `Cuenta de revendedor activada:\nEmail: ${resellerEmail}\nContraseña provisoria: ${resellerPass}`
        );
      } else {
        setCredentialsText(`Revendedor guardado: ${resellerEmail}`);
      }

      setResellerEmail('');
      setResellerName('');
      setResellerPass('');
      onShowToast('Revendedor guardado');
      loadData();
    } catch (err: any) {
      onShowToast(`Error: ${err.message}`);
    }
  };

  // Order status update
  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await api('updateOrder', { id: orderId, status });
      onShowToast(`Pedido actualizado a: ${status}`);
      loadData();
    } catch (err: any) {
      onShowToast(`Error: ${err.message}`);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-wrap">
      <div className="admin-head">
        <div>
          <p className="eyebrow">GESTIÓN PRIVADA</p>
          <h1>Administración</h1>
          <p className="muted">Administrá catálogo, pedidos, revendedores y registro de actividades.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="outline" onClick={loadData} title="Refrescar datos">
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            Refrescar
          </button>
          <button className="primary" onClick={handleImportInitial}>
            <Download size={14} style={{ marginRight: 6 }} />
            Importar productos iniciales
          </button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          <Package size={14} style={{ display: 'inline', marginRight: 6 }} />
          Productos ({products.length})
        </button>
        <button
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          <ShoppingBag size={14} style={{ display: 'inline', marginRight: 6 }} />
          Pedidos ({orders.length})
        </button>
        <button
          className={activeTab === 'resellers' ? 'active' : ''}
          onClick={() => setActiveTab('resellers')}
        >
          <Users size={14} style={{ display: 'inline', marginRight: 6 }} />
          Revendedores ({resellers.length})
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={14} style={{ display: 'inline', marginRight: 6 }} />
          Historial
        </button>
      </div>

      {/* ================= PRODUCTS TAB ================= */}
      {activeTab === 'products' && (
        <section className="panel">
          <h2>{editingProduct.id ? 'Editar Producto' : 'Nuevo Producto'}</h2>
          <form onSubmit={handleSaveProduct} className="gridform">
            <label>
              SKU
              <input
                required
                value={editingProduct.sku || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                placeholder="ej. PIOTT002"
              />
            </label>
            <label>
              Nombre del producto
              <input
                required
                value={editingProduct.name || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                placeholder="Nombre descriptivo"
              />
            </label>
            <label>
              Precio minorista (ARS)
              <input
                type="number"
                min="0"
                required
                value={editingProduct.retail ?? ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, retail: Number(e.target.value) })}
              />
            </label>
            <label>
              Precio mayorista (ARS)
              <input
                type="number"
                min="0"
                value={editingProduct.wholesale ?? ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, wholesale: Number(e.target.value) })}
              />
            </label>
            <label>
              Categoría
              <input
                value={editingProduct.category || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                placeholder="ej. Gadnic, Tecnología, Hogar"
              />
            </label>
            <label>
              Stock disponible (cantidad)
              <input
                type="number"
                min="0"
                value={editingProduct.stock ?? ''}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    stock: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="Vacío = ilimitado"
              />
            </label>
            <label className="wide">
              Imagen URL (HTTPS o /assets/...)
              <input
                type="text"
                value={editingProduct.image || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, image: e.target.value })}
                placeholder="https://... o seleccioná desde fotos por SKU"
              />
            </label>
            <label className="wide">
              Descripción
              <textarea
                rows={2}
                value={editingProduct.description || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={editingProduct.active !== false}
                onChange={(e) => setEditingProduct({ ...editingProduct, active: e.target.checked })}
              />
              Publicado (visible en el catálogo público)
            </label>

            <div className="row-btn wide">
              <button type="submit" className="primary">
                {editingProduct.id ? 'Actualizar producto' : 'Guardar producto'}
              </button>
              <button
                type="button"
                className="outline"
                onClick={() =>
                  setEditingProduct({
                    sku: '',
                    name: '',
                    retail: 0,
                    wholesale: 0,
                    category: 'General',
                    stock: null,
                    image: '',
                    description: '',
                    active: true,
                  })
                }
              >
                Limpiar formulario
              </button>
            </div>
          </form>

          {/* Bulk Edit Box */}
          <div className="box">
            <h3>Edición masiva</h3>
            <p className="muted small">
              Seleccioná uno o más productos con la casilla de la tabla y aplicá modificaciones conjuntas.
            </p>
            <div className="toolbar">
              <label>
                Publicación
                <select value={bulkActive} onChange={(e) => setBulkActive(e.target.value)}>
                  <option value="">Sin cambios</option>
                  <option value="1">Publicar</option>
                  <option value="0">Ocultar</option>
                </select>
              </label>
              <label>
                Nueva categoría
                <input
                  placeholder="ej. Iluminación"
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                />
              </label>
              <label>
                Estado de Stock
                <select value={bulkStockStatus} onChange={(e) => setBulkStockStatus(e.target.value)}>
                  <option value="">Sin cambios</option>
                  <option value="out">Sin stock (0)</option>
                  <option value="qty">Fijar cantidad…</option>
                </select>
              </label>
              {bulkStockStatus === 'qty' && (
                <label>
                  Cantidad fijada
                  <input
                    type="number"
                    min="0"
                    placeholder="ej. 10"
                    value={bulkStockQty}
                    onChange={(e) => setBulkStockQty(e.target.value)}
                  />
                </label>
              )}
              <label>
                % Ajuste minorista
                <input
                  type="number"
                  step="0.1"
                  placeholder="ej. 10 o -5"
                  value={bulkRetailPct}
                  onChange={(e) => setBulkRetailPct(e.target.value)}
                />
              </label>
              <label>
                % Ajuste mayorista
                <input
                  type="number"
                  step="0.1"
                  placeholder="ej. 10 o -5"
                  value={bulkWholesalePct}
                  onChange={(e) => setBulkWholesalePct(e.target.value)}
                />
              </label>
              <label>
                Precio minorista fijo
                <input
                  type="number"
                  min="0"
                  placeholder="Reemplaza actual"
                  value={bulkRetailPrice}
                  onChange={(e) => setBulkRetailPrice(e.target.value)}
                />
              </label>
              <label>
                Precio mayorista fijo
                <input
                  type="number"
                  min="0"
                  placeholder="Reemplaza actual"
                  value={bulkWholesalePrice}
                  onChange={(e) => setBulkWholesalePrice(e.target.value)}
                />
              </label>
              <div>
                <button
                  type="button"
                  className="primary"
                  onClick={handleBulkApply}
                  disabled={!selectedIds.length}
                >
                  Aplicar ({selectedIds.length})
                </button>
              </div>
            </div>
          </div>

          {/* Import / Export Box */}
          <div className="box">
            <h3>Importar / exportar Excel</h3>
            <p className="muted small">Descargá la planilla para modificar en Excel o subí un archivo compatible.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <button type="button" className="outline" onClick={handleExportExcel}>
                <Download size={14} style={{ marginRight: 6 }} />
                Descargar Excel
              </button>
              <label className="outline" style={{ cursor: 'pointer' }}>
                <Upload size={14} style={{ marginRight: 6 }} />
                Subir Excel
                <input type="file" accept=".xlsx,.xls" hidden onChange={handleImportExcel} />
              </label>
            </div>
          </div>

          {/* Photos Box */}
          <div className="box">
            <h3>Asignación de fotos por SKU</h3>
            <p className="muted small">
              Subí fotos cuyo nombre de archivo coincida con el SKU (ej. <code>PIOTT002.jpg</code>). Se actualizarán automáticamente.
            </p>
            <label className="outline" style={{ cursor: 'pointer', marginTop: 8, display: 'inline-flex' }}>
              <ImageIcon size={14} style={{ marginRight: 6 }} />
              Seleccionar imágenes
              <input type="file" accept="image/*" multiple hidden onChange={handlePhotosUpload} />
            </label>
          </div>

          {/* Products Filter Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, gap: 16 }}>
            <div className="search" style={{ maxWidth: 360 }}>
              <input
                placeholder="Buscar por SKU, nombre o categoría..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <div className="muted small">
              {filteredProducts.length} de {products.length} productos
            </div>
          </div>

          {/* Products Table */}
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {selectedIds.length === filteredProducts.length && filteredProducts.length > 0 ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th>Foto</th>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Minorista</th>
                  <th>Mayorista</th>
                  <th>Stock</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      No se encontraron productos en el catálogo.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isSelected = selectedIds.includes(p.id);
                    return (
                      <tr key={p.id} style={{ background: isSelected ? 'rgba(227,6,19,0.03)' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => toggleSelectOne(p.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            {isSelected ? <CheckSquare size={16} color="var(--red)" /> : <Square size={16} />}
                          </button>
                        </td>
                        <td>
                          <img
                            src={p.image || '/assets/placeholder.svg'}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/assets/placeholder.svg';
                            }}
                            className="thumb"
                            alt={p.name}
                          />
                        </td>
                        <td>
                          <b>{p.sku}</b>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <div>{p.name}</div>
                          {p.description && <div className="muted small">{p.description}</div>}
                        </td>
                        <td>{money(p.retail)}</td>
                        <td>{p.wholesale != null ? money(p.wholesale) : '-'}</td>
                        <td>
                          {p.stock === 0 ? (
                            <span className="pill bad">Sin stock</span>
                          ) : p.stock !== null && p.stock !== undefined ? (
                            <span className="pill ok">{p.stock} u.</span>
                          ) : (
                            <span className="pill off">Ilimitado</span>
                          )}
                        </td>
                        <td>{p.category || 'General'}</td>
                        <td>
                          {p.active ? (
                            <span className="pill ok">Público</span>
                          ) : (
                            <span className="pill off">Oculto</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="action-btn"
                            onClick={() => {
                              setEditingProduct(p);
                              window.scrollTo({ top: 150, behavior: 'smooth' });
                            }}
                            title="Editar"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="action-btn delete"
                            onClick={() => handleDeleteProduct(p.id)}
                            title="Eliminar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ================= ORDERS TAB ================= */}
      {activeTab === 'orders' && (
        <section className="panel">
          <h2>Registro de Pedidos</h2>
          <p className="muted">Pedidos iniciados a través del catálogo online y enviados a WhatsApp.</p>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>N° Pedido</th>
                  <th>Cliente</th>
                  <th>Lista</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      No hay pedidos registrados todavía.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id}>
                      <td>{new Date(o.date).toLocaleDateString('es-AR')}</td>
                      <td><b>{o.orderNumber}</b></td>
                      <td>{o.customerName}</td>
                      <td>
                        <span className={`pill ${o.priceType === 'mayorista' ? 'warn' : 'ok'}`}>
                          {o.priceType}
                        </span>
                      </td>
                      <td><b>{money(o.total)}</b></td>
                      <td>
                        <select
                          value={o.status || 'Pendiente'}
                          onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12 }}
                        >
                          <option value="Pendiente">Pendiente</option>
                          <option value="Confirmado">Confirmado</option>
                          <option value="En preparación">En preparación</option>
                          <option value="Entregado">Entregado</option>
                          <option value="Cancelado">Cancelado</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="action-btn"
                          onClick={() => setSelectedOrder(o)}
                        >
                          Ver productos
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {selectedOrder && (
            <div className="box" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Detalle de Pedido {selectedOrder.orderNumber}</h3>
                <button className="outline" onClick={() => setSelectedOrder(null)}>Cerrar detalle</button>
              </div>
              <p><b>Cliente:</b> {selectedOrder.customerName}</p>
              {selectedOrder.note && <p><b>Comentario:</b> {selectedOrder.note}</p>}
              <ul>
                {selectedOrder.items?.map((it, idx) => (
                  <li key={idx}>
                    {it.quantity} x {it.name} (SKU: {it.sku}) - {money(it.unitPrice)} c/u
                  </li>
                ))}
              </ul>
              <p><b>Total:</b> {money(selectedOrder.total)}</p>
            </div>
          )}
        </section>
      )}

      {/* ================= RESELLERS TAB ================= */}
      {activeTab === 'resellers' && (
        <section className="panel">
          <h2>Gestión de Revendedores</h2>
          <p className="muted">Habilitá cuentas autorizadas para acceder a la lista de precios mayoristas.</p>

          <form onSubmit={handleSaveReseller} className="gridform" style={{ marginTop: 16 }}>
            <label>
              Email autorizado
              <input
                type="email"
                required
                value={resellerEmail}
                onChange={(e) => setResellerEmail(e.target.value)}
                placeholder="cliente@mayorista.com"
              />
            </label>
            <label>
              Nombre / Razón Social
              <input
                required
                value={resellerName}
                onChange={(e) => setResellerName(e.target.value)}
                placeholder="Comercio o Contacto"
              />
            </label>
            <label className="wide">
              Contraseña provisoria (opcional)
              <input
                type="text"
                value={resellerPass}
                onChange={(e) => setResellerPass(e.target.value)}
                placeholder="ej. Akari2026*"
              />
            </label>
            <div className="wide">
              <button type="submit" className="primary">Crear / Actualizar Revendedor</button>
            </div>
          </form>

          {credentialsText && (
            <div className="box" style={{ background: '#eef6ee', borderColor: '#bbf7d0', marginTop: 16 }}>
              <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 13 }}>{credentialsText}</pre>
            </div>
          )}

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Última actualización</th>
                </tr>
              </thead>
              <tbody>
                {resellers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      No hay revendedores registrados todavía.
                    </td>
                  </tr>
                ) : (
                  resellers.map((r, idx) => (
                    <tr key={idx}>
                      <td><b>{r.email}</b></td>
                      <td>{r.name}</td>
                      <td>
                        <span className={`pill ${r.active ? 'ok' : 'off'}`}>
                          {r.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('es-AR') : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ================= HISTORY TAB ================= */}
      {activeTab === 'history' && (
        <section className="panel">
          <h2>Historial de Actividades</h2>
          <p className="muted">Registro de auditoría de modificaciones y pedidos.</p>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      No hay actividades registradas en el historial.
                    </td>
                  </tr>
                ) : (
                  history.map((h, idx) => (
                    <tr key={idx}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(h.date).toLocaleString('es-AR')}
                      </td>
                      <td><b>{h.user}</b></td>
                      <td><span className="pill ok">{h.action}</span></td>
                      <td>{h.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
