import React, { useState } from 'react';
import {
  X, Settings, KeyRound, Trash2, BookOpen, AlertTriangle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/lib/auth';
import { useOfferMetadata } from '@/lib/useOfferMetadata';
import { supabase } from '@/lib/supabaseClient';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPasswordReset: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function SettingsModal({
  open,
  onOpenChange,
  onOpenPasswordReset,
}: SettingsModalProps) {
  const { user, signOut } = useSupabaseAuth();
  const { metadata, isLoading: metaLoading } = useOfferMetadata();
  const [deleteStep, setDeleteStep] = useState<0 | 1>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!open) return null;

  const handlePasswordReset = () => {
    onOpenChange(false);
    onOpenPasswordReset();
  };

  const handleDeleteAccount = async () => {
    if (deleteStep === 0) {
      setDeleteStep(1);
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        'auth-delete-account',
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      await signOut();
      onOpenChange(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta');
    } finally {
      setDeleting(false);
      setDeleteStep(0);
    }
  };

  const handleClose = () => {
    setDeleteStep(0);
    setDeleteError(null);
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Configuración</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Account */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cuenta</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{user?.email}</p>
            <Button
              variant="outline"
              onClick={handlePasswordReset}
              className="w-full gap-2 justify-start"
            >
              <KeyRound className="w-4 h-4" />
              Restablecer contraseña
            </Button>
          </section>

          {/* Offer info */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Oferta académica
            </h3>
            {metaLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando…
              </div>
            ) : (
              <dl className="text-sm space-y-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Periodo</dt>
                  <dd className="text-gray-900 dark:text-white text-right">
                    {metadata?.current_period_label ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Código</dt>
                  <dd className="text-gray-900 dark:text-white font-mono">
                    {metadata?.current_period_code ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Última actualización</dt>
                  <dd className="text-gray-900 dark:text-white text-right text-xs">
                    {formatDate(metadata?.last_scraped_at)}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          {/* Delete account */}
          <section className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            {deleteStep === 1 && (
              <div className="flex gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Esta acción es irreversible. Se eliminará tu progreso y tu cuenta.
                </p>
              </div>
            )}
            {deleteError && (
              <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
            )}
            <Button
              variant="outline"
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="w-full gap-2 justify-start text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {deleteStep === 1 ? 'Confirmar eliminación' : 'Eliminar mi cuenta'}
            </Button>
            {deleteStep === 1 && (
              <Button variant="ghost" size="sm" onClick={() => setDeleteStep(0)} className="w-full">
                Cancelar
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
