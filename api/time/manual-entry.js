import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - Obtener registros de un día específico
  if (req.method === 'GET') {
    const { model_id, date } = req.query;

    if (!model_id || !date) {
      return res.status(400).json({ error: 'model_id y date requeridos' });
    }

    try {
      const dayStart = new Date(date + 'T00:00:00-05:00');
      const dayEnd = new Date(date + 'T23:59:59.999-05:00');

      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('model_id', model_id)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Extraer check_in, check_out y breaks
      let checkIn = null;
      let checkOut = null;
      const breaks = [];
      let currentBreak = null;

      (data || []).forEach(entry => {
        if (entry.entry_type === 'check_in') {
          checkIn = entry;
        } else if (entry.entry_type === 'check_out') {
          checkOut = entry;
        } else if (entry.entry_type === 'break_start') {
          currentBreak = { start: entry };
        } else if (entry.entry_type === 'break_end' && currentBreak) {
          currentBreak.end = entry;
          breaks.push(currentBreak);
          currentBreak = null;
        }
      });

      return res.status(200).json({
        success: true,
        entries: data,
        parsed: { checkIn, checkOut, breaks }
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - Crear/actualizar registros de un día completo
  if (req.method === 'POST') {
    const { model_id, studio_id, date, check_in, check_out, edited_reason } = req.body;

    if (!model_id || !studio_id || !date) {
      return res.status(400).json({ error: 'model_id, studio_id y date requeridos' });
    }

    try {
      // 1. Eliminar registros existentes de ese día
      const dayStart = new Date(date + 'T00:00:00-05:00');
      const dayEnd = new Date(date + 'T23:59:59.999-05:00');

      await supabase
        .from('time_entries')
        .delete()
        .eq('model_id', model_id)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      // 2. Crear nuevos registros
      const newEntries = [];

      if (check_in) {
        const checkInTime = new Date(date + 'T' + check_in + ':00-05:00');
        newEntries.push({
          model_id,
          studio_id,
          entry_type: 'check_in',
          created_at: checkInTime.toISOString(),
          notes: edited_reason ? `[Editado manual] ${edited_reason}` : '[Editado manual]'
        });
      }

      if (check_out) {
        const checkOutTime = new Date(date + 'T' + check_out + ':00-05:00');
        newEntries.push({
          model_id,
          studio_id,
          entry_type: 'check_out',
          created_at: checkOutTime.toISOString(),
          notes: edited_reason ? `[Editado manual] ${edited_reason}` : '[Editado manual]'
        });
      }

      if (newEntries.length > 0) {
        const { error } = await supabase
          .from('time_entries')
          .insert(newEntries);

        if (error) throw error;
      }

      console.log(`✏️ Registro manual: ${model_id} - ${date} - In: ${check_in} Out: ${check_out}`);

      return res.status(200).json({
        success: true,
        message: 'Registro actualizado correctamente',
        entries_created: newEntries.length
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE - Eliminar todos los registros de un día
  if (req.method === 'DELETE') {
    const { model_id, date } = req.body;

    if (!model_id || !date) {
      return res.status(400).json({ error: 'model_id y date requeridos' });
    }

    try {
      const dayStart = new Date(date + 'T00:00:00-05:00');
      const dayEnd = new Date(date + 'T23:59:59.999-05:00');

      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('model_id', model_id)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Registros eliminados'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}