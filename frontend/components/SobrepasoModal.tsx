import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Unlock, Plus, Trash2, LogIn } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSupabaseAuth } from '../lib/auth';
import { useUserBypassCourses } from '../lib/useUserBypassCourses';

interface SobrepasoModalProps {
  onClose: () => void;
  onOpenAuth: () => void;
}

export default function SobrepasoModal({ onClose, onOpenAuth }: SobrepasoModalProps) {
  const { isSignedIn } = useSupabaseAuth();
  const {
    bypassCourseList,
    isLoading,
    isSaving,
    addBypassCourse,
    removeBypassCourse,
    normalizeCourseCode,
  } = useUserBypassCourses();
  const [inputCode, setInputCode] = useState('');
  const { toast } = useToast();

  const handleAdd = async () => {
    const normalized = normalizeCourseCode(inputCode);
    if (!normalized) {
      toast({
        title: 'Código inválido',
        description: 'Ingresa un código de materia válido, por ejemplo CMP4002.',
        variant: 'destructive',
      });
      return;
    }
    if (bypassCourseList.includes(normalized)) {
      toast({
        title: 'Ya existe',
        description: `${normalized} ya está en tu lista de sobrepaso.`,
        variant: 'destructive',
      });
      return;
    }
    try {
      await addBypassCourse(inputCode);
      setInputCode('');
      toast({ title: 'Agregado', description: `${normalized} se desbloqueará sin prerequisitos.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('Error adding bypass course:', err);
      toast({
        title: 'Error',
        description: message.includes('user_settings')
          ? 'No se pudo guardar. Verifica tu conexión e inténtalo de nuevo.'
          : `No se pudo guardar: ${message}`,
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async (code: string) => {
    try {
      await removeBypassCourse(code);
      toast({ title: 'Eliminado', description: `${code} ya no tiene sobrepaso.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('Error removing bypass course:', err);
      toast({
        title: 'Error',
        description: `No se pudo eliminar: ${message}`,
        variant: 'destructive',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Unlock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <CardTitle className="text-xl font-bold text-gray-800 dark:text-white">
                Sobrepaso
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!isSignedIn ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 mx-auto bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <Unlock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                Sobrepaso solo está disponible para cuentas con sesión iniciada.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Inicia sesión para agregar códigos de materia y desbloquearlas sin cumplir prerequisitos.
              </p>
              <Button
                onClick={() => { onClose(); onOpenAuth(); }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Iniciar sesión
              </Button>
            </div>
          ) : isLoading ? (
            <div className="text-center py-8 text-gray-500">Cargando...</div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Agrega códigos de materia (ej. CMP4002, CMP-4002) para desbloquearlas sin cumplir prerequisitos en cualquier malla donde existan.
              </p>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="courseCode" className="sr-only">Código de materia</Label>
                  <Input
                    id="courseCode"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ej: CMP4002"
                    disabled={isSaving}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={isSaving || !inputCode.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {bypassCourseList.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-sm text-gray-600 dark:text-gray-400">
                    Materias con sobrepaso ({bypassCourseList.length})
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {bypassCourseList.map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium"
                      >
                        {code}
                        <button
                          onClick={() => handleRemove(code)}
                          disabled={isSaving}
                          className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          aria-label={`Eliminar ${code}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-500 text-center py-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  No tienes materias con sobrepaso aún.
                </p>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-500">
                El sobrepaso omite prerequisitos, pero el límite de 16 créditos por semestre sigue aplicando.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
