/**
 * Il contenuto del foglio di un docente per il PDF «PDF docenti»: per ogni giorno e ora, una lezione, una
 * disposizione, la mensa o un'ora in un altro plesso (segnata con la × in Costruisci). Il disegno è in sheet-image.
 */
import { isDispHour, teacherSlotAt } from "./coverage";
import { isMensaLesson, isMensaPeriod, visiblePeriods } from "./periods";
import type { DayOfWeek, Period, PersistedData, Teacher } from "./types";

export type TeacherCell = {
  kind: "lesson" | "disp" | "mensa" | "away" | "project" | "empty";
  cls?: string;
  subject?: string;
};

export function teacherCellAt(data: PersistedData, t: Teacher, day: DayOfWeek, p: Period): TeacherCell {
  if (isDispHour(t, day, p.id)) return { kind: "disp" };
  const slot = teacherSlotAt(data, t.id, day, p.id);
  if (slot) {
    if (isMensaLesson(slot) || isMensaPeriod(p)) return { kind: "mensa" };
    const c = data.classes.find((x) => x.id === slot.classId);
    return { kind: "lesson", cls: c ? `${c.grade}${c.section}` : "", subject: slot.subject };
  }
  // ore segnate con la × in Costruisci (altro plesso) oppure «Progetto»
  const away = (t.awaySlots ?? []).find((a) => a.day === day && a.periodId === p.id);
  if (away) return { kind: away.progetto ? "project" : "away" };
  return { kind: "empty" };
}

/** Mattina sempre; mensa / 7ª / 8ª solo se il docente ha lì una lezione o una disposizione. */
export function teacherSheetPeriods(data: PersistedData, t: Teacher): Period[] {
  return visiblePeriods(data.settings).filter(
    (p) =>
      !p.tpOnly ||
      data.settings.days.some((d) => {
        const kind = teacherCellAt(data, t, d, p).kind;
        return kind !== "empty" && kind !== "away" && kind !== "project";
      }),
  );
}
