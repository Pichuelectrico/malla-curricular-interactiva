import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, Mail, BookOpen, Plus, Pencil, Trash2, RefreshCw, AlertCircle, Terminal,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '../lib/supabaseClient';
import { useOfferMetadata } from '../lib/useOfferMetadata';
import type { AdminProfile } from '../lib/useAdminProfile';

const FACULTIES = [
  'CMP', 'MAT', 'MAC', 'LIT', 'ECN', 'FIS', 'ADM', 'JUR', 'MED', 'PSI',
  'ARQ', 'COM', 'FIN', 'EDU', 'POL', 'NUT', 'VET', 'ODT',
];

const MAILTO_BCC_LIMIT = 50;

interface TeacherRow {
  id: string;
  email: string;
  name: string | null;
  faculty: string;
  departments: string[];
}

type Tab = 'teachers' | 'messages' | 'offer';

interface AdminDashboardProps {
  profile: AdminProfile;
}

async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-teachers', { body });
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AdminDashboard({ profile }: AdminDashboardProps) {
  const [tab, setTab] = useState<Tab>('teachers');
  const { metadata, isLoading: metaLoading, reload: reloadMeta } = useOfferMetadata();

  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formFaculty, setFormFaculty] = useState('CMP');
  const [formDepartments, setFormDepartments] = useState('');

  const [msgFaculty, setMsgFaculty] = useState('');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [studentEmails, setStudentEmails] = useState<string[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);

  const loadTeachers = useCallback(async () => {
    setLoadingTeachers(true);
    setTeacherError(null);
    try {
      const data = await invokeAdmin<{ teachers: TeacherRow[] }>({ action: 'list' });
      setTeachers(data.teachers ?? []);
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'Error al cargar profesores');
    } finally {
      setLoadingTeachers(false);
    }
  }, []);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const openCreate = () => {
    setEditing(null);
    setFormEmail('');
    setFormName('');
    setFormFaculty('CMP');
    setFormDepartments('');
    setFormOpen(true);
  };

  const openEdit = (t: TeacherRow) => {
    setEditing(t);
    setFormEmail(t.email);
    setFormName(t.name ?? '');
    setFormFaculty(t.faculty);
    setFormDepartments((t.departments ?? []).join(', '));
    setFormOpen(true);
  };

  const saveTeacher = async () => {
    const departments = formDepartments
      .split(',')
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean);

    try {
      if (editing) {
        await invokeAdmin({
          action: 'update',
          id: editing.id,
          email: formEmail.trim(),
          name: formName.trim() || null,
          faculty: formFaculty,
          departments,
        });
      } else {
        await invokeAdmin({
          action: 'create',
          email: formEmail.trim(),
          name: formName.trim() || null,
          faculty: formFaculty,
          departments,
        });
      }
      setFormOpen(false);
      await loadTeachers();
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const deleteTeacher = async (id: string) => {
    if (!confirm('¿Eliminar este perfil de profesor?')) return;
    try {
      await invokeAdmin({ action: 'delete', id });
      await loadTeachers();
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const loadStudents = async () => {
    setLoadingStudents(true);
    setStudentError(null);
    try {
      const { data, error } = await supabase.functions.invoke<{ emails: string[]; count: number }>(
        'admin-list-students',
        { body: msgFaculty ? { faculty: msgFaculty } : {} },
      );
      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error(String((data as { error: string }).error));
      const emails = data?.emails ?? [];
      setStudentEmails(emails);
      setSelectedEmails(new Set());
    } catch (err) {
      setStudentError(err instanceof Error ? err.message : 'Error al cargar alumnos');
      setStudentEmails([]);
      setSelectedEmails(new Set());
    } finally {
      setLoadingStudents(false);
    }
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const selectAllStudents = () => setSelectedEmails(new Set(studentEmails));
  const deselectAllStudents = () => setSelectedEmails(new Set());

  const openMailto = () => {
    const recipients = studentEmails.filter((e) => selectedEmails.has(e));
    if (recipients.length === 0) {
      setStudentError('Selecciona al menos un destinatario de la lista.');
      return;
    }
    const bcc = recipients.slice(0, MAILTO_BCC_LIMIT).join(',');
    const params = new URLSearchParams();
    if (bcc) params.set('bcc', bcc);
    if (msgSubject.trim()) params.set('subject', msgSubject.trim());
    if (msgBody.trim()) params.set('body', msgBody.trim());
    window.open(`mailto:?${params.toString()}`, '_blank');
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'teachers', label: 'Profesores', icon: <Users className="w-4 h-4" /> },
    { id: 'messages', label: 'Mensajes', icon: <Mail className="w-4 h-4" /> },
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

      {tab === 'teachers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Profesores</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadTeachers} disabled={loadingTeachers}>
                <RefreshCw className={`w-4 h-4 ${loadingTeachers ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" onClick={openCreate} className="gap-1.5">
                <Plus className="w-4 h-4" />
                Agregar
              </Button>
            </div>
          </div>

          {teacherError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              {teacherError}
            </div>
          )}

          {formOpen && (
            <Card className="p-4 dark:bg-gray-800 space-y-3">
              <h4 className="font-medium text-gray-900 dark:text-white">
                {editing ? 'Editar profesor' : 'Nuevo profesor'}
              </h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Correo</label>
                  <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Facultad principal</label>
                  <select
                    value={formFaculty}
                    onChange={(e) => setFormFaculty(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {FACULTIES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Departamentos (separados por coma)
                  </label>
                  <Input
                    placeholder="CMP, MAT"
                    value={formDepartments}
                    onChange={(e) => setFormDepartments(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveTeacher}>Guardar</Button>
                <Button size="sm" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden dark:bg-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Correo</th>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Facultad</th>
                    <th className="px-4 py-3 font-medium">Departamentos</th>
                    <th className="px-4 py-3 font-medium w-24" />
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{t.email}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.name ?? '—'}</td>
                      <td className="px-4 py-3">{t.faculty}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {(t.departments ?? []).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 text-gray-500 hover:text-blue-600">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteTeacher(t.id)} className="p-1.5 text-gray-500 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {teachers.length === 0 && !loadingTeachers && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No hay profesores registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'messages' && (
        <Card className="p-5 dark:bg-gray-800 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Mensaje a alumnos</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Carga la lista, marca los alumnos que recibirán el correo y luego abre mailto.
            Solo los seleccionados irán en BCC (máx. {MAILTO_BCC_LIMIT}).
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Filtrar por facultad (opcional)</label>
              <select
                value={msgFaculty}
                onChange={(e) => {
                  setMsgFaculty(e.target.value);
                  setStudentEmails([]);
                  setSelectedEmails(new Set());
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos los alumnos registrados</option>
                {FACULTIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={loadStudents} disabled={loadingStudents} className="gap-1.5">
                <RefreshCw className={`w-4 h-4 ${loadingStudents ? 'animate-spin' : ''}`} />
                Cargar destinatarios
              </Button>
            </div>
          </div>

          {studentError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              {studentError}
            </div>
          )}

          {studentEmails.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {selectedEmails.size} de {studentEmails.length} seleccionado(s)
                  {selectedEmails.size > MAILTO_BCC_LIMIT && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' '}— solo los primeros {MAILTO_BCC_LIMIT} irán en BCC
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAllStudents}>
                    Seleccionar todos
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={deselectAllStudents}>
                    Quitar selección
                  </Button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {studentEmails.map((email) => (
                  <label
                    key={email}
                    className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmails.has(email)}
                      onChange={() => toggleEmail(email)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-800 dark:text-gray-200 truncate">{email}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Asunto</label>
            <Input value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Mensaje</label>
            <textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <Button
            onClick={openMailto}
            className="gap-1.5"
            disabled={selectedEmails.size === 0}
          >
            <Mail className="w-4 h-4" />
            Abrir correo (mailto)
          </Button>
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
{`# Backfill periodos históricos
python scrape.py backfill --only 202510,202420

# Rollover al nuevo semestre (dry-run primero)
python scrape.py rollover --period-code 202520 --period "Segundo Semestre 2025/2026"
python scrape.py rollover --period-code 202520 --period "Segundo Semestre 2025/2026" --yes`}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}
