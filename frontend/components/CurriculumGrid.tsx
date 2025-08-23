import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Download, RotateCcw, FileText, GraduationCap, Coffee, Languages } from 'lucide-react';
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
  const [showEnglishAnimation, setShowEnglishAnimation] = useState(false);
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

  // Check if ESL0006 exists in the curriculum
  const hasESL0006 = curriculumData.courses.some(course => course.id === 'ESL0006');

  // Check if all English courses are completed and ESL0006 was just completed
  useEffect(() => {
    if (!hasESL0006) return;

    const englishCourses = curriculumData.courses.filter(course => 
      course.area === 'Idiomas' || course.type === 'idioma'
    );
    
    const allEnglishCompleted = englishCourses.length > 0 && 
      englishCourses.every(course => completedCourses.has(course.id));
    
    const esl0006JustCompleted = completedCourses.has('ESL0006');
    
    // Show animation when ESL0006 is completed and all English courses are done
    if (allEnglishCompleted && esl0006JustCompleted && !hasWritingIntensive) {
      const timer = setTimeout(() => {
        setShowEnglishAnimation(true);
        toast({
          title: "¡Inglés completado! 🌟",
          description: "Has completado todos los niveles de inglés. Ahora puedes marcar el requisito de Writing Intensive.",
        });
        
        // Auto-hide animation after 3 seconds
        setTimeout(() => {
          setShowEnglishAnimation(false);
        }, 3000);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [completedCourses, curriculumData.courses, hasWritingIntensive, hasESL0006, toast]);

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

  // Check if all English courses are completed (for showing the writing intensive checkbox)
  const englishCourses = curriculumData.courses.filter(course => 
    course.area === 'Idiomas' || course.type === 'idioma'
  );
  const allEnglishCompleted = hasESL0006 && englishCourses.length > 0 && 
    englishCourses.every(course => completedCourses.has(course.id));

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
      {/* USFQ Icon in top left corner */}
      <div className="fixed top-4 left-8 z-40">
        <USFQIcon />
      </div>

      {/* Confetti Animation */}
      {showCelebration && <ConfettiAnimation />}

      {/* English Completion Animation */}
      {showEnglishAnimation && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-blue-500/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl border-2 border-blue-300 text-center animate-pulse transform scale-110">
              <div className="flex items-center justify-center mb-4">
                <Languages className="w-16 h-16 text-white mr-4 animate-bounce" />
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">¡Inglés Completado!</h2>
                  <p className="text-xl text-blue-100">Ahora puedes marcar Writing Intensive</p>
                </div>
              </div>
              <div className="text-6xl animate-bounce">🌟</div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Malla Curricular Interactiva</h1>
        <p className="text-gray-600 dark:text-gray-300">Haz clic en las asignaturas para marcarlas como completadas</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 justify-center">
        <Button onClick={() => setShowUpload(true)} variant="outline" className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          <Upload className="w-4 h-4 mr-2" />
          Cargar Malla
        </Button>
        <Button onClick={resetProgress} variant="outline" className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reiniciar Progreso
        </Button>
        <Button onClick={exportProgress} variant="outline" className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          <Download className="w-4 h-4 mr-2" />
          Exportar PDF
        </Button>
        <Button onClick={() => setShowDonation(true)} variant="outline" className="bg-yellow-50 hover:bg-yellow-100 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-600 dark:hover:bg-yellow-900/30">
          <Coffee className="w-4 h-4 mr-2" />
          Buy Me a Coffee
        </Button>
        {selectedCourses.size > 0 && (
          <Button onClick={handleMultipleComplete} variant="default" className="dark:bg-blue-600 dark:hover:bg-blue-700">
            <FileText className="w-4 h-4 mr-2" />
            Alternar {selectedCourses.size} seleccionadas
          </Button>
        )}
      </div>

      {/* Progress Overview */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Progreso General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-sm mb-2 dark:text-gray-300">
                <span>Créditos completados</span>
                <span>{completedCredits} / {totalCredits}</span>
              </div>
              <Progress value={creditProgress} className="h-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{creditProgress.toFixed(1)}%</p>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2 dark:text-gray-300">
                <span>Asignaturas completadas</span>
                <span>{completedCoursesCount} / {totalCourses}</span>
              </div>
              <Progress value={courseProgress} className="h-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{courseProgress.toFixed(1)}%</p>
            </div>
          </div>

          {/* Writing Intensive Requirement */}
          {(hasCompletedFiveSemesters || allEnglishCompleted) && hasESL0006 && (
            <div className={`border-t pt-4 dark:border-gray-600 transition-all duration-500 ${
              allEnglishCompleted ? 'bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-700' : ''
            }`}>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="writing-intensive"
                  checked={hasWritingIntensive}
                  onCheckedChange={(checked) => setHasWritingIntensive(checked as boolean)}
                />
                <label
                  htmlFor="writing-intensive"
                  className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${
                    allEnglishCompleted ? 'text-blue-800 dark:text-blue-200 font-semibold' : 'dark:text-gray-200'
                  }`}
                >
                  ¿Tomaste una materia en inglés (Writing Intensive)?
                </label>
                {allEnglishCompleted && (
                  <Languages className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />
                )}
              </div>
              {allCoursesCompleted && !hasWritingIntensive && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center">
                  <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
                  Debes completar el requisito de Writing Intensive para graduarte
                </p>
              )}
              {allEnglishCompleted && !hasWritingIntensive && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-2 flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                  ¡Has completado todos los niveles de inglés! Ahora puedes marcar este requisito.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Leyenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm dark:text-gray-300">Completada</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm dark:text-gray-300">Disponible</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
              <span className="text-sm dark:text-gray-300">Bloqueada</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-400 rounded"></div>
              <span className="text-sm dark:text-gray-300">Seleccionada</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Mantén presionado Shift y haz clic para seleccionar múltiples asignaturas
          </p>
        </CardContent>
      </Card>

      {/* Career Title */}
      <div className="text-center relative">
        <h2 className={`text-2xl font-bold py-4 px-6 rounded-lg border-2 transition-all duration-500 ${
          isAllCompleted 
            ? 'text-green-800 dark:text-green-200 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 shadow-lg' 
            : 'text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
        }`}>
          {careerTitle}
          {isAllCompleted && (
            <GraduationCap className="inline-block w-8 h-8 ml-3 text-green-600 dark:text-green-400 animate-bounce" />
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
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">{blockName}</h2>
                <Badge variant="outline" className="dark:border-gray-600 dark:text-gray-300">
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
