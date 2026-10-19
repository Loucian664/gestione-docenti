import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workerCountFor } from "./timetable-runner.ts";

describe("ricerche in parallelo", () => {
  it("iPhone (4 processori): 3 ricerche", () => assert.equal(workerCountFor(4), 3));
  it("Mac e iPad (8 processori): 4 ricerche, come prima", () => assert.equal(workerCountFor(8), 4));
  it("PC con Firefox (16 processori): 12 ricerche", () => assert.equal(workerCountFor(16), 12));
  it("pochi processori: almeno una ricerca", () => {
    assert.equal(workerCountFor(1), 1);
    assert.equal(workerCountFor(2), 1);
  });
  it("mai più di 12", () => assert.equal(workerCountFor(32), 12));
});
