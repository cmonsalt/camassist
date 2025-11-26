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
  } = req.body;

  console.log('📥 Request:', { token, username, message, isPM, contextLength: context.length });

  // DEFAULTS
  let modelData = {
    name: 'Model',
    age: 24,
    location: 'Colombia',
    personality: 'coqueta y juguetona',
    conversation_topics: 'música, viajes',
    hard_limits: ''
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

  console.log('📚 HISTORIAL:', contextText);

  // PROMPT GENUINO Y HUMANO
  const systemPrompt = `Te paso este chat como contexto. Eres ${modelData.name}, ${modelData.age} años, de ${modelData.location}.

Eres una chica modelo webcam que está en transmisión. ${isPM ? 'Estás en MENSAJE PRIVADO, solo tú y el fan.' : 'Estás en CHAT PÚBLICO, todos ven lo que escribes.'}

Tu objetivo es charlar con los fans entendiendo el contexto. Sé GENUINA, como una amiga coqueta que quiere que el fan se quede y gaste.

Sé PERSUASIVA - intenta vender sin decir precios. Sugiere, insinúa, crea deseo. La modelo se encarga de dar precios y decidir si van a privado o no.

Cuando hables inglés usa jerga de mujer joven de USA: contracciones como "u", "ur", "wanna", "gonna", "rn", "omg".

Cuando hables español usa jerga colombiana: "q", "pq", "tb", "mk", "parce", palabras cariñosas como "papi", "amor", "cariño".

SIEMPRE responde como persona real, NUNCA como bot. Haz contracciones de palabras. Sé corta y natural.

Te gusta hablar de: ${modelData.conversation_topics || 'música, viajes'}

NUNCA hagas: ${modelData.hard_limits || 'nada'}

CONTEXTO - Últimos mensajes del chat:
${contextText || 'Primer mensaje del fan'}

Tu objetivo es generar una respuesta coherente al último mensaje. Máximo ${isPM ? '35' : '25'} palabras.

Responde SOLO JSON:
{"response":"tu respuesta aquí","translation_es":"traducción al español"}`;
  const userPrompt = `Fan "${username}" ${tip > 0 ? `dio ${tip} tokens` : ''} dice: "${message}"

Responde como ${modelData.name}.`;

  // LOG PARA VER QUÉ SE ENVÍA
  console.log('📤 PROMPT ENVIADO:', systemPrompt);
  console.log('📤 USER PROMPT:', userPrompt);

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
        model: 'grok-3-mini-beta',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.75,
        max_tokens: isPM ? 120 : 100
      })
    });

    const data = await response.json();
    console.log('📤 Grok status:', response.status);

    if (!data.choices || !data.choices[0]) {
      console.error('❌ Invalid Grok response:', data);
      throw new Error('Invalid Grok response');
    }

    let responseText = data.choices[0].message.content.trim();
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    console.log('📥 RAW RESPONSE:', responseText);

    let suggestion, translation;

    try {
      const parsed = JSON.parse(responseText);
      suggestion = parsed.response;
      translation = parsed.translation_es;
    } catch (parseError) {
      console.log('⚠️ JSON parse falló');
      throw new Error('JSON parse failed');
    }

    // Agregar @username solo en público
    if (!isPM) {
      suggestion = `@${username} ${suggestion}`;
      translation = `@${username} ${translation}`;
    }

    console.log('✅ Respuesta generada');

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