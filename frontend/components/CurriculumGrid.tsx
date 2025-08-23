import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Download, RotateCcw, FileText, GraduationCap, Coffee } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CourseCard from './CourseCard';
import FileUpload from './FileUpload';
import ConfettiAnimation from './ConfettiAnimation';
import DonationModal from './DonationModal';
import USFQIcon from './USFQIcon';
import { Course, CurriculumData } from '../types/curriculum';
import { generateMermaidDiagram, downloadPDF } from '../utils/mermaidExport';
import defaultCurriculumData from '../data/Malla-CMP.json';

export default function CurriculumGrid() {
  const [curriculumData, setCurriculumData] = useState<CurriculumData>(defaultCurriculumData);
  const [completedCourses, setCompletedCourses] = useState<Set<string>>(new Set());
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [hasWritingIntensive, setHasWritingIntensive] = useState(false);
  const { toast } = useToast();

  // Load state from localStorage on mount
  useEffect(() => {
    const savedCompleted = localStorage.getItem('completedCourses');
    const savedCurriculum = localStorage.getItem('curriculumData');
    const savedWritingIntensive = localStorage.getItem('hasWritingIntensive');
    
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

    if (savedWritingIntensive) {
      try {
        setHasWritingIntensive(JSON.parse(savedWritingIntensive));
      } catch (error) {
        console.error('Error loading writing intensive status:', error);
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

  useEffect(() => {
    localStorage.setItem('hasWritingIntensive', JSON.stringify(hasWritingIntensive));
  }, [hasWritingIntensive]);

  // Check if all courses are completed and writing intensive requirement is met
  const allCoursesCompleted = curriculumData.courses.length > 0 && completedCourses.size === curriculumData.courses.length;
  const isAllCompleted = allCoursesCompleted && hasWritingIntensive;

  // Check if student has completed at least 5 semesters worth of courses
  const completedSemesters = new Set(
    curriculumData.courses
      .filter(course => completedCourses.has(course.id))
      .map(course => course.semester)
  );
  const hasCompletedFiveSemesters = completedSemesters.size >= 5;

  // Trigger celebration when all requirements are met
  useEffect(() => {
    if (isAllCompleted && completedCourses.size > 0) {
      setShowCelebration(true);
      toast({
        title: "¡Felicitaciones! 🎓",
        description: "Has completado toda la malla curricular y cumplido todos los requisitos. ¡Excelente trabajo!",
      });
    } else {
      setShowCelebration(false);
    }
  }, [isAllCompleted, completedCourses.size, toast]);

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
    setHasWritingIntensive(false);
    localStorage.removeItem('completedCourses');
    localStorage.removeItem('hasWritingIntensive');
    toast({
      title: "Progreso reiniciado",
      description: "Se ha borrado todo el progreso guardado.",
    });
  };

  const exportProgress = async () => {
    try {
      const mermaidCode = generateMermaidDiagram(curriculumData.courses, completedCourses, curriculumData.source_file);
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
    setHasWritingIntensive(false);
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

  // Get career title from source file
  const careerTitle = curriculumData.source_file || 'Malla Curricular';

  return (
    <div className="container mx-auto p-4 space-y-6 relative">
      {/* USFQ Icon in top right corner */}
      <div className="fixed top-4 right-4 z-40">
        <USFQIcon />
      </div>

      {/* Confetti Animation */}
      {showCelebration && <ConfettiAnimation />}

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
        <Button onClick={() => setShowDonation(true)} variant="outline" className="bg-yellow-50 hover:bg-yellow-100 border-yellow-300">
          <Coffee className="w-4 h-4 mr-2" />
          Buy Me a Coffee
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

          {/* Writing Intensive Requirement */}
          {hasCompletedFiveSemesters && (
            <div className="border-t pt-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="writing-intensive"
                  checked={hasWritingIntensive}
                  onCheckedChange={(checked) => setHasWritingIntensive(checked as boolean)}
                />
                <label
                  htmlFor="writing-intensive"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  ¿Tomaste una materia en inglés (Writing Intensive)?
                </label>
              </div>
              {allCoursesCompleted && !hasWritingIntensive && (
                <p className="text-sm text-amber-600 mt-2 flex items-center">
                  <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
                  Debes completar el requisito de Writing Intensive para graduarte
                </p>
              )}
            </div>
          )}
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

      {/* Career Title */}
      <div className="text-center relative">
        <h2 className={`text-2xl font-bold py-4 px-6 rounded-lg border-2 transition-all duration-500 ${
          isAllCompleted 
            ? 'text-green-800 bg-green-50 border-green-200 shadow-lg' 
            : 'text-blue-800 bg-blue-50 border-blue-200'
        }`}>
          {careerTitle}
          {isAllCompleted && (
            <GraduationCap className="inline-block w-8 h-8 ml-3 text-green-600 animate-bounce" />
          )}
        </h2>
      </div>

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

      {/* Donation Modal */}
      {showDonation && (
        <DonationModal onClose={() => setShowDonation(false)} />
      )}
    </div>
  );
}
