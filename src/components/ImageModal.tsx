import React from 'react';
import { X } from 'lucide-react';

interface ImageModalProps {
  image: string | null;
  title: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ image, title, onClose }) => {
  if (!image) return null;

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="zoom-card" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Cerrar imagen">
          <X size={28} />
        </button>
        <img src={image} alt={title} />
        <p>{title}</p>
      </div>
    </div>
  );
};
