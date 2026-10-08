"""Task-scoped signed Onshape client; credentials never enter logs or source.

All requests count toward the user-authorized task cap, including failed requests.
The connection check before this client was created used one request.
"""
from pathlib import Path
from email.utils import formatdate
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
import base64
import hashlib
import hmac
import json
import secrets
import time

ROOT = Path(__file__).resolve().parent
STATE = ROOT / 'state.json'
DID = 'cc4111ace6f0da6f2cc5eff1'
MAIN = '87b1b29d350b3b1930589856'
ASSEMBLY = '662af5ae6926c0454d4e1c04'

def state():
    return json.loads(STATE.read_text()) if STATE.exists() else {'requests': 1, 'history': []}

def save_state(value):
    STATE.write_text(json.dumps(value, indent=2) + '\n')

def decode_fs(node):
    """Unwrap the documented FeatureScript value encoding for compact reports."""
    if node is None:
        return None
    kind = node.get('btType', '')
    value = node.get('value')
    if kind.endswith('BTFSValueMap'):
        return {decode_fs(entry['key']): decode_fs(entry['value']) for entry in value}
    if kind.endswith('BTFSValueArray'):
        return [decode_fs(entry) for entry in value]
    return value

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def api(method, path, body=None, output=None, binary=False):
    s = state()
    cap = s.get('requestCap', 100)
    if s['requests'] >= cap:
        raise RuntimeError(f'{cap}-request task cap reached')
    if not path.startswith('/api/'):
        raise ValueError('Only Onshape API paths are allowed')
    if method != 'GET':
        # The sole permitted mutation associated with Main is a baseline version.
        baseline = path == f'/api/documents/d/{DID}/versions'
        branch_creation = path == f'/api/documents/d/{DID}/workspaces'
        if not (baseline or branch_creation):
            wid = s.get('branchId')
            if not wid or f'/w/{wid}' not in path or f'/w/{MAIN}' in path:
                raise RuntimeError('Mutation blocked: request must target the review branch')
    credentials = json.loads((Path.home() / '.config/onshape/credentials.json').read_text())
    u = urlsplit(path)
    nonce = secrets.token_hex(16)
    date = formatdate(usegmt=True)
    ctype = 'application/json'
    message = '\n'.join([method, nonce, date, ctype, u.path, u.query, '']).lower().encode()
    signature = base64.b64encode(hmac.new(credentials['secret_key'].encode(), message, hashlib.sha256).digest()).decode()
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Authorization': 'On ' + credentials['access_key'] + ':HmacSHA256:' + signature,
               'Date': date, 'On-Nonce': nonce, 'Content-Type': ctype, 'Accept': 'application/json'}
    request = Request('https://cad.onshape.com' + path, data=data, headers=headers, method=method)
    s['requests'] += 1
    entry = {'request': s['requests'], 'method': method, 'path': path, 'time': date}
    s['history'].append(entry)
    save_state(s)
    try:
        with build_opener(NoRedirect).open(request, timeout=55) as response:
            payload = response.read()
            entry.update(status=response.status, rateRemaining=response.headers.get('X-Rate-Limit-Remaining'))
            save_state(s)
            if binary:
                result = payload
            else:
                result = json.loads(payload) if payload else {}
    except HTTPError as e:
        entry['status'] = e.code
        save_state(s)
        # Onshape response data contains no request credentials. Keep the short
        # diagnostic in a local file instead of logging headers or request bodies.
        payload = e.read()
        (ROOT / f'error-{s["requests"]}.json').write_bytes(payload)
        raise RuntimeError(f'Onshape HTTP {e.code}; diagnostic: error-{s["requests"]}.json') from None
    if output:
        dest = ROOT / output
        dest.write_bytes(result) if binary else dest.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'request': s['requests'], 'method': method, 'status': entry['status'], 'saved': output}))
    return result
