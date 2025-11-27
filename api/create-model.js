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

  const { studio_id, name } = req.body;

  if (!studio_id || !name) {
    return res.json({ success: false, message: 'Faltan datos' });
  }

  try {
    // Generar token único
    const token = 'mdl_' + name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);

    // Crear modelo
    const { data, error } = await supabase
      .from('models')
      .insert({
        studio_id,
        name,
        token,
        age: 24,
        location: 'Colombia',
        personality: 'extrovert_playful',
        emoji_level: 2
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      model: data
    });

  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
}