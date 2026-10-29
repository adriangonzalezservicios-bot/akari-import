import React from 'react';
import { ShoppingBag, ShieldCheck, UserCheck, LogIn } from 'lucide-react';

interface HeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  isAdmin: boolean;
  isReseller: boolean;
  userEmail: string | null;
  onOpenLogin: () => void;
  onToggleAdmin: () => void;
  showAdmin: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  search,
  onSearchChange,
  cartCount,
  onOpenCart,
  isAdmin,
  isReseller,
  userEmail,
  onOpenLogin,
  onToggleAdmin,
  showAdmin,
}) => {
  return (
    <header className="top">
      <a className="brand" href="#" onClick={(e) => { e.preventDefault(); if (showAdmin) onToggleAdmin(); }}>
        <img
          src="/assets/akari-logo-transparent.png"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/assets/akari-logo.png';
          }}
          alt="Akari Import"
        />
        <span>AKARI <b>IMPORT</b></span>
      </a>

      {!showAdmin && (
        <div className="search">
          <input
            id="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por producto o SKU…"
            aria-label="Buscar productos"
          />
          {search && (
            <button
              id="searchClear"
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>
      )}

      <nav style={{ marginLeft: showAdmin ? 'auto' : undefined }}>
        {!showAdmin && <a href="#catalogo">Catálogo</a>}
        {!showAdmin && <a href="#contacto">Contacto</a>}

        {isAdmin && (
          <button
            className={`outline ${showAdmin ? 'active' : ''}`}
            onClick={onToggleAdmin}
          >
            <ShieldCheck size={16} />
            {showAdmin ? 'Volver al catálogo' : 'Panel administración'}
          </button>
        )}

        <button className="outline" onClick={onOpenLogin}>
          {userEmail ? (
            <>
              <UserCheck size={16} />
              <span>{isReseller ? 'Revendedor · salir' : 'Salir'}</span>
            </>
          ) : (
            <>
              <LogIn size={16} />
              <span>Login revendedores</span>
            </>
          )}
        </button>

        {!showAdmin && (
          <button className="cart-button" onClick={onOpenCart} aria-label="Abrir carrito">
            <ShoppingBag size={15} />
            <span>Carrito</span>
            <span id="cartCount">{cartCount}</span>
          </button>
        )}
      </nav>
    </header>
  );
};
