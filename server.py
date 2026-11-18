import base64
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PUBLIC = Path(__file__).resolve().parent / 'public'
CHAT = 'gemini-3.5-flash-lite'
IMAGE = 'gemini-3.1-flash-image-preview'


def generate(model, contents, config):
    key = os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')
    if not key:
        raise RuntimeError('Gemini needs a server-side API key. Configure GEMINI_API_KEY to generate materials.')
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    request = Request(url, json.dumps(dict(contents=contents, generationConfig=config)).encode(),
                      {'Content-Type': 'application/json', 'x-goog-api-key': key})
    try:
        with urlopen(request, timeout=120) as response:
            data = json.load(response)
    except HTTPError as error:
        reason = {429:'quota or rate limit reached', 403:'access denied; check permissions and billing',
                  404:'model unavailable', 400:'request rejected; check key and model configuration'}
        raise RuntimeError(f'{model}: HTTP {error.code}, {reason.get(error.code, "provider request failed")}.')
    except (URLError, TimeoutError):
        raise RuntimeError(f'Could not reach {model}. Check server network access.')
    return (data.get('candidates') or [{}])[0].get('content', {}).get('parts', [])


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def do_POST(self):
        if self.path != '/api/material':
            return self.send_error(404)
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 24000:
                raise ValueError('Request too large.')
            data = json.loads(self.rfile.read(size))
            target = data['target']
            prompt = data['prompt']
            if target not in ('floor','ceiling') or not isinstance(prompt,str) or not 0 < len(prompt.strip()) <= 1600:
                raise ValueError('Describe a floor or ceiling in 1–1600 characters.')
            context = str(data.get('previous',''))[:1800]
            def content(text):
                return [{'role':'user','parts':[{'text':text}]}]
            instruction = f'Help design a {target} texture. Previous design: {context}. User: {prompt}. Return JSON with reply (brief conversational response), name (short material name), and description (complete visual brief for image generation).'
            parts = generate(CHAT, content(instruction), {'responseMimeType':'application/json'})
            design = json.loads(''.join(p.get('text','') for p in parts))
            brief = 'One square seamless texture tile, matching opposite edges in both axes, flat orthographic view, full bleed, no text, no frame, no perspective. '+design['description']
            parts = generate(IMAGE,content(brief),{'responseModalities':['TEXT','IMAGE'],'imageConfig':{'aspectRatio':'1:1'}})
            img = next((p['inlineData'] for p in parts if p.get('inlineData',{}).get('mimeType') in ('image/png','image/jpeg','image/webp') and p['inlineData'].get('data')),None)
            if not img:
                raise RuntimeError('Nano Banana 2 returned no image. Try a different description.')
            result = dict(name=design['name'],reply=design['reply'],description=design['description'],image='data:'+img['mimeType']+';base64,'+img['data'])
            status = 200
        except (ValueError, TypeError, KeyError, RuntimeError) as error:
            status = 503 if isinstance(error,RuntimeError) else 400
            result = {'error':str(error)}
        raw = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8000'))),Handler).serve_forever()
