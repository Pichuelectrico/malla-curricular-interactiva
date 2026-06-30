import React, { useState, useRef, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import CurriculumGrid from './components/CurriculumGrid';
import ThemeToggle from './components/ThemeToggle';
import Footer from './components/Footer';
import AuthModal, { type AuthMode } from './components/AuthModal';
import SettingsModal from './components/SettingsModal';
import TeacherDashboard from './components/TeacherDashboard';
import AdminDashboard from './components/AdminDashboard';
import HeaderNav from './components/HeaderNav';
import {
  loadAdminViewMode,
  saveAdminViewMode,
  type AdminViewMode,
} from './components/AdminViewToggle';
import GeneralContactModal from './components/GeneralContactModal';
import SobrepasoModal from './components/SobrepasoModal';
import TutorialsPage from './components/TutorialsPage';
import { AuthProvider, useSupabaseAuth } from './lib/auth';
import { useAdminProfile } from './lib/useAdminProfile';
import { useUserRole } from './lib/useUserRole';
import { ALL_FACULTIES } from './lib/userRoles';
import { trackPageView } from './lib/analytics';
import { Settings, LogOut, ChevronDown, User } from 'lucide-react';

const queryClient = new QueryClient();

interface UserMenuProps {
  onOpenPasswordReset: () => void;
}

function UserMenu({ onOpenPasswordReset }: UserMenuProps) {
  const { user, signOut } = useSupabaseAuth();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      >
        <User className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline truncate max-w-[160px]">{user?.email}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          </div>
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); setSettingsOpen(true); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              Configuración
            </button>
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onOpenPasswordReset={onOpenPasswordReset}
      />
    </div>
  );
}

interface AuthButtonProps {
  onOpenAuth: (mode: AuthMode) => void;
  onOpenPasswordReset: () => void;
}

function AuthButton({ onOpenAuth, onOpenPasswordReset }: AuthButtonProps) {
  const { isSignedIn, isLoading, isPasswordRecovery } = useSupabaseAuth();

  if (isLoading) return null;
  if (isPasswordRecovery) return null;

  if (isSignedIn) {
    return <UserMenu onOpenPasswordReset={onOpenPasswordReset} />;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onOpenAuth('login')}
        className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        Iniciar sesión
      </button>
      <button
        onClick={() => onOpenAuth('signup')}
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Crear cuenta
      </button>
    </div>
  );
}

function AppInner() {
  const { isSignedIn, user, isPasswordRecovery } = useSupabaseAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [adminViewMode, setAdminViewMode] = useState<AdminViewMode>(loadAdminViewMode);
  const [showContact, setShowContact] = useState(false);
  const [showSobrepaso, setShowSobrepaso] = useState(false);
  const [showTutoriales, setShowTutoriales] = useState(false);

  const { adminProfile, isLoading: isAdminLoading } = useAdminProfile(
    isSignedIn ? user?.email ?? null : null,
  );

  const {
    isAdmin,
    isProfessor,
    professorContext,
    isLoading: isRoleLoading,
  } = useUserRole({
    userId: isSignedIn ? user?.id ?? null : null,
    email: isSignedIn ? user?.email ?? null : null,
    adminProfile,
    isAdminLoading,
  });

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const openPasswordReset = () => {
    setAuthMode('forgot');
    setAuthModalOpen(true);
  };

  useEffect(() => {
    if (isPasswordRecovery) {
      setAuthMode('new-password');
      setAuthModalOpen(true);
    }
  }, [isPasswordRecovery]);

  const showAdmin = isSignedIn && isAdmin;
  const showProfessor = isSignedIn && !isAdmin && isProfessor && professorContext !== null;

  const handleAdminViewChange = (mode: AdminViewMode) => {
    setAdminViewMode(mode);
    saveAdminViewMode(mode);
  };

  const adminProfessorContext =
    showAdmin && adminProfile
      ? {
          email: adminProfile.email,
          name: adminProfile.name,
          faculty: 'CMP' as const,
          faculties: [...ALL_FACULTIES],
        }
      : null;

  useEffect(() => {
    const checkHash = () => {
      const raw = window.location.hash.replace(/^#/, '').replace(/^\/+/, '');
      setShowTutoriales(raw === 'tutoriales' || raw.startsWith('tutoriales/'));
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  useEffect(() => {
    if (isRoleLoading) return;
    if (isAdmin) return;

    if (showProfessor) {
      trackPageView('teacher');
    } else {
      trackPageView('curriculum');
    }
  }, [isRoleLoading, isAdmin, showProfessor]);

  const openTutoriales = () => {
    window.location.hash = '/tutoriales';
  };

  const closeTutoriales = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 flex flex-col">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Malla Curricular Interactiva</h1>
          <HeaderNav
            showAdmin={showAdmin}
            adminViewMode={adminViewMode}
            onAdminViewChange={handleAdminViewChange}
            onOpenTutoriales={openTutoriales}
            onOpenContact={() => setShowContact(true)}
            onOpenSobrepaso={() => setShowSobrepaso(true)}
            authButton={
              <AuthButton onOpenAuth={openAuth} onOpenPasswordReset={openPasswordReset} />
            }
          />
        </div>
      </header>
      <div className="flex-1">
        {showTutoriales ? (
          <TutorialsPage onBack={closeTutoriales} />
        ) : isSignedIn && isRoleLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">Cargando…</div>
        ) : showAdmin && adminViewMode === 'admin' ? (
          <AdminDashboard profile={adminProfile!} />
        ) : showAdmin && adminViewMode === 'teacher' && adminProfessorContext ? (
          <TeacherDashboard
            profile={adminProfessorContext}
            facultyOptions={[...ALL_FACULTIES]}
            title="Vista de facultad (admin)"
          />
        ) : showProfessor ? (
          <TeacherDashboard profile={professorContext!} />
        ) : (
          <CurriculumGrid />
        )}
      </div>
      <Footer />
      <ThemeToggle />
      <Toaster />
      <AuthModal
        open={authModalOpen || isPasswordRecovery}
        onOpenChange={setAuthModalOpen}
        initialMode={authMode}
      />
      {showContact && (
        <GeneralContactModal onClose={() => setShowContact(false)} />
      )}
      {showSobrepaso && (
        <SobrepasoModal
          onClose={() => setShowSobrepaso(false)}
          onOpenAuth={() => openAuth('login')}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    </AuthProvider>
  );
}
