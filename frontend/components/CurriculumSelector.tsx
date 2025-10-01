import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, GraduationCap, Mail } from 'lucide-react';
import { CurriculumData } from '../types/curriculum';
import { availableCurricula } from '../data/availableCurricula';

interface CurriculumSelectorProps {
  onSelect: (data: CurriculumData) => void;
  onRequestCurriculum: () => void;
}

export default function CurriculumSelector({ onSelect, onRequestCurriculum }: CurriculumSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCurriculumSelect = async (curriculumId: string) => {
    try {
      const curriculum = availableCurricula.find(c => c.id === curriculumId);
      if (!curriculum) return;

      const module = await curriculum.dataLoader();
      const data = module.default as CurriculumData;
      // Ensure a stable identifier to persist progress per curriculum
      if (!data.source_file) {
        data.source_file = curriculumId;
      }
      onSelect(data);
      setIsOpen(false);
    } catch (error) {
      console.error('Error loading curriculum:', error);
    }
  };

  return (
    <div className="relative">
      <Button 
        onClick={() => setIsOpen(!isOpen)} 
        variant="outline" 
        className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <GraduationCap className="w-4 h-4 mr-2" />
        Seleccionar Malla
        {isOpen ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
      </Button>

      {isOpen && (
        <Card className="absolute top-full left-0 z-50 w-80 mt-2 dark:bg-gray-800 dark:border-gray-700 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg dark:text-white">Mallas Disponibles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableCurricula.map((curriculum) => (
              <div
                key={curriculum.id}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                onClick={() => handleCurriculumSelect(curriculum.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm dark:text-white">{curriculum.name}</h3>
                  <Badge variant="secondary" className="text-xs dark:bg-gray-700 dark:text-gray-300">
                    {curriculum.year}
                  </Badge>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  {curriculum.description}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
                    {curriculum.credits} créditos
                  </Badge>
                  <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
                    {curriculum.courses} materias
                  </Badge>
                </div>
              </div>
            ))}
            
            {/* Request Custom Curriculum Option */}
            <div
              className="p-3 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
              onClick={onRequestCurriculum}
            >
              <div className="flex items-center justify-center mb-2">
                <Mail className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
                <h3 className="font-medium text-sm text-blue-800 dark:text-blue-200">Solicita tu malla</h3>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 text-center mb-2">
                ¿No encuentras tu carrera? Solicítala aquí
              </p>
              <div className="text-center">
                <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                  ☕ Con un café, más rápido
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
