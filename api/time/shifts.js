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

  // GET - Listar turnos del studio
  if (req.method === 'GET') {
    const { studio_id } = req.query;

    if (!studio_id) {
      return res.status(400).json({ error: 'studio_id requerido' });
    }

    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('studio_id', studio_id)
        .order('hours', { ascending: true });

      if (error) throw error;

      return res.status(200).json({ success: true, shifts: data });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - Crear turno
  if (req.method === 'POST') {
    const { studio_id, name, hours } = req.body;

    if (!studio_id || !name || !hours) {
      return res.status(400).json({ error: 'Faltan campos: studio_id, name, hours' });
    }

    if (hours <= 0 || hours > 24) {
      return res.status(400).json({ error: 'Las horas deben ser entre 1 y 24' });
    }

    try {
      const { data, error } = await supabase
        .from('shifts')
        .insert({ studio_id, name, hours })
        .select()
        .single();

      if (error) throw error;

      console.log(`📋 Turno creado: ${name} - ${hours}h`);

      return res.status(200).json({ 
        success: true, 
        shift: data,
        message: `Turno "${name}" creado`
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT - Actualizar turno
  if (req.method === 'PUT') {
    const { id, name, hours } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id requerido' });
    }

    try {
      const updates = {};
      if (name) updates.name = name;
      if (hours) updates.hours = hours;

      const { data, error } = await supabase
        .from('shifts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ 
        success: true, 
        shift: data,
        message: 'Turno actualizado'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE - Eliminar turno
  if (req.method === 'DELETE') {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id requerido' });
    }

    try {
      // Primero quitar el turno de las modelos que lo tengan
      await supabase
        .from('models')
        .update({ shift_id: null })
        .eq('shift_id', id);

      // Luego eliminar el turno
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ 
        success: true, 
        message: 'Turno eliminado'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}