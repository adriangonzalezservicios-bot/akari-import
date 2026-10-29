import type { OrderLineItem } from '../types';

export const WHATSAPP_PHONE = '5491133672920';

export function money(n: number | string | null | undefined): string {
  const num = typeof n === 'number' ? n : Number(n) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(num);
}

export function buildWhatsAppOrderMessage(
  orderNumber: string,
  customerName: string,
  priceType: 'minorista' | 'mayorista',
  items: OrderLineItem[],
  total: number,
  note?: string
): string {
  const lines = [
    `PEDIDO AKARI IMPORT ${orderNumber || ''}`.trim(),
    `Cliente: ${customerName}`,
    `Tipo de lista: ${priceType}`,
    '',
    ...items.map(x => `${x.quantity} x ${x.name} | SKU ${x.sku} | ${money(x.unitPrice * x.quantity)}`),
    '',
    `TOTAL ESTIMADO: ${money(total)}`,
    note ? `Comentario: ${note}` : '',
    'Solicito confirmar stock, envío y forma de pago.'
  ];
  return lines.filter(Boolean).join('\n');
}

export function getWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}
