import secrets
import threading
import time
import procedural_agent
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PUBLIC = Path(__file__).resolve().parent / 'public'
# Only expose interactions created by this server, through random local handles.
jobs = {}
job_lock = threading.Lock()


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
            interaction = procedural_agent.start(target, prompt, context)
            result = procedural_agent.result(interaction)
            if result.get('pending'):
                token = secrets.token_urlsafe(24)
                now = time.monotonic()
                with job_lock:
                    for old in [key for key, (_, expires) in jobs.items() if expires <= now]:
                        del jobs[old]
                    jobs[token] = (interaction['id'], now + 3600)
                result['job'] = token
            status = 200
        except (ValueError, TypeError, KeyError, RuntimeError) as error:
            status = 503 if isinstance(error,RuntimeError) else 400
            result = {'error':str(error)}
        self.send_json(status, result)

    def do_GET(self):
        if not self.path.startswith('/api/material/'):
            return super().do_GET()
        with job_lock:
            entry = jobs.get(self.path.split('/')[-1])
        if not entry or entry[1] <= time.monotonic():
            return self.send_json(404, {'error':'Material request expired. Please try again.'})
        try:
            self.send_json(200, procedural_agent.poll(entry[0]))
        except RuntimeError as error:
            self.send_json(503, {'error':str(error)})

    def send_json(self, status, result):
        raw = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8000'))),Handler).serve_forever()
