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
    // 1. Verificar que la modelo pertenece al studio
    const { data: model, error: findError } = await supabase
      .from('models')
      .select('id, name, trial_ends_at, chaturbate_username, stripchat_username, streamate_username, xmodels_username')
      .eq('id', model_id)
      .eq('studio_id', studio_id)
      .is('deleted_at', null)
      .single();

    if (findError || !model) {
      return res.json({ success: false, message: 'Modelo no encontrada' });
    }

    // 2. Verificar si está en trial
    const ahora = new Date();
    const trialEnds = model.trial_ends_at ? new Date(model.trial_ends_at) : null;
    const enTrial = !trialEnds || trialEnds > ahora;

    if (!enTrial) {
      return res.json({ 
        success: false, 
        message: 'Esta modelo ya no está en trial. Contacta soporte para eliminarla.' 
      });
    }

    // 3. Verificar si usó la IA
    const { count, error: countError } = await supabase
      .from('usage')
      .select('*', { count: 'exact', head: true })
      .eq('model_id', model_id);

    const usoIA = count > 0;

    // 4. Soft delete
    const updateData = { 
      deleted_at: new Date().toISOString() 
    };

    // 5. Si NO usó IA, liberar usernames para que puedan recrear
    if (!usoIA) {
      updateData.chaturbate_username = null;
      updateData.stripchat_username = null;
      updateData.streamate_username = null;
      updateData.xmodels_username = null;
    }

    const { error } = await supabase
      .from('models')
      .update(updateData)
      .eq('id', model_id);

    if (error) throw error;

    console.log(`🗑️ Modelo eliminada: ${model.name} | Usó IA: ${usoIA} | Usernames ${usoIA ? 'quemados' : 'liberados'}`);

    return res.json({ 
      success: true,
      message: usoIA 
        ? 'Modelo eliminada. El username no se puede volver a usar.'
        : 'Modelo eliminada. Puedes volver a usar el username.'
    });

  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
}