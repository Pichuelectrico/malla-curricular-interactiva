export interface AvailableCurriculum {
  id: string;
  name: string;
  description: string;
  year: string;
  credits: number;
  courses: number;
  dataPath: string;
}

export const availableCurricula: AvailableCurriculum[] = [
  {
    id: 'cmp-usfq',
    name: 'Ingeniería en Ciencias de la Computación',
    description: 'Universidad San Francisco de Quito',
    year: '2024',
    credits: 152,
    courses: 41,
    dataPath: './data/Malla-CMP.json'
  },
  {
    id: "btc-usfq",
    name: "Ingeniería en Biotecnología",
    description: "Universidad San Francisco de Quito",
    year: "2024",
    credits: 152,
    courses: 41,
    dataPath: './data/Malla-BIOTEC.json'
  },
  // Aquí se pueden agregar más mallas cuando estén disponibles
  // {
  //   id: 'sistemas-usfq',
  //   name: 'Ingeniería en Sistemas',
  //   description: 'Universidad San Francisco de Quito',
  //   year: '2024',
  //   credits: 148,
  //   courses: 39,
  //   dataPath: '/data/Malla-Sistemas.json'
  // }
];
