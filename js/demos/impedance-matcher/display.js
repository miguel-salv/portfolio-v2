import { drawText, drawTextRight } from "./font.js";
import {
  S_HOME, S_MENU, S_MOTOR1, S_MOTOR2, S_METRICS,
  MODE_AUTO,
  M_MOTOR1, M_MOTOR2,
  MOTOR_MIN_POS, MOTOR_MAX_POS,
  buildMenu, menuLabel, menuValue,
} from "./state.js";
import { getVSWR } from "./matcher.js";

export const PANEL_W = 128;
export const PANEL_H = 64;
export const MARGIN = 2;
export const CANVAS_W = PANEL_W + MARGIN * 2;
export const CANVAS_H = PANEL_H + MARGIN * 2;
export const SCALE = 8;

const WHITE = "#fff";
const BLACK = "#000";

function drawHLine(ctx, y) {
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, y, PANEL_W, 1);
}

function drawRectBorder(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

export function createDisplay(canvas) {
  canvas.width = CANVAS_W * SCALE;
  canvas.height = CANVAS_H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.scale(SCALE, SCALE);

  function clear() {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  function drawHome(state) {
    drawText(ctx, "Impedance Matcher", 0, 0, WHITE, 1);
    drawHLine(ctx, 9);

    drawText(ctx, "VSWR", 0, 13, WHITE, 1);
    const vswrStr = state.radioTX ? getVSWR(state).toFixed(3) : "---";
    drawText(ctx, vswrStr, 0, 23, WHITE, 2);

    const modeStr = state.opMode === MODE_AUTO ? "AUTO" : "MANUAL";
    drawTextRight(ctx, "Mode:", PANEL_W, 13, WHITE, 1);
    drawTextRight(ctx, modeStr, PANEL_W, 22, WHITE, 1);

    const btnY = 49;
    const btnW = 60;
    const btnH = 14;
    const gap = 8;
    for (let i = 0; i < 2; i++) {
      const x = i * (btnW + gap);
      const sel = state.homeSel === i;
      if (sel) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(x, btnY, btnW, btnH);
        ctx.fillStyle = BLACK;
      } else {
        drawRectBorder(ctx, x, btnY, btnW, btnH, WHITE);
        ctx.fillStyle = WHITE;
      }
      const label = i === 0 ? (state.radioTX ? "TX:ON" : "TX:OFF") : "Settings";
      drawText(ctx, label, x + 4, btnY + 4, sel ? BLACK : WHITE, 1);
    }
  }

  function drawMenu(state) {
    const visible = buildMenu(state);
    state.menuSel = Math.max(0, Math.min(state.menuSel, visible.length - 1));

    drawText(ctx, "Settings", 0, 0, WHITE, 1);
    drawHLine(ctx, 9);

    const ROWS = 4;
    const start = Math.max(0, Math.min(state.menuSel - ROWS + 1, Math.max(0, visible.length - ROWS)));

    for (let i = 0; i < ROWS && start + i < visible.length; i++) {
      const idx = start + i;
      const id = visible[idx];
      const y = 12 + i * 13;
      const sel = idx === state.menuSel;

      if (sel) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(0, y - 1, 127, 12);
        ctx.fillStyle = BLACK;
      } else {
        ctx.fillStyle = WHITE;
      }

      drawText(ctx, menuLabel(id), 3, y, sel ? BLACK : WHITE, 1);

      const valX = 80;
      if (id === M_MOTOR1) {
        let t = String(state.motor1Pos);
        if (state.menuEditingMotor && state.editingMotorId === M_MOTOR1) t += "*";
        drawText(ctx, t, valX, y, sel ? BLACK : WHITE, 1);
      } else if (id === M_MOTOR2) {
        let t = String(state.motor2Pos);
        if (state.menuEditingMotor && state.editingMotorId === M_MOTOR2) t += "*";
        drawText(ctx, t, valX, y, sel ? BLACK : WHITE, 1);
      } else {
        const val = menuValue(state, id);
        if (val) drawText(ctx, val, valX, y, sel ? BLACK : WHITE, 1);
      }
    }
  }

  function drawMotorAdjust(motorNum, pos) {
    drawText(ctx, `Motor ${motorNum} (deg)`, 0, 0, WHITE, 1);
    drawHLine(ctx, 9);
    drawText(ctx, `< ${pos} >`, 4, 20, WHITE, 2);
    drawText(ctx, "Turn:adj Press:back", 0, 50, WHITE, 1);
  }

  function drawAdvancedMetrics(state) {
    const m1Max = state.motor1Pos <= MOTOR_MIN_POS || state.motor1Pos >= MOTOR_MAX_POS;
    const m2Max = state.motor2Pos <= MOTOR_MIN_POS || state.motor2Pos >= MOTOR_MAX_POS;
    const m1deg = ((state.motor1_pos * 180) / Math.PI).toFixed(1);
    const m2deg = ((state.motor2_pos * 180) / Math.PI).toFixed(1);

    drawText(ctx, "Advanced Metrics", 0, 0, WHITE, 1);
    drawHLine(ctx, 9);
    drawText(ctx, `VSWR:${getVSWR(state).toFixed(3)}`, 0, 12, WHITE, 1);
    drawText(ctx, `FWD:${state.lastFwdV.toFixed(3)}V`, 0, 22, WHITE, 1);
    drawText(ctx, `REV:${state.lastRevV.toFixed(3)}V`, 64, 22, WHITE, 1);
    drawText(ctx, `M1:${m1deg}d ${m1Max ? "MAX" : "OK"}`, 0, 32, WHITE, 1);
    drawText(ctx, `M2:${m2deg}d ${m2Max ? "MAX" : "OK"}`, 0, 42, WHITE, 1);
    drawText(ctx, "Press: back", 0, 54, WHITE, 1);
  }

  function render(state) {
    clear();
    ctx.save();
    ctx.translate(MARGIN, MARGIN);
    switch (state.state) {
      case S_HOME: drawHome(state); break;
      case S_MENU: drawMenu(state); break;
      case S_MOTOR1: drawMotorAdjust(1, state.motor1Pos); break;
      case S_MOTOR2: drawMotorAdjust(2, state.motor2Pos); break;
      case S_METRICS: drawAdvancedMetrics(state); break;
    }
    ctx.restore();
  }

  return { render, W: PANEL_W, H: PANEL_H };
}

export function hitTestHome(x, y) {
  const btnY = 49;
  const btnW = 60;
  const btnH = 14;
  const gap = 8;
  if (y < btnY || y > btnY + btnH) return -1;
  for (let i = 0; i < 2; i++) {
    const bx = i * (btnW + gap);
    if (x >= bx && x <= bx + btnW) return i;
  }
  return -1;
}
