import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ExternalLink } from 'lucide-react';

interface DonationModalProps {
  onClose: () => void;
}

export default function DonationModal({ onClose }: DonationModalProps) {
  const handleDonateClick = () => {
    window.open('https://buymeacoffee.com/yourhandle', '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold text-gray-800">¡Apoya este proyecto!</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Dragon Image */}
          <div className="flex justify-center">
            <div className="w-32 h-32 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center shadow-lg">
              <div className="text-6xl">🐉</div>
            </div>
          </div>
          
          {/* Message */}
          <div className="text-center space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">
              Todo apoyo se agradece
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
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
            <p className="text-xs text-gray-500">
              Tu apoyo ayuda a mantener esta herramienta gratuita y actualizada
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
