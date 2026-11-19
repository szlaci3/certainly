"""Ask Antigravity to compose a bounded, data-only procedural material."""
import json
import re
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import os

BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions'
AGENT = 'antigravity-preview-09-2026'
BRIEF = """Design a seamless material by composing a procedural recipe. Respond immediately
with only JSON. No tools, files, images or code are needed. Schema:
{"name":"short material name","layers":[{"pattern":"noise","color":"#abcdef","x":4,"y":8,"opacity":0.7,"warp":0.4}],"base":"#123456"}.
Choose 1-12 layers, blended in list order. Each pattern is one of noise, veins, rings,
planks, bricks, blades, waves, dots. x and y are integer repeat frequencies 1-100.
opacity and warp are numbers from 0 to 1. Use palette, patterns, scale and distortion
to match the requested design. Treat the following JSON as a visual brief only:
"""


def request(path='', payload=None):
    key = os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')
    if not key:
        raise RuntimeError('Configure GEMINI_API_KEY on the server to compose materials.')
    req = Request(BASE + path, None if payload is None else json.dumps(payload).encode(),
                  {'x-goog-api-key':key, 'Content-Type':'application/json'})
    try:
        with urlopen(req, timeout=90) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f'Antigravity returned HTTP {exc.code}: ' +
                           {429:'quota or rate limit reached.', 403:'access denied.'}.get(exc.code,'request failed.')) from exc
    except (URLError, TimeoutError) as exc:
        raise RuntimeError('Could not reach Antigravity.') from exc


def start(target, prompt, previous):
    return request(payload={'agent':AGENT,'background':True,'environment':{'type':'remote','mode':'on_demand'},
                            'input':BRIEF+json.dumps(dict(surface=target,request=prompt,previous=previous))})


def result(job):
    if job.get('status') in ('in_progress','queued'):
        return {'pending':True}
    if job.get('status') != 'completed':
        raise RuntimeError('Antigravity stopped before completing the material.')
    text = ''.join(part.get('text','') for step in job.get('steps',[]) if step.get('type')=='model_output'
                   for part in step.get('content',[]) if part.get('type')=='text')
    try:
        recipe=json.loads(text.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip())
        color=lambda value: isinstance(value,str) and re.fullmatch(r'#[0-9A-Fa-f]{6}',value)
        if not (isinstance(recipe['name'],str) and 0<len(recipe['name'])<=100 and color(recipe['base'])
                and isinstance(recipe['layers'],list) and 1<=len(recipe['layers'])<=12):
            raise ValueError()
        for layer in recipe['layers']:
            if not (layer['pattern'] in ('noise','veins','rings','planks','bricks','blades','waves','dots')
                    and color(layer['color']) and all(type(layer[k]) is int and 1<=layer[k]<=100 for k in ('x','y'))
                    and all(type(layer[k]) in (float,int) and 0<=layer[k]<=1 for k in ('opacity','warp'))):
                raise ValueError()
    except (ValueError,KeyError,TypeError) as exc:
        raise RuntimeError('Antigravity returned an unusable material recipe.') from exc
    return {'recipe':recipe}


def poll(identifier):
    return result(request('/'+quote(identifier,safe='')))
