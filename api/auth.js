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

  const { email, password, action } = req.body;

  // REGISTRO
  if (action === 'register') {
    try {
      // Verificar si ya existe
      const { data: existing } = await supabase
        .from('studios')
        .select('id')
        .eq('email', email)
        .single();

      if (existing) {
        return res.json({ success: false, message: 'Email ya registrado' });
      }

      // Crear studio
      const { data, error } = await supabase
        .from('studios')
        .insert({
          email,
          password, // En producción: usar hash
          name: email.split('@')[0]
        })
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        studio_id: data.id,
        studio_name: data.name
      });

    } catch (error) {
      return res.json({ success: false, message: error.message });
    }
  }

  // LOGIN
  try {
    const { data, error } = await supabase
      .from('studios')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      return res.json({ success: false, message: 'Credenciales incorrectas' });
    }

    return res.json({
      success: true,
      studio_id: data.id,
      studio_name: data.name,
      studio_role: data.role || 'studio'
    });

  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
}