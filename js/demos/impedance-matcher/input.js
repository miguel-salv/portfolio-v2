import {
  S_HOME, S_MENU, S_MOTOR1, S_MOTOR2, S_METRICS,
  MODE_AUTO, MODE_MANUAL,
  M_MODE, M_MOTOR1, M_MOTOR2, M_STREAM_CSV, M_ADV_METRICS, M_BACK,
  MOTOR_STEP_SIZE, MOTOR_MIN_POS, MOTOR_MAX_POS,
  SETTINGS_MENU_AFK_MS, buildMenu,
} from "./state.js";
import { setMotorStep } from "./matcher.js";
import { isTouchPrimary } from "../platform.js";
import { hitTestHome, MARGIN, CANVAS_W, CANVAS_H } from "./display.js";

export function handleInput(state, delta, pressed) {
  const stateAtEnter = state.state;

  switch (state.state) {
    case S_HOME:
      handleHome(state, delta, pressed);
      break;
    case S_MENU:
      if (delta !== 0 || pressed) state.lastSettingsActivityMs = Date.now();
      handleMenu(state, delta, pressed);
      if (state.state === S_MENU && Date.now() - state.lastSettingsActivityMs >= SETTINGS_MENU_AFK_MS) {
        state.menuEditingMotor = false;
        state.editingMotorId = -1;
        state.menuSel = 0;
        state.state = S_HOME;
      }
      break;
    case S_MOTOR1:
      handleMotorAdjust(state, 1, delta, pressed);
      break;
    case S_MOTOR2:
      handleMotorAdjust(state, 2, delta, pressed);
      break;
    case S_METRICS:
      if (pressed) state.state = S_MENU;
      break;
  }

  if (state.state === S_MENU && stateAtEnter !== S_MENU) {
    state.lastSettingsActivityMs = Date.now();
  }
}

function handleHome(state, delta, pressed) {
  if (delta !== 0) {
    state.homeSel = (state.homeSel + delta) % 2;
    if (state.homeSel < 0) state.homeSel += 2;
  }
  if (pressed) {
    if (state.homeSel === 0) {
      state.radioTX = !state.radioTX;
    } else {
      state.state = S_MENU;
      state.menuSel = 0;
    }
  }
}

function handleMenu(state, delta, pressed) {
  const visible = buildMenu(state);

  if (delta !== 0) {
    if (state.menuEditingMotor) {
      if (state.editingMotorId === M_MOTOR1) {
        state.motor1Pos += delta * MOTOR_STEP_SIZE;
        state.motor1Pos = Math.max(MOTOR_MIN_POS, Math.min(MOTOR_MAX_POS, state.motor1Pos));
        setMotorStep(state, 1, state.motor1Pos);
      } else if (state.editingMotorId === M_MOTOR2) {
        state.motor2Pos += delta * MOTOR_STEP_SIZE;
        state.motor2Pos = Math.max(MOTOR_MIN_POS, Math.min(MOTOR_MAX_POS, state.motor2Pos));
        setMotorStep(state, 2, state.motor2Pos);
      }
    } else if (visible.length > 0) {
      state.menuSel = (state.menuSel + delta) % visible.length;
      if (state.menuSel < 0) state.menuSel += visible.length;
    }
  }

  if (pressed) {
    if (state.menuEditingMotor) {
      state.menuEditingMotor = false;
      state.editingMotorId = -1;
      return;
    }
    const sel = visible[state.menuSel];
    switch (sel) {
      case M_MODE:
        state.opMode = state.opMode === MODE_AUTO ? MODE_MANUAL : MODE_AUTO;
        if (state.opMode === MODE_AUTO) {
          state.menuEditingMotor = false;
          state.editingMotorId = -1;
        }
        state.menuSel = Math.min(state.menuSel, buildMenu(state).length - 1);
        break;
      case M_MOTOR1:
        state.menuEditingMotor = true;
        state.editingMotorId = M_MOTOR1;
        break;
      case M_MOTOR2:
        state.menuEditingMotor = true;
        state.editingMotorId = M_MOTOR2;
        break;
      case M_STREAM_CSV:
        state.csvStreamEnabled = !state.csvStreamEnabled;
        break;
      case M_ADV_METRICS:
        state.state = S_METRICS;
        break;
      case M_BACK:
        state.menuEditingMotor = false;
        state.editingMotorId = -1;
        state.state = S_HOME;
        break;
    }
  }
}

function handleMotorAdjust(state, motorNum, delta, pressed) {
  if (delta !== 0) {
    const key = motorNum === 1 ? "motor1Pos" : "motor2Pos";
    state[key] += delta * MOTOR_STEP_SIZE;
    state[key] = Math.max(MOTOR_MIN_POS, Math.min(MOTOR_MAX_POS, state[key]));
    setMotorStep(state, motorNum, state[key]);
  }
  if (pressed) state.state = S_MENU;
}

export function bindInput(frame, canvas, onInput, opts = {}) {
  const isHome = opts.isHome ?? (() => false);
  const isVerticalNav = opts.isVerticalNav ?? (() => false);
  const scaleX = () => CANVAS_W / canvas.clientWidth;
  const scaleY = () => CANVAS_H / canvas.clientHeight;
  const touch = isTouchPrimary();

  if (!touch) {
    frame.addEventListener("keydown", (e) => {
      let delta = 0;
      let pressed = false;

      if (e.key === "Enter" || e.key === " ") {
        pressed = true;
      } else if (isVerticalNav()) {
        if (e.key === "ArrowUp") { e.preventDefault(); delta = -1; }
        else if (e.key === "ArrowDown") { e.preventDefault(); delta = 1; }
      } else {
        if (e.key === "ArrowLeft") { e.preventDefault(); delta = -1; }
        else if (e.key === "ArrowRight") { e.preventDefault(); delta = 1; }
      }

      if (delta !== 0 || pressed) onInput(delta, pressed);
    });
  } else {
    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const lx = (e.clientX - rect.left) * scaleX() - MARGIN;
      const ly = (e.clientY - rect.top) * scaleY() - MARGIN;
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;

      const hit = hitTestHome(lx, ly);
      if (isHome() && hit >= 0) {
        onInput(0, true, hit);
        return;
      }

      if (isVerticalNav()) {
        if (relY < 0.35) onInput(-1, false);
        else if (relY > 0.65) onInput(1, false);
        else onInput(0, true);
      } else {
        if (relX < 0.35) onInput(-1, false);
        else if (relX > 0.65) onInput(1, false);
        else onInput(0, true);
      }
    });
  }
}

export function applyHomeClick(state, hit) {
  if (state.state !== S_HOME || hit < 0) return;
  state.homeSel = hit;
  if (hit === 0) state.radioTX = !state.radioTX;
  else {
    state.state = S_MENU;
    state.menuSel = 0;
  }
}
