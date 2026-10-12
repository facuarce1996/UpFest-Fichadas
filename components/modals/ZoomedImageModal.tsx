import React from 'react';

interface ZoomedImageModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export const ZoomedImageModal: React.FC<ZoomedImageModalProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[500] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <img
        src={imageUrl}
        alt="Evidencia ampliada"
        className="max-w-full max-h-[90vh] object-contain rounded-[32px] md:rounded-[40px] shadow-2xl border-4 md:border-8 border-white animate-in zoom-in-95 duration-200"
      />
    </div>
  );
};
