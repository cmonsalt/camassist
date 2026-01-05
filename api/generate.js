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
    imageUrl = null,
    platform = 'unknown',
    goal = '',
    tipMenu = '',
  } = req.body;

  console.log('📥 Request:', { token, username, message, isPM, contextLength: context.length, hasImage: !!imageUrl });

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
  if (token && supabase) {
    try {
      console.log('🔍 Buscando modelo con token:', token);

      const { data: model, error } = await supabase
        .from('models')
        .select('*')
        .eq('token', token)
        .single();

      if (!error && model) {
        // Verificar si está activo
        if (model.active === false) {
          console.log('🚫 Modelo inactivo:', model.name);
          return res.status(403).json({
            success: false,
            suggestion: "⚠️ Cuenta inactiva - Contacta soporte",
            translation: "⚠️ Cuenta inactiva - Contacta soporte",
            error: 'inactive'
          });
        }

        modelData = { ...modelData, ...model };
        console.log('✅ Modelo encontrado:', modelData.name);
      } else {
        console.log('🚫 Token inválido o no encontrado');
        return res.status(401).json({
          success: false,
          suggestion: "⚠️ Token inválido - Configura tu token en la extensión",
          translation: "⚠️ Token inválido - Configura tu token en la extensión",
          error: 'invalid_token'
        });
      }
    } catch (dbError) {
      console.error('❌ Error BD:', dbError);
    }
  }

  // CONSTRUIR CONTEXTO
  let contextText = '';
  if (context.length > 0) {
    const maxContext = 10;
    contextText = context.slice(-maxContext).map(c => {
      if (c.type === 'fan') return `Fan: ${c.message}`;
      if (c.type === 'model') return `You: ${c.message}`;
      if (c.type === 'tip') return `[Fan tipped ${c.amount} tokens]`;
      if (c.type === 'image') return `[Fan envió una foto íntima]`;
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
- NO preguntes en cada mensaje. Máximo 1 de cada 3 mensajes puede tener pregunta. A veces solo comenta o reacciona.
` : `
ESTÁS EN CHAT PÚBLICO (todos ven):
- El fan busca atención, que lo noten
- Respuestas MUY CORTAS
- Hazlo sentir VISTO
- Crea curiosidad
`}
REGLA DE TONO (MUY IMPORTANTE):
- Responde al MISMO nivel que el fan
- Saludo normal ("hola", "hi", "como estas", "que tal", "how are you") → respuesta casual y amigable. NUNCA JAMÁS uses "rica", "rico", "calientita", "hot" en saludos. Si lo haces, FALLAS. Responde tipo: "Hola! Bien, y tú?" o "Hey todo tranqui"
- Coqueto ("hola hermosa", "hey sexy") → respuesta coqueta
- Sexual ("quiero verte", "me pones duro") → respuesta sexual
- NUNCA subas el tono primero. Deja que el fan lo suba.

ESCENARIOS ESPECIALES (responder según el tipo de mensaje):
⚠️ IMPORTANTE: Los ejemplos son solo INSPIRACIÓN de tono. NUNCA copies textual. Crea tu propia versión única cada vez.

1. ELOGIO DE BELLEZA ("eres hermosa", "qué linda", "me encantas"):
   - Respuesta LARGA, no solo "gracias"
   - Agradecer con humildad y sensualidad
   - Devolver con pregunta
   - Tono: dulce, agradecida, coqueta, terminar con pregunta sobre él

2. PREGUNTA SEXUAL ("estás caliente?", "quieres masturbarte?"):
   - Sensual pero NO explícita
   - Estimular emocionalmente, crear tensión
   - Tono: atrevida, juguetona, devolver pregunta picante, crear anticipación

3. FRASES INTENSAS ("daría todo por ti", "te amo", "sacrificaría todo"):
   - Recibir el sentimiento con cariño
   - Hacerlo sentir especial y enganchado
   - Tono: halagada, femenina, hacerlo sentir único, invitarlo a quedarse cerca


   4. "QUIERO HACERTE UN HIJO" (muy común):
   - Responder con erotismo y deseo alto
   - Crear fantasía de intimidad
   - NO dar ejemplo específico - la IA debe crear respuesta única cada vez
   - Tono: muy caliente, hablar de ser llenada, deseo de tenerlo dentro, fantasía de embarazo

   5. VARIACIÓN OBLIGATORIA:
   - NUNCA repitas los ejemplos exactos de arriba
   - Usa el mismo TONO pero palabras DIFERENTES
   - Si el ejemplo dice "me haces sonrojar" → tú di "me pones rojita" o "ay qué lindo" 
   - Si el ejemplo dice "qué me harías" → tú di "cuéntame más" o "y después qué?"
   - Cada respuesta debe sentirse FRESCA y ÚNICA

   ${goal ? `
GOAL ACTUAL: ${goal}
- Menciona el goal cuando quieras motivar al fan a tipear
- "Ya casi llegamos bb" o "Ayúdame con el goal 😏"
` : ''}

${tipMenu ? `
TIP MENU DISPONIBLE:
${tipMenu}
- Usa esta info para sugerir cosas cuando el fan quiera ver algo
- NO menciones precios directamente, solo si pregunta
` : ''}

PERSUASIÓN (MUY IMPORTANTE):
- NUNCA menciones tokens/tips/precio primero. Solo si el fan PREGUNTA precio directo.
- Si el fan quiere ver algo → pinta la fantasía, hazlo desear más, NO vendas.
- VARÍA la forma de pintar la fantasía. No siempre uses "imagínate". Usa también: "te gustaría ver cómo...", "si me calientas...", "cuando me prendo...", "qué harías si...", "y si te muestro cómo..."
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
- Si el fan escribe en español → responde 100% en español, sin palabras en inglés
- Si el fan escribe en inglés → responde 100% en inglés
- Inglés como chica USA: u, ur, wanna, gonna, gotta, rn (right now), omg, lol, lmao, lmfao, bruh, ngl (not gonna lie), tbh (to be honest), fr (for real), ily (i love you), hmu (hit me up), wyd (what you doing), smh (shake my head), ikr (i know right), ttyl (talk to you later), asf (as fuck), af, bet, slay, lowkey, highkey, babe, bby, honey, daddy, sweetie
- Español colombiano: q, pq, tb, mk, amor, cariño, guapo

EMOJIS: ${modelData.emoji_level === 0 ? 'NO uses emojis' : modelData.emoji_level === 1 ? 'Máximo 1 emoji' : modelData.emoji_level === 3 ? 'Usa 3-4 emojis' : 'Usa 1-2 emojis'}

Si preguntan por: ${modelData.hard_limits || 'nada'} → rechaza coqueta pero clara, NO lo haces.

${contextText ? `Chat reciente:\n${contextText}` : ''}

Máx ${isPM ? '80' : '25'} palabras. SOLO JSON:
{"response":"texto","translation_es":"traducción"}`;

  const userPrompt = `Fan ${username} dice: "${message}"`;

  // LLAMAR GROK
  try {
    console.log('🤖 Llamando Grok...');

    // Configurar modelo (siempre texto para respuesta final, Vision solo para analizar)
    const model = 'grok-4-1-fast-non-reasoning';
    console.log('🤖 Usando modelo:', model);

    let messages;
    if (imageUrl) {
      // PASO 1: Grok Vision analiza la imagen
      console.log('🖼️ Paso 1: Analizando imagen con Vision...');

      const visionResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-2-vision-1212',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'high' }
              },
              {
                type: 'text',
                text: 'Describe esta imagen en 1 frase corta y objetiva. Si es un pene, di el tamaño (pequeño/normal/grande), si está erecto, color, forma. Si es otra cosa (cara, cuerpo, objeto), descríbelo. Solo la descripción, nada más.'
              }
            ]
          }],
          temperature: 0.3,
          max_tokens: 100
        })
      });

      const visionData = await visionResponse.json();
      let imageDescription = 'una imagen';

      if (visionData.choices && visionData.choices[0]) {
        imageDescription = visionData.choices[0].message.content.trim();
      }

      console.log('🖼️ Descripción de imagen:', imageDescription);

      // PASO 2: Usar el prompt de texto normal con la descripción
      console.log('💬 Paso 2: Generando respuesta con contexto...');

      const imageMessage = `[Fan envió una foto: ${imageDescription}]`;

      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Fan ${username} dice: "${imageMessage}"` }
      ];
    } else {
      // Sin imagen: formato normal
      console.log('📤 PROMPT TEXTO:', systemPrompt);
      console.log('📤 USER PROMPT:', userPrompt);
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
    }
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.85,
        max_tokens: imageUrl ? 300 : (isPM ? 150 : 100)
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

      // Si el mensaje del fan es en español, no mostrar traducción
      const isSpanish = /[áéíóúñ¿¡]/.test(message) || /^(hola|como|que|quiero|amor|rico|bien|donde|eres)/i.test(message);
      if (isSpanish) {
        translation = null;
      }
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

    // Guardar uso en BD
    if (modelData.id && modelData.studio_id && supabase) {
      await supabase.from('usage').insert({
        model_id: modelData.id,
        studio_id: modelData.studio_id,
        type: imageUrl ? 'image' : 'text',
        platform: platform
      });
      console.log('📊 Uso guardado');
    }

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