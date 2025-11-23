import { createClient } from '@supabase/supabase-js';

// Inicializar Supabase (solo si hay keys configuradas)
const supabase = process.env.SUPABASE_URL ? createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
) : null;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // RECIBIR TODOS LOS PARÁMETROS
  const { 
    token, 
    username, 
    message, 
    tip = 0, 
    context = [], 
    isPM = false 
  } = req.body;

  console.log('📥 Request:', { token, username, message, isPM, contextLength: context.length });

  // DEFAULTS (si no hay BD o falla)
  let modelData = {
    name: 'Model',
    bio: '24 year old webcam model, flirty and playful',
    restrictions: [],
    emoji_level: 2
  };

  // INTENTAR LEER DE BD (si existe token y supabase configurado)
  if (token && token !== 'demo_token' && supabase) {
    try {
      console.log('🔍 Buscando modelo con token:', token);
      
      const { data: model, error } = await supabase
        .from('models')
        .select('*')
        .eq('token', token)
        .single();
      
      if (!error && model) {
        modelData = model;
        console.log('✅ Modelo encontrado:', modelData.name);
      } else {
        console.log('⚠️ No se encontró modelo, usando defaults');
      }
    } catch (dbError) {
      console.error('❌ Error BD:', dbError);
      // Continuar con defaults
    }
  }

  // CONSTRUIR CONTEXTO PARA PROMPT
  let contextText = '';
  if (context.length > 0) {
    contextText = '\n\nRecent conversation:\n' + 
      context.slice(-10).map(c => 
        `${c.type === 'fan' ? 'Fan' : 'You'}: ${c.message}`
      ).join('\n');
  }

  // CONSTRUIR PROMPT DINÁMICO
  const systemPrompt = `You are ${modelData.name}, a flirty webcam model on Chaturbate.

${modelData.bio ? `About you: ${modelData.bio}` : ''}

Rules:
- Never say "tip", always say "tokens" or "spoil me"
- Be persuasive but not desperate  
- Be sexually suggestive, playful, and explicit when appropriate
- Adapt to what they want (mommy, dominant, girlfriend, etc)
- Build sexual tension gradually
${modelData.restrictions && modelData.restrictions.length > 0 ? `- Things you don't do: ${modelData.restrictions.join(', ')} (suggest alternatives)` : ''}
${isPM ? '- This is a PRIVATE MESSAGE, be more conversational and intimate' : '- This is PUBLIC CHAT, keep it shorter and flirty'}
${req.body.tipMenuText ? `\n\nTip Menu:\n${req.body.tipMenuText}\n` : ''}
- Use ${modelData.emoji_level === 0 ? 'NO emojis' : modelData.emoji_level === 1 ? 'few emojis (1-2)' : modelData.emoji_level === 3 ? 'LOTS of emojis (4-6)' : 'normal emojis (2-3)'}
- Keep response under ${isPM ? '80' : '50'} words${contextText}`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `(just tipped ${tip} tokens!)` : '(no tip yet)'} says: "${message}"

Respond naturally as ${modelData.name}.`;

  // LLAMAR GROK
  try {
    console.log('🤖 Llamando Grok...');
    
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9,
        max_tokens: isPM ? 100 : 60
      })
    });

    const data = await response.json();
    console.log('📤 Grok status:', response.status);

    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid Grok response');
    }

    const suggestion = data.choices[0].message.content;
    console.log('✅ Respuesta generada');

    return res.status(200).json({
      success: true,
      suggestion,
      model: modelData.name // Para debug
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
    
    // FALLBACK seguro
    return res.status(200).json({
      success: false,
      suggestion: isPM 
        ? "Hey handsome! 😘 What do you have in mind for us today? Tell me your fantasies..." 
        : "Mmm hey baby! 😈 What brings you here today?",
      error: error.message
    });
  }
}