"""Resume a sequential native-feature build, mapping server-assigned feature IDs."""
from pathlib import Path
import argparse
import copy
import json
import re
from client import api, DID, ROOT, state


def saved_features():
    results = {}
    for path in ROOT.glob('native-C*.json'):
        if path.name.startswith('native-C1-'):
            continue
        data = json.loads(path.read_text())
        if 'feature' in data:
            symbol = path.stem.removeprefix('native-')
            results[symbol] = data
    return results


def prepare(feature, saved):
    result = copy.deepcopy(feature)
    result.pop('featureId', None)
    ids = {symbol: response['feature']['featureId'] for symbol, response in saved.items()}
    for parameter in result['parameters']:
        for q in parameter.get('queries', []):
            text = q.get('queryString', '')
            q['queryString'] = re.sub(r'makeId\("([^"]+)"\)',
                                     lambda m: 'makeId("' + ids.get(m[1], m[1]) + '")', text)
    return result


def submit(feature, saved, repair=False):
    s = state()
    symbol = feature['featureId']
    payload = prepare(feature, saved)
    path = f'/api/v10/partstudios/d/{DID}/w/{s["branchId"]}/e/{s["partStudioId"]}/features'
    if repair:
        fid = saved[symbol]['feature']['featureId']
        path += '/featureid/' + fid
        payload['featureId'] = fid
    response = api('POST', path, {'btType': 'BTFeatureDefinitionCall-1406',
                                 'feature': payload, 'libraryVersion': 3083},
                   output='native-' + symbol + '.json')
    saved[symbol] = response
    status = response.get('featureState', {}).get('featureStatus')
    print(json.dumps({'symbol': symbol, 'id': response.get('feature', {}).get('featureId'), 'status': status}), flush=True)
    if status != 'OK':
        raise RuntimeError('Native feature failed: ' + symbol)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--component', type=int, required=True)
    parser.add_argument('--limit', type=int, default=100)
    args = parser.parse_args()
    plan = json.loads((ROOT / 'native-capacitor-plan.json').read_text())[args.component - 1]
    saved = saved_features()
    actions = 0
    for feature in plan['features']:
        symbol = feature['featureId']
        if symbol in saved and saved[symbol].get('featureState', {}).get('featureStatus') == 'OK':
            continue
        if actions >= args.limit:
            break
        submit(feature, saved, symbol in saved)
        actions += 1
