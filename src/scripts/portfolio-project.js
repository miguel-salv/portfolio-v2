// Click-to-load YouTube facade (keeps third-party JS off the critical path).
function initProjectPage() {
document.querySelectorAll(".video-facade[data-youtube]:not([data-video-mounted])").forEach((button) => {
  button.dataset.videoMounted = "true";
  button.addEventListener("click", () => {
    const id = button.dataset.youtube;
    if (!id) return;
    const frame = button.closest(".video-frame");
    if (!frame) return;
    const iframe = document.createElement("iframe");
    const short = frame.closest(".video-embed--short");
    iframe.width = short ? "315" : "560";
    iframe.height = short ? "560" : "315";
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
    iframe.title = (button.getAttribute("aria-label") || "Project demo video").replace(/^Play\s+/i, "");
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
  });
});
}

document.addEventListener("astro:page-load", initProjectPage);
