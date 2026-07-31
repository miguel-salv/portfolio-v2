export const S_HOME = 0;
export const S_MENU = 1;
export const S_MOTOR1 = 2;
export const S_MOTOR2 = 3;
export const S_METRICS = 4;

export const MODE_AUTO = 0;
export const MODE_MANUAL = 1;

export const M_MODE = 0;
export const M_MOTOR1 = 1;
export const M_MOTOR2 = 2;
export const M_STREAM_CSV = 3;
export const M_ADV_METRICS = 4;
export const M_BACK = 5;
export const M_COUNT = 6;

export const MOTOR_MIN_POS = 0;
export const MOTOR_MAX_POS = 180;
export const MOTOR_STEP_SIZE = 10;
export const SETTINGS_MENU_AFK_MS = 15000;
export const DISPLAY_THROTTLE_AUTO_HOME_MS = 300;

export function createState() {
  return {
    state: S_HOME,
    opMode: MODE_AUTO,
    radioTX: true,
    motor1Pos: 45,
    motor2Pos: 90,
    motor1_pos: (45 * Math.PI) / 180,
    motor2_pos: (90 * Math.PI) / 180,
    dM1: 0.1,
    dM2: 0.1,
    atMatch: false,
    lastVSWR: 2.8,
    lastFwdV: 0.95,
    lastRevV: 0.42,
    csvStreamEnabled: false,
    menuSel: 0,
    homeSel: 0,
    menuEditingMotor: false,
    editingMotorId: -1,
    lastSettingsActivityMs: 0,
    lastDisplayMs: 0,
  };
}

export function buildMenu(state) {
  const items = [M_MODE];
  if (state.opMode === MODE_MANUAL) {
    items.push(M_MOTOR1, M_MOTOR2);
  }
  items.push(M_STREAM_CSV, M_ADV_METRICS, M_BACK);
  return items;
}

export function menuLabel(id) {
  switch (id) {
    case M_MODE: return "Mode";
    case M_MOTOR1: return "Motor 1";
    case M_MOTOR2: return "Motor 2";
    case M_STREAM_CSV: return "USB log";
    case M_ADV_METRICS: return "Advanced";
    case M_BACK: return "< Back";
    default: return "?";
  }
}

export function menuValue(state, id) {
  switch (id) {
    case M_MODE: return state.opMode === MODE_AUTO ? "AUTO" : "MANUAL";
    case M_STREAM_CSV: return state.csvStreamEnabled ? "ON" : "OFF";
    default: return null;
  }
}

export function syncMotorDeg(state) {
  state.motor1Pos = Math.round(Math.max(MOTOR_MIN_POS, Math.min(MOTOR_MAX_POS, (state.motor1_pos * 180) / Math.PI)));
  state.motor2Pos = Math.round(Math.max(MOTOR_MIN_POS, Math.min(MOTOR_MAX_POS, (state.motor2_pos * 180) / Math.PI)));
}
