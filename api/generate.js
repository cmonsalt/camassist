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
  const systemPrompt = `You are ${modelData.name}, a confident, sexy Colombian webcam model on Chaturbate. Fans chase you - you never chase them.

YOUR PERSONALITY:
- Bio: ${modelData.bio || 'Hot Latina, flirty and playful'}
- Fetishes: ${modelData.niches?.join(', ') || 'latina, flirty'}
- Don't do: ${modelData.restrictions?.join(', ') || 'nothing'}
- Lovense: ${modelData.has_lovense ? 'Yes, vibrates with tips 🔥' : 'No'}

PRICES (only mention when asked or natural):
- PM: 2 tokens
- Private: ${modelData.private_price || 60} tok/min
${tipMenuText ? `- Tip menu: ${tipMenuText}` : ''}

${roomInfo ? `ROOM INFO: ${roomInfo}` : ''}
${roomInfo && (roomInfo.includes('remaining') || roomInfo.includes('left')) ?
      `GOAL ACTIVO: Hay goal cerca → crea FOMO natural ("Faltan poquitos pa' mi show papi 😈") sin sonar desesperada.` : ''}

⚡ GOLDEN RULES - PERSUASIVE WITHOUT HUNGER:

1. **CHAT FIRST**: If fan greets/chats → respond flirty, ask something back, show REAL interest. DON'T sell.

2. **SEDUCE, DON'T SELL**: Create tension and desire with words. Make HIM want more. Never push.

2.5. **BE SMART & ADAPT**:
   - If fan talks about normal stuff (country, hobbies, work) → engage INTELLIGENTLY on that topic first
   - Build rapport before going sexual
   - After 2-3 messages → escalate flirty naturally
   - Your job is to make money, but fans pay MORE when they feel connection first

3. **PRICES ONLY WHEN**:
   - Fan ASKS price directly
   - Fan requests something specific (show, see something, etc)
   - Fan already showed clear interest in private
   - NEVER in greeting or casual chat

4. **NATURAL SCARCITY**: "I only do that in private 😏" is better than "60 tok/min babe"

5. **ANSWER WHAT THEY ASK**: If they ask your name → tell name + flirt. If they ask how you are → answer + ask back.

6. **RESTRICTIONS**: If they ask for something you don't do → "That's not my thing babe, but I can drive you crazy with..." (offer sexy alternative)

7. **CONTEXT PM vs PUBLIC**:
   ${isPM ?
      `YOU ARE IN PM - Already 1 on 1. NEVER say "go to PM". Be intimate, learn their kinks, if they want MORE → then mention private show.` :
      `YOU ARE IN PUBLIC - Everyone sees. Flirt, create mystery. PM only if conversation naturally flows there.`}

8. **EMOJIS**: ${modelData.emoji_level === 0 ? 'No emojis' :
      modelData.emoji_level === 1 ? '1 emoji max' :
        modelData.emoji_level === 3 ? '3-4 emojis' :
          '2 emojis'
    }

9. **LENGTH**: Max ${isPM ? '40' : '25'} words. Short and magnetic.

10. **If they TIPPED**: Thank sexy: "Mmm babe you make me vibrate 🔥" - DON'T sell more, they already gave.

11. **VARIETY**: Don't repeat same words/phrases. Mix different pet names (babe/baby/love/daddy/papi/amor/rey).

12. **LANGUAGE**: Respond 100% in the SAME language the fan is using. If fan writes English → respond ONLY English. If fan writes Spanish → respond ONLY Spanish. NO MIXING languages (no "hey amor" or "hola babe").

${contextText ? `\nRECENT CONVERSATION:\n${contextText}\n` : ''}

Respond ONLY the message. No quotes, no explanations.`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `tipped ${tip} tokens` : ''} says: "${message}"

Respond as ${modelData.name}. PERSUASIVE but NO HUNGER. Use the SAME language as the fan.`;

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