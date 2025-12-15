import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, X, Trash2, RotateCcw, Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Letras objetivo y umbrales
const GRADE_THRESHOLDS: Record<string, number> = {
  A: 91,
  B: 81,
  C: 71,
  D: 61,
};

interface Item {
  id: string;
  nombre: string;
  max_puntos: number;
  puntos_obtenidos: number | null; // null = sin nota
}

interface Categoria {
  id: string;
  nombre: string;
  peso_puntos: number; // sobre 100
  items: Item[];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

interface GradeEstimatorDrawerProps {
  exposeOpen?: (openFn: () => void) => void;
  hideFloatingButton?: boolean;
}

export default function GradeEstimatorDrawer({ exposeOpen, hideFloatingButton }: GradeEstimatorDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [targetLetter, setTargetLetter] = useState<'A' | 'B' | 'C' | 'D'>('C');
  const [puntosExtra, setPuntosExtra] = useState<number>(0);

  // Reiniciar cada vez que se abre
  useEffect(() => {
    if (isOpen) {
      setCategorias([]);
      setTargetLetter('C');
      setPuntosExtra(0);
    }
  }, [isOpen]);

  const metaFinal = useMemo(() => GRADE_THRESHOLDS[targetLetter], [targetLetter]);

  const puntosActualesCategoria = (cat: Categoria) => {
    const obtenidos = cat.items.reduce((acc, i) => acc + (i.puntos_obtenidos ?? 0), 0);
    const maximosConNota = cat.items.reduce((acc, i) => acc + (i.puntos_obtenidos != null ? i.max_puntos : 0), 0);
    if (maximosConNota <= 0) return 0;
    return (obtenidos / maximosConNota) * cat.peso_puntos;
  };

  const calcularNotaActual = (cats: Categoria[], extra: number) => {
    return cats.reduce((acc, c) => acc + puntosActualesCategoria(c), 0) + extra;
  };

  const notaActual = useMemo(() => calcularNotaActual(categorias, puntosExtra), [categorias, puntosExtra]);

  // Mejor nota posible alcanzable con los puntos restantes
  const mejorNotaPosible = useMemo(() => {
    const base = categorias.reduce((acc, c) => acc + puntosActualesCategoria(c), 0) + puntosExtra;
    let extraPosible = 0;
    categorias.forEach(c => {
      const contribActual = puntosActualesCategoria(c);
      const maxTotal = c.items.reduce((a, i) => a + i.max_puntos, 0);
      const quedan = c.items.some(i => i.puntos_obtenidos == null);
      if (maxTotal === 0) {
        // No actividades: no puede subir
        extraPosible += 0;
      } else if (quedan) {
        // Puede llegar hasta el 100% del peso de la categoría
        extraPosible += Math.max(0, c.peso_puntos - contribActual);
      } else {
        // Sin restantes: no puede subir más
        extraPosible += 0;
      }
    });
    return base + extraPosible;
  }, [categorias, puntosExtra]);

  // Cálculo de lo necesario por categoría (similar a la función del script)
  const necesarioPorCategoria = (cat: Categoria) => {
    const nota = notaActual;
    const contribCatActual = puntosActualesCategoria(cat);
    const delta = metaFinal - nota;

    if (delta <= 0) {
      return { tipo: 'ok', mensaje: `Ya alcanzas ${metaFinal.toFixed(2)} con tus notas actuales.` } as const;
    }

    // Primero validar estructura y si quedan actividades por calificar
    const maxTotal = cat.items.reduce((acc, i) => acc + i.max_puntos, 0);
    if (maxTotal === 0) {
      return { tipo: 'vacio', mensaje: 'La categoría no tiene actividades.' } as const;
    }
    const maxFuturo = cat.items.reduce((acc, i) => acc + (i.puntos_obtenidos == null ? i.max_puntos : 0), 0);
    if (maxFuturo <= 0) {
      return { tipo: 'sin_restantes', mensaje: 'No quedan actividades sin nota; no puedes subir esta categoría.' } as const;
    }

    // Luego calcular si es posible dentro del peso de la categoría
    const contribCatNueva = contribCatActual + delta;
    if (contribCatNueva > cat.peso_puntos + 1e-6) {
      return { tipo: 'imposible', mensaje: `Ni con 100% en '${cat.nombre}' llegas a ${metaFinal.toFixed(2)}.` } as const;
    }

    const proporcionTotalNecesaria = contribCatNueva / cat.peso_puntos; // fracción dentro de la categoría
    const totalPuntosRequeridosCat = proporcionTotalNecesaria * maxTotal;
    const obtenidosActuales = cat.items.reduce((acc, i) => acc + (i.puntos_obtenidos ?? 0), 0);
    const puntosFuturosNecesarios = totalPuntosRequeridosCat - obtenidosActuales;

    if (puntosFuturosNecesarios - maxFuturo > 1e-6) {
      return { tipo: 'insuficiente', mensaje: `Aunque saques 100% en lo restante no llegas a ${metaFinal.toFixed(2)}. Necesitas ${puntosFuturosNecesarios.toFixed(2)} sobre ${maxFuturo.toFixed(2)}.` } as const;
    }

    const restantes = cat.items.filter(i => i.puntos_obtenidos == null);
    if (restantes.length === 1) {
      return { tipo: 'unico', mensaje: `Necesitas ${puntosFuturosNecesarios.toFixed(2)} / ${restantes[0].max_puntos} en '${restantes[0].nombre}'.` } as const;
    }
    const promedioNecesario = (puntosFuturosNecesarios / maxFuturo) * 100;
    return { tipo: 'promedio', mensaje: `Necesitas ${puntosFuturosNecesarios.toFixed(2)} pts sobre ${maxFuturo.toFixed(2)} (${promedioNecesario.toFixed(2)}% en promedio) en las actividades restantes.` } as const;
  };

  const addCategoria = () => {
    setCategorias(prev => [
      ...prev,
      { id: uid(), nombre: `Categoría ${prev.length + 1}`, peso_puntos: 20, items: [] },
    ]);
  };

  const removeCategoria = (id: string) => {
    setCategorias(prev => prev.filter(c => c.id !== id));
  };

  const updateCategoria = (id: string, patch: Partial<Categoria>) => {
    setCategorias(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addItem = (catId: string) => {
    setCategorias(prev => prev.map(c => (
      c.id === catId
        ? { ...c, items: [...c.items, { id: uid(), nombre: `Actividad ${c.items.length + 1}`, max_puntos: 10, puntos_obtenidos: null }] }
        : c
    )));
  };

  const removeItem = (catId: string, itemId: string) => {
    setCategorias(prev => prev.map(c => (
      c.id === catId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c
    )));
  };

  const updateItem = (catId: string, itemId: string, patch: Partial<Item>) => {
    setCategorias(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return {
        ...c,
        items: c.items.map(i => (i.id === itemId ? { ...i, ...patch } : i)),
      };
    }));
  };

  const handleClear = () => {
    setCategorias([]);
    setPuntosExtra(0);
    setTargetLetter('C');
  };

  useEffect(() => {
    // Registrar la función de apertura una sola vez para evitar bucles
    if (exposeOpen) {
      exposeOpen(() => setIsOpen(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Botón flotante opcional */}
      {!hideFloatingButton && (
        <div className="fixed bottom-32 right-4 z-30">
          <Card className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 p-0 py-0">
            <Button
              size="sm"
              onClick={() => setIsOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-3 py-2"
            >
              <Calculator className="w-4 h-4" />
              <span className="text-sm">Calculadora</span>
            </Button>
          </Card>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="w-[95vw] max-w-6xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Target className="w-5 h-5" /> Aproxima tu nota
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="dark:hover:bg-gray-700">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Letra objetivo</label>
                  <Select value={targetLetter} onValueChange={(v) => setTargetLetter(v as any)}>
                    <SelectTrigger className="w-full dark:bg-gray-700 dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['A','B','C','D'] as const).map(l => (
                        <SelectItem key={l} value={l}>{l} (≥ {GRADE_THRESHOLDS[l]})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meta (automática por letra)</label>
                  <Input value={metaFinal} readOnly className="dark:bg-gray-700 dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Puntos extra</label>
                  <Input
                    type="number"
                    value={puntosExtra}
                    onChange={(e) => setPuntosExtra(Number(e.target.value || 0))}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>

              {(() => {
                const logro = notaActual >= metaFinal;
                const posible = !logro && (mejorNotaPosible >= metaFinal);
                const colorText = logro ? 'text-green-700' : posible ? 'text-yellow-700' : 'text-red-700';
                const bg = logro
                  ? 'bg-green-50 border-green-200'
                  : posible
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-red-50 border-red-200';

                // Construir guía de qué necesitar en cada categoría (aproximación por categoría)
                const guidance = !logro && posible
                  ? categorias
                      .map(cat => ({ cat, info: necesarioPorCategoria(cat) }))
                      // Solo mostrar guías accionables (qué sacar en 1 actividad o promedio necesario)
                      .filter(({ info }) => info.tipo === 'unico' || info.tipo === 'promedio')
                  : [];

                return (
                  <Alert className={`${bg}`}>
                    <AlertDescription>
                      Objetivo: <strong>{metaFinal}+</strong> · Nota actual: <strong className={colorText}>{notaActual.toFixed(2)} / 100</strong>
                      {logro && (
                        <span className="ml-2 font-semibold text-green-700">¡Lo lograste!</span>
                      )}
                      {!logro && posible && (
                        <div className="mt-2 space-y-1">
                          <div className="font-medium">Aún es posible. Necesitas aproximadamente:</div>
                          <ul className="list-disc ml-6">
                            {guidance.length === 0 ? (
                              <li>Mejora tus actividades restantes en alguna categoría.</li>
                            ) : (
                              guidance.map(({ cat, info }) => (
                                <li key={cat.id}>
                                  <span className="font-semibold">{cat.nombre}:</span> {info.mensaje}
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                      )}
                      {!logro && !posible && (
                        <span className="ml-2 font-semibold text-red-700">No logras cumplir con el objetivo.</span>
                      )}
                    </AlertDescription>
                  </Alert>
                );
              })()}

              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={addCategoria} className="dark:border-gray-600 dark:hover:bg-gray-700">
                  <Plus className="w-4 h-4 mr-1" /> Añadir categoría
                </Button>
                <Button variant="outline" onClick={handleClear} className="dark:border-gray-600 dark:hover:bg-gray-700">
                  <RotateCcw className="w-4 h-4 mr-1" /> Limpiar
                </Button>
              </div>

              <div className="space-y-4">
                {categorias.length === 0 && (
                  <p className="text-gray-500 dark:text-gray-400">Añade categorías y actividades para calcular lo necesario.</p>
                )}

                {categorias.map((cat) => {
                  const resumen = necesarioPorCategoria(cat);
                  return (
                    <Card key={cat.id} className="p-4 dark:bg-gray-700 dark:border-gray-600">
                      <div className="flex justify-between gap-2 flex-wrap">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                          <Input
                            value={cat.nombre}
                            onChange={(e) => updateCategoria(cat.id, { nombre: e.target.value })}
                            className="dark:bg-gray-600 dark:border-gray-500"
                          />
                          <Input
                            type="number"
                            value={cat.peso_puntos}
                            onChange={(e) => updateCategoria(cat.id, { peso_puntos: Number(e.target.value || 0) })}
                            className="dark:bg-gray-600 dark:border-gray-500"
                            placeholder="Peso sobre 100"
                          />
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                            Aporte actual: {puntosActualesCategoria(cat).toFixed(2)} / {cat.peso_puntos}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeCategoria(cat.id)} className="dark:hover:bg-gray-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {cat.items.map((it) => (
                          <div key={it.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                            <Input
                              value={it.nombre}
                              onChange={(e) => updateItem(cat.id, it.id, { nombre: e.target.value })}
                              className="dark:bg-gray-600 dark:border-gray-500"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={it.max_puntos}
                              onChange={(e) => updateItem(cat.id, it.id, { max_puntos: Number(e.target.value || 0) })}
                              className="dark:bg-gray-600 dark:border-gray-500"
                              placeholder="Máx puntos"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={it.puntos_obtenidos ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateItem(cat.id, it.id, { puntos_obtenidos: val === '' ? null : Number(val) });
                              }}
                              className="dark:bg-gray-600 dark:border-gray-500"
                              placeholder="Obtenidos (vacío = sin nota)"
                            />
                            <div className="flex justify-end">
                              <Button variant="ghost" size="icon" onClick={() => removeItem(cat.id, it.id)} className="dark:hover:bg-gray-600">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => addItem(cat.id)} className="dark:border-gray-500 dark:hover:bg-gray-600">
                          <Plus className="w-4 h-4 mr-1" /> Añadir actividad
                        </Button>
                      </div>

                      <div className="mt-3 text-sm p-2 rounded border dark:border-gray-500 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                        {resumen.mensaje}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
