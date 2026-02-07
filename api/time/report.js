import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper: convertir UTC a fecha Colombia (UTC-5)
function toColombiaDate(utcString) {
  const date = new Date(utcString);
  date.setHours(date.getHours() - 5);
  return date.toISOString().split('T')[0];
}

// Helper: verificar si un día es laboral
function isWorkingDay(dateStr, workingDays) {
  const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(dateStr + 'T12:00:00').getDay()];
  return workingDays.split(',').includes(dayOfWeek);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const studio_id = req.query.studio_id || req.body?.studio_id;
  const fecha_inicio = req.query.fecha_inicio || req.body?.fecha_inicio;
  const fecha_fin = req.query.fecha_fin || req.body?.fecha_fin;

  if (!studio_id || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'studio_id, fecha_inicio y fecha_fin son requeridos' });
  }

  try {
    // 1. Obtener info del studio
    const { data: studio } = await supabase
      .from('studios')
      .select('name')
      .eq('id', studio_id)
      .single();

    // 2. Obtener configuración del studio
    const { data: settings } = await supabase
      .from('studio_settings')
      .select('*')
      .eq('studio_id', studio_id)
      .single();

    const studioSettings = settings || {
      min_hours_daily: 6,
      max_break_minutes: 15,
      working_days: 'mon,tue,wed,thu,fri,sat'
    };

    const defaultMinutes = studioSettings.min_hours_daily * 60;
    const defaultWorkingDays = studioSettings.working_days || 'mon,tue,wed,thu,fri,sat';

    // 3. Obtener modelos del studio (con shift_id)
    const { data: models } = await supabase
      .from('models')
      .select('id, name, shift_id')
      .eq('studio_id', studio_id)
      .is('deleted_at', null)
      .order('name');

    // 4. Obtener todos los turnos del studio
    const { data: shifts } = await supabase
      .from('shifts')
      .select('id, name, hours, working_days')
      .eq('studio_id', studio_id);

    // Crear mapa de turnos para acceso rápido
    const shiftsMap = {};
    (shifts || []).forEach(s => {
      shiftsMap[s.id] = s;
    });

    // 5. Obtener todas las entradas del rango de fechas (ajustado para Colombia)
    const { data: allEntries } = await supabase
      .from('time_entries')
      .select('*')
      .eq('studio_id', studio_id)
      .gte('created_at', fecha_inicio + 'T05:00:00Z')
      .lte('created_at', fecha_fin + 'T04:59:59Z')
      .order('created_at', { ascending: true });

    // 6. Obtener ganancias del rango
    const { data: allEarnings } = await supabase
      .from('daily_earnings')
      .select('*')
      .eq('studio_id', studio_id)
      .gte('date', fecha_inicio)
      .lte('date', fecha_fin);

    // 7. Obtener notas del rango
    const { data: allNotes } = await supabase
      .from('day_notes')
      .select('*')
      .eq('studio_id', studio_id)
      .gte('date', fecha_inicio)
      .lte('date', fecha_fin);

    // 8. Procesar datos por modelo y por día
    const reportData = [];
    const modelTotals = {};

    // Generar lista de fechas en el rango
    const dates = [];
    let currentDate = new Date(fecha_inicio + 'T12:00:00');
    const endDate = new Date(fecha_fin + 'T12:00:00');
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const model of models) {
      // Obtener turno del modelo
      const modelShift = model.shift_id ? shiftsMap[model.shift_id] : null;
      const minMinutesRequired = modelShift ? modelShift.hours * 60 : defaultMinutes;
      const workingDays = modelShift?.working_days || defaultWorkingDays;

      modelTotals[model.id] = {
        name: model.name,
        shiftName: modelShift?.name || 'Default',
        totalWorkedMinutes: 0,
        totalBreakMinutes: 0,
        daysWorked: 0,
        daysCompliant: 0,
        daysExpected: 0,
        totalEarnings: 0,
        totalFollowersGained: 0
      };

      // Agrupar entradas por día Colombia
      const entriesByDay = {};
      (allEntries || []).filter(e => e.model_id === model.id).forEach(entry => {
        const day = toColombiaDate(entry.created_at);
        if (!entriesByDay[day]) entriesByDay[day] = [];
        entriesByDay[day].push(entry);
      });

      // Encontrar primer día con actividad de este modelo
      const modelEntries = (allEntries || []).filter(e => e.model_id === model.id);
      if (modelEntries.length === 0) {
        // Modelo sin actividad en el rango - no mostrar
        continue;
      }
      const firstEntryDate = toColombiaDate(modelEntries[0].created_at);

      for (const date of dates) {
        // Solo procesar desde el primer día de actividad
        if (date < firstEntryDate) continue;

        // Verificar si es día laboral
        const isDayOff = !isWorkingDay(date, workingDays);
        const dayEntries = entriesByDay[date] || [];

        // Calcular tiempos
        let checkInTime = null;
        let checkOutTime = null;
        let totalWorkedMs = 0;
        let totalBreakMs = 0;
        let currentBreakStart = null;
        let breaksCount = 0;

        for (const entry of dayEntries) {
          if (entry.entry_type === 'check_in') {
            checkInTime = entry.created_at;
          } else if (entry.entry_type === 'check_out') {
            checkOutTime = entry.created_at;
          } else if (entry.entry_type === 'break_start') {
            currentBreakStart = new Date(entry.created_at);
            breaksCount++;
          } else if (entry.entry_type === 'break_end') {
            if (currentBreakStart) {
              totalBreakMs += new Date(entry.created_at) - currentBreakStart;
              currentBreakStart = null;
            }
          }
        }

        // Calcular tiempo trabajado
        if (checkInTime && checkOutTime) {
          totalWorkedMs = new Date(checkOutTime) - new Date(checkInTime) - totalBreakMs;
        }

        const totalWorkedMinutes = Math.floor(totalWorkedMs / 60000);
        const totalBreakMinutes = Math.floor(totalBreakMs / 60000);
        const maxBreakMinutes = studioSettings.max_break_minutes || 15;
        const effectiveBreakMinutes = Math.min(totalBreakMinutes, maxBreakMinutes);
        const totalShiftMinutes = totalWorkedMinutes + effectiveBreakMinutes;
        const isCompliant = totalShiftMinutes >= minMinutesRequired;

        // Minutos pendientes
        const minutesPending = Math.max(0, minMinutesRequired - totalShiftMinutes);

        // Exceso de break
        const breakExcessMinutes = Math.max(0, totalBreakMinutes - maxBreakMinutes);

        // Ganancias del día
        const dayEarnings = (allEarnings || []).find(e =>
          e.model_id === model.id && e.date === date
        );
        const earnings = dayEarnings ? (dayEarnings.tokens || dayEarnings.earnings || 0) : 0;

        // Seguidores
        const followersStart = dayEarnings?.followers_start || 0;
        const followersEnd = dayEarnings?.followers_end || 0;
        const followersGained = followersEnd - followersStart;

        // Nota del día
        const dayNote = (allNotes || []).find(n =>
          n.model_id === model.id && n.date === date
        );

        // Determinar cumplimiento y observación
        let cumplimiento = '-';
        let observacion = '';

        if (isDayOff && !checkInTime) {
          cumplimiento = 'Libre';
          observacion = '🏖️ Día libre';
        } else if (checkInTime) {
          cumplimiento = isCompliant ? 'Sí' : 'No';
          if (dayNote) {
            observacion = `${getNoteLabel(dayNote.note_type, dayNote.custom_name)}${dayNote.note ? ': ' + dayNote.note : ''}`;
          }
        } else if (dayNote) {
          observacion = `${getNoteLabel(dayNote.note_type, dayNote.custom_name)}${dayNote.note ? ': ' + dayNote.note : ''}`;
        }

        // Decidir si agregar esta fila
        // Agregar si: trabajó, tiene nota, o es día laboral (para mostrar falta)
        const shouldAddRow = checkInTime || dayNote || !isDayOff;

        if (shouldAddRow) {
          reportData.push({
            modelo: model.name,
            turno: modelShift?.name || 'Default',
            fecha: date,
            checkIn: checkInTime ? formatTime(checkInTime) : '-',
            checkOut: checkOutTime ? formatTime(checkOutTime) : '-',
            horasTrabajadas: formatMinutes(totalWorkedMinutes),
            horasDecimal: (totalWorkedMinutes / 60).toFixed(2),
            horasRequeridas: isDayOff ? '-' : (minMinutesRequired / 60).toFixed(1),
            minPendientes: isDayOff ? 0 : minutesPending,
            breaks: breaksCount,
            minBreak: totalBreakMinutes,
            excesoBreak: breakExcessMinutes,
            cumplimiento: cumplimiento,
            ganancias: earnings,
            segInicio: followersStart,
            segFin: followersEnd,
            segGanados: followersGained,
            observacion: observacion
          });

          // Acumular totales
          if (!isDayOff) {
            modelTotals[model.id].daysExpected++;
          }
          if (checkInTime) {
            modelTotals[model.id].totalWorkedMinutes += totalWorkedMinutes;
            modelTotals[model.id].totalBreakMinutes += totalBreakMinutes;
            modelTotals[model.id].daysWorked++;
            if (isCompliant) modelTotals[model.id].daysCompliant++;
            modelTotals[model.id].totalEarnings += earnings;
            modelTotals[model.id].totalFollowersGained += followersGained;
          }
        }
      }
    }

    // 9. Crear Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CamAssist';
    workbook.created = new Date();

    // === HOJA 1: Detalle diario ===
    const sheetDetalle = workbook.addWorksheet('Detalle Diario');

    // Encabezado
    sheetDetalle.mergeCells('A1:R1');
    sheetDetalle.getCell('A1').value = `Reporte de Tiempo - ${studio?.name || 'Studio'}`;
    sheetDetalle.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF9333EA' } };
    sheetDetalle.getCell('A1').alignment = { horizontal: 'center' };

    sheetDetalle.mergeCells('A2:R2');
    sheetDetalle.getCell('A2').value = `Período: ${fecha_inicio} al ${fecha_fin}`;
    sheetDetalle.getCell('A2').font = { size: 12, color: { argb: 'FF666666' } };
    sheetDetalle.getCell('A2').alignment = { horizontal: 'center' };

    // Headers de tabla
    const headers = ['Modelo', 'Turno', 'Fecha', 'Entrada', 'Salida', 'Horas Trabajadas', 'Horas (decimal)', 'Horas Req.', 'Min Pendientes', 'Breaks', 'Min Break', 'Exceso Break', 'Cumplió', 'Ganancias', 'Seg Inicio', 'Seg Fin', 'Seg Ganados', 'Observaciones'];
    sheetDetalle.addRow([]);
    const headerRow = sheetDetalle.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9333EA' }
    };
    headerRow.alignment = { horizontal: 'center' };

    // Datos
    reportData.forEach(row => {
      const dataRow = sheetDetalle.addRow([
        row.modelo,
        row.turno,
        row.fecha,
        row.checkIn,
        row.checkOut,
        row.horasTrabajadas,
        parseFloat(row.horasDecimal),
        row.horasRequeridas === '-' ? '-' : parseFloat(row.horasRequeridas),
        row.minPendientes,
        row.breaks,
        row.minBreak,
        row.excesoBreak,
        row.cumplimiento,
        row.ganancias,
        row.segInicio,
        row.segFin,
        row.segGanados,
        row.observacion
      ]);

      // Color según cumplimiento
      if (row.cumplimiento === 'No') {
        dataRow.getCell(13).font = { color: { argb: 'FFDC2626' } };
      } else if (row.cumplimiento === 'Sí') {
        dataRow.getCell(13).font = { color: { argb: 'FF16A34A' } };
      } else if (row.cumplimiento === 'Libre') {
        dataRow.getCell(13).font = { color: { argb: 'FF6B7280' } };
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' }
        };
      }

      // Color rojo si hay exceso de break
      if (row.excesoBreak > 0) {
        dataRow.getCell(12).font = { color: { argb: 'FFDC2626' } };
      }
    });

    // Ajustar anchos
    sheetDetalle.columns = [
      { width: 18 }, { width: 14 }, { width: 12 }, { width: 10 }, { width: 10 },
      { width: 15 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 8 },
      { width: 10 }, { width: 12 }, { width: 10 }, { width: 12 },
      { width: 10 }, { width: 10 }, { width: 12 }, { width: 30 }
    ];

    // === HOJA 2: Resumen por modelo ===
    const sheetResumen = workbook.addWorksheet('Resumen por Modelo');

    sheetResumen.mergeCells('A1:K1');
    sheetResumen.getCell('A1').value = `Resumen por Modelo - ${studio?.name || 'Studio'}`;
    sheetResumen.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF9333EA' } };
    sheetResumen.getCell('A1').alignment = { horizontal: 'center' };

    sheetResumen.mergeCells('A2:K2');
    sheetResumen.getCell('A2').value = `Período: ${fecha_inicio} al ${fecha_fin}`;
    sheetResumen.getCell('A2').font = { size: 12, color: { argb: 'FF666666' } };
    sheetResumen.getCell('A2').alignment = { horizontal: 'center' };

    const resumenHeaders = ['Modelo', 'Turno', 'Días Esperados', 'Días Trabajados', 'Días Cumplió', '% Cumplimiento', 'Total Horas', 'Promedio/Día', 'Total Break', 'Ganancias', 'Seg Ganados'];
    sheetResumen.addRow([]);
    const resumenHeaderRow = sheetResumen.addRow(resumenHeaders);
    resumenHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    resumenHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9333EA' }
    };
    resumenHeaderRow.alignment = { horizontal: 'center' };

    // Totales generales
    let totalHorasGeneral = 0;
    let totalDiasGeneral = 0;
    let totalDiasEsperadosGeneral = 0;
    let totalGananciasGeneral = 0;
    let totalSeguidoresGeneral = 0;

    Object.values(modelTotals).forEach(model => {
      if (model.daysExpected > 0 || model.daysWorked > 0) {
        const totalHoras = (model.totalWorkedMinutes / 60).toFixed(2);
        const promedioHoras = model.daysWorked > 0 ? (model.totalWorkedMinutes / model.daysWorked / 60).toFixed(2) : '0';
        const totalBreakHoras = (model.totalBreakMinutes / 60).toFixed(2);
        const cumplimientoPct = model.daysExpected > 0 ? Math.round((model.daysCompliant / model.daysExpected) * 100) : 0;

        sheetResumen.addRow([
          model.name,
          model.shiftName,
          model.daysExpected,
          model.daysWorked,
          model.daysCompliant,
          `${cumplimientoPct}%`,
          parseFloat(totalHoras),
          parseFloat(promedioHoras),
          parseFloat(totalBreakHoras),
          model.totalEarnings,
          model.totalFollowersGained
        ]);

        totalHorasGeneral += model.totalWorkedMinutes;
        totalDiasGeneral += model.daysWorked;
        totalDiasEsperadosGeneral += model.daysExpected;
        totalGananciasGeneral += model.totalEarnings;
        totalSeguidoresGeneral += model.totalFollowersGained;
      }
    });

    // Fila de totales
    sheetResumen.addRow([]);
    const totalRow = sheetResumen.addRow([
      'TOTAL',
      '-',
      totalDiasEsperadosGeneral,
      totalDiasGeneral,
      '-',
      '-',
      (totalHorasGeneral / 60).toFixed(2),
      '-',
      '-',
      totalGananciasGeneral,
      totalSeguidoresGeneral
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3E8FF' }
    };

    sheetResumen.columns = [
      { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }
    ];

    // 10. Generar buffer y enviar
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Tiempo_${fecha_inicio}_${fecha_fin}.xlsx`);
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('Error generando reporte:', error);
    return res.status(500).json({ error: 'Error generando reporte' });
  }
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota'
  });
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function getNoteLabel(noteType, customName = null) {
  const labels = {
    'permission': '📋 Permiso',
    'absence': '❌ Falta',
    'late': '⏰ Llegó tarde',
    'left_early': '🏃 Salió temprano',
    'other': customName ? `📌 ${customName}` : '📌 Otro'
  };
  return labels[noteType] || noteType;
}