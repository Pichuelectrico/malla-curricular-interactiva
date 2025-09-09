import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import CurriculumGrid from './components/CurriculumGrid';
import ThemeToggle from './components/ThemeToggle';
import Footer from './components/Footer';
import AdminPanel from './components/AdminPanel';
import { useUser } from '@/hooks/useUser';
import AuthBar from '@/components/AuthBar';

const queryClient = new QueryClient();

function AppInner() {
  const { user, loading } = useUser();
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user?.email ? adminEmails.includes(user.email.toLowerCase()) : false;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 flex flex-col">
      <AuthBar />
      <div className="flex-1">
        {loading ? (
          <div className="p-6">Cargando...</div>
        ) : isAdmin ? (
          <AdminPanel />
        ) : (
          <CurriculumGrid />
        )}
      </div>
      <Footer />
      <ThemeToggle />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
