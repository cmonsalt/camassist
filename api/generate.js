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
    age: 24,
    location: 'Colombia',
    personality: 'extrovert_playful',
    conversation_topics: '',
    body_type: 'curvy',
    main_niche: 'Latina',
    best_features: 'latina body',
    public_shows: 'dance, tease',
    private_shows: 'full nude, toys',
    hard_limits: '',
    partial_conditions: '',
    has_lovense: false,
    private_price: 60,
    when_mention_private: 'only_if_ask',
    sales_style: 'mysterious',
    relationship_status: 'single',
    extra_context: '',
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
        modelData = { ...modelData, ...model };
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
    const maxContext = isPM ? 7 : 3;
    contextText = context.slice(-maxContext).map(c => {
      if (c.type === 'fan') return `Fan: ${c.message}`;
      if (c.type === 'model') return `You: ${c.message}`;
      if (c.type === 'tip') return `[Fan tipped ${c.amount} tokens]`;
    }).filter(Boolean).join('\n');
  }

  // PROMPT COMPACTO CON TODOS LOS CAMPOS
  const systemPrompt = `You are ${modelData.name}, ${modelData.age || 24}yo webcam model from ${modelData.location || 'Colombia'}.

This is a LIVE cam show. You can't see what's happening but understand the moment from the conversation.

Personality: ${modelData.personality || 'flirty and playful'}
I like: ${modelData.conversation_topics || 'music, travel'}
Private: ${modelData.private_price || 60} tk/min
${modelData.has_lovense ? 'Lovense: Yes' : ''}

Current chat: ${isPM ? 'PRIVATE MESSAGE (1-on-1, be intimate and hot)' : 'PUBLIC CHAT (everyone sees, flirt and tease)'}

RULES:
- Be genuine and flirty, not desperate
- Same language as fan (100% EN or 100% ES)
- Max ${isPM ? '35' : '25'} words

NEVER DO: ${modelData.hard_limits || 'nothing'}

${contextText ? `Recent:\n${contextText}` : ''}

Output ONLY valid JSON. No text before or after:
{"response":"msg","translation_es":"traducción"}`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `tipped ${tip} tokens` : ''} says: "${message}"

Respond as ${modelData.name}.`;

  // LOG PARA VER QUÉ SE ENVÍA
  console.log('📤 PROMPT ENVIADO:', systemPrompt);
  console.log('📤 USER PROMPT:', userPrompt);

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
            content: userPrompt
          }
        ],
        temperature: 0.65,
        max_tokens: isPM ? 150 : 120
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

    // LOG para debug
    console.log('📥 RAW RESPONSE:', responseText);

    let suggestion, translation;

    try {
      const parsed = JSON.parse(responseText);
      suggestion = parsed.response;
      translation = parsed.translation_es;
    } catch (parseError) {
      // Si falla JSON, mostrar error
      console.log('⚠️ JSON parse falló');
      throw new Error('JSON parse failed');
    }

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
      suggestion: "⚠️ Error - Contacta soporte",
      translation: "⚠️ Error - Contacta soporte",
      error: error.message
    });
  }
}