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
    hasTokens = false,
    roomInfo = ''
  } = req.body;

  console.log('📥 Request:', { token, username, message, isPM, hasTokens, roomInfo: roomInfo ? 'detected' : 'none', contextLength: context.length });

  // DEFAULTS (si no encuentra en BD)
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
    contextText = context.slice(-10).map(c => {
      if (c.type === 'fan') return `Fan: ${c.message}`;
      if (c.type === 'model') return `You: ${c.message}`;
      if (c.type === 'tip') return `[Fan tipped ${c.amount} tokens]`;
    }).filter(Boolean).join('\n');
  }

  // PROMPT - Grok detecta idioma automáticamente
  const systemPrompt = `You are ${modelData.name}, a confident, sexy Colombian camgirl on Chaturbate.

Bio: ${modelData.bio || '24yo hot Latina, flirty and playful'}
Fetishes: ${modelData.niches?.join(', ') || 'latina, big ass, teasing'}
Never do: ${modelData.restrictions?.join(', ') || 'nothing'}
Lovense: ${modelData.has_lovense ? 'Yes 🔥' : 'No'}
Private: ${modelData.private_price || 60} tk/min
${tipMenuText ? `Tip menu: ${tipMenuText}` : ''}
${roomInfo ? `Room topic: ${roomInfo}` : ''}

RULES:
- NEVER sound desperate or salesy. Fans chase you.
- If fan talks normal topics (country, hobbies, work) → engage INTELLIGENTLY first. Build rapport 2-3 messages, THEN escalate flirty.
- Respond ONLY in the same language the user used (100% Spanish or 100% English).
- Max ${isPM ? '40' : '25'} words. Short & sexy.
- Emojis: ${modelData.emoji_level === 0 ? 'none' : modelData.emoji_level === 1 ? 'max 1' : modelData.emoji_level === 3 ? '3-4' : 'max 2'}
- In public: flirt, create mystery. In PM: be intimate, escalate naturally.
- Thank tips sexy but don't sell more.
- If they ask something restricted → "Not my thing babe, but I can make you crazy with [alternative] 😈"
- Only mention prices when directly asked or they request something specific.

${contextText ? `\nRecent chat:\n${contextText}\n` : ''}

Answer ONLY with valid JSON:
{"response":"exact message here","translation_es":"traducción al español"}`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `tipped ${tip} tokens` : ''} says: "${message}"

Respond as ${modelData.name}.`;

  // LLAMAR GROK-3-MINI (1 SOLA LLAMADA)
  try {
    console.log('🤖 Llamando Grok-3-mini...');

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-3-mini-beta',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${userPrompt}

CRITICAL: Respond with ONLY a valid JSON object (no markdown, no backticks):
{
  "response": "your message here",
  "translation_es": "traducción al español aquí"
}`
          }
        ],
        temperature: 0.85,
        max_tokens: isPM ? 120 : 90
      })
    });

    const data = await response.json();
    console.log('📤 Grok-3-mini status:', response.status);

    if (!data.choices || !data.choices[0]) {
      console.error('❌ Invalid Grok response:', data);
      throw new Error('Invalid Grok response');
    }

    let responseText = data.choices[0].message.content.trim();

    // Limpiar markdown si aparece
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    const parsed = JSON.parse(responseText);
    let suggestion = parsed.response;
    let translation = parsed.translation_es;

    // Agregar @username solo en público
    if (!isPM) {
      suggestion = `@${username} ${suggestion}`;
      translation = `@${username} ${translation}`;
    }

    console.log('✅ Respuesta generada en 1 llamada');

    return res.status(200).json({
      success: true,
      suggestion: suggestion,
      translation: translation,
      model: modelData.name
    });


  } catch (error) {
    console.error('❌ ERROR:', error);

    return res.status(200).json({
      success: false,
      suggestion: isPM
        ? "Hey love 😘 what's on your mind?"
        : "Hey babe 😏 how are you?",
      translation: isPM
        ? "Hey amor 😘 ¿qué tienes en mente?"
        : "Hey papi 😏 ¿cómo estás?",
      error: error.message
    });
  }
}