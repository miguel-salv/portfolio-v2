// Browsers can cache a failed dynamic import for the life of a document. A
// fresh URL lets an explicit retry fetch the same local chunk again. Browsers
// that do not identify the failed URL retain the ordinary reload recovery.
export function createRetryableImport(load, {
  importFresh = url => import(/* @vite-ignore */ url),
  base = globalThis.location?.href || import.meta.url,
  validate = () => true,
  nonce = () => Date.now().toString(36),
} = {}) {
  let failedUrl = null, reloadRequired = false, attempt = 0;
  const origin = new URL(base).origin;
  const run = async () => {
    try {
      let module;
      if (failedUrl) {
        const url = new URL(failedUrl);
        url.searchParams.set('portfolio-retry', `${nonce()}-${++attempt}`);
        module = await importFresh(url.href);
      } else module = await load();
      if (!validate(module)) {
        reloadRequired = true;
        throw new Error('The requested module is unavailable. Reload the page to try again.');
      }
      failedUrl = null;
      reloadRequired = false;
      return module;
    } catch (error) {
      const urls = String(error?.message || '').match(/https?:\/\/[^\s"'<>`]+/g) || [];
      const local = urls.map(value => { try { return new URL(value); } catch { return null; } })
        .find(url => url?.origin === origin && /\.m?js$/.test(url.pathname));
      if (local) failedUrl = local.href;
      else if (!failedUrl) reloadRequired = true;
      throw error;
    }
  };
  run.needsReload = () => reloadRequired;
  return run;
}
