export interface Course {
  id: string;
  code: string;
  title: string;
  description: string;
  credits: number;
  semester: number;
  block: string;
  area: string;
  type: string;
  prerequisites: string[];
  alternatives: string[];
}

export interface CurriculumData {
  source_file?: string;
  "Last-Modified"?: string;
  courses: Course[];
}
