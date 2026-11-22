const rest = { x: 0, y: 0, lift: 0 };
const artworkTransform = ({ x, y, lift }) =>
  `translate(${x}px, ${y}px) perspective(220px) rotateX(${-22 * lift}deg) rotateY(${x * -.45}deg) rotate(${7 + x * .24}deg)`;

export function setupHornetSticker(button, { reduced, signal }) {
  const art = button?.querySelector(".hornet-art");
  const cloak = button?.querySelector(".hornet-cloak");
  const ink = button?.querySelector(".hornet-cloak-ink");
  if (!art?.animate || !cloak || !ink) return;

  let pull, animation, cloakMotion, dragged = false;
  function stop() {
    animation?.cancel();
    cloakMotion?.cancel();
  }
  function resetPull() {
    pull = null;
    button.removeAttribute("data-pulling");
    art.style.removeProperty("transform");
  }
  function play(poses, duration, flutter = false) {
    stop();
    const frames = poses.map(({ offset, easing = "cubic-bezier(.18, .64, .32, 1)" }) => ({ offset, easing }));
    animation = art.animate(poses.map((pose, index) => ({
      ...frames[index], transform: artworkTransform(pose),
    })), duration);
    if (flutter) cloakMotion = cloak.animate(poses.map(({ sway = 0 }, index) => ({
      ...frames[index], transform: `rotate(${sway}deg)`,
    })), duration);
  }

  button.disabled = false;
  button.addEventListener("pointerdown", event => {
    if (reduced.matches || !event.isPrimary || event.button !== 0) return;
    dragged = false;
    pull = { id: event.pointerId, startX: event.clientX, startY: event.clientY, pose: rest };
    button.setPointerCapture(event.pointerId);
  }, { signal });
  button.addEventListener("pointermove", event => {
    if (pull?.id !== event.pointerId) return;
    const dx = event.clientX - pull.startX;
    const dy = event.clientY - pull.startY;
    const distance = Math.hypot(dx, dy);
    if (!dragged && distance < 6) return;
    if (!dragged) stop();
    dragged = true;
    const scale = Math.max(1, distance / 34);
    pull.pose = { x: Math.min(6, dx / scale), y: Math.min(5, dy / scale), lift: Math.min(1, distance / 28) };
    button.setAttribute("data-pulling", "");
    art.style.transform = artworkTransform(pull.pose);
  }, { signal });
  function release(event) {
    if (pull?.id !== event.pointerId) return;
    const { pose } = pull;
    resetPull();
    if (dragged && !reduced.matches) play([
      pose,
      { x: -pose.x * .12, y: -pose.y * .12, lift: -.1, offset: .58 },
      rest,
    ], 430);
  }
  button.addEventListener("pointerup", release, { signal });
  button.addEventListener("pointercancel", release, { signal });
  button.addEventListener("lostpointercapture", release, { signal });
  button.addEventListener("click", event => {
    if (event.detail && dragged) {
      dragged = false;
      return;
    }
    if (animation?.playState === "running") return;
    if (reduced.matches) {
      animation = ink.animate([{ opacity: 0 }, { opacity: .24 }, { opacity: 0 }], 260);
      return;
    }
    play([
      { ...rest, easing: "ease-out" },
      { x: 1, y: 2, lift: -.16, sway: 2, offset: .12 },
      { x: -12, y: -17, lift: 1.18, sway: -8, offset: .46, easing: "ease-in" },
      { x: 0, y: 1, lift: -.13, sway: 3.5, offset: .79 },
      rest,
    ], 440, true);
  }, { signal });
  function reset() {
    stop();
    resetPull();
    dragged = false;
  }
  reduced.addEventListener("change", reset, { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); }, { signal });
  signal.addEventListener("abort", reset, { once: true });
}
