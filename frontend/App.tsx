import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import CurriculumGrid from './components/CurriculumGrid';
import ThemeToggle from './components/ThemeToggle';
import Footer from './components/Footer';

const queryClient = new QueryClient();

function AppInner() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 flex flex-col">
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
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
