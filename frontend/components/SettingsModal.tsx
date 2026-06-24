import React, { useState, useEffect } from 'react';
import { X, Shield, Eye, EyeOff, Trash2, CheckCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STORAGE_KEY = 'usfq_credentials';

interface USFQCredentials {
  username: string;
  password: string;
}

export function getUSFQCredentials(): USFQCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);

  useEffect(() => {
    if (open) {
      const creds = getUSFQCredentials();
      if (creds) {
        setUsername(creds.username);
        setPassword(creds.password);
        setHasCredentials(true);
      } else {
        setUsername('');
        setPassword('');
        setHasCredentials(false);
      }
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    if (!username.trim() || !password.trim()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: username.trim(), password }));
    setHasCredentials(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleDelete = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUsername('');
    setPassword('');
    setHasCredentials(false);
    setSaved(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Configuración</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Privacy notice */}
          <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <p className="font-medium">Tu privacidad está protegida</p>
              <p className="text-blue-700 dark:text-blue-300">
                Tus credenciales se almacenan <strong>únicamente en tu navegador</strong> y se usan solo para consultar
                la oferta de cursos de la USFQ. No se envían a ningún servidor externo ni se comparten con nadie.
              </p>
            </div>
          </div>

          {/* Credentials section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Credenciales USFQ
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Ingresa tus credenciales del portal USFQ para que el planificador pueda consultar la disponibilidad
                de cursos en el catálogo de oferta.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  Usuario / Correo USFQ
                </label>
                <Input
                  type="text"
                  placeholder="usuario@usfq.edu.ec"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  Contraseña USFQ
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Tu contraseña del portal"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-10 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!username.trim() || !password.trim()}
              className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saved ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Guardado
                </>
              ) : (
                'Guardar credenciales'
              )}
            </Button>

            {hasCredentials && (
              <Button
                variant="outline"
                onClick={handleDelete}
                className="gap-2 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
                Borrar
              </Button>
            )}
          </div>

          {hasCredentials && !saved && (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Credenciales guardadas en este dispositivo
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
