import React from 'react';
import { MessageCircle } from 'lucide-react';
import { WHATSAPP_PHONE } from '../utils/format';

export const ContactSection: React.FC = () => {
  return (
    <section className="contact" id="contacto">
      <div>
        <p className="eyebrow">¿TENÉS UNA CONSULTA?</p>
        <h2>Hablemos de tu próximo pedido.</h2>
        <p>Escribinos por WhatsApp para consultar disponibilidad, envío y condiciones comerciales.</p>
      </div>
      <a
        className="primary"
        target="_blank"
        rel="noopener noreferrer"
        href={`https://wa.me/${WHATSAPP_PHONE}`}
      >
        <MessageCircle size={16} style={{ marginRight: 8 }} />
        Contactar por WhatsApp
      </a>
    </section>
  );
};
