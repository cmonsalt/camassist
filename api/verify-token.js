import { createClient } from '@supabase/supabase-js';

const supabase = process.env.SUPABASE_URL ? createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { token } = req.body;

  if (!token || !supabase) {
    return res.json({ success: false, message: 'Token requerido' });
  }

  try {
    const { data, error } = await supabase
      .from('models')
      .select('name')
      .eq('token', token)
      .single();

    if (error || !data) {
      return res.json({ success: false, message: 'Token no encontrado' });
    }

    return res.json({ success: true, model_name: data.name });
  } catch (error) {
    return res.json({ success: false, message: 'Error de servidor' });
  }
}