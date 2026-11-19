import { describe, expect, it } from 'vitest';
import {
  escapeLikePattern,
  globalCompletedKey,
  readLocalAnonProgress,
  hasMeaningfulProgress,
  isAccountScopedLocalKey,
  progressKey,
  retryWithBackoff,
  serializeProgress,
} from './progressSync';

describe('progressKey', () => {
  it('distingue usuario y malla (evita guardar la malla vieja bajo el id nuevo)', () => {
    expect(progressKey('u1', 'Malla-academica-CMP')).not.toBe(progressKey('u1', 'Malla-academica-ADM'));
    expect(progressKey('u1', 'Malla-academica-CMP')).not.toBe(progressKey(null, 'Malla-academica-CMP'));
    expect(progressKey(undefined, 'X')).toBe(progressKey(null, 'X'));
  });
});

describe('serializeProgress', () => {
  const base = {
    completedCourses: new Set(['B', 'A']),
    inProgressCourses: new Set<string>(),
    plannedCourses: new Set(['C']),
    hasWritingIntensive: false,
  };
  it('es independiente del orden de inserción', () => {
    const a = serializeProgress(base);
    const b = serializeProgress({ ...base, completedCourses: new Set(['A', 'B']) });
    expect(a).toBe(b);
  });
  it('cambia cuando cambia el contenido', () => {
    expect(serializeProgress(base)).not.toBe(
      serializeProgress({ ...base, plannedCourses: new Set(['C', 'D']) }),
    );
    expect(serializeProgress(base)).not.toBe(serializeProgress({ ...base, hasWritingIntensive: true }));
  });
  it('ignora el orden de claves en bucketFulfillments', () => {
    const a = serializeProgress({ ...base, bucketFulfillments: { x: 1, y: { b: 1, a: 2 } } });
    const b = serializeProgress({ ...base, bucketFulfillments: { y: { a: 2, b: 1 }, x: 1 } });
    expect(a).toBe(b);
  });
});

describe('hasMeaningfulProgress', () => {
  it('false con listas vacías o nulas, true con cualquier materia', () => {
    expect(hasMeaningfulProgress({ completedCourses: [], inProgressCourses: null })).toBe(false);
    expect(hasMeaningfulProgress({ plannedCourses: ['A'] })).toBe(true);
  });
});

describe('retryWithBackoff', () => {
  const noSleep = async () => {};
  it('reintenta y devuelve el primer éxito', async () => {
    let calls = 0;
    const out = await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('red');
        return 'ok';
      },
      [1, 1, 1],
      { sleep: noSleep },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });
  it('relanza el último error al agotar los reintentos', async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(async () => { calls += 1; throw new Error(`fallo ${calls}`); }, [1, 1], { sleep: noSleep }),
    ).rejects.toThrow('fallo 3');
    expect(calls).toBe(3);
  });
  it('se detiene si la carga fue cancelada', async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(async () => { calls += 1; throw new Error('x'); }, [1, 1, 1], {
        sleep: noSleep,
        isCancelled: () => true,
      }),
    ).rejects.toThrow('x');
    expect(calls).toBe(1);
  });
});

describe('escapeLikePattern / isAccountScopedLocalKey', () => {
  it('escapa comodines de ILIKE', () => {
    expect(escapeLikePattern('a_b%c\\d@x.com')).toBe('a\\_b\\%c\\\\d@x.com');
  });
  it('marca las claves que no deben sobrevivir al cierre de sesión', () => {
    expect(isAccountScopedLocalKey('globalCompletedCourses:user-1')).toBe(true);
    expect(isAccountScopedLocalKey('globalCompletedCourses')).toBe(false); // clave anónima
    expect(isAccountScopedLocalKey('hasWritingIntensive:Malla-academica-CMP')).toBe(false);
    expect(isAccountScopedLocalKey('theme')).toBe(false);
    expect(isAccountScopedLocalKey('progress_Malla-academica-CMP')).toBe(false);
  });
});

describe('globalCompletedKey', () => {
  it('separa el overlay por cuenta y conserva la clave anónima', () => {
    expect(globalCompletedKey(null)).toBe('globalCompletedCourses');
    expect(globalCompletedKey('u1')).toBe('globalCompletedCourses:u1');
    expect(globalCompletedKey('u1')).not.toBe(globalCompletedKey('u2'));
  });
});

describe('readLocalAnonProgress', () => {
  const store = (value: string | null) => ({ getItem: () => value });
  it('devuelve el progreso local con contenido', () => {
    const out = readLocalAnonProgress('M', store(JSON.stringify({ completedCourses: ['A'], plannedCourses: ['B'] })));
    expect(out?.completedCourses).toEqual(['A']);
    expect(out?.plannedCourses).toEqual(['B']);
  });
  it('devuelve null si está vacío, ausente o corrupto', () => {
    expect(readLocalAnonProgress('M', store(JSON.stringify({ completedCourses: [] })))).toBeNull();
    expect(readLocalAnonProgress('M', store(null))).toBeNull();
    expect(readLocalAnonProgress('M', store('{no json'))).toBeNull();
  });
});
