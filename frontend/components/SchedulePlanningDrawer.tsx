import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  X,
  Save,
  Trash2,
  AlertCircle,
  Download,
  Wifi,
  WifiOff,
  Zap,
  PenLine,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Course } from "../types/curriculum";
import { generateSchedulePDF } from "../utils/pdfGenerator";
import { useCourseOffer, type CourseOfferRow } from "../lib/useCourseOffer";
import {
  formatOfferSchedule,
  getLinkedOffers,
  getOfferCoursePreview,
  getOffersForSchedule,
  isOpenElectiveCourse,
  isValidOfferSchedule,
  nrcConflictsWithSlots,
  normalizeOfferCourseCodeInput,
  normalizeOfferDay as normalizeOfferDayLib,
  sessionsFromOfferRow,
  slotKey,
} from "../lib/offerMatching";
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"] as const;
type DayType = (typeof DAYS)[number];

function NrcSuggestions({
  label,
  suggestions,
  selectedNrc,
  totalOffers,
  onSelect,
}: {
  label: string;
  suggestions: CourseOfferRow[];
  selectedNrc: string;
  totalOffers: number;
  onSelect: (nrc: string) => void;
}) {
  if (totalOffers === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Sin ofertas para este curso en la base de datos.
      </p>
    );
  }

  if (suggestions.length === 0) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
        Ningún NRC disponible sin conflicto con tu horario actual ({totalOffers}{" "}
        en oferta).
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((row) => {
          const isSelected = selectedNrc === row.nrc;
          const avail =
            row.available !== null && row.total !== null
              ? `${row.available}/${row.total}`
              : null;
          return (
            <button
              key={row.nrc}
              type="button"
              onClick={() => onSelect(row.nrc)}
              className={`text-left text-xs rounded-lg border px-2.5 py-1.5 transition-colors max-w-full ${
                isSelected
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500"
                  : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-600/50 text-gray-700 dark:text-gray-200 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20"
              }`}
            >
              <span className="font-semibold">{row.nrc}</span>
              {row.paralelo && (
                <span className="text-gray-400 dark:text-gray-500">
                  {" "}
                  · P{row.paralelo}
                </span>
              )}
              <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {formatOfferSchedule(row)}
              </span>
              {row.teacher && (
                <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">
                  {row.teacher}
                </span>
              )}
              {avail && (
                <span className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                  {avail} disp.
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function normalizeOfferDay(day: string): DayType | null {
  const short = normalizeOfferDayLib(day);
  if (!short || !(DAYS as readonly string[]).includes(short)) return null;
  return short as DayType;
}

type PeriodType = "semestre" | "verano";
type SemesterDayPair = "Lun/Mié" | "Mar/Jue";
type SummerDayGroup = "Lun-Jue";

const SEMESTER_PAIRS: Record<SemesterDayPair, DayType[]> = {
  "Lun/Mié": ["Lun", "Mié"],
  "Mar/Jue": ["Mar", "Jue"],
};

const SUMMER_DAYS: DayType[] = ["Lun", "Mar", "Mié", "Jue"];
const SEMESTER_PAIR_OPTIONS: SemesterDayPair[] = ["Lun/Mié", "Mar/Jue"];

const TIME_SLOTS = [
  "07:00",
  "08:30",
  "10:00",
  "11:30",
  "13:00",
  "14:30",
  "16:00",
  "17:30",
];

interface CourseSchedule {
  courseId: string;
  /** USFQ code chosen for open electives (e.g. IIN-4011) */
  offerCourseCode?: string;
  nrc: string;
  hasEJ: boolean;
  hasLAB: boolean;
  nrcEJ?: string;
  nrcLAB?: string;
  sessions: {
    day: DayType;
    startTime: string;
  }[];
  sessionsEJ?: {
    day: DayType;
    startTime: string;
  }[];
  sessionsLAB?: {
    day: DayType;
    startTime: string;
  }[];
}

interface SchedulePlanningDrawerProps {
  plannedCourses: Course[];
  onSave: (schedules: CourseSchedule[]) => void;
  exposeOpen?: (openFn: () => void) => void;
  hideFloatingButton?: boolean;
}

interface PackedMainSession {
  dayGroup: SemesterDayPair | SummerDayGroup | DayType;
  startTime: string;
}

function expandMainSession(
  periodType: PeriodType,
  dayGroup: string,
  startTime: string,
): { day: DayType; startTime: string }[] {
  if (periodType === "verano") {
    return SUMMER_DAYS.map((day) => ({ day, startTime }));
  }
  const days = SEMESTER_PAIRS[dayGroup as SemesterDayPair];
  if (days) {
    return days.map((day) => ({ day, startTime }));
  }
  return [{ day: dayGroup as DayType, startTime }];
}

function packMainSessions(
  periodType: PeriodType,
  sessions: { day: DayType; startTime: string }[],
): PackedMainSession[] {
  const byTime = new Map<string, Set<DayType>>();
  sessions.forEach((s) => {
    if (!byTime.has(s.startTime)) byTime.set(s.startTime, new Set());
    byTime.get(s.startTime)!.add(s.day);
  });

  const packed: PackedMainSession[] = [];

  byTime.forEach((days, startTime) => {
    if (periodType === "verano") {
      if (SUMMER_DAYS.every((d) => days.has(d))) {
        packed.push({ dayGroup: "Lun-Jue", startTime });
        SUMMER_DAYS.forEach((d) => days.delete(d));
      }
    } else {
      SEMESTER_PAIR_OPTIONS.forEach((pair) => {
        const pairDays = SEMESTER_PAIRS[pair];
        if (pairDays.every((d) => days.has(d))) {
          packed.push({ dayGroup: pair, startTime });
          pairDays.forEach((d) => days.delete(d));
        }
      });
    }
    days.forEach((day) => {
      packed.push({ dayGroup: day, startTime });
    });
  });

  return packed;
}

function convertMainSessionsOnPeriodChange(
  sessions: { day: DayType; startTime: string }[],
  from: PeriodType,
  to: PeriodType,
): { day: DayType; startTime: string }[] {
  if (from === to) return sessions;

  const byTime = new Map<string, Set<DayType>>();
  sessions.forEach((s) => {
    if (!byTime.has(s.startTime)) byTime.set(s.startTime, new Set());
    byTime.get(s.startTime)!.add(s.day);
  });

  const converted: { day: DayType; startTime: string }[] = [];

  byTime.forEach((days, startTime) => {
    if (from === "verano" && to === "semestre") {
      if (SUMMER_DAYS.every((d) => days.has(d))) {
        SEMESTER_PAIR_OPTIONS.forEach((pair) => {
          SEMESTER_PAIRS[pair].forEach((day) =>
            converted.push({ day, startTime }),
          );
        });
      } else {
        days.forEach((day) => converted.push({ day, startTime }));
      }
    } else if (from === "semestre" && to === "verano") {
      const hasLunMie = SEMESTER_PAIRS["Lun/Mié"].every((d) => days.has(d));
      const hasMarJue = SEMESTER_PAIRS["Mar/Jue"].every((d) => days.has(d));
      if (hasLunMie && hasMarJue) {
        SUMMER_DAYS.forEach((day) => converted.push({ day, startTime }));
      } else {
        days.forEach((day) => converted.push({ day, startTime }));
      }
    }
  });

  return converted;
}

function AvailabilityBadge({ row }: { row: CourseOfferRow | undefined }) {
  if (!row || row.available === null || row.total === null) return null;
  const ratio = row.total > 0 ? row.available / row.total : 0;
  const color =
    ratio > 0.3
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : ratio > 0
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${color}`}
    >
      {row.available}/{row.total} disponibles
    </span>
  );
}

function NrcOfferInfo({
  nrc,
  offerMap,
}: {
  nrc: string;
  offerMap: Map<string, CourseOfferRow>;
}) {
  const row = nrc.length >= 4 ? offerMap.get(nrc) : undefined;
  if (!row) return null;
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 mt-1">
      {row.teacher && (
        <div>
          Profesor:{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {row.teacher}
          </span>
        </div>
      )}
      {row.days.length > 0 && row.start_time && (
        <div>
          Horario oferta:{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {row.days.join(", ")} {row.start_time}
            {row.end_time ? `–${row.end_time}` : ""}
          </span>
        </div>
      )}
      <AvailabilityBadge row={row} />
    </div>
  );
}

export default function SchedulePlanningDrawer({
  plannedCourses,
  onSave,
  exposeOpen,
  hideFloatingButton,
}: SchedulePlanningDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("semestre");
  const [entryMode, setEntryMode] = useState<"auto" | "manual">("auto");
  const [schedules, setSchedules] = useState<CourseSchedule[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const {
    offerMap,
    isLoading: offerLoading,
    lastRefreshed,
    error: offerError,
    loadFromCache,
  } = useCourseOffer();

  useEffect(() => {
    const initialSchedules: CourseSchedule[] = plannedCourses.map((course) => ({
      courseId: course.id,
      offerCourseCode: "",
      nrc: "",
      hasEJ: false,
      hasLAB: false,
      sessions: [],
    }));
    setSchedules(initialSchedules);
  }, [plannedCourses]);

  const checkConflicts = (newSchedules: CourseSchedule[]) => {
    const conflictList: string[] = [];
    const occupied: { [key: string]: string } = {};

    newSchedules.forEach((schedule) => {
      schedule.sessions.forEach((session) => {
        const key = `${session.day}-${session.startTime}`;
        if (occupied[key]) {
          const course1 =
            plannedCourses.find((c) => c.id === occupied[key])?.code ||
            occupied[key];
          const course2 =
            plannedCourses.find((c) => c.id === schedule.courseId)?.code ||
            schedule.courseId;
          const conflictMsg = `Conflicto: ${course1} y ${course2} en ${session.day} a las ${session.startTime}`;
          if (!conflictList.includes(conflictMsg)) {
            conflictList.push(conflictMsg);
          }
        } else {
          occupied[key] = schedule.courseId;
        }
      });

      if (schedule.hasEJ && schedule.sessionsEJ) {
        schedule.sessionsEJ.forEach((session) => {
          const key = `${session.day}-${session.startTime}`;
          if (occupied[key]) {
            const course1 =
              plannedCourses.find((c) => c.id === occupied[key])?.code ||
              occupied[key];
            const course2 =
              plannedCourses.find((c) => c.id === schedule.courseId)?.code ||
              schedule.courseId;
            const conflictMsg = `Conflicto: ${course1} (EJ) y ${course2} en ${session.day} a las ${session.startTime}`;
            if (!conflictList.includes(conflictMsg)) {
              conflictList.push(conflictMsg);
            }
          } else {
            occupied[key] = schedule.courseId;
          }
        });
      }

      if (schedule.hasLAB && schedule.sessionsLAB) {
        schedule.sessionsLAB.forEach((session) => {
          const key = `${session.day}-${session.startTime}`;
          if (occupied[key]) {
            const course1 =
              plannedCourses.find((c) => c.id === occupied[key])?.code ||
              occupied[key];
            const course2 =
              plannedCourses.find((c) => c.id === schedule.courseId)?.code ||
              schedule.courseId;
            const conflictMsg = `Conflicto: ${course1} (LAB) y ${course2} en ${session.day} a las ${session.startTime}`;
            if (!conflictList.includes(conflictMsg)) {
              conflictList.push(conflictMsg);
            }
          } else {
            occupied[key] = schedule.courseId;
          }
        });
      }
    });

    setConflicts(conflictList);
    return conflictList.length === 0;
  };

  const getDefaultMainDayGroup = (): SemesterDayPair | SummerDayGroup =>
    periodType === "verano" ? "Lun-Jue" : "Lun/Mié";

  const addMainSession = (courseId: string) => {
    const dayGroup = getDefaultMainDayGroup();
    const newSessions = expandMainSession(periodType, dayGroup, "07:00");
    const updated = schedules.map((s) =>
      s.courseId === courseId
        ? { ...s, sessions: [...s.sessions, ...newSessions] }
        : s,
    );
    setSchedules(updated);
    checkConflicts(updated);
  };

  const removeMainSession = (courseId: string, packedIndex: number) => {
    const updated = schedules.map((s) => {
      if (s.courseId !== courseId) return s;
      const packed = packMainSessions(periodType, s.sessions);
      const toRemove = packed[packedIndex];
      if (!toRemove) return s;
      const daysToRemove = new Set(
        expandMainSession(
          periodType,
          toRemove.dayGroup,
          toRemove.startTime,
        ).map((sess) => sess.day),
      );
      return {
        ...s,
        sessions: s.sessions.filter(
          (sess) =>
            !(
              daysToRemove.has(sess.day) &&
              sess.startTime === toRemove.startTime
            ),
        ),
      };
    });
    setSchedules(updated);
    checkConflicts(updated);
  };

  const updateMainSession = (
    courseId: string,
    packedIndex: number,
    field: "dayGroup" | "startTime",
    value: string,
  ) => {
    const updated = schedules.map((s) => {
      if (s.courseId !== courseId) return s;
      const packed = packMainSessions(periodType, s.sessions);
      const current = packed[packedIndex];
      if (!current) return s;

      const newDayGroup = field === "dayGroup" ? value : current.dayGroup;
      const newStartTime = field === "startTime" ? value : current.startTime;
      const daysToRemove = new Set(
        expandMainSession(periodType, current.dayGroup, current.startTime).map(
          (sess) => sess.day,
        ),
      );

      const remaining = s.sessions.filter(
        (sess) =>
          !(daysToRemove.has(sess.day) && sess.startTime === current.startTime),
      );
      const expanded = expandMainSession(periodType, newDayGroup, newStartTime);

      return { ...s, sessions: [...remaining, ...expanded] };
    });
    setSchedules(updated);
    checkConflicts(updated);
  };

  const handlePeriodTypeChange = (newPeriod: PeriodType) => {
    if (newPeriod === periodType) return;
    const updated = schedules.map((s) => ({
      ...s,
      sessions: convertMainSessionsOnPeriodChange(
        s.sessions,
        periodType,
        newPeriod,
      ),
    }));
    setPeriodType(newPeriod);
    setSchedules(updated);
    checkConflicts(updated);
  };

  const generateHTMLReport = () => {
    // Build a grid: days as columns, hours as rows
    const DAYS_FULL = [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
    ] as const;
    const MAP_SHORT: Record<string, string> = {
      Lun: "Lunes",
      Mar: "Martes",
      Mié: "Miércoles",
      Mie: "Miércoles",
      Jue: "Jueves",
      Vie: "Viernes",
    };

    const grid: Record<
      string,
      Record<string, Array<{ title: string; nrc: string }>>
    > = {};
    DAYS_FULL.forEach((d) => {
      grid[d] = {};
      TIME_SLOTS.forEach((t) => (grid[d][t] = []));
    });

    const allNrcs = new Set<string>();

    schedules.forEach((s) => {
      const course = plannedCourses.find((c) => c.id === s.courseId);
      if (!course) return;
      const base = course.title.replace(/(\s+EJ|\s+LAB)$/i, "").trim();

      if (s.nrc) {
        allNrcs.add(s.nrc);
        s.sessions.forEach((sess) => {
          const day = MAP_SHORT[sess.day] ?? sess.day;
          if (grid[day]?.[sess.startTime])
            grid[day][sess.startTime].push({ title: base, nrc: s.nrc });
        });
      }
      if (s.hasEJ && s.nrcEJ && s.sessionsEJ) {
        allNrcs.add(s.nrcEJ);
        s.sessionsEJ.forEach((sess) => {
          const day = MAP_SHORT[sess.day] ?? sess.day;
          if (grid[day]?.[sess.startTime])
            grid[day][sess.startTime].push({
              title: `${base} EJ`,
              nrc: s.nrcEJ!,
            });
        });
      }
      if (s.hasLAB && s.nrcLAB && s.sessionsLAB) {
        allNrcs.add(s.nrcLAB);
        s.sessionsLAB.forEach((sess) => {
          const day = MAP_SHORT[sess.day] ?? sess.day;
          if (grid[day]?.[sess.startTime])
            grid[day][sess.startTime].push({
              title: `${base} LAB`,
              nrc: s.nrcLAB!,
            });
        });
      }
    });

    const tableHeader = `
      <tr>
        <th class="time">Hora</th>
        ${DAYS_FULL.map((d) => `<th>${d}</th>`).join("")}
      </tr>
    `;

    const tableBody = TIME_SLOTS.map((time) => {
      const cells = DAYS_FULL.map((day) => {
        const entries = grid[day][time];
        if (!entries.length) return `<td></td>`;
        const content = entries
          .map(
            (e) => `
          <div class="entry">
            <div class="title">${e.title}</div>
            <div class="nrc">NRC: ${e.nrc}</div>
          </div>
        `,
          )
          .join("");
        return `<td class="filled">${content}</td>`;
      }).join("");
      return `
        <tr>
          <td class="time">${time}</td>
          ${cells}
        </tr>
      `;
    }).join("");

    const nrcs = Array.from(allNrcs);
    const nrcRow = nrcs.length
      ? `<div class="nrcs">
           ${nrcs.map((n) => `<div class="nrc-cell">${n}</div>`).join("")}
         </div>`
      : "";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>Calendario de clases</title>
        <style>
          :root{ --border:#d1d5db; --head:#0f172a; --bg:#ffffff; --filled:#e6f4ff; --text:#0f172a; }
          *{ box-sizing:border-box; }
          body{ font-family:Arial, Helvetica, sans-serif; color:var(--text); background:var(--bg); margin:0; padding:24px; }
          h1{ text-align:center; margin:0 0 16px; font-size:24px; }
          .schedule{ width:100%; border-collapse:collapse; table-layout:fixed; }
          .schedule th, .schedule td{ border:1px solid var(--border); padding:6px; vertical-align:top; }
          .schedule th{ background:var(--head); color:#fff; font-weight:700; text-align:center; }
          .schedule th.time, .schedule td.time{ width:70px; text-align:center; font-weight:700; background:#f8fafc; }
          .schedule td{ height:60px; }
          .schedule td.filled{ background:var(--filled); }
          .entry{ margin-bottom:6px; }
          .entry:last-child{ margin-bottom:0; }
          .entry .title{ font-weight:700; font-size:12px; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .entry .nrc{ font-size:11px; color:#334155; }
          h2{ margin:20px 0 8px; font-size:16px; }
          .nrcs{ display:flex; flex-wrap:wrap; gap:6px; }
          .nrc-cell{ border:1px solid var(--border); padding:6px 10px; border-radius:4px; font-size:12px; background:#fff; }
          .controls{ text-align:center; margin-top:20px; }
          .btn{ padding:10px 16px; border:1px solid #0f172a; background:#0f172a; color:#fff; border-radius:6px; cursor:pointer; }
          @media print{ .no-print{ display:none; } body{ padding:8px; } }
        </style>
      </head>
      <body>
        <h1>Calendario de clases</h1>
        <table class="schedule">
          <thead>${tableHeader}</thead>
          <tbody>${tableBody}</tbody>
        </table>
        ${nrcs.length ? "<h2>NRCs</h2>" : ""}
        ${nrcRow}
        <div class="controls no-print">
          <button class="btn" onclick="window.print()">Imprimir / Guardar como PDF</button>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleSave = async () => {
    if (checkConflicts(schedules)) {
      generateHTMLReport();
      onSave(schedules);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    const cleared = schedules.map((s) => ({
      ...s,
      offerCourseCode: "",
      nrc: "",
      hasEJ: false,
      hasLAB: false,
      nrcEJ: "",
      nrcLAB: "",
      sessions: [],
      sessionsEJ: [],
      sessionsLAB: [],
    }));
    setSchedules(cleared);
    setConflicts([]);
  };

  const getScheduleForSlot = (day: DayType, time: string) => {
    for (const schedule of schedules) {
      for (const session of schedule.sessions) {
        if (session.day === day && session.startTime === time) {
          const course = plannedCourses.find((c) => c.id === schedule.courseId);
          return course
            ? { code: course.code, title: course.title, type: "" }
            : null;
        }
      }

      if (schedule.hasEJ && schedule.sessionsEJ) {
        for (const session of schedule.sessionsEJ) {
          if (session.day === day && session.startTime === time) {
            const course = plannedCourses.find(
              (c) => c.id === schedule.courseId,
            );
            return course
              ? { code: course.code, title: course.title, type: "EJ" }
              : null;
          }
        }
      }

      if (schedule.hasLAB && schedule.sessionsLAB) {
        for (const session of schedule.sessionsLAB) {
          if (session.day === day && session.startTime === time) {
            const course = plannedCourses.find(
              (c) => c.id === schedule.courseId,
            );
            return course
              ? { code: course.code, title: course.title, type: "LAB" }
              : null;
          }
        }
      }
    }
    return null;
  };

  useEffect(() => {
    if (exposeOpen) {
      exposeOpen(() => setIsOpen(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOpen && offerMap.size === 0) {
      loadFromCache();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill helpers ─────────────────────────────────────────────────────

  const sessionsFromOffer = (
    nrc: string,
  ): { day: DayType; startTime: string }[] => {
    const row = offerMap.get(nrc);
    if (!row) return [];
    return sessionsFromOfferRow(row)
      .map((s) => {
        const day = normalizeOfferDay(s.day);
        return day ? { day, startTime: s.startTime } : null;
      })
      .filter((s): s is { day: DayType; startTime: string } => s !== null);
  };

  const getOccupiedSlots = useCallback(
    (excludeCourseId?: string): Set<string> => {
      const occupied = new Set<string>();
      schedules.forEach((s) => {
        if (excludeCourseId && s.courseId === excludeCourseId) return;
        const allSessions = [
          ...s.sessions,
          ...(s.sessionsEJ || []),
          ...(s.sessionsLAB || []),
        ];
        allSessions.forEach((sess) =>
          occupied.add(slotKey(sess.day, sess.startTime)),
        );
      });
      return occupied;
    },
    [schedules],
  );

  const filterSuggestions = useCallback(
    (
      offers: CourseOfferRow[],
      excludeCourseId: string,
    ): { suggestions: CourseOfferRow[]; totalOffers: number } => {
      const valid = offers.filter(isValidOfferSchedule);
      const occupied = getOccupiedSlots(excludeCourseId);
      const suggestions = valid
        .filter((row) => !nrcConflictsWithSlots(row.nrc, occupied, offerMap))
        .sort((a, b) => (b.available ?? -999) - (a.available ?? -999));
      return { suggestions, totalOffers: valid.length };
    },
    [getOccupiedSlots, offerMap],
  );

  const applyAutoFillFromOffer = (
    current: CourseSchedule[],
  ): CourseSchedule[] => {
    if (entryMode !== "auto") return current;
    return current.map((s) => {
      const next = { ...s };
      if (s.nrc && offerMap.has(s.nrc)) {
        next.sessions = sessionsFromOffer(s.nrc);
      }
      if (s.hasEJ && s.nrcEJ && offerMap.has(s.nrcEJ)) {
        next.sessionsEJ = sessionsFromOffer(s.nrcEJ);
      }
      if (s.hasLAB && s.nrcLAB && offerMap.has(s.nrcLAB)) {
        next.sessionsLAB = sessionsFromOffer(s.nrcLAB);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen || entryMode !== "auto" || offerMap.size === 0) return;
    setSchedules((prev) => {
      const updated = applyAutoFillFromOffer(prev);
      checkConflicts(updated);
      return updated;
    });
  }, [isOpen, entryMode, offerMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOfferCourseCodeChange = (courseId: string, raw: string) => {
    const offerCourseCode = normalizeOfferCourseCodeInput(raw);
    const updated = schedules.map((s) => {
      if (s.courseId !== courseId) return s;
      return {
        ...s,
        offerCourseCode,
        nrc: "",
        sessions: [],
        nrcEJ: "",
        sessionsEJ: undefined,
        nrcLAB: "",
        sessionsLAB: undefined,
        hasEJ: false,
        hasLAB: false,
      };
    });
    setSchedules(updated);
    checkConflicts(updated);
  };

  const handleNrcChange = (courseId: string, raw: string) => {
    const nrc = raw.replace(/\D/g, "").slice(0, 6);
    const updated = schedules.map((s) => {
      if (s.courseId !== courseId) return s;
      const next = { ...s, nrc };
      if (entryMode === "auto" && offerMap.has(nrc)) {
        next.sessions = sessionsFromOffer(nrc);
      }
      return next;
    });
    setSchedules(updated);
    checkConflicts(updated);
  };

  const handleNrcEJChange = (courseId: string, raw: string) => {
    const nrcEJ = raw.replace(/\D/g, "").slice(0, 6);
    const updated = schedules.map((s) => {
      if (s.courseId !== courseId) return s;
      const next = { ...s, nrcEJ };
      if (entryMode === "auto" && offerMap.has(nrcEJ)) {
        next.sessionsEJ = sessionsFromOffer(nrcEJ);
      }
      return next;
    });
    setSchedules(updated);
    checkConflicts(updated);
  };

  const handleNrcLABChange = (courseId: string, raw: string) => {
    const nrcLAB = raw.replace(/\D/g, "").slice(0, 6);
    const updated = schedules.map((s) => {
      if (s.courseId !== courseId) return s;
      const next = { ...s, nrcLAB };
      if (entryMode === "auto" && offerMap.has(nrcLAB)) {
        next.sessionsLAB = sessionsFromOffer(nrcLAB);
      }
      return next;
    });
    setSchedules(updated);
    checkConflicts(updated);
  };

  return (
    <>
      {!hideFloatingButton && (
        <div className="fixed bottom-4 right-4 z-30">
          <Card className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 p-0 py-0">
            <Button
              size="sm"
              onClick={() => setIsOpen(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white gap-2 px-3 py-2"
            >
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Preparación</span>
            </Button>
          </Card>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          <div className="w-[90vw] max-w-6xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10">
              <div className="flex justify-between items-center gap-4 flex-wrap">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Preparación de horario
                </h2>

                {/* Entry mode toggle */}
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => setEntryMode("auto")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      entryMode === "auto"
                        ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Automático
                  </button>
                  <button
                    onClick={() => setEntryMode("manual")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      entryMode === "manual"
                        ? "bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    Manual
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    Período:
                  </span>
                  <Select
                    value={periodType}
                    onValueChange={(v) =>
                      handlePeriodTypeChange(v as PeriodType)
                    }
                  >
                    <SelectTrigger className="w-36 dark:bg-gray-700 dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semestre">Semestre</SelectItem>
                      <SelectItem value="verano">Verano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {entryMode === "auto"
                  ? "Modo automático: ingresa el NRC y el horario se llena desde la oferta de cursos."
                  : periodType === "semestre"
                    ? "Modo manual · Clase principal: Lun/Mié o Mar/Jue. EJ y LAB: por día."
                    : "Modo manual · Clase principal: Lun a Jue. EJ y LAB: por día."}
              </p>

              {/* Offer status bar */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                {offerMap.size > 0 ? (
                  <Wifi className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {offerLoading
                    ? "Cargando oferta…"
                    : offerMap.size > 0
                      ? `${offerMap.size} NRCs disponibles${lastRefreshed ? ` · actualizado ${lastRefreshed.toLocaleDateString()}` : ""}`
                      : "Sin datos de oferta"}
                </span>
                {offerError && (
                  <span className="text-xs text-red-500 ml-auto">
                    {offerError}
                  </span>
                )}
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
                    No hay materias planeadas. Marca materias como "planeadas"
                    en la malla curricular.
                  </p>
                ) : (
                  plannedCourses.map((course) => {
                    const schedule = schedules.find(
                      (s) => s.courseId === course.id,
                    );
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

                          <div className="space-y-3">
                            {isOpenElectiveCourse(course) && (
                              <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                                  Código de materia
                                </label>
                                <Input
                                  placeholder="ej. CMP-4001"
                                  value={schedule.offerCourseCode || ""}
                                  onChange={(e) =>
                                    handleOfferCourseCodeChange(
                                      course.id,
                                      e.target.value,
                                    )
                                  }
                                  className="w-48 dark:bg-gray-600 dark:border-gray-500 uppercase"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Ingresa el código USFQ de la materia que
                                  tomarás para ver NRCs disponibles.
                                </p>
                                {schedule.offerCourseCode &&
                                  (() => {
                                    const preview = getOfferCoursePreview(
                                      offerMap,
                                      schedule.offerCourseCode,
                                    );
                                    if (!preview)
                                      return (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                          Código no encontrado en la oferta
                                          actual.
                                        </p>
                                      );
                                    return (
                                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                        <span className="font-medium">
                                          {preview.course_code}
                                        </span>
                                        {" — "}
                                        {preview.title}
                                      </p>
                                    );
                                  })()}
                              </div>
                            )}

                            <div className="flex gap-2 items-start">
                              <div>
                                <Input
                                  placeholder="NRC (4–6 díg.)"
                                  value={schedule.nrc}
                                  onChange={(e) =>
                                    handleNrcChange(course.id, e.target.value)
                                  }
                                  inputMode="numeric"
                                  maxLength={6}
                                  className="w-40 dark:bg-gray-600 dark:border-gray-500"
                                />
                                <NrcOfferInfo
                                  nrc={schedule.nrc}
                                  offerMap={offerMap}
                                />
                                {entryMode === "auto" &&
                                  offerMap.size > 0 &&
                                  (() => {
                                    if (
                                      isOpenElectiveCourse(course) &&
                                      !schedule.offerCourseCode?.trim()
                                    ) {
                                      return (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                                          Ingresa el código de materia para ver
                                          sugerencias de NRC.
                                        </p>
                                      );
                                    }
                                    const { suggestions, totalOffers } =
                                      filterSuggestions(
                                        getOffersForSchedule(
                                          offerMap,
                                          course,
                                          schedule.offerCourseCode,
                                          "Teoría",
                                        ),
                                        course.id,
                                      );
                                    return (
                                      <NrcSuggestions
                                        label={`Sugerencias (${suggestions.length}${totalOffers > suggestions.length ? ` de ${totalOffers}` : ""})`}
                                        suggestions={suggestions}
                                        selectedNrc={schedule.nrc}
                                        totalOffers={totalOffers}
                                        onSelect={(nrc) =>
                                          handleNrcChange(course.id, nrc)
                                        }
                                      />
                                    );
                                  })()}
                              </div>
                            </div>

                            <div className="flex gap-4">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`ej-${course.id}`}
                                  checked={schedule.hasEJ}
                                  onCheckedChange={(checked) => {
                                    const updated = schedules.map((s) =>
                                      s.courseId === course.id
                                        ? {
                                            ...s,
                                            hasEJ: checked as boolean,
                                            sessionsEJ: checked
                                              ? []
                                              : undefined,
                                          }
                                        : s,
                                    );
                                    setSchedules(updated);
                                    checkConflicts(updated);
                                  }}
                                />
                                <label
                                  htmlFor={`ej-${course.id}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  EJ (Ejercicios)
                                </label>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`lab-${course.id}`}
                                  checked={schedule.hasLAB}
                                  onCheckedChange={(checked) => {
                                    const updated = schedules.map((s) =>
                                      s.courseId === course.id
                                        ? {
                                            ...s,
                                            hasLAB: checked as boolean,
                                            sessionsLAB: checked
                                              ? []
                                              : undefined,
                                          }
                                        : s,
                                    );
                                    setSchedules(updated);
                                    checkConflicts(updated);
                                  }}
                                />
                                <label
                                  htmlFor={`lab-${course.id}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  LAB (Laboratorio)
                                </label>
                              </div>
                            </div>

                            {schedule.hasEJ && (
                              <div className="flex gap-2 items-start pl-4 border-l-2 border-blue-500">
                                <span className="text-sm font-medium text-blue-600 dark:text-blue-400 pt-2">
                                  EJ:
                                </span>
                                <div>
                                  <Input
                                    placeholder="NRC Ejercicios (4–6 díg.)"
                                    value={schedule.nrcEJ || ""}
                                    onChange={(e) =>
                                      handleNrcEJChange(
                                        course.id,
                                        e.target.value,
                                      )
                                    }
                                    inputMode="numeric"
                                    maxLength={6}
                                    className="w-48 dark:bg-gray-600 dark:border-gray-500"
                                  />
                                  <NrcOfferInfo
                                    nrc={schedule.nrcEJ || ""}
                                    offerMap={offerMap}
                                  />
                                  {entryMode === "auto" &&
                                    offerMap.size > 0 &&
                                    (() => {
                                      if (
                                        isOpenElectiveCourse(course) &&
                                        !schedule.offerCourseCode?.trim()
                                      )
                                        return null;
                                      const mainRow = schedule.nrc
                                        ? offerMap.get(schedule.nrc)
                                        : undefined;
                                      const ejOffers = mainRow
                                        ? getLinkedOffers(
                                            mainRow,
                                            offerMap,
                                            "Ejercicios",
                                          )
                                        : getOffersForSchedule(
                                            offerMap,
                                            course,
                                            schedule.offerCourseCode,
                                            "Ejercicios",
                                          );
                                      const { suggestions, totalOffers } =
                                        filterSuggestions(ejOffers, course.id);
                                      return (
                                        <NrcSuggestions
                                          label={`Sugerencias EJ (${suggestions.length}${totalOffers > suggestions.length ? ` de ${totalOffers}` : ""})`}
                                          suggestions={suggestions}
                                          selectedNrc={schedule.nrcEJ || ""}
                                          totalOffers={totalOffers}
                                          onSelect={(nrc) =>
                                            handleNrcEJChange(course.id, nrc)
                                          }
                                        />
                                      );
                                    })()}
                                </div>
                              </div>
                            )}

                            {schedule.hasLAB && (
                              <div className="flex gap-2 items-start pl-4 border-l-2 border-green-500">
                                <span className="text-sm font-medium text-green-600 dark:text-green-400 pt-2">
                                  LAB:
                                </span>
                                <div>
                                  <Input
                                    placeholder="NRC Laboratorio (4–6 díg.)"
                                    value={schedule.nrcLAB || ""}
                                    onChange={(e) =>
                                      handleNrcLABChange(
                                        course.id,
                                        e.target.value,
                                      )
                                    }
                                    inputMode="numeric"
                                    maxLength={6}
                                    className="w-48 dark:bg-gray-600 dark:border-gray-500"
                                  />
                                  <NrcOfferInfo
                                    nrc={schedule.nrcLAB || ""}
                                    offerMap={offerMap}
                                  />
                                  {entryMode === "auto" &&
                                    offerMap.size > 0 &&
                                    (() => {
                                      if (
                                        isOpenElectiveCourse(course) &&
                                        !schedule.offerCourseCode?.trim()
                                      )
                                        return null;
                                      const mainRow = schedule.nrc
                                        ? offerMap.get(schedule.nrc)
                                        : undefined;
                                      const labOffers = mainRow
                                        ? getLinkedOffers(
                                            mainRow,
                                            offerMap,
                                            "Laboratorio",
                                          )
                                        : getOffersForSchedule(
                                            offerMap,
                                            course,
                                            schedule.offerCourseCode,
                                            "Laboratorio",
                                          );
                                      const { suggestions, totalOffers } =
                                        filterSuggestions(labOffers, course.id);
                                      return (
                                        <NrcSuggestions
                                          label={`Sugerencias LAB (${suggestions.length}${totalOffers > suggestions.length ? ` de ${totalOffers}` : ""})`}
                                          suggestions={suggestions}
                                          selectedNrc={schedule.nrcLAB || ""}
                                          totalOffers={totalOffers}
                                          onSelect={(nrc) =>
                                            handleNrcLABChange(course.id, nrc)
                                          }
                                        />
                                      );
                                    })()}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-4">
                            {/* ── Clase principal ── */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Clase Principal
                                </span>
                                {entryMode === "auto" && (
                                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                                    <Zap className="w-3 h-3" />
                                    Auto
                                  </span>
                                )}
                              </div>

                              {entryMode === "auto" ? (
                                /* Auto mode: show read-only chips from offer data */
                                schedule.sessions.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {schedule.sessions.map((s, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 px-2.5 py-1.5 rounded-lg"
                                      >
                                        <Lock className="w-3 h-3 opacity-60" />
                                        {s.day} · {s.startTime}
                                      </span>
                                    ))}
                                    <button
                                      onClick={() => setEntryMode("manual")}
                                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline underline-offset-2"
                                    >
                                      Editar manualmente
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                                    <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                                    {schedule.nrc.length >= 4
                                      ? offerMap.has(schedule.nrc)
                                        ? `NRC ${schedule.nrc} encontrado pero el horario no se pudo interpretar — cambia a manual.`
                                        : `NRC ${schedule.nrc} no encontrado en la oferta — prueba refrescar o cambia a manual.`
                                      : "Ingresa el NRC (4–6 dígitos) para cargar el horario automáticamente."}
                                  </div>
                                )
                              ) : (
                                /* Manual mode: full day/time editors */
                                <>
                                  {packMainSessions(
                                    periodType,
                                    schedule.sessions,
                                  ).map((session, idx) => (
                                    <div
                                      key={idx}
                                      className="flex gap-2 items-center"
                                    >
                                      <Select
                                        value={session.dayGroup}
                                        onValueChange={(value) =>
                                          updateMainSession(
                                            course.id,
                                            idx,
                                            "dayGroup",
                                            value,
                                          )
                                        }
                                      >
                                        <SelectTrigger className="w-32 dark:bg-gray-600 dark:border-gray-500">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {periodType === "semestre" ? (
                                            SEMESTER_PAIR_OPTIONS.map(
                                              (pair) => (
                                                <SelectItem
                                                  key={pair}
                                                  value={pair}
                                                >
                                                  {pair}
                                                </SelectItem>
                                              ),
                                            )
                                          ) : (
                                            <SelectItem value="Lun-Jue">
                                              Lun - Jue
                                            </SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>

                                      <Select
                                        value={session.startTime}
                                        onValueChange={(value) =>
                                          updateMainSession(
                                            course.id,
                                            idx,
                                            "startTime",
                                            value,
                                          )
                                        }
                                      >
                                        <SelectTrigger className="w-28 dark:bg-gray-600 dark:border-gray-500">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {TIME_SLOTS.map((time) => (
                                            <SelectItem key={time} value={time}>
                                              {time}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>

                                      <span className="text-sm text-gray-600 dark:text-gray-400">
                                        (1h30min)
                                      </span>

                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          removeMainSession(course.id, idx)
                                        }
                                        className="dark:hover:bg-gray-600"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addMainSession(course.id)}
                                    className="dark:border-gray-500 dark:hover:bg-gray-600"
                                  >
                                    + Agregar sesión
                                  </Button>
                                </>
                              )}
                            </div>

                            {schedule.hasEJ && (
                              <div className="space-y-2 pl-4 border-l-2 border-blue-500">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                    Ejercicios (EJ)
                                  </span>
                                  {entryMode === "auto" && (
                                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                                      <Zap className="w-2.5 h-2.5" />
                                      Auto
                                    </span>
                                  )}
                                </div>

                                {entryMode === "auto" ? (
                                  (schedule.sessionsEJ || []).length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                      {(schedule.sessionsEJ || []).map(
                                        (s, i) => (
                                          <span
                                            key={i}
                                            className="inline-flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 px-2.5 py-1.5 rounded-lg"
                                          >
                                            <Lock className="w-3 h-3 opacity-60" />
                                            {s.day} · {s.startTime}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                                      {(schedule.nrcEJ || "").length >= 4
                                        ? `NRC EJ ${schedule.nrcEJ} no encontrado en la oferta.`
                                        : "Ingresa el NRC de Ejercicios (4–6 dígitos) para auto-llenar."}
                                    </div>
                                  )
                                ) : (
                                  <>
                                    {(schedule.sessionsEJ || []).map(
                                      (session, idx) => (
                                        <div
                                          key={idx}
                                          className="flex gap-2 items-center"
                                        >
                                          <Select
                                            value={session.day}
                                            onValueChange={(value) => {
                                              const updated = schedules.map(
                                                (s) => {
                                                  if (
                                                    s.courseId === course.id &&
                                                    s.sessionsEJ
                                                  ) {
                                                    const newSessions = [
                                                      ...s.sessionsEJ,
                                                    ];
                                                    newSessions[idx] = {
                                                      ...newSessions[idx],
                                                      day: value as DayType,
                                                    };
                                                    return {
                                                      ...s,
                                                      sessionsEJ: newSessions,
                                                    };
                                                  }
                                                  return s;
                                                },
                                              );
                                              setSchedules(updated);
                                              checkConflicts(updated);
                                            }}
                                          >
                                            <SelectTrigger className="w-28 dark:bg-gray-600 dark:border-gray-500">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {DAYS.map((day) => (
                                                <SelectItem
                                                  key={day}
                                                  value={day}
                                                >
                                                  {day}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>

                                          <Select
                                            value={session.startTime}
                                            onValueChange={(value) => {
                                              const updated = schedules.map(
                                                (s) => {
                                                  if (
                                                    s.courseId === course.id &&
                                                    s.sessionsEJ
                                                  ) {
                                                    const newSessions = [
                                                      ...s.sessionsEJ,
                                                    ];
                                                    newSessions[idx] = {
                                                      ...newSessions[idx],
                                                      startTime: value,
                                                    };
                                                    return {
                                                      ...s,
                                                      sessionsEJ: newSessions,
                                                    };
                                                  }
                                                  return s;
                                                },
                                              );
                                              setSchedules(updated);
                                              checkConflicts(updated);
                                            }}
                                          >
                                            <SelectTrigger className="w-28 dark:bg-gray-600 dark:border-gray-500">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {TIME_SLOTS.map((time) => (
                                                <SelectItem
                                                  key={time}
                                                  value={time}
                                                >
                                                  {time}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>

                                          <span className="text-sm text-gray-600 dark:text-gray-400">
                                            (1h30min)
                                          </span>

                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              const updated = schedules.map(
                                                (s) =>
                                                  s.courseId === course.id &&
                                                  s.sessionsEJ
                                                    ? {
                                                        ...s,
                                                        sessionsEJ:
                                                          s.sessionsEJ.filter(
                                                            (_, i) => i !== idx,
                                                          ),
                                                      }
                                                    : s,
                                              );
                                              setSchedules(updated);
                                              checkConflicts(updated);
                                            }}
                                            className="dark:hover:bg-gray-600"
                                          >
                                            <X className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      ),
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const updated = schedules.map((s) =>
                                          s.courseId === course.id
                                            ? {
                                                ...s,
                                                sessionsEJ: [
                                                  ...(s.sessionsEJ || []),
                                                  {
                                                    day: "Lun" as DayType,
                                                    startTime: "07:00",
                                                  },
                                                ],
                                              }
                                            : s,
                                        );
                                        setSchedules(updated);
                                        checkConflicts(updated);
                                      }}
                                      className="dark:border-gray-500 dark:hover:bg-gray-600"
                                    >
                                      + Agregar sesión EJ
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}

                            {schedule.hasLAB && (
                              <div className="space-y-2 pl-4 border-l-2 border-green-500">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                    Laboratorio (LAB)
                                  </span>
                                  {entryMode === "auto" && (
                                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                                      <Zap className="w-2.5 h-2.5" />
                                      Auto
                                    </span>
                                  )}
                                </div>

                                {entryMode === "auto" ? (
                                  (schedule.sessionsLAB || []).length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                      {(schedule.sessionsLAB || []).map(
                                        (s, i) => (
                                          <span
                                            key={i}
                                            className="inline-flex items-center gap-1.5 text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700 px-2.5 py-1.5 rounded-lg"
                                          >
                                            <Lock className="w-3 h-3 opacity-60" />
                                            {s.day} · {s.startTime}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                                      {(schedule.nrcLAB || "").length >= 4
                                        ? `NRC LAB ${schedule.nrcLAB} no encontrado en la oferta.`
                                        : "Ingresa el NRC de Laboratorio (4–6 dígitos) para auto-llenar."}
                                    </div>
                                  )
                                ) : (
                                  <>
                                    {(schedule.sessionsLAB || []).map(
                                      (session, idx) => (
                                        <div
                                          key={idx}
                                          className="flex gap-2 items-center"
                                        >
                                          <Select
                                            value={session.day}
                                            onValueChange={(value) => {
                                              const updated = schedules.map(
                                                (s) => {
                                                  if (
                                                    s.courseId === course.id &&
                                                    s.sessionsLAB
                                                  ) {
                                                    const newSessions = [
                                                      ...s.sessionsLAB,
                                                    ];
                                                    newSessions[idx] = {
                                                      ...newSessions[idx],
                                                      day: value as DayType,
                                                    };
                                                    return {
                                                      ...s,
                                                      sessionsLAB: newSessions,
                                                    };
                                                  }
                                                  return s;
                                                },
                                              );
                                              setSchedules(updated);
                                              checkConflicts(updated);
                                            }}
                                          >
                                            <SelectTrigger className="w-28 dark:bg-gray-600 dark:border-gray-500">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {DAYS.map((day) => (
                                                <SelectItem
                                                  key={day}
                                                  value={day}
                                                >
                                                  {day}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>

                                          <Select
                                            value={session.startTime}
                                            onValueChange={(value) => {
                                              const updated = schedules.map(
                                                (s) => {
                                                  if (
                                                    s.courseId === course.id &&
                                                    s.sessionsLAB
                                                  ) {
                                                    const newSessions = [
                                                      ...s.sessionsLAB,
                                                    ];
                                                    newSessions[idx] = {
                                                      ...newSessions[idx],
                                                      startTime: value,
                                                    };
                                                    return {
                                                      ...s,
                                                      sessionsLAB: newSessions,
                                                    };
                                                  }
                                                  return s;
                                                },
                                              );
                                              setSchedules(updated);
                                              checkConflicts(updated);
                                            }}
                                          >
                                            <SelectTrigger className="w-28 dark:bg-gray-600 dark:border-gray-500">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {TIME_SLOTS.map((time) => (
                                                <SelectItem
                                                  key={time}
                                                  value={time}
                                                >
                                                  {time}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>

                                          <span className="text-sm text-gray-600 dark:text-gray-400">
                                            (1h30min)
                                          </span>

                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              const updated = schedules.map(
                                                (s) =>
                                                  s.courseId === course.id &&
                                                  s.sessionsLAB
                                                    ? {
                                                        ...s,
                                                        sessionsLAB:
                                                          s.sessionsLAB.filter(
                                                            (_, i) => i !== idx,
                                                          ),
                                                      }
                                                    : s,
                                              );
                                              setSchedules(updated);
                                              checkConflicts(updated);
                                            }}
                                            className="dark:hover:bg-gray-600"
                                          >
                                            <X className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      ),
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const updated = schedules.map((s) =>
                                          s.courseId === course.id
                                            ? {
                                                ...s,
                                                sessionsLAB: [
                                                  ...(s.sessionsLAB || []),
                                                  {
                                                    day: "Lun" as DayType,
                                                    startTime: "07:00",
                                                  },
                                                ],
                                              }
                                            : s,
                                        );
                                        setSchedules(updated);
                                        checkConflicts(updated);
                                      }}
                                      className="dark:border-gray-500 dark:hover:bg-gray-600"
                                    >
                                      + Agregar sesión LAB
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
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
                        {DAYS.map((day) => (
                          <th
                            key={day}
                            className="border border-gray-300 dark:border-gray-600 p-2 text-sm font-semibold"
                          >
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map((time) => (
                        <tr key={time}>
                          <td className="border border-gray-300 dark:border-gray-600 p-2 text-sm font-medium text-center bg-gray-50 dark:bg-gray-700">
                            {time}
                          </td>
                          {DAYS.map((day) => {
                            const courseInfo = getScheduleForSlot(day, time);
                            return (
                              <td
                                key={day}
                                className={`border border-gray-300 dark:border-gray-600 p-2 text-xs ${
                                  courseInfo
                                    ? "bg-blue-100 dark:bg-blue-900/30"
                                    : "bg-white dark:bg-gray-800"
                                }`}
                              >
                                {courseInfo && (
                                  <div className="font-semibold">
                                    <div>
                                      {courseInfo.code}{" "}
                                      {courseInfo.type &&
                                        `(${courseInfo.type})`}
                                    </div>
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
