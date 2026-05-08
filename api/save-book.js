export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: 'Not configured' });

  if (req.method === 'POST') {
    // Save book
    const { email, book } = req.body;
    if (!email || !book) return res.status(400).json({ error: 'email and book required' });

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/books`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          user_email: email,
          title: book.title,
          data: book,
          updated_at: new Date().toISOString()
        })
      });
      if (!response.ok) throw new Error(`Supabase error ${response.status}`);
      return res.status(200).json({ saved: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    // Load book
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/books?user_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=1`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
      const data = await response.json();
      return res.status(200).json({ book: data?.[0]?.data || null });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
