import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

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
      max_break_minutes: 15
    };

    // 3. Obtener modelos del studio
    const { data: models } = await supabase
      .from('models')
      .select('id, name')
      .eq('studio_id', studio_id)
      .is('deleted_at', null)
      .order('name');

    // 4. Obtener todas las entradas del rango de fechas
    const dateStart = new Date(fecha_inicio + 'T00:00:00-05:00');
    const dateEnd = new Date(fecha_fin + 'T23:59:59.999-05:00');

    const { data: allEntries } = await supabase
      .from('time_entries')
      .select('*')
      .eq('studio_id', studio_id)
      .gte('created_at', dateStart.toISOString())
      .lte('created_at', dateEnd.toISOString())
      .order('created_at', { ascending: true });

    // 5. Obtener ganancias del rango
    const { data: allEarnings } = await supabase
      .from('daily_earnings')
      .select('*')
      .eq('studio_id', studio_id)
      .gte('date', fecha_inicio)
      .lte('date', fecha_fin);

    // 6. Procesar datos por modelo y por día
    const reportData = [];
    const modelTotals = {};

    // Generar lista de fechas en el rango
    const dates = [];
    let currentDate = new Date(fecha_inicio);
    const endDate = new Date(fecha_fin);
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const model of models) {
      modelTotals[model.id] = {
        name: model.name,
        totalWorkedMinutes: 0,
        totalBreakMinutes: 0,
        daysWorked: 0,
        daysCompliant: 0,
        totalEarnings: 0
      };

      for (const date of dates) {
        const dayStart = new Date(date + 'T00:00:00-05:00');
        const dayEnd = new Date(date + 'T23:59:59.999-05:00');

        // Filtrar entradas de este modelo en este día
        const entries = (allEntries || []).filter(e => 
          e.model_id === model.id &&
          new Date(e.created_at) >= dayStart &&
          new Date(e.created_at) <= dayEnd
        );

        if (entries.length === 0) continue;

        // Calcular tiempos
        let checkInTime = null;
        let checkOutTime = null;
        let totalWorkedMs = 0;
        let totalBreakMs = 0;
        let currentBreakStart = null;
        let breaksCount = 0;

        for (const entry of entries) {
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
        const minMinutesRequired = studioSettings.min_hours_daily * 60;
        const maxBreakMinutes = studioSettings.max_break_minutes || 15;
        const effectiveBreakMinutes = Math.min(totalBreakMinutes, maxBreakMinutes);
        const totalShiftMinutes = totalWorkedMinutes + effectiveBreakMinutes;
        const isCompliant = totalShiftMinutes >= minMinutesRequired;

        // Ganancias del día
        const dayEarnings = (allEarnings || []).find(e => 
          e.model_id === model.id && e.date === date
        );
        const earnings = dayEarnings ? (dayEarnings.tokens || 0) : 0;

        // Solo agregar si trabajó ese día
        if (checkInTime) {
          reportData.push({
            modelo: model.name,
            fecha: date,
            checkIn: checkInTime ? formatTime(checkInTime) : '-',
            checkOut: checkOutTime ? formatTime(checkOutTime) : '-',
            horasTrabajadas: formatMinutes(totalWorkedMinutes),
            horasDecimal: (totalWorkedMinutes / 60).toFixed(2),
            breaks: breaksCount,
            minBreak: totalBreakMinutes,
            cumplimiento: isCompliant ? 'Sí' : 'No',
            ganancias: earnings
          });

          // Acumular totales
          modelTotals[model.id].totalWorkedMinutes += totalWorkedMinutes;
          modelTotals[model.id].totalBreakMinutes += totalBreakMinutes;
          modelTotals[model.id].daysWorked++;
          if (isCompliant) modelTotals[model.id].daysCompliant++;
          modelTotals[model.id].totalEarnings += earnings;
        }
      }
    }

    // 7. Crear Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CamAssist';
    workbook.created = new Date();

    // === HOJA 1: Detalle diario ===
    const sheetDetalle = workbook.addWorksheet('Detalle Diario');

    // Encabezado
    sheetDetalle.mergeCells('A1:J1');
    sheetDetalle.getCell('A1').value = `Reporte de Tiempo - ${studio?.name || 'Studio'}`;
    sheetDetalle.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF9333EA' } };
    sheetDetalle.getCell('A1').alignment = { horizontal: 'center' };

    sheetDetalle.mergeCells('A2:J2');
    sheetDetalle.getCell('A2').value = `Período: ${fecha_inicio} al ${fecha_fin}`;
    sheetDetalle.getCell('A2').font = { size: 12, color: { argb: 'FF666666' } };
    sheetDetalle.getCell('A2').alignment = { horizontal: 'center' };

    // Headers de tabla
    const headers = ['Modelo', 'Fecha', 'Entrada', 'Salida', 'Horas Trabajadas', 'Horas (decimal)', 'Breaks', 'Min Break', 'Cumplió', 'Ganancias'];
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
        row.fecha,
        row.checkIn,
        row.checkOut,
        row.horasTrabajadas,
        parseFloat(row.horasDecimal),
        row.breaks,
        row.minBreak,
        row.cumplimiento,
        row.ganancias
      ]);

      // Color según cumplimiento
      if (row.cumplimiento === 'No') {
        dataRow.getCell(9).font = { color: { argb: 'FFDC2626' } };
      } else {
        dataRow.getCell(9).font = { color: { argb: 'FF16A34A' } };
      }
    });

    // Ajustar anchos
    sheetDetalle.columns = [
      { width: 20 }, { width: 12 }, { width: 10 }, { width: 10 },
      { width: 15 }, { width: 12 }, { width: 8 }, { width: 10 },
      { width: 10 }, { width: 12 }
    ];

    // === HOJA 2: Resumen por modelo ===
    const sheetResumen = workbook.addWorksheet('Resumen por Modelo');

    sheetResumen.mergeCells('A1:G1');
    sheetResumen.getCell('A1').value = `Resumen por Modelo - ${studio?.name || 'Studio'}`;
    sheetResumen.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF9333EA' } };
    sheetResumen.getCell('A1').alignment = { horizontal: 'center' };

    sheetResumen.mergeCells('A2:G2');
    sheetResumen.getCell('A2').value = `Período: ${fecha_inicio} al ${fecha_fin}`;
    sheetResumen.getCell('A2').font = { size: 12, color: { argb: 'FF666666' } };
    sheetResumen.getCell('A2').alignment = { horizontal: 'center' };

    const resumenHeaders = ['Modelo', 'Días Trabajados', 'Días Cumplió', 'Total Horas', 'Promedio/Día', 'Total Break', 'Ganancias'];
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
    let totalGananciasGeneral = 0;

    Object.values(modelTotals).forEach(model => {
      if (model.daysWorked > 0) {
        const totalHoras = (model.totalWorkedMinutes / 60).toFixed(2);
        const promedioHoras = (model.totalWorkedMinutes / model.daysWorked / 60).toFixed(2);
        const totalBreakHoras = (model.totalBreakMinutes / 60).toFixed(2);

        sheetResumen.addRow([
          model.name,
          model.daysWorked,
          model.daysCompliant,
          parseFloat(totalHoras),
          parseFloat(promedioHoras),
          parseFloat(totalBreakHoras),
          model.totalEarnings
        ]);

        totalHorasGeneral += model.totalWorkedMinutes;
        totalDiasGeneral += model.daysWorked;
        totalGananciasGeneral += model.totalEarnings;
      }
    });

    // Fila de totales
    sheetResumen.addRow([]);
    const totalRow = sheetResumen.addRow([
      'TOTAL',
      totalDiasGeneral,
      '-',
      (totalHorasGeneral / 60).toFixed(2),
      '-',
      '-',
      totalGananciasGeneral
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3E8FF' }
    };

    sheetResumen.columns = [
      { width: 20 }, { width: 15 }, { width: 12 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 12 }
    ];

    // 8. Generar buffer y enviar
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
