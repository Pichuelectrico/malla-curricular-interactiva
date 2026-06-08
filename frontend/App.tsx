import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import CurriculumGrid from './components/CurriculumGrid';
import ThemeToggle from './components/ThemeToggle';
import Footer from './components/Footer';
import AuthModal, { type AuthMode } from './components/AuthModal';
import { AuthProvider, useSupabaseAuth } from './lib/auth';

const queryClient = new QueryClient();

function AuthButton() {
  const { isSignedIn, isLoading, user, signOut, isPasswordRecovery } = useSupabaseAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setModalOpen(true);
  };

  React.useEffect(() => {
    if (isPasswordRecovery) {
      setAuthMode('new-password');
      setModalOpen(true);
    }
  }, [isPasswordRecovery]);

  if (isLoading) return null;

  if (isSignedIn && !isPasswordRecovery) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:inline truncate max-w-[180px]">
          {user?.email}
        </span>
        <button
          onClick={signOut}
          className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Salir
        </button>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return (
      <AuthModal open onOpenChange={setModalOpen} initialMode="new-password" />
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => openAuth('login')}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          Iniciar sesión
        </button>
        <button
          onClick={() => openAuth('signup')}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Crear cuenta
        </button>
      </div>
      <AuthModal open={modalOpen} onOpenChange={setModalOpen} initialMode={authMode} />
    </>
  );
}

function AppInner() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 flex flex-col">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Malla Curricular Interactiva</h1>
          <div className="flex items-center gap-4">
            <AuthButton />
          </div>
        </div>
      </header>
      <div className="flex-1">
        <CurriculumGrid />
      </div>
      <Footer />
      <ThemeToggle />
      <Toaster />
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
