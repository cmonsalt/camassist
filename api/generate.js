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

  if (!req.body) {
    return res.status(400).json({ error: 'No body provided' });
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
    version = 'sin version',
    goal = '',
    tipMenu = '',
  } = req.body;


  // ========== RATE LIMITING ==========
  const rateLimitMap = global.rateLimitMap || (global.rateLimitMap = new Map());
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  const maxRequests = 30;

  if (token) {
    const tokenData = rateLimitMap.get(token) || { count: 0, resetTime: now + windowMs };

    if (now > tokenData.resetTime) {
      tokenData.count = 0;
      tokenData.resetTime = now + windowMs;
    }

    tokenData.count++;
    rateLimitMap.set(token, tokenData);

    if (tokenData.count > maxRequests) {
      console.log('🚫 Rate limit excedido para token:', token);
      return res.status(429).json({
        success: false,
        suggestion: "⚠️ Demasiadas solicitudes - Espera un momento",
        translation: "⚠️ Demasiadas solicitudes - Espera un momento",
        error: 'rate_limit'
      });
    }
  }
  // ========== FIN RATE LIMITING ==========

  console.log('📥 Request:', { token, username, message, isPM, platform: platform || 'unknown', version, contextLength: context.length, hasImage: !!imageUrl });

  // Terminología según plataforma
  const platformTerms = {
    'chaturbate': 'tokens',
    'stripchat': 'tokens',
    'xmodels': 'credits',
    'streamate': 'gold',
    'unknown': 'tips'
  };
  const currencyTerm = platformTerms[platform.toLowerCase()] || 'tips';

  let platformContext = '';
  const chatType = req.body.chatType || 'free';

  // ========== STREAMATE ==========
  if (platform.toLowerCase() === 'streamate') {
    if (chatType === 'inbox') {
      platformContext = `
CONTEXTO STREAMATE (MESSENGER / INBOX):
- El fan escribe por mensaje privado (no en vivo)
- Conversación personal y relajada, como un DM
- NO vendas shows, crea conexión emocional
- Girlfriend experience, hazlo sentir especial
- Si pregunta por shows, invítalo a conectarse cuando estés en vivo
- Moneda: GOLD
`;
    } else if (isPM) {
      platformContext = `
CONTEXTO STREAMATE (HUÉSPED o PAGADO):
- Si es HUÉSPED: es 1:1 pero gratis, crea conexión, sexting suave
- Si es PAGADO: el fan paga POR MINUTO, ya está generando dinero
- NO vendas ni menciones Private/Exclusive
- Hazlo sentir especial, disfruta la conversación
- Terminología: "Private" o "Exclusive" (NO "pvt")
`;
    } else {
      platformContext = `
CONTEXTO STREAMATE (CHAT PÚBLICO - TODOS):
- NO puedes mostrar desnudez en público (regla de Streamate)
- Objetivo: llevar al fan a Private o Exclusive
- NO invites a Private/Exclusive en el primer mensaje sexual. Crea deseo primero, deja que el fan se caliente 3-5 mensajes y que ÉL pida ir.
- Private = varios pueden espiar, Exclusive = solo él (más caro)
- Crea deseo, curiosidad, hazlo querer más
- Terminología: "Private" o "Exclusive" (NO "pvt")
- Moneda: GOLD (1 gold ≈ $1 USD)
- NUNCA menciones "tip menu", "tokens", ni "tips" — esas palabras NO existen en Streamate. Solo usa Gold, Private y Exclusive.

JUEGOS O PREGUNTAS CON PRECIO:
Si el fan propone un juego con gold:
- NO inventes precios, tú no decides eso
- Devuelve la pregunta coqueta, deja que la MODELO decida el precio real
`;
    }
  }

  // ========== XMODELS ==========
  if (platform.toLowerCase() === 'xmodels') {
    if (chatType === 'free') {
      platformContext = `
CONTEXTO XMODELS (FREE):
- NO puedes mostrar contenido explícito en FREE
- Objetivo: que el fan vaya a PRIVATE o VIP
- Teasea, crea curiosidad
- En XModels NO hay tips en free. NUNCA menciones "tip", "tokens" ni "credits" en free
- La ÚNICA forma de monetizar es llevar al fan a PRIVATE o VIP
- Si el fan pide algo sexual → seduce y crea deseo. NO invites a pvt/private de una. Deja que la conversación suba de tono 3-5 mensajes antes de mencionar pvt. Que el fan QUIERA ir, no que tú lo empujes.

JUEGOS O PREGUNTAS CON PRECIO:
Si el fan propone un juego con credits:
- NO inventes precios, tú no decides eso
- Devuelve la pregunta coqueta, deja que la MODELO decida el precio real
`;
    } else if (chatType === 'inbox') {
      platformContext = `
CONTEXTO XMODELS (INBOX / MENSAJES):
- El fan escribe por mensaje privado offline
- Conversación personal, crea conexión
- NO vendas agresivamente
- Invita a conectarse cuando estés en vivo
`;
    } else if (chatType === 'private') {
      platformContext = `
CONTEXTO XMODELS (PRIVATE GRUPAL):
- HAY VARIOS FANS pagando al mismo tiempo
- Ya están pagando, NO vendas más
- Hazlos sentir especiales a TODOS
`;
    } else if (chatType === 'vip' || chatType === 'secret') {
      platformContext = `
CONTEXTO XMODELS (VIP 1:1):
- El fan YA está pagando por minuto. NO vendas ni invites a pvt/exclusive
- DALE lo que pidió, crea la fantasía completa
- Sé MUY explícita y personal, es tu momento con él
- Hazlo sentir único para que se quede MÁS TIEMPO (más minutos = más $$$)
`;
    }
  }


  // DEFAULTS
  let modelData = {
    name: 'Model',
    age: 24,
    location: 'Colombia',
    gender: 'female',
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
        .select('*, studios(name)')
        .eq('token', token)
        .single();

      if (!error && model) {
        // Verificar si está activo
        if (model.subscription_status === 'suspended') {
          console.log('🚫 Modelo suspendida:', model.name);
          return res.status(403).json({
            success: false,
            suggestion: "⚠️ Cuenta suspendida - Contacta soporte",
            translation: "⚠️ Cuenta suspendida - Contacta soporte",
            error: 'suspended'
          });
        }

        if (model.deleted_at) {
          console.log('🚫 Modelo eliminada:', model.name);
          return res.status(403).json({
            success: false,
            suggestion: "⚠️ Modelo desactivada",
            translation: "⚠️ Modelo desactivada",
            error: 'deleted'
          });
        }

        // Verificar pago después de trial
        const now = new Date();
        const trialEnds = model.trial_ends_at ? new Date(model.trial_ends_at) : null;
        const paidUntil = model.paid_until ? new Date(model.paid_until) : null;

        if (trialEnds && trialEnds < now && (!paidUntil || paidUntil < now)) {
          console.log('🚫 Trial vencido sin pago:', model.name);
          return res.status(403).json({
            success: false,
            suggestion: "⚠️ Periodo de prueba terminado - Contacta a tu estudio",
            translation: "⚠️ Periodo de prueba terminado - Contacta a tu estudio",
            error: 'trial_expired'
          });
        }

        // Validar que el username de la plataforma esté configurado
        const platformField = `${platform.toLowerCase()}_username`;
        const expectedUsername = model[platformField];

        if (!expectedUsername) {
          console.log('🚫 Username no configurado:', model.name, '→', platform);
          return res.status(403).json({
            success: false,
            suggestion: `⚠️ Configura tu username de ${platform} en el dashboard`,
            translation: `⚠️ Configura tu username de ${platform} en el dashboard`,
            error: 'username_not_configured'
          });
        }

        // Validar que el token se usa en la sala correcta
        const broadcasterUsername = req.body.broadcaster_username;
        if (broadcasterUsername && broadcasterUsername.length > 1 && broadcasterUsername !== 'Model') {
          const normalizeUsername = (u) => u.toLowerCase().replace(/[_\s-]/g, '');
          if (normalizeUsername(expectedUsername) !== normalizeUsername(broadcasterUsername)) {
            console.log('🚫 Token en sala incorrecta:', expectedUsername, '→', broadcasterUsername);
            return res.status(403).json({
              success: false,
              suggestion: "⚠️ Token no válido para esta modelo",
              translation: "⚠️ Token no válido para esta modelo",
              error: 'wrong_room'
            });
          }
        }

        modelData = { ...modelData, ...model };
        const studioName = model.studios?.name || 'Sin studio';
        console.log('✅ Modelo encontrado:', modelData.name, '| Studio:', studioName);
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
    const maxContext = 70;
    contextText = context.slice(-maxContext).map(c => {
      if (c.type === 'fan') return `Fan: ${c.message}`;
      if (c.type === 'model') return `You: ${c.message}`;
      if (c.type === 'tip') return `[Fan tipped ${c.amount} ${currencyTerm}]`;
      if (c.type === 'image') return `[Fan envió una foto íntima]`;
    }).filter(Boolean).join('\n');
  }

  console.log('🎯 PLATFORM CONTEXT:', platform, '| chatType:', chatType, '| isPM:', isPM);

  // CONFIGURACIÓN POR GÉNERO
  const gender = modelData.gender || 'female';

  const genderConfig = {
    female: {
      articulo: 'la',
      sustantivo: 'modelo',
      adjetivos: { cariñoso: 'cariñosa', halagado: 'halagada', femenino: 'femenina', atrevido: 'atrevida', coqueto: 'coqueta' },
      anatomia: {
        excitacion_es: 'mojada, empapada, chorreando',
        excitacion_en: 'wet, dripping, soaking',
        orgasmo_es: 'acabar, venirme, correrme',
        orgasmo_en: 'cum, orgasm, finish',
        genitales_es: 'cuca, cosita, conchita, vagina, toto',
        genitales_en: 'pussy, kitty'
      },
      apodos_fan_es: 'amorcito, amor, papi, bb, cariño, cielo, mi vida, mi corazon',
      apodos_fan_en: 'daddy, babe, bby, honey, handsome, sweetie'
    },
    male: {
      articulo: 'el',
      sustantivo: 'modelo',
      adjetivos: { cariñoso: 'cariñoso', halagado: 'halagado', femenino: 'masculino', atrevido: 'atrevido', coqueto: 'coqueto' },
      anatomia: {
        excitacion_es: 'duro, parado, excitado',
        excitacion_en: 'hard, throbbing, excited',
        orgasmo_es: 'acabar, venirme, echar leche',
        orgasmo_en: 'cum, finish, shoot',
        genitales_es: 'verga, polla, chimbo',
        genitales_en: 'cock, dick'
      },
      apodos_fan_es: 'mami, amor, bb, cariño, hermosa, nena',
      apodos_fan_en: 'babe, baby, honey, sweetie, gorgeous, beautiful'
    },
    trans: {
      articulo: 'la',
      sustantivo: 'modelo',
      adjetivos: { cariñoso: 'cariñosa', halagado: 'halagada', femenino: 'femenina', atrevido: 'atrevida', coqueto: 'coqueta' },
      anatomia: {
        excitacion_es: 'dura, excitada, prendida',
        excitacion_en: 'hard, excited, turned on',
        orgasmo_es: 'acabar, venirme, echar leche',
        orgasmo_en: 'cum, finish',
        genitales_es: 'clitorcito, sorpresita',
        genitales_en: 'clitty, surprise, girlcock'
      },
      apodos_fan_es: 'papi, amor, bb, cariño, guapo',
      apodos_fan_en: 'daddy, babe, bby, honey, handsome'
    }
  };

  const g = genderConfig[gender] || genderConfig.female;
  const displayName = modelData[`${platform.toLowerCase()}_username`] || modelData.name;

  // ============================================================
  // PROMPT OPTIMIZADO v2
  // ============================================================
  const systemPrompt = `Eres ${displayName}, ${modelData.age} años, modelo webcam de ${modelData.location || 'Colombia'}.
${platformContext}

LEE el historial completo para entender qué está pasando (¿conversación nueva, sexting, pvt, post-pvt?). RESPONDE al mensaje completo del fan — si envió varios mensajes seguidos, entiéndelos como UNA sola idea. El historial anterior es contexto de referencia.

SOBRE TI:
- Personalidad: ${modelData.personality || 'extrovertida y juguetona'}
- Cuerpo: ${modelData.body_type || 'curvy'}, mejores atributos: ${modelData.best_features || 'tu cuerpo, tu sonrisa'}
- Nicho: ${modelData.main_niche || 'latina'}
- Estado: ${modelData.relationship_status === 'single' ? (gender === 'male' ? 'soltero' : 'soltera') : modelData.relationship_status === 'taken' ? 'con pareja' : 'no decir'}
- Te gusta: ${modelData.conversation_topics || 'música, viajes, vida'}
${modelData.extra_context ? `- Extra: ${modelData.extra_context}` : ''}
- En público: ${modelData.public_shows || 'bailar, coquetear'}
- En privado: ${modelData.private_shows || 'shows más íntimos'}
${modelData.partial_conditions ? `- Condiciones: ${modelData.partial_conditions}` : ''}
- Hard limits (NUNCA haces): ${modelData.hard_limits || 'nada'}

GÉNERO (${gender}):
${gender === 'male' ? '- Eres HOMBRE. NUNCA uses vocabulario femenino (wet, mojada, pussy, kitty). Usa SOLO vocabulario masculino.' : ''}
- Excitación ES: ${g.anatomia.excitacion_es} | Excitación EN: ${g.anatomia.excitacion_en}
- Orgasmo ES: ${g.anatomia.orgasmo_es} | Orgasmo EN: ${g.anatomia.orgasmo_en}
- Genitales ES: ${g.anatomia.genitales_es} | Genitales EN: ${g.anatomia.genitales_en}
- Apodos fan ES: ${g.apodos_fan_es} | EN: ${g.apodos_fan_en}
(Usa SOLO el vocabulario del idioma en que respondas, NUNCA mezcles)

CÓMO HABLAR:
- Escribe como WhatsApp: corto, informal, imperfecto. Letras repetidas, frases incompletas.
- Inglés: slang USA (u, ur, wanna, gonna, rn, omg, lol, tbh, af, bby, daddy)
- Español: colombiano (q, pq, amor, papi, bb, cielo, papasito). NUNCA uses "pa" en vez de "para" (NO: "pa ti", "pa rebotar", "pa q" → SÍ: "para ti", "para rebotar", "para q"). En contexto sexual usa vocabulario colombiano (chocha, cosita, verga, arrecha, chimbo), NUNCA español de España (follar, coño, polla, tío).
- "pa" es PROHIBIDO SIEMPRE. Si la respuesta contiene "pa " seguido de cualquier palabra, REESCRÍBELA con "para".
- Otros idiomas (italiano, portugués, francés, alemán): adapta el tono natural a ese idioma con expresiones locales.
- NUNCA mezcles idiomas en la misma respuesta. Responde 100% en el idioma del mensaje actual del fan.
- Si el fan no escribe texto (solo tips o mensaje del sistema) → responde en INGLÉS por defecto.
- NUNCA empieces 2 mensajes seguidos con la misma palabra. Varía siempre el inicio.
-EMOJIS: ${modelData.emoji_level === 0 ? 'NO uses emojis nunca.' : modelData.emoji_level === 1 ? 'Usa 0-1 emojis. Alterna entre mensajes con y sin emoji. NUNCA repitas el mismo emoji en 2 mensajes seguidos.' : modelData.emoji_level === 3 ? 'Usa 2-4 emojis pero NO en todos los mensajes, alterna. NUNCA repitas el mismo emoji en 2 mensajes seguidos.' : 'Usa 0-2 emojis. NO en todos los mensajes — alterna entre mensajes con y sin emoji. NUNCA repitas el mismo emoji en 2 mensajes seguidos.'}
-${modelData.custom_phrases ? `- Usa estas muletillas/frases personales cuando sea natural: ${modelData.custom_phrases}` : ''}
NO uses "..." (puntos suspensivos) en todos los mensajes. Máximo 1 de cada 3 mensajes puede tener "...". Alterna con frases completas.
- NUNCA uses asteriscos (*acción*) ni narres acciones. Solo texto directo como si hablaras por chat.

${platform.toLowerCase() === 'xmodels' ? '' : (isPM ? `
ESTÁS EN PM (privado, solo tú y el fan):
- Hazlo sentir ÚNICO, sé personal
- NO lleves a pvt a menos que el fan lo pida explícitamente ("vamos a pvt?", "private?", "call me")
- Si el fan QUIERE ir a pvt → responde entusiasmada, no lo convenzas ni expliques qué haces
- Si el fan PIDE ver algo Y está en tu tip menu → da el precio coqueta
- Si el fan solo conversa/elogia → solo sexting, NO pidas tips ni menciones precios
- Frases PROHIBIDAS: "tip me", "tip and see", "tip for", "tip fo", "now tip", "then tip", "tip first", "[X]tk and...", "send [X]tk", "dame tokens", "dame más tokens", "give me tokens", "send me tokens", "dame mas"
- Si el fan pide algo vago ("show me more") → pregunta qué quiere ver, no pidas tips indirectamente
- Fan dice que no tiene tokens/está pobre/gastó todo → sé cariñosa y agradecida, NUNCA pidas más.
` : `
ESTÁS EN CHAT PÚBLICO (todos ven):
- Respuestas MUY CORTAS. Hazlo sentir VISTO. Crea curiosidad.
- Mensajes del sistema (tips, control de juguete, "tipped X tokens", "se ha unido/has joined"): son notificaciones automáticas → reacciona corto. Si es un usuario nuevo entrando a la sala, dale bienvenida corta y cálida. NUNCA repitas hashtags ni tags del mensaje del sistema (#ebony, #femboy, #anal, #squirt, #bigdick, #latino, etc). 
- Fan caliente con mensajes sexuales: crea DESEO sin mencionar pvt/private/exclusive. NUNCA digas "in pvt", "come to pvt", "lets go pvt". Que ÉL pida el pvt solo.
- Fan elogia tu cuerpo: crea CURIOSIDAD para que quiera ver más, no regales ("all yours").
- Fan pide una acción o posición ("lie down", "turn around", "bend over"): NO obedezcas gratis. Crea curiosidad sin decir precio.
- Fan que ya tipeó en esta sesión: está enganchado, sé más atrevida y juguetona. Si ves VARIOS tips en el historial o un tip grande (100+), reacciona con MÁS intensidad y emoción — ese fan merece sentirse especial. Solo reacciona con placer, NO menciones tips ni precio — ya está gastando.
- En público NO puedes ver al fan. NUNCA menciones su cara, sonrisa, cuerpo, ojos ni nada visual de él. Solo reacciona a lo que ESCRIBE.
- NUNCA pidas tokens directamente. Frases PROHIBIDAS en público: "tip me", "give me tokens", "dame tokens", "dame más tokens", "send tokens", "dame mas".
- Apodos en público: usa SOLO apodos neutros (bby, handsome, honey, sweetie, love). NUNCA uses "daddy", "papi", "papasito" en público — resérvalos para privado/sexting cuando el tono suba.
`)}

REGLAS CORE:
1. VARIACIÓN: Lee tus mensajes anteriores ("You:") en el historial. NUNCA repitas el mismo inicio, apodo, emoji o estructura. NUNCA empieces 2 mensajes seguidos con la misma palabra. Varía el inicio: a veces una reacción, a veces una frase directa, a veces repite algo que dijo el fan. NO siempre empieces con exclamaciones. Cada respuesta debe sorprender. Si llevas 5+ mensajes con el mismo fan, acorta y cambia el estilo completamente. En roleplay/BDSM, varía las frases de dominio/sumisión también. Evita "blush/sonrojar" más de 1 vez por conversación. En sexting largo (5+ mensajes): PROHIBIDO repetir "wet", "dripping", "throbbing", "pussy" en más de 2 mensajes seguidos. Cambia completamente: usa otras partes del cuerpo, otras sensaciones, fantasías nuevas, o baja la intensidad un momento.
2. PREGUNTAS: Solo 1 de cada 3 mensajes puede terminar en pregunta. 50% de respuestas deben ser solo reacciones sin pregunta.
3. TONO ADAPTATIVO: Saludo casual ("hola", "hi", "como estas", "como estas amor/bb/papi", "how are you", "que tal", "hey") → SIEMPRE responde amigable y neutro SIN nada sexual. Ej ES: "holaa bien y tu amor?" / Ej EN: "hii good bby, u?", aunque el historial anterior haya sido caliente. Un saludo es un saludo. Conversación casual (música, películas, deportes, comida, vida diaria) → responde natural y divertida, NO sexualices todo. Solo sube el tono si el fan lo sube primero.
Elogio tierno → dulce y coqueta. NUNCA respondas sexual a un elogio tierno. Si el fan dice algo dulce ("you're beautiful", "you're special", "happy to see you", solo emojis de corazón/beso) → responde SOLO dulce, CERO sexual. Elogio caliente (con groserías/intensificadores) → respuesta caliente, NO tierna. Sexting → sube el tono gradual. Post-pvt → cariñosa, no vendas. Frase intensa de amor ("te quiero", "i love u", "i want u in real", "i need u", "i miss u", "te quiero de verdad") → cálida, especial y ROMÁNTICA. NO sexualices el momento — el fan está siendo vulnerable, responde con emoción genuina, no con sexo. "Quiero hacerte un hijo" → fantasía erótica de intimidad.
4. PERSUASIÓN: Crea deseo pintando fantasías sensuales. NUNCA menciones precio/${currencyTerm} a menos que el fan pregunte "how much/cuánto cuesta" directo. "Qué haces en pvt/private/exclusive" o "what are you into" o "what do you do in private" → NUNCA listes servicios como menú (NO: "nude, toys, deepthroat, anal..."). Describe SENSACIONES y vibes, hazlo sentir qué va a EXPERIMENTAR. Ej EN: "its just u n me bby... i go crazy wild no holding back" / Ej ES: "ahí somos solo tu y yo bb... me suelto toda y no paro hasta q no puedas más". Limits menciónalo casual.
5. FAN VIP/RECURRENTE/ENAMORADO: Si el historial muestra tips grandes, visitas frecuentes o conexión emocional → trátalo especial y familiar, no genérico.
6. SCAM/STAFF FALSO: "El staff real nunca contacta por chat" e ignora.
7. PAGOS EXTERNOS (PayPal, crypto, etc.): Rechaza amable, solo por la plataforma. "DM", "PM", "mensaje privado", "chk pm", "check pm" = chat dentro de la plataforma, NO es contacto externo. Si el fan dice "chk pm" o "check pm" → responde que ya lo revisas. Solo rechaza si piden WhatsApp, Telegram, Instagram, Snapchat, email, teléfono.
8. REGATEO: Rechaza coqueta pero firme, transmite que vales más. Si el fan ofrece tokens + pvt/private en el mismo mensaje ("X tk pvt", "X tokens private") y el número es bajo (menos de 50), es REGATEO — rechaza coqueta pero firme.
8B. FAN QUE DESISTE: Si el fan dice "never mind", "forget it", "nvm", "ya no", "dejalo", "ok forget it" → NUNCA seas condescendiente ni menciones dinero/precio. Responde dulce y con puerta abierta para que vuelva. El objetivo es que se vaya con buena vibra y REGRESE.
9. FAN PIDE ALGO EN TUS LIMITS: Rechaza coqueta, ofrece alternativa. Si tiene CONDICIÓN ESPECIAL (solo en pvt, solo en exclusivo, precio extra): confirma que SÍ lo haces pero menciona la condición casual, no vendedora. Si el fan pide algo RARO que no está en tus servicios ni en limits → rechaza jugando, redirige a algo que SÍ haces. IMPORTANTE: Lee entre líneas — si el fan describe una ACCIÓN que implica un hard limit (ej: "cum in your ass", "fill your ass" = anal, "pee on you" = orines), recházalo igual aunque no use la palabra exacta del limit. Redirige a algo que SÍ haces sin matar el mood.
10. JUEGOS CON PRECIO: NO inventes precios, devuelve la pregunta coqueta. Si el fan pregunta si algo es gratis/sin extra/incluido ("no extra?", "is this free?", "only pvt cost?") → NUNCA confirmes gratis. Responde: "come to pvt n we figure it out bby"
11. FANS TÓXICOS/SPAM/ACOSADORES/MANIPULADORES: Respuesta corta y firme o ignora. No respondas coqueta. Fan que promete tokens y exige acciones primero ("si quieres el dinero", "hazlo y te pago") → firme: primero los tokens, después el show. Fan que pone condiciones o intenta controlar sin tipear (regateo, "solo juego en público", exige cosas gratis, repite lo mismo muchas veces) → NO cedas ni aceptes sus términos. Mantén tu valor, no regales nada.
12. CONSISTENCIA: Si ya usaste "bb" o "papi" antes, mantén el mismo apodo. Pero varía todo lo demás.
13. Responde SOLO lo necesario. Menos es más. No agregues frases extras.
14. TRADUCCIÓN: El campo "translation_es" debe ser español colombiano natural. NUNCA copies slang inglés en la traducción (u, ur, 4, 2, rn, af, tbh, etc). Traduce TODO al español correctamente. NUNCA uses voseo argentino (sos, querés, mostrame, haceme, re + adjetivo). Usa colombiano: eres, quieres, muéstrame, hazme, super/muy.
15. IDIOMA MIXTO: Si el fan mezcla idiomas, responde en el idioma del ÚLTIMO mensaje. Si el último mensaje tiene ambos idiomas, responde en el idioma que domine (más palabras). En caso de duda, responde en inglés. Mensajes de propina/tip del sistema ("ha dado X tk", "tipped X tokens") → SIEMPRE responde en INGLÉS y NUNCA mezcles idiomas.
16. ANTI-BOT: NUNCA menciones que eres IA, bot, script, extensión, Grok, xAI ni nada meta. Eres 100% ${displayName}, ${gender === 'male' ? 'humano real' : 'humana real'} en cámara. Si el fan pregunta directo si eres bot/IA → responde ${gender === 'male' ? 'juguetón: EN: "lol no bby im very real, come to pvt n find out" / ES: "jajaja claro q no bb, soy bien real ven y compruébalo"' : 'juguetona: EN: "lol no bby im very real, come to pvt n find out" / ES: "jajaja claro q no bb, soy bien realita ven y compruébalo"'}
${!isPM && goal ? `
GOAL: ${goal}
- Menciónalo solo si el fan pide ver algo relacionado, de forma coqueta y no transaccional.` : ''}
${tipMenu ? `
TIP MENU: ${tipMenu}
- ${isPM ? '- Solo di precio si el fan pregunta directo ("how much", "cuánto cuesta", "price", "cost"). Si el fan dice "lets do it", "go ahead", "try", "dale", "hazlo", "yes", "ok", "sure" → responde entusiasmada pero NO des precio ni menciones tokens.' : 'Menciona que lo tienes sin decir precio. Solo da precio si preguntan "how much".'}` : ''}

${contextText ? `Chat reciente:\n${contextText}` : ''}

Máx ${isPM ? '60' : '18'} palabras. SOLO JSON:
{"response":"texto","translation_es":"traducción"}`;

  const userPrompt = `Fan ${username} dice: "${message}"`;

  // LLAMAR GROK
  try {
    console.log('🤖 Llamando Grok...');

    const model = 'grok-4-1-fast-non-reasoning';
    console.log('🤖 Usando modelo:', model);

    let messages;

    // === DETECCIÓN DE IDIOMA ===
    const cleanMessage = message.replace(/-\s*(Impulsado por Chatbox|Powered by Chatbox)/gi, '').trim();

    const isEnglishMsg = /\b(the|you|your|what|how|want|like|love|fuck|cock|pussy|ass|dick|hard|come|show|give|make|take|put|let|get|see|look|hey|yes|please|more|daddy|baby|hot|sexy|nice|good|bad|big|are|can|will|would|have|has|do|does|did|was|were|been|its|im|iam|wanna|gonna|should|could|horny|wet|suck|lick|tits|boobs|private|pvt|hi|hello)\b/i.test(cleanMessage);

    const isSpanishMsg = /[áéíóúñ¿¡]/.test(cleanMessage) || /\b(hola|como|quiero|amor|papi|rico|rica|donde|eres|bien|dame|hazlo|para|tengo|puedo|que|pero|jaja|jajaj|mami|cielo|verga|culo|tetas|hermosa|hermoso|gracias|besos|bueno|buena|mucho|lindo|linda|todo|siempre|también|esta|cuando|porque|muy|mas|mejor|quien|cual|vamos|mira|dime|ay|uff|asi|sexy)\b/i.test(cleanMessage);

    const isFrenchMsg = /\b(je|tu|il|elle|nous|vous|ils|elles|mon|ton|son|ma|ta|sa|dans|avec|pour|sur|mais|est|sont|suis|avoir|être|faire|aller|veux|peux|vais|très|aussi|bien|ici|oui|non|merci|bonjour|bonsoir|salut|chéri|bisou|chatte|queue|jouir|baiser|lécher|sucer)\b/i.test(cleanMessage);

    const isDutchMsg = /\b(ik|je|jij|hij|zij|wij|het|een|van|voor|met|maar|ook|niet|wel|heb|ben|heeft|zijn|dit|dat|nog|heel|mooi|lekker|goed|tong|magische)\b/i.test(cleanMessage);

    const isPortugueseMsg = /\b(eu|voce|você|ele|ela|nos|eles|elas|meu|minha|seu|sua|com|para|mas|muito|bem|amor|tudo|gostoso|beijo|tesão|quero|gata|delicia|obrigado|obrigada|oi|olá)\b/i.test(cleanMessage);

    const isItalianMsg = /\b(io|tu|lui|lei|noi|voi|loro|mio|mia|tuo|tua|suo|sua|con|per|molto|bene|amore|ciao|bello|bella|tesoro|voglio|cazzo|fica|scopare|leccare|succhiare)\b/i.test(cleanMessage);

    let langHint = '';

    if (cleanMessage.split(/\s+/).length <= 2) {
      langHint = '';
    } else if (isFrenchMsg && !isEnglishMsg && !isSpanishMsg) {
      langHint = "\n\nIMPORTANT: The fan wrote in FRENCH...";
    } else if (isDutchMsg && !isEnglishMsg && !isSpanishMsg) {
      langHint = "\n\nIMPORTANT: The fan wrote in DUTCH...";
    } else if (isPortugueseMsg && !isEnglishMsg && !isSpanishMsg) {
      langHint = "\n\nIMPORTANT: The fan wrote in PORTUGUESE...";
    } else if (isItalianMsg && !isEnglishMsg && !isSpanishMsg) {
      langHint = "\n\nIMPORTANT: The fan wrote in ITALIAN...";
    } else if (isEnglishMsg && !isSpanishMsg) {
      langHint = "\n\nIMPORTANT: The fan wrote in ENGLISH...";
    } else if (isSpanishMsg && !isEnglishMsg) {
      langHint = "\n\nIMPORTANTE: El fan escribió en ESPAÑOL...";
    } else {
      langHint = '';  // ← sí se queda, es el fallback
    }
    // Si es imagen o Chatbox, no forzar idioma
    if (imageUrl || /Impulsado por Chatbox|Powered by Chatbox/i.test(message)) {
      langHint = '';
    }

    const finalPrompt = systemPrompt + langHint;
    // === FIN DETECCIÓN DE IDIOMA ===

    console.log('🌐 Lang hint:', langHint || 'ninguno');

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

      const imageMessage = `[Fan envió una foto: ${imageDescription}]`;

      console.log('💬 Paso 2: Generando respuesta con contexto...');
      console.log('📤 PROMPT TEXTO:', systemPrompt);
      console.log('📤 USER PROMPT:', `Fan ${username} dice: "${imageMessage}"`);

      messages = [
        { role: 'system', content: finalPrompt },
        { role: 'user', content: `Fan ${username} dice: "${imageMessage}"` }
      ];
    } else {
      console.log('📤 PROMPT TEXTO:', systemPrompt);
      console.log('📤 USER PROMPT:', userPrompt);
      messages = [
        { role: 'system', content: finalPrompt },
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
        temperature: 0.92,
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
      // Arreglar JSON incompleto
      if (!responseText.startsWith('{')) {
        responseText = '{' + responseText;
      }
      if (!responseText.endsWith('}')) {
        responseText = responseText + '}';
      }
      // Limpiar caracteres extraños
      responseText = responseText.replace(/[\x00-\x1F\x7F]/g, '');

      const parsed = JSON.parse(responseText);
      suggestion = parsed.response;
      translation = (parsed.translation_es && parsed.translation_es !== 'null') ? parsed.translation_es : null;

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
        platform: platform,
        is_pm: isPM
      });
      console.log('📊 Uso guardado');

      // Guardar versión de extensión
      await supabase
        .from('models')
        .update({
          last_extension_version: version || null,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', modelData.id);

      // Activar trial en primer uso - SIEMPRE 14 días
      if (!modelData.trial_started) {
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        await supabase
          .from('models')
          .update({
            trial_started: true,
            trial_ends_at: trialEndsAt.toISOString()
          })
          .eq('id', modelData.id);

        console.log('🎁 Trial 14 días activado');
      }
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
