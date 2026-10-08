import pdfModuleUrl from "../vendor/pdfjs-4.10.38/pdf.min.mjs?url";
import pdfWorkerUrl from "../vendor/pdfjs-4.10.38/pdf.worker.min.mjs?url";

async function loadPdfLibrary() {
  const library = await import(/* @vite-ignore */ pdfModuleUrl);
  library.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return library;
}

// Keep the last complete page visible while its replacement renders offscreen.
export function mountResumeViewer(viewer, { fallback, summary, loadLibrary = loadPdfLibrary } = {}) {
  const pdfUrl = viewer.dataset.resumePdf || "miguel-salvacion-resume.pdf";
  let disposed = false;
  let loadingTask = null;
  let pdfDoc = null;
  let renderToken = 0;
  let resizeTimer = 0;
  let renderedWidth = 0;
  let resizeObserver = null;
  let intersectionObserver = null;
  const rendering = new Set();

  function showFallback() {
    if (disposed) return;
    viewer.setAttribute("aria-busy", "false");
    viewer.hidden = true;
    if (fallback) fallback.hidden = false;
    if (summary) {
      summary.hidden = false;
      summary.classList.add("is-visible");
      const note = summary.querySelector('.resume-summary-note');
      if (note) note.textContent = "The highlights are shown above. You can also open or download the complete, current PDF.";
    }
  }

  function contentWidth() {
    const styles = window.getComputedStyle(viewer);
    const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight) +
      parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
    return Math.max(0, viewer.clientWidth - padding);
  }

  function cancelRendering() {
    for (const task of rendering) task.cancel();
    rendering.clear();
  }

  async function renderPages() {
    if (disposed || !pdfDoc || viewer.hidden) return;
    const width = Math.min(contentWidth(), 960);
    if (width <= 0) return;
    if (Math.abs(width - renderedWidth) < 1 && viewer.classList.contains("is-ready")) {
      // Resizing back to the displayed width invalidates an in-flight replacement.
      renderToken++;
      cancelRendering();
      viewer.setAttribute("aria-busy", "false");
      return;
    }
    const token = ++renderToken;
    cancelRendering();
    viewer.setAttribute("aria-busy", "true");
    const fragment = document.createDocumentFragment();
    const tasks = [];

    try {
      for (let num = 1; num <= pdfDoc.numPages; num++) {
        const page = await pdfDoc.getPage(num);
        if (disposed || token !== renderToken) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = width / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: scale * outputScale });
        const wrap = document.createElement("div");
        wrap.className = "resume-page-canvas";
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.style.setProperty("--resume-page-ratio", `${baseViewport.width} / ${baseViewport.height}`);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Resume page ${num} of ${pdfDoc.numPages}`);
        wrap.appendChild(canvas);
        fragment.appendChild(wrap);
        const task = page.render({ canvasContext: canvas.getContext("2d"), viewport: renderViewport });
        rendering.add(task);
        tasks.push(task);
        // Observe rejection immediately, even while another page is being fetched.
        task.promise.catch(() => {});
      }
      await Promise.all(tasks.map(task => task.promise));
      if (disposed || token !== renderToken) return;
      const firstRender = !viewer.classList.contains("is-ready");
      viewer.replaceChildren(fragment);
      renderedWidth = width;
      viewer.classList.add("is-ready");
      viewer.setAttribute("aria-busy", "false");
      if (firstRender) viewer.querySelector(".resume-page-canvas")?.classList.add("is-revealing");
    } catch (error) {
      if (disposed || token !== renderToken || error?.name === 'RenderingCancelledException') return;
      console.error("[resume-viewer] failed to render resume", error);
      cancelRendering();
      showFallback();
    } finally {
      tasks.forEach(task => rendering.delete(task));
    }
  }

  async function init() {
    try {
      const library = await loadLibrary();
      if (disposed) return;
      loadingTask = library.getDocument(pdfUrl);
      pdfDoc = await loadingTask.promise;
      if (disposed) return;
      await renderPages();
      if (disposed || viewer.hidden) return;
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => {
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => void renderPages(), 150);
        });
        resizeObserver.observe(viewer);
      }
    } catch (error) {
      if (disposed) return;
      console.error("[resume-viewer] failed to load resume", error);
      showFallback();
    }
  }

  viewer.setAttribute("aria-busy", "true");
  if ("IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver(entries => {
      if (disposed || !entries.some(entry => entry.isIntersecting)) return;
      intersectionObserver.disconnect();
      void init();
    }, { rootMargin: "400px 0px" });
    intersectionObserver.observe(viewer);
  } else {
    void init();
  }

  return () => {
    disposed = true;
    renderToken++;
    window.clearTimeout(resizeTimer);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    cancelRendering();
    void loadingTask?.destroy()?.catch(() => {});
  };
}

let cleanupResumeViewer = () => {};
function initResumeViewer() {
  cleanupResumeViewer();
  const viewer = document.getElementById("resume-viewer");
  if (!viewer || viewer.dataset.resumeMounted === "true") return;
  viewer.dataset.resumeMounted = "true";
  const dispose = mountResumeViewer(viewer, {
    fallback: document.querySelector(".resume-fallback"),
    summary: document.querySelector(".resume-summary"),
  });
  cleanupResumeViewer = () => {
    dispose();
    delete viewer.dataset.resumeMounted;
  };
}
document.addEventListener("astro:page-load", initResumeViewer);
document.addEventListener("astro:before-preparation", () => cleanupResumeViewer());
