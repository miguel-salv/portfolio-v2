"""Read native plate positions and reference-pose clearance from the review branch."""
import argparse
import json
from client import api, DID, ROOT, state, decode_fs
from run_native_capacitors import saved_features

parser = argparse.ArgumentParser()
parser.add_argument('--component', type=int, action='append', required=True)
args = parser.parse_args()
saved = saved_features()
rows = []
for number in args.component:
    prefix = f'C{number}'
    ids = {name: saved[prefix + '_' + name]['feature']['featureId'] for name in
           ('stator_plate_extrude', 'stator_plate_pattern', 'rotor_plate_extrude', 'rotor_plate_pattern')}
    for name in ('fixed_composite', 'rotor_composite'):
        if prefix + '_' + name in saved:
            ids[name] = saved[prefix + '_' + name]['feature']['featureId']
    rows.append({'component': prefix, 'ids': ids})

script = '''function(context is Context, queries is map) {
 var results=[];
 for (var row in ROWS) {
  var data={"component":row.component,"plates":{}};
  for (var name in ["stator_plate_extrude","stator_plate_pattern","rotor_plate_extrude","rotor_plate_pattern"]) {
   var bodies=qCreatedBy(makeId(row.ids[name]),EntityType.BODY);
   var bounds=evBox3d(context,{"topology":bodies,"tight":true});
   data.plates[name]={"count":size(evaluateQuery(context,bodies)),
    "low":[bounds.minCorner[0]/meter,bounds.minCorner[1]/meter,bounds.minCorner[2]/meter],
    "high":[bounds.maxCorner[0]/meter,bounds.maxCorner[1]/meter,bounds.maxCorner[2]/meter]};
  }
  if (row.ids.fixed_composite != undefined) {
   var fixed=qContainedInCompositeParts(qCreatedBy(makeId(row.ids.fixed_composite),EntityType.BODY));
   var rotor=qContainedInCompositeParts(qCreatedBy(makeId(row.ids.rotor_composite),EntityType.BODY));
   var clashes=[];
   for (var clash in evCollision(context,{"tools":rotor,"targets":fixed})) {
    if (clash["type"]==ClashType.INTERFERE)
     clashes=append(clashes,{"moving":getProperty(context,{"entity":clash.toolBody,"propertyType":PropertyType.NAME}),
                           "fixed":getProperty(context,{"entity":clash.targetBody,"propertyType":PropertyType.NAME})});
   }
   data.fixedBodies=size(evaluateQuery(context,fixed));
   data.rotorBodies=size(evaluateQuery(context,rotor));
   data.interferences=clashes;
  }
  results=append(results,data);
 }
 return results;
}'''.replace('ROWS', json.dumps(rows))
s = state()
r = api('POST', f'/api/v10/partstudios/d/{DID}/w/{s["branchId"]}/e/{s["partStudioId"]}/featurescript',
        {'script': script, 'libraryVersion': 3083}, output='native-clearance-response.json')
if r.get('notices'):
    raise RuntimeError(json.dumps(r['notices']))
result = decode_fs(r['result'])
(ROOT / 'native-clearance-report.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
