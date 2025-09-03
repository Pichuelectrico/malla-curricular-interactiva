import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, Mail, Coffee, Send, Upload, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ContactModalProps {
  onClose: () => void;
}

export default function ContactModal({ onClose }: ContactModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    career: '',
    message: '',
    buyMeCoffee: false
  });
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const newValue = isCheckbox ? (e.target as HTMLInputElement).checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Si activa el checkbox de café, mostrar el modal
    if (name === 'buyMeCoffee' && newValue) {
      setShowCoffeeModal(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPaymentScreenshot(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const form = new FormData();
      form.append('name', formData.name);
      form.append('email', formData.email);
      form.append('career', formData.career);
      form.append('message', formData.message);
      form.append('buyMeCoffee', formData.buyMeCoffee ? 'Sí' : 'No');
      
      if (formData.buyMeCoffee && paymentScreenshot) {
        form.append('paymentScreenshot', paymentScreenshot);
      }
      
      form.append('_subject', `Solicitud de Malla Curricular - ${formData.career}`);
      form.append('_captcha', 'false');
      form.append('_next', window.location.origin + '/?submitted=true');

      const response = await fetch('https://formsubmit.co/c65548cafea3234a171bd1cc680f1e0c', {
        method: 'POST',
        body: form
      });

      if (response.ok) {
        toast({
          title: "¡Solicitud enviada! 📧",
          description: "Te contactaremos pronto para ayudarte con tu malla curricular.",
        });
        onClose();
      } else {
        throw new Error('Error en el envío');
      }
    } catch (error) {
      console.error('Error sending form:', error);
      toast({
        title: "Error al enviar",
        description: "Hubo un problema al enviar tu solicitud. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBuyMeCoffeeClick = () => {
    window.open('https://buymeacoffee.com/yourhandle', '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="flex gap-4 max-w-4xl w-full">
        {/* Formulario principal */}
        <Card className="flex-1 dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <CardTitle className="text-xl font-bold text-gray-800 dark:text-white">
                  Solicita tu Malla
                </CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} className="dark:hover:bg-gray-700">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Coffee className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  ¿Quieres que lo haga más rápido?
                </span>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Si me compras un café ☕, priorizaré tu solicitud y la tendré lista en 24-48 horas.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name" className="dark:text-gray-200">Nombre *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="dark:text-gray-200">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="tu@email.com"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="career" className="dark:text-gray-200">Carrera *</Label>
                <Input
                  id="career"
                  name="career"
                  value={formData.career}
                  onChange={handleInputChange}
                  required
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Ej: Ingeniería en Sistemas"
                />
              </div>

              <div>
                <Label htmlFor="message" className="dark:text-gray-200">Información adicional</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
                  placeholder="Cuéntanos más detalles sobre tu malla curricular, año de plan de estudios, etc."
                  rows={3}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="buyMeCoffee"
                    name="buyMeCoffee"
                    checked={formData.buyMeCoffee}
                    onChange={handleInputChange}
                    className="rounded border-gray-300 dark:border-gray-600 text-yellow-600 focus:ring-yellow-500"
                  />
                  <Label htmlFor="buyMeCoffee" className="text-sm dark:text-gray-200 cursor-pointer">
                    ☕ Sí, quiero comprarte un café para priorizar mi solicitud
                  </Label>
                </div>

                {/* Campo de upload de captura solo si el checkbox está marcado */}
                {formData.buyMeCoffee && (
                  <div className="border-2 border-dashed border-yellow-300 dark:border-yellow-600 rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Coffee className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                        <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          Comprobante de pago del café ☕
                        </span>
                      </div>
                      
                      <div>
                        <Label htmlFor="paymentScreenshot" className="text-sm text-yellow-700 dark:text-yellow-300">
                          Sube una captura de pantalla del pago
                        </Label>
                        <Input
                          id="paymentScreenshot"
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100 dark:file:bg-yellow-900/30 dark:file:text-yellow-300"
                        />
                        {paymentScreenshot && (
                          <div className="flex items-center gap-2 mt-2 text-sm text-green-600 dark:text-green-400">
                            <Upload className="w-4 h-4" />
                            <span>Archivo subido: {paymentScreenshot.name}</span>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Esto nos ayuda a verificar tu pago y priorizar tu solicitud. ¡Gracias por tu apoyo!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Enviando...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Enviar Solicitud
                    </div>
                  )}
                </Button>
              </div>
            </form>

            <div className="text-center pt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Te contactaremos a tu email dentro de 3-5 días hábiles
                {formData.buyMeCoffee && " (24-48 horas con café ☕)"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Modal de Buy Me a Coffee - solo se muestra si el checkbox está marcado */}
        {showCoffeeModal && (
          <Card className="w-80 dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto animate-in slide-in-from-right duration-300">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  <CardTitle className="text-lg font-bold text-gray-800 dark:text-white">
                    ¡Cómprame un café!
                  </CardTitle>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowCoffeeModal(false)} 
                  className="dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* QR Code o imagen de Buy Me a Coffee */}
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-2xl shadow-lg">
                  <img 
                    src="qr-code.png"
                    alt="QR Code para Buy Me a Coffee"
                    className="w-48 h-48 object-contain rounded-xl"
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      const container = img.parentElement as HTMLElement;
                      container.innerHTML = `
                        <div class="w-48 h-48 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center">
                          <div class="text-8xl">☕</div>
                        </div>
                      `;
                    }}
                  />
                </div>
              </div>
              
              {/* Mensaje */}
              <div className="text-center space-y-3">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                  ¡Apóyame con un café!
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                  Tu café me ayuda a mantener este proyecto y a procesar tu solicitud de malla curricular más rápido.
                </p>
              </div>

              {/* Botón para ir a Buy Me a Coffee]
              <div className="flex justify-center">
                <Button 
                  onClick={handleBuyMeCoffeeClick}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105"
                >
                  <div className="flex items-center gap-2">
                    <Coffee className="w-4 h-4" />
                    Buy Me a Coffee
                    <ExternalLink className="w-3 h-3" />
                  </div>
                </Button>
              </div>

              [{/* Instrucciones]
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  📱 Instrucciones:
                </h4>
                <ol className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                  <li>1. Haz clic en "Buy Me a Coffee"</li>
                  <li>2. Completa tu donación</li>
                  <li>3. Toma captura del comprobante</li>
                  <li>4. Súbela en el formulario de la izquierda</li>
                </ol>
              </div> */}

              {/* Mensaje de agradecimiento */}
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ¡Gracias por apoyar este proyecto! 🐉❤️
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
