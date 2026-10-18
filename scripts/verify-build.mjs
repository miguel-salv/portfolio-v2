// Check the files visitors actually receive, including links between pages.
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';

const root = resolve('dist');
const origin = 'https://miguelsalv.com';
const errors = [];
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(resolve(dir, entry.name)) : resolve(dir, entry.name)))).flat();
}
const files = await walk(root);
const pages = new Map();
const attributes = text => Object.fromEntries([...text.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(match => [match[1].toLowerCase(), (match[2] ?? match[3] ?? match[4] ?? '').replaceAll('&amp;', '&').replaceAll('&quot;', '"')]));
for (const file of files.filter(file => file.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  const path = '/' + relative(root, file).split('\\').join('/');
  const route = path.replace(/index\.html$/, '');
  // Inline scripts/styles can contain strings that resemble HTML tags.
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...markup.matchAll(/<([a-z][a-z\d-]*)\b([^>]*)>/gi)].map(match => ({ tag: match[1].toLowerCase(), attrs: attributes(match[2]) }));
  const ids = new Set();
  for (const { tag, attrs } of tags) {
    if (attrs.id) {
      if (ids.has(attrs.id)) errors.push(`${route}: duplicate id #${attrs.id}`);
      ids.add(attrs.id);
    }
    if (tag === 'img' && !('alt' in attrs)) errors.push(`${route}: image missing alt (${attrs.src})`);
  }
  if (!tags.some(({ tag, attrs }) => tag === 'meta' && attrs['http-equiv']?.toLowerCase() === 'refresh')) {
    if (tags.filter(({ tag }) => tag === 'h1').length !== 1) errors.push(`${route}: expected one h1`);
    if (tags.filter(({ tag }) => tag === 'main').length !== 1) errors.push(`${route}: expected one main landmark`);
  }
  pages.set(file, { route, ids, tags });
}
let checked = 0;
async function localFile(url) {
  const path = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (path !== root && !path.startsWith(root + '/')) return null;
  for (const candidate of [path, resolve(path, 'index.html'), path + '.html']) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch {}
  }
  return null;
}
for (const { route, tags } of pages.values()) {
  const references = [];
  for (const { tag, attrs } of tags) {
    for (const key of ['href', 'src', 'poster']) if (attrs[key]) references.push(attrs[key]);
    if (['img', 'source'].includes(tag) && attrs.srcset) references.push(...attrs.srcset.split(',').map(value => value.trim().split(/\s+/)[0]));
  }
  for (const ref of references) {
    if (ref.startsWith('data:')) continue;
    let url;
    try { url = new URL(ref, origin + route); } catch { errors.push(`${route}: malformed URL ${ref}`); continue; }
    if (url.origin !== origin) continue;
    const file = await localFile(url); checked++;
    if (!file) { errors.push(`${route}: missing local target ${ref}`); continue; }
    if (url.hash && extname(file) === '.html' && pages.has(file)) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { errors.push(`${route}: malformed fragment ${ref}`); continue; }
      if (id && !pages.get(file).ids.has(id)) errors.push(`${route}: missing fragment ${ref}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n')); process.exitCode = 1;
} else console.log(`Verified ${pages.size} HTML pages and ${checked} local references; no missing targets, duplicate IDs, or unnamed images.`);
