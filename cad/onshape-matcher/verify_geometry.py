"""Check the three capacitors at their saved reference pose, without mutation."""
from client import api, state, DID, ROOT, decode_fs
import json

feature_ids = [json.loads((ROOT / f'c{i}-feature.json').read_text())['feature']['featureId'] for i in [1, 2, 3]]
script = '''function(context is Context, queries is map) {
    var results = [];
    for (var fid in FIDS) {
        var id = makeId(fid);
        var fixed = qContainedInCompositeParts(qCreatedBy(id + "fixedComposite", EntityType.BODY));
        var rotor = qContainedInCompositeParts(qCreatedBy(id + "rotorComposite", EntityType.BODY));
        var names = [];
        for (var clash in evCollision(context, {"tools":rotor,"targets":fixed})) {
            if (clash["type"] == ClashType.INTERFERE)
                names = append(names, {"moving":getProperty(context,{"entity":clash.toolBody,"propertyType":PropertyType.NAME}),
                                      "fixed":getProperty(context,{"entity":clash.targetBody,"propertyType":PropertyType.NAME})});
        }
        results = append(results, {"feature":fid,"fixedBodies":size(evaluateQuery(context,fixed)),
                                  "rotorBodies":size(evaluateQuery(context,rotor)),"interferences":names});
    }
    return results;
}'''.replace('FIDS', json.dumps(feature_ids))
s = state()
r = api('POST', f'/api/v10/partstudios/d/{DID}/w/{s["branchId"]}/e/{s["partStudioId"]}/featurescript',
        {'script': script, 'libraryVersion': 3083}, output='capacitor-clearance.json')
if r['notices']:
    raise RuntimeError(json.dumps(r['notices']))
result = decode_fs(r['result'])
(ROOT / 'clearance-report.json').write_text(json.dumps(result, indent=2) + '\n')
for i, component in enumerate(result, 1):
    print(f'C{i}: {int(component["fixedBodies"])} fixed bodies, {int(component["rotorBodies"])} moving bodies, '
          f'{len(component["interferences"])} reference-pose interference reports')
