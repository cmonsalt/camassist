import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Tipos de notas válidos
const VALID_NOTE_TYPES = [
  'day_off',      // Día libre (domingo)
  'holiday',      // Festivo (navidad, integración, etc.)
  'medical',      // Motivo médico
  'permission',   // Permiso personal
  'late',         // Llegó tarde
  'early_leave',  // Se fue temprano
  'absent',       // Inasistencia
  'other'         // Otro
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - Obtener notas
  if (req.method === 'GET') {
    const { model_id, studio_id, date, start_date, end_date } = req.query;

    try {
      let query = supabase.from('day_notes').select('*, models(name)');

      if (model_id) query = query.eq('model_id', model_id);
      if (studio_id) query = query.eq('studio_id', studio_id);
      if (date) query = query.eq('date', date);
      if (start_date) query = query.gte('date', start_date);
      if (end_date) query = query.lte('date', end_date);

      query = query.order('date', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json({ success: true, notes: data });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - Guardar nota
  if (req.method === 'POST') {
    const { model_id, studio_id, date, note_type, note } = req.body;

    if (!model_id || !studio_id || !date || !note_type) {
      return res.status(400).json({ error: 'Faltan campos requeridos: model_id, studio_id, date, note_type' });
    }

    if (!VALID_NOTE_TYPES.includes(note_type)) {
      return res.status(400).json({ 
        error: `Tipo de nota inválido. Válidos: ${VALID_NOTE_TYPES.join(', ')}` 
      });
    }

    try {
      // Upsert (insertar o actualizar si ya existe)
      const { data, error } = await supabase
        .from('day_notes')
        .upsert({
          model_id,
          studio_id,
          date,
          note_type,
          note: note || null
        }, {
          onConflict: 'model_id,date'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`📝 Nota guardada: ${model_id} - ${date} - ${note_type}`);

      return res.status(200).json({
        success: true,
        day_note: data,
        message: `Nota guardada para ${date}`
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE - Eliminar nota
  if (req.method === 'DELETE') {
    const { model_id, date } = req.body;

    if (!model_id || !date) {
      return res.status(400).json({ error: 'Faltan campos: model_id, date' });
    }

    try {
      const { error } = await supabase
        .from('day_notes')
        .delete()
        .eq('model_id', model_id)
        .eq('date', date);

      if (error) throw error;

      return res.status(200).json({ success: true, message: 'Nota eliminada' });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
