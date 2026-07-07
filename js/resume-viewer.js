import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

const PDFJS_VERSION = "4.10.38";
const viewer = document.getElementById("resume-viewer");
const fallback = document.querySelector(".resume-fallback");

if (viewer) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

  const pdfUrl = viewer.dataset.resumePdf || "miguel-salvacion-resume.pdf";
  let pdfDoc = null;
  let renderToken = 0;
  let resizeTimer = 0;

  function showFallback() {
    viewer.hidden = true;
    if (fallback) fallback.hidden = false;
  }

  function setStatus(message) {
    viewer.replaceChildren();
    const status = document.createElement("p");
    status.className = "resume-viewer-status mono";
    status.setAttribute("aria-live", "polite");
    status.textContent = message;
    viewer.appendChild(status);
  }

  function contentWidth() {
    const styles = window.getComputedStyle(viewer);
    const padding =
      parseFloat(styles.paddingLeft) +
      parseFloat(styles.paddingRight) +
      parseFloat(styles.borderLeftWidth) +
      parseFloat(styles.borderRightWidth);
    return Math.max(0, viewer.clientWidth - padding);
  }

  async function renderPages() {
    if (!pdfDoc) return;

    const token = ++renderToken;
    const width = contentWidth();
    if (width <= 0) return;

    setStatus("Loading resume…");

    try {
      const pages = [];

      for (let num = 1; num <= pdfDoc.numPages; num++) {
        if (token !== renderToken) return;

        const page = await pdfDoc.getPage(num);
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
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Resume page ${num} of ${pdfDoc.numPages}`);

        wrap.appendChild(canvas);
        pages.push({ page, renderViewport, canvas });

        if (num === 1) {
          viewer.replaceChildren(wrap);
        } else {
          viewer.appendChild(wrap);
        }
      }

      await Promise.all(
        pages.map(({ page, renderViewport, canvas }) =>
          page.render({
            canvasContext: canvas.getContext("2d"),
            viewport: renderViewport,
          }).promise
        )
      );

      if (token !== renderToken) return;
      viewer.classList.add("is-ready");
    } catch (error) {
      console.error(error);
      showFallback();
    }
  }

  async function init() {
    try {
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      await renderPages();

      const observer = new ResizeObserver(() => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          void renderPages();
        }, 150);
      });
      observer.observe(viewer);
    } catch (error) {
      console.error(error);
      showFallback();
    }
  }

  void init();
}
