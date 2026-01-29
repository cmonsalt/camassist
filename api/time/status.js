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

      // Si está en break, calcular tiempo trabajado HASTA el inicio del break
      if (status === 'on_break' && checkInTime && currentBreakStart) {
        totalWorkedMs = currentBreakStart.getTime() - new Date(checkInTime).getTime() - totalBreakMs;
        // Agregar el break actual al total de breaks
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

    // Calcular balance del mes
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    // Obtener turno del modelo
    const { data: modelWithShift } = await supabase
      .from('models')
      .select('shift_id, shifts(hours)')
      .eq('id', model.id)
      .single();

    const expectedMinutesPerDay = modelWithShift?.shifts?.hours
      ? modelWithShift.shifts.hours * 60
      : (settings?.min_hours_daily || 6) * 60;

    // Obtener todas las entradas del mes
    const { data: monthEntries } = await supabase
      .from('time_entries')
      .select('*')
      .eq('model_id', model.id)
      .gte('created_at', firstDay + 'T00:00:00')
      .lte('created_at', todayStr + 'T23:59:59')
      .order('created_at', { ascending: true });

    // Agrupar por día y calcular
    const entriesByDay = {};
    (monthEntries || []).forEach(entry => {
      const day = entry.created_at.split('T')[0];
      if (!entriesByDay[day]) entriesByDay[day] = [];
      entriesByDay[day].push(entry);
    });

    let totalWorkedMonth = 0;
    let totalExpectedMonth = 0;

    Object.keys(entriesByDay).forEach(day => {
      const dayEntries = entriesByDay[day];
      const checkIn = dayEntries.find(e => e.entry_type === 'check_in');
      const checkOut = dayEntries.find(e => e.entry_type === 'check_out');

      if (checkIn) {
        totalExpectedMonth += expectedMinutesPerDay;

        let workedMs = 0;
        if (checkOut) {
          workedMs = new Date(checkOut.created_at) - new Date(checkIn.created_at);
        } else if (day === todayStr) {
          workedMs = Date.now() - new Date(checkIn.created_at).getTime();
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

        // Si hay break activo
        if (breakStart && day === todayStr) {
          breakMs += Date.now() - breakStart.getTime();
        }

        totalWorkedMonth += Math.floor(Math.max(0, workedMs - breakMs) / 60000);
      }
    });

    const balanceMinutes = totalWorkedMonth - totalExpectedMonth;

    return res.status(200).json({
      success: true,
      model: model.name,
      status,
      checkInTime,
      currentBreakStart: currentBreakStart ? currentBreakStart.toISOString() : null,
      totalWorkedMinutes: Math.floor(totalWorkedMs / 60000),
      totalBreakMinutes: Math.floor(totalBreakMs / 60000),
      breaksToday,
      settings: settings || {
        min_hours_daily: 6,
        max_break_minutes: 15,
        max_breaks_per_shift: 3
      },
      balanceMinutes  
    });
    

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}