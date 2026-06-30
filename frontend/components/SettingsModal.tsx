import React, { useCallback, useEffect, useState } from 'react';
import {
  X, Settings, KeyRound, Trash2, BookOpen, AlertTriangle, Loader2, GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useSupabaseAuth } from '@/lib/auth';
import { useOfferMetadata } from '@/lib/useOfferMetadata';
import { usePlannerSettings } from '@/lib/usePlannerSettings';
import { supabase } from '@/lib/supabaseClient';
import {
  loadCurriculumProgressSummaries,
  cleanupLocalProgressArtifacts,
  type CurriculumProgressSummary,
} from '@/lib/curriculumProgressSummary';
import {
  deleteProgressForCurriculum,
  loadAllUserProgress,
} from '@/lib/supabaseProgress';
import { countCurriculaWithActivity } from '@/lib/aggregatedPlanning';
import { emitProgressChanged } from '@/lib/progressEvents';

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
  const {
    includeOtherMallas,
    isLoading: plannerSettingsLoading,
    isSaving: plannerSettingsSaving,
    setIncludeOtherMallas,
  } = usePlannerSettings();

  const [deleteStep, setDeleteStep] = useState<0 | 1>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [careerSummaries, setCareerSummaries] = useState<CurriculumProgressSummary[]>([]);
  const [careersLoading, setCareersLoading] = useState(false);
  const [multiMallaAvailable, setMultiMallaAvailable] = useState(false);
  const [confirmDeleteCareerId, setConfirmDeleteCareerId] = useState<string | null>(null);
  const [deletingCareerId, setDeletingCareerId] = useState<string | null>(null);
  const [careerDeleteError, setCareerDeleteError] = useState<string | null>(null);

  const refreshCareerSummaries = useCallback(async () => {
    if (!user?.id) {
      setCareerSummaries([]);
      setMultiMallaAvailable(false);
      return;
    }
    setCareersLoading(true);
    try {
      const [summaries, rows] = await Promise.all([
        loadCurriculumProgressSummaries(user.id),
        loadAllUserProgress(user.id),
      ]);
      setCareerSummaries(summaries);
      setMultiMallaAvailable(countCurriculaWithActivity(rows) >= 2);
    } catch (err) {
      console.error('Error loading career summaries:', err);
      setCareerSummaries([]);
      setMultiMallaAvailable(false);
    } finally {
      setCareersLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    void refreshCareerSummaries();
  }, [open, refreshCareerSummaries]);

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

  const handleDeleteCareerProgress = async (curriculumId: string) => {
    if (!user?.id) return;
    if (confirmDeleteCareerId !== curriculumId) {
      setConfirmDeleteCareerId(curriculumId);
      setCareerDeleteError(null);
      return;
    }

    setDeletingCareerId(curriculumId);
    setCareerDeleteError(null);
    try {
      await deleteProgressForCurriculum(user.id, curriculumId);
      await cleanupLocalProgressArtifacts(curriculumId);
      setConfirmDeleteCareerId(null);
      await refreshCareerSummaries();
      emitProgressChanged({ curriculumId });
    } catch (err) {
      setCareerDeleteError(
        err instanceof Error ? err.message : 'No se pudo eliminar el progreso',
      );
    } finally {
      setDeletingCareerId(null);
    }
  };

  const handleClose = () => {
    setDeleteStep(0);
    setDeleteError(null);
    setConfirmDeleteCareerId(null);
    setCareerDeleteError(null);
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
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

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
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

          {/* Career progress */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              Progreso por carrera
            </h3>
            {careersLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando progreso…
              </div>
            ) : careerSummaries.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aún no hay progreso guardado en ninguna malla.
              </p>
            ) : (
              <div className="space-y-3">
                {careerSummaries.map((career) => (
                  <div
                    key={career.curriculumId}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {career.careerName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {career.curriculumLabel}
                          {career.totalCourses > 0
                            ? ` · ${career.completedCount}/${career.totalCourses} materias`
                            : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0">
                        {career.percentComplete}%
                      </span>
                    </div>
                    <Progress value={career.percentComplete} className="h-2" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {career.completedCount} completadas · {career.inProgressCount} cursando ·{' '}
                      {career.plannedCount} planeadas
                    </p>
                    {confirmDeleteCareerId === career.curriculumId && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        ¿Eliminar todo el progreso de esta carrera? No se puede deshacer.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deletingCareerId === career.curriculumId}
                      onClick={() => handleDeleteCareerProgress(career.curriculumId)}
                      className="w-full gap-2 justify-start text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                    >
                      {deletingCareerId === career.curriculumId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      {confirmDeleteCareerId === career.curriculumId
                        ? 'Confirmar eliminación'
                        : 'Eliminar progreso de esta carrera'}
                    </Button>
                    {confirmDeleteCareerId === career.curriculumId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setConfirmDeleteCareerId(null)}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {careerDeleteError && (
              <p className="text-sm text-red-600 dark:text-red-400">{careerDeleteError}</p>
            )}
          </section>

          {/* Planner preference */}
          {multiMallaAvailable && (
            <section className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Planificador de horario
              </h3>
              <label className="flex items-start gap-2 cursor-pointer rounded-md border border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2">
                <Checkbox
                  checked={includeOtherMallas}
                  disabled={plannerSettingsLoading || plannerSettingsSaving}
                  onCheckedChange={(checked) => {
                    void setIncludeOtherMallas(checked === true);
                  }}
                  className="mt-0.5"
                />
                <span className="text-sm text-blue-900 dark:text-blue-100">
                  Incluir materias planeadas de mis otras carreras
                  <span className="block text-xs font-normal text-blue-700/90 dark:text-blue-200/80 mt-0.5">
                    Combina doble carrera o minor en un solo horario (usa materias
                    en modo <strong>Planeadas</strong>). Si una materia está planeada
                    en ambas mallas, se usa la de la malla activa.
                  </span>
                </span>
              </label>
            </section>
          )}

          {/* Offer info */}
          <section className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
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
