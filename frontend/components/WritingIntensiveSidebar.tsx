import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

interface WritingIntensiveSidebarProps {
  hasWritingIntensive: boolean;
  onToggle: (checked: boolean) => void;
  allEnglishCompleted: boolean;
}

export default function WritingIntensiveSidebar({
  hasWritingIntensive,
  onToggle,
  allEnglishCompleted,
}: WritingIntensiveSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="fixed bottom-[220px] left-4 z-30">
      <Card className={`bg-white dark:bg-gray-800 shadow-lg border-2 transition-all duration-300 ${
        allEnglishCompleted
          ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-center">
          {!isCollapsed && (
            <div className="p-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                <Languages className={`w-4 h-4 ${allEnglishCompleted ? 'text-blue-600 dark:text-blue-400 animate-pulse' : ''}`} />
                Requisito Especial
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="writing-intensive-sidebar"
                  checked={hasWritingIntensive}
                  onCheckedChange={onToggle}
                />
                <label
                  htmlFor="writing-intensive-sidebar"
                  className={`text-sm font-medium leading-none cursor-pointer ${
                    allEnglishCompleted
                      ? 'text-blue-800 dark:text-blue-200 font-semibold'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Writing Intensive
                </label>
              </div>
              {allEnglishCompleted && !hasWritingIntensive && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  ¡Inglés completado! Marca este requisito.
                </p>
              )}
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
                <Languages className={`w-4 h-4 ${allEnglishCompleted ? 'text-blue-600 dark:text-blue-400 animate-pulse' : 'text-gray-600'}`} />
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
