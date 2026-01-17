import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token requerido' });
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

    // Buscar última entrada de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: entries } = await supabase
      .from('time_entries')
      .select('*')
      .eq('model_id', model.id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true });

    // Calcular estado actual
    let status = 'offline'; // offline, working, on_break
    let checkInTime = null;
    let totalWorkedMs = 0;
    let totalBreakMs = 0;
    let currentBreakStart = null;

    if (entries && entries.length > 0) {
      for (const entry of entries) {
        if (entry.entry_type === 'check_in') {
          status = 'working';
          checkInTime = entry.created_at;
        } else if (entry.entry_type === 'check_out') {
          status = 'offline';
        } else if (entry.entry_type === 'break_start') {
          status = 'on_break';
          currentBreakStart = new Date(entry.created_at);
        } else if (entry.entry_type === 'break_end') {
          status = 'working';
          if (currentBreakStart) {
            totalBreakMs += new Date(entry.created_at) - currentBreakStart;
            currentBreakStart = null;
          }
        }
      }

      // Si está trabajando, calcular tiempo actual
      if (status === 'working' && checkInTime) {
        totalWorkedMs = Date.now() - new Date(checkInTime).getTime() - totalBreakMs;
      }

      // Si está en break, agregar break actual
      if (status === 'on_break' && currentBreakStart) {
        totalBreakMs += Date.now() - currentBreakStart.getTime();
      }
    }

    // Contar breaks de hoy
    const breaksToday = entries ? entries.filter(e => e.entry_type === 'break_start').length : 0;

    // Obtener settings del studio
    const { data: settings } = await supabase
      .from('studio_settings')
      .select('*')
      .eq('studio_id', model.studio_id)
      .single();

    return res.status(200).json({
      success: true,
      model: model.name,
      status,
      checkInTime,
      totalWorkedMinutes: Math.floor(totalWorkedMs / 60000),
      totalBreakMinutes: Math.floor(totalBreakMs / 60000),
      breaksToday,
      settings: settings || {
        min_hours_daily: 6,
        max_break_minutes: 15,
        max_breaks_per_shift: 3
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}