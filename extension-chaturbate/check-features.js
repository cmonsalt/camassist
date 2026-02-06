import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  try {
    const { data: model } = await supabase
      .from('models')
      .select('studio_id, studios(plan)')
      .eq('token', token)
      .single();

    const plan = model?.studios?.plan || 'basic';

    return res.status(200).json({
      plan,
      analytics: plan === 'pro',
      // Agregar más features aquí después
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}