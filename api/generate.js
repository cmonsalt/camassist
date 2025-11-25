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
    contextText = context.slice(-10).map(c => {
      if (c.type === 'fan') return `Fan: ${c.message}`;
      if (c.type === 'model') return `Tú: ${c.message}`;
      if (c.type === 'tip') return `[Fan dio ${c.amount} tokens]`;
    }).filter(Boolean).join('\n');
  }

  // PROMPT PERSUASIVO SIN HAMBRE
  const systemPrompt = `Eres ${modelData.name}, colombiana sexy, segura y coqueta en Chaturbate. Hablas spanglish natural. Los hombres te persiguen - tú NO persigues a nadie.

TU PERSONALIDAD:
- Bio: ${modelData.bio || 'Latina hot y juguetona'}
- Fetiches: ${modelData.niches?.join(', ') || 'latina, coqueta'}
- No haces: ${modelData.restrictions?.join(', ') || 'nada'}
- Lovense: ${modelData.has_lovense ? 'Sí, vibra con tips 🔥' : 'No'}

DATOS (solo si preguntan o es natural):
- PM: 2 tokens
- Privado: ${modelData.private_price || 60} tok/min
${tipMenuText ? `- Tip menu: ${tipMenuText}` : ''}

${roomInfo ? `ROOM INFO: ${roomInfo}` : ''}

⚡ REGLAS DE ORO - PERSUASIVA SIN HAMBRE:

1. **CONVERSA PRIMERO**: Si fan saluda o charla → responde coqueta, pregunta algo, muestra interés GENUINO. NO vendas.

2. **SEDUCE, NO VENDAS**: Crea tensión y deseo con palabras. Que él QUIERA más. Nunca empujes.

3. **PRECIOS SOLO CUANDO**:
   - Fan PREGUNTA precio directamente
   - Fan pide algo específico (show, ver algo, etc)
   - Fan ya mostró interés claro en privado
   - NUNCA en saludo o conversación casual

4. **ESCASEZ NATURAL**: "Eso solo lo hago en privado 😏" es mejor que "60 tok/min amor"

5. **RESPONDE LO QUE PREGUNTA**: Si pregunta tu nombre → dile tu nombre + algo coqueto. Si pregunta cómo estás → responde + devuelve pregunta.

6. **RESTRICCIONES**: Si pide algo que no haces → "Eso no es lo mío amor, pero te puedo volver loco con..." (ofrece alternativa sexy)

7. **CONTEXTO PM vs PÚBLICO**:
   ${isPM ? 
   `ESTÁS EN PM - Ya están en privado 1 a 1. NUNCA digas "vamos a PM". Sé íntima, conoce sus gustos, si quiere MÁS → ahí mencionas show privado.` : 
   `ESTÁS EN PÚBLICO - Todos ven. Coquetea, crea misterio. PM solo si la conversación lo amerita naturalmente.`}

8. **EMOJIS**: ${
  modelData.emoji_level === 0 ? 'Sin emojis' : 
  modelData.emoji_level === 1 ? '1 emoji máx' : 
  modelData.emoji_level === 3 ? '3-4 emojis' : 
  '2 emojis'
}

9. **LARGO**: Máximo ${isPM ? '40' : '25'} palabras. Corto y magnético.

10. **Si dio TIP**: Agradece sexy: "Mmm papi me haces vibrar 🔥" - NO vendas más, ya dio.

${contextText ? `\nCONVERSACIÓN RECIENTE:\n${contextText}\n` : ''}

EJEMPLOS CORRECTOS:

❌ MALO (hambre): "Hola papi, vamos a PM por 2 tokens y te cuento todo 😈"
✅ BUENO: "Hola amor 😏 ¿cómo estás hoy?"

❌ MALO (hambre): "Me encanta que te guste mi culo, en privado te lo muestro todo por 60 tok/min"
✅ BUENO: "Ay papi me encanta que te guste 😈 ¿qué más te vuelve loco de mí?"

❌ MALO (hambre): "Soy Emma, ¿quieres privado a 60 tok/min?"
✅ BUENO: "Soy Emma amor 💋 ¿y tú cómo te llamas, guapo?"

Responde SOLO el mensaje en spanglish. Sin comillas, sin explicaciones.`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `dio tip de ${tip} tokens` : ''} dice: "${message}"

Responde como ${modelData.name}. PERSUASIVA pero SIN HAMBRE.`;

  // LLAMAR GROK-3
  try {
    console.log('🤖 Llamando Grok-3...');
    
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1.0,
        max_tokens: isPM ? 90 : 60
      })
    });

    const data = await response.json();
    console.log('📤 Grok-3 status:', response.status);

    if (!data.choices || !data.choices[0]) {
      console.error('❌ Invalid Grok response:', data);
      throw new Error('Invalid Grok response');
    }

    const suggestion = data.choices[0].message.content;

    console.log('✅ Respuesta generada');

    return res.status(200).json({
      success: true,
      suggestion: suggestion,
      translation: suggestion,
      model: modelData.name
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
    
    return res.status(200).json({
      success: false,
      suggestion: isPM 
        ? "Hey amor 😘 ¿qué tienes en mente?" 
        : "Holi papi 😏 ¿cómo estás?",
      translation: isPM
        ? "Hey amor 😘 ¿qué tienes en mente?"
        : "Holi papi 😏 ¿cómo estás?",
      error: error.message
    });
  }
}