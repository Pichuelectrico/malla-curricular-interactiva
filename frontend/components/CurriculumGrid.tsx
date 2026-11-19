import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSupabaseAuth } from '../lib/auth';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Download, RotateCcw, FileText, GraduationCap, Coffee, Languages, CheckCheck, Wrench } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CourseCard from './CourseCard';
import FileUpload from './FileUpload';
import ConfettiAnimation from './ConfettiAnimation';
import DonationModal from './DonationModal';
import CurriculumSelector from './CurriculumSelector';
import ContactModal from './ContactModal';
import USFQIcon from './USFQIcon';
import ModeSelector, { SelectionMode } from './ModeSelector';
import WritingIntensiveSidebar from './WritingIntensiveSidebar';
import SchedulePlanningDrawer from './SchedulePlanningDrawer';
import GradeEstimatorDrawer from './GradeEstimatorDrawer';
import BucketCourseCodeModal from './BucketCourseCodeModal';
import { Course, CurriculumData } from '../types/curriculum';
import { generateMermaidDiagram, downloadPDF } from '../utils/mermaidExport';
import { getBlockDisplayName, getOrderedBlocks } from '../utils/curriculumBlocks';
import defaultCurriculumData from '../data/Malla-CMP.json';
import { useBackend } from '../lib/backend';
import { deleteAllProgressForUser, type ProgressData } from '../lib/supabaseProgress';
import { fetchOfferMetadata } from '../lib/offerHistory';
import { loadAcademicCalendar } from '../lib/periodCalendar';
import {
  globalCompletedKey,
  progressKey,
  readLocalAnonProgress,
  resolvePlannedPeriodCode,
  serializePlanned,
  retryWithBackoff,
  serializeProgress,
} from '../lib/progressSync';
import { useUserBypassCourses } from '../lib/useUserBypassCourses';
import { availableCurricula } from '../data/availableCurricula';
import { requiresOfferCourseCode } from '../lib/offerMatching';
import {
  expandDisplayCourses,
  getDisplayCreditsForSlot,
  getRootSlotId,
  isBucketSatisfiedForPrereq,
  clearBucketFulfillmentChain,
  collectFulfillmentSlotIds,
  type BucketFulfillmentsMap,
  type BucketFulfillment,
  type DisplayCourse,
} from '../lib/bucketFulfillment';
import {
  loadMultiMallaPlanned,
  toPlannedEntries,
  type PlannedCourseEntry,
} from '../lib/aggregatedPlanning';
import { usePlannerSettings } from '../lib/usePlannerSettings';
import { PROGRESS_CHANGED_EVENT, type ProgressChangedDetail } from '../lib/progressEvents';

const MAX_SEMESTER_CREDITS = 16;

/** Slug de malla indicado por la URL (#/malla-adm o /malla-adm), o '' si no hay. */
function currentUrlSlug(): string {
  const base = (import.meta as any).env?.BASE_URL || '/';
  let raw = window.location.hash.replace(/^#/, '');
  if (raw.startsWith('/')) raw = raw.slice(1);
  let clean = raw.replace(/^\/+|\/+$/g, '');
  if (!clean) {
    const path = window.location.pathname;
    const slug = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\/+/, '');
    clean = slug.replace(/^\/+|\/+$/g, '');
  }
  if (!clean || clean === 'tutoriales' || clean.startsWith('tutoriales/')) return '';
  return availableCurricula.some((c) => c.slug === clean) ? clean : '';
}

export default function CurriculumGrid() {
  const { isSignedIn, user, isLoading: authLoading } = useSupabaseAuth();
  const backend = useBackend();
  const { bypassCourses } = useUserBypassCourses();
  const { includeOtherMallas } = usePlannerSettings();
  const [curriculumData, setCurriculumData] = useState<CurriculumData>(defaultCurriculumData);
  const [completedCourses, setCompletedCourses] = useState<Set<string>>(new Set());
  const [inProgressCourses, setInProgressCourses] = useState<Set<string>>(new Set());
  const [plannedCourses, setPlannedCourses] = useState<Set<string>>(new Set());
  const [currentMode, setCurrentMode] = useState<SelectionMode>('completed');
  const [showUpload, setShowUpload] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [hasWritingIntensive, setHasWritingIntensive] = useState(false);
  const [showEnglishAnimation, setShowEnglishAnimation] = useState(false);
  const prevEsl0006CompletedRef = useRef<boolean | null>(null);
  const prevSignedInRef = useRef<boolean | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  // Llave (usuario + malla) de la que provienen los sets en memoria; solo se guarda si coincide con la actual.
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [localImportOffer, setLocalImportOffer] = useState<ReturnType<typeof readLocalAnonProgress>>(null);
  const lastSavedRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<{ key: string; run: () => Promise<void> } | null>(null);
  const restoredCurriculumRef = useRef(false);
  // Período objetivo (p. ej. 202620) y sello de «para qué período se planeó» (solo cambia si el usuario edita lo planeado).
  const targetPeriodRef = useRef<string | null>(null);
  const loadedPlannedRef = useRef<{ serialized: string; periodCode: string | null }>({ serialized: '', periodCode: null });
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const { toast } = useToast();

  // Floating toolbox state and drawer open handlers
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [openScheduleDrawer, setOpenScheduleDrawer] = useState<(() => void) | null>(null);
  const [openGradeEstimator, setOpenGradeEstimator] = useState<(() => void) | null>(null);
  const [aggregatedPlanned, setAggregatedPlanned] = useState<PlannedCourseEntry[]>([]);
  const [curriculaWithActivity, setCurriculaWithActivity] = useState(0);
  const [bucketFulfillments, setBucketFulfillments] = useState<BucketFulfillmentsMap>({});
  const [bucketModal, setBucketModal] = useState<{
    course: DisplayCourse;
    mode: SelectionMode;
  } | null>(null);

  const curriculumId = curriculumData.source_file || 'Malla-CMP';
  const accountId = isSignedIn ? user?.id ?? null : null;
  const currentProgressKey = progressKey(accountId, curriculumId);
  const globalStoreKey = globalCompletedKey(accountId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [calendar, metadata] = await Promise.all([loadAcademicCalendar(), fetchOfferMetadata()]);
        const { targetPeriodCode } = calendar.inferTargetPeriod(metadata.currentPeriodCode || undefined);
        if (!cancelled) targetPeriodRef.current = targetPeriodCode || null;
      } catch {
        // sin período objetivo no se sella: las filas quedan como «legacy» en el predictor
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load curriculum based on URL slug
  // Prefer hash-based routing (#/malla-adm) for GitHub Pages compatibility, fallback to pathname (/malla-adm)
  useEffect(() => {
    const loadFromUrl = async () => {
      try {
        const base = (import.meta as any).env?.BASE_URL || '/';
        // 1) Try hash first: #/malla-adm
        let raw = window.location.hash.replace(/^#/, '');
        if (raw.startsWith('/')) raw = raw.slice(1);
        let clean = raw.replace(/^\/+|\/+$/g, '');
        // 2) Fallback to pathname if no hash slug
        if (!clean) {
          const path = window.location.pathname;
          const slug = path.startsWith(base)
            ? path.slice(base.length)
            : path.replace(/^\/+/, '');
          clean = slug.replace(/^\/+|\/+$/g, '');
        }
        if (!clean || clean === 'tutoriales' || clean.startsWith('tutoriales/')) return;
        const target = availableCurricula.find(c => c.slug === clean);
        if (!target) return;
        const module = await target.dataLoader();
        const data = module.default as CurriculumData;
        if (!data.source_file) data.source_file = target.id;
        setCurriculumData(data);
      } catch (e) {
        console.error('Error loading curriculum from URL:', e);
      }
    };

    loadFromUrl();

    const onPopState = () => loadFromUrl();
    const onHashChange = () => loadFromUrl();
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    // Cada ejecución es una "generación": si cambia usuario/malla o se desmonta, la respuesta vieja se descarta.
    let cancelled = false;
    const key = currentProgressKey;

    const loadData = async () => {
      setIsLoadingProgress(true);
      setHydratedKey(null);
      setLoadError(null);
      setLocalImportOffer(null);
      try {
        const response = await retryWithBackoff(
          async () => (await backend.progress.loadProgress({ curriculumId })) as ProgressData | null,
          undefined,
          { isCancelled: () => cancelled },
        );
        if (cancelled) return;
        const completed = response?.completedCourses || [];
        const inProgress = response?.inProgressCourses || [];
        const planned = response?.plannedCourses || [];
        const wi = typeof response?.hasWritingIntensive === 'boolean' ? response.hasWritingIntensive : false;
        const buckets = isSignedIn ? (response?.bucketFulfillments ?? {}) : {};
        setCompletedCourses(new Set(completed));
        setInProgressCourses(new Set(inProgress));
        setPlannedCourses(new Set(planned));
        setHasWritingIntensive(wi);
        setBucketFulfillments(buckets);
        // Lo recién cargado ya está en el servidor: no re-subirlo.
        lastSavedRef.current = serializeProgress({
          completedCourses: completed,
          inProgressCourses: inProgress,
          plannedCourses: planned,
          hasWritingIntensive: wi,
          bucketFulfillments: buckets,
        });
        loadedPlannedRef.current = {
          serialized: serializePlanned(planned),
          periodCode: response?.plannedPeriodCode ?? null,
        };
        if (isSignedIn && !completed.length && !inProgress.length && !planned.length) {
          setLocalImportOffer(readLocalAnonProgress(curriculumId));
        }
        setHydratedKey(key);
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading progress:', error);
        // No dejar en pantalla (ni guardar) los sets de la malla/usuario anterior.
        setCompletedCourses(new Set());
        setInProgressCourses(new Set());
        setPlannedCourses(new Set());
        setBucketFulfillments({});
        setLoadError(error instanceof Error ? error.message : 'Error desconocido');
        toast({
          title: 'No se pudo cargar tu progreso',
          description: 'No se guardará nada hasta que se cargue correctamente. Puedes reintentar desde el aviso superior.',
          variant: 'destructive',
        });
      }
      if (cancelled) return;

      // La malla guardada en el navegador solo se restaura una vez y nunca si la URL ya indica una malla.
      if (!restoredCurriculumRef.current) {
        restoredCurriculumRef.current = true;
        const savedCurriculum = localStorage.getItem('curriculumData');
        if (savedCurriculum && !currentUrlSlug()) {
          try {
            const parsed = JSON.parse(savedCurriculum);
            if (parsed?.source_file !== curriculumId) setCurriculumData(parsed);
          } catch (error) {
            console.error('Error loading curriculum data:', error);
          }
        }
      }

      if (!isSignedIn) {
        const savedWritingIntensive = localStorage.getItem(`hasWritingIntensive:${curriculumId}`);
        const legacyWritingIntensive = localStorage.getItem('hasWritingIntensive');
        if (savedWritingIntensive) {
          try {
            setHasWritingIntensive(JSON.parse(savedWritingIntensive));
          } catch (error) {
            console.error('Error loading writing intensive status:', error);
          }
        } else if (legacyWritingIntensive) {
          try {
            const legacy = JSON.parse(legacyWritingIntensive);
            setHasWritingIntensive(legacy);
            localStorage.setItem(`hasWritingIntensive:${curriculumId}`, JSON.stringify(legacy));
            localStorage.removeItem('hasWritingIntensive');
          } catch (error) {
            console.error('Error migrating legacy writing intensive status:', error);
          }
        }
      }

      setDataLoaded(true);
      setIsLoadingProgress(false);
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, accountId, curriculumId, authLoading, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prevSignedInRef.current === true && !isSignedIn) {
      setBucketFulfillments({});
    }
    prevSignedInRef.current = isSignedIn;
  }, [isSignedIn]);

  const SAVE_DEBOUNCE_MS = 800;

  useEffect(() => {
    // Un guardado pendiente de otra malla/usuario se envía ya (con su propio payload), no se pierde.
    const pending = pendingSaveRef.current;
    if (pending && pending.key !== currentProgressKey) {
      pendingSaveRef.current = null;
      void pending.run();
    }

    // Solo se guarda lo que provenga de la carga de ESTA llave usuario+malla.
    if (!dataLoaded || isLoadingProgress || authLoading || hydratedKey !== currentProgressKey) return;

    const serialized = serializeProgress({
      completedCourses,
      inProgressCourses,
      plannedCourses,
      hasWritingIntensive,
      bucketFulfillments: isSignedIn ? bucketFulfillments : undefined,
    });
    if (serialized === lastSavedRef.current) return;

    const plannedSerialized = serializePlanned(plannedCourses);
    const stampedPeriod = resolvePlannedPeriodCode(plannedCourses, loadedPlannedRef.current, targetPeriodRef.current);
    const payload = {
      curriculumId,
      completedCourses: [...completedCourses],
      selectedCourses: [] as string[],
      inProgressCourses: [...inProgressCourses],
      plannedCourses: [...plannedCourses],
      hasWritingIntensive,
      bucketFulfillments: isSignedIn ? bucketFulfillments : undefined,
      plannedPeriodCode: stampedPeriod,
      lastUpdated: new Date().toISOString(),
    };
    const run = async () => {
      if (pendingSaveRef.current?.run === run) pendingSaveRef.current = null;
      try {
        await backend.progress.saveProgress(payload);
        lastSavedRef.current = serialized;
        loadedPlannedRef.current = { serialized: plannedSerialized, periodCode: stampedPeriod };
      } catch (error) {
        console.error('Error saving progress:', error);
        toast({
          title: 'No se pudo guardar tu progreso',
          description: 'Revisa tu conexión e inténtalo de nuevo.',
          variant: 'destructive',
        });
      }
    };
    pendingSaveRef.current = { key: currentProgressKey, run };
    const timer = setTimeout(() => void run(), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [completedCourses, inProgressCourses, plannedCourses, hasWritingIntensive, bucketFulfillments, isSignedIn, dataLoaded, hydratedKey, currentProgressKey, authLoading, curriculumId, isLoadingProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  // No perder la última edición si la pestaña se oculta/cierra dentro de la ventana de debounce.
  useEffect(() => {
    const flush = () => {
      const pending = pendingSaveRef.current;
      if (pending) void pending.run();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  // Overlay global completed courses onto current curriculum after data loads (por cuenta, ver globalCompletedKey)
  useEffect(() => {
    if (!dataLoaded || hydratedKey !== currentProgressKey) return;
    try {
      const raw = localStorage.getItem(globalStoreKey);
      if (!raw) return;
      const globalCompleted: string[] = JSON.parse(raw);
      const currentIds = new Set(curriculumData.courses.map(c => c.id));
      const overlay = globalCompleted.filter(id => currentIds.has(id));
      if (overlay.length === 0) return;
      setCompletedCourses(prev => new Set([...prev, ...overlay]));
    } catch (e) {
      console.error('Error overlaying global completed courses:', e);
    }
  }, [dataLoaded, hydratedKey, currentProgressKey, globalStoreKey, curriculumData.courses]);

  // Keep a global store of completed courses across curricula in localStorage (namespaced per account)
  useEffect(() => {
    if (!dataLoaded || hydratedKey !== currentProgressKey) return;
    try {
      const raw = localStorage.getItem(globalStoreKey);
      const globalSet = new Set<string>(raw ? JSON.parse(raw) : []);
      const currentIds = new Set(curriculumData.courses.map(c => c.id));

      // Remove current-curriculum IDs not completed anymore
      for (const id of Array.from(globalSet)) {
        if (currentIds.has(id) && !completedCourses.has(id)) {
          globalSet.delete(id);
        }
      }
      // Add all currently completed IDs
      for (const id of completedCourses) {
        globalSet.add(id);
      }
      localStorage.setItem(globalStoreKey, JSON.stringify(Array.from(globalSet)));
    } catch (e) {
      console.error('Error saving global completed courses:', e);
    }
  }, [completedCourses, dataLoaded, hydratedKey, currentProgressKey, globalStoreKey, curriculumData.courses]);

  // Auto-complete courses that declare an already-completed course as an alternative
  useEffect(() => {
    if (!dataLoaded) return;
    setCompletedCourses((prev) => {
      const next = new Set(prev);
      let added = false;

      // Build a map from alternative course ID -> list of courses that accept it as alternative
      const altToCourses = new Map<string, string[]>();
      for (const course of curriculumData.courses) {
        for (const alt of course.alternatives) {
          const list = altToCourses.get(alt) || [];
          list.push(course.id);
          altToCourses.set(alt, list);
        }
      }

      // BFS/DFS over dependents to handle transitive alternative chains
      const queue: string[] = Array.from(prev);
      const seen = new Set<string>();
      while (queue.length > 0) {
        const id = queue.pop() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const dependents = altToCourses.get(id) || [];
        for (const depId of dependents) {
          if (!next.has(depId)) {
            next.add(depId);
            added = true;
            queue.push(depId);
          }
        }
      }

      return added ? next : prev;
    });
  }, [completedCourses, curriculumData.courses, dataLoaded]);

  useEffect(() => {
    localStorage.setItem('curriculumData', JSON.stringify(curriculumData));
  }, [curriculumData]);

  useEffect(() => {
    // Con sesión el flag vive en Supabase; escribirlo aquí lo filtraría a la siguiente persona del navegador.
    if (isSignedIn || !dataLoaded || isLoadingProgress || hydratedKey !== currentProgressKey) return;
    localStorage.setItem(`hasWritingIntensive:${curriculumId}`, JSON.stringify(hasWritingIntensive));
  }, [hasWritingIntensive, curriculumId, dataLoaded, isLoadingProgress, isSignedIn, hydratedKey, currentProgressKey]);

  const hasESL0006 = curriculumData.courses.some(course => course.id === 'ESL0006');
  const esl0006Completed = completedCourses.has('ESL0006');

  useEffect(() => {
    prevEsl0006CompletedRef.current = null;
  }, [curriculumId]);

  useEffect(() => {
    if (!hasESL0006 || !dataLoaded) return;

    const wasCompleted = prevEsl0006CompletedRef.current;
    if (wasCompleted === null) {
      prevEsl0006CompletedRef.current = esl0006Completed;
      return;
    }

    const justCompleted = esl0006Completed && !wasCompleted;
    prevEsl0006CompletedRef.current = esl0006Completed;

    if (!justCompleted || hasWritingIntensive) return;

    const timer = setTimeout(() => {
      setShowEnglishAnimation(true);
      toast({
        title: "¡Inglés 6 completado! 🌟",
        description: "Ahora puedes marcar el requisito de Writing Intensive.",
      });

      setTimeout(() => {
        setShowEnglishAnimation(false);
      }, 3000);
    }, 500);

    return () => clearTimeout(timer);
  }, [esl0006Completed, hasWritingIntensive, hasESL0006, dataLoaded, toast]);

  const displayCourses = useMemo((): DisplayCourse[] => {
    if (isSignedIn) {
      return expandDisplayCourses(curriculumData.courses, bucketFulfillments);
    }
    return curriculumData.courses;
  }, [isSignedIn, curriculumData.courses, bucketFulfillments]);

  const allCoursesCompleted =
    displayCourses.length > 0 &&
    displayCourses.every((course) => completedCourses.has(course.id));
  const isAllCompleted = allCoursesCompleted && hasWritingIntensive;

  const completedSemesters = new Set(
    curriculumData.courses
      .filter(course => completedCourses.has(course.id))
      .map(course => course.semester)
  );
  const hasCompletedFiveSemesters = completedSemesters.size >= 5;

  const showWritingIntensiveSection =
    hasESL0006 && (hasCompletedFiveSemesters || esl0006Completed);

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

  const sumCredits = (courseIds: Set<string>) =>
    displayCourses
      .filter((c) => courseIds.has(c.id))
      .reduce((sum, c) => sum + getDisplayCreditsForSlot(c, bucketFulfillments), 0);

  const plannedCoursesList = useMemo(
    () => displayCourses.filter((c) => plannedCourses.has(c.id)),
    [displayCourses, plannedCourses],
  );

  const mallaShortLabel = useMemo(() => {
    const m = curriculumId.match(/Malla(?:-academica)?-([A-Z0-9]+)/i);
    return m ? m[1].toUpperCase() : curriculumId.slice(0, 6).toUpperCase();
  }, [curriculumId]);

  const refreshMultiMallaPlanned = useCallback(async () => {
    if (!isSignedIn || !user?.id) {
      setAggregatedPlanned([]);
      setCurriculaWithActivity(0);
      return;
    }
    try {
      const { entries, curriculaWithActivity: count } =
        await loadMultiMallaPlanned(user.id);
      setAggregatedPlanned(entries);
      setCurriculaWithActivity(count);
    } catch {
      setAggregatedPlanned([]);
      setCurriculaWithActivity(0);
    }
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    void refreshMultiMallaPlanned();
  }, [refreshMultiMallaPlanned, plannedCourses, curriculumId]);

  useEffect(() => {
    const onProgressChanged = (event: Event) => {
      const detail = (event as CustomEvent<ProgressChangedDetail>).detail;
      if (detail?.curriculumId && detail.curriculumId !== curriculumId) {
        void refreshMultiMallaPlanned();
        return;
      }
      void (async () => {
        try {
          const response = (await backend.progress.loadProgress({ curriculumId })) as ProgressData | null;
          if (response) {
            setCompletedCourses(new Set(response.completedCourses || []));
            setInProgressCourses(new Set(response.inProgressCourses || []));
            setPlannedCourses(new Set(response.plannedCourses || []));
            setHasWritingIntensive(response.hasWritingIntensive ?? false);
            setBucketFulfillments(response.bucketFulfillments ?? {});
            lastSavedRef.current = serializeProgress({
              completedCourses: response.completedCourses || [],
              inProgressCourses: response.inProgressCourses || [],
              plannedCourses: response.plannedCourses || [],
              hasWritingIntensive: response.hasWritingIntensive ?? false,
              bucketFulfillments: isSignedIn ? (response.bucketFulfillments ?? {}) : undefined,
            });
          } else {
            setCompletedCourses(new Set());
            setInProgressCourses(new Set());
            setPlannedCourses(new Set());
            setHasWritingIntensive(false);
            setBucketFulfillments({});
          }
          await refreshMultiMallaPlanned();
        } catch {
          /* ignore */
        }
      })();
    };

    window.addEventListener(PROGRESS_CHANGED_EVENT, onProgressChanged);
    return () => window.removeEventListener(PROGRESS_CHANGED_EVENT, onProgressChanged);
  }, [backend, curriculumId, refreshMultiMallaPlanned]);

  const plannerBucketCodes = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(bucketFulfillments).map(([id, f]) => [id, f.offerCourseCode]),
      ),
    [bucketFulfillments],
  );

  const currentPlannedEntries = useMemo(
    (): PlannedCourseEntry[] =>
      toPlannedEntries(plannedCoursesList, mallaShortLabel, curriculumId),
    [plannedCoursesList, mallaShortLabel, curriculumId],
  );

  const multiMallaAvailable = isSignedIn && curriculaWithActivity >= 2;

  const prereqSatisfied = (prereqId: string): boolean => {
    const prereqCourse = curriculumData.courses.find((c) => c.id === prereqId);
    if (
      isSignedIn &&
      prereqCourse &&
      requiresOfferCourseCode(prereqCourse)
    ) {
      return isBucketSatisfiedForPrereq(
        prereqId,
        curriculumData.courses,
        bucketFulfillments,
        completedCourses,
        inProgressCourses,
      );
    }
    return completedCourses.has(prereqId) || inProgressCourses.has(prereqId);
  };

  const isUnlocked = (course: Course): boolean => {
    if (bypassCourses.has(course.id)) return true;
    if (course.prerequisites.length === 0) return true;

    if (course.alternatives.length > 0) {
      return course.alternatives.some((altId) => prereqSatisfied(altId));
    }

    return course.prerequisites.every((prereqGroup) => {
      const options = prereqGroup.split('||').map((s) => s.trim()).filter(Boolean);
      if (options.length > 1) {
        return options.some((id) => prereqSatisfied(id));
      }
      const id = options[0] || '';
      return prereqSatisfied(id);
    });
  };

  const removeBucketFromProgress = (rootId: string) => {
    const ids = new Set(collectFulfillmentSlotIds(rootId, bucketFulfillments));
    setBucketFulfillments((prev) => clearBucketFulfillmentChain(rootId, prev));
    setCompletedCourses((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setInProgressCourses((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setPlannedCourses((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const markCourseInMode = (courseId: string, mode: SelectionMode) => {
    if (mode === 'completed') {
      setCompletedCourses((prev) => {
        const next = new Set(prev);
        next.add(courseId);
        return next;
      });
      setInProgressCourses((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
      setPlannedCourses((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    } else if (mode === 'in-progress') {
      setInProgressCourses((prev) => {
        const next = new Set(prev);
        next.add(courseId);
        return next;
      });
      setCompletedCourses((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
      setPlannedCourses((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    } else if (mode === 'planned') {
      setPlannedCourses((prev) => {
        const next = new Set(prev);
        next.add(courseId);
        return next;
      });
      setCompletedCourses((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
      setInProgressCourses((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    }
  };

  const handleBucketConfirm = (fulfillment: BucketFulfillment) => {
    if (!bucketModal) return;
    const { course, mode } = bucketModal;

    setBucketFulfillments((prev) => ({
      ...prev,
      [course.id]: fulfillment,
    }));
    markCourseInMode(course.id, mode);
    setBucketModal(null);
  };

  const handleCourseClick = (courseId: string) => {
    const course =
      displayCourses.find((c) => c.id === courseId) ??
      curriculumData.courses.find((c) => c.id === courseId);
    if (!course) return;

    const isCurrentlyUnlocked = isUnlocked(course);
    const isCurrentlyCompleted = completedCourses.has(courseId);
    const isCurrentlyInProgress = inProgressCourses.has(courseId);
    const isCurrentlyPlanned = plannedCourses.has(courseId);
    const isMarked =
      isCurrentlyCompleted || isCurrentlyInProgress || isCurrentlyPlanned;

    if (!isCurrentlyUnlocked && !isMarked) return;

    const isBucket = requiresOfferCourseCode(course);
    const rootId = getRootSlotId(courseId);

    if (isMarked) {
      if (isSignedIn && isBucket) {
        removeBucketFromProgress(rootId);
        return;
      }

      if (currentMode === 'completed' && isCurrentlyCompleted) {
        setCompletedCourses((prev) => {
          const next = new Set(prev);
          next.delete(courseId);
          return next;
        });
      } else if (currentMode === 'in-progress' && isCurrentlyInProgress) {
        setInProgressCourses((prev) => {
          const next = new Set(prev);
          next.delete(courseId);
          return next;
        });
      } else if (currentMode === 'planned' && isCurrentlyPlanned) {
        setPlannedCourses((prev) => {
          const next = new Set(prev);
          next.delete(courseId);
          return next;
        });
      }
      return;
    }

    if (isSignedIn && isBucket) {
      if (currentMode === 'in-progress') {
        const projectedCredits = sumCredits(inProgressCourses) + course.credits;
        if (projectedCredits > MAX_SEMESTER_CREDITS) {
          toast({
            title: 'Límite de créditos',
            description: `Solo puedes seleccionar hasta ${MAX_SEMESTER_CREDITS} créditos en cursando.`,
            variant: 'destructive',
          });
          return;
        }
      } else if (currentMode === 'planned') {
        const projectedCredits = sumCredits(plannedCourses) + course.credits;
        if (projectedCredits > MAX_SEMESTER_CREDITS) {
          toast({
            title: 'Límite de créditos',
            description: `Solo puedes seleccionar hasta ${MAX_SEMESTER_CREDITS} créditos en planeadas.`,
            variant: 'destructive',
          });
          return;
        }
      }
      setBucketModal({ course, mode: currentMode });
      return;
    }

    if (currentMode === 'completed') {
      setCompletedCourses(prev => {
        const newCompleted = new Set(prev);
        if (newCompleted.has(courseId)) {
          newCompleted.delete(courseId);
        } else {
          newCompleted.add(courseId);
          setInProgressCourses(p => {
            const n = new Set(p);
            n.delete(courseId);
            return n;
          });
          setPlannedCourses(p => {
            const n = new Set(p);
            n.delete(courseId);
            return n;
          });
        }
        return newCompleted;
      });
    } else if (currentMode === 'in-progress') {
      if (!isCurrentlyInProgress) {
        const projectedCredits = sumCredits(inProgressCourses) + course.credits;
        if (projectedCredits > MAX_SEMESTER_CREDITS) {
          toast({
            title: "Límite de créditos",
            description: `Solo puedes seleccionar hasta ${MAX_SEMESTER_CREDITS} créditos en cursando.`,
            variant: "destructive",
          });
          return;
        }
      }

      setInProgressCourses(prev => {
        const newInProgress = new Set(prev);
        if (newInProgress.has(courseId)) {
          newInProgress.delete(courseId);
        } else {
          newInProgress.add(courseId);
          setCompletedCourses(p => {
            const n = new Set(p);
            n.delete(courseId);
            return n;
          });
          setPlannedCourses(p => {
            const n = new Set(p);
            n.delete(courseId);
            return n;
          });
        }
        return newInProgress;
      });
    } else if (currentMode === 'planned') {
      if (!isCurrentlyPlanned) {
        const projectedCredits = sumCredits(plannedCourses) + course.credits;
        if (projectedCredits > MAX_SEMESTER_CREDITS) {
          toast({
            title: "Límite de créditos",
            description: `Solo puedes seleccionar hasta ${MAX_SEMESTER_CREDITS} créditos en planeadas.`,
            variant: "destructive",
          });
          return;
        }
      }

      setPlannedCourses(prev => {
        const newPlanned = new Set(prev);
        if (newPlanned.has(courseId)) {
          newPlanned.delete(courseId);
        } else {
          newPlanned.add(courseId);
          setCompletedCourses(p => {
            const n = new Set(p);
            n.delete(courseId);
            return n;
          });
          setInProgressCourses(p => {
            const n = new Set(p);
            n.delete(courseId);
            return n;
          });
        }
        return newPlanned;
      });
    }
  };



  const resetProgress = () => {
    setCompletedCourses(new Set());
    setInProgressCourses(new Set());
    setPlannedCourses(new Set());
    setHasWritingIntensive(false);
    setBucketFulfillments({});
    // Legacy keys cleanup
    localStorage.removeItem("completedCourses");
    localStorage.removeItem("inProgressCourses");
    localStorage.removeItem("plannedCourses");
    // Clear per-curriculum WI for current and others
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('hasWritingIntensive:')) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.error('Error clearing writing intensive keys:', e);
    }
    // Clear per-curriculum WI current key (idempotent)
    localStorage.removeItem(`hasWritingIntensive:${curriculumId}`);
    // Clear global overlay so it doesn't re-apply on other mallas
    localStorage.removeItem(globalStoreKey);
    lastSavedRef.current = serializeProgress({
      completedCourses: [],
      inProgressCourses: [],
      plannedCourses: [],
      hasWritingIntensive: false,
      bucketFulfillments: isSignedIn ? {} : undefined,
    });
    pendingSaveRef.current = null;

    // Una sola operación: signed-in borra todas las filas del usuario (el id de cada malla en
    // user_progress es su source_file, no el id de availableCurricula); anon limpia sus claves locales.
    (async () => {
      try {
        if (isSignedIn && user?.id) {
          await deleteAllProgressForUser(user.id);
        } else {
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('progress_')) keys.push(key);
          }
          keys.forEach((k) => localStorage.removeItem(k));
        }
        toast({
          title: "Progreso reiniciado",
          description: "Se borró el progreso de todas las mallas.",
        });
      } catch (e) {
        console.error('Error clearing backend progress:', e);
        toast({
          title: "No se pudo reiniciar el progreso",
          description: "Revisa tu conexión e inténtalo de nuevo.",
          variant: 'destructive',
        });
      }
    })();
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
    setShowUpload(false);
    toast({
      title: "Malla curricular cargada",
      description: "Se ha cargado la nueva malla curricular correctamente.",
    });
  };

  const handleCurriculumSelect = (data: CurriculumData) => {
    setCurriculumData(data);
    toast({
      title: "Malla curricular cargada",
      description: "Se ha cargado la malla curricular seleccionada.",
    });
  };

  const completeAllInProgress = () => {
    setCompletedCourses(prev => {
      const newCompleted = new Set(prev);
      inProgressCourses.forEach(courseId => newCompleted.add(courseId));
      return newCompleted;
    });
    setInProgressCourses(new Set());
    toast({
      title: "Materias completadas",
      description: `Se han marcado ${inProgressCourses.size} materia(s) como completadas.`,
    });
  };

  const totalCredits = curriculumData.courses.reduce((sum, course) => sum + course.credits, 0);
  const completedCredits = displayCourses
    .filter((course) => completedCourses.has(course.id))
    .reduce((sum, course) => sum + getDisplayCreditsForSlot(course, bucketFulfillments), 0);
  const totalCourses = displayCourses.length;
  const completedCoursesCount = displayCourses.filter((c) =>
    completedCourses.has(c.id),
  ).length;

  const creditProgress = totalCredits > 0 ? (completedCredits / totalCredits) * 100 : 0;
  const courseProgress = totalCourses > 0 ? (completedCoursesCount / totalCourses) * 100 : 0;

  const coursesByBlock = displayCourses.reduce((acc, course) => {
    if (!acc[course.block]) {
      acc[course.block] = [];
    }
    acc[course.block].push(course);
    return acc;
  }, {} as Record<string, DisplayCourse[]>);

  const blockOrder = getOrderedBlocks(curriculumData.courses);

  const careerTitle = curriculumData.source_file || 'Malla Curricular';

  return (
    <div className="container mx-auto p-4 space-y-6 relative">
      <div className="fixed top-4 left-8 z-40">
        <USFQIcon />
      </div>

      {showCelebration && <ConfettiAnimation />}

      {showEnglishAnimation && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-blue-500/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl border-2 border-blue-300 text-center animate-pulse transform scale-110">
              <div className="flex items-center justify-center mb-4">
                <Languages className="w-16 h-16 text-white mr-4 animate-bounce" />
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">¡Inglés 6 Completado!</h2>
                  <p className="text-xl text-blue-100">Ahora puedes marcar Writing Intensive</p>
                </div>
              </div>
              <div className="text-6xl animate-bounce">🌟</div>
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <span>
            No se pudo cargar tu progreso ({loadError}). Mientras no cargue no se guarda nada para no sobrescribir tus datos.
          </span>
          <Button size="sm" variant="outline" onClick={() => setReloadNonce((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}

      {localImportOffer && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          <span>
            Encontramos progreso guardado en este navegador para esta malla
            ({localImportOffer.completedCourses.length} completadas, {localImportOffer.inProgressCourses.length} cursando,{' '}
            {localImportOffer.plannedCourses.length} planeadas). ¿Quieres importarlo a tu cuenta?
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setCompletedCourses(new Set(localImportOffer.completedCourses));
                setInProgressCourses(new Set(localImportOffer.inProgressCourses));
                setPlannedCourses(new Set(localImportOffer.plannedCourses));
                setHasWritingIntensive(localImportOffer.hasWritingIntensive);
                setLocalImportOffer(null);
                toast({ title: 'Progreso importado', description: 'Se guardará en tu cuenta.' });
              }}
            >
              Importar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLocalImportOffer(null)}>
              Ahora no
            </Button>
          </span>
        </div>
      )}

      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Malla Curricular Interactiva</h1>
        <p className="text-gray-600 dark:text-gray-300">Haz clic en las asignaturas para marcarlas como completadas</p>
      </div>

      <div className="flex flex-wrap gap-4 justify-center">
        <CurriculumSelector 
          onSelect={handleCurriculumSelect}
          onRequestCurriculum={() => setShowContact(true)}
        />
        {/* <Button onClick={() => setShowUpload(true)} variant="outline" className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          <Upload className="w-4 h-4 mr-2" />
          Cargar Malla
        </Button> */}
        <Button onClick={resetProgress} variant="outline" className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reiniciar Progreso
        </Button>
        <Button onClick={exportProgress} variant="outline" className="dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          <Download className="w-4 h-4 mr-2" />
          Exportar PDF
        </Button>
        {inProgressCourses.size > 0 && (
          <Button onClick={completeAllInProgress} variant="outline" className="bg-green-50 hover:bg-green-100 border-green-300 dark:bg-green-900/20 dark:border-green-600 dark:hover:bg-green-900/30">
            <CheckCheck className="w-4 h-4 mr-2" />
            Completar Cursando ({inProgressCourses.size})
          </Button>
        )}
        <Button onClick={() => setShowDonation(true)} variant="outline" className="bg-yellow-50 hover:bg-yellow-100 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-600 dark:hover:bg-yellow-900/30">
          <Coffee className="w-4 h-4 mr-2" />
          Buy Me a Coffee
        </Button>
      </div>

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

          {showWritingIntensiveSection && (
            <div className={`border-t pt-4 dark:border-gray-600 transition-all duration-500 ${
              showEnglishAnimation ? 'bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-700' : ''
            }`}>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="writing-intensive"
                  checked={hasWritingIntensive}
                  onCheckedChange={(checked) => setHasWritingIntensive(checked as boolean)}
                />
                <label
                  htmlFor="writing-intensive"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-200"
                >
                  ¿Tomaste una materia en inglés (Writing Intensive)?
                </label>
              </div>
              {allCoursesCompleted && !hasWritingIntensive && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center">
                  <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
                  Debes completar el requisito de Writing Intensive para graduarte
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
              <div className="w-4 h-4 bg-yellow-500 rounded"></div>
              <span className="text-sm dark:text-gray-300">Cursando</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-500 rounded"></div>
              <span className="text-sm dark:text-gray-300">Planeada</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Usa el selector de modo en la esquina inferior izquierda para cambiar entre estados
          </p>
        </CardContent>
      </Card>

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

      <div className="space-y-8">
        {blockOrder.map(blockName => {
          const blockCourses = coursesByBlock[blockName];
          if (!blockCourses || blockCourses.length === 0) return null;

          const blockBaseCourses = curriculumData.courses.filter(
            (c) => c.block === blockName,
          );
          const blockTotalCredits = blockBaseCourses.reduce(
            (sum, course) => sum + course.credits,
            0,
          );
          const blockCompletedCredits = blockCourses
            .filter((course) => completedCourses.has(course.id))
            .reduce(
              (sum, course) =>
                sum + getDisplayCreditsForSlot(course, bucketFulfillments),
              0,
            );
          const blockProgress =
            blockTotalCredits > 0
              ? (blockCompletedCredits / blockTotalCredits) * 100
              : 0;

          return (
            <div key={blockName} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                  {getBlockDisplayName(blockName, blockCourses, curriculumData.courses)}
                </h2>
                <Badge variant="outline" className="dark:border-gray-600 dark:text-gray-300">
                  {blockCompletedCredits}/{blockTotalCredits} créditos ({blockProgress.toFixed(0)}%)
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {blockCourses.map((course) => {
                  const fulfillment = bucketFulfillments[course.id] ?? course.fulfillment;
                  return (
                    <CourseCard
                      key={course.id}
                      course={course}
                      isCompleted={completedCourses.has(course.id)}
                      isUnlocked={isUnlocked(course)}
                      isInProgress={inProgressCourses.has(course.id)}
                      isPlanned={plannedCourses.has(course.id)}
                      onClick={handleCourseClick}
                      allCourses={curriculumData.courses}
                      fulfillmentCode={fulfillment?.offerCourseCode}
                      isRemainder={course.isRemainder}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {showUpload && (
        <FileUpload
          onUpload={handleFileUpload}
          onClose={() => setShowUpload(false)}
        />
      )}

      {showDonation && (
        <DonationModal onClose={() => setShowDonation(false)} />
      )}

      {showContact && (
        <ContactModal onClose={() => setShowContact(false)} />
      )}

      <ModeSelector currentMode={currentMode} onModeChange={setCurrentMode} />

      {showWritingIntensiveSection && (
        <WritingIntensiveSidebar
          hasWritingIntensive={hasWritingIntensive}
          onToggle={(checked) => setHasWritingIntensive(checked)}
          showNotice={showEnglishAnimation}
        />
      )}

      {bucketModal && (
        <BucketCourseCodeModal
          course={bucketModal.course}
          onClose={() => setBucketModal(null)}
          onConfirm={handleBucketConfirm}
        />
      )}

      {/* Drawers without their own floating buttons; expose open functions */}
      <SchedulePlanningDrawer
        currentPlannedEntries={currentPlannedEntries}
        allPlannedEntries={aggregatedPlanned}
        activeCurriculumId={curriculumId}
        multiMallaAvailable={multiMallaAvailable}
        includeOtherMallas={includeOtherMallas}
        crossMallaEnabled={isSignedIn}
        userId={user?.id}
        initialBucketCodes={isSignedIn ? plannerBucketCodes : undefined}
        onDrawerOpen={refreshMultiMallaPlanned}
        onSave={(schedules) => {
          console.log('Schedules saved:', schedules);
          toast({
            title: "Planeación guardada",
            description: "Tu horario ha sido guardado correctamente.",
          });
        }}
        exposeOpen={(fn: () => void) => setOpenScheduleDrawer(() => fn)}
        hideFloatingButton
      />

      <GradeEstimatorDrawer
        exposeOpen={(fn: () => void) => setOpenGradeEstimator(() => fn)}
        hideFloatingButton
      />

      {/* Floating toolbox with tool icon */}
      <div className="fixed bottom-[80px] right-4 z-40 flex flex-col items-end gap-2">
        {toolboxOpen && (
          <div className="flex flex-col items-stretch gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-3 py-2"
              onClick={() => openGradeEstimator && openGradeEstimator()}
              disabled={!openGradeEstimator}
            >
              Calculadora de Notas
            </Button>
            <Button
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white gap-2 px-3 py-2"
              onClick={() => openScheduleDrawer && openScheduleDrawer()}
              disabled={!openScheduleDrawer}
            >
              Preparación de horario
            </Button>
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 gap-2 px-3 py-2"
          onClick={() => setToolboxOpen(v => !v)}
        >
          <Wrench className="w-4 h-4" />
          {toolboxOpen ? 'Ocultar herramientas' : 'Herramientas'}
        </Button>
      </div>
    </div>
  );
}
