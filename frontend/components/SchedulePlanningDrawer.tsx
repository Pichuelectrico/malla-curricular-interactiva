import React, { useState, useEffect } from 'react';
import { Calendar, X, Save, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Course } from '../types/curriculum';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
type DayType = typeof DAYS[number];

const TIME_SLOTS = [
  '07:00', '08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30'
];

interface CourseSchedule {
  courseId: string;
  nrc: string;
  sessions: {
    day: DayType;
    startTime: string;
  }[];
}

interface SchedulePlanningDrawerProps {
  plannedCourses: Course[];
  onSave: (schedules: CourseSchedule[]) => void;
}

export default function SchedulePlanningDrawer({ plannedCourses, onSave }: SchedulePlanningDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [schedules, setSchedules] = useState<CourseSchedule[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    const initialSchedules: CourseSchedule[] = plannedCourses.map(course => ({
      courseId: course.id,
      nrc: '',
      sessions: []
    }));
    setSchedules(initialSchedules);
  }, [plannedCourses]);

  const checkConflicts = (newSchedules: CourseSchedule[]) => {
    const conflictList: string[] = [];
    const occupied: { [key: string]: string } = {};

    newSchedules.forEach(schedule => {
      schedule.sessions.forEach(session => {
        const key = `${session.day}-${session.startTime}`;
        if (occupied[key]) {
          const course1 = plannedCourses.find(c => c.id === occupied[key])?.code || occupied[key];
          const course2 = plannedCourses.find(c => c.id === schedule.courseId)?.code || schedule.courseId;
          const conflictMsg = `Conflicto: ${course1} y ${course2} en ${session.day} a las ${session.startTime}`;
          if (!conflictList.includes(conflictMsg)) {
            conflictList.push(conflictMsg);
          }
        } else {
          occupied[key] = schedule.courseId;
        }
      });
    });

    setConflicts(conflictList);
    return conflictList.length === 0;
  };

  const updateNRC = (courseId: string, nrc: string) => {
    const updated = schedules.map(s => 
      s.courseId === courseId ? { ...s, nrc } : s
    );
    setSchedules(updated);
  };

  const addSession = (courseId: string) => {
    const updated = schedules.map(s =>
      s.courseId === courseId
        ? { ...s, sessions: [...s.sessions, { day: 'Lun' as DayType, startTime: '07:00' }] }
        : s
    );
    setSchedules(updated);
    checkConflicts(updated);
  };

  const removeSession = (courseId: string, sessionIndex: number) => {
    const updated = schedules.map(s =>
      s.courseId === courseId
        ? { ...s, sessions: s.sessions.filter((_, i) => i !== sessionIndex) }
        : s
    );
    setSchedules(updated);
    checkConflicts(updated);
  };

  const updateSession = (courseId: string, sessionIndex: number, field: 'day' | 'startTime', value: string) => {
    const updated = schedules.map(s => {
      if (s.courseId === courseId) {
        const newSessions = [...s.sessions];
        newSessions[sessionIndex] = {
          ...newSessions[sessionIndex],
          [field]: value
        };
        return { ...s, sessions: newSessions };
      }
      return s;
    });
    setSchedules(updated);
    checkConflicts(updated);
  };

  const handleSave = () => {
    if (checkConflicts(schedules)) {
      onSave(schedules);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    const cleared = schedules.map(s => ({ ...s, nrc: '', sessions: [] }));
    setSchedules(cleared);
    setConflicts([]);
  };

  const getScheduleForSlot = (day: DayType, time: string) => {
    for (const schedule of schedules) {
      for (const session of schedule.sessions) {
        if (session.day === day && session.startTime === time) {
          const course = plannedCourses.find(c => c.id === schedule.courseId);
          return course ? { code: course.code, title: course.title } : null;
        }
      }
    }
    return null;
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-30">
        <Card className="bg-white dark:bg-gray-800 shadow-lg border-2 border-gray-200 dark:border-gray-700">
          <Button
            onClick={() => setIsOpen(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white gap-2 p-4"
          >
            <Calendar className="w-5 h-5" />
            <span>Preparación de horario</span>
          </Button>
        </Card>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div 
            className="flex-1 bg-black/50" 
            onClick={() => setIsOpen(false)}
          />
          <div className="w-[90vw] max-w-6xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Preparación de horario
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {conflicts.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {conflicts.map((conflict, i) => (
                      <div key={i}>{conflict}</div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Materias planeadas
                </h3>
                {plannedCourses.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">
                    No hay materias planeadas. Marca materias como "planeadas" en la malla curricular.
                  </p>
                ) : (
                  plannedCourses.map(course => {
                    const schedule = schedules.find(s => s.courseId === course.id);
                    if (!schedule) return null;

                    return (
                      <Card key={course.id} className="p-4 dark:bg-gray-700">
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {course.code} - {course.title}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {course.credits} créditos
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 items-center">
                            <Input
                              placeholder="NRC"
                              value={schedule.nrc}
                              onChange={(e) => updateNRC(course.id, e.target.value)}
                              className="w-32 dark:bg-gray-600 dark:border-gray-500"
                            />
                          </div>

                          <div className="space-y-2">
                            {schedule.sessions.map((session, idx) => (
                              <div key={idx} className="flex gap-2 items-center">
                                <Select
                                  value={session.day}
                                  onValueChange={(value) => updateSession(course.id, idx, 'day', value)}
                                >
                                  <SelectTrigger className="w-28 dark:bg-gray-600 dark:border-gray-500">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {DAYS.map(day => (
                                      <SelectItem key={day} value={day}>{day}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Select
                                  value={session.startTime}
                                  onValueChange={(value) => updateSession(course.id, idx, 'startTime', value)}
                                >
                                  <SelectTrigger className="w-28 dark:bg-gray-600 dark:border-gray-500">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TIME_SLOTS.map(time => (
                                      <SelectItem key={time} value={time}>{time}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                  (1h30min)
                                </span>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeSession(course.id, idx)}
                                  className="dark:hover:bg-gray-600"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addSession(course.id)}
                              className="dark:border-gray-500 dark:hover:bg-gray-600"
                            >
                              + Agregar sesión
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Calendario semanal
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-sm font-semibold">
                          Hora
                        </th>
                        {DAYS.map(day => (
                          <th key={day} className="border border-gray-300 dark:border-gray-600 p-2 text-sm font-semibold">
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map(time => (
                        <tr key={time}>
                          <td className="border border-gray-300 dark:border-gray-600 p-2 text-sm font-medium text-center bg-gray-50 dark:bg-gray-750">
                            {time}
                          </td>
                          {DAYS.map(day => {
                            const courseInfo = getScheduleForSlot(day, time);
                            return (
                              <td
                                key={day}
                                className={`border border-gray-300 dark:border-gray-600 p-2 text-xs ${
                                  courseInfo
                                    ? 'bg-blue-100 dark:bg-blue-900/30'
                                    : 'bg-white dark:bg-gray-800'
                                }`}
                              >
                                {courseInfo && (
                                  <div className="font-semibold">
                                    <div>{courseInfo.code}</div>
                                    <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                                      {courseInfo.title}
                                    </div>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-2 justify-end sticky bottom-0 bg-white dark:bg-gray-800 py-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={handleClear}
                  className="gap-2 dark:border-gray-500 dark:hover:bg-gray-700"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpiar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={conflicts.length > 0}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Save className="w-4 h-4" />
                  Guardar planeación
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
