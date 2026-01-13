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

  const { studio_id, model_id } = req.body;

  if (!studio_id || !model_id) {
    return res.json({ success: false, message: 'Faltan datos' });
  }

  try {
    // Verificar que la modelo pertenece al studio
    const { data: model, error: findError } = await supabase
      .from('models')
      .select('id, trial_ends_at')
      .eq('id', model_id)
      .eq('studio_id', studio_id)
      .single();

    if (findError || !model) {
      return res.json({ success: false, message: 'Modelo no encontrada' });
    }

    // Verificar si trial ya venció (no permitir eliminar si debe plata)
    if (model.trial_ends_at) {
      const trialEnds = new Date(model.trial_ends_at);
      const now = new Date();
      if (trialEnds < now) {
        return res.json({ 
          success: false, 
          message: 'No puedes eliminar una modelo con trial vencido. Contacta soporte.' 
        });
      }
    }

    // Soft delete
    const { error } = await supabase
      .from('models')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', model_id);

    if (error) throw error;

    return res.json({ success: true });

  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
}