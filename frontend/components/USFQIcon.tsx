import React, { useState, useEffect } from 'react';
import { getAssetPath } from '@/lib/assets';

export default function USFQIcon() {
  const [imageError, setImageError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    const logoPath = getAssetPath('USFQ_Logo.svg');
    setImageSrc(logoPath);
  }, []);

  return (
    <div className="fixed top-2 left-2 z-10">
      <div className="w-11 h-11 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center border-2 border-blue-200 dark:border-blue-600 transition-colors duration-300">
        {!imageError && imageSrc ? (
          <img 
            src={imageSrc}
            alt="USFQ Logo" 
            className="w-12 h-12 object-contain dark:[filter:brightness(0)_saturate(100%)_invert(13%)_sepia(94%)_saturate(7482%)_hue-rotate(356deg)_brightness(91%)_contrast(135%)]"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="text-xs font-bold text-blue-600 dark:text-blue-400 text-center leading-tight">
            USFQ<br/>🐉
          </div>
        )}
      </div>
    </div>
  );
}
