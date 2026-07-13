import { createDetector } from "./detector.js";

const ROBOT_W = 46;
const ROBOT_H = 32;
const TURN_SPEED_DEG_PER_S = 140;
const DRIVE_SPEED_PX_PER_S = 110;
const ARRIVE_DIST = 36;
const DETECT_LOCK_MS = 650;
const DETECT_TARGET_CONFIDENCE = 0.93;
const GRAB_DURATION_MS = 520;

function normalizeDeg(a) {
  let d = a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/* Drawing helpers */

function drawRobot(ctx, colors, mode, armT) {
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

function drawBottle(ctx, x, y, colors) {
  ctx.save();
  ctx.translate(x, y);

  const bodyW = 10;
  const bodyH = 18;
  const neckW = 4.5;
  const neckH = 7;
  const capH = 4;
  const shoulderH = 3;
  const baseR = 3;
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
  let mode = "idle"; // Idle | search | detect | turn | drive | grab
  let detectT = 0;
  let armT = 0;
  let sweepAngle = 0;
  let confidence = 0;

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

  function spawnBottle(x, y) {
    const pos = nudgePosition(x, y);
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
        onCommand?.("ARM", 1);
        mode = "grab";
        armT = 0;
      } else {
        const rad = (robot.angle * Math.PI) / 180;
        const step = (DRIVE_SPEED_PX_PER_S * dtMs) / 1000;
        robot.x += Math.cos(rad) * step;
        robot.y += Math.sin(rad) * step;
      }
      return;
    }

    if (mode === "grab") {
      armT += reducedMotion ? 1 : dtMs / GRAB_DURATION_MS;
      if (armT >= 1) {
        onCommand?.("STOP", 0);
        onCollect?.();
        bottle = null;
        mode = "idle";
        confidence = 0;
        startNextBottle();
      }
      return;
    }
  }

  function draw(ctx, colors) {
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
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

    if (bottle) {
      if (mode === "grab") {
        const t = Math.min(1, armT);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const startX = bottle.x;
        const startY = bottle.y;
        const endX = robot.x;
        const endY = robot.y;

        const drawX = startX + (endX - startX) * ease;
        const drawY = startY + (endY - startY) * ease;
        const scale = 1 - ease * 0.7;
        const alpha = 1 - ease * 0.6;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(drawX, drawY);
        ctx.scale(scale, scale);
        drawBottle(ctx, 0, 0, colors);
        ctx.restore();
      } else {
        drawBottle(ctx, bottle.x, bottle.y, colors);
      }

      if (mode === "detect" || mode === "turn" || mode === "drive") {
        const boxSize = 34;
        ctx.strokeStyle = colors.detect;
        ctx.lineWidth = 1.5;

        // Corner brackets read as a CV detection box
        const bx = bottle.x - boxSize / 2;
        const by = bottle.y - boxSize / 2;
        const arm = 8;
        if (mode === "detect") ctx.setLineDash([4, 3]);

        ctx.beginPath();
        ctx.moveTo(bx + arm, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + arm);
        ctx.moveTo(bx + boxSize - arm, by); ctx.lineTo(bx + boxSize, by); ctx.lineTo(bx + boxSize, by + arm);
        ctx.moveTo(bx + boxSize, by + boxSize - arm); ctx.lineTo(bx + boxSize, by + boxSize); ctx.lineTo(bx + boxSize - arm, by + boxSize);
        ctx.moveTo(bx, by + boxSize - arm); ctx.lineTo(bx, by + boxSize); ctx.lineTo(bx + arm, by + boxSize);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = colors.detect;
        ctx.font = "600 10px " + colors.monoFont;
        ctx.fillText(`bottle ${confidence.toFixed(2)}`, bx, by - 6);
      }
    }

    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate((robot.angle * Math.PI) / 180);
    drawRobot(ctx, colors, mode, armT);
    ctx.restore();
  }

  return {
    spawnBottle,
    spawnRandomBottle,
    update,
    draw,
    isBusy: () => mode !== "idle",
    getRobotPos: () => ({ x: robot.x, y: robot.y }),
    home,
  };
}
