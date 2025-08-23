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
  isSelected: boolean;
  onClick: (courseId: string, isShiftClick: boolean) => void;
  allCourses: Course[];
}

export default function CourseCard({
  course,
  isCompleted,
  isUnlocked,
  isSelected,
  onClick,
  allCourses
}: CourseCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getCardStyle = () => {
    if (isCompleted) {
      return 'bg-green-100 border-green-500 text-green-900 hover:bg-green-200';
    }
    if (isSelected) {
      return 'bg-yellow-100 border-yellow-500 text-yellow-900 hover:bg-yellow-200';
    }
    if (isUnlocked) {
      return 'bg-blue-50 border-blue-300 text-blue-900 hover:bg-blue-100 cursor-pointer';
    }
    return 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed';
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
    onClick(course.id, e.shiftKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(course.id, e.shiftKey);
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
            <p className="text-xs text-gray-600 mt-1">{course.code}</p>
          </div>
          <Dialog open={showDetails} onOpenChange={setShowDetails}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <Info className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{course.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Código:</span>
                    <p>{course.code}</p>
                  </div>
                  <div>
                    <span className="font-medium">Créditos:</span>
                    <p>{course.credits}</p>
                  </div>
                  <div>
                    <span className="font-medium">Semestre:</span>
                    <p>{course.semester}</p>
                  </div>
                  <div>
                    <span className="font-medium">Tipo:</span>
                    <p>{getTypeLabel(course.type)}</p>
                  </div>
                </div>
                
                <div>
                  <span className="font-medium text-sm">Área:</span>
                  <Badge className={`ml-2 text-white ${getAreaColor(course.area)}`}>
                    {course.area}
                  </Badge>
                </div>

                {course.description && (
                  <div>
                    <span className="font-medium text-sm">Descripción:</span>
                    <p className="text-sm text-gray-600 mt-1">{course.description}</p>
                  </div>
                )}

                {course.prerequisites.length > 0 && (
                  <div>
                    <span className="font-medium text-sm">Prerrequisitos:</span>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
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
                    <span className="font-medium text-sm">Alternativas:</span>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
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
          <div className="flex items-center text-xs text-gray-600">
            <Clock className="w-3 h-3 mr-1" />
            {course.credits} cr
          </div>
        </div>
        {course.type !== 'obligatoria' && (
          <Badge variant="secondary" className="text-xs mt-2">
            {getTypeLabel(course.type)}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
