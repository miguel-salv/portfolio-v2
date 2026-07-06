import { MODE_AUTO, syncMotorDeg } from "./state.js";

const PI = Math.PI;
const GRAD_SCALE = 0.025;
const MAX_STEPSIZE = PI / 36;
const MIN_STEPSIZE = PI / 700;
const MAX_ROT = PI;
const SWEET_M1 = (72 * PI) / 180;
const SWEET_M2 = (108 * PI) / 180;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clampMag(value, minMag, maxMag) {
  const mag = Math.abs(value);
  const sign = value < 0 ? -1 : 1;
  if (mag > maxMag) return maxMag * sign;
  if (mag < minMag) return minMag * sign;
  return value;
}

function measureVSWR(state) {
  if (!state.radioTX) {
    state.lastVSWR = 99;
    state.lastFwdV = 0.01;
    state.lastRevV = 0;
    state.atMatch = false;
    return 9801;
  }

  const dm1 = state.motor1_pos - SWEET_M1;
  const dm2 = state.motor2_pos - SWEET_M2;
  const drift = Math.sin(Date.now() / 12000) * 0.08;
  const bowl = 0.55 * dm1 * dm1 + 0.42 * dm2 * dm2 + drift;
  const vswr = 1 + bowl + 0.02 * (Math.random() - 0.5);

  state.lastVSWR = clamp(vswr, 1.02, 8);
  state.lastFwdV = 0.92 + 0.06 * Math.random();
  const rev = ((state.lastVSWR - 1) / (state.lastVSWR + 1)) * state.lastFwdV;
  state.lastRevV = Math.max(0, rev);

  if (state.lastVSWR > 1.4) state.atMatch = false;
  if (state.lastVSWR < 1.2) state.atMatch = true;

  const loss = (state.lastVSWR - 1) ** 2;
  return loss;
}

function turnByRad(state, motorKey, rads) {
  if (rads === 0) return 0;
  const posKey = motorKey === 1 ? "motor1_pos" : "motor2_pos";
  let pos = state[posKey];
  const step = rads < 0 ? -MIN_STEPSIZE : MIN_STEPSIZE;
  const steps = Math.round(Math.abs(rads) / MIN_STEPSIZE) || 1;
  let traveled = 0;

  for (let i = 0; i < steps; i++) {
    if ((pos >= MAX_ROT && step > 0) || (pos <= 0 && step < 0)) break;
    pos += step;
    traveled += step;
  }
  state[posKey] = pos;
  syncMotorDeg(state);
  return traveled;
}

function calcGradAndStep(state, motorKey, gradKey) {
  const initialCost = measureVSWR(state);
  let commanded = clampMag(state[gradKey] * GRAD_SCALE, MIN_STEPSIZE, MAX_STEPSIZE);
  const posKey = motorKey === 1 ? "motor1_pos" : "motor2_pos";

  if (state[posKey] >= MAX_ROT - MIN_STEPSIZE) commanded = -MIN_STEPSIZE;
  if (state[posKey] <= MIN_STEPSIZE) commanded = MIN_STEPSIZE;

  const actual = turnByRad(state, motorKey, commanded);
  if (actual !== 0) {
    const newCost = measureVSWR(state);
    state[gradKey] = (initialCost - newCost) / actual;
  }
}

export function matchingTick(state) {
  if (state.opMode !== MODE_AUTO || !state.radioTX) {
    if (state.radioTX) measureVSWR(state);
    return;
  }

  if (!state.atMatch) {
    calcGradAndStep(state, 1, "dM1");
    calcGradAndStep(state, 2, "dM2");
  } else {
    measureVSWR(state);
  }
  syncMotorDeg(state);
}

export function setMotorStep(state, motorNum, posDeg) {
  const rad = (posDeg * PI) / 180;
  if (motorNum === 1) state.motor1_pos = rad;
  else state.motor2_pos = rad;
  syncMotorDeg(state);
  measureVSWR(state);
}

export function getVSWR(state) {
  return state.lastVSWR;
}
