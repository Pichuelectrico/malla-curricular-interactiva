import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle, Circle, Loader, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type SelectionMode = 'completed' | 'selected' | 'in-progress' | 'planned';

interface ModeSelectorProps {
  currentMode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
}

export default function ModeSelector({ currentMode, onModeChange }: ModeSelectorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const modes: { id: SelectionMode; label: string; icon: React.ReactNode; color: string }[] = [
    {
      id: 'completed',
      label: 'Completadas',
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'bg-green-500 hover:bg-green-600 text-white',
    },
    {
      id: 'selected',
      label: 'Seleccionadas',
      icon: <Circle className="w-5 h-5" />,
      color: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    },
    {
      id: 'in-progress',
      label: 'Cursando',
      icon: <Loader className="w-5 h-5" />,
      color: 'bg-blue-500 hover:bg-blue-600 text-white',
    },
    {
      id: 'planned',
      label: 'Planeadas',
      icon: <Target className="w-5 h-5" />,
      color: 'bg-purple-500 hover:bg-purple-600 text-white',
    },
  ];

  const currentModeData = modes.find(m => m.id === currentMode);

  return (
    <div className="fixed bottom-4 left-4 z-30">
      <Card className="bg-white dark:bg-gray-800 shadow-lg border-2 border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          {!isCollapsed && (
            <div className="p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                Modo de Selección
              </div>
              {modes.map((mode) => (
                <Button
                  key={mode.id}
                  onClick={() => onModeChange(mode.id)}
                  variant={currentMode === mode.id ? 'default' : 'outline'}
                  className={`w-full justify-start gap-2 ${
                    currentMode === mode.id
                      ? mode.color
                      : 'dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  size="sm"
                >
                  {mode.icon}
                  <span className="text-sm">{mode.label}</span>
                </Button>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 h-auto dark:hover:bg-gray-700"
          >
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-1 p-1">
                <ChevronRight className="w-4 h-4" />
                {currentModeData && (
                  <div className={`rounded-full p-1 ${currentModeData.color}`}>
                    {currentModeData.icon}
                  </div>
                )}
              </div>
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
