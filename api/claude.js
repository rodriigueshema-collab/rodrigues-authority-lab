const rateLimitMap = new Map();

export default async function handler(req, res) {
  // Rate limiting - 10 requests per minute per IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60000) { entry.count = 0; entry.start = now; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > 10) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'API key not configured. Please add ANTHROPIC_API_KEY to Vercel environment variables.' });
  }

  try {
    const { prompt, system, max_tokens = 1000 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages: [{ role: 'user', content: prompt }]
    };
    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Claude API error' });
    }

    const text = data.content?.map(b => b.text || '').join('').trim() || '';
    return res.status(200).json({ text });

  } catch (err) {
    console.error('Claude API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
