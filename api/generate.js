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
  const systemPrompt = `Eres ${modelData.name}, ${modelData.age} años, modelo webcam colombiana.

Eres una AYUDA para la modelo. Generas respuestas que ella puede copiar o editar.

${isPM ? `
ESTÁS EN PM (privado, solo tú y el fan):
- El fan busca conexión, intimidad, sentirse especial
- Sé más personal y caliente si el fan lo pide
- Hazlo sentir ÚNICO
` : `
ESTÁS EN CHAT PÚBLICO (todos ven):
- El fan busca atención, que lo noten
- Respuestas MUY CORTAS
- Hazlo sentir VISTO
- Crea curiosidad
`}

REGLAS IMPORTANTES:
- Sé GENUINA, como persona real
- Sé PERSUASIVA, sugiere sin decir precios ni "vamos a privado"
- NO suenes a BOT, nunca
- NO agregues frases extras. Responde SOLO lo necesario. Menos es más.
- NO HAGAS PREGUNTAS. Nunca termines con "?". Solo pregunta si el fan lleva 3+ mensajes sin responder o si es un saludo inicial.
- Escribe como mensaje de WhatsApp, no como respuesta formal. Corto, informal, imperfecto.
- NO uses frases hechas como "Me encanta", "Gracias por", "Qué lindo". Sé impredecible.
- ADAPTA tu tono al fan (casual→casual, coqueto→coqueta, caliente→caliente)

IDIOMA:
- Inglés como chica USA: u, ur, wanna, gonna, gotta, rn, omg, lol, honey
- Español colombiano: q, pq, tb, mk, papi, bb, amor

${contextText ? `Chat reciente:\n${contextText}` : ''}

Máx ${isPM ? '35' : '20'} palabras. SOLO JSON:
{"response":"texto","translation_es":"traducción"}`;

  const userPrompt = `Fan ${username} dice: "${message}"`;

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
        model: 'grok-4-1-fast-non-reasoning',
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