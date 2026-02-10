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

  const { 
    studio_id, 
    name,
    gender,
    chaturbate_username,
    stripchat_username,
    streamate_username,
    xmodels_username
  } = req.body;

  if (!studio_id || !name) {
    return res.json({ success: false, message: 'Faltan datos' });
  }

  // Validar que al menos 1 username esté presente
  const hasUsername = chaturbate_username || stripchat_username || streamate_username || xmodels_username;
  if (!hasUsername) {
    return res.json({ success: false, message: 'Debes ingresar al menos 1 username de plataforma' });
  }

  try {
    // Verificar que usernames no existan ya
    if (chaturbate_username) {
      const { data: existing } = await supabase
        .from('models')
        .select('id')
        .eq('chaturbate_username', chaturbate_username)
        .maybeSingle();
      if (existing) {
        return res.json({ success: false, message: `El username "${chaturbate_username}" ya está registrado en Chaturbate` });
      }
    }

    if (stripchat_username) {
      const { data: existing } = await supabase
        .from('models')
        .select('id')
        .eq('stripchat_username', stripchat_username)
        .maybeSingle();
      if (existing) {
        return res.json({ success: false, message: `El username "${stripchat_username}" ya está registrado en StripChat` });
      }
    }

    if (streamate_username) {
      const { data: existing } = await supabase
        .from('models')
        .select('id')
        .eq('streamate_username', streamate_username)
        .maybeSingle();
      if (existing) {
        return res.json({ success: false, message: `El username "${streamate_username}" ya está registrado en Streamate` });
      }
    }

    if (xmodels_username) {
      const { data: existing } = await supabase
        .from('models')
        .select('id')
        .eq('xmodels_username', xmodels_username)
        .maybeSingle();
      if (existing) {
        return res.json({ success: false, message: `El username "${xmodels_username}" ya está registrado en XModels` });
      }
    }

    // Generar token único
    const token = 'mdl_' + name.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substring(2, 10);

    // Crear modelo (trial empieza en primer uso)
    const { data, error } = await supabase
      .from('models')
      .insert({
        studio_id,
        name,
        token,
        gender: gender || 'female',
        chaturbate_username: chaturbate_username || null,
        stripchat_username: stripchat_username || null,
        streamate_username: streamate_username || null,
        xmodels_username: xmodels_username || null,
        age: 24,
        location: 'Colombia',
        personality: 'extrovert_playful',
        emoji_level: 2,
        trial_started: false,
        trial_ends_at: null
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      model: data,
      message: '✅ Modelo creada. Trial de 14 días inicia con el primer uso.'
    });

  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
}