"""Generate native FeatureScript constants from the current website snapshot."""
from pathlib import Path
import json

HERE=Path(__file__).resolve().parent
data=json.loads((HERE/'geometry-input.json').read_text())
def vector(v):return 'vector('+', '.join(f'{x:.12g}' for x in v)+') * meter'
def vectors(v):return '[\n    '+',\n    '.join(vector(p) for p in v)+'\n]'
caps=[]
for s in data['components']:
    caps.append('{"low": '+vector(s['sourceEnvelopeM'][0])+', "high": '+vector(s['sourceEnvelopeM'][1])+', "pivot": '+vector(s['shaftM'])+'}')
text='FeatureScript 3083;\nimport(path : "onshape/std/common.fs", version : "3083.0");\n\n'
text+='const CAPS = [\n    '+',\n    '.join(caps)+'\n];\n'
for key,field in [('STATOR_PROFILES','statorOutlineM'),('ROTOR_PROFILES','rotorOutlineM')]:
    text+='const '+key+' = [\n'+',\n'.join(vectors(s[field]) for s in data['components'])+'\n];\n'
text+='const COIL_LOW = '+vector(data['inductor']['low'])+';\n'
text+='const COIL_HIGH = '+vector(data['inductor']['high'])+';\n\n'
ground=next(c for c in data['rfConnections'][0]['connections'] if c['node']=='CHASSIS_GND')
text+='const FLOOR_Z = '+str(ground['terminalEndpointM'][2]-.0011)+' * meter;\n\n'
text+=(HERE/'matcher-template.fs').read_text()
(HERE/'matcher.fs').write_text(text)
print('Generated',len(text),'characters of native FeatureScript')
