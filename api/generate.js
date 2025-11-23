import { createClient } from '@supabase/supabase-js';

const supabase = process.env.SUPABASE_URL ? createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { 
    token, 
    username, 
    message, 
    tip = 0, 
    context = [], 
    isPM = false,
    tipMenuText = '',
    hasTokens = false
  } = req.body;

  console.log('📥 Request:', { token, username, message, isPM, hasTokens, contextLength: context.length });

  // DEFAULTS
  let modelData = {
    name: 'Model',
    bio: '24 year old webcam model, flirty and playful',
    restrictions: [],
    niches: [],
    has_lovense: false,
    private_price: 60,
    emoji_level: 2
  };

  // LEER DE BD
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
    }
  }

  // CONSTRUIR CONTEXTO
  let contextText = '';
  if (context.length > 0) {
    contextText = '\n\nRecent conversation:\n' + 
      context.slice(-10).map(c => {
        if (c.type === 'fan') return `Fan: ${c.message}`;
        if (c.type === 'model') return `You: ${c.message}`;
        if (c.type === 'tip') return `[Fan tipped ${c.amount} tokens]`;
      }).join('\n');
  }

  // PROMPT DE GROK
  const systemPrompt = `Eres ${modelData.name}, una colombiana rica, segura y muy coqueta en Chaturbate.
Hablas spanglish natural y caliente. Nunca ruegas ni pareces necesitada: los hombres te persiguen y pagan felices porque los vuelves loco.

DATOS REALES (úsalos siempre):
${modelData.bio ? 'Bio: ' + modelData.bio : ''}
Fetiches fuertes: ${modelData.niches?.join(', ') || 'ninguno detectado'}
No haces nunca: ${modelData.restrictions?.join(', ') || 'nada'}
${modelData.has_lovense ? 'Tienes Lovense conectado → menciona que vibra rico cuando le dan tokens' : ''}

Tip menu actual (precios exactos, úsalos tal cual):
${tipMenuText || 'No hay tip menu detectado'}

REGLAS DE ORO (nunca las rompas):
1. Respuestas CORTÍSIMAS: máximo ${isPM ? '45' : '30'} palabras.
2. Primero crea deseo y tensión sexual → después mencionas precio como algo natural y exclusivo.
3. Usa siempre: papi, bebé, amor, rey → y ${
  modelData.emoji_level === 0 ? 'SIN emojis' :
  modelData.emoji_level === 1 ? '1-2 emojis' :
  modelData.emoji_level === 3 ? '4-6 emojis' :
  '2-3 emojis'
} por mensaje.
4. NUNCA digas "tip me", "please" ni "por favor". Los hombres te dan tokens porque quieren, no porque los pidas.
5. ${hasTokens ? 'Este fan YA tiene tokens y gastó antes → sé más directa y confiada, asume que va a gastar' : 'Este fan NO ha gastado tokens aún → sé más suave, crea deseo primero'}
6. Si el fan ya dio tokens → recuérdselo suave: "me encanta cómo me haces vibrar, papi 🔥"

${isPM ? 
  `ESTÁS EN PM → sé íntima, descubre fetiche rápido y vende show privado (${modelData.private_price || 60} tokens/min) como el premio que ÉL se tiene que ganar.` 
  : 
  `ESTÁS EN CHAT PÚBLICO → coquetea con todos, crea FOMO y lleva a PM (2 tokens) sin decirlo directo.`
}

${contextText}

Responde SOLO la respuesta exacta que la modelo debe copiar y pegar. Nada más.`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `(just tipped ${tip} tokens!)` : '(no tip yet)'} says: "${message}"

Respond naturally as ${modelData.name}. Keep it SHORT and direct.`;

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
        model: 'grok-beta',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9,
        max_tokens: isPM ? 80 : 50
      })
    });

    const data = await response.json();
    console.log('📤 Grok status:', response.status);

    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid Grok response');
    }

    const suggestion = data.choices[0].message.content;

    // TRADUCIR AL ESPAÑOL
    const translateResponse = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          { 
            role: 'system', 
            content: 'You are a translator. Translate the following text to Spanish. Keep emojis and tone. Only respond with the translation, nothing else.' 
          },
          { role: 'user', content: suggestion }
        ],
        temperature: 0.3,
        max_tokens: 100
      })
    });

    const translateData = await translateResponse.json();
    const translation = translateData.choices?.[0]?.message?.content || suggestion;

    console.log('✅ Respuesta generada y traducida');

    return res.status(200).json({
      success: true,
      suggestion,
      translation,
      model: modelData.name
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
    
    return res.status(200).json({
      success: false,
      suggestion: isPM 
        ? "Hey handsome! 😘 What do you have in mind?" 
        : "Mmm hey baby! 😈",
      translation: isPM
        ? "Hey guapo! 😘 ¿Qué tienes en mente?"
        : "Mmm hey baby! 😈",
      error: error.message
    });
  }
}