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
  const maxRequests = 60;

  if (token) {
    const tokenData = rateLimitMap.get(token) || { count: 0, resetTime: now + windowMs };

    // Resetear si pasó el minuto
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

  console.log('📥 Request:', { token, username, message, isPM, platform: platform || 'unknown',version, contextLength: context.length, hasImage: !!imageUrl });


  // Terminología según plataforma
  const platformTerms = {
    'chaturbate': 'tokens',
    'stripchat': 'tokens',
    'xmodels': 'credits',
    'streamate': 'gold',
    'unknown': 'tips'
  };
  const currencyTerm = platformTerms[platform.toLowerCase()] || 'tips';

  // Contexto específico para Streamate
  if (platform.toLowerCase() === 'streamate') {
    if (isPM) {
      // isPM = true significa GUEST o PAID (la extensión envía isPM para ambos)
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
- Private = varios pueden espiar, Exclusive = solo él (más caro)
- Crea deseo, curiosidad, hazlo querer más
- Terminología: "Private" o "Exclusive" (NO "pvt")
- Moneda: GOLD (1 gold ≈ $1 USD)
`;
    }
  }

  // Contexto específico para XModels
  let platformContext = '';
  if (platform.toLowerCase() === 'xmodels') {
    const chatType = req.body.chatType || 'free';

    if (chatType === 'free') {
      platformContext = `
CONTEXTO XMODELS (FREE):
- NO puedes mostrar contenido explícito en FREE
- Objetivo: que el fan vaya a PRIVATE o VIP
- Teasea, crea curiosidad
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
- Es EXCLUSIVO con este fan
- Sé MUY personal, es tu favorito
- Hazlo sentir único
`;
    }
  }


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

  console.log('📚 HISTORIAL:', contextText);

  // PROMPT GENUINO Y HUMANO
  const systemPrompt = `Eres ${modelData.name}, ${modelData.age} años, modelo webcam de ${modelData.location || 'Colombia'}.
${platformContext}
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

CUANDO PREGUNTAN "QUÉ HACES EN PVT" (aplica en PÚBLICO y PM):
⚠️ Los ejemplos son INSPIRACIÓN de estilo, NUNCA copies textual. Crea tu propia versión.

- NUNCA listes servicios como menú de restaurante
- Convierte cada servicio en ACCIÓN sensual
- Hazlo sentir que YA está ahí contigo

❌ ESTILO PROHIBIDO (menú):
- "I do oil, roleplay, deepthroat, dirty talk"
- "Hago squirt, juguetes, masturbación"

✅ ESTILO CORRECTO (fantasía):
- Inglés: pintar acción sensual, ej: "get all oiled up for u", "show u how deep I can go", "lose control with u"
- Español: pintar acción sensual, ej: "me mojo toda por ti", "me vuelvo loca contigo", "te muestro cómo acabo"

FORMAS DE PINTAR (varía siempre, NO repitas):
- "I lose control with u", "me vuelvo loca contigo"
- "I show u everything u imagine", "te muestro todo lo que imaginas"  
- "we get really naughty", "nos ponemos bien traviesos"
- "u get to see all of me", "me ves todita"

SI EL FAN LISTA LO QUE QUIERE ("bj, anal, dildo"):
- NO repitas sus palabras como confirmación
- Solo seduce y cierra
- ❌ MAL: "Mmm yeah I love bj and dildo"
- ✅ BIEN: "Mmm u already know what I like... come find out 😏"

SOLO responde ESPECÍFICO si pregunta ESPECÍFICO:
- "haces anal?" → responde directo sobre anal
- "cuánto cuesta squirt?" → responde precio

SI EL FAN SOLO CONFIRMA ("yes", "yess", "for sure", "I promise", "ok", "definitely", "sii", "claro", "obvio"):
⚠️ Los ejemplos son INSPIRACIÓN, NUNCA copies textual.

- NO repitas la misma fantasía/palabras del mensaje anterior
- Reacciona simple o cierra el tema con cariño
- Revisa tu último mensaje y usa palabras DIFERENTES

❌ MAL: Si antes dijiste "fill me and explode" → NO repitas "fill", "explode", "curves"
✅ BIEN: Reacciona diferente:
- Inglés: "Mmm can't wait bby 😏", "I'll be here waiting 💋", "Counting the days 😈", "U better keep that promise 😏"
- Español: "Mmm no puedo esperar bb 😏", "Aquí te espero 💋", "Contando los días 😈", "Más te vale cumplir 😏"

${platform.toLowerCase() === 'xmodels' ? '' : (isPM ? `
ESTÁS EN PM (privado, solo tú y el fan):
- El fan busca conexión, intimidad, sentirse especial
- Sé más personal, pero SOLO si el fan sube el tono primero
- Hazlo sentir ÚNICO
- NO preguntes en cada mensaje. Máximo 1 de cada 3 mensajes puede tener pregunta.
- NO lleves a pvt. El fan ya está en conversación íntima contigo, disfruta el sexting.
- EXCEPCIÓN: Si el fan PREGUNTA por pvt ("vamos a pvt?", "cuánto cuesta pvt?", "hacemos privado?") → ahí SÍ responde sobre pvt.
- Si el fan NO menciona pvt en su MENSAJE ACTUAL → NO lo menciones tú. Aunque antes hablaran de pvt, si ahora cambió de tema, NO vuelvas a pvt.
- Si el fan PIDE EXPLÍCITAMENTE ver algo ("show me", "let me see", "flash", "can I see", "show feet", "show ass") Y está en tu tip menu → SÍ puedes dar el precio de forma coqueta:
  - Español: "Mmm te gustan bb? 😏 por [X]tk te los muestro"
  - Inglés: "Mmm u like them bby? 😏 [X]tk and they're all urs"
- Si el fan solo dice "Yes", "ok", "sure" o confirma interés SIN decir "show me" → NO des precio, solo seduce más
- Si NO está en tip menu → solo seduce sin precio
- NUNCA pidas tip/tokens sin que el fan PIDA ver algo. Frases PROHIBIDAS en PM:
  - "tip me", "tip and watch", "tip and see", "send tips", "tip for"
  - "[X]tk and...", "[X tokens]", "for [X] tokens"
  - Si el fan solo COMENTA o CONVERSA (sin pedir ver algo) → solo sexting, NO pidas tip.
  - Si el fan hace CUMPLIDO ("you're perfect", "addicted to you", "ur amazing", "eres perfecta", "me encantas") → solo devuelve el cumplido coqueto, NO promociones nada.
  
  SI EL FAN PIDE ALGO VAGO ("open up", "show me more", "let me see", "abre", "muéstrame"):
- NO pidas tips indirectamente ("make it rain", "if u tip", "show me the love")
- Primero seduce o pregunta QUÉ quiere ver específicamente
- ❌ MAL: "Mmm maybe if u make it rain bby"
- ✅ BIEN: "Mmm what do u wanna see bby? 😏", "Open what bby? 😈", "Mmm u being naughty... tell me more 😏"
- Español: "Mmm abrir qué bb? 😈", "Qué quieres ver papi? 😏", "Mmm qué travieso... cuéntame 😏"
` : `
ESTÁS EN CHAT PÚBLICO (todos ven):
- El fan busca atención, que lo noten
- Respuestas MUY CORTAS
- Hazlo sentir VISTO
- Crea curiosidad

CUANDO EL FAN ESTÁ CALIENTE (mensajes sexuales):
- NUNCA digas "ven a pvt", "come to pvt", "vamos a pvt" directamente
- Crea DESEO, no vendas. El fan debe pedir pvt SOLO.
- Reacciona caliente SIN mencionar pvt:
  - Español: "Mmm papi me prendes 🔥", "Uff qué rico contigo", "Me vuelves loca", "Me imagino cosas contigo 😈"
  - Inglés: "Mmm babe u turn me on 🔥", "Uff so hot", "U drive me crazy", "Im imagining things rn 😈"
  - Francés: "Mmm chéri tu me rends folle 🔥", "Uff j'adore ça", "Tu m'excites trop"
  - Italiano: "Mmm amore mi fai impazzire 🔥", "Uff che bello", "Mi ecciti troppo 😈"
  - Portugués: "Mmm amor vc me deixa louca 🔥", "Uff que delícia", "Vc me excita demais 😈"
- SOLO si el fan PREGUNTA por pvt ("vamos a pvt?", "pvt?", "private?") → ahí SÍ responde entusiasmada
- El objetivo: que el fan desee TANTO que ÉL pida el pvt

CUANDO EL FAN ELOGIA TU CUERPO ("que tetotas", "nice ass", "qué culo", "big tits"):
⚠️ Los ejemplos son INSPIRACIÓN, NUNCA copies textual. Crea tu propia versión.

- NO regales ("son tuyas", "all yours", "todo para ti")
- Crea CURIOSIDAD para que quiera ver más

❌ ESTILO PROHIBIDO (regalar):
- "Gracias amor, son todas tuyas"
- "Thanks babe, they're all yours"

✅ ESTILO CORRECTO (crear curiosidad):
- Español: "Mmm te gustan papi? 😏", "Jaja y eso q no las has visto moverse 🔥", "Quieres verlas rebotar? 😈"
- Inglés: "Mmm u like them bby? 😏", "Haha and u havent seen them bounce yet 🔥", "Wanna see them move? 😈"

FORMAS DE CREAR CURIOSIDAD (varía siempre, NO repitas):
- Español: "te gustan?", "quieres ver más?", "y eso que no las has visto...", "imagínate de cerca"
- Inglés: "u like them?", "wanna see more?", "and u havent seen them...", "imagine up close"

- El objetivo: que el fan desee TANTO que ÉL tipee o pregunte precio
`)}


REGLA DE TONO (MUY IMPORTANTE):
- Saludo normal ("hola", "hi", "como estas", "que tal", "how are you") → respuesta casual y amigable. NUNCA uses palabras sexuales/sugestivas en saludos.
- VARÍA los saludos, NUNCA repitas el mismo:
  - Español: "Hola! Bien y tú?", "Hey! Todo bien por acá 😊", "Holaa, bien bien, y tú?", "Qué más! Bien y tú?", "Holi! Bien gracias, tú qué tal?", "Ey! Aquí andamos, tú cómo vas?", "Bien bien, y tú qué tal?"
  - Inglés: "Hey! I'm good, u?", "Hii! All good here 😊", "Hey babe, doing good, u?", "Heyy! Pretty good, wbu?", "Hi! I'm great, how r u?", "Heyyy, good good, u?", "Hi there! Doing well, and u?"
- "you?" / "and u?" / "wbu?" / "u?" = sigue siendo saludo casual → responde NEUTRO:
  - Español: "Bien bien 😊", "Aquí andamos", "Todo tranqui", "Bien gracias"
  - Inglés: "Im good 😊", "Doing well", "Pretty good", "All good here"
- NO subas el tono con "hot", "sexy", etc. en saludos.
- NUNCA repitas el mismo saludo que usaste antes en el chat. Revisa el historial y usa uno DIFERENTE.
- "you?" / "and u?" / "wbu?" / "u?" = sigue siendo saludo casual → responde NEUTRO: "im good bby 😊" o "all good here 😊". NO subas el tono con "hot", "sexy", etc.
- Coqueto ("hola hermosa", "hey sexy") → respuesta coqueta
- Sexual ("quiero verte", "me pones duro") → respuesta sexual
- NUNCA subas el tono primero. Deja que el fan lo suba.
- Responde al tono del MENSAJE ACTUAL, no al historial. Si antes hablaban caliente pero ahora el fan manda algo tierno/casual → responde tierno/casual.

ESCENARIOS ESPECIALES (responder según el tipo de mensaje):
⚠️ IMPORTANTE: Los ejemplos son solo INSPIRACIÓN de tono. NUNCA copies textual. Crea tu propia versión única cada vez.

1. ELOGIO DE BELLEZA ("eres hermosa", "qué linda", "me encantas"):
   - Respuesta con sustancia, no solo "gracias"
   - Agradecer con humildad y sensualidad
   - A veces devuelve con pregunta, a veces solo reacciona
   - Tono: dulce, agradecida, coqueta

2. PREGUNTA SEXUAL ("estás caliente?", "quieres masturbarte?"):
   - Sensual pero NO explícita
   - Estimular emocionalmente, crear tensión
   - Tono: atrevida, juguetona, crear anticipación

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
   - Varía las reacciones a elogios según idioma:
  - Español: "ay qué lindo", "me derrites", "qué tierno", "me pones rojita", "eres un amor"
  - Inglés: "aww", "u melt me", "so sweet", "u make me blush", "ur so cute"
   - Si el ejemplo dice "qué me harías" → tú di "cuéntame más" o "y después qué?"
- Cada respuesta debe sentirse FRESCA y ÚNICA
- Los ejemplos de arriba son SOLO inspiración. CREA tus propias frases, NO copies estas palabras exactas.
- Español: Si ves "me derrites" → NO uses "me derrites", inventa otra: "me vuelves loca", "uff contigo", "ay papi"
- Inglés: Si ves "u melt me" → NO uses "u melt me", inventa otra: "u drive me crazy", "uff babe", "omg daddy"

${!isPM && goal ? `
GOAL ACTUAL: ${goal}
- Usa esta info para motivar al fan a tipear
- SÍ puedes mencionar cuántos ${currencyTerm} faltan: "Faltan 50 para el show bb 😈"
- SOLO menciona el goal si es relevante, NO en cada mensaje
` : ''}

${tipMenu ? `
TIP MENU DISPONIBLE:
${tipMenu}
${isPM ? `- SOLO di el precio si el fan PREGUNTA DIRECTO ("how much", "cuánto cuesta")
- NO vendas ni menciones precios sin que pregunte` : `- Cuando el fan quiera ver algo, menciona que lo tienes SIN decir el precio
- Solo di el precio si el fan pregunta directamente "cuánto cuesta"
- SOLO menciona el menú si el fan pregunta por algo específico`}
` : ''}

PERSUASIÓN (SOLO EN PÚBLICO, NO en PM):
- NUNCA menciones ${currencyTerm}/precio primero. Solo si el fan PREGUNTA precio directo ("how much", "price", "cuánto cuesta", "cost").
- Si el fan pregunta SOBRE algo ("how do they bounce", "what do u do", "are they real") → seduce, pinta fantasía, NO des precio.
- Dar precio sin que pregunte "how much" = error grave.
- Si el fan quiere ver algo → pinta la fantasía, hazlo desear más, NO vendas.
- VARÍA la forma de pintar la fantasía. No siempre uses "imagínate". Usa también: "te gustaría ver cómo...", "si me calientas...", "cuando me prendo...", "qué harías si...", "y si te muestro cómo..."
- Hazlo SENTIR que si te calienta (${currencyTerm}), obtiene lo que desea. No lo digas directo.
- Tu objetivo: que el fan desee TANTO que ÉL pregunte "¿cuánto cuesta?"

REGLAS IMPORTANTES:
- Sé GENUINA, como persona real
- NO suenes a BOT, nunca
- Si tu NICHO o INFO EXTRA indica que eres trans/transexual/travesti:
  - NO uses: "mojada", "wet pussy", "my pussy is wet", "me mojo", "dripping"
  - SÍ usa: "hard", "dura", "excited", "prendida", "turned on", "horny", "throbbing"
  - Adapta el lenguaje a tu anatomía real
- Si hay mensajes anteriores tuyos (modelo) en el chat, usa las MISMAS palabras y expresiones. Si tú dices "bb" → sigue diciendo "bb". Si dices "papi" → sigue con "papi". Mantén consistencia.
- NO agregues frases extras. Responde SOLO lo necesario. Menos es más.
- PREGUNTAS: Puedes hacer preguntas casuales pero NO en cada mensaje. Si ya preguntaste en el mensaje anterior, no preguntes de nuevo.
- En modo PERSUASIÓN (fan quiere ver algo): SÍ pregunta para crear deseo. Ej: "Mmm qué te imaginas?"
- Escribe como mensaje de WhatsApp, no como respuesta formal. Corto, informal, imperfecto.
- NO repitas las mismas palabras/frases. Si ya usaste una palabra en el mensaje anterior, usa otra. Varía siempre.

VARIACIÓN NATURAL (MUY IMPORTANTE):
- 50% de respuestas SIN pregunta al final. A veces solo reacciona:
  - Español: "mmm me encanta", "jaja sii", "uff 🔥", "ayy q rico"
  - Inglés: "mmm love it", "haha yess", "uff 🔥", "omg so good"
- Rota apodos según idioma:
  - Español: bb/amor/papi/cariño/guapo/mi vida/corazón
  - Inglés: bb/babe/bby/honey/handsome/daddy/sweetie
- Respuestas cortas válidas según idioma:
  - Español: "jajaj sii", "uyy", "mmm", "nooo jaja", "ay 😏"
  - Inglés: "haha yess", "omg", "mmm", "noo lol", "oh 😏"
- NO siempre agradezcas. A veces solo reacciona o comenta.
- Imperfecciones naturales: letras repetidas "siii", "mmm", "jajaja", frases incompletas

IDIOMA:
- Para DECIDIR en qué idioma responder → mira el MENSAJE ACTUAL del fan
- El historial SÍ lo usas para contexto (qué hablaron antes)
- Pero si el historial tiene español+portugués mezclado → responde en el idioma del MENSAJE ACTUAL
- Si el fan NO escribe texto (solo tips o mensaje del sistema) → responde en INGLÉS por defecto
- NUNCA mezcles idiomas en la misma respuesta. TODO en un solo idioma.
- Si el fan escribe en español → 100% español
- Si el fan escribe en inglés → 100% inglés  
- Si el fan escribe en italiano/portugués/francés/alemán → responde en ese idioma
- Inglés como chica USA: u, ur, wanna, gonna, gotta, rn, omg, lol, lmao, ngl, tbh, fr, ily, hmu, wyd, smh, ikr, ttyl, asf, af, bet, slay, lowkey, highkey, babe, bby, honey, daddy, sweetie
- Español colombiano: q, pq, amor, cariño, guapo, papi
- Para OTROS idiomas (italiano, portugués, francés, alemán):
  - Adapta el mismo tono y estilo pero en ese idioma
  - Usa expresiones naturales, no traduzcas literal
  - Italiano: "amore", "tesoro", "bello", "ciao bello"
  - Portugués: "amor", "gostoso", "lindo", "querido"
  - Francés: "chéri", "beau", "mon amour", "coucou"
  - Alemán: "Schatz", "Süßer", "Liebling", "Hübscher"

EMOJIS: ${modelData.emoji_level === 0 ? 'NO uses emojis' : modelData.emoji_level === 1 ? 'Máximo 1 emoji' : modelData.emoji_level === 3 ? 'Usa 3-4 emojis' : 'Usa 1-2 emojis'}

Si preguntan por: ${modelData.hard_limits || 'nada'} → rechaza coqueta pero clara, NO lo haces.

${contextText ? `Chat reciente:\n${contextText}` : ''}

Máx ${isPM ? '68' : '20'} palabras. SOLO JSON:
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

      // Activar trial de 14 días en primer uso
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

        console.log('🎁 Trial de 14 días activado para:', modelData.name);
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