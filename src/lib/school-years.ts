import { frozenCattedre } from "./build-timetable";
import { isoDate, schoolYearRange } from "./dates";
import { withFormerTeachers } from "./replace-teacher";
import { officialData } from "./saved-timetables";
import { EMPTY_ALL, emptyTeacherPatch } from "./svuota";
import type { ArchivedYear, PersistedData } from "./types";
import { uid } from "./utils";

/** L'anno in corso così com'è adesso, con l'orario in vigore (slot 0) a cui si riferiscono le sostituzioni. */
export function archiveCurrentYear(data: PersistedData, archivedAt = Date.now()): ArchivedYear {
  const official = officialData(data);
  return {
    id: uid("y"),
    schoolYear: data.settings.schoolYear.trim(),
    archivedAt,
    data: {
      settings: data.settings,
      teachers: official.teachers,
      formerTeachers: data.formerTeachers ?? [],
      classes: data.classes,
      slots: official.slots,
      absences: data.absences,
      substitutions: data.substitutions,
      cattedre: data.cattedre,
    },
  };
}

/**
 * «Nuovo anno scolastico»: l'anno in corso va in archivio (se ha assenze o sostituzioni) e assenze, sostituzioni,
 * chi non è più in servizio e tutto l'orario ripartono da zero: lezioni, ore a disposizione e di progetto, segni di
 * Costruisci, orari salvati negli slot. Restano docenti, classi, cattedre (quelle ricavate dall'orario, scritte),
 * campanella e impostazioni.
 */
export function startNewSchoolYear(
  data: PersistedData,
  schoolYear: string,
  archivedAt = Date.now(),
): Pick<
  PersistedData,
  | "absences"
  | "substitutions"
  | "formerTeachers"
  | "settings"
  | "archivedYears"
  | "slots"
  | "teachers"
  | "cattedre"
  | "savedTimetables"
  | "activeSlot"
  | "officialBackup"
  | "cattedraBackup"
  | "cattedraDispBackup"
> {
  const archived = data.archivedYears ?? [];
  const hasWork = data.absences.length > 0 || data.substitutions.length > 0;
  const official = officialData(data);
  return {
    archivedYears: hasWork ? [...archived, archiveCurrentYear(data, archivedAt)] : archived,
    absences: [],
    substitutions: [],
    formerTeachers: [],
    settings: { ...data.settings, schoolYear: schoolYear.trim() || data.settings.schoolYear },
    slots: [],
    teachers: data.teachers.map((t) => ({ ...t, ...emptyTeacherPatch(t, EMPTY_ALL, []) })),
    // tolte le lezioni non si potrebbero più ricavare: restano scritte
    cattedre: frozenCattedre(official) ?? data.cattedre,
    savedTimetables: [],
    activeSlot: 0,
    officialBackup: undefined,
    cattedraBackup: undefined,
    cattedraDispBackup: undefined,
  };
}

/** I dati di un anno in archivio, pronti per il Report (con chi allora non era più in servizio). */
export function archivedYearData(year: ArchivedYear): PersistedData {
  return withFormerTeachers({
    ...year.data,
    selectedDate: schoolYearRange(year.schoolYear, isoDate(new Date(year.archivedAt))).to,
    activeSlot: 0,
  });
}

/** Nomi da mostrare per gli anni in archivio: lo stesso anno archiviato due volte prende «(2)». */
export function archivedYearLabels(years: ArchivedYear[]): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const y of years) {
    const label = y.schoolYear || "Anno senza nome";
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    out.set(y.id, n > 1 ? `${label} (${n})` : label);
  }
  return out;
}
