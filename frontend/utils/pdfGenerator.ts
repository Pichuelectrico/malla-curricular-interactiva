import { Course } from '../types/curriculum';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const;
const TIME_SLOTS = [
  '07:00', '08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30'
];

// Allow either short (Lun) or full (Lunes) day labels in the input
const DAY_SHORT_TO_FULL: Record<string, string> = {
  'Lun': 'Lunes',
  'Mar': 'Martes',
  'Mié': 'Miércoles',
  'Mie': 'Miércoles',
  'Jue': 'Jueves',
  'Vie': 'Viernes',
};

interface CourseSchedule {
  courseId: string;
  nrc: string;
  hasEJ: boolean;
  hasLAB: boolean;
  nrcEJ?: string;
  nrcLAB?: string;
  sessions: {
    day: string;
    startTime: string;
  }[];
  sessionsEJ?: {
    day: string;
    startTime: string;
  }[];
  sessionsLAB?: {
    day: string;
    startTime: string;
  }[];
}

interface ScheduleEntry {
  courseName: string;
  nrc: string;
  type?: 'TEORIA' | 'EJ' | 'LAB';
  baseCourseName: string;
}

function getCourseBaseName(courseName: string): string {
  return courseName.replace(/(\s+EJ|\s+LAB)$/i, '').trim();
}

export async function generateSchedulePDF(schedules: CourseSchedule[], courses: Course[]) {
  // Initialize the grid
  const scheduleGrid: Record<string, Record<string, ScheduleEntry[]>> = {};
  const allNRCs = new Set<string>();
  
  // Initialize grid structure
  DAYS.forEach(day => {
    scheduleGrid[day] = {};
    TIME_SLOTS.forEach(time => {
      scheduleGrid[day][time] = [];
    });
  });

  // Process each course schedule
  schedules.forEach(schedule => {
    const course = courses.find(c => c.id === schedule.courseId);
    if (!course) return;

    const baseCourseName = getCourseBaseName(course.title);

    // Process regular sessions (TEORIA)
    if (schedule.nrc) {
      allNRCs.add(schedule.nrc);
      schedule.sessions?.forEach(session => {
        const fullDay = DAY_SHORT_TO_FULL[session.day] ?? session.day;
        if (fullDay && scheduleGrid[fullDay]?.[session.startTime]) {
          scheduleGrid[fullDay][session.startTime].push({
            courseName: baseCourseName,
            baseCourseName,
            nrc: schedule.nrc,
            type: 'TEORIA'
          });
        }
      });
    }

    // Process EJ sessions
    if (schedule.hasEJ && schedule.nrcEJ && schedule.sessionsEJ) {
      allNRCs.add(schedule.nrcEJ);
      schedule.sessionsEJ.forEach(session => {
        const fullDay = DAY_SHORT_TO_FULL[session.day] ?? session.day;
        if (fullDay && scheduleGrid[fullDay]?.[session.startTime]) {
          scheduleGrid[fullDay][session.startTime].push({
            courseName: `${baseCourseName} EJ`,
            baseCourseName,
            nrc: schedule.nrcEJ || '',
            type: 'EJ'
          });
        }
      });
    }

    // Process LAB sessions
    if (schedule.hasLAB && schedule.nrcLAB && schedule.sessionsLAB) {
      allNRCs.add(schedule.nrcLAB);
      schedule.sessionsLAB.forEach(session => {
        const fullDay = DAY_SHORT_TO_FULL[session.day] ?? session.day;
        if (fullDay && scheduleGrid[fullDay]?.[session.startTime]) {
          scheduleGrid[fullDay][session.startTime].push({
            courseName: `${baseCourseName} LAB`,
            baseCourseName,
            nrc: schedule.nrcLAB || '',
            type: 'LAB'
          });
        }
      });
    }
  });

  // Create PDF with landscape orientation
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Add title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Calendario de clases', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
  
  // Calculate dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const timeColWidth = 20;
  const dayColWidth = (pageWidth - 2 * margin - timeColWidth) / DAYS.length;
  const rowHeight = 18;
  const headerHeight = 10;
  const startY = 30;
  
  // Draw table header
  doc.setFillColor(41, 128, 185);
  doc.setTextColor(255, 255, 255);
  doc.rect(margin, startY, timeColWidth, headerHeight, 'F');
  doc.text('Hora', margin + timeColWidth / 2, startY + headerHeight / 2 + 2, { align: 'center', baseline: 'middle' });
  
  // Draw day headers
  DAYS.forEach((day, i) => {
    const x = margin + timeColWidth + (i * dayColWidth);
    doc.rect(x, startY, dayColWidth, headerHeight, 'F');
    doc.text(day, x + dayColWidth / 2, startY + headerHeight / 2 + 2, { align: 'center', baseline: 'middle' });
  });
  
  // Draw time slots and course cells
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  
  TIME_SLOTS.forEach((time, timeIndex) => {
    const y = startY + headerHeight + (timeIndex * rowHeight);
    
    // Draw time cell
    doc.rect(margin, y, timeColWidth, rowHeight);
    doc.text(time, margin + timeColWidth / 2, y + rowHeight / 2, { align: 'center', baseline: 'middle' });
    
    // Draw day cells
    DAYS.forEach((day, dayIndex) => {
      const x = margin + timeColWidth + (dayIndex * dayColWidth);
      const entries = scheduleGrid[day][time] || [];
      
      // Draw cell border
      doc.rect(x, y, dayColWidth, rowHeight);
      
      if (entries.length > 0) {
        // Light background for cells with content
        doc.setFillColor(230, 244, 255);
        doc.rect(x, y, dayColWidth, rowHeight, 'F');
        
        // Add course info
        let textY = y + 4;
        const maxWidth = dayColWidth - 4;
        
        entries.forEach((entry, i) => {
          // Course name (bold)
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          let courseName = entry.courseName;
          
          // Truncate long course names
          if (doc.getTextWidth(courseName) > maxWidth) {
            while (courseName.length > 3 && doc.getTextWidth(courseName + '...') > maxWidth) {
              courseName = courseName.substring(0, courseName.length - 1);
            }
            courseName += '...';
          }
          
          doc.text(courseName, x + 2, textY, { maxWidth });
          textY += 3.5;
          
          // NRC (smaller font)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text(`NRC: ${entry.nrc}`, x + 2, textY, { maxWidth });
          textY += 3.5;
          
          // Reset font size for next entry
          doc.setFontSize(8);
          
          // Add separator if there are more entries
          if (i < entries.length - 1) {
            doc.setDrawColor(200, 200, 200);
            doc.line(x + 2, textY, x + dayColWidth - 2, textY);
            textY += 2;
          }
        });
      }
    });
  });
  
  // Add NRC section
  const nrcStartY = startY + headerHeight + (TIME_SLOTS.length * rowHeight) + 15;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('NRCs', margin, nrcStartY);
  
  // Single-row NRCs that fit the page width
  const nrcArray = Array.from(allNRCs);
  const availableWidth = pageWidth - margin * 2;
  const minCellWidth = 14; // do not go smaller than this for legibility
  const cellHeight = 8;
  const dynamicCellWidth = Math.max(minCellWidth, Math.floor(availableWidth / Math.max(1, nrcArray.length)));
  const totalRowWidth = dynamicCellWidth * nrcArray.length;
  let startX = margin;
  if (totalRowWidth < availableWidth) {
    // center the row if it does not fill the width
    startX = margin + (availableWidth - totalRowWidth) / 2;
  }
  const y = nrcStartY + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  nrcArray.forEach((nrc, i) => {
    const x = startX + i * dynamicCellWidth;
    doc.rect(x, y, dynamicCellWidth, cellHeight);
    doc.text(String(nrc), x + dynamicCellWidth / 2, y + cellHeight / 2 + 1, { align: 'center', baseline: 'middle' });
  });
  
  // Small note for Excel copy
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text('Copia y pega esta fila directamente en Excel', margin, pageHeight - 10);
  
  // Save the PDF
  doc.save('calendario-clases.pdf');
}
