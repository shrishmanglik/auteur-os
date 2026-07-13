import test from "node:test";
import assert from "node:assert/strict";
import { opticsToProse } from "../src/universal-packet.mjs";

test("24mm at T8 and six metres compiles as deep focus", () => {
  const prose = opticsToProse({
    cameraBody: "ARRI Alexa 35",
    lensModel: "Signature Prime",
    focalLengthMm: 24,
    tStop: 8,
    subjectDistanceMeters: 6,
  });
  assert.equal(
    prose,
    "Shot on ARRI Alexa 35 with 24mm Signature Prime at T8, camera 6m from subject; deep focus with broad foreground-to-background clarity.",
  );
});

test("85mm at T1.4 and close distance compiles as shallow focus", () => {
  const prose = opticsToProse({
    cameraBody: "Sony Venice 2",
    lensModel: "Petzval portrait prime",
    focalLengthMm: 85,
    tStop: 1.4,
    subjectDistanceMeters: 1.2,
  });
  assert.equal(
    prose,
    "Shot on Sony Venice 2 with 85mm Petzval portrait prime at T1.4, camera 1.2m from subject; shallow depth of field with pronounced subject separation.",
  );
});

test("current focal length replaces stale focal tokens in the lens model", () => {
  const prose = opticsToProse({
    cameraBody: "ARRI Alexa 35",
    lensModel: "24mm environmental wide",
    focalLengthMm: 85,
    tStop: 2,
    subjectDistanceMeters: 1.5,
  });
  assert.match(prose, /with 85mm environmental wide at T2/);
  assert.doesNotMatch(prose, /85mm 24mm|24mm environmental/);
});
