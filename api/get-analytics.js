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
    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Query base para earnings
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

    const { data: followers, error: followersError } = await followersQuery;

    // Calcular totales por plataforma
    const byPlatform = {
      chaturbate: { tokens: 0, followers: 0 },
      stripchat: { tokens: 0, followers: 0 }
    };

    earnings?.forEach(e => {
      if (byPlatform[e.platform]) {
        byPlatform[e.platform].tokens += e.tokens || 0;
      }
    });

    // Calcular followers ganados (max - min por plataforma)
    const followersByPlatform = {};
    followers?.forEach(f => {
      if (!followersByPlatform[f.platform]) {
        followersByPlatform[f.platform] = { min: f.followers, max: f.followers };
      } else {
        followersByPlatform[f.platform].min = Math.min(followersByPlatform[f.platform].min, f.followers);
        followersByPlatform[f.platform].max = Math.max(followersByPlatform[f.platform].max, f.followers);
      }
    });

    Object.keys(followersByPlatform).forEach(platform => {
      if (byPlatform[platform]) {
        byPlatform[platform].followers = followersByPlatform[platform].max - followersByPlatform[platform].min;
      }
    });

    // Totales
    const totalTokens = (byPlatform.chaturbate?.tokens || 0) + (byPlatform.stripchat?.tokens || 0);
    const totalFollowers = (byPlatform.chaturbate?.followers || 0) + (byPlatform.stripchat?.followers || 0);
    
    // Valor en USD (aproximado: 1 token CB = $0.05, 1 token SC = $0.05)
    const usdValue = totalTokens * 0.05;

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

    // Top fans
    const fanTotals = {};
    earnings?.forEach(e => {
      if (!e.username) return;
      if (!fanTotals[e.username]) {
        fanTotals[e.username] = { username: e.username, tokens: 0, count: 0 };
      }
      fanTotals[e.username].tokens += e.tokens || 0;
      fanTotals[e.username].count += 1;
    });

    const topFans = Object.values(fanTotals)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

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
        usd: usdValue
      },
      dailyData: Object.values(dailyData).reverse().slice(-14),
      topModels,
      topFans,
      transactions
    });

  } catch (error) {
    console.error('Error in get-analytics:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
