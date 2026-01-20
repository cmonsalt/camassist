import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Mapeo de plataformas a monedas
const PLATFORM_CURRENCY = {
  chaturbate: 'tokens',
  stripchat: 'tokens',
  xmodels: 'credits',
  streamate: 'gold',
  flirt4free: 'credits',
  cam4: 'gold',
  livejasmin: 'credits',
  bongacams: 'tokens',
  myfreecams: 'tokens'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - Obtener ganancias de un modelo/fecha
  if (req.method === 'GET') {
    const { model_id, date, studio_id } = req.query;

    try {
      let query = supabase.from('daily_earnings').select('*');

      if (model_id) query = query.eq('model_id', model_id);
      if (studio_id) query = query.eq('studio_id', studio_id);
      if (date) query = query.eq('date', date);

      query = query.order('date', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json({ success: true, earnings: data });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - Guardar ganancias
  if (req.method === 'POST') {
    const { model_id, studio_id, date, platform, earnings, followers_start, followers_end, notes } = req.body;

    if (!model_id || !studio_id || !date || !platform) {
      return res.status(400).json({ error: 'Faltan campos requeridos: model_id, studio_id, date, platform' });
    }

    try {
      // Auto-detectar moneda según plataforma
      const currency_type = PLATFORM_CURRENCY[platform.toLowerCase()] || 'tokens';

      // Upsert (insertar o actualizar si ya existe)
      const { data, error } = await supabase
        .from('daily_earnings')
        .upsert({
          model_id,
          studio_id,
          date,
          platform: platform.toLowerCase(),
          earnings: earnings || 0,
          currency_type,
          followers_start: followers_start || 0,
          followers_end: followers_end || 0,
          notes: notes || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'model_id,date,platform'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`💰 Ganancias guardadas: ${model_id} - ${platform} - ${earnings} ${currency_type}`);

      return res.status(200).json({
        success: true,
        earning: data,
        message: `Guardado: ${earnings} ${currency_type} en ${platform}`
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
