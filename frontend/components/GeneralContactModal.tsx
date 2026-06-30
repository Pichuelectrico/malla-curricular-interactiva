import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  Mail,
  Send,
  AlertTriangle,
  Briefcase,
  MessageCircle,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type ContactReason = "problema" | "servicios" | "contacto";

interface GeneralContactModalProps {
  onClose: () => void;
}

const REASONS: {
  id: ContactReason;
  label: string;
  description: string;
  icon: React.ReactNode;
  subject: string;
}[] = [
  {
    id: "problema",
    label: "Reportar un problema",
    description: "Algo no funciona o encontraste un error en la app.",
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    subject: "Reporte de problema - Malla Curricular",
  },
  {
    id: "servicios",
    label: "Contratar mis servicios",
    description:
      "Desarrollo web, Apps, Workflows, automatizaciones, u otros proyectos.",
    icon: <Briefcase className="w-5 h-5 text-blue-500" />,
    subject: "Solicitud de servicios",
  },
  {
    id: "contacto",
    label: "Solo contactarme",
    description: "Un mensaje general, sugerencia o consulta.",
    icon: <MessageCircle className="w-5 h-5 text-green-500" />,
    subject: "Contacto general - Malla Curricular",
  },
];

export default function GeneralContactModal({
  onClose,
}: GeneralContactModalProps) {
  const [step, setStep] = useState<"select" | "form">("select");
  const [selectedReason, setSelectedReason] = useState<ContactReason | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const reasonConfig = REASONS.find((r) => r.id === selectedReason);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectReason = (reason: ContactReason) => {
    setSelectedReason(reason);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonConfig) return;
    setIsSubmitting(true);

    try {
      const form = new FormData();
      form.append("name", formData.name);
      form.append("email", formData.email);
      form.append("message", formData.message);
      form.append("motivo", reasonConfig.label);
      form.append("_subject", reasonConfig.subject);
      form.append("_captcha", "false");

      const response = await fetch(
        "https://formsubmit.co/ajax/pichuelectrico@gmail.com",
        {
          method: "POST",
          headers: { Accept: "application/json" },
          body: form,
        },
      );

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        toast({
          title: "¡Mensaje enviado!",
          description: "Te responderemos lo más pronto posible.",
        });
        onClose();
      } else {
        throw new Error(
          (data && typeof data.message === "string" ? data.message : null) ??
            "Error en el envío",
        );
      }
    } catch (error) {
      console.error("Error sending form:", error);
      toast({
        title: "Error al enviar",
        description:
          "Hubo un problema al enviar tu mensaje. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-lg dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-xl font-bold text-gray-800 dark:text-white">
                Contáctame
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {step === "select" ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                ¿En qué te puedo ayudar?
              </p>
              {REASONS.map((reason) => (
                <button
                  key={reason.id}
                  onClick={() => handleSelectReason(reason.id)}
                  className="w-full flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                >
                  {reason.icon}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {reason.label}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {reason.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep("select")}
                className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Cambiar motivo
              </button>

              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {reasonConfig?.label}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name" className="dark:text-gray-200">
                    Nombre *
                  </Label>
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
                  <Label htmlFor="email" className="dark:text-gray-200">
                    Email *
                  </Label>
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
                <Label htmlFor="message" className="dark:text-gray-200">
                  Mensaje{selectedReason === "problema" ? " *" : ""}
                </Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  required={selectedReason === "problema"}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
                  placeholder="Escribe tu mensaje aquí..."
                  rows={4}
                />
              </div>

              <div className="flex gap-2 pt-2">
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
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enviando...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Enviar
                    </div>
                  )}
                </Button>
              </div>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Te responderemos lo más pronto posible.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
