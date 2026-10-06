const clamp = value => Math.min(1, Math.max(0, value));
const smooth = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };

// Scroll supplies a destination. Visible motion has a bounded speed and brakes
// toward that destination, including an immediate change of direction.
export function stepMechanism(position, target, seconds, speed = 1.2) {
  const delta = clamp(target) - position;
  if (Math.abs(delta) < .002) return clamp(target);
  const dt = Math.min(.05, Math.max(0, seconds));
  const step = Math.min(Math.abs(delta) * (1 - Math.exp(-10 * dt)), speed * dt);
  return position + Math.sign(delta) * step;
}

export function nativeMechanismProgress(rect, height) {
  return clamp((height * .75 - rect.top) / Math.max(1, Math.min(rect.height, height * .7) + height * .15));
}

export function matcherAssemblyPose(progress) {
  const control = smooth((progress - .025) / .35);
  const hardware = smooth((progress - .28) / .62);
  const shafts = smooth((progress - .62) / .38);
  return {
    control: [.15 * control, -1.15 * control, .16 * control],
    capacitors: [0, 0, 1.35 * hardware],
    motors: [.9 * hardware, 0, .2 * hardware],
    shafts,
    lighting: 1 - Math.min(1, Math.max(control, hardware) * 1.75),
  };
}

// Keep every authored triangle/attribute intact while giving the two packed
// motor assemblies independent parents. No geometry or bake is regenerated.
export function splitMotorTriangles(positions, indices) {
  const sides = [[], []];
  for (let i = 0; i < indices.length; i += 3) {
    const x = positions[indices[i] * 3] + positions[indices[i + 1] * 3] + positions[indices[i + 2] * 3];
    sides[Number(x >= 0)].push(indices[i], indices[i + 1], indices[i + 2]);
  }
  return sides.map(side => new Uint32Array(side));
}

// Paused videos decode a forward-only action in either direction. There is no
// playback loop, seek backlog, hidden-page clock, or permanent animation frame.
export function createMechanismScrubber(video, { signal, onFrame, onBeforeSeek, speed = 1.2,
  playbackRate = 0, seekFrameOffset = 0,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  isHidden = () => document.hidden } = {}) {
  let target = 0, position = 0, active = false, disposed = false, raf = 0, last = null, source = '', cruise = speed, paced = false, directSeek = false;
  const valid = () => !disposed && !signal?.aborted && active && !isHidden() && Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 2 && !video.dataset.failed;
  // WebM rounds duration to milliseconds. Recover the authored 30fps frame
  // count so the held endpoint reaches the last decoded frame, not its neighbor.
  const end = () => Math.max(0, (Math.round(video.duration * 30) - 1) / 30);
  const seekTime = progress => Math.round(progress * end() * 30) / 30 + seekFrameOffset / 30;
  const request = () => { if (!raf && valid() && !video.seeking) raf = requestFrame(tick); };
  const present = () => { if (valid() && !video.seeking) onFrame?.(); };
  function tick(now) {
    raf = 0;
    if (!valid() || video.seeking) return;
    directSeek = false;
    const dt = last === null ? 1 / 60 : (now - last) / 1000;
    last = now;
    if(paced){
      // Inspection easing is baked into the camera frames. Advance at a steady
      // cadence and never skip a pose when a decoder is slow.
      const delta=target-position;
      const step=Math.min(Math.abs(delta),cruise*Math.min(.05,Math.max(0,dt)),1/Math.max(1,end()*30));
      position+=Math.sign(delta)*step;
    }else if(playbackRate>0){
      // Catalogue films already contain their acceleration and braking. Run
      // their action at one source cadence, without an extra slow easing tail.
      const delta=target-position;
      position+=Math.sign(delta)*Math.min(Math.abs(delta),playbackRate*Math.min(.05,Math.max(0,dt))/Math.max(1/30,end()));
    }else position = stepMechanism(position, target, dt, cruise);
    video.dataset.motionProgress = String(position);
    const time = seekTime(position);
    if (Math.abs(video.currentTime - time) > 1 / 60) {
      onBeforeSeek?.(video.currentTime, time);
      video.currentTime = time;
    }
    present();
    if (Math.abs(position - target) > .00001) request();
  }
  const decoded = () => {
    present();
    // A direct destination can replace an in-flight seek. Its logical position
    // is already seated, but the decoder may just have returned the older frame.
    const pending = directSeek;
    directSeek = false;
    if (Math.abs(position - target) > .00001 || pending) request();
  };
  video.addEventListener('seeked', decoded, { signal });
  video.addEventListener('loadeddata', decoded, { signal });
  const pause = () => { active = false; last = null; cancelFrame(raf); raf = 0; video.pause(); };
  const dispose = () => { pause(); disposed = true; video.removeEventListener('seeked', decoded); video.removeEventListener('loadeddata', decoded); delete video.dataset.motionTarget; delete video.dataset.motionProgress; };
  signal?.addEventListener('abort', dispose, { once: true });
  return { get settled() {
    return valid() && !video.seeking && Math.abs(position - target) < .00001
      && Math.abs(video.currentTime - seekTime(target)) < 1 / 60;
  }, get complete() {
    // Pixel-rounded scroll positions may stop just short of progress 1 while
    // still decoding the exact final frame. Completion follows that frame.
    const finish=1-.5/Math.max(1,end()*30);
    return valid() && target>=finish && position>=finish && !video.seeking
      && Math.abs(video.currentTime-seekTime(1))<1/60;
  }, setTarget(value, enabled = true, immediate = false, pace = 0, start) {
    if(disposed || signal?.aborted)return;
    const changed=target!==clamp(value);
    target = clamp(value); video.dataset.motionTarget = String(target);
    video.loop = false; video.pause();
    if (!enabled || isHidden()) { pause(); return; }
    // Route endpoints can share a pose at different timeline positions.
    const resumed = active && source === video.dataset.source;
    if(Number.isFinite(start)){
      position=clamp(start);last=null;source=video.dataset.source;
    } else if (immediate) {
      position = target; last = null; source = video.dataset.source; directSeek = true;
    } else if (!resumed) {
      position = end() > 0 ? clamp((video.currentTime - seekFrameOffset / 30) / end()) : 0;
      last = null; source = video.dataset.source;
    }
    const span = Math.abs(target - position);
    if(changed||!resumed||Number.isFinite(start)){
      cruise = pace > 0 && span > .002 ? span / pace : speed;
    }
    paced=pace>0;
    active = true; present(); request();
  }, pause, dispose };
}
