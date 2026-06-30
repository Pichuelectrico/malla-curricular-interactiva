import React from 'react';
import AdminViewToggle, { type AdminViewMode } from './AdminViewToggle';

interface HeaderNavProps {
  showAdmin: boolean;
  adminViewMode: AdminViewMode;
  onAdminViewChange: (mode: AdminViewMode) => void;
  onOpenTutoriales: () => void;
  onOpenContact: () => void;
  onOpenSobrepaso: () => void;
  authButton: React.ReactNode;
}

const navButtonClass =
  'px-2 sm:px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors whitespace-nowrap';

export default function HeaderNav({
  showAdmin,
  adminViewMode,
  onAdminViewChange,
  onOpenTutoriales,
  onOpenContact,
  onOpenSobrepaso,
  authButton,
}: HeaderNavProps) {
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <button onClick={onOpenTutoriales} className={navButtonClass}>
        Tutoriales
      </button>
      <button onClick={onOpenContact} className={navButtonClass}>
        Contáctame
      </button>
      <button onClick={onOpenSobrepaso} className={navButtonClass}>
        Sobrepaso
      </button>
      {showAdmin && (
        <AdminViewToggle mode={adminViewMode} onChange={onAdminViewChange} />
      )}
      {authButton}
    </div>
  );
}
