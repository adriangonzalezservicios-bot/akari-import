import React from 'react';
import { WHATSAPP_PHONE } from '../utils/format';

interface FooterProps {
  onOpenLegal: (type: 'terminos' | 'privacidad') => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => {
  return (
    <footer className="site-footer" id="legales">
      <div className="footer-grid">
        <div className="footer-col">
          <p className="footer-brand">AKARI <b>IMPORT</b></p>
          <p>Catálogo online de tecnología, hogar y accesorios. Venta mayorista y minorista.</p>
          <p style={{ marginTop: 12 }}>
            <strong style={{ color: '#fff' }}>WhatsApp:</strong><br />
            <a href={`https://wa.me/${WHATSAPP_PHONE}`} target="_blank" rel="noopener noreferrer">
              +54 9 11 3367-2920
            </a>
          </p>
          <p>
            <strong style={{ color: '#fff' }}>Zona:</strong> Castelar / Gran Buenos Aires, Argentina
          </p>
        </div>

        <div className="footer-col">
          <h4>Legal</h4>
          <button className="footer-link" onClick={() => onOpenLegal('terminos')}>
            Términos y condiciones
          </button>
          <button className="footer-link" onClick={() => onOpenLegal('privacidad')}>
            Política de privacidad
          </button>
          <a
            href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', marginTop: 8 }}
          >
            Defensa del Consumidor
          </a>
        </div>

        <div className="footer-col">
          <h4>Información</h4>
          <p className="footer-legal-note">
            Los precios publicados en el catálogo son orientativos y pueden modificarse sin previo aviso. La confirmación de stock, precio final, forma de pago y envío se realiza al momento de formalizar el pedido (por WhatsApp o canal acordado).
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© Akari Import · Argentina</p>
        <p className="muted small">
          El pedido se registra online antes de abrir WhatsApp. La confirmación final de stock y envío se realiza por mensaje.
        </p>
      </div>
    </footer>
  );
};
