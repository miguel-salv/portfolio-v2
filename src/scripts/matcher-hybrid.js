// A single visible owner. Offline inspection stays on screen until the live
// mechanism has painted a complete frame; a failed WebGL load keeps the film.
export async function createMatcherModel(mount, options = {}, factories = {}) {
  const filmMount = document.createElement('div');
  const liveMount = document.createElement('div');
  filmMount.className = 'matcher-render-layer';
  filmMount.style.opacity = '1';
  liveMount.className = 'matcher-render-layer';
  liveMount.style.opacity = '0';
  mount.append(filmMount, liveMount);
  const loadFilm = factories.film || (() => import('./matcher-film.js'));
  const loadLive = factories.live || (() => import('./matcher-model.js'));
  let owner = 'film', live = null, loading = false, disposed = false, paused = false, pendingFilm = false;
  let state = { mode: 'machine', progress: 0, m1: 72, m2: 108 };
  let liveReady = false;
  const select = next => {
    if (disposed || (next === 'live' && !liveReady)) return;
    owner = next;
    // Hard alpha ownership preserves measurable layout for the hidden
    // renderer, without overriding an ancestor's hidden scene visibility.
    filmMount.style.opacity = next === 'film' ? '1' : '0';
    liveMount.style.opacity = next === 'live' ? '1' : '0';
    mount.dataset.owner = next;
    film?.pause(paused || next !== 'film');
    live?.pause(paused || next !== 'live');
  };
  const { createMatcherModel: createFilm } = await loadFilm();
  let film = await createFilm(filmMount, {
    ...options,
    onPose: pose => {
      if (disposed) return;
      if (pendingFilm && state.mode !== 'tune' && pose.ready) { pendingFilm = false; select('film'); }
      if (owner === 'film') options.onPose?.(pose);
    },
  });
  async function prepareLive() {
    if (live || loading || disposed) return;
    loading = true;
    try {
      const { createMatcherModel: createLive } = await loadLive();
      if (disposed || options.signal?.aborted) return;
      const next = await createLive(liveMount, {
        ...options,
        onPose: pose => {
          liveReady = true;
          if (live && state.mode === 'tune') {
            select('live');
            options.onPose?.({ ...pose, ready: true, live: true, assemblyComplete: false });
          }
        },
      });
      if (disposed || options.signal?.aborted) { next?.dispose(); return; }
      live = next;
      live?.update(state, { scrub: true });
      if (state.mode === 'tune' && liveReady) select('live');
      else live?.pause(true);
    } catch (error) {
      if (!disposed && !options.signal?.aborted) {
        select('film');
        options.onError?.(error);
      }
    } finally { loading = false; }
  }
  return {
    update(next, settings = {}) {
      if (disposed) return;
      state = { ...state, ...next };
      if (state.mode === 'tune') {
        pendingFilm = false;
        // The seated offline pose has the same projection as the live tuner.
        film?.update({ ...state, mode: 'machine', progress: 0 }, settings);
        if (live) { live.update(state, settings); select('live'); }
        else prepareLive();
      } else {
        pendingFilm = owner === 'live';
        if (pendingFilm) film?.pause(paused);
        film?.update(state, settings);
        if (!pendingFilm || film?.isSettled()) { pendingFilm = false; select('film'); }
      }
    },
    pause(value) { paused = value; film?.pause(value || (owner !== 'film' && !pendingFilm)); live?.pause(value || owner !== 'live'); },
    isReady: () => owner === 'live' ? liveReady : Boolean(film?.isReady()),
    isSettled: () => owner === 'live' ? liveReady : Boolean(film?.isSettled()),
    isSeated: () => owner === 'live' ? Boolean(live?.isSeated()) : Boolean(film?.isSeated()),
    dispose() {
      disposed = true;
      film?.dispose(); live?.dispose(); filmMount.remove(); liveMount.remove();
      delete mount.dataset.owner;
    },
  };
}
