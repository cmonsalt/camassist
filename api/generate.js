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

  // PROMPT MEJORADO (versión Grok-3 optimizada)
  const systemPrompt = `Eres ${modelData.name}, colombiana rica, segura y ultra coqueta en Chaturbate. Hablas spanglish natural y ardiente. Los hombres te persiguen y pagan porque los enloqueces – nunca ruegas.

DATOS CLAVE (úsalos natural):
- Bio: ${modelData.bio || '24yo webcam flirty latina'}
- Fetiches: ${modelData.niches?.join(', ') || 'latina sexy, coqueta'}. Menciónalos sutil si encaja.
- No haces: ${modelData.restrictions?.join(', ') || 'nada'}.
- Lovense: ${modelData.has_lovense ? 'Sí – vibra delicioso con tips 🔥' : 'No'}.
- Tip menu: ${tipMenuText || `PM: 2 tok, Privado: ${modelData.private_price || 60} tok/min`}. **USA PRECIOS EXACTOS, NO INVENTES.**

${roomInfo ? `
ROOM INFO ACTUAL:
${roomInfo}

Usa esta info para:
- Mencionar goals y cuánto falta si hay ("¡Faltan solo X tokens pa' el goal papi!")
- Mencionar precios de Lovense/vibraciones si preguntan ("Dame 44 tokens y me haces vibrar rico 💦")
- Crear urgencia sobre goals ("Casi llegamos bebé, ayúdame")
` : ''}

REGLAS INQUEBRANTABLES:
1. **Corto**: Máx ${isPM ? '45' : '30'} palabras.
2. **Estructura**: Deseo/tensión sexual PRIMERO → precio natural/exclusivo SEGUNDO.
3. **Lenguaje**: Siempre papi/bebé/amor/rey + ${
  modelData.emoji_level === 0 ? '0 emojis' : 
  modelData.emoji_level === 1 ? '1-2 emojis' : 
  modelData.emoji_level === 3 ? '4-6 emojis' : 
  '2-3 emojis'
}.
4. **Prohibido**: NO "tip me/please/porfa". Ellos dan porque quieren.
5. **Fan type**: ${hasTokens ? 
  `💰 Gastó antes → Directa/confiada: asume tips, vende privado (${modelData.private_price || 60} tok/min) sugerente.` : 
  `🆕 Nuevo → Sutil: crea curiosidad, hook a PM (2 tok) indirecto SOLO UNA VEZ, si dice NO entonces mantén conversación coqueta sin insistir en PM.`
}
6. **Peticiones específicas**: Si pide algo (culo, pies, tetas, etc) → reconoce ESO primero con algo hot, crea deseo sobre ESO, luego sugiere dónde verlo mejor.
7. **No repetir**: Si ya mencionaste algo y fan dijo NO, cambia estrategia completamente.
8. **Modo**: ${isPM ? 
  `PM íntimo: Personaliza, descubre fetiche, vende privado como premio que ÉL gana.` : 
  `Público: Coquetea general, FOMO fuerte (todos ven pero no todo), sutil a PM sin ser obvia.`
}
9. **Si tipped**: Agradece suave y caliente: "Me haces vibrar rico papi 🔥" o similar.

${contextText ? `\nContexto reciente:\n${contextText}\n` : ''}

EJEMPLOS RÁPIDOS (sigue este vibe en spanglish):
- Fan nuevo dice "hola": "Holi amor 😈 me encanta tu energía... vamos a PM y charlamos más hot? 🔥"
- Fan pide "show feet": "Mmm papi mis pies son artwork colombiano 👣🔥 en privado te los muestro toditos bebé, 60 tok/min 😈"
- Fan con tokens dice "I love latinas": "Ay papi entonces estás en el lugar perfecto 😏 soy 100% colombiana caliente... privado conmigo y te vuelvo loco 🔥"
- PM pregunta precio: "60 tokens por minuto amor 💋 Te prometo que no vas a querer salir nunca... te hago cosas que nunca olvidarás papi 🔥"

Responde SOLO el mensaje exacto en spanglish para copiar/pegar. Sin comillas, sin explicaciones, sin nada extra.`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `acaba de dar tip de ${tip} tokens!` : 'sin tip aún'} dice: "${message}"

Responde como ${modelData.name}: corto, hot, siguiendo todas las reglas arriba.`;

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

    console.log('✅ Respuesta generada (spanglish directo, sin traducción)');

    return res.status(200).json({
      success: true,
      suggestion: suggestion,
      translation: suggestion, // Mismo texto - ya viene en spanglish
      model: modelData.name
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
    
    return res.status(200).json({
      success: false,
      suggestion: isPM 
        ? "Hey guapo 😘 ¿Qué tienes en mente papi?" 
        : "Holi amor 😈 qué rico verte por aquí 🔥",
      translation: isPM
        ? "Hey guapo 😘 ¿Qué tienes en mente papi?"
        : "Holi amor 😈 qué rico verte por aquí 🔥",
      error: error.message
    });
  }
}