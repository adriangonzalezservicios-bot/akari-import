export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  image: string;
  retail: number;
  wholesale?: number;
  active: boolean;
  stock: number | null;
  updatedAt?: string;
}

export interface OrderLineItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  customerName: string;
  note?: string;
  priceType: 'minorista' | 'mayorista';
  items: OrderLineItem[];
  total: number;
  status: string;
}

export interface Reseller {
  email: string;
  name: string;
  active: boolean;
  updatedAt?: string;
}

export interface HistoryEntry {
  date: string;
  user: string;
  action: string;
  detail: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
