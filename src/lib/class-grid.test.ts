import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classTimetableSheet } from "./class-grid.ts";
import type { PersistedData, Teacher, TimetableSlot } from "./types.ts";

function teacher(id: string, lastName: string, extras: Partial<Teacher> = {}): Teacher {
  return {
    id,
    lastName,
    firstName: "X",
    subjects: ["Italiano"],
    weeklyHours: 18,
    role: "cattedra",
    notes: "",
    color: "#3d5a4c",
    assignedClassIds: [],
    ...extras,
  };
}

function slot(
  classId: string,
  day: 1 | 2 | 3 | 4 | 5,
  periodId: string,
  teacherId: string,
  subject = "Italiano",
): TimetableSlot {
  return {
    id: `slot-${classId}-${day}-${periodId}-${teacherId}`,
    day,
    periodId,
    classId,
    teacherId,
    subject,
  };
}

function data(over: Partial<PersistedData> = {}): PersistedData {
  return {
    settings: {
      schoolName: "Rombiolo",
      plesso: "Secondaria di I grado",
      schoolYear: "2026/2027",
      responsabile: "",
      days: [1, 2, 3, 4, 5],
      periods: [
        { id: "p1", index: 1, label: "1ª ora", start: "08:00", end: "08:55" },
        { id: "p2", index: 2, label: "2ª ora", start: "08:55", end: "09:50" },
        { id: "p3", index: 3, label: "3ª ora", start: "10:05", end: "11:00" },
        { id: "p4", index: 4, label: "4ª ora", start: "11:00", end: "11:55" },
        { id: "p5", index: 5, label: "5ª ora", start: "12:00", end: "12:55" },
        { id: "p6", index: 6, label: "6ª ora", start: "13:05", end: "14:00" },
      ],
    },
    teachers: [teacher("t-gio", "Giofrè"), teacher("t-grillo", "Grillo")],
    classes: [
      { id: "c-1A", name: "1ª A", grade: 1, section: "A", students: 18, tempo: "TN" },
      { id: "c-2A", name: "2ª A", grade: 2, section: "A", students: 20, tempo: "TN" },
    ],
    slots: [slot("c-2A", 1, "p1", "t-gio"), slot("c-1A", 1, "p2", "t-grillo")],
    absences: [],
    substitutions: [],
    selectedDate: "2026-09-07",
    ...over,
  };
}

describe("classTimetableSheet", () => {
  it("builds a class grid like the PDF: days × hours, classes as columns", () => {
    const sheet = classTimetableSheet(data());
    const values = sheet.rows.map((row) => row.map((c) => c.v ?? ""));

    assert.equal(values[0]?.[0], "Plesso di Rombiolo");
    assert.equal(values[1]?.[0], "ORARIO SETTIMANALE DELLE LEZIONI");
    assert.match(String(values[2]?.[0]), /2026\/2027/);

    const header = values[3] ?? [];
    assert.equal(header[1], "H");
    assert.equal(header[2], "1A");
    assert.equal(header[3], "2A");
    assert.equal(header[4], "Ore a disposizione");

    const lun1 = values[4] ?? [];
    assert.equal(lun1[0], "LUNEDÌ");
    assert.equal(lun1[1], "1");
    assert.equal(lun1[3], "GIOFRÈ");

    const lun2 = values[5] ?? [];
    assert.equal(lun2[0], "");
    assert.equal(lun2[1], "2");
    assert.equal(lun2[2], "GRILLO");

    assert.ok(sheet.merges.includes("A5:A10"));
    assert.ok(sheet.merges.some((m) => m.startsWith("A1:")));
  });

  it("builds the materie grid with subjects and X for disposizione", () => {
    const sheet = classTimetableSheet(
      data({
        teachers: [
          teacher("t-gio", "Giofrè", { dispSlots: [{ day: 1, periodId: "p3" }] }),
          teacher("t-grillo", "Grillo"),
        ],
        slots: [slot("c-2A", 1, "p1", "t-gio"), slot("c-1A", 1, "p2", "t-grillo")],
      }),
      "materie",
    );
    const values = sheet.rows.map((row) => row.map((c) => c.v ?? ""));
    const header = values[3] ?? [];
    assert.equal(header[4], "Ore a disposizione");
    assert.equal(values[4]?.[3], "ITALIANO");
    assert.equal(values[5]?.[2], "ITALIANO");
    assert.equal(values[6]?.[4], "X");
  });

  it("marks disposizione and skips empty cells", () => {
    const sheet = classTimetableSheet(
      data({
        teachers: [
          teacher("t-gio", "Giofrè", { dispSlots: [{ day: 1, periodId: "p3" }] }),
          teacher("t-grillo", "Grillo"),
        ],
      }),
    );
    const lun3 = sheet.rows[6]?.map((c) => c.v ?? "") ?? [];
    assert.equal(lun3[1], "3");
    assert.equal(lun3[4], "GIOFRÈ");
  });

  it("writes the sostegno class in the side column instead of a black square", () => {
    const sheet = classTimetableSheet(
      data({
        teachers: [
          teacher("t-gio", "Giofrè"),
          teacher("t-sos", "Pagnotta", {
            role: "sostegno",
            firstName: "Giuseppe",
            assignedClassIds: ["c-3B", "c-3C"],
          }),
          teacher("t-pot", "Arcella", { role: "potenziamento", dispSlots: [{ day: 1, periodId: "p1" }] }),
        ],
        slots: [slot("c-2A", 1, "p1", "t-gio"), slot("c-2A", 1, "p1", "t-sos", "Sostegno")],
      }),
    );
    const header = sheet.rows[3]?.map((c) => c.v ?? "") ?? [];
    assert.equal(header[5], "PAGNOTTA");
    assert.equal(header[6], "ARCELLA");
    const lun1 = sheet.rows[4] ?? [];
    assert.equal(lun1[5]?.v, "2A");
    assert.equal(lun1[5]?.s, 7);
    assert.equal(lun1[6]?.v, "");
    assert.equal(lun1[6]?.s, 9);
    const lun2 = sheet.rows[5] ?? [];
    assert.equal(lun2[5]?.v, "");
    assert.equal(lun2[5]?.s, 7);
  });
});
