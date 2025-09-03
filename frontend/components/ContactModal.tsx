import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, Mail, Coffee, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ContactModalProps {
  onClose: () => void;
}

export default function ContactModal({ onClose }: ContactModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    university: '',
    career: '',
    message: '',
    buyMeCoffee: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const form = new FormData();
      form.append('name', formData.name);
      form.append('email', formData.email);
      form.append('university', formData.university);
      form.append('career', formData.career);
      form.append('message', formData.message);
      form.append('buyMeCoffee', formData.buyMeCoffee ? 'Sí' : 'No');
      form.append('_subject', `Solicitud de Malla Curricular - ${formData.career}`);
      form.append('_captcha', 'false');
      form.append('_next', window.location.origin + '/?submitted=true');

      const response = await fetch('https://formsubmit.co/joshxreinoso@gmail.com', {
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="university" className="dark:text-gray-200">Universidad *</Label>
              <Input
                id="university"
                name="university"
                value={formData.university}
                onChange={handleInputChange}
                required
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Ej: Universidad San Francisco de Quito"
              />
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
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
