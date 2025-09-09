import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

interface Student {
  id: string;
  email: string;
  name: string | null;
  current_semester: number;
}

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);

export default function AdminPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [forceValue, setForceValue] = useState<string>('');
  const [importCareer, setImportCareer] = useState<string>('CMP');
  const [importJson, setImportJson] = useState<string>('');

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    }
  });

  const isAdmin = useMemo(() => {
    const email = me?.email?.toLowerCase() ?? '';
    return ADMIN_EMAILS.includes(email);
  }, [me]);

  const { data: globalSem = { current_semester: 0 } } = useQuery({
    queryKey: ['globalSemester'],
    queryFn: async () => api.get('/admin/semester'),
    enabled: isAdmin,
  });

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ['adminStudents'],
    queryFn: async () => api.get('/admin/students'),
    enabled: isAdmin,
  });

  const advanceSemester = useMutation({
    mutationFn: async () => api.post('/admin/semester/advance'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['globalSemester'] });
      qc.invalidateQueries({ queryKey: ['adminStudents'] });
      toast({ title: 'Semestre avanzado', description: 'Se promovieron cursos hasta 16 créditos por estudiante.' });
    },
    onError: (e: any) => toast({ title: 'Error al avanzar semestre', description: e?.message ?? String(e) }),
  });

  const setSemester = useMutation({
    mutationFn: async (value: number) => api.post(`/admin/semester/set?value=${value}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['globalSemester'] });
      toast({ title: 'Semestre establecido' });
    },
    onError: (e: any) => toast({ title: 'Error al establecer semestre', description: e?.message ?? String(e) }),
  });

  const resetStudent = useMutation({
    mutationFn: async (studentId: string) => api.post(`/admin/students/${studentId}/reset`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminStudents'] });
      toast({ title: 'Progreso reiniciado' });
    },
    onError: (e: any) => toast({ title: 'Error al reiniciar', description: e?.message ?? String(e) }),
  });

  const recomputeSemester = useMutation({
    mutationFn: async (studentId: string) => api.post(`/admin/students/${studentId}/recompute-semester`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminStudents'] });
      toast({ title: 'Semestre recalculado' });
    },
    onError: (e: any) => toast({ title: 'Error al recalcular', description: e?.message ?? String(e) }),
  });

  const importCareerJson = useMutation({
    mutationFn: async ({ career, json }: { career: string; json: string }) => api.post(`/import/career/${career}`, json, { 'Content-Type': 'application/json' }),
    onSuccess: () => toast({ title: 'Malla importada', description: `Carrera ${importCareer} actualizada.` }),
    onError: (e: any) => toast({ title: 'Error importando malla', description: e?.message ?? String(e) }),
  });

  const fetchEnrollmentEstimate = useMutation({
    mutationFn: async (courseIds: string[]) => api.get(`/metrics/enrollment-estimate?${courseIds.map((c) => `course_ids=${encodeURIComponent(c)}`).join('&')}`),
  });

  const fetchPathAdherence = useMutation({
    mutationFn: async (careerId: string) => api.get(`/metrics/path-adherence?career_id=${encodeURIComponent(careerId)}`),
  });

  const fetchTrendSuggestions = useMutation({
    mutationFn: async (careerId: string) => api.get(`/metrics/trend-suggestions?career_id=${encodeURIComponent(careerId)}`),
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">Debes iniciar sesión con un email administrador para ver este panel.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      <h1 className="text-3xl font-bold">Panel Administrativo</h1>

      {/* Semestres */}
      <Card>
        <CardHeader>
          <CardTitle>Control de Semestres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>Semestre global actual: <span className="font-semibold">{globalSem.current_semester}</span></div>
            <Button onClick={() => advanceSemester.mutate()} disabled={advanceSemester.isPending}>
              {advanceSemester.isPending ? 'Procesando...' : 'Avanzar 1 semestre'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" placeholder="Nuevo semestre" value={forceValue} onChange={(e) => setForceValue(e.target.value)} className="w-40" />
            <Button onClick={() => forceValue && setSemester.mutate(Number(forceValue))} disabled={!forceValue}>Forzar valor</Button>
          </div>
        </CardContent>
      </Card>

      {/* Estudiantes */}
      <Card>
        <CardHeader>
          <CardTitle>Estudiantes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Email</th>
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Semestre</th>
                  <th className="p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-gray-100/50 dark:hover:bg-gray-800/50">
                    <td className="p-2">{s.email}</td>
                    <td className="p-2">{s.name ?? '—'}</td>
                    <td className="p-2">{s.current_semester}</td>
                    <td className="p-2 space-x-2">
                      <Button variant="outline" size="sm" onClick={() => resetStudent.mutate(s.id)}>Reiniciar</Button>
                      <Button variant="outline" size="sm" onClick={() => recomputeSemester.mutate(s.id)}>Recalcular</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Importar Mallas */}
      <Card>
        <CardHeader>
          <CardTitle>Importación de Mallas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Nombre carrera (p.ej. CMP)" value={importCareer} onChange={(e) => setImportCareer(e.target.value)} className="w-48" />
            <Button onClick={() => importCareerJson.mutate({ career: importCareer, json: importJson })} disabled={!importJson}>
              Importar JSON
            </Button>
          </div>
          <textarea
            className="w-full min-h-[180px] p-2 rounded border bg-white dark:bg-gray-950"
            placeholder="Pega aquí el JSON de la malla"
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Puedes abrir los archivos existentes en `frontend/data/` y copiarlos aquí para importarlos al backend.</p>
        </CardContent>
      </Card>

      {/* Métricas y Predicciones */}
      <Card>
        <CardHeader>
          <CardTitle>Métricas y Predicciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={() => fetchEnrollmentEstimate.mutate(['CMP3002', 'CMP4002'])}>Demostración: Estimación de inscripción</Button>
            <Button onClick={() => fetchPathAdherence.mutate('00000000-0000-0000-0000-000000000000')}>Demostración: Adhesión de ruta</Button>
            <Button onClick={() => fetchTrendSuggestions.mutate('00000000-0000-0000-0000-000000000000')}>Demostración: Tendencias</Button>
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <pre className="bg-black/80 text-green-300 p-2 rounded min-h-[120px] overflow-auto">{JSON.stringify(fetchEnrollmentEstimate.data ?? {}, null, 2)}</pre>
            <pre className="bg-black/80 text-green-300 p-2 rounded min-h-[120px] overflow-auto">{JSON.stringify(fetchPathAdherence.data ?? {}, null, 2)}</pre>
            <pre className="bg-black/80 text-green-300 p-2 rounded min-h-[120px] overflow-auto">{JSON.stringify(fetchTrendSuggestions.data ?? {}, null, 2)}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
