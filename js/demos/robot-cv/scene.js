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

/* ───── Drawing helpers ───── */

function drawRobot(ctx, colors, mode, armT) {
  const W = ROBOT_W;
  const H = ROBOT_H;

  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;

  // Main chassis
  ctx.beginPath();
  ctx.roundRect(-W / 2, -H / 2, W, H, 5);
  ctx.fillStyle = colors.robot;
  ctx.fill();
  ctx.restore();

  // Chassis outline
  ctx.beginPath();
  ctx.roundRect(-W / 2, -H / 2, W, H, 5);
  ctx.strokeStyle = colors.robotDark;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Chassis panel inset (inner rectangle for depth)
  ctx.beginPath();
  ctx.roundRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, 3);
  ctx.strokeStyle = colors.robotAccent;
  ctx.lineWidth = 0.75;
  ctx.stroke();

  // Wheels (4 rounded rects at corners)
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

  // Axle lines
  ctx.strokeStyle = colors.robotDark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-wheelOffX, -wheelOffY);
  ctx.lineTo(-wheelOffX, wheelOffY);
  ctx.moveTo(wheelOffX, -wheelOffY);
  ctx.lineTo(wheelOffX, wheelOffY);
  ctx.stroke();

  // Camera lens (front circle)
  const lensX = W / 2 - 9;
  ctx.beginPath();
  ctx.arc(lensX, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = colors.robotAccent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lensX, 0, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = colors.robotLens;
  ctx.fill();

  // Front bumper bar (direction indicator)
  ctx.fillStyle = colors.robotAccent;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 2, -H / 2 + 4, 3, H - 8, 1.5);
  ctx.fill();
}

function drawBottle(ctx, x, y, colors) {
  ctx.save();
  ctx.translate(x, y);

  // Bottle dimensions
  const bodyW = 10;
  const bodyH = 18;
  const neckW = 4.5;
  const neckH = 7;
  const capH = 4;
  const shoulderH = 3;
  const baseR = 3;
  const totalH = bodyH + shoulderH + neckH + capH;
  const topY = -totalH / 2;

  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  // Body
  ctx.beginPath();
  ctx.moveTo(-bodyW / 2, topY + capH + neckH + shoulderH);
  // Left side body down to bottom
  ctx.lineTo(-bodyW / 2, topY + totalH - baseR);
  ctx.quadraticCurveTo(-bodyW / 2, topY + totalH, -bodyW / 2 + baseR, topY + totalH);
  // Bottom
  ctx.lineTo(bodyW / 2 - baseR, topY + totalH);
  ctx.quadraticCurveTo(bodyW / 2, topY + totalH, bodyW / 2, topY + totalH - baseR);
  // Right side body up
  ctx.lineTo(bodyW / 2, topY + capH + neckH + shoulderH);
  // Shoulder curve right → neck
  ctx.quadraticCurveTo(bodyW / 2, topY + capH + neckH, neckW / 2, topY + capH + neckH);
  // Neck right side up
  ctx.lineTo(neckW / 2, topY + capH);
  // Neck left side down
  ctx.lineTo(-neckW / 2, topY + capH);
  ctx.lineTo(-neckW / 2, topY + capH + neckH);
  // Shoulder curve left → body
  ctx.quadraticCurveTo(-bodyW / 2, topY + capH + neckH, -bodyW / 2, topY + capH + neckH + shoulderH);
  ctx.closePath();
  ctx.fillStyle = colors.bottle;
  ctx.fill();
  ctx.restore(); // restore shadow

  // Body outline
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

  // Highlight reflection
  ctx.beginPath();
  ctx.moveTo(-bodyW / 2 + 2.5, topY + capH + neckH + shoulderH + 2);
  ctx.lineTo(-bodyW / 2 + 2.5, topY + totalH - 4);
  ctx.strokeStyle = colors.bottleHighlight;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";

  // Label band
  const labelTop = topY + capH + neckH + shoulderH + 5;
  const labelH = 7;
  ctx.fillStyle = colors.bottleLabel;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(-bodyW / 2 + 1, labelTop, bodyW - 2, labelH);
  ctx.globalAlpha = 1;

  // Cap
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
  const queue = []; // pending bottles waiting to be targeted
  const MAX_QUEUE = 2;
  let mode = "idle"; // idle | search | detect | turn | drive | grab
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
    // If bottle is already in FOV, go straight to detect; otherwise search first
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
    // Prefer a bottle already in (or nearest to) the FOV so the robot
    // doesn't spin past visible bottles to reach one behind it.
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const angDist = Math.abs(normalizeDeg(angleTo(queue[i].x, queue[i].y) - robot.angle));
      // Weight: angular distance (primary), with a small spatial tiebreaker
      const dist = Math.hypot(queue[i].x - robot.x, queue[i].y - robot.y);
      const score = angDist + dist * 0.01;
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    }
    bottle = queue.splice(bestIdx, 1)[0];
    beginTarget();
  }

  const BOTTLE_MIN_DIST = 30;

  function nudgePosition(x, y) {
    // Collect all existing bottle positions
    const others = [...queue];
    if (bottle) others.push(bottle);

    let nx = x, ny = y;
    for (let attempt = 0; attempt < 8; attempt++) {
      let overlapping = false;
      for (const other of others) {
        const d = Math.hypot(nx - other.x, ny - other.y);
        if (d < BOTTLE_MIN_DIST) {
          // Push away from the overlapping bottle
          const angle = d === 0 ? Math.random() * Math.PI * 2 : Math.atan2(ny - other.y, nx - other.x);
          nx = other.x + Math.cos(angle) * BOTTLE_MIN_DIST;
          ny = other.y + Math.sin(angle) * BOTTLE_MIN_DIST;
          overlapping = true;
        }
      }
      if (!overlapping) break;
    }

    // Clamp within canvas bounds
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

    // Slow continuous rotation while idle — the robot is always scanning
    if (mode === "idle") {
      if (!reducedMotion) {
        robot.angle += (IDLE_SCAN_SPEED_DEG_PER_S * dtMs) / 1000;
      }
      return;
    }

    if (!bottle) return;

    if (mode === "search") {
      // Keep the same slow idle rotation — detect only when bottle enters FOV naturally
      if (!reducedMotion) {
        robot.angle += (IDLE_SCAN_SPEED_DEG_PER_S * dtMs) / 1000;
      }

      // Check if the current target entered the FOV
      if (reducedMotion || isInFov(bottle.x, bottle.y)) {
        mode = "detect";
        detectT = 0;
        detector.reset();
        confidence = 0;
        return;
      }

      // Also check if any queued bottle entered the FOV first — if so, swap it
      // in as the active target so we never visually "skip" a visible bottle.
      for (let i = 0; i < queue.length; i++) {
        if (isInFov(queue[i].x, queue[i].y)) {
          // Put current target back in queue and promote this one
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
      // Keep rotating (slower) while building confidence — only stop
      // once the CV model has fully locked on.
      if (!reducedMotion) {
        robot.angle += (IDLE_SCAN_SPEED_DEG_PER_S * 0.4 * dtMs) / 1000;
      }
      detectT += dtMs;
      confidence = detector.tick(DETECT_TARGET_CONFIDENCE);
      if (detectT >= DETECT_LOCK_MS) {
        // Confidence locked — send bearing offset (how far off-center the
        // target is in the camera frame) and distance estimate to Arduino.
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

    // Grid
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

    // Camera FOV cone — forward-facing ~60° field of view, fades to nothing
    if ((mode === "idle" || mode === "search") && !reducedMotion) {
      const heading = (robot.angle * Math.PI) / 180;
      const fovHalf = Math.PI / 6; // 30° each side = 60° total
      // Extend to the longest canvas diagonal so it always reaches the edges
      const sweepLen = Math.hypot(width, height);

      // Radial gradient fill — solid near the robot, fades to transparent
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

      // Cone edge lines — also fade out
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

    // Queued bottles (drawn before the active bottle so active is on top)
    for (const qb of queue) {
      drawBottle(ctx, qb.x, qb.y, colors);
    }

    // Bottle
    if (bottle) {
      if (mode === "grab") {
        // Animate bottle lifting and sliding into the robot
        const t = Math.min(1, armT);
        // Eased progress (ease-in-out)
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const startX = bottle.x;
        const startY = bottle.y;
        const endX = robot.x;
        const endY = robot.y;

        const drawX = startX + (endX - startX) * ease;
        const drawY = startY + (endY - startY) * ease;
        const scale = 1 - ease * 0.7;      // shrinks to 30%
        const alpha = 1 - ease * 0.6;      // fades to 40%

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

        // Corner brackets instead of full rectangle for a CV-style look
        const bx = bottle.x - boxSize / 2;
        const by = bottle.y - boxSize / 2;
        const arm = 8;
        if (mode === "detect") ctx.setLineDash([4, 3]);

        ctx.beginPath();
        // Top-left
        ctx.moveTo(bx + arm, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + arm);
        // Top-right
        ctx.moveTo(bx + boxSize - arm, by); ctx.lineTo(bx + boxSize, by); ctx.lineTo(bx + boxSize, by + arm);
        // Bottom-right
        ctx.moveTo(bx + boxSize, by + boxSize - arm); ctx.lineTo(bx + boxSize, by + boxSize); ctx.lineTo(bx + boxSize - arm, by + boxSize);
        // Bottom-left
        ctx.moveTo(bx, by + boxSize - arm); ctx.lineTo(bx, by + boxSize); ctx.lineTo(bx + arm, by + boxSize);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = colors.detect;
        ctx.font = "600 10px " + colors.monoFont;
        ctx.fillText(`bottle ${confidence.toFixed(2)}`, bx, by - 6);
      }
    }

    // Robot
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
