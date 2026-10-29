import React, { useState } from 'react';
import { loginWithEmail } from '../services/firebase';
import { X, Lock } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
  onShowToast: (msg: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onShowToast,
}) => {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pass.trim()) {
      setError('Completá email y contraseña.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await loginWithEmail(email.trim(), pass);
      onShowToast('Sesión iniciada con éxito');
      onLoginSuccess();
      onClose();
    } catch (err: any) {
      const code = err.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Email o contraseña incorrectos.');
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Aguardá unos minutos.');
      } else {
        setError(err.message || 'Error al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>Acceso revendedores y administración</h2>
            <p className="muted">Ingresá con tu cuenta autorizada para ver precios mayoristas o gestionar el catálogo.</p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 10, fontWeight: 600 }}>
              {error}
            </p>
          )}

          <div className="row-btn">
            <button type="submit" className="primary" disabled={loading}>
              <Lock size={14} style={{ marginRight: 6 }} />
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
            <button type="button" className="outline" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
