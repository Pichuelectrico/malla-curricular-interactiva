export interface AvailableCurriculum {
  id: string;
  name: string;
  description: string;
  year: string;
  credits: number;
  courses: number;
  dataLoader: () => Promise<any>;
}

export const availableCurricula: AvailableCurriculum[] = [
  {
    id: "cmp-usfq",
    name: "Ingeniería en Ciencias de la Computación",
    description: "Universidad San Francisco de Quito",
    year: "2024",
    credits: 152,
    courses: 41,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-CMP.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-CMP.json');
      return { default: await res.json() };
    },
  },
  {
    id: "btc-usfq",
    name: "Ingeniería en Biotecnología",
    description: "Universidad San Francisco de Quito",
    year: "2024",
    credits: 152,
    courses: 41,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-BIOTEC.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-BIOTEC.json');
      return { default: await res.json() };
    },
  },
  {
    id: "mac-usfq",
    name: "Ingeniería en Matemáticas Aplicadas y Computación",
    description: "Universidad San Francisco de Quito",
    year: "2024",
    credits: 152,
    courses: 41,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-MAC.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-MAC.json');
      return { default: await res.json() };
    },
  },
  // Aquí se pueden agregar más mallas cuando estén disponibles
  // {
  //   id: 'sistemas-usfq',
  //   name: 'Ingeniería en Sistemas',
  //   description: 'Universidad San Francisco de Quito',
  //   year: '2024',
  //   credits: 148,
  //   courses: 39,
  //   dataLoader: () => import('./Malla-Sistemas.json')
  // }
];
