export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6;

export type Period = {
  id: string;
  index: number;
  label: string;
  start: string;
  end: string;
};

export type TeacherRole = "cattedra" | "potenziamento" | "sostegno" | "religione";

export type Tempo = "TN" | "TP";

export type Teacher = {
  id: string;
  lastName: string;
  firstName: string;
  subjects: string[];
  weeklyHours: number;
  role: TeacherRole;
  notes: string;
  color: string;
  assignedClassIds: string[];
  /** Insegna anche in un altro plesso: in Costruisci si segnano le ore altrove. */
  otherPlesso?: boolean;
  awaySlots?: { day: DayOfWeek; periodId: string }[];
};

export type SchoolClass = {
  id: string;
  name: string;
  grade: 1 | 2 | 3;
  section: string;
  students: number;
  tempo: Tempo;
};

export type TimetableSlot = {
  id: string;
  day: DayOfWeek;
  periodId: string;
  classId: string;
  teacherId: string;
  subject: string;
};

export type AbsenceReason =
  | "malattia"
  | "permesso"
  | "l104"
  | "formazione"
  | "visita"
  | "permesso_breve"
  | "altro";

export type Absence = {
  id: string;
  teacherId: string;
  dateFrom: string;
  dateTo: string;
  reason: AbsenceReason;
  notes: string;
  allDay: boolean;
  periodIds: string[];
};

export type SubstitutionType =
  | "disposizione"
  | "potenziamento"
  | "recupero"
  | "eccedente"
  | "sostegno"
  | "compresenza"
  | "divisione"
  | "altro";

export type Substitution = {
  id: string;
  date: string;
  periodId: string;
  classId: string;
  absentTeacherId: string;
  substituteId: string | null;
  type: SubstitutionType | null;
  activity: string;
  notes: string;
  subject: string;
};

export type MonteOreRow = { subject: string; hours: number };

export type Cattedra = {
  classId: string;
  subject: string;
  teacherId: string;
  hours: number;
};

export type Settings = {
  schoolName: string;
  plesso: string;
  schoolYear: string;
  responsabile: string;
  days: DayOfWeek[];
  periods: Period[];
  monteOre?: MonteOreRow[];
};

export type PersistedData = {
  settings: Settings;
  teachers: Teacher[];
  classes: SchoolClass[];
  slots: TimetableSlot[];
  absences: Absence[];
  substitutions: Substitution[];
  selectedDate: string;
  cattedre?: Cattedra[];
  cattedraBackup?: TimetableSlot[];
  /** Unix ms of last user save. 0 = example seed, never overwrite a real save. */
  savedAt?: number;
  /** "user" = this device's registro. "seed" = example data. */
  origin?: "seed" | "user";
};

export const ABSENCE_REASONS: { value: AbsenceReason; label: string }[] = [
  { value: "malattia", label: "Malattia" },
  { value: "permesso", label: "Permesso personale" },
  { value: "l104", label: "Permesso L. 104" },
  { value: "formazione", label: "Formazione / aggiornamento" },
  { value: "visita", label: "Visita medica" },
  { value: "permesso_breve", label: "Permesso breve (ore)" },
  { value: "altro", label: "Altro" },
];

export const SUBSTITUTION_TYPES: { value: SubstitutionType; label: string; hint: string }[] = [
  { value: "disposizione", label: "Ora a disposizione", hint: "Docente libero in orario di servizio" },
  { value: "potenziamento", label: "Potenziamento", hint: "Organico di potenziamento" },
  { value: "recupero", label: "Recupero", hint: "Recupero ore non prestate" },
  { value: "eccedente", label: "Ora eccedente", hint: "Retribuita oltre orario" },
  { value: "sostegno", label: "Sostegno", hint: "Docente di sostegno disponibile" },
  { value: "compresenza", label: "Compresenza", hint: "Docente già in classe" },
  { value: "divisione", label: "Divisione classe", hint: "Alunni suddivisi in altre classi" },
  { value: "altro", label: "Altro", hint: "" },
];

export const SUBJECTS = [
  "Italiano",
  "Storia",
  "Geografia",
  "Matematica",
  "Scienze",
  "Inglese",
  "Francese",
  "Spagnolo",
  "Tecnologia",
  "Arte e Immagine",
  "Musica",
  "Scienze Motorie",
  "Religione",
  "Educazione civica",
  "Sostegno",
  "Potenziamento",
];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
};

export const DAY_SHORT: Record<DayOfWeek, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Gio",
  5: "Ven",
  6: "Sab",
};

export const ROLE_LABELS: Record<TeacherRole, string> = {
  cattedra: "Cattedra",
  potenziamento: "Potenziamento",
  sostegno: "Sostegno",
  religione: "Religione",
};
