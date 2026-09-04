import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Absence,
  Cattedra,
  PersistedData,
  SchoolClass,
  Settings,
  Substitution,
  Teacher,
  TimetableSlot,
} from "./types";
import { buildSeed, EMPTY_DATA, applyOrganicoFixes } from "./seed";
import { uid } from "./utils";
import { isTimetableTeacher } from "./build-timetable";
import {
  createDurableStorage,
  noteUserMutation,
  PERSIST_VERSION,
  withOrigin,
  writePersistSync,
} from "./persist-storage";

type Actions = {
  hydrateDefaultDate: () => void;
  setSelectedDate: (date: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addTeacher: (t: Omit<Teacher, "id">) => void;
  updateTeacher: (id: string, patch: Partial<Teacher>) => void;
  removeTeacher: (id: string) => void;
  addClass: (c: Omit<SchoolClass, "id">) => void;
  updateClass: (id: string, patch: Partial<SchoolClass>) => void;
  removeClass: (id: string) => void;
  upsertSlot: (slot: Omit<TimetableSlot, "id"> & { id?: string }) => void;
  clearSlot: (id: string) => void;
  addAbsence: (a: Omit<Absence, "id">) => string;
  updateAbsence: (id: string, patch: Partial<Absence>) => void;
  removeAbsence: (id: string) => void;
  saveSubstitution: (s: Omit<Substitution, "id"> & { id?: string }) => void;
  removeSubstitution: (id: string) => void;
  applyAutoAssign: (items: Substitution[]) => void;
  replaceCattedraSlots: (slots: TimetableSlot[]) => void;
  undoCattedraSlots: () => void;
  setCattedre: (cattedre: Cattedra[]) => void;
  importData: (data: PersistedData) => void;
  resetDemo: () => void;
  clearAll: () => void;
};

export type AppStore = PersistedData & Actions;

export function snapshot(state: AppStore): PersistedData {
  return {
    settings: state.settings,
    teachers: state.teachers,
    classes: state.classes,
    slots: state.slots,
    absences: state.absences,
    substitutions: state.substitutions,
    selectedDate: state.selectedDate,
    cattedre: state.cattedre,
    cattedraBackup: state.cattedraBackup,
    savedAt: state.savedAt,
    origin: state.origin,
  };
}

const seed = buildSeed();

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => {
      const save = (partial: Partial<AppStore>) => {
        noteUserMutation();
        set({ ...partial, savedAt: Date.now(), origin: "user" });
        writePersistSync(snapshot(get()));
      };
      return {
        ...seed,

        hydrateDefaultDate: () => {
          const { selectedDate, absences } = get();
          if (absences.some((a) => a.dateFrom <= selectedDate && a.dateTo >= selectedDate)) return;
          const first = [...absences].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))[0];
          if (first) set({ selectedDate: first.dateFrom });
        },

        setSelectedDate: (selectedDate) => save({ selectedDate }),

        updateSettings: (patch) => save({ settings: { ...get().settings, ...patch } }),

        addTeacher: (t) => save({ teachers: [...get().teachers, { ...t, id: uid("t") }] }),

        updateTeacher: (id, patch) =>
          save({ teachers: get().teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),

        removeTeacher: (id) =>
          save({
            teachers: get().teachers.filter((t) => t.id !== id),
            slots: get().slots.filter((s) => s.teacherId !== id),
            absences: get().absences.filter((a) => a.teacherId !== id),
          }),

        addClass: (c) => save({ classes: [...get().classes, { ...c, id: uid("c") }] }),

        updateClass: (id, patch) =>
          save({ classes: get().classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),

        removeClass: (id) =>
          save({
            classes: get().classes.filter((c) => c.id !== id),
            slots: get().slots.filter((s) => s.classId !== id),
            cattedre: (get().cattedre ?? []).filter((x) => x.classId !== id),
          }),

        upsertSlot: (slot) => {
          const id = slot.id ?? `slot-${slot.classId}-${slot.day}-${slot.periodId}-${slot.teacherId}`;
          const next: TimetableSlot = { ...slot, id };
          const slots = get().slots.filter(
            (s) =>
              s.id !== next.id &&
              !(
                s.classId === next.classId &&
                s.day === next.day &&
                s.periodId === next.periodId &&
                s.teacherId === next.teacherId
              ),
          );
          save({ slots: [...slots, next] });
        },

        clearSlot: (id) => save({ slots: get().slots.filter((s) => s.id !== id) }),

        addAbsence: (a) => {
          const id = uid("a");
          save({ absences: [...get().absences, { ...a, id }], selectedDate: a.dateFrom });
          return id;
        },

        updateAbsence: (id, patch) =>
          save({ absences: get().absences.map((a) => (a.id === id ? { ...a, ...patch } : a)) }),

        removeAbsence: (id) => {
          const abs = get().absences.find((a) => a.id === id);
          save({
            absences: get().absences.filter((a) => a.id !== id),
            substitutions: abs
              ? get().substitutions.filter(
                  (s) =>
                    !(
                      s.absentTeacherId === abs.teacherId &&
                      s.date >= abs.dateFrom &&
                      s.date <= abs.dateTo
                    ),
                )
              : get().substitutions,
          });
        },

        saveSubstitution: (s) => {
          const existing = get().substitutions.find(
            (x) =>
              (s.id && x.id === s.id) ||
              (x.date === s.date &&
                x.periodId === s.periodId &&
                x.classId === s.classId &&
                x.absentTeacherId === s.absentTeacherId),
          );
          if (existing) {
            save({
              substitutions: get().substitutions.map((x) =>
                x.id === existing.id ? { ...existing, ...s, id: existing.id } : x,
              ),
            });
          } else {
            save({ substitutions: [...get().substitutions, { ...s, id: s.id ?? uid("sub") }] });
          }
        },

        removeSubstitution: (id) =>
          save({ substitutions: get().substitutions.filter((s) => s.id !== id) }),

        applyAutoAssign: (items) => {
          for (const item of items) get().saveSubstitution(item);
        },

        replaceCattedraSlots: (next) => {
          const teachers = get().teachers;
          const keep = get().slots.filter((s) => {
            const t = teachers.find((x) => x.id === s.teacherId);
            return !t || !isTimetableTeacher(t);
          });
          const backup = get().slots.filter((s) => {
            const t = teachers.find((x) => x.id === s.teacherId);
            return Boolean(t && isTimetableTeacher(t));
          });
          save({ cattedraBackup: backup, slots: [...keep, ...next] });
        },

        undoCattedraSlots: () => {
          const backup = get().cattedraBackup;
          if (!backup) return;
          const teachers = get().teachers;
          const keep = get().slots.filter((s) => {
            const t = teachers.find((x) => x.id === s.teacherId);
            return !t || !isTimetableTeacher(t);
          });
          save({ slots: [...keep, ...backup], cattedraBackup: undefined });
        },

        setCattedre: (cattedre) => save({ cattedre }),

        importData: (data) => {
          noteUserMutation();
          set({ ...applyOrganicoFixes(data), savedAt: Date.now(), origin: "user" });
          writePersistSync(snapshot(get()), { force: true });
        },

        resetDemo: () => {
          noteUserMutation();
          set({ ...buildSeed(), savedAt: Date.now(), origin: "seed" });
          writePersistSync(snapshot(get()), { force: true });
        },

        clearAll: () => {
          noteUserMutation();
          set({ ...EMPTY_DATA, savedAt: Date.now(), origin: "user" });
          writePersistSync(snapshot(get()), { force: true });
        },
      };
    },
    {
      name: "copertura-plesso",
      skipHydration: true,
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createDurableStorage()),
      migrate: (persisted) => {
        const data = applyOrganicoFixes(persisted as PersistedData);
        return withOrigin(data);
      },
      partialize: (state) => ({
        settings: state.settings,
        teachers: state.teachers,
        classes: state.classes,
        slots: state.slots,
        absences: state.absences,
        substitutions: state.substitutions,
        selectedDate: state.selectedDate,
        savedAt: state.savedAt,
        origin: state.origin,
      }),
    },
  ),
);
