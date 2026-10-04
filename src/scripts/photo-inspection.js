// Native dialog supplies focus containment and Escape; full image links are the fallback.
export function mountPhotoInspection(scope = document) {
  const links = [...scope.querySelectorAll('[data-photo-inspect]')];
  if (!links.length || typeof HTMLDialogElement === 'undefined') return () => {};
  const controller = new AbortController();
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-dialog';
  dialog.setAttribute('aria-label', 'Image inspection');
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'photo-dialog-close'; close.textContent = 'Close image';
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  const caption = document.createElement('figcaption');
  const status = document.createElement('p');
  status.className = 'photo-dialog-status'; status.setAttribute('role', 'status');
  const original = document.createElement('a');
  original.textContent = 'Open original image';
  original.setAttribute('data-astro-reload', '');
  original.setAttribute('data-astro-prefetch', 'false');
  const footer = document.createElement('div'); footer.className = 'photo-dialog-footer'; footer.append(caption, original);
  figure.append(image, footer); dialog.append(close, figure, status); document.body.append(dialog);
  let entrance;
  let opener;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stopEntrance = () => { entrance?.cancel(); entrance = null; };
  const options = { signal: controller.signal };
  links.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); stopEntrance(); opener = link;
    const source = link.closest('.photo-aperture')?.querySelector('img');
    const enclosing = link.closest('figure');
    image.alt = source?.alt || 'Project image'; image.src = link.href;
    caption.textContent = enclosing?.querySelector('figcaption')?.textContent.trim() || image.alt;
    original.href = link.href; status.textContent = 'Loading full image…';
    dialog.showModal(); close.focus({ preventScroll: true });
    if (!motion.matches && figure.animate) entrance = figure.animate([{ transform: 'translateY(12px)', opacity: .7 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
  }, options));
  image.addEventListener('load', () => { status.textContent = ''; }, options);
  image.addEventListener('error', () => { status.textContent = 'The full image couldn’t load. Try opening the original image.'; }, options);
  close.addEventListener('click', () => dialog.close(), options);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }, options);
  dialog.addEventListener('close', () => { stopEntrance(); image.removeAttribute('src'); if (opener?.isConnected) opener.focus({ preventScroll: true }); }, options);
  motion.addEventListener('change', stopEntrance, options);
  return () => { controller.abort(); stopEntrance(); if (dialog.open) dialog.close(); dialog.remove(); };
}
