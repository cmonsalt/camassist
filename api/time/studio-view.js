import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const studio_id = req.query.studio_id || req.body?.studio_id;
  const date = req.query.date || req.body?.date || new Date().toISOString().split('T')[0];

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

    const studioSettings = settings || {
      min_hours_daily: 6,
      max_break_minutes: 15,
      max_breaks_per_shift: 3,
      working_days: 'mon,tue,wed,thu,fri,sat',
      platforms: ['chaturbate', 'stripchat'],
      track_followers: true
    };

    // 2. Obtener todas las modelos del studio
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('id, name, token, shift_id, shifts(id, name, hours)')
      .eq('studio_id', studio_id)
      .is('deleted_at', null)
      .order('name');

    if (modelsError) throw modelsError;

    // 3. Obtener entradas de tiempo del DÍA SELECCIONADO
    // Calcular inicio y fin del día en Colombia (UTC-5)
    const dateStart = new Date(date + 'T00:00:00-05:00'); // Medianoche Colombia
    const dateEnd = new Date(date + 'T23:59:59.999-05:00'); // Fin del día Colombia

    const { data: allEntries } = await supabase
      .from('time_entries')
      .select('*')
      .eq('studio_id', studio_id)
      .gte('created_at', dateStart.toISOString())
      .lte('created_at', dateEnd.toISOString())
      .order('created_at', { ascending: true });

    // 4. Obtener ganancias de HOY
    const { data: allEarnings } = await supabase
      .from('daily_earnings')
      .select('*')
      .eq('studio_id', studio_id)
      .eq('date', date);

    // 5. Obtener notas de HOY
    const { data: allNotes } = await supabase
      .from('day_notes')
      .select('*')
      .eq('studio_id', studio_id)
      .eq('date', date);

    // 6. Procesar cada modelo
    const modelsData = await Promise.all(models.map(async (model) => {
      // Filtrar entradas de este modelo en el día seleccionado
      const entries = (allEntries || []).filter(e => e.model_id === model.id);

      // Calcular estado y tiempo
      let status = 'offline';
      let checkInTime = null;
      let checkOutTime = null;
      let totalWorkedMs = 0;
      let totalBreakMs = 0;
      let currentBreakStart = null;
      let breaksCount = 0;

      for (const entry of entries) {
        if (entry.entry_type === 'check_in') {
          status = 'working';
          checkInTime = entry.created_at;
        } else if (entry.entry_type === 'check_out') {
          status = 'offline';
          checkOutTime = entry.created_at;
        } else if (entry.entry_type === 'break_start') {
          status = 'on_break';
          currentBreakStart = new Date(entry.created_at);
          breaksCount++;
        } else if (entry.entry_type === 'break_end') {
          status = 'working';
          if (currentBreakStart) {
            totalBreakMs += new Date(entry.created_at) - currentBreakStart;
            currentBreakStart = null;
          }
        }
      }

      // === TURNO NOCTURNO: Si hay check_out pero NO check_in ===
      // Significa que el turno empezó ayer - ignorar este día
      if (checkOutTime && !checkInTime) {
        return {
          id: model.id,
          name: model.name,
          token: model.token,
          shift: model.shifts,
          status: 'offline',
          checkInTime: null,
          checkOutTime: null,
          totalWorkedMinutes: 0,
          totalBreakMinutes: 0,
          breaksCount: 0,
          minutesPending: 0,
          breakExcessMinutes: 0,
          compliance: 'night_shift_continued', // Marcador especial
          earnings: [],
          note: null
        };
      }

      // === TURNO NOCTURNO: Si hay check_in pero NO check_out ===
      // Buscar si hay check_out al día siguiente (antes de las 12pm)
      if (checkInTime && !checkOutTime) {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        const nextDayStart = new Date(nextDayStr + 'T00:00:00-05:00');
        const nextDayNoon = new Date(nextDayStr + 'T12:00:00-05:00'); // Hasta mediodía

        const { data: nextDayEntries } = await supabase
          .from('time_entries')
          .select('*')
          .eq('model_id', model.id)
          .gte('created_at', nextDayStart.toISOString())
          .lte('created_at', nextDayNoon.toISOString())
          .order('created_at', { ascending: true });

        // Buscar check_out del día siguiente
        const nextDayCheckOut = (nextDayEntries || []).find(e => e.entry_type === 'check_out');

        if (nextDayCheckOut) {
          checkOutTime = nextDayCheckOut.created_at;
          status = 'offline';

          // También procesar breaks del día siguiente
          (nextDayEntries || []).forEach(entry => {
            if (entry.entry_type === 'break_start') {
              currentBreakStart = new Date(entry.created_at);
              breaksCount++;
            } else if (entry.entry_type === 'break_end' && currentBreakStart) {
              totalBreakMs += new Date(entry.created_at) - currentBreakStart;
              currentBreakStart = null;
            }
          });
        }
      }

      // Calcular tiempo trabajado
      if (checkInTime) {
        const endTime = checkOutTime ? new Date(checkOutTime) : new Date();
        const startTime = new Date(checkInTime);
        totalWorkedMs = endTime - startTime - totalBreakMs;

        // Si está en break, restar el break actual
        if (status === 'on_break' && currentBreakStart) {
          totalBreakMs += Date.now() - currentBreakStart.getTime();
        }
      }

      const totalWorkedMinutes = Math.floor(totalWorkedMs / 60000);
      const totalBreakMinutes = Math.floor(totalBreakMs / 60000);

      // Usar turno del modelo o default del studio
      const modelShift = model.shifts;
      const minMinutesRequired = modelShift?.hours
        ? modelShift.hours * 60
        : studioSettings.min_hours_daily * 60;

      // Calcular exceso de break
      const maxBreakMinutes = studioSettings.max_break_minutes || 15;
      const breakExcessMinutes = Math.max(0, totalBreakMinutes - maxBreakMinutes);
      const effectiveBreakMinutes = Math.min(totalBreakMinutes, maxBreakMinutes);

      // Tiempo para cumplimiento = trabajado + break permitido
      const totalShiftMinutes = totalWorkedMinutes + effectiveBreakMinutes;
      const minutesPending = Math.max(0, minMinutesRequired - totalShiftMinutes);
      const compliance = totalShiftMinutes >= minMinutesRequired ? 'complete' : 'pending';

      // Ganancias del día
      const modelEarnings = (allEarnings || []).filter(e => e.model_id === model.id);

      // Nota del día
      const modelNote = (allNotes || []).find(n => n.model_id === model.id);

      return {
        id: model.id,
        name: model.name,
        token: model.token,
        shift: modelShift,
        status,
        checkInTime,
        checkOutTime,
        totalWorkedMinutes,
        totalBreakMinutes,
        breaksCount,
        minutesPending,
        breakExcessMinutes,
        compliance,
        earnings: modelEarnings,
        note: modelNote
      };
    }));

    // 7. Resumen general
    const summary = {
      totalModels: models.length,
      online: modelsData.filter(m => m.status === 'working').length,
      onBreak: modelsData.filter(m => m.status === 'on_break').length,
      offline: modelsData.filter(m => m.status === 'offline').length,
      cumpliendo: modelsData.filter(m => m.compliance === 'CUMPLE').length,
      noCumpliendo: modelsData.filter(m => m.compliance === 'NO CUMPLE').length,
      totalEarnings: modelsData.reduce((sum, m) => sum + (m.totalEarnings || 0), 0)
    };

    return res.status(200).json({
      success: true,
      date,
      settings: studioSettings,
      summary,
      models: modelsData
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
