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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createScene(width, height, { onCommand, onCollect, reducedMotion = false } = {}) {
  const home = { x: width / 2, y: height - 44 };
  const robot = { x: home.x, y: home.y, angle: -90 };
  const detector = createDetector();

  let bottle = null;
  let mode = "idle"; // idle | detect | turn | drive | grab
  let detectT = 0;
  let armT = 0;
  let sweepAngle = 0;
  let confidence = 0;

  function angleTo(bx, by) {
    return Math.atan2(by - robot.y, bx - robot.x) * (180 / Math.PI);
  }

  function spawnBottle(x, y) {
    if (mode !== "idle") return false;
    bottle = { x, y };
    mode = "detect";
    detectT = 0;
    detector.reset();
    confidence = 0;
    return true;
  }

  function spawnRandomBottle() {
    const margin = 60;
    const x = margin + Math.random() * (width - margin * 2);
    const y = margin + Math.random() * (height - margin * 2 - 60);
    return spawnBottle(x, y);
  }

  function update(dtMs) {
    if (!reducedMotion) sweepAngle += dtMs * 0.05;

    if (mode === "idle" || !bottle) return;

    if (mode === "detect") {
      detectT += dtMs;
      confidence = detector.tick(DETECT_TARGET_CONFIDENCE);
      if (detectT >= DETECT_LOCK_MS) {
        const turnAmount = Math.round(normalizeDeg(angleTo(bottle.x, bottle.y) - robot.angle));
        onCommand?.("TURN", turnAmount);
        mode = "turn";
      }
      return;
    }

    if (mode === "turn") {
      const desired = angleTo(bottle.x, bottle.y);
      const diff = normalizeDeg(desired - robot.angle);
      if (reducedMotion || Math.abs(diff) <= (TURN_SPEED_DEG_PER_S * dtMs) / 1000) {
        robot.angle = desired;
        const dist = Math.hypot(bottle.x - robot.x, bottle.y - robot.y);
        onCommand?.("DRIVE", Math.max(1, Math.round(dist / 4)));
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

    if (mode === "idle" && !reducedMotion) {
      const rad = (sweepAngle * Math.PI) / 180;
      const sweepLen = 130;
      const grad = ctx.createLinearGradient(
        robot.x, robot.y,
        robot.x + Math.cos(rad) * sweepLen, robot.y + Math.sin(rad) * sweepLen
      );
      grad.addColorStop(0, colors.scan);
      grad.addColorStop(1, "transparent");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(robot.x, robot.y);
      ctx.lineTo(robot.x + Math.cos(rad) * sweepLen, robot.y + Math.sin(rad) * sweepLen);
      ctx.stroke();
    }

    if (bottle) {
      ctx.fillStyle = colors.bottle;
      ctx.beginPath();
      ctx.ellipse(bottle.x, bottle.y, 7, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.bottleCap;
      ctx.fillRect(bottle.x - 3, bottle.y - 15, 6, 5);

      if (mode === "detect" || mode === "turn" || mode === "drive") {
        const boxSize = 32;
        ctx.strokeStyle = colors.detect;
        ctx.lineWidth = 2;
        if (mode === "detect") ctx.setLineDash([4, 3]);
        ctx.strokeRect(bottle.x - boxSize / 2, bottle.y - boxSize / 2, boxSize, boxSize);
        ctx.setLineDash([]);

        ctx.fillStyle = colors.detect;
        ctx.font = "600 11px " + colors.monoFont;
        ctx.fillText(`Bottle ${confidence.toFixed(2)}`, bottle.x - boxSize / 2, bottle.y - boxSize / 2 - 7);
      }
    }

    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate((robot.angle * Math.PI) / 180);

    roundRect(ctx, -ROBOT_W / 2, -ROBOT_H / 2, ROBOT_W, ROBOT_H, 6);
    ctx.fillStyle = colors.robot;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ROBOT_W / 2 - 3, 0);
    ctx.lineTo(ROBOT_W / 2 - 14, -9);
    ctx.lineTo(ROBOT_W / 2 - 14, 9);
    ctx.closePath();
    ctx.fillStyle = colors.robotAccent;
    ctx.fill();

    if (mode === "grab") {
      const pulse = 5 + Math.sin(Math.min(1, armT) * Math.PI) * 4;
      ctx.beginPath();
      ctx.arc(ROBOT_W / 2 + 6, 0, pulse, 0, Math.PI * 2);
      ctx.fillStyle = colors.robotAccent;
      ctx.fill();
    }

    ctx.restore();
  }

  return {
    spawnBottle,
    spawnRandomBottle,
    update,
    draw,
    isBusy: () => mode !== "idle",
    home,
  };
}
