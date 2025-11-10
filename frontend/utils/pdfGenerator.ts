import { Course } from '../types/curriculum';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const;
const DAY_SHORT_TO_FULL: Record<string, string> = {
  'Lun': 'Lunes',
  'Mar': 'Martes',
  'Mié': 'Miércoles',
  'Jue': 'Jueves',
  'Vie': 'Viernes'
};

const TIME_SLOTS = [
  '07:00', '08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30'
];

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
  type?: string;
}

export function generateSchedulePDF(schedules: CourseSchedule[], courses: Course[]) {
  const scheduleGrid: Record<string, Record<string, ScheduleEntry>> = {};
  
  DAYS.forEach(day => {
    scheduleGrid[day] = {};
  });

  const allNRCs: string[] = [];

  schedules.forEach(schedule => {
    const course = courses.find(c => c.id === schedule.courseId);
    if (!course) return;

    if (schedule.nrc) allNRCs.push(schedule.nrc);
    if (schedule.hasEJ && schedule.nrcEJ) allNRCs.push(schedule.nrcEJ);
    if (schedule.hasLAB && schedule.nrcLAB) allNRCs.push(schedule.nrcLAB);

    schedule.sessions.forEach(session => {
      const fullDay = DAY_SHORT_TO_FULL[session.day];
      if (fullDay) {
        scheduleGrid[fullDay][session.startTime] = {
          courseName: course.code,
          nrc: schedule.nrc,
          type: ''
        };
      }
    });

    if (schedule.hasEJ && schedule.sessionsEJ) {
      schedule.sessionsEJ.forEach(session => {
        const fullDay = DAY_SHORT_TO_FULL[session.day];
        if (fullDay) {
          scheduleGrid[fullDay][session.startTime] = {
            courseName: `${course.code} EJ`,
            nrc: schedule.nrcEJ || '',
            type: 'EJ'
          };
        }
      });
    }

    if (schedule.hasLAB && schedule.sessionsLAB) {
      schedule.sessionsLAB.forEach(session => {
        const fullDay = DAY_SHORT_TO_FULL[session.day];
        if (fullDay) {
          scheduleGrid[fullDay][session.startTime] = {
            courseName: `${course.code} LAB`,
            nrc: schedule.nrcLAB || '',
            type: 'LAB'
          };
        }
      });
    }
  });

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Calendario de clases</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 30px;
          background: white;
        }
        
        h1 {
          text-align: center;
          color: #1a202c;
          margin-bottom: 30px;
          font-size: 28px;
          font-weight: 600;
        }
        
        .schedule-container {
          max-width: 1200px;
          margin: 0 auto;
          page-break-inside: avoid;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        th {
          background-color: #2563eb;
          color: white;
          padding: 12px 8px;
          text-align: center;
          font-weight: 600;
          font-size: 14px;
          border: 1px solid #1e40af;
        }
        
        td {
          border: 1px solid #d1d5db;
          padding: 10px;
          text-align: center;
          vertical-align: middle;
          height: 60px;
          font-size: 13px;
        }
        
        td.time-cell {
          background-color: #f3f4f6;
          font-weight: 600;
          color: #374151;
          width: 80px;
        }
        
        td.empty {
          background-color: #fafafa;
        }
        
        .course-box {
          background-color: #dbeafe;
          border: 2px solid #3b82f6;
          border-radius: 6px;
          padding: 8px;
          min-height: 50px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 4px;
        }
        
        .course-name {
          font-weight: 700;
          color: #1e40af;
          font-size: 13px;
        }
        
        .course-nrc {
          font-size: 11px;
          color: #475569;
          font-weight: 500;
        }
        
        .nrc-section {
          margin-top: 30px;
          page-break-inside: avoid;
        }
        
        .nrc-section h2 {
          font-size: 20px;
          color: #1a202c;
          margin-bottom: 15px;
          font-weight: 600;
        }
        
        .nrc-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          border: 2px solid #d1d5db;
          padding: 15px;
          background-color: #f9fafb;
          border-radius: 6px;
        }
        
        .nrc-cell {
          background-color: white;
          border: 1px solid #9ca3af;
          padding: 10px 15px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          border-radius: 4px;
          min-width: 80px;
          text-align: center;
        }
        
        @media print {
          body {
            padding: 15px;
          }
          
          h1 {
            font-size: 24px;
            margin-bottom: 20px;
          }
          
          .no-print {
            display: none;
          }
          
          table {
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <h1>Calendario de clases</h1>
      
      <div class="schedule-container">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              ${DAYS.map(day => `<th>${day}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
  `;

  TIME_SLOTS.forEach(time => {
    html += `
            <tr>
              <td class="time-cell">${time}</td>
    `;
    
    DAYS.forEach(day => {
      const entry = scheduleGrid[day][time];
      if (entry) {
        html += `
              <td>
                <div class="course-box">
                  <div class="course-name">${entry.courseName}</div>
                  <div class="course-nrc">NRC: ${entry.nrc}</div>
                </div>
              </td>
        `;
      } else {
        html += `
              <td class="empty"></td>
        `;
      }
    });
    
    html += `
            </tr>
    `;
  });

  html += `
          </tbody>
        </table>
        
        <div class="nrc-section">
          <h2>NRCs</h2>
          <div class="nrc-grid">
  `;

  allNRCs.forEach(nrc => {
    html += `
            <div class="nrc-cell">${nrc}</div>
    `;
  });

  html += `
          </div>
        </div>
      </div>
      
      <div class="no-print" style="margin-top: 40px; text-align: center;">
        <button onclick="window.print()" style="
          padding: 12px 24px;
          font-size: 16px;
          cursor: pointer;
          background-color: #2563eb;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
          Descargar PDF
        </button>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
