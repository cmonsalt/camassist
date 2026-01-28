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

  const { studio_id, start_date, end_date } = req.query;

  if (!studio_id) {
    return res.status(400).json({ error: 'studio_id requerido' });
  }

  try {
    // 1. Obtener configuración del studio
    const { data: settings } = await supabase
      .from('studio_settings')
      .select('*')
      .eq('studio_id', studio_id)
      .single();

    const defaultMinutes = (settings?.min_hours_daily || 6) * 60;

    // 2. Obtener modelos
    const { data: models } = await supabase
      .from('models')
      .select('id, name, shift_id')
      .eq('studio_id', studio_id)
      .is('deleted_at', null);

    // 3. Obtener todos los turnos del studio
    const { data: shifts } = await supabase
      .from('shifts')
      .select('id, name, hours, working_days')
      .eq('studio_id', studio_id);

    // Crear mapa de turnos para acceso rápido
    const shiftsMap = {};
    (shifts || []).forEach(s => {
      shiftsMap[s.id] = s;
    });

    // 4. Obtener todas las entradas de tiempo en el rango
    let entriesQuery = supabase
      .from('time_entries')
      .select('*')
      .eq('studio_id', studio_id)
      .order('created_at', { ascending: true });

    if (start_date) entriesQuery = entriesQuery.gte('created_at', start_date + 'T00:00:00');
    if (end_date) entriesQuery = entriesQuery.lte('created_at', end_date + 'T23:59:59');

    const { data: entries } = await entriesQuery;

    // 5. Obtener notas en el rango
    let notesQuery = supabase
      .from('day_notes')
      .select('*')
      .eq('studio_id', studio_id);

    if (start_date) notesQuery = notesQuery.gte('date', start_date);
    if (end_date) notesQuery = notesQuery.lte('date', end_date);

    const { data: notes } = await notesQuery;

    // 6. Calcular balance por modelo
    const balances = models.map(model => {
      // Obtener turno del modelo (si tiene)
      const modelShift = model.shift_id ? shiftsMap[model.shift_id] : null;
      
      // Minutos esperados por día para este modelo
      const expectedMinutesPerDay = modelShift 
        ? modelShift.hours * 60 
        : defaultMinutes;

      // Filtrar entradas de este modelo
      const modelEntries = (entries || []).filter(e => e.model_id === model.id);
      
      // Agrupar por día
      const entriesByDay = {};
      modelEntries.forEach(entry => {
        const day = entry.created_at.split('T')[0];
        if (!entriesByDay[day]) entriesByDay[day] = [];
        entriesByDay[day].push(entry);
      });

      // Calcular minutos trabajados por día
      let totalWorkedMinutes = 0;
      let totalExpectedMinutes = 0;
      let daysWorked = 0;

      Object.keys(entriesByDay).forEach(day => {
        const dayEntries = entriesByDay[day];
        
        // Buscar check_in y check_out
        const checkIn = dayEntries.find(e => e.entry_type === 'check_in');
        const checkOut = dayEntries.find(e => e.entry_type === 'check_out');
        
        if (checkIn) {
          daysWorked++;
          totalExpectedMinutes += expectedMinutesPerDay;

          // Calcular tiempo trabajado
          let workedMs = 0;
          if (checkOut) {
            workedMs = new Date(checkOut.created_at) - new Date(checkIn.created_at);
          } else {
            // Si no hay check_out, calcular hasta ahora (o fin del día)
            const now = new Date();
            const checkInDate = new Date(checkIn.created_at);
            if (checkInDate.toDateString() === now.toDateString()) {
              workedMs = now - checkInDate;
            }
          }

          // Restar breaks
          let breakMs = 0;
          let breakStart = null;
          dayEntries.forEach(entry => {
            if (entry.entry_type === 'break_start') {
              breakStart = new Date(entry.created_at);
            } else if (entry.entry_type === 'break_end' && breakStart) {
              breakMs += new Date(entry.created_at) - breakStart;
              breakStart = null;
            }
          });

          const netWorkedMs = Math.max(0, workedMs - breakMs);
          totalWorkedMinutes += Math.floor(netWorkedMs / 60000);
        }
      });

      // Agregar deuda de notas con must_recover = true
      const modelNotes = (notes || []).filter(n => n.model_id === model.id && n.must_recover === true);
      modelNotes.forEach(note => {
        // Solo si no trabajó ese día
        if (!entriesByDay[note.date]) {
          totalExpectedMinutes += expectedMinutesPerDay;
        }
      });

      const balanceMinutes = totalWorkedMinutes - totalExpectedMinutes;

      return {
        model_id: model.id,
        model_name: model.name,
        shift_name: modelShift?.name || 'Default',
        expected_minutes: totalExpectedMinutes,
        worked_minutes: totalWorkedMinutes,
        balance_minutes: balanceMinutes,
        days_worked: daysWorked,
        status: balanceMinutes >= 0 ? 'ok' : balanceMinutes >= -180 ? 'warning' : 'danger'
      };
    });

    return res.status(200).json({
      success: true,
      balances,
      period: { start_date, end_date }
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}