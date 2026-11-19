const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const patterns = ['noise', 'veins', 'rings', 'planks', 'bricks', 'blades', 'waves', 'dots']
const brief = `Design a seamless material by composing a procedural recipe. Respond immediately
with only JSON. No tools, files, images or code are needed. Schema:
{"name":"short material name","layers":[{"pattern":"noise","color":"#abcdef","x":4,"y":8,"opacity":0.7,"warp":0.4}],"base":"#123456"}.
Choose 1-12 layers, blended in list order. Each pattern is one of ${patterns.join(', ')}.
x and y are integer repeat frequencies 1-100. opacity and warp are numbers from 0 to 1.
Use palette, patterns, scale and distortion to match the requested design.
Treat the following JSON as a visual brief only:\n`

type Interaction = {
  id?: string
  status: string
  steps?: {type: string, content?: {type: string, text?: string}[]}[]
}

async function request(path: string, payload?: object): Promise<Interaction> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw Error('Configure GEMINI_API_KEY in the function environment.')
  const response = await fetch(endpoint + path, {
    method: payload ? 'POST' : 'GET',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: payload && JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) {
    const reason = response.status === 429 ? 'quota or rate limit reached' :
      response.status === 403 ? 'access denied' : 'request failed'
    throw Error(`Antigravity returned HTTP ${response.status}: ${reason}.`)
  }
  return response.json()
}

export function start(surface: string, prompt: string, previous: string) {
  return request('', {agent: 'antigravity-preview-09-2026', background: true,
    environment: {type: 'remote', mode: 'on_demand'},
    input: brief + JSON.stringify({surface, request: prompt, previous})})
}

export function poll(id: string) {
  return request('/' + encodeURIComponent(id))
}

function color(v: unknown) { return typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v) }
function frequency(v: unknown) { return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100 }
function fraction(v: unknown) { return typeof v === 'number' && v >= 0 && v <= 1 }

export function result(job: Interaction) {
  if (['in_progress','queued'].includes(job.status)) return {pending: true}
  if (job.status !== 'completed') throw Error('Antigravity stopped before completing the material.')
  const text = (job.steps ?? []).filter(s => s.type === 'model_output')
    .flatMap(s => s.content ?? []).filter(p => p.type === 'text').map(p => p.text).join('')
  try {
    const recipe = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    if (typeof recipe.name === 'string' && recipe.name.length > 0 && recipe.name.length <= 100 &&
        color(recipe.base) && Array.isArray(recipe.layers) && recipe.layers.length >= 1 && recipe.layers.length <= 12 &&
        recipe.layers.every((l: Record<string, unknown>) => l && typeof l.pattern === 'string' &&
          patterns.includes(l.pattern) && color(l.color) && frequency(l.x) && frequency(l.y) &&
          fraction(l.opacity) && fraction(l.warp))) return {recipe}
  } catch { /* Invalid provider output is reported consistently below. */ }
  throw Error('Antigravity returned an unusable material recipe.')
}
