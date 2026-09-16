import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cycleTheme, parseThemePreference, resolveTheme } from "./theme.ts";

describe("theme", () => {
  it("parses stored preference and defaults to system", () => {
    assert.equal(parseThemePreference("light"), "light");
    assert.equal(parseThemePreference("dark"), "dark");
    assert.equal(parseThemePreference("system"), "system");
    assert.equal(parseThemePreference(null), "system");
    assert.equal(parseThemePreference("nope"), "system");
  });

  it("cycles system → light → dark → system", () => {
    assert.equal(cycleTheme("system"), "light");
    assert.equal(cycleTheme("light"), "dark");
    assert.equal(cycleTheme("dark"), "system");
  });

  it("resolves system from the OS, otherwise uses the forced value", () => {
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("system", false), "light");
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
  });
});
