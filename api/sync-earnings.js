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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, platform, earnings } = req.body;

  // token = token de la modelo (mdl_xxx)
  // platform = 'chaturbate' o 'stripchat'
  // earnings = array de { date, action, username, tokens }

  if (!token || !platform || !earnings || !Array.isArray(earnings)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Buscar modelo por token
    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, studio_id, studios(plan)')
      .eq('token', token)
      .single();

    if (modelError || !model) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verificar que el studio tenga plan pro
    if (model.studios?.plan !== 'pro') {
      return res.status(403).json({ error: 'Feature not available', plan: model.studios?.plan });
    }

    // Insertar earnings (ignorar duplicados)
    let inserted = 0;
    let skipped = 0;

    for (const earning of earnings) {
      const { data, error } = await supabase
        .from('earnings')
        .upsert({
          model_id: model.id,
          studio_id: model.studio_id,
          platform,
          transaction_date: earning.date,
          action_type: earning.action,
          username: earning.username || null,
          tokens: earning.tokens
        }, {
          onConflict: 'model_id,platform,transaction_date,action_type,tokens,token_balance',
          ignoreDuplicates: true
        });

      if (error) {
        console.log('Skip duplicate or error:', error.message);
        skipped++;
      } else {
        inserted++;
      }
    }

    console.log(`📊 Earnings sync: ${inserted} inserted, ${skipped} skipped for ${token}`);

    return res.status(200).json({
      success: true,
      inserted,
      skipped,
      total: earnings.length
    });

  } catch (error) {
    console.error('Error syncing earnings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}