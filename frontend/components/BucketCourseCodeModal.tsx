import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { Course } from '../types/curriculum';
import { useCourseOffer } from '../lib/useCourseOffer';
import {
  normalizeOfferCourseCodeInput,
  getOfferCoursePreview,
} from '../lib/offerMatching';
import {
  getAllowedAreasLabel,
  validateOfferCodeForBucket,
  resolveCourseCredits,
  creditsMeetMinimum,
  type BucketFulfillment,
} from '../lib/bucketFulfillment';

interface BucketCourseCodeModalProps {
  course: Course;
  onClose: () => void;
  onConfirm: (fulfillment: BucketFulfillment) => void;
}

export default function BucketCourseCodeModal({
  course,
  onClose,
  onConfirm,
}: BucketCourseCodeModalProps) {
  const [code, setCode] = useState('');
  const [manualCredits, setManualCredits] = useState('');
  const { offerMap, loadFromCache } = useCourseOffer();

  useEffect(() => {
    loadFromCache();
  }, [loadFromCache]);

  const normalizedCode = normalizeOfferCourseCodeInput(code);
  const validation = useMemo(
    () => (normalizedCode ? validateOfferCodeForBucket(course, normalizedCode) : { valid: false }),
    [course, normalizedCode],
  );

  const preview = normalizedCode && validation.valid
    ? getOfferCoursePreview(offerMap, normalizedCode)
    : undefined;

  const offerCredits = normalizedCode && validation.valid
    ? resolveCourseCredits(normalizedCode, offerMap)
    : null;

  const needsManualCredits = validation.valid && offerCredits === null;
  const parsedManual = parseInt(manualCredits, 10);
  const courseCredits = offerCredits ?? (Number.isFinite(parsedManual) ? parsedManual : null);

  const areasLabel = getAllowedAreasLabel(course);
  const creditsOk =
    courseCredits !== null && creditsMeetMinimum(courseCredits, course.credits);

  const willCreateRemainder =
    creditsOk &&
    courseCredits !== null &&
    courseCredits < course.credits;

  const canConfirm =
    validation.valid && courseCredits !== null && creditsOk;

  const handleConfirm = () => {
    if (!canConfirm || !normalizedCode || courseCredits === null) return;
    onConfirm({
      offerCourseCode: normalizedCode,
      courseCredits,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg dark:text-white">Código de materia</CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {course.title} ({course.credits} cr)
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="dark:hover:bg-gray-700">
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {areasLabel && (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Áreas permitidas: <span className="font-medium">{areasLabel}</span>
            </p>
          )}

          <div>
            <Label htmlFor="bucket-offer-code" className="text-sm dark:text-gray-200">
              Código USFQ
            </Label>
            <Input
              id="bucket-offer-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ej. MUS-2101"
              className="mt-1 uppercase dark:bg-gray-700 dark:border-gray-600"
              autoFocus
            />
            {!validation.valid && normalizedCode && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {'error' in validation ? validation.error : 'Código inválido'}
              </p>
            )}
            {preview && (
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                <span className="font-medium">{preview.course_code}</span>
                {' — '}
                {preview.title}
                {preview.credits != null && ` (${preview.credits} cr)`}
              </p>
            )}
            {needsManualCredits && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                No encontrado en la oferta actual. Ingresa los créditos manualmente.
              </p>
            )}
          </div>

          {needsManualCredits && (
            <div>
              <Label htmlFor="bucket-manual-credits" className="text-sm dark:text-gray-200">
                Créditos de la materia
              </Label>
              <Input
                id="bucket-manual-credits"
                type="number"
                min={1}
                value={manualCredits}
                onChange={(e) => setManualCredits(e.target.value)}
                placeholder="ej. 2"
                className="mt-1 w-32 dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          )}

          {courseCredits !== null && courseCredits <= 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              La materia debe tener al menos 1 crédito.
            </p>
          )}

          {willCreateRemainder && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Esta materia aporta {courseCredits} cr de {course.credits}. Se creará un
              card pendiente con {course.credits - courseCredits!} cr restante
              {course.credits - courseCredits! !== 1 ? 's' : ''}.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Confirmar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
