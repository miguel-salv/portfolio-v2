import { createDetector } from "./detector.js";

const ROBOT_W = 52;
const ROBOT_H = 36;
const TURN_SPEED_DEG_PER_S = 140;
const DRIVE_SPEED_PX_PER_S = 110;
const ARRIVE_DIST = 36;
const DETECT_LOCK_MS = 650;
const DETECT_TARGET_CONFIDENCE = 0.93;
const GRAB_DURATION_MS = 520;
const HOLD_MS = 1200;
const CONTACT_T = 0.52;
const ARM_OPEN_DEG = 26;
const ARM_CLOSED_DEG = 3;
const ARM_PIVOT_X = 12;
const ARM_PIVOT_Y = 8;
const ARM_BEAM_LEN = 28;
const ARM_BEAM_W = 6.5;

function normalizeDeg(a) {
  let d = a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function armCloseAmount(mode, armT) {
  if (mode === "hold") return 1;
  if (mode !== "grab") return 0;
  const t = clamp01(armT);
  if (t < 0.14) return 0;
  return smoothstep((t - 0.14) / 0.58);
}

function drawRobotBody(ctx, colors) {
  const W = ROBOT_W;
  const H = ROBOT_H;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.roundRect(-W / 2, -H / 2, W, H, 5);
  ctx.fillStyle = colors.robot;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(-W / 2, -H / 2, W, H, 5);
  ctx.strokeStyle = colors.robotDark;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, 3);
  ctx.strokeStyle = colors.robotAccent;
  ctx.lineWidth = 0.75;
  ctx.stroke();

  const wheelW = 8, wheelH = 7, wheelR = 2;
  const wheelOffX = W / 2 - 3;
  const wheelOffY = H / 2 + 1;
  ctx.fillStyle = colors.robotDark;
  for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const wx = sx * wheelOffX - wheelW / 2;
    const wy = sy * wheelOffY - wheelH / 2;
    ctx.beginPath();
    ctx.roundRect(wx, wy, wheelW, wheelH, wheelR);
    ctx.fill();
  }

  ctx.strokeStyle = colors.robotDark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-wheelOffX, -wheelOffY);
  ctx.lineTo(-wheelOffX, wheelOffY);
  ctx.moveTo(wheelOffX, -wheelOffY);
  ctx.lineTo(wheelOffX, wheelOffY);
  ctx.stroke();

  const lensX = W / 2 - 9;
  ctx.beginPath();
  ctx.arc(lensX, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = colors.robotAccent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lensX, 0, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = colors.robotLens;
  ctx.fill();

  ctx.fillStyle = colors.robotAccent;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 2, -H / 2 + 4, 3, H - 8, 1.5);
  ctx.fill();
}

function drawCollectorArms(ctx, colors, closeAmt) {
  const deg = ARM_OPEN_DEG + (ARM_CLOSED_DEG - ARM_OPEN_DEG) * clamp01(closeAmt);
  const beamW = ARM_BEAM_W;
  const tipW = 11;
  const tipH = 9;
  const arm = colors.arm || colors.robotDark;
  const tip = colors.armTip || colors.robotLens;
  const bolt = colors.armBolt || colors.robotAccent;

  for (const side of [-1, 1]) {
    const angle = (side * deg * Math.PI) / 180;
    ctx.save();
    ctx.translate(ARM_PIVOT_X, side * ARM_PIVOT_Y);
    ctx.rotate(angle);

    ctx.fillStyle = arm;
    ctx.beginPath();
    ctx.roundRect(-2, -beamW / 2, ARM_BEAM_LEN + 3, beamW, 2.4);
    ctx.fill();

    const inward = -side;
    ctx.fillStyle = tip;
    ctx.beginPath();
    ctx.roundRect(ARM_BEAM_LEN - 4, inward * (beamW * 0.4) - tipH / 2, tipW, tipH, 2.2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = arm;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = bolt;
    ctx.fill();

    ctx.restore();
  }
}

function drawDetectBox(ctx, colors, bottle, mode, robot) {
  const dist = Math.hypot(bottle.x - robot.x, bottle.y - robot.y);
  const approach = clamp01((dist - ARRIVE_DIST) / 88);
  let alpha;
  let lineW;
  if (mode === "detect") {
    alpha = 0.52;
    lineW = 1.3;
  } else if (mode === "turn") {
    alpha = 0.30 + 0.12 * approach;
    lineW = 1.1;
  } else {
    alpha = 0.08 + 0.26 * approach;
    lineW = 0.75 + 0.35 * approach;
  }

  const boxSize = 30 + 4 * approach;
  const bx = bottle.x - boxSize / 2;
  const by = bottle.y - boxSize / 2;
  const corner = 7 + 2 * approach;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colors.detect;
  ctx.lineWidth = lineW;
  ctx.lineCap = "square";
  if (mode === "detect") ctx.setLineDash([4, 3]);

  ctx.beginPath();
  ctx.moveTo(bx + corner, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + corner);
  ctx.moveTo(bx + boxSize - corner, by); ctx.lineTo(bx + boxSize, by); ctx.lineTo(bx + boxSize, by + corner);
  ctx.moveTo(bx + boxSize, by + boxSize - corner); ctx.lineTo(bx + boxSize, by + boxSize); ctx.lineTo(bx + boxSize - corner, by + boxSize);
  ctx.moveTo(bx, by + boxSize - corner); ctx.lineTo(bx, by + boxSize); ctx.lineTo(bx + corner, by + boxSize);
  ctx.stroke();
  ctx.restore();
}

function drawBottle(ctx, x, y, colors) {
  ctx.save();
  ctx.translate(x, y);

  const bodyW = 13;
  const bodyH = 22;
  const neckW = 5.5;
  const neckH = 7.5;
  const capH = 4.2;
  const shoulderH = 3.2;
  const baseR = 3.2;
  const totalH = bodyH + shoulderH + neckH + capH;
  const topY = -totalH / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.moveTo(-bodyW / 2, topY + capH + neckH + shoulderH);
  ctx.lineTo(-bodyW / 2, topY + totalH - baseR);
  ctx.quadraticCurveTo(-bodyW / 2, topY + totalH, -bodyW / 2 + baseR, topY + totalH);
  ctx.lineTo(bodyW / 2 - baseR, topY + totalH);
  ctx.quadraticCurveTo(bodyW / 2, topY + totalH, bodyW / 2, topY + totalH - baseR);
  ctx.lineTo(bodyW / 2, topY + capH + neckH + shoulderH);
  ctx.quadraticCurveTo(bodyW / 2, topY + capH + neckH, neckW / 2, topY + capH + neckH);
  ctx.lineTo(neckW / 2, topY + capH);
  ctx.lineTo(-neckW / 2, topY + capH);
  ctx.lineTo(-neckW / 2, topY + capH + neckH);
  ctx.quadraticCurveTo(-bodyW / 2, topY + capH + neckH, -bodyW / 2, topY + capH + neckH + shoulderH);
  ctx.closePath();
  ctx.fillStyle = colors.bottle;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-bodyW / 2, topY + capH + neckH + shoulderH);
  ctx.lineTo(-bodyW / 2, topY + totalH - baseR);
  ctx.quadraticCurveTo(-bodyW / 2, topY + totalH, -bodyW / 2 + baseR, topY + totalH);
  ctx.lineTo(bodyW / 2 - baseR, topY + totalH);
  ctx.quadraticCurveTo(bodyW / 2, topY + totalH, bodyW / 2, topY + totalH - baseR);
  ctx.lineTo(bodyW / 2, topY + capH + neckH + shoulderH);
  ctx.quadraticCurveTo(bodyW / 2, topY + capH + neckH, neckW / 2, topY + capH + neckH);
  ctx.lineTo(neckW / 2, topY + capH);
  ctx.lineTo(-neckW / 2, topY + capH);
  ctx.lineTo(-neckW / 2, topY + capH + neckH);
  ctx.quadraticCurveTo(-bodyW / 2, topY + capH + neckH, -bodyW / 2, topY + capH + neckH + shoulderH);
  ctx.closePath();
  ctx.strokeStyle = colors.bottleOutline;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-bodyW / 2 + 2.5, topY + capH + neckH + shoulderH + 2);
  ctx.lineTo(-bodyW / 2 + 2.5, topY + totalH - 4);
  ctx.strokeStyle = colors.bottleHighlight;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";

  const labelTop = topY + capH + neckH + shoulderH + 5;
  const labelH = 7;
  ctx.fillStyle = colors.bottleLabel;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(-bodyW / 2 + 1, labelTop, bodyW - 2, labelH);
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.roundRect(-neckW / 2 - 0.5, topY, neckW + 1, capH, 1.5);
  ctx.fillStyle = colors.bottleCap;
  ctx.fill();

  ctx.restore();
}

export function createScene(width, height, { onCommand, onCollect, reducedMotion = false } = {}) {
  const home = { x: width / 2, y: height / 2 };
  const robot = { x: home.x, y: home.y, angle: -90 };
  const detector = createDetector();

  let bottle = null;
  const queue = []; // Pending bottles waiting to be targeted
  const MAX_QUEUE = 2;
  let mode = "idle"; // idle | search | detect | turn | drive | grab | hold
  let detectT = 0;
  let armT = 0;
  let holdT = 0;
  let sweepAngle = 0;
  let confidence = 0;
  let armCommandSent = false;

  const FOV_HALF_DEG = 30; // 60° total, matching the drawn cone

  function angleTo(bx, by) {
    return Math.atan2(by - robot.y, bx - robot.x) * (180 / Math.PI);
  }

  function isInFov(bx, by) {
    const diff = Math.abs(normalizeDeg(angleTo(bx, by) - robot.angle));
    return diff <= FOV_HALF_DEG;
  }

  function beginTarget() {
    // If already in FOV, detect; else search
    if (isInFov(bottle.x, bottle.y)) {
      mode = "detect";
      detectT = 0;
      detector.reset();
      confidence = 0;
    } else {
      mode = "search";
    }
  }

  function startNextBottle() {
    if (queue.length === 0) return;
    // Prefer a bottle in/nearest the FOV so the robot doesn't spin past visible ones
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const angDist = Math.abs(normalizeDeg(angleTo(queue[i].x, queue[i].y) - robot.angle));
      // Angular distance primary, small spatial tiebreaker
      const dist = Math.hypot(queue[i].x - robot.x, queue[i].y - robot.y);
      const score = angDist + dist * 0.01;
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    }
    bottle = queue.splice(bestIdx, 1)[0];
    beginTarget();
  }

  const BOTTLE_MIN_DIST = 30;

  function nudgePosition(x, y) {
    const others = [...queue];
    if (bottle) others.push(bottle);

    let nx = x, ny = y;
    for (let attempt = 0; attempt < 8; attempt++) {
      let overlapping = false;
      for (const other of others) {
        const d = Math.hypot(nx - other.x, ny - other.y);
        if (d < BOTTLE_MIN_DIST) {
          const angle = d === 0 ? Math.random() * Math.PI * 2 : Math.atan2(ny - other.y, nx - other.x);
          nx = other.x + Math.cos(angle) * BOTTLE_MIN_DIST;
          ny = other.y + Math.sin(angle) * BOTTLE_MIN_DIST;
          overlapping = true;
        }
      }
      if (!overlapping) break;
    }

    const margin = 20;
    nx = Math.max(margin, Math.min(width - margin, nx));
    ny = Math.max(margin, Math.min(height - margin, ny));
    return { x: nx, y: ny };
  }

  function finishCollect() {
    if (!armCommandSent) {
      onCommand?.("ARM", 1);
      armCommandSent = true;
    }
    onCommand?.("STOP", 0);
    onCollect?.();
    bottle = null;
    mode = "idle";
    confidence = 0;
    armT = 0;
    holdT = 0;
    armCommandSent = false;
  }

  function spawnBottle(x, y) {
    const pos = nudgePosition(x, y);
    if (mode === "hold") finishCollect();
    if (mode === "idle" && !bottle) {
      bottle = { x: pos.x, y: pos.y };
      beginTarget();
      return true;
    }
    if (queue.length < MAX_QUEUE) {
      queue.push({ x: pos.x, y: pos.y });
      return true;
    }
    return false;
  }

  function spawnRandomBottle() {
    const margin = 60;
    const x = margin + Math.random() * (width - margin * 2);
    const y = margin + Math.random() * (height - margin * 2 - 60);
    return spawnBottle(x, y);
  }

  const IDLE_SCAN_SPEED_DEG_PER_S = 50;

  function update(dtMs) {
    if (!reducedMotion) sweepAngle += dtMs * 0.003;

    // Slow continuous rotation while idle
    if (mode === "idle") {
      if (!reducedMotion) {
        robot.angle += (IDLE_SCAN_SPEED_DEG_PER_S * dtMs) / 1000;
      }
      return;
    }

    if (!bottle) return;

    if (mode === "search") {
      // Same slow idle rotation; detect only when bottle enters FOV naturally
      if (!reducedMotion) {
        robot.angle += (IDLE_SCAN_SPEED_DEG_PER_S * dtMs) / 1000;
      }

      if (reducedMotion || isInFov(bottle.x, bottle.y)) {
        mode = "detect";
        detectT = 0;
        detector.reset();
        confidence = 0;
        return;
      }

      // Promote a queued bottle that enters the FOV first so we never skip a visible one
      for (let i = 0; i < queue.length; i++) {
        if (isInFov(queue[i].x, queue[i].y)) {
          queue.push(bottle);
          bottle = queue.splice(i, 1)[0];
          mode = "detect";
          detectT = 0;
          detector.reset();
          confidence = 0;
          return;
        }
      }
      return;
    }

    if (mode === "detect") {
      // Keep rotating (slower) while building confidence; stop once locked on
      if (!reducedMotion) {
        robot.angle += (IDLE_SCAN_SPEED_DEG_PER_S * 0.4 * dtMs) / 1000;
      }
      detectT += dtMs;
      confidence = detector.tick(DETECT_TARGET_CONFIDENCE);
      if (detectT >= DETECT_LOCK_MS) {
        // Confidence locked; send bearing offset + distance estimate to Arduino
        const bearingOffset = Math.round(normalizeDeg(angleTo(bottle.x, bottle.y) - robot.angle));
        const dist = Math.hypot(bottle.x - robot.x, bottle.y - robot.y);
        onCommand?.("BRG", bearingOffset);
        onCommand?.("FWD", Math.max(1, Math.round(dist / 4)));
        mode = "turn";
      }
      return;
    }

    if (mode === "turn") {
      const desired = angleTo(bottle.x, bottle.y);
      const diff = normalizeDeg(desired - robot.angle);
      if (reducedMotion || Math.abs(diff) <= (TURN_SPEED_DEG_PER_S * dtMs) / 1000) {
        robot.angle = desired;
        mode = "drive";
      } else {
        robot.angle += Math.sign(diff) * ((TURN_SPEED_DEG_PER_S * dtMs) / 1000);
      }
      return;
    }

    if (mode === "drive") {
      const dist = Math.hypot(bottle.x - robot.x, bottle.y - robot.y);
      if (reducedMotion || dist <= ARRIVE_DIST) {
        robot.x = bottle.x - Math.cos((robot.angle * Math.PI) / 180) * ARRIVE_DIST;
        robot.y = bottle.y - Math.sin((robot.angle * Math.PI) / 180) * ARRIVE_DIST;
        mode = "grab";
        armT = 0;
        armCommandSent = false;
      } else {
        const rad = (robot.angle * Math.PI) / 180;
        const step = (DRIVE_SPEED_PX_PER_S * dtMs) / 1000;
        robot.x += Math.cos(rad) * step;
        robot.y += Math.sin(rad) * step;
      }
      return;
    }

    if (mode === "grab") {
      if (reducedMotion) {
        armT = 1;
        if (!armCommandSent) {
          onCommand?.("ARM", 1);
          armCommandSent = true;
        }
        mode = "hold";
        holdT = 0;
        return;
      }
      armT += dtMs / GRAB_DURATION_MS;
      if (!armCommandSent && armT >= CONTACT_T) {
        onCommand?.("ARM", 1);
        armCommandSent = true;
      }
      if (armT >= 1) {
        mode = "hold";
        holdT = 0;
      }
      return;
    }

    if (mode === "hold") {
      holdT += dtMs;
      if (holdT >= HOLD_MS) {
        finishCollect();
        startNextBottle();
      }
    }
  }

  function draw(ctx, colors) {
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
    ctx.globalAlpha = (mode === "grab" || mode === "hold") ? 0.38 : 1;
    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if ((mode === "idle" || mode === "search") && !reducedMotion) {
      const heading = (robot.angle * Math.PI) / 180;
      const fovHalf = Math.PI / 6; // 30° each side = 60° total
      // Extend to the longest canvas diagonal so it always reaches the edges
      const sweepLen = Math.hypot(width, height);

      ctx.save();
      const grad = ctx.createRadialGradient(robot.x, robot.y, 0, robot.x, robot.y, sweepLen);
      grad.addColorStop(0, colors.scan);
      grad.addColorStop(0.08, colors.scan);
      grad.addColorStop(0.35, "transparent");
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      ctx.moveTo(robot.x, robot.y);
      ctx.arc(robot.x, robot.y, sweepLen, heading - fovHalf, heading + fovHalf);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      const edgeLen = sweepLen * 0.3;
      const edgeGrad = ctx.createLinearGradient(
        robot.x, robot.y,
        robot.x + Math.cos(heading) * edgeLen, robot.y + Math.sin(heading) * edgeLen
      );
      edgeGrad.addColorStop(0, colors.scan);
      edgeGrad.addColorStop(1, "transparent");
      ctx.strokeStyle = edgeGrad;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(robot.x, robot.y);
      ctx.lineTo(robot.x + Math.cos(heading - fovHalf) * edgeLen, robot.y + Math.sin(heading - fovHalf) * edgeLen);
      ctx.moveTo(robot.x, robot.y);
      ctx.lineTo(robot.x + Math.cos(heading + fovHalf) * edgeLen, robot.y + Math.sin(heading + fovHalf) * edgeLen);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const qb of queue) {
      drawBottle(ctx, qb.x, qb.y, colors);
    }

    if (bottle && (mode === "detect" || mode === "turn" || mode === "drive")) {
      drawDetectBox(ctx, colors, bottle, mode, robot);
    }

    if (bottle && mode !== "grab" && mode !== "hold") {
      drawBottle(ctx, bottle.x, bottle.y, colors);
    }

    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate((robot.angle * Math.PI) / 180);
    drawRobotBody(ctx, colors);
    ctx.restore();

    if (bottle && (mode === "grab" || mode === "hold")) {
      const t = mode === "hold" ? 1 : clamp01(armT);
      const seated = t <= CONTACT_T ? 0 : smoothstep((t - CONTACT_T) / (1 - CONTACT_T));
      const pull = 3 * seated;
      const rad = (robot.angle * Math.PI) / 180;
      drawBottle(ctx, bottle.x - Math.cos(rad) * pull, bottle.y - Math.sin(rad) * pull, colors);
    }

    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate((robot.angle * Math.PI) / 180);
    drawCollectorArms(ctx, colors, armCloseAmount(mode, armT));
    ctx.restore();
  }

  return {
    spawnBottle,
    spawnRandomBottle,
    update,
    draw,
    isBusy: () => mode !== "idle" && mode !== "hold",
    getRobotPos: () => ({ x: robot.x, y: robot.y }),
    home,
  };
}
