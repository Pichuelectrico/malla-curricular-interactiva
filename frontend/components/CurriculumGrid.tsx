import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, RotateCcw, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CourseCard from './CourseCard';
import FileUpload from './FileUpload';
import { Course, CurriculumData } from '../types/curriculum';
import { generateMermaidDiagram, downloadPDF } from '../utils/mermaidExport';
import defaultCurriculumData from '../data/Malla-CMP.json';

export default function CurriculumGrid() {
  const [curriculumData, setCurriculumData] = useState<CurriculumData>(defaultCurriculumData);
  const [completedCourses, setCompletedCourses] = useState<Set<string>>(new Set());
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const { toast } = useToast();

  // Load state from localStorage on mount
  useEffect(() => {
    const savedCompleted = localStorage.getItem('completedCourses');
    const savedCurriculum = localStorage.getItem('curriculumData');
    
    if (savedCompleted) {
      try {
        setCompletedCourses(new Set(JSON.parse(savedCompleted)));
      } catch (error) {
        console.error('Error loading completed courses:', error);
      }
    }
    
    if (savedCurriculum) {
      try {
        setCurriculumData(JSON.parse(savedCurriculum));
      } catch (error) {
        console.error('Error loading curriculum data:', error);
      }
    }
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    localStorage.setItem('completedCourses', JSON.stringify([...completedCourses]));
  }, [completedCourses]);

  useEffect(() => {
    localStorage.setItem('curriculumData', JSON.stringify(curriculumData));
  }, [curriculumData]);

  const isUnlocked = (course: Course): boolean => {
    if (course.prerequisites.length === 0) return true;
    
    if (course.alternatives.length > 0) {
      return course.alternatives.some(altId => completedCourses.has(altId));
    }
    
    return course.prerequisites.every(prereqId => completedCourses.has(prereqId));
  };

  const handleCourseClick = (courseId: string, isShiftClick: boolean) => {
    const course = curriculumData.courses.find(c => c.id === courseId);
    if (!course || (!isUnlocked(course) && !completedCourses.has(courseId))) return;

    if (isShiftClick) {
      setSelectedCourses(prev => {
        const newSelected = new Set(prev);
        if (newSelected.has(courseId)) {
          newSelected.delete(courseId);
        } else {
          newSelected.add(courseId);
        }
        return newSelected;
      });
    } else {
      setCompletedCourses(prev => {
        const newCompleted = new Set(prev);
        if (newCompleted.has(courseId)) {
          newCompleted.delete(courseId);
        } else {
          newCompleted.add(courseId);
        }
        return newCompleted;
      });
    }
  };

  const handleMultipleComplete = () => {
    if (selectedCourses.size === 0) return;
    
    setCompletedCourses(prev => {
      const newCompleted = new Set(prev);
      selectedCourses.forEach(courseId => {
        const course = curriculumData.courses.find(c => c.id === courseId);
        if (course && (isUnlocked(course) || newCompleted.has(courseId))) {
          if (newCompleted.has(courseId)) {
            newCompleted.delete(courseId);
          } else {
            newCompleted.add(courseId);
          }
        }
      });
      return newCompleted;
    });
    
    setSelectedCourses(new Set());
  };

  const resetProgress = () => {
    setCompletedCourses(new Set());
    setSelectedCourses(new Set());
    localStorage.removeItem('completedCourses');
    toast({
      title: "Progreso reiniciado",
      description: "Se ha borrado todo el progreso guardado.",
    });
  };

  const exportProgress = async () => {
    try {
      const mermaidCode = generateMermaidDiagram(curriculumData.courses, completedCourses);
      await downloadPDF(mermaidCode, 'malla-curricular-progreso.pdf');
      toast({
        title: "Progreso exportado",
        description: "El diagrama PDF se ha descargado correctamente.",
      });
    } catch (error) {
      console.error('Error exporting progress:', error);
      toast({
        title: "Error al exportar",
        description: "No se pudo generar el PDF. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (data: CurriculumData) => {
    setCurriculumData(data);
    setCompletedCourses(new Set());
    setSelectedCourses(new Set());
    setShowUpload(false);
    toast({
      title: "Malla curricular cargada",
      description: "Se ha cargado la nueva malla curricular correctamente.",
    });
  };

  // Calculate progress
  const totalCredits = curriculumData.courses.reduce((sum, course) => sum + course.credits, 0);
  const completedCredits = curriculumData.courses
    .filter(course => completedCourses.has(course.id))
    .reduce((sum, course) => sum + course.credits, 0);
  const totalCourses = curriculumData.courses.length;
  const completedCoursesCount = completedCourses.size;
  
  const creditProgress = totalCredits > 0 ? (completedCredits / totalCredits) * 100 : 0;
  const courseProgress = totalCourses > 0 ? (completedCoursesCount / totalCourses) * 100 : 0;

  // Group courses by semester/block
  const coursesByBlock = curriculumData.courses.reduce((acc, course) => {
    if (!acc[course.block]) {
      acc[course.block] = [];
    }
    acc[course.block].push(course);
    return acc;
  }, {} as Record<string, Course[]>);

  const blockOrder = [
    'Semestre 1', 'Semestre 2', 'Semestre 3', 'Semestre 4', 'Semestre 5',
    'Semestre 6', 'Semestre 7', 'Semestre 8', 'Semestre 9', 'PASEM'
  ];

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Malla Curricular Interactiva</h1>
        <p className="text-gray-600">Haz clic en las asignaturas para marcarlas como completadas</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 justify-center">
        <Button onClick={() => setShowUpload(true)} variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Cargar Malla
        </Button>
        <Button onClick={resetProgress} variant="outline">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reiniciar Progreso
        </Button>
        <Button onClick={exportProgress} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Exportar PDF
        </Button>
        {selectedCourses.size > 0 && (
          <Button onClick={handleMultipleComplete} variant="default">
            <FileText className="w-4 h-4 mr-2" />
            Alternar {selectedCourses.size} seleccionadas
          </Button>
        )}
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Progreso General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Créditos completados</span>
                <span>{completedCredits} / {totalCredits}</span>
              </div>
              <Progress value={creditProgress} className="h-2" />
              <p className="text-xs text-gray-500 mt-1">{creditProgress.toFixed(1)}%</p>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Asignaturas completadas</span>
                <span>{completedCoursesCount} / {totalCourses}</span>
              </div>
              <Progress value={courseProgress} className="h-2" />
              <p className="text-xs text-gray-500 mt-1">{courseProgress.toFixed(1)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Leyenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm">Completada</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm">Disponible</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-300 rounded"></div>
              <span className="text-sm">Bloqueada</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-400 rounded"></div>
              <span className="text-sm">Seleccionada</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Mantén presionado Shift y haz clic para seleccionar múltiples asignaturas
          </p>
        </CardContent>
      </Card>

      {/* Curriculum Grid */}
      <div className="space-y-8">
        {blockOrder.map(blockName => {
          const blockCourses = coursesByBlock[blockName];
          if (!blockCourses || blockCourses.length === 0) return null;

          const blockCompletedCredits = blockCourses
            .filter(course => completedCourses.has(course.id))
            .reduce((sum, course) => sum + course.credits, 0);
          const blockTotalCredits = blockCourses.reduce((sum, course) => sum + course.credits, 0);
          const blockProgress = blockTotalCredits > 0 ? (blockCompletedCredits / blockTotalCredits) * 100 : 0;

          return (
            <div key={blockName} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">{blockName}</h2>
                <Badge variant="outline">
                  {blockCompletedCredits}/{blockTotalCredits} créditos ({blockProgress.toFixed(0)}%)
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {blockCourses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    isCompleted={completedCourses.has(course.id)}
                    isUnlocked={isUnlocked(course)}
                    isSelected={selectedCourses.has(course.id)}
                    onClick={handleCourseClick}
                    allCourses={curriculumData.courses}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* File Upload Modal */}
      {showUpload && (
        <FileUpload
          onUpload={handleFileUpload}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
