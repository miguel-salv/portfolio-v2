const LANE_ORDER = ["pid", "uart", "lcd", "idle"];
const LABEL_W = 46;
const AXIS_H = 18;
const GRID_STEP_MS = 200;
const LABEL_FONT_PX = 10;
const TICK_FONT_PX = 10;

export function createTimeline(ctx, width, height, { windowMs = 1600 } = {}) {
  const WINDOW_MS = windowMs;

  // Scaled up when the canvas is displayed narrower than its coordinate space
  // (mobile), so labels keep a roughly constant on-screen size. index.js drives
  // this via a ResizeObserver; setScale recomputes the derived geometry.
  let scale = 1;
  let labelW = LABEL_W;
  let axisH = AXIS_H;
  let trackX = LABEL_W;
  let trackW = width - LABEL_W - 4;
  let bodyH = height - AXIS_H;
  let laneH = bodyH / LANE_ORDER.length;

  function setScale(s) {
    scale = s;
    labelW = LABEL_W * s;
    axisH = AXIS_H * s;
    trackX = labelW;
    trackW = width - labelW - 4;
    bodyH = height - axisH;
    laneH = bodyH / LANE_ORDER.length;
  }

  function timeToX(t, windowStart) {
    return trackX + ((t - windowStart) / WINDOW_MS) * trackW;
  }

  function draw(snapshot, colors, nowMs = snapshot.clockMs) {
    const windowStart = nowMs - WINDOW_MS;

    ctx.clearRect(0, 0, width, height);

    ctx.textBaseline = "middle";
    ctx.font = `600 ${LABEL_FONT_PX * scale}px ` + colors.monoFont;

    LANE_ORDER.forEach((laneId, i) => {
      const y = i * laneH;
      ctx.fillStyle = i % 2 === 0 ? colors.laneBgA : colors.laneBgB;
      ctx.fillRect(trackX, y, trackW, laneH);
      ctx.fillStyle = colors.inkMute;
      ctx.fillText(laneId.toUpperCase(), 2 * scale, y + laneH / 2);
    });

    const segCount = snapshot.segments.length;
    for (let i = 0; i < segCount; i++) {
      const seg = snapshot.segments[i];
      // Last segment is the running task; extend its edge to nowMs
      const segEnd = i === segCount - 1 ? nowMs : seg.end;
      if (segEnd < windowStart) continue;
      const laneIdx = LANE_ORDER.indexOf(seg.taskId);
      if (laneIdx === -1) continue;
      const y = laneIdx * laneH;
      const x0 = Math.max(trackX, timeToX(seg.start, windowStart));
      const x1 = Math.min(trackX + trackW, timeToX(segEnd, windowStart));
      if (x1 <= x0) continue;
      ctx.fillStyle = colors[seg.taskId] || colors.idle;
      ctx.fillRect(x0, y + 3, x1 - x0, laneH - 6);
    }

    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
    for (let i = 0; i <= LANE_ORDER.length; i++) {
      const y = Math.round(i * laneH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(trackX, y);
      ctx.lineTo(trackX + trackW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = colors.pendsv;
    ctx.lineWidth = 1.5;
    for (const seg of snapshot.segments) {
      if (seg.start < windowStart || seg.start <= 0) continue;
      const x = Math.round(timeToX(seg.start, windowStart)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 5);
      ctx.stroke();
    }

    for (const miss of snapshot.missed) {
      if (miss.atMs < windowStart) continue;
      const x = timeToX(miss.atMs, windowStart);
      ctx.save();
      ctx.strokeStyle = colors.miss;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, bodyH);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = colors.miss;
      ctx.beginPath();
      ctx.moveTo(x - 4, 0);
      ctx.lineTo(x + 4, 0);
      ctx.lineTo(x, 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = colors.rule;
    ctx.fillRect(trackX, bodyH, trackW, 1);

    ctx.font = `${TICK_FONT_PX * scale}px ` + colors.monoFont;
    ctx.fillStyle = colors.inkFaint;
    const firstGrid = Math.ceil(windowStart / GRID_STEP_MS) * GRID_STEP_MS;
    for (let gt = firstGrid; gt <= nowMs; gt += GRID_STEP_MS) {
      const x = timeToX(gt, windowStart);
      ctx.strokeStyle = colors.rule;
      ctx.beginPath();
      ctx.moveTo(x, bodyH);
      ctx.lineTo(x, bodyH + 4 * scale);
      ctx.stroke();
      ctx.fillText(`${(gt / 1000).toFixed(1)}s`, x - 12 * scale, bodyH + 13 * scale);
    }

    ctx.fillStyle = colors.ink;
    ctx.fillRect(trackX + trackW - 1, 0, 1, bodyH);
  }

  return {
    draw,
    setScale,
    get trackX() { return trackX; },
    get trackW() { return trackW; },
    get laneH() { return laneH; },
    get bodyH() { return bodyH; },
  };
}
