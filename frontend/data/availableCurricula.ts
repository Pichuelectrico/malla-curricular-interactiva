export interface AvailableCurriculum {
  id: string;
  slug: string; // pretty URL path, e.g., 'malla-adm'
  name: string;
  description: string;
  year: string;
  credits: number;
  courses: number;
  dataLoader: () => Promise<any>;
}

export const availableCurricula: AvailableCurriculum[] = [
  {
    id: "adm-usfq",
    slug: "malla-adm",
    name: "Administración de Empresas",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 124,
    courses: 48,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ADM.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ADM.json');
      return { default: await res.json() };
    },
  },
  {
    id: "ant-usfq",
    slug: "malla-ant",
    name: "Antropología",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ANT.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ANT.json');
      return { default: await res.json() };
    },
  },
  {
    id: "arq-usfq",
    slug: "malla-arq",
    name: "Arquitectura",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 145,
    courses: 47,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ARQ.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ARQ.json');
      return { default: await res.json() };
    },
  },
  {
    id: "arv-usfq",
    slug: "malla-arv",
    name: "Artes Visuales",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ARV.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ARV.json');
      return { default: await res.json() };
    },
  },
  {
    id: "pol-usfq",
    slug: "malla-pol",
    name: "Ciencias Políticas",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-POL.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-POL.json');
      return { default: await res.json() };
    },
  },
  {
    id: "cin-usfq",
    slug: "malla-cin",
    name: "Cine",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-CIN.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-CIN.json');
      return { default: await res.json() };
    },
  },
  {
    id: "com-usfq",
    slug: "malla-com",
    name: "Comunicación",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-COM.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-COM.json');
      return { default: await res.json() };
    },
  },
  {
    id: "jur-usfq",
    slug: "malla-jur",
    name: "Derecho",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 147,
    courses: 56,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-JUR.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-JUR.json');
      return { default: await res.json() };
    },
  },
  {
    id: "dic-usfq",
    slug: "malla-dic",
    name: "Diseño Gráfico: Diseño Comunicacional",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-DIC.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-DIC.json');
      return { default: await res.json() };
    },
  },
  {
    id: "eco-usfq",
    slug: "malla-eco",
    name: "Economía",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 107,
    courses: 43,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ECO.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ECO.json');
      return { default: await res.json() };
    },
  },
  {
    id: "edu-usfq",
    slug: "malla-edu",
    name: "Educación",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 48,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-EDU.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-EDU.json');
      return { default: await res.json() };
    },
  },
  {
    id: "fin-usfq",
    slug: "malla-fin",
    name: "Finanzas",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 124,
    courses: 48,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-FIN.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-FIN.json');
      return { default: await res.json() };
    },
  },
  {
    id: "fis-usfq",
    slug: "malla-fis",
    name: "Física",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-FIS.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-FIS.json');
      return { default: await res.json() };
    },
  },
  {
    id: "gst-usfq",
    slug: "malla-gst",
    name: "Gastronomía",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 121,
    courses: 47,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-GST.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-GST.json');
      return { default: await res.json() };
    },
  },
  {
    id: "hsp-usfq",
    slug: "malla-hsp",
    name: "Hospitalidad y Hotelería",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 121,
    courses: 47,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-HSP.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-HSP.json');
      return { default: await res.json() };
    },
  },
  {
    id: "icv-usfq",
    slug: "malla-icv",
    name: "Ingeniería Civil",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 136,
    courses: 52,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ICV.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ICV.json');
      return { default: await res.json() };
    },
  },
  {
    id: "age-usfq",
    slug: "malla-age",
    name: "Ingeniería en Agroempresa",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-AGE.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-AGE.json');
      return { default: await res.json() };
    },
  },
  {
    id: "ali-usfq",
    slug: "malla-ali",
    name: "Ingeniería en Alimentos",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ALI.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ALI.json');
      return { default: await res.json() };
    },
  },
  {
    id: "btc-usfq",
    slug: "malla-btc",
    name: "Ingeniería en Biotecnología",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 136,
    courses: 52,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-BTC.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-BTC.json');
      return { default: await res.json() };
    },
  },
  {
    id: "cmp-usfq",
    slug: "malla-cmp",
    name: "Ingeniería en Ciencias de la Computación",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-CMP.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-CMP.json');
      return { default: await res.json() };
    },
  },
  {
    id: "iel-usfq",
    slug: "malla-iel",
    name: "Ingeniería en Electrónica y Automatización",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-IEL.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-IEL.json');
      return { default: await res.json() };
    },
  },
  {
    id: "mac-usfq",
    slug: "malla-mac",
    name: "Ingeniería en Matemáticas Aplicadas y Computación",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 136,
    courses: 52,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-MAC.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-MAC.json');
      return { default: await res.json() };
    },
  },
  {
    id: "iin-usfq",
    slug: "malla-iin",
    name: "Ingeniería Industrial",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-IIN.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-IIN.json');
      return { default: await res.json() };
    },
  },
  {
    id: "ime-usfq",
    slug: "malla-ime",
    name: "Ingeniería Mecánica",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-IME.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-IME.json');
      return { default: await res.json() };
    },
  },
  {
    id: "inq-usfq",
    slug: "malla-inq",
    name: "Ingeniería Química",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 139,
    courses: 53,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-INQ.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-INQ.json');
      return { default: await res.json() };
    },
  },
  {
    id: "lit-usfq",
    slug: "malla-lit",
    name: "Literatura",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-LIT.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-LIT.json');
      return { default: await res.json() };
    },
  },
  {
    id: "mat-usfq",
    slug: "malla-mat",
    name: "Matemática",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 142,
    courses: 54,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-MAT.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-MAT.json');
      return { default: await res.json() };
    },
  },
  {
    id: "med-usfq",
    slug: "malla-med",
    name: "Medicina",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 232,
    courses: 101,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-MED.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-MED.json');
      return { default: await res.json() };
    },
  },
  {
    id: "vet-usfq",
    slug: "malla-vet",
    name: "Medicina Veterinaria",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 148,
    courses: 66,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-VET.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-VET.json');
      return { default: await res.json() };
    },
  },
  {
    id: "nit-usfq",
    slug: "malla-nit",
    name: "Negocios Internacionales",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 121,
    courses: 47,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-NIT.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-NIT.json');
      return { default: await res.json() };
    },
  },
  {
    id: "nut-usfq",
    slug: "malla-nut",
    name: "Nutrición y Dietética",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-NUT.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-NUT.json');
      return { default: await res.json() };
    },
  },
  {
    id: "odt-usfq",
    slug: "malla-odt",
    name: "Odontología",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 178,
    courses: 113,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-ODT.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-ODT.json');
      return { default: await res.json() };
    },
  },
  {
    id: "per-usfq",
    slug: "malla-per",
    name: "Periodismo",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-PER.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-PER.json');
      return { default: await res.json() };
    },
  },
  {
    id: "psi-usfq",
    slug: "malla-psi",
    name: "Psicología",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-PSI.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-PSI.json');
      return { default: await res.json() };
    },
  },
  {
    id: "psc-usfq",
    slug: "malla-psc",
    name: "Psicología Clínica",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 137,
    courses: 53,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-PSC.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-PSC.json');
      return { default: await res.json() };
    },
  },
  {
    id: "pub-usfq",
    slug: "malla-pub",
    name: "Publicidad",
    description: "Universidad San Francisco de Quito",
    year: "2026",
    credits: 127,
    courses: 49,
    dataLoader: async () => {
      const base = (import.meta as any).env?.BASE_URL || '/';
      const res = await fetch(`${base}data/Malla-PUB.json`);
      if (!res.ok) throw new Error('No se pudo cargar /data/Malla-PUB.json');
      return { default: await res.json() };
    },
  },
];
