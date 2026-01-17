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

  const { token, entry_type, notes } = req.body;

  if (!token || !entry_type) {
    return res.status(400).json({ error: 'Token y entry_type requeridos' });
  }

  const validTypes = ['check_in', 'check_out', 'break_start', 'break_end'];
  if (!validTypes.includes(entry_type)) {
    return res.status(400).json({ error: 'Tipo de entrada inválido' });
  }

  try {
    // Buscar modelo
    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, name, studio_id')
      .eq('token', token)
      .single();

    if (modelError || !model) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Validar transición de estado
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: lastEntry } = await supabase
      .from('time_entries')
      .select('entry_type')
      .eq('model_id', model.id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const lastType = lastEntry?.entry_type || null;

    // Validaciones de transición
    const validTransitions = {
      null: ['check_in'],
      'check_in': ['break_start', 'check_out'],
      'break_start': ['break_end'],
      'break_end': ['break_start', 'check_out'],
      'check_out': ['check_in']
    };

    if (!validTransitions[lastType]?.includes(entry_type)) {
      return res.status(400).json({ 
        error: `No puedes hacer ${entry_type} después de ${lastType || 'nada'}`,
        current_state: lastType
      });
    }

    // Verificar límite de breaks
    if (entry_type === 'break_start') {
      const { data: settings } = await supabase
        .from('studio_settings')
        .select('max_breaks_per_shift')
        .eq('studio_id', model.studio_id)
        .single();

      const maxBreaks = settings?.max_breaks_per_shift || 3;

      const { count } = await supabase
        .from('time_entries')
        .select('*', { count: 'exact', head: true })
        .eq('model_id', model.id)
        .eq('entry_type', 'break_start')
        .gte('created_at', today.toISOString());

      if (count >= maxBreaks) {
        return res.status(400).json({ 
          error: `Límite de ${maxBreaks} breaks alcanzado hoy`
        });
      }
    }

    // Insertar entrada
    const { data: entry, error } = await supabase
      .from('time_entries')
      .insert({
        model_id: model.id,
        studio_id: model.studio_id,
        entry_type,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`⏰ ${model.name}: ${entry_type}`);

    return res.status(200).json({
      success: true,
      entry,
      message: getSuccessMessage(entry_type)
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

function getSuccessMessage(type) {
  const messages = {
    'check_in': '¡Turno iniciado! 💪',
    'check_out': '¡Turno terminado! 👋',
    'break_start': 'Break iniciado ☕',
    'break_end': '¡De vuelta! 🔥'
  };
  return messages[type] || 'Registrado';
}