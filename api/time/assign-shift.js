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

  if (req.method === 'POST') {
    const { model_id, shift_id } = req.body;

    if (!model_id) {
      return res.status(400).json({ error: 'model_id requerido' });
    }

    try {
      const { data, error } = await supabase
        .from('models')
        .update({ shift_id: shift_id || null })
        .eq('id', model_id)
        .select('id, name, shift_id')
        .single();

      if (error) throw error;

      console.log(`📋 Turno asignado: modelo ${data.name} -> shift ${shift_id}`);

      return res.status(200).json({ 
        success: true, 
        model: data,
        message: shift_id ? 'Turno asignado' : 'Turno removido'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}