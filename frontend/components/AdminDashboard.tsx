import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, BookOpen, BarChart3, RefreshCw, AlertCircle, Terminal,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabaseClient';
import { useOfferMetadata } from '../lib/useOfferMetadata';
import TeacherDashboard from './TeacherDashboard';
import type { AdminProfile } from '../lib/useAdminProfile';
import type { ProfessorContext } from '../lib/useUserRole';
import { ALL_FACULTIES } from '../lib/userRoles';

type Tab = 'stats' | 'users' | 'offer';

interface AdminDashboardProps {
  profile: AdminProfile;
}

interface FacultyStat {
  faculty: string;
  student_count: number;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AdminDashboard({ profile }: AdminDashboardProps) {
  const [tab, setTab] = useState<Tab>('stats');
  const { metadata, isLoading: metaLoading, reload: reloadMeta } = useOfferMetadata();

  const [facultyStats, setFacultyStats] = useState<FacultyStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const professorView: ProfessorContext = {
    email: profile.email,
    name: profile.name,
    faculty: 'CMP',
    faculties: [...ALL_FACULTIES],
  };

  const loadFacultyStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const { data, error } = await supabase.rpc('get_faculty_registration_stats');
      if (error) throw new Error(error.message);
      setFacultyStats((data ?? []) as FacultyStat[]);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Error al cargar estadísticas');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'users') loadFacultyStats();
  }, [tab, loadFacultyStats]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'stats', label: 'Predicción y demanda', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'Estudiantes registrados', icon: <Users className="w-4 h-4" /> },
    { id: 'offer', label: 'Oferta', icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de administración</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {profile.name ?? profile.email}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Profesores: correo <code className="text-blue-600">@usfq.edu.ec</code> · Facultad desde progreso de malla
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab(t.id)}
              className="gap-1.5"
            >
              {t.icon}
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {tab === 'stats' && (
        <TeacherDashboard
          profile={professorView}
          facultyOptions={[...ALL_FACULTIES]}
          title="Vista de facultad (admin)"
        />
      )}

      {tab === 'users' && (
        <Card className="p-5 dark:bg-gray-800 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Estudiantes registrados por facultad
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Cuentas con progreso guardado en la malla (desde <code>user_progress</code>).
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadFacultyStats} disabled={loadingStats}>
              <RefreshCw className={`w-4 h-4 ${loadingStats ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {statsError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              {statsError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Facultad</th>
                  <th className="px-4 py-3 font-medium text-right">Estudiantes con malla</th>
                </tr>
              </thead>
              <tbody>
                {facultyStats.map((row) => (
                  <tr key={row.faculty} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">
                      {row.faculty}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {row.student_count}
                    </td>
                  </tr>
                ))}
                {facultyStats.length === 0 && !loadingStats && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-gray-500">
                      Sin registros todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'offer' && (
        <Card className="p-5 dark:bg-gray-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Oferta académica</h3>
            <Button variant="outline" size="sm" onClick={reloadMeta} disabled={metaLoading}>
              <RefreshCw className={`w-4 h-4 ${metaLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Periodo actual</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {metadata?.current_period_label ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Código de periodo</dt>
              <dd className="font-medium text-gray-900 dark:text-white font-mono">
                {metadata?.current_period_code ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Última actualización</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {formatDate(metadata?.last_scraped_at)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Último rollover</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {formatDate(metadata?.last_rollover_at)}
              </dd>
            </div>
          </dl>

          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Terminal className="w-4 h-4" />
              Comandos locales (offer-scraper)
            </div>
            <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
{`python scrape.py backfill --only 202510,202420
python scrape.py rollover --period-code 202610 --period "Primer Semestre 2026/2027" --yes`}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}
