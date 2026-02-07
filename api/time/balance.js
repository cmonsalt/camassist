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
    // Helper: convertir UTC a fecha Colombia (UTC-5)
    function toColombiaDate(utcString) {
      const date = new Date(utcString);
      // Restar 5 horas para Colombia
      date.setHours(date.getHours() - 5);
      return date.toISOString().split('T')[0];
    }

    // 1. Obtener configuración del studio
    const { data: settings } = await supabase
      .from('studio_settings')
      .select('*')
      .eq('studio_id', studio_id)
      .single();

    const defaultMinutes = (settings?.min_hours_daily || 6) * 60;
    const defaultWorkingDays = settings?.working_days || 'mon,tue,wed,thu,fri,sat';

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

    if (start_date) entriesQuery = entriesQuery.gte('created_at', start_date + 'T05:00:00Z');
    if (end_date) entriesQuery = entriesQuery.lte('created_at', end_date + 'T29:59:59Z');

    const { data: entries } = await entriesQuery;

    // 5. Obtener notas en el rango
    let notesQuery = supabase
      .from('day_notes')
      .select('*')
      .eq('studio_id', studio_id);

    if (start_date) notesQuery = notesQuery.gte('date', start_date);
    if (end_date) notesQuery = notesQuery.lte('date', end_date);

    const { data: notes } = await notesQuery;

    // Helper: verificar si un día es laboral
    function isWorkingDay(dateStr, workingDays) {
      const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(dateStr + 'T12:00:00').getDay()];
      return workingDays.split(',').includes(dayOfWeek);
    }

    // Helper: generar lista de fechas en el rango
    function getDateRange(start, end) {
      const dates = [];
      let current = new Date(start + 'T12:00:00');
      const endDate = new Date(end + 'T12:00:00');
      while (current <= endDate) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }

    // 6. Calcular balance por modelo
    const balances = models.map(model => {
      const modelShift = model.shift_id ? shiftsMap[model.shift_id] : null;
      
      const expectedMinutesPerDay = modelShift 
        ? modelShift.hours * 60 
        : defaultMinutes;
      const workingDays = modelShift?.working_days || defaultWorkingDays;

      // Filtrar entradas de este modelo
      const modelEntries = (entries || []).filter(e => e.model_id === model.id);
      
      if (modelEntries.length === 0) {
        return {
          model_id: model.id,
          model_name: model.name,
          shift_name: modelShift?.name || 'Default',
          expected_minutes: 0,
          worked_minutes: 0,
          balance_minutes: 0,
          days_worked: 0,
          status: 'ok'
        };
      }

      // Agrupar por día COLOMBIA
      const entriesByDay = {};
      modelEntries.forEach(entry => {
        const day = toColombiaDate(entry.created_at);
        if (!entriesByDay[day]) entriesByDay[day] = [];
        entriesByDay[day].push(entry);
      });

      // Encontrar el primer día con actividad
      const firstEntryDate = toColombiaDate(modelEntries[0].created_at);
      const effectiveStartDate = start_date > firstEntryDate ? start_date : firstEntryDate;

      let totalWorkedMinutes = 0;
      let totalExpectedMinutes = 0;
      let daysWorked = 0;

      const allDates = getDateRange(effectiveStartDate, end_date);

      allDates.forEach(day => {
        if (!isWorkingDay(day, workingDays)) {
          return;
        }

        const dayEntries = entriesByDay[day] || [];
        const checkIn = dayEntries.find(e => e.entry_type === 'check_in');
        const checkOut = dayEntries.find(e => e.entry_type === 'check_out');

        totalExpectedMinutes += expectedMinutesPerDay;

        if (checkIn) {
          daysWorked++;

          let workedMs = 0;
          if (checkOut) {
            workedMs = new Date(checkOut.created_at) - new Date(checkIn.created_at);
          } else {
            const now = new Date();
            const checkInDate = new Date(checkIn.created_at);
            const todayColombia = toColombiaDate(now.toISOString());
            if (day === todayColombia) {
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