"""Read the current website reconstruction without importing Blender or changing it."""
from pathlib import Path
from math import pi, cos, sin
from itertools import product
import ast
import hashlib
import json
import struct

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
source = ROOT / 'reel/matcher_geometry.py'
tree = ast.parse(source.read_text())
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in
             ('rotor_outline', 'side_stator_outline', 'large_stator_outline')]
scope = {'pi': pi, 'cos': cos, 'sin': sin}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), scope)
manifest = json.loads((ROOT / 'public/assets/matcher/assembly.json').read_text())
specs = manifest['reconstruction']['components']
for i, s in enumerate(specs):
    lo, hi = s['sourceEnvelopeM']
    center = [(a + b) / 2 for a, b in zip(lo, hi)]
    pivot = s['shaftM']
    if i == 2:
        s['statorOutlineM'] = scope['large_stator_outline']((hi[0]-lo[0])*.475, .0195)
        s['rotorOutlineM'] = scope['rotor_outline'](.0205, pi*1.025)
    else:
        s['statorOutlineM'] = scope['side_stator_outline'](.019, .019)
        s['rotorOutlineM'] = scope['rotor_outline'](.0182, pi*.13, (pivot[0]-center[0])*.65)

# The source GLB uses Y-up. Blender's importer maps it to (x, -z, y).
b = (ROOT / 'reel/models/impedance.glb').read_bytes()
n = struct.unpack_from('<I', b, 12)[0]
glb = json.loads(b[20:20+n])
identity = [float(i == j) for i in range(4) for j in range(4)]
def matmul(a,b):
    return [sum(a[r*4+k]*b[k*4+c] for k in range(4)) for r in range(4) for c in range(4)]
def walk(index, parent):
    node=glb['nodes'][index]
    raw=node.get('matrix',identity)
    local=[raw[c*4+r] for r in range(4) for c in range(4)]
    world=matmul(parent,local)
    if node.get('name')=='Inductor' and 'mesh' in node:
        accessors=[glb['accessors'][p['attributes']['POSITION']] for p in glb['meshes'][node['mesh']]['primitives']]
        low=[min(a['min'][i] for a in accessors) for i in range(3)]
        high=[max(a['max'][i] for a in accessors) for i in range(3)]
        points=[]
        for p in product(*zip(low,high)):
            v=[sum(world[r*4+c]*([*p,1][c]) for c in range(4)) for r in range(3)]
            points.append([v[0],-v[2],v[1]])
        return {'low':[min(p[i] for p in points) for i in range(3)],
                'high':[max(p[i] for p in points) for i in range(3)]}
    for child in node.get('children',[]):
        found=walk(child,world)
        if found:return found
for index in glb['scenes'][glb.get('scene',0)]['nodes']:
    inductor=walk(index,identity)
    if inductor:break
if not inductor:raise RuntimeError('Source inductor not found')
result={'components':specs,'inductor':inductor,'rfConnections':manifest['reconstruction']['rfConnections'],
        'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in
                        (source,ROOT/'public/assets/matcher/assembly.bin',ROOT/'reel/models/impedance.glb')},
        'accuracy':manifest['reconstruction']['accuracy']}
(HERE/'geometry-input.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'inductor':inductor,'plateCounts':[s['statorPlateCountEstimate'] for s in specs]}))
