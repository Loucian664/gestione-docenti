import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateOnLaunch, dateOnResume, formatDayName, formatItDate, formatItFileDate, formatLong } from "./dates.ts";
import { dayNameUpper } from "./types.ts";
import { dailySheetHeading } from "./export.ts";

describe("home date", () => {
  it("opens on today even if the last visit was weeks ago", () => {
    assert.equal(dateOnLaunch("2026-09-17"), "2026-09-17");
  });

  it("on resume, a past day becomes today; today and future stay", () => {
    assert.equal(dateOnResume("2026-08-01", "2026-09-17"), "2026-09-17");
    assert.equal(dateOnResume("2026-09-16", "2026-09-17"), "2026-09-17");
    assert.equal(dateOnResume("2026-09-17", "2026-09-17"), "2026-09-17");
    assert.equal(dateOnResume("2026-09-18", "2026-09-17"), "2026-09-18");
  });
});

describe("giorni per esteso", () => {
  it("usa ì accentata, non l’apostrofo", () => {
    assert.equal(dayNameUpper(1), "LUNEDÌ");
    assert.equal(dayNameUpper(2), "MARTEDÌ");
    assert.equal(dayNameUpper(3), "MERCOLEDÌ");
    assert.equal(dayNameUpper(4), "GIOVEDÌ");
    assert.equal(dayNameUpper(5), "VENERDÌ");
    assert.equal(formatDayName("2026-09-14"), "lunedì");
    assert.match(formatLong("2026-09-14"), /lunedì/);
    assert.match(dailySheetHeading("2026-09-14"), /LUNEDÌ/);
    assert.doesNotMatch(dailySheetHeading("2026-09-14"), /LUNEDI'/);
  });
});

describe("date italiane", () => {
  it("usa giorno/mese/anno, non anno-mese-giorno", () => {
    assert.equal(formatItDate("2026-09-21"), "21/09/2026");
    assert.equal(formatItFileDate("2026-09-21"), "21-09-2026");
  });
});
