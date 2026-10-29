import React from 'react';
import { X } from 'lucide-react';
import { WHATSAPP_PHONE } from '../utils/format';

interface LegalModalProps {
  type: 'terminos' | 'privacidad' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
  if (!type) return null;

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="legal-modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar ventana">
            <X size={24} />
          </button>
        </div>

        <div className="legal-content">
          {type === 'terminos' ? (
            <>
              <h1>Términos y condiciones</h1>
              <p className="muted" style={{ marginBottom: 20 }}>
                Última actualización: octubre 2026 · AKARI IMPORT · República Argentina
              </p>

              <h2>1. Identificación del prestador</h2>
              <p>
                El presente sitio web y catálogo online son operados por <strong>AKARI IMPORT</strong>, con domicilio comercial en Castelar, Provincia de Buenos Aires, República Argentina. WhatsApp: <a href={`https://wa.me/${WHATSAPP_PHONE}`} target="_blank" rel="noopener noreferrer">+54 9 11 3367-2920</a>.
              </p>

              <h2>2. Objeto del sitio</h2>
              <p>
                El sitio permite consultar un catálogo, solicitar pedidos y, para usuarios autorizados, acceder a precios mayoristas. Los precios y el stock son orientativos; la oferta se formaliza al confirmar el pedido por WhatsApp u otro canal acordado.
              </p>

              <h2>3. Usuarios y cuentas</h2>
              <p>
                El catálogo minorista no requiere registro. Los precios mayoristas están reservados a revendedores habilitados. El usuario es responsable de la confidencialidad de sus credenciales.
              </p>

              <h2>4. Precios, pedidos y disponibilidad</h2>
              <ul>
                <li>Precios en pesos argentinos (ARS), salvo indicación en contrario.</li>
                <li>AKARI puede modificar precios y disponibilidad hasta la confirmación del pedido.</li>
                <li>La aceptación definitiva de stock, precio, pago y entrega se realiza al confirmar el pedido.</li>
                <li>Las imágenes son ilustrativas.</li>
              </ul>

              <h2>5. Pagos y facturación</h2>
              <p>
                Las formas de pago se acuerdan al confirmar el pedido. La facturación se emite conforme a la normativa fiscal argentina vigente.
              </p>

              <h2>6. Envíos y retiro</h2>
              <p>
                Retiro y/o envío se coordinan caso por caso en Castelar y Gran Buenos Aires. El flete, cuando aplique, se coordina al momento de confirmar el pedido.
              </p>

              <h2>7. Defensa del consumidor</h2>
              <p>
                En caso de relaciones de consumo según la Ley N.º 24.240 de Defensa del Consumidor, el consumidor cuenta con los derechos allí reconocidos. Formulario oficial: <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noopener noreferrer">argentina.gob.ar</a>.
              </p>
            </>
          ) : (
            <>
              <h1>Política de privacidad</h1>
              <p className="muted" style={{ marginBottom: 20 }}>
                Última actualización: octubre 2026 · AKARI IMPORT · República Argentina
              </p>

              <h2>1. Responsable del tratamiento</h2>
              <p>
                AKARI IMPORT trata los datos personales de conformidad con la <strong>Ley de Protección de Datos Personales N.º 25.326</strong> de la República Argentina.
              </p>

              <h2>2. Datos que recolectamos</h2>
              <ul>
                <li><strong>Consultas y pedidos:</strong> Nombre o denominación comercial, detalle del pedido y notas proporcionadas para tramitar el pedido.</li>
                <li><strong>Cuentas de revendedores:</strong> Correo electrónico y credenciales de autenticación para acceso mayorista.</li>
              </ul>

              <h2>3. Finalidad del tratamiento</h2>
              <p>
                Los datos se emplean exclusivamente para procesar las cotizaciones y pedidos, responder consultas vía WhatsApp y verificar el acceso a la lista de precios mayorista.
              </p>

              <h2>4. Derechos ARCO</h2>
              <p>
                Los titulares pueden ejercer sus derechos de acceso, rectificación, actualización y supresión enviando su solicitud a través de nuestro WhatsApp oficial (+54 9 11 3367-2920).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
