const instrument = document.querySelector("[data-instrument]");

if (instrument) {
  const load = () => import("./instrument.js");
  const loadTarget = instrument.closest(".project-card-wrap") || instrument.parentElement;

  if (!loadTarget || !("IntersectionObserver" in window)) {
    load();
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(loadTarget);
  }
}
