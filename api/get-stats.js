import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { studio_id } = req.body;

  if (!studio_id) {
    return res.json({ success: false, message: 'Falta studio_id' });
  }

  try {
    // Obtener info del studio (incluye trial)
    const { data: studio, error: studioError } = await supabase
      .from('studios')
      .select('name, created_at, billing_day')
      .eq('id', studio_id)
      .single();

    if (studioError) throw studioError;

    // Obtener modelos del studio
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('id, name, token, created_at, trial_started, trial_ends_at, subscription_status, paid_until')
      .eq('studio_id', studio_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (modelsError) throw modelsError;

    // Obtener inicio del mes actual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Obtener uso TOTAL histórico - paginando para evitar límite de 1000
    let allUsageTotal = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('usage')
        .select('model_id')
        .eq('studio_id', studio_id)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      if (batch && batch.length > 0) {
        allUsageTotal = allUsageTotal.concat(batch);
        from += pageSize;
        hasMore = batch.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    const totalByModel = {};
    allUsageTotal.forEach(u => {
      totalByModel[u.model_id] = (totalByModel[u.model_id] || 0) + 1;
    });

    // Obtener uso por modelo ESTE MES - con paginación
    let allUsageMonth = [];
    let fromMonth = 0;
    let hasMoreMonth = true;

    while (hasMoreMonth) {
      const { data: batch, error } = await supabase
        .from('usage')
        .select('model_id, is_pm, created_at')
        .eq('studio_id', studio_id)
        .gte('created_at', startOfMonth)
        .range(fromMonth, fromMonth + pageSize - 1);

      if (error) throw error;

      if (batch && batch.length > 0) {
        allUsageMonth = allUsageMonth.concat(batch);
        fromMonth += pageSize;
        hasMoreMonth = batch.length === pageSize;
      } else {
        hasMoreMonth = false;
      }
    }

    const usage = allUsageMonth;

    // Agrupar uso por modelo
    const usageByModel = {};
    let totalUsage = 0;
    let pmCount = 0;
    let publicCount = 0;

    usage.forEach(u => {
      if (!usageByModel[u.model_id]) {
        usageByModel[u.model_id] = { total: 0, pm: 0, public: 0, lastUsed: null };
      }
      usageByModel[u.model_id].total++;
      totalUsage++;

      if (u.is_pm) {
        usageByModel[u.model_id].pm++;
        pmCount++;
      } else {
        usageByModel[u.model_id].public++;
        publicCount++;
      }

      // Track última actividad
      const usageDate = new Date(u.created_at);
      if (!usageByModel[u.model_id].lastUsed || usageDate > new Date(usageByModel[u.model_id].lastUsed)) {
        usageByModel[u.model_id].lastUsed = u.created_at;
      }
    });

    // Combinar modelos con su uso
    const modelsWithUsage = models.map(model => {
      const modelUsage = usageByModel[model.id] || { total: 0, pm: 0, public: 0, lastUsed: null };

      // Calcular estado del trial
      let trialStatus = 'pending'; // No ha empezado
      let trialDaysLeft = 0;

      // Verificar si pagó (paid_until en el futuro)
      if (model.paid_until && new Date(model.paid_until) > new Date()) {
        trialStatus = 'active_paid';
      } else if (model.trial_started && model.trial_ends_at) {
        const trialEnds = new Date(model.trial_ends_at);
        const now = new Date();
        const daysLeft = Math.ceil((trialEnds - now) / (1000 * 60 * 60 * 24));

        if (daysLeft > 0) {
          trialStatus = 'trial';
          trialDaysLeft = daysLeft;
        } else {
          trialStatus = 'pending_payment';
        }
      }

      return {
        id: model.id,
        name: model.name,
        token: model.token,
        usageMonth: modelUsage.total,
        usageTotal: totalByModel[model.id] || 0,
        pmUsage: modelUsage.pm,
        publicUsage: modelUsage.public,
        lastUsed: modelUsage.lastUsed,
        trialStatus,
        trialDaysLeft,
        trialEndsAt: model.trial_ends_at
      };
    });

    // Ordenar por uso (más activos primero)
    modelsWithUsage.sort((a, b) => b.usageMonth - a.usageMonth);

    // Obtener uso últimos 7 días para gráfico
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      last7Days.push(date.toISOString().split('T')[0]);
    }

    const usageByDay = {};
    last7Days.forEach(day => {
      usageByDay[day] = 0;
    });

    allUsageMonth.forEach(u => {
      const day = u.created_at.split('T')[0];
      if (usageByDay[day] !== undefined) {
        usageByDay[day]++;
      }
    });

    const dailyUsage = last7Days.map(day => ({
      date: day,
      count: usageByDay[day]
    }));

    // Calcular costo estimado (aproximado)
    const estimatedCost = (totalUsage * 0.00025).toFixed(2);

    return res.json({
      success: true,
      studio: {
        name: studio.name,
        billingDay: studio.billing_day
      },
      stats: {
        totalUsage,
        totalHistorico: allUsageTotal.length,
        pmCount,
        publicCount,
        totalModels: models.length,
        estimatedCost,
        dailyUsage
      },
      models: modelsWithUsage
    });

  } catch (error) {
    console.error('Error getting stats:', error);
    return res.json({ success: false, message: error.message });
  }
}
