/* Local still/copy review only. This deliberately does not own the film or homepage. */
const root = document.documentElement;
root.classList.add('js');
history.scrollRestoration = 'manual';
const rests = [...document.querySelectorAll('.rest')];
const step = document.querySelector('#step');
const hideText = document.querySelector('#hide-text');
const flow = document.querySelector('#document-flow');
const compact = matchMedia('(max-width: 1099px), (max-height: 699px)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const forced = matchMedia('(forced-colors: active)');
let mediaFailure = false;
let current = 0;
let explicitFlow = false;
let request = 0;
for (const rest of rests) step.add(new Option(rest.dataset.label, rest.id));

function selected() {
  const id = location.hash.slice(1);
  const index = rests.findIndex(rest => rest.id === id || (id === 'project-impedance' && rest.dataset.rest === 'matcher') || (id === 'contact' && rest.id === 'close'));
  return index < 0 ? 0 : index;
}
async function update({focus = false} = {}) {
  const ticket = ++request;
  const destination = selected();
  const image = rests[destination].querySelector('.scene');
  if (!mediaFailure && (!image.complete || !image.naturalWidth)) {
    // Keep the previous complete still visible while a new one becomes ready.
    image.loading = 'eager';
    try { await image.decode(); } catch { mediaFailure = true; }
    if (ticket !== request) return;
  }
  current = destination;
  const documentView = explicitFlow || compact.matches || reduce.matches || forced.matches || mediaFailure;
  root.classList.toggle('document-view', documentView);
  root.classList.remove('fallback');
  root.classList.add('enhanced');
  flow.checked = documentView;
  flow.disabled = compact.matches || reduce.matches || forced.matches || mediaFailure;
  for (let i = 0; i < rests.length; i++) {
    const hidden = !documentView && i !== current;
    rests[i].hidden = hidden;
    rests[i].inert = hidden || hideText.checked;
    rests[i].querySelector('.copy').inert = hideText.checked;
  }
  step.value = rests[current].id;
  document.querySelector('#position').textContent = `${current + 1} / ${rests.length} · ${rests[current].dataset.label}`;
  document.querySelector('#previous').href = '#' + rests[Math.max(0, current - 1)].id;
  document.querySelector('#next').href = '#' + rests[Math.min(rests.length - 1, current + 1)].id;
  document.querySelector('#raw-frame').href = `lab/review/desktop-rests/frame-${rests[current].dataset.frame}.png`;
  const navItem = rests[current].id.startsWith('project-') ? 'projects' : {about:'about',career:'career',close:'contact'}[rests[current].id];
  for (const link of document.querySelectorAll('[data-nav-item]')) {
    if (link.dataset.navItem === navItem) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  }
  document.querySelector('#viewport').value = `${innerWidth} × ${innerHeight} CSS px${documentView ? ' · document view' : ''}`;
  if (!documentView) window.scrollTo({top:0,behavior:'instant'});
  if (focus) {
    const title = rests[current].querySelector('h1,h2');
    title.tabIndex = -1;
    title.focus({preventScroll:true});
    if (documentView) rests[current].scrollIntoView();
    else window.scrollTo({top:0,behavior:'instant'});
  }
}
step.addEventListener('change', () => { location.hash = step.value; });
window.addEventListener('hashchange', () => update({focus:true}));
window.addEventListener('resize', () => update());
for (const query of [compact, reduce, forced]) query.addEventListener('change', () => update());
flow.addEventListener('change', () => { explicitFlow = flow.checked; update(); });
hideText.addEventListener('change', () => {
  root.classList.toggle('text-hidden', hideText.checked);
  for (const node of document.querySelectorAll('.overlay')) node.inert = hideText.checked;
  update();
});
const theme = document.querySelector('#theme');
function syncTheme() {
  const dark = root.dataset.theme === 'dark';
  theme.setAttribute('aria-pressed', String(dark));
  theme.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}
theme.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('portfolio-theme', root.dataset.theme); } catch { /* Theme still works without storage. */ }
  syncTheme();
});
syncTheme();

const search = document.querySelector('#search-dialog');
const searchInput = document.querySelector('#search-input');
const searchTrigger = document.querySelector('#open-search');
const searchEntries = [...document.querySelectorAll('#search-results li')];
function filterSearch() {
  const query = searchInput.value.trim().toLowerCase();
  for (const entry of searchEntries) {
    const href = entry.querySelector('a').getAttribute('href');
    const rest = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
    entry.hidden = !(entry.textContent + ' ' + (rest?.textContent || '')).toLowerCase().includes(query);
  }
  document.querySelector('#search-empty').hidden = searchEntries.some(entry => !entry.hidden);
}
function openSearch() {
  searchInput.value = '';
  filterSearch();
  search.showModal();
  searchTrigger.setAttribute('aria-expanded','true');
  searchInput.focus();
}
searchTrigger.addEventListener('click', openSearch);
document.querySelector('#close-search').addEventListener('click', () => search.close());
search.addEventListener('close', () => searchTrigger.setAttribute('aria-expanded','false'));
searchInput.addEventListener('input', filterSearch);
search.addEventListener('click', event => { if (event.target.closest('a')) search.close(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && search.open) {
    event.preventDefault();
    search.close();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!search.open) openSearch();
  }
});
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
  for (const candidate of document.querySelectorAll('[data-mode]')) candidate.setAttribute('aria-pressed', String(candidate === button));
  for (const panel of document.querySelectorAll('[data-mode-panel]')) panel.hidden = panel.dataset.modePanel !== button.dataset.mode;
});
// Returning focus to a reading field also dismisses the below-frame review tools.
for (const copy of document.querySelectorAll('.copy')) copy.addEventListener('focusin', () => {
  if (!root.classList.contains('document-view')) window.scrollTo({top:0,behavior:'instant'});
});
for (const image of document.querySelectorAll('.scene')) {
  image.addEventListener('error', () => { mediaFailure = true; update(); });
  if (image.complete && !image.naturalWidth) mediaFailure = true;
}
update();
