// Astro can defer its swap until the next view-transition frame. A history
// traversal may abort that preparation after it has passed the router's checks.
// Keep the cancelled swap on the current document and current browser address.
export function installNavigationGuard({ document, window, resetHandoff }) {
  let latestPreparation;
  let resumeFrame = 0;
  const cancelResume = () => {
    window.cancelAnimationFrame(resumeFrame);
    resumeFrame = 0;
  };
  document.addEventListener('astro:before-preparation', (event) => {
    cancelResume();
    latestPreparation = event;
    const source = document.body;
    event.signal.addEventListener('abort', () => {
      cancelResume();
      resumeFrame = window.requestAnimationFrame(() => {
        resumeFrame = 0;
        if (latestPreparation !== event || document.body !== source) return;
        resetHandoff();
        // Preparation releases page controllers. If the visitor stays on their
        // source page, resume those controllers through their normal lifecycle.
        document.dispatchEvent(new Event('astro:page-load'));
      });
    }, { once: true });
  });
  document.addEventListener('astro:before-swap', (event) => {
    const swap = event.swap;
    event.swap = () => {
      if (!event.signal.aborted) {
        swap();
        return;
      }
      event.to = new URL(window.location.href);
      resetHandoff();
    };
  });
  document.addEventListener('astro:after-swap', cancelResume);
}
