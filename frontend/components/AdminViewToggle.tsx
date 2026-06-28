import React from 'react';
import { Shield, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type AdminViewMode = 'admin' | 'teacher';

const STORAGE_KEY = 'mci_admin_view';

interface AdminViewToggleProps {
  mode: AdminViewMode;
  onChange: (mode: AdminViewMode) => void;
}

export function loadAdminViewMode(): AdminViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'teacher' ? 'teacher' : 'admin';
  } catch {
    return 'admin';
  }
}

export function saveAdminViewMode(mode: AdminViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export default function AdminViewToggle({ mode, onChange }: AdminViewToggleProps) {
  const isAdminView = mode === 'admin';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onChange(isAdminView ? 'teacher' : 'admin')}
      className="gap-1.5 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      title={isAdminView ? 'Cambiar a vista profesor' : 'Cambiar a panel admin'}
    >
      {isAdminView ? (
        <>
          <GraduationCap className="w-4 h-4" />
          <span className="hidden sm:inline">Vista profesor</span>
        </>
      ) : (
        <>
          <Shield className="w-4 h-4" />
          <span className="hidden sm:inline">Panel admin</span>
        </>
      )}
    </Button>
  );
}
