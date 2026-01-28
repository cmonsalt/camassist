import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { studio_id } = req.body;

  if (!studio_id) {
    return res.json({ success: false, message: 'Falta studio_id' });
  }

  try {
    const { data, error } = await supabase
      .from('models')
      .select('*, shifts(id, name, hours)')
      .eq('studio_id', studio_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({
      success: true,
      models: data || []
    });

  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
}