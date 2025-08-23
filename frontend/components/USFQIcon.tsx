import React, { useState, useEffect } from 'react';

export default function USFQIcon() {
  const [imageError, setImageError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    // Construir la URL dinámicamente para evitar que Vite la procese durante el build
    const logoPath = `/Img/USFQ_Logo.svg`;
    setImageSrc(logoPath);
  }, []);

  return (
    <div className="fixed top-4 left-8 z-10">
      <div className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-blue-200">
        {!imageError && imageSrc ? (
          <img 
            src={imageSrc}
            alt="USFQ Logo" 
            className="w-12 h-12 object-contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="text-xs font-bold text-blue-600 text-center leading-tight">
            USFQ<br/>🐉
          </div>
        )}
      </div>
    </div>
  );
}
