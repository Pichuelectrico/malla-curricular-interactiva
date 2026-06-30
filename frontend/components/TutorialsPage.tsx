import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, BookOpen, Calendar, Unlock, GraduationCap, Calculator, Layers, Settings } from 'lucide-react';

interface TutorialsPageProps {
  onBack: () => void;
}

interface TutorialSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  videoId?: string;
}

const SECTIONS: TutorialSection[] = [
  {
    id: 'malla',
    title: 'Uso de la malla',
    icon: <BookOpen className="w-4 h-4" />,
    content: (
      <>
        <p>
          La malla curricular te permite visualizar todas las materias de tu carrera organizadas por semestre o bloque.
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Selecciona tu carrera desde el selector en la parte superior.</li>
          <li>Usa los modos de selección: <strong>Completada</strong>, <strong>Cursando</strong> o <strong>Planeada</strong>.</li>
          <li>Haz clic en una materia para marcarla según el modo activo.</li>
          <li>Las materias bloqueadas (grises) requieren cumplir prerequisitos primero.</li>
          <li>El límite es de 16 créditos por semestre en modos Cursando y Planeada.</li>
          <li>Tu progreso se guarda automáticamente si tienes sesión iniciada.</li>
          <li>En <strong>Configuración</strong> (menú de tu cuenta) puedes ver el avance de cada carrera y eliminar el progreso de una malla sin borrar tu cuenta.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'opcion-libre',
    title: 'Materias de opción libre',
    icon: <Layers className="w-4 h-4" />,
    content: (
      <>
        <p>
          Algunos requisitos de la malla no son una materia fija sino un <strong>bucket de créditos</strong> que debes cubrir con una materia USFQ concreta. Esto aplica a <strong>HUM</strong>, <strong>CCSS</strong>, <strong>CIENCIAS</strong>, <strong>ARTE</strong>, <strong>OPT</strong> y <strong>ELECTIVAS</strong>.
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Debes tener <strong>sesión iniciada</strong> para registrar el código de materia al marcarlas como completada, cursando o planeada.</li>
          <li>Al marcar un bucket, ingresa el código USFQ de la materia que tomaste o tomarás (ej. <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">MUS-2101</code>, <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">LIT-2001</code>).</li>
          <li><strong>CIENCIAS:</strong> BIO, QUI, FIS, ECL, NUT, GEO.</li>
          <li><strong>HUM:</strong> LIT, FIL, ESC, ARH.</li>
          <li><strong>CCSS:</strong> ANT, EDU, HIS, REL, POL, SOC, PSI.</li>
          <li><strong>ARTE:</strong> ART, DAN, TEA, MUS.</li>
          <li><strong>OPT / ELECTIVAS:</strong> cualquier materia USFQ válida.</li>
          <li>Si la materia elegida tiene <strong>menos créditos</strong> que el bucket (ej. 2 cr de 3), aparece un card adicional pendiente con los créditos faltantes de la misma categoría.</li>
          <li>Al completar un slot pendiente, la materia debe tener <strong>al menos</strong> los créditos que faltan (puede tener más).</li>
          <li>El código se <strong>prellena en el planificador</strong> en el campo &quot;Código de materia&quot; y puedes editarlo antes de elegir el NRC.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'planificador',
    title: 'Uso del planificador',
    icon: <Calendar className="w-4 h-4" />,
    content: (
      <>
        <p>
          El planificador de horarios te ayuda a armar tu semestre con las materias que tienes marcadas como <strong>planeadas</strong>.
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Abre el planificador desde el botón flotante de herramientas (llave inglesa) en la esquina inferior.</li>
          <li>Asigna NRCs en modo automático o arrastra bloques al calendario en modo manual.</li>
          <li>Detecta conflictos de horario automáticamente (incluye teoría, LAB y EJ).</li>
          <li>Puedes crear varias opciones de horario (Opción A, B, C) dentro del planificador.</li>
          <li>Si tienes doble carrera o minor, activa la combinación de mallas desde <strong>Configuración</strong> (ver sección correspondiente).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sobrepaso',
    title: 'Cómo hacer sobrepasos',
    icon: <Unlock className="w-4 h-4" />,
    content: (
      <>
        <p>
          El sobrepaso te permite desbloquear materias sin cumplir sus prerequisitos. Es útil si ya aprobaste una materia equivalente en otra universidad o tienes una excepción académica.
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Debes tener una cuenta con sesión iniciada.</li>
          <li>Haz clic en <strong>Sobrepaso</strong> en el header.</li>
          <li>Agrega el código de la materia (ej. CMP4002 o CMP-4002).</li>
          <li>La materia se desbloqueará en cualquier malla donde exista ese código.</li>
          <li>Puedes quitar códigos en cualquier momento desde el mismo modal.</li>
          <li>El límite de 16 créditos por semestre sigue aplicando.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'doble-minor',
    title: 'Doble carrera y minor',
    icon: <GraduationCap className="w-4 h-4" />,
    content: (
      <>
        <p>
          Si estás cursando doble carrera o un minor, puedes combinar materias de varias mallas en el planificador.
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Selecciona cada malla por separado y marca tu progreso en cada una (modo <strong>Planeadas</strong> para el planificador).</li>
          <li>Las materias completadas en una malla pueden desbloquear prerequisitos en otra (overlay global).</li>
          <li>Abre <strong>Configuración</strong> desde el menú de tu cuenta (arriba a la derecha).</li>
          <li>En <strong>Progreso por carrera</strong> verás el porcentaje completado, cursando y planeadas de cada malla.</li>
          <li>Activa <strong>Incluir materias planeadas de mis otras carreras</strong> si tienes planeadas en dos o más carreras.</li>
          <li>Si una materia está planeada en ambas mallas, el planificador usa la de la <strong>malla activa</strong>.</li>
          <li>Los conflictos de horario muestran de qué carrera viene cada materia.</li>
          <li>Puedes <strong>eliminar el progreso</strong> de una carrera específica desde Configuración sin borrar tu cuenta.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'configuracion',
    title: 'Configuración de cuenta',
    icon: <Settings className="w-4 h-4" />,
    content: (
      <>
        <p>
          El menú de <strong>Configuración</strong> está en tu cuenta (arriba a la derecha cuando iniciaste sesión).
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li><strong>Progreso por carrera:</strong> resumen con barra de avance (% completado), conteo de completadas, cursando y planeadas.</li>
          <li><strong>Eliminar progreso de una carrera:</strong> borra solo esa malla en la nube; pide confirmación antes de ejecutar.</li>
          <li><strong>Planificador de horario:</strong> opción para incluir materias planeadas de otras carreras (visible si tienes planeadas en dos o más mallas).</li>
          <li><strong>Oferta académica:</strong> periodo actual y fecha del último scrape de cursos.</li>
          <li><strong>Restablecer contraseña</strong> y <strong>eliminar cuenta</strong> también están en este modal.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'calculador',
    title: 'Uso del calculador de nota',
    icon: <Calculator className="w-4 h-4" />,
    content: (
      <>
        <p>
          El calculador de nota te ayuda a estimar tu calificación final según las ponderaciones de cada actividad.
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Abre el calculador desde el botón flotante de herramientas.</li>
          <li>Ingresa el nombre de cada categoría (exámenes, tareas, proyectos, etc.) y su ponderación.</li>
          <li>Agrega las notas que ya tienes en cada categoría.</li>
          <li>El calculador te muestra tu promedio actual y qué nota necesitas para alcanzar tu meta.</li>
          <li>Tus datos se guardan localmente mientras navegas.</li>
        </ul>
      </>
    ),
  },
];

function VideoPlaceholder({ videoId }: { videoId?: string }) {
  return (
    <div className="mt-6 aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-dashed border-gray-300 dark:border-gray-600">
      {/* TODO: reemplazar VIDEO_ID cuando el tutorial esté listo
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="Tutorial en video"
        className="w-full h-full rounded-lg"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      */}
      <p className="text-gray-500 dark:text-gray-400 text-sm">Video próximamente</p>
    </div>
  );
}

export default function TutorialsPage({ onBack }: TutorialsPageProps) {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const activeSection = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver a la malla
      </Button>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Tutoriales</h1>

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-64 flex-shrink-0">
          <ul className="space-y-1">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  onClick={() => setActiveId(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                    activeId === section.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {section.icon}
                  {section.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <Card className="flex-1 dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {activeSection.title}
            </h2>
            <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed space-y-2">
              {activeSection.content}
            </div>
            <VideoPlaceholder videoId={activeSection.videoId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
