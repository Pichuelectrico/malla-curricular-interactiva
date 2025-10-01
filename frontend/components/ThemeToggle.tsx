import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import MoonIcon from '../src/assets/moon.svg?url';
import SunIcon from '../src/assets/sun.svg?url';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
  }, []);

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <div className="fixed top-2 right-2 z-50">
      <Button
        onClick={toggleTheme}
        variant="outline"
        size="sm"
        className="w-12 h-12 rounded-full p-0 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 shadow-lg hover:shadow-xl transition-all duration-300"
        aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <div 
            className={`absolute transition-all duration-300 transform ${
              isDark ? 'scale-100 rotate-0' : 'scale-0 rotate-180'
            }`}
          >
            <img 
              src={MoonIcon} 
              alt="Modo oscuro" 
              className="w-5 h-5 filter invert dark:invert-0"
            />
          </div>
          <div 
            className={`absolute transition-all duration-300 transform ${
              !isDark ? 'scale-100 rotate-0' : 'scale-0 -rotate-180'
            }`}
          >
            <img 
              src={SunIcon} 
              alt="Modo claro" 
              className="w-5 h-5"
            />
          </div>
        </div>
      </Button>
    </div>
  );
}
