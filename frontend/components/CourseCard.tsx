import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Info, BookOpen, Clock, Users } from 'lucide-react';
import { Course } from '../types/curriculum';

interface CourseCardProps {
  course: Course;
  isCompleted: boolean;
  isUnlocked: boolean;
  isInProgress: boolean;
  isPlanned: boolean;
  onClick: (courseId: string) => void;
  allCourses: Course[];
}

export default function CourseCard({
  course,
  isCompleted,
  isUnlocked,
  isInProgress,
  isPlanned,
  onClick,
  allCourses
}: CourseCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getCardStyle = () => {
    if (isCompleted) {
      return 'bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-600 text-green-900 dark:text-green-100 hover:bg-green-200 dark:hover:bg-green-900/50';
    }
    if (isInProgress) {
      return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500 dark:border-yellow-600 text-yellow-900 dark:text-yellow-100 hover:bg-yellow-200 dark:hover:bg-yellow-900/50';
    }
    if (isPlanned) {
      return 'bg-purple-100 dark:bg-purple-900/30 border-purple-500 dark:border-purple-600 text-purple-900 dark:text-purple-100 hover:bg-purple-200 dark:hover:bg-purple-900/50';
    }
    if (isUnlocked) {
      return 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600 text-blue-900 dark:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer';
    }
    return 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed';
  };

  const getAreaColor = (area: string) => {
    const colors = {
      'Computación': 'bg-blue-500',
      'Matemáticas': 'bg-purple-500',
      'Física': 'bg-red-500',
      'Humanidades': 'bg-green-500',
      'Idiomas': 'bg-yellow-500',
      'Optativas': 'bg-orange-500',
      'Proyecto': 'bg-pink-500',
    };
    return colors[area as keyof typeof colors] || 'bg-gray-500';
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      'obligatoria': 'Obligatoria',
      'optativa': 'Optativa',
      'idioma': 'Idioma',
      'proyecto': 'Proyecto',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getPrerequisiteNames = () => {
    return course.prerequisites.map(prereqId => {
      const prereq = allCourses.find(c => c.id === prereqId);
      return prereq ? prereq.title : prereqId;
    });
  };

  const getAlternativeNames = () => {
    return course.alternatives.map(altId => {
      const alt = allCourses.find(c => c.id === altId);
      return alt ? alt.title : altId;
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onClick(course.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(course.id);
    }
  };

  return (
    <Card
      className={`transition-all duration-200 ${getCardStyle()}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isUnlocked || isCompleted ? 0 : -1}
      role="button"
      aria-label={`${course.title} - ${isCompleted ? 'Completada' : isUnlocked ? 'Disponible' : 'Bloqueada'}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium truncate">
              {course.title}
            </CardTitle>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{course.code}</p>
          </div>
          <Dialog open={showDetails} onOpenChange={setShowDetails}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-auto dark:hover:bg-gray-700"
                onClick={(e) => e.stopPropagation()}
              >
                <Info className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="dark:text-white">{course.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium dark:text-gray-200">Código:</span>
                    <p className="dark:text-gray-300">{course.code}</p>
                  </div>
                  <div>
                    <span className="font-medium dark:text-gray-200">Créditos:</span>
                    <p className="dark:text-gray-300">{course.credits}</p>
                  </div>
                  <div>
                    <span className="font-medium dark:text-gray-200">Semestre:</span>
                    <p className="dark:text-gray-300">{course.semester}</p>
                  </div>
                  <div>
                    <span className="font-medium dark:text-gray-200">Tipo:</span>
                    <p className="dark:text-gray-300">{getTypeLabel(course.type)}</p>
                  </div>
                </div>
                
                <div>
                  <span className="font-medium text-sm dark:text-gray-200">Área:</span>
                  <Badge className={`ml-2 text-white ${getAreaColor(course.area)}`}>
                    {course.area}
                  </Badge>
                </div>

                {course.description && (
                  <div>
                    <span className="font-medium text-sm dark:text-gray-200">Descripción:</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{course.description}</p>
                  </div>
                )}

                {course.prerequisites.length > 0 && (
                  <div>
                    <span className="font-medium text-sm dark:text-gray-200">Prerrequisitos:</span>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-1">
                      {getPrerequisiteNames().map((name, index) => (
                        <li key={index} className="flex items-center">
                          <BookOpen className="w-3 h-3 mr-2" />
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {course.alternatives.length > 0 && (
                  <div>
                    <span className="font-medium text-sm dark:text-gray-200">Alternativas:</span>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-1">
                      {getAlternativeNames().map((name, index) => (
                        <li key={index} className="flex items-center">
                          <Users className="w-3 h-3 mr-2" />
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={`text-xs text-white ${getAreaColor(course.area)}`}
          >
            {course.area}
          </Badge>
          <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
            <Clock className="w-3 h-3 mr-1" />
            {course.credits} cr
          </div>
        </div>
        {course.type !== 'obligatoria' && (
          <Badge variant="secondary" className="text-xs mt-2 dark:bg-gray-700 dark:text-gray-300">
            {getTypeLabel(course.type)}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
