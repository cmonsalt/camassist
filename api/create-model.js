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
    // 1. Obtener studio y verificar slots de trial
    const { data: studio, error: studioError } = await supabase
      .from('studios')
      .select('trial_models_created, role')
      .eq('id', studio_id)
      .single();

    if (studioError) throw studioError;

    const trialSlotsUsed = studio.trial_models_created || 0;
    const isSuperAdmin = studio.role === 'super_admin';
    const hasTrialSlots = trialSlotsUsed < 5;

    // 2. Generar token único
    const token = 'mdl_' + name.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substring(2, 10);

    // 3. Determinar si tiene trial o paga desde día 1
    let trialStarted = false;
    let trialEndsAt = null;

    if (!isSuperAdmin && !hasTrialSlots) {
      // Ya usó los 5 slots, esta modelo PAGA desde día 1
      trialStarted = true;
      trialEndsAt = new Date().toISOString();
    }

    // 4. Crear modelo
    const { data, error } = await supabase
      .from('models')
      .insert({
        studio_id,
        name,
        token,
        age: 24,
        location: 'Colombia',
        personality: 'extrovert_playful',
        emoji_level: 2,
        trial_started: trialStarted,
        trial_ends_at: trialEndsAt
      })
      .select()
      .single();

    if (error) throw error;

    // 5. Incrementar contador de slots usados (si no es super_admin)
    if (!isSuperAdmin) {
      await supabase
        .from('studios')
        .update({ trial_models_created: trialSlotsUsed + 1 })
        .eq('id', studio_id);
    }

    // 6. Respuesta con info de trial
    return res.json({
      success: true,
      model: data,
      trialInfo: {
        hasTrialSlots: hasTrialSlots,
        slotsUsed: trialSlotsUsed + 1,
        slotsRemaining: Math.max(0, 5 - (trialSlotsUsed + 1)),
        message: hasTrialSlots 
          ? `✅ Modelo creada con trial de 14 días. Te quedan ${4 - trialSlotsUsed} slots de trial.`
          : `⚠️ Ya usaste tus 5 trials. Esta modelo requiere pago desde el día 1.`
      }
    });

  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
}