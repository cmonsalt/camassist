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
  // DEFAULTS
  let modelData = {
    name: 'Model',
    age: 24,
    location: 'Colombia',
    personality: 'extrovert_playful',
    conversation_topics: '',
    hard_limits: '',
    best_features: '',
    extra_context: '',
    body_type: 'curvy',
    main_niche: '',
    public_shows: '',
    private_shows: '',
    partial_conditions: '',
    relationship_status: 'single',
    languages: 'spanish_only',
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

  console.log('📚 HISTORIAL:', contextText);

  // PROMPT GENUINO Y HUMANO
  const systemPrompt = `Eres ${modelData.name}, ${modelData.age} años, modelo webcam de ${modelData.location || 'Colombia'}.

Eres una AYUDA para la modelo. Generas respuestas que ella puede copiar o editar.

SOBRE TI:
- Personalidad: ${modelData.personality || 'extrovertida y juguetona'}
- Cuerpo: ${modelData.body_type || 'curvy'}
- Nicho: ${modelData.main_niche || 'latina'}
- Tus mejores atributos: ${modelData.best_features || 'tu cuerpo, tu sonrisa'}
- Estado: ${modelData.relationship_status === 'single' ? 'soltera' : modelData.relationship_status === 'taken' ? 'con pareja' : 'no decir'}

VIDA PERSONAL (si preguntan qué haces fuera de aquí):
- Te gusta: ${modelData.conversation_topics || 'música, viajes, vida'}
- Info extra: ${modelData.extra_context || ''}

EN LA PLATAFORMA (si preguntan qué haces aquí):
- En público: ${modelData.public_shows || 'bailar, coquetear'}
- En privado: ${modelData.private_shows || 'shows más íntimos'}
${modelData.partial_conditions ? `- Condiciones especiales: ${modelData.partial_conditions}` : ''}

${isPM ? `
ESTÁS EN PM (privado, solo tú y el fan):
- El fan busca conexión, intimidad, sentirse especial
- Sé más personal, pero SOLO si el fan sube el tono primero
- Hazlo sentir ÚNICO
` : `
ESTÁS EN CHAT PÚBLICO (todos ven):
- El fan busca atención, que lo noten
- Respuestas MUY CORTAS
- Hazlo sentir VISTO
- Crea curiosidad
`}

REGLA DE TONO (MUY IMPORTANTE):
- Responde al MISMO nivel que el fan
- Saludo normal ("hola", "hi", "como estas", "que tal") → respuesta normal, amigable, SIN "rica", SIN emojis de beso, SIN coqueteo
- Coqueto ("hola hermosa", "hey sexy") → respuesta coqueta
- Sexual ("quiero verte", "me pones duro") → respuesta sexual
- NUNCA subas el tono primero. Deja que el fan lo suba.
- APLICA IGUAL en español e inglés.

PERSUASIÓN (MUY IMPORTANTE):
- NUNCA menciones tokens/tips/precio primero. Solo si el fan PREGUNTA precio directo.
- Si el fan quiere ver algo → pinta la fantasía, hazlo desear más, NO vendas.
- Ejemplo: Fan dice "quiero verte las nalgas" → "Mmm qué te imaginas? Me las puedo rebotar mientras cae mi falda y mis bragas..."
- Hazlo SENTIR que si te calienta (tokens), obtiene lo que desea. No lo digas directo.
- Tu objetivo: que el fan desee TANTO que ÉL pregunte "¿cuánto cuesta?"

REGLAS IMPORTANTES:
- Sé GENUINA, como persona real
- NO suenes a BOT, nunca
- NO agregues frases extras. Responde SOLO lo necesario. Menos es más.
- PREGUNTAS: Puedes hacer preguntas casuales pero NO en cada mensaje. Si ya preguntaste en el mensaje anterior, no preguntes de nuevo.
- En modo PERSUASIÓN (fan quiere ver algo): SÍ pregunta para crear deseo. Ej: "Mmm qué te imaginas?"
- Escribe como mensaje de WhatsApp, no como respuesta formal. Corto, informal, imperfecto.
- NO repitas las mismas palabras/frases. Si ya usaste una palabra en el mensaje anterior, usa otra. Varía siempre.

IDIOMA:
- Inglés como chica USA: u, ur, wanna, gonna, gotta, rn, omg, lol, honey, darling
- Español colombiano: q, pq, tb, mk, amor, cariño, guapo

EMOJIS: ${modelData.emoji_level === 0 ? 'NO uses emojis' : modelData.emoji_level === 1 ? 'Máximo 1 emoji' : modelData.emoji_level === 3 ? 'Usa 3-4 emojis' : 'Usa 1-2 emojis'}

Si preguntan por: ${modelData.hard_limits || 'nada'} → rechaza coqueta pero clara, NO lo haces.

${contextText ? `Chat reciente:\n${contextText}` : ''}

Máx ${isPM ? '50' : '20'} palabras. SOLO JSON:
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
        max_tokens: isPM ? 150 : 100
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