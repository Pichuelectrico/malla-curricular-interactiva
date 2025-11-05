import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ExternalLink } from 'lucide-react';
import { qrCodeAsset } from '../lib/assets';

interface DonationModalProps {
  onClose: () => void;
}

export default function DonationModal({ onClose }: DonationModalProps) {
  const handleDonateClick = () => {
    window.open('https://buymeacoffee.com/yourhandle', '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold text-gray-800 dark:text-white">¡Apoya este proyecto!</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* QR Code Image */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <img 
                src={qrCodeAsset} 
                alt="QR Code para donaciones" 
                className="w-48 h-48 object-contain rounded-xl"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  const container = img.parentElement as HTMLElement;
                  container.innerHTML = `
                    <div class="w-48 h-48 bg-gradient-to-br from-purple-400 to-blue-500 rounded-xl flex items-center justify-center">
                      <div class="text-8xl">🐉</div>
                    </div>
                  `;
                }}
              />
            </div>
          </div>
          
          {/* Message */}
          <div className="text-center space-y-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Todo apoyo se agradece
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              Si esta herramienta te ha sido útil para planificar tu carrera universitaria, 
              considera apoyar su desarrollo y mantenimiento. ¡Cada contribución cuenta!
            </p>
          </div>

          {/* Donation Button */}
          <div className="flex justify-center">
            <Button 
              onClick={handleDonateClick}
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Buy Me a Coffee ☕
            </Button>
          </div>

          {/* Additional message */}
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tu apoyo ayuda a mantener esta herramienta gratuita y actualizada
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
