export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { email } = req.query;
  if (!email) return res.status(400).json({ plan: 'free', error: 'email required' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ plan: 'free' });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=plan`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) throw new Error(`Supabase error ${response.status}`);
    const data = await response.json();
    const plan = data?.[0]?.plan || 'free';
    return res.status(200).json({ plan });

  } catch (err) {
    console.error('user-plan error:', err);
    return res.status(200).json({ plan: 'free' });
  }
}
