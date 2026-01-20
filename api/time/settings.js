import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Plataformas disponibles con su moneda
const AVAILABLE_PLATFORMS = [
  { id: 'chaturbate', name: 'Chaturbate', currency: 'tokens' },
  { id: 'stripchat', name: 'Stripchat', currency: 'tokens' },
  { id: 'xmodels', name: 'XModels', currency: 'credits' },
  { id: 'streamate', name: 'Streamate', currency: 'gold' },
  { id: 'flirt4free', name: 'Flirt4Free', currency: 'credits' },
  { id: 'cam4', name: 'Cam4', currency: 'gold' },
  { id: 'livejasmin', name: 'LiveJasmin', currency: 'credits' },
  { id: 'bongacams', name: 'BongaCams', currency: 'tokens' },
  { id: 'myfreecams', name: 'MyFreeCams', currency: 'tokens' }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - Obtener configuración
  if (req.method === 'GET') {
    const { studio_id } = req.query;

    if (!studio_id) {
      return res.status(400).json({ error: 'studio_id requerido' });
    }

    try {
      const { data, error } = await supabase
        .from('studio_settings')
        .select('*')
        .eq('studio_id', studio_id)
        .single();

      // Si no existe, devolver valores por defecto
      const settings = data || {
        studio_id,
        min_hours_daily: 6,
        max_break_minutes: 15,
        max_breaks_per_shift: 3,
        working_days: 'mon,tue,wed,thu,fri,sat',
        platforms: ['chaturbate', 'stripchat'],
        track_followers: true,
        timezone: 'America/Bogota'
      };

      return res.status(200).json({
        success: true,
        settings,
        available_platforms: AVAILABLE_PLATFORMS
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - Guardar configuración
  if (req.method === 'POST') {
    const { 
      studio_id,
      min_hours_daily,
      max_break_minutes,
      max_breaks_per_shift,
      working_days,
      platforms,
      track_followers,
      timezone
    } = req.body;

    if (!studio_id) {
      return res.status(400).json({ error: 'studio_id requerido' });
    }

    try {
      // Upsert (crear o actualizar)
      const { data, error } = await supabase
        .from('studio_settings')
        .upsert({
          studio_id,
          min_hours_daily: min_hours_daily ?? 6,
          max_break_minutes: max_break_minutes ?? 15,
          max_breaks_per_shift: max_breaks_per_shift ?? 3,
          working_days: working_days ?? 'mon,tue,wed,thu,fri,sat',
          platforms: platforms ?? ['chaturbate', 'stripchat'],
          track_followers: track_followers ?? true,
          timezone: timezone ?? 'America/Bogota',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'studio_id'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`⚙️ Settings guardados para studio: ${studio_id}`);

      return res.status(200).json({
        success: true,
        settings: data,
        message: 'Configuración guardada'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
