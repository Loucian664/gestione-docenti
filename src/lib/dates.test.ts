import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateOnLaunch, dateOnResume } from "./dates.ts";

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
