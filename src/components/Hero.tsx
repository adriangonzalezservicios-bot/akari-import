import React from 'react';

export const Hero: React.FC = () => {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">CATÁLOGO ONLINE · AKARI IMPORT</p>
        <h1>Catálogo de productos</h1>
        <p>Precios minoristas públicos · lista mayorista con acceso. Armá tu pedido y confirmalo por WhatsApp.</p>
        <a className="primary" href="#catalogo">Ver catálogo</a>
      </div>
      <div className="hero-mark">AKARI<span>IMPORT</span></div>
    </section>
  );
};
