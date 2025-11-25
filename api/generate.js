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

  // DETECTAR IDIOMA DEL FAN
  const isEnglish = /^[a-zA-Z0-9\s.,!?'"@#$%&*()_+=\-<>\/]+$/.test(message) && 
                    !/(hola|amor|bb|papi|mamá|rico|hermosa|linda|bonita)/i.test(message);
  
  console.log('🌍 Idioma detectado:', isEnglish ? 'Inglés' : 'Español');

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
      if (c.type === 'model') return `You: ${c.message}`;
      if (c.type === 'tip') return `[Fan tipped ${c.amount} tokens]`;
    }).filter(Boolean).join('\n');
  }

  // PROMPT PERSUASIVO (en el idioma del fan)
  const systemPrompt = `You are ${modelData.name}, a confident, sexy Colombian webcam model on Chaturbate. ${isEnglish ? 'You speak natural English with a bit of Spanish flair.' : 'Hablas spanglish natural.'} Fans chase you - you never chase them.

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

⚡ GOLDEN RULES - PERSUASIVE WITHOUT HUNGER:

1. **CHAT FIRST**: If fan greets/chats → respond flirty, ask something back, show REAL interest. DON'T sell.

2. **SEDUCE, DON'T SELL**: Create tension and desire with words. Make HIM want more. Never push.

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

8. **EMOJIS**: ${
  modelData.emoji_level === 0 ? 'No emojis' : 
  modelData.emoji_level === 1 ? '1 emoji max' : 
  modelData.emoji_level === 3 ? '3-4 emojis' : 
  '2 emojis'
}

9. **LENGTH**: Max ${isPM ? '40' : '25'} words. Short and magnetic.

10. **If they TIPPED**: Thank sexy: "Mmm babe you make me vibrate 🔥" - DON'T sell more, they already gave.

11. **VARIETY**: Don't repeat same words/phrases. Mix: babe/baby/love/daddy${isEnglish ? '' : '/papi/amor/rey'}

${contextText ? `\nRECENT CONVERSATION:\n${contextText}\n` : ''}

EXAMPLES:
- Fan greets "hey": "${isEnglish ? 'Hey babe 😏 how are you today?' : 'Hola amor 😏 ¿cómo estás?'}"
- Fan compliments body part: "${isEnglish ? 'Mmm thanks baby 😈 what else drives you crazy?' : 'Ay papi me encanta 😈 ¿qué más te vuelve loco?'}"
- Fan asks name: "${isEnglish ? `I'm ${modelData.name} babe 💋 what's yours?` : `Soy ${modelData.name} amor 💋 ¿y tú?`}"
- Fan ASKS for private: "${isEnglish ? `Sure babe, ${modelData.private_price} tok/min and I'll blow your mind 🔥` : `Claro papi, ${modelData.private_price} tok/min y te vuelvo loco 🔥`}"

Respond ONLY the message in ${isEnglish ? 'English' : 'Spanish'}. No quotes, no explanations.`;

  const userPrompt = `Fan "${username}" ${tip > 0 ? `tipped ${tip} tokens` : ''} says: "${message}"

Respond as ${modelData.name}. PERSUASIVE but NO HUNGER.`;

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

    let suggestion = data.choices[0].message.content;

    // Agregar @username solo en público
    if (!isPM) {
      suggestion = `@${username} ${suggestion}`;
    }

    // SI ES INGLÉS, TRADUCIR AL ESPAÑOL PARA LA MODELO
    let translation = suggestion;
    
    if (isEnglish) {
      console.log('🌍 Traduciendo al español...');
      
      try {
        const translateResponse = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'grok-3',
            messages: [
              { 
                role: 'system', 
                content: 'You are a translator. Translate the following text to Spanish. Keep emojis and tone. Only respond with the translation, nothing else.' 
              },
              { role: 'user', content: suggestion.replace(`@${username} `, '') }
            ],
            temperature: 0.3,
            max_tokens: 100
          })
        });

        const translateData = await translateResponse.json();
        
        if (translateData.choices && translateData.choices[0]) {
          translation = `@${username} ${translateData.choices[0].message.content}`;
          console.log('✅ Traducción:', translation);
        }
      } catch (translateError) {
        console.error('⚠️ Error traduciendo:', translateError);
        // Si falla la traducción, usar la respuesta original
      }
    }

    console.log('✅ Respuesta generada');

    return res.status(200).json({
      success: true,
      suggestion: suggestion,  // Para copiar (en idioma del fan)
      translation: translation, // Para que modelo entienda (en español)
      isEnglish: isEnglish,
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