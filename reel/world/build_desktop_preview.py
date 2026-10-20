"""Build only the local HTML reading-rest review. Never invokes Blender."""
from pathlib import Path
import html
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
world = json.loads((HERE / 'world.json').read_text(encoding='utf-8'))
copy = {item['id']: item for item in world['copy']}
source = (ROOT / 'src/pages/index.astro').read_text(encoding='utf-8')
header_source = (ROOT / 'src/components/SiteHeader.astro').read_text(encoding='utf-8')
site_source = (ROOT / 'src/data/site.ts').read_text(encoding='utf-8')
nav_items = re.findall(r'\{ label: "([^"]+)", href: "([^"]+)" \}', site_source)
assert len(nav_items) == 5
details = re.findall(r'<details class="role-details">.*?<p>(.*?)</p>\s*</details>', source, re.S)
skills_markup = re.search(r'<div class="skill-set">(.*?)</div>', source, re.S).group(1)
skills = re.findall(r'<span>(.*?)</span>', skills_markup)
assert len(details) == 3 and len(skills) == 12

def e(value):
    return html.escape(value, quote=True)

def url(value):
    if value == '/resume/':
        return '../../public/resume/miguel-salvacion-resume.pdf'
    return 'https://miguelsalv.com' + value if value.startswith('/') else value

def action(label, href, primary=False):
    return f'<a class="action{" primary" if primary else ""}" href="{e(url(href))}">{e(label)} {arrow()}</a>'

def arrow():
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>'

def actions(item):
    return '<div class="actions">' + ''.join(action(a['label'], a['href'], i == 0) for i, a in enumerate(item['actions'])) + '</div>'

def metrics(item):
    return '<ul class="metrics" aria-label="Project results">' + ''.join(f'<li>{e(s)}</li>' for s in item.get('metrics', [])) + '</ul>'

views = []
def view(identifier, rest, frame, label, body, eyebrow, cls=''):
    n = len(views) + 1
    views.append(f'''<section class="rest {cls}" id="{identifier}" data-rest="{rest}" data-frame="{frame:04d}" data-label="{label}" aria-labelledby="{identifier}-title">
      <img class="scene" src="lab/review/desktop-rests/frame-{frame:04d}.png" width="1920" height="1080" alt="{e(ALT[rest])}" decoding="async" {'fetchpriority="high"' if n == 1 else 'loading="lazy"'}>
      <div class="copy"><p class="eyebrow">{e(eyebrow)}</p>{body}</div>
    </section>''')

ALT = {
    'hero': 'Rendered lab: impedance matcher on the green bench mat, with a notebook, mug, pencil and probes.',
    'matcher': 'Rendered close view of the blue controller, air-variable capacitor stacks and connected coax on the same bench.',
    'vehicle': 'Rendered embedded vehicle on the taped floor lane, with the bench and storage behind it.',
    'robot': 'Rendered robot and grounded bottle on the continuous epoxy floor; the grippers are open at this reading rest.',
    'desk': 'Rendered personal desk: Kirby Companion at left and the tilted LED keychain with its split ring at right, beneath the warm lamp.',
    'wall': 'Rendered pinboard with a real photograph of Miguel, exact Ford, Hacker Fab and CMU marks, and a mathematical Smith chart.',
    'close': 'Rendered wide dusk view of the entire room, showing the RF bench, both floor vehicles, personal desk and pinboard.'
}

hero = copy['hero']
hero_heading = e(hero['heading']).replace('&amp; firmware.', '<span>&amp; firmware.</span>')
view('intro', 'hero', 0, 'Opening', f'<h1 id="intro-title">{hero_heading}</h1><p class="body">{e(hero["body"])}</p>{actions(hero)}<p class="availability">{e(hero["detail"])}</p>', 'Miguel Salvacion · Electrical & computer engineering', 'left hero')

matcher = copy['matcher']
mode_controls = '<div class="modes" role="group" aria-label="Matcher view">' + ''.join(f'<button type="button" data-mode="{name.lower()}" aria-pressed="{str(i == 0).lower()}" aria-controls="mode-{name.lower()}">{name}</button>' for i, name in enumerate(matcher['modes'])) + '</div>'
machine = '<div id="mode-machine" data-mode-panel="machine"><dl class="measured"><div><dt>Deployed match</dt><dd>~1.2 <small>VSWR</small></dd></div><div><dt>Forward power</dt><dd>95 <small>W</small></dd></div><div><dt>Build cost</dt><dd>$636</dd></div></dl></div>'
assert matcher['metrics'] == ['~1.2 VSWR', '95 W forward power', '$636 build']
inspect = '<div id="mode-inspect" data-mode-panel="inspect" hidden><p class="mode-description">Two motor-driven air-variable capacitors change the RF network. A Teensy 4.1 and custom control PCB read forward and reverse power, then command the motors.</p></div>'
tune = '<div id="mode-tune" data-mode-panel="tune" hidden><p class="mode-description">Move either capacitor to detune the match, then run auto-tuning.</p>' + action('Open existing tuner', 'https://miguelsalv.com/#project-impedance') + '</div><noscript>' + action('Open existing tuner', 'https://miguelsalv.com/#project-impedance') + '</noscript>'
view('project-matcher', 'matcher', 90, 'Matcher', f'<h2 id="project-matcher-title">{e(matcher["heading"])}</h2>{mode_controls}<p class="body">{e(matcher["body"])}</p><div class="mode-content">{machine}{inspect}{tune}</div>{actions(matcher)}', '01 / RF automation', 'left project matcher')
for identifier, frame, eyebrow, side in [('vehicle', 255, '02 / Real-time control', 'left'), ('robot', 405, '03 / Vision into motion', 'right')]:
    item = copy[identifier]
    view('project-' + identifier, identifier, frame, identifier.title(), f'<h2 id="project-{identifier}-title">{e(item["heading"])}</h2><p class="body">{e(item["body"])}</p>{metrics(item)}{actions(item)}', eyebrow, side + ' project ' + identifier)

desk = copy['desk']
for i, project in enumerate(desk['projects']):
    identifier = project['id']
    demo_anchor = 'firmware' if identifier == 'companion' else 'circuit-design'
    body = f'<p class="group-intro">{e(desk["body"])}</p><h2 id="project-{identifier}-title">{e(project["heading"])}</h2><p class="body">{e(project["body"])}</p><div class="actions">{action(desk["actions"][i]["label"], project["href"] + "#" + demo_anchor, True)}{action("View project", project["href"])}</div><nav class="paired" aria-label="Independent builds"><a href="#project-companion" {"aria-current=\"step\"" if i == 0 else ""}>01 Companion</a><a href="#project-keychain" {"aria-current=\"step\"" if i == 1 else ""}>02 Keychain</a></nav>'
    view('project-' + identifier, 'desk', 555, project['heading'], body, desk['heading'], 'right personal')

wall = copy['wall']
skills_html = '<h3 class="small-title">Technical skills</h3><ul class="skills">' + ''.join(f'<li>{s}</li>' for s in skills) + '</ul>'
about_body = f'<h2 id="about-title">{e(wall["heading"])}</h2><p class="body">{e(wall["body"])}</p>{skills_html}{actions(wall)}<nav class="paired" aria-label="About and experience"><a href="#about" aria-current="step">About</a><a href="#career">Experience →</a></nav>'
view('about', 'wall', 645, 'About Miguel', about_body, '05 / Meet the engineer', 'right board about')
roles = ''
for index, role in enumerate(wall['career']):
    roles += f'<article class="role"><div class="role-meta"><span>{e(role["organization"])}</span><span>{e(role["dates"])}</span></div><h3>{e(role["heading"])}</h3><p>{e(role["outcome"])}</p><details><summary>Role details<span class="sr-only"> — {e(role["organization"])}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg></summary><p>{details[index]}</p></details></article>'
view('career', 'wall', 645, 'Experience', f'<h2 id="career-title">Experience.</h2><div class="roles">{roles}</div><nav class="paired" aria-label="About and experience"><a href="#about">← About</a><a href="#career" aria-current="step">Experience</a></nav>', '05 / Experience', 'right board career')
close = copy['close']
view('close', 'close', 765, 'Matched.', f'<div class="title-block"><h2 id="close-title">{e(close["heading"])}</h2><p class="body">{e(close["body"])}</p></div><div class="contact-block"><p class="availability">{e(close["detail"])}</p>{actions(close)}</div>', 'Miguel Salvacion', 'left close')

# Reuse the actual brand asset, navigation labels/order and theme icon markup.
nav_targets = {'/#about': '#about', '/#project-matcher': '#project-matcher', '/#career': '#career', '/#contact': '#close'}
nav_html = ''.join(f'<li><a data-nav-item="{label.lower()}" href="{e(nav_targets.get(href, url(href)))}"><span class="nav-label">{e(label)}</span></a></li>' for label, href in nav_items)
theme_button = re.search(r'<button class="theme-toggle icon-btn".*?</button>', header_source, re.S).group(0)
theme_button = theme_button.replace('data-theme-toggle', 'id="theme"')
search_button = re.search(r'<button class="cmdk-chip icon-btn".*?</button>', header_source, re.S).group(0)
search_button = search_button.replace('data-cmdk-trigger', 'id="open-search"')
header = f'<header class="site-header overlay" data-variant="home"><nav class="nav" aria-label="Primary navigation"><a class="brand" href="#intro" aria-label="Miguel Salvacion home"><img src="../../src/assets/avatar.png" alt="" width="30" height="30"><span>Miguel Salvacion</span></a><ul class="nav-links">{nav_html}</ul><div class="nav-tools">{search_button}{theme_button}</div></nav></header>'
search_entries = ''.join(f'<li><a href="#{re.search(r"id=\"([^\"]+)\"", markup).group(1)}">{e(re.search(r"data-label=\"([^\"]+)\"", markup).group(1))}</a></li>' for markup in views)
search = f'<dialog class="search-dialog" id="search-dialog" aria-labelledby="search-title"><div class="search-head"><h2 id="search-title">Search</h2><button type="button" id="close-search" aria-label="Close search">×</button></div><label class="sr-only" for="search-input">Search this portfolio</label><input id="search-input" type="search" placeholder="Search projects, experience, contact…" autocomplete="off"><ul id="search-results">{search_entries}<li>{action("Resume", "/resume/")}</li><li>{action("Email Miguel", "mailto:msalvacion@cmu.edu")}</li></ul><p id="search-empty" hidden>No matching pages.</p></dialog>'

document = '''<!doctype html>
<html lang="en" class="fallback" data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>The lab — desktop layout review</title><link rel="icon" href="../../public/assets/favicons/favicon.svg"><script>try{const t=localStorage.getItem('portfolio-theme');document.documentElement.dataset.theme=t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light'}catch{}</script><link rel="stylesheet" href="desktop.css"><script src="desktop.js" defer></script></head>
<body>
  <a class="skip" href="#intro">Skip to introduction</a>
  ''' + header + '''
  <main aria-label="The lab reading rests">''' + '\n'.join(views) + '''</main>''' + search + '''
  <footer class="stage-footer overlay"><span>Rendered lab · existing hardware</span><nav aria-label="Reading steps"><a id="previous" href="#intro">← Previous</a><span id="position" aria-live="polite">1 / 9 · Opening</span><a id="next" href="#project-matcher">Next →</a></nav><a href="https://miguelsalv.com/about-site/">How I built this site ↗</a></footer>
  <aside class="review" aria-label="Local review controls"><div><strong>Desktop layout review</strong><p>Seven current stills, nine reading steps. Controls and copy are HTML. The stills stay fixed; no movie plays here.</p><p>Matcher modes preview the text/control footprint. The tuner and personal demo links open the existing site; their live scene registration is a later step.</p><noscript><p>JavaScript is off. All nine reading steps appear in document order with native links and expandable role details.</p></noscript></div><div class="review-controls"><label>Reading step <select id="step"></select></label><label><input type="checkbox" id="hide-text"> Hide text</label><label><input type="checkbox" id="document-flow"> Document view</label><a id="raw-frame" href="lab/review/desktop-rests/frame-0000.png">Full-resolution still ↗</a><output id="viewport"></output></div></aside>
</body></html>'''
(HERE / 'desktop.html').write_text(document, encoding='utf-8')
print('Built desktop.html from world.json and the existing biography/role details/skills. No scene rebuild or render.')
