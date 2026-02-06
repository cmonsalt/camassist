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

  const { token, platform, followers } = req.body;

  if (!token || !platform || followers === undefined) {
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

    // Verificar plan pro
    if (model.studios?.plan !== 'pro') {
      return res.status(403).json({ error: 'Feature not available', plan: model.studios?.plan });
    }

    // Insertar registro de seguidores
    const { data, error } = await supabase
      .from('followers_history')
      .insert({
        model_id: model.id,
        studio_id: model.studio_id,
        platform,
        followers: parseInt(followers) || 0
      });

    if (error) {
      console.error('Error inserting followers:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`👥 Followers sync: ${followers} for ${token}`);

    return res.status(200).json({
      success: true,
      followers
    });

  } catch (error) {
    console.error('Error syncing followers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}