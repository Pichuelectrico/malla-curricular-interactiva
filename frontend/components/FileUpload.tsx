import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { CurriculumData } from '../types/curriculum';

interface FileUploadProps {
  onUpload: (data: CurriculumData) => void;
  onClose: () => void;
}

export default function FileUpload({ onUpload, onClose }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const validateCurriculumData = (data: any): data is CurriculumData => {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.courses)) return false;
    
    return data.courses.every((course: any) => 
      course &&
      typeof course.id === 'string' &&
      typeof course.code === 'string' &&
      typeof course.title === 'string' &&
      typeof course.credits === 'number' &&
      typeof course.semester === 'number' &&
      typeof course.block === 'string' &&
      typeof course.area === 'string' &&
      typeof course.type === 'string' &&
      Array.isArray(course.prerequisites) &&
      Array.isArray(course.alternatives)
    );
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      toast({
        title: "Formato incorrecto",
        description: "Por favor selecciona un archivo JSON válido.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!validateCurriculumData(data)) {
        throw new Error('El formato del archivo no es válido');
      }
      
      onUpload(data);
    } catch (error) {
      console.error('Error parsing file:', error);
      toast({
        title: "Error al cargar archivo",
        description: "El archivo no tiene el formato correcto. Verifica que sea un JSON válido con la estructura esperada.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="dark:text-white">Cargar Malla Curricular</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
          >
            <FileText className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Arrastra y suelta un archivo JSON aquí, o haz clic para seleccionar
            </p>
            <Label htmlFor="file-upload">
              <Button variant="outline" disabled={isLoading} asChild className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {isLoading ? 'Cargando...' : 'Seleccionar archivo'}
                </span>
              </Button>
            </Label>
            <Input
              id="file-upload"
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="hidden"
              disabled={isLoading}
            />
          </div>
          
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2">
            <p><strong>Formato esperado:</strong></p>
            <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto">
{`{
  "courses": [
    {
      "id": "CMP1001",
      "code": "CMP1001", 
      "title": "Nombre",
      "description": "",
      "credits": 3,
      "semester": 1,
      "block": "Semestre 1",
      "area": "Computación",
      "type": "obligatoria",
      "prerequisites": [],
      "alternatives": []
    }
  ]
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
