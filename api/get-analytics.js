import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studio_id, period, platform, model_id } = req.body;

  if (!studio_id) {
    return res.status(400).json({ error: 'Missing studio_id' });
  }

  try {
    // Calcular fecha de inicio según período
    let startDate = new Date();
    let previousStartDate = new Date();
    
    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        previousStartDate.setDate(previousStartDate.getDate() - 1);
        previousStartDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        previousStartDate.setDate(previousStartDate.getDate() - 14);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        previousStartDate.setMonth(previousStartDate.getMonth() - 2);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        previousStartDate.setDate(previousStartDate.getDate() - 180);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
        previousStartDate.setDate(previousStartDate.getDate() - 14);
    }

    // Query para earnings del período actual
    let earningsQuery = supabase
      .from('earnings')
      .select('*, models(name)')
      .eq('studio_id', studio_id)
      .gte('transaction_date', startDate.toISOString())
      .order('transaction_date', { ascending: false });

    if (platform) {
      earningsQuery = earningsQuery.eq('platform', platform);
    }
    if (model_id) {
      earningsQuery = earningsQuery.eq('model_id', model_id);
    }

    const { data: earnings, error: earningsError } = await earningsQuery;

    if (earningsError) {
      console.error('Error fetching earnings:', earningsError);
      return res.status(500).json({ error: earningsError.message });
    }

    // Query para earnings del período anterior (para comparativa)
    let prevEarningsQuery = supabase
      .from('earnings')
      .select('tokens, platform')
      .eq('studio_id', studio_id)
      .gte('transaction_date', previousStartDate.toISOString())
      .lt('transaction_date', startDate.toISOString());

    if (platform) {
      prevEarningsQuery = prevEarningsQuery.eq('platform', platform);
    }
    if (model_id) {
      prevEarningsQuery = prevEarningsQuery.eq('model_id', model_id);
    }

    const { data: prevEarnings } = await prevEarningsQuery;

    // Query para followers
    let followersQuery = supabase
      .from('followers_history')
      .select('*')
      .eq('studio_id', studio_id)
      .gte('captured_at', startDate.toISOString())
      .order('captured_at', { ascending: false });

    if (platform) {
      followersQuery = followersQuery.eq('platform', platform);
    }
    if (model_id) {
      followersQuery = followersQuery.eq('model_id', model_id);
    }

    const { data: followers } = await followersQuery;

    // Calcular totales por plataforma
    const byPlatform = {
      chaturbate: { tokens: 0, followers: 0, followersTotal: 0 },
      stripchat: { tokens: 0, followers: 0, followersTotal: 0 }
    };

    earnings?.forEach(e => {
      if (byPlatform[e.platform]) {
        byPlatform[e.platform].tokens += e.tokens || 0;
      }
    });

    // Calcular followers: total actual y ganados (max - min por plataforma)
    const followersByPlatform = {};
    followers?.forEach(f => {
      if (!followersByPlatform[f.platform]) {
        followersByPlatform[f.platform] = { min: f.followers, max: f.followers, latest: f.followers, latestDate: new Date(f.captured_at) };
      } else {
        followersByPlatform[f.platform].min = Math.min(followersByPlatform[f.platform].min, f.followers);
        followersByPlatform[f.platform].max = Math.max(followersByPlatform[f.platform].max, f.followers);
        // Guardar el más reciente
        const capturedAt = new Date(f.captured_at);
        if (capturedAt > followersByPlatform[f.platform].latestDate) {
          followersByPlatform[f.platform].latest = f.followers;
          followersByPlatform[f.platform].latestDate = capturedAt;
        }
      }
    });

    Object.keys(followersByPlatform).forEach(plat => {
      if (byPlatform[plat]) {
        byPlatform[plat].followers = followersByPlatform[plat].max - followersByPlatform[plat].min;
        byPlatform[plat].followersTotal = followersByPlatform[plat].latest || 0;
      }
    });

    // Totales
    const totalTokens = (byPlatform.chaturbate?.tokens || 0) + (byPlatform.stripchat?.tokens || 0);
    const totalFollowers = (byPlatform.chaturbate?.followers || 0) + (byPlatform.stripchat?.followers || 0);
    const totalFollowersTotal = (byPlatform.chaturbate?.followersTotal || 0) + (byPlatform.stripchat?.followersTotal || 0);
    const usdValue = totalTokens * 0.05;

    // Totales período anterior
    const prevTotalTokens = prevEarnings?.reduce((sum, e) => sum + (e.tokens || 0), 0) || 0;

    // Datos diarios para gráfico
    const dailyData = {};
    earnings?.forEach(e => {
      const date = new Date(e.transaction_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
      if (!dailyData[date]) {
        dailyData[date] = { date, chaturbate: 0, stripchat: 0 };
      }
      dailyData[date][e.platform] = (dailyData[date][e.platform] || 0) + (e.tokens || 0);
    });

    // Top modelos
    const modelTotals = {};
    earnings?.forEach(e => {
      const key = `${e.model_id}-${e.platform}`;
      if (!modelTotals[key]) {
        modelTotals[key] = {
          model_id: e.model_id,
          name: e.models?.name || 'Unknown',
          platform: e.platform,
          tokens: 0
        };
      }
      modelTotals[key].tokens += e.tokens || 0;
    });

    const topModels = Object.values(modelTotals)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);

    // Top fans con más info
    const fanTotals = {};
    const fanFirstSeen = {};
    earnings?.forEach(e => {
      if (!e.username) return;
      if (!fanTotals[e.username]) {
        fanTotals[e.username] = { username: e.username, tokens: 0, count: 0 };
        fanFirstSeen[e.username] = new Date(e.transaction_date);
      } else {
        const txDate = new Date(e.transaction_date);
        if (txDate < fanFirstSeen[e.username]) {
          fanFirstSeen[e.username] = txDate;
        }
      }
      fanTotals[e.username].tokens += e.tokens || 0;
      fanTotals[e.username].count += 1;
    });

    // Calcular promedio de tip por fan
    const topFans = Object.values(fanTotals)
      .map(fan => ({
        ...fan,
        avgTip: fan.count > 0 ? Math.round(fan.tokens / fan.count) : 0,
        isNew: fanFirstSeen[fan.username] > startDate
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

    // Fans recurrentes vs nuevos
    const recurringFans = Object.values(fanTotals).filter(f => f.count > 1).length;
    const newFans = Object.values(fanTotals).filter(f => fanFirstSeen[f.username] > startDate).length;
    const totalFansCount = Object.keys(fanTotals).length;

    // Mejor día de la semana
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const tokensByDay = [0, 0, 0, 0, 0, 0, 0];
    earnings?.forEach(e => {
      const day = new Date(e.transaction_date).getDay();
      tokensByDay[day] += e.tokens || 0;
    });
    const bestDayIndex = tokensByDay.indexOf(Math.max(...tokensByDay));
    const bestDay = {
      name: dayNames[bestDayIndex],
      tokens: tokensByDay[bestDayIndex],
      allDays: dayNames.map((name, i) => ({ name, tokens: tokensByDay[i] }))
    };

    // Mejor horario
    const tokensByHour = Array(24).fill(0);
    earnings?.forEach(e => {
      const hour = new Date(e.transaction_date).getHours();
      tokensByHour[hour] += e.tokens || 0;
    });
    const bestHourIndex = tokensByHour.indexOf(Math.max(...tokensByHour));
    const bestHour = {
      hour: bestHourIndex,
      formatted: `${bestHourIndex.toString().padStart(2, '0')}:00 - ${(bestHourIndex + 1).toString().padStart(2, '0')}:00`,
      tokens: tokensByHour[bestHourIndex],
      allHours: tokensByHour.map((tokens, i) => ({ hour: i, tokens }))
    };

    // Comparativa con período anterior
    const comparison = {
      currentTokens: totalTokens,
      previousTokens: prevTotalTokens,
      difference: totalTokens - prevTotalTokens,
      percentChange: prevTotalTokens > 0 ? Math.round(((totalTokens - prevTotalTokens) / prevTotalTokens) * 100) : 0
    };

    // Comparativa CB vs SC
    const platformComparison = {
      chaturbate: byPlatform.chaturbate?.tokens || 0,
      stripchat: byPlatform.stripchat?.tokens || 0,
      winner: (byPlatform.chaturbate?.tokens || 0) >= (byPlatform.stripchat?.tokens || 0) ? 'chaturbate' : 'stripchat',
      cbPercent: totalTokens > 0 ? Math.round((byPlatform.chaturbate?.tokens || 0) / totalTokens * 100) : 0,
      scPercent: totalTokens > 0 ? Math.round((byPlatform.stripchat?.tokens || 0) / totalTokens * 100) : 0
    };

    // Proyecciones
    const daysInPeriod = Math.max(1, Math.ceil((new Date() - startDate) / (1000 * 60 * 60 * 24)));
    const avgTokensPerDay = totalTokens / daysInPeriod;
    const daysLeftInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
    const projectedMonthly = Math.round(avgTokensPerDay * 30);
    const projectedRemainingMonth = Math.round(avgTokensPerDay * daysLeftInMonth);

    // Mejor modelo
    const bestModel = topModels.length > 0 ? {
      name: topModels[0].name,
      tokens: topModels[0].tokens,
      percent: totalTokens > 0 ? Math.round((topModels[0].tokens / totalTokens) * 100) : 0
    } : null;

    const projections = {
      avgTokensPerDay: Math.round(avgTokensPerDay),
      projectedMonthly,
      projectedMonthlyUSD: (projectedMonthly * 0.05).toFixed(2),
      projectedRemainingMonth,
      projectedRemainingUSD: (projectedRemainingMonth * 0.05).toFixed(2),
      bestModel
    };

    // Transacciones recientes
    const transactions = earnings?.slice(0, 100).map(e => ({
      transaction_date: e.transaction_date,
      model_name: e.models?.name || 'Unknown',
      platform: e.platform,
      action_type: e.action_type,
      username: e.username,
      tokens: e.tokens
    })) || [];

    return res.status(200).json({
      success: true,
      byPlatform,
      totals: {
        tokens: totalTokens,
        followers: totalFollowers,
        followersTotal: totalFollowersTotal,
        usd: usdValue
      },
      dailyData: Object.values(dailyData).reverse().slice(-14),
      topModels,
      topFans,
      fanStats: {
        total: totalFansCount,
        recurring: recurringFans,
        new: newFans,
        avgTipPerFan: totalFansCount > 0 ? Math.round(totalTokens / totalFansCount) : 0
      },
      bestDay,
      bestHour,
      comparison,
      platformComparison,
      projections,
      transactions
    });

  } catch (error) {
    console.error('Error in get-analytics:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
