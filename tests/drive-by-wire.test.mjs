import assert from "node:assert/strict";
import { test } from "node:test";
import { signalRoute } from "../src/scripts/demos/drive-by-wire.js";

test("the Pi bridges the two buses once front and rear have no direct path", () => {
  assert.equal(signalRoute(true, true), "a");
  assert.equal(signalRoute(false, true), "a");
  assert.equal(signalRoute(true, false), "b");
  assert.equal(signalRoute(false, false), "bridge");
});
