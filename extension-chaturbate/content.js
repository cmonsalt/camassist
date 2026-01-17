console.log("CamAssist loaded!");

// Obtener token de chrome.storage si existe
chrome.storage.local.get(['model_token'], (result) => {
  if (result.model_token) {
    localStorage.setItem('model_token', result.model_token);
    console.log('✅ Token cargado desde extensión:', result.model_token);
  }
});

// HISTORIALES SEPARADOS
let publicHistory = {};  // Por username en chat público
let pmHistory = {};      // Por username en PM

// Obtener username del broadcaster (tú)
const broadcasterUsername = window.location.pathname.split('/b/')[1]?.split('/')[0] || '';
console.log('👤 Broadcaster username:', broadcasterUsername);

const extensionStartTime = Date.now();

// ============================================
// FUNCIÓN PARA OBTENER GOAL Y TIP MENU
// ============================================
function getGoalAndTipMenu() {
  // GOAL
  let goal = '';
  const goalEl = document.querySelector('span.RoomSubjectSpan, [data-testid="room-subject-span"]');
  if (goalEl) {
    goal = goalEl.textContent.trim();
    console.log('🎯 GOAL detectado:', goal);
  } else {
    console.log('⚠️ No se encontró GOAL');
  }

  // TIP MENU - buscar en el chat los items del menú
  let tipMenu = [];
  const tipMenuItems = document.querySelectorAll('a[data-testid="shortcode-link"]');
  tipMenuItems.forEach(item => {
    // Obtener el texto del padre (mensaje completo) que incluye el precio
    const parentText = item.closest('.msg-text, [class*="message"]')?.textContent.trim() || item.parentElement?.textContent.trim();
    const text = parentText || item.textContent.trim();
    if (text && !tipMenu.includes(text)) {
      tipMenu.push(text);
    }
  });

  console.log('📋 TIP MENU detectado:', tipMenu.length, 'items:', tipMenu);

  return {
    goal: goal,
    tipMenu: tipMenu.join(' | ')
  };
}

console.log('⏰ Extension cargada en:', new Date(extensionStartTime).toLocaleTimeString());

// ============================================
// FUNCIÓN PARA DETECTAR PRIVATE SHOW
// ============================================
function isInPrivateShow() {
  const pageText = document.body.innerText;

  const privateIndicators = [
    'Private Broadcasting',
    'Private show has started',
    'Exit Private Show',
    'Radiodifusión privada',
    'El espectáculo privado ha comenzado',
    'Salir del show privado'
  ];

  return privateIndicators.some(text => pageText.includes(text));
}


setInterval(() => {

  // ============================================
  // ============================================
  // DETECTAR QUÉ PESTAÑA ESTÁ ACTIVA
  // ============================================
  const pmTab = document.querySelector('#pm-tab-default');
  const isPMTabActive = pmTab && pmTab.classList.contains('active');

  // ============================================
  // 1. DETECTAR TODOS LOS MENSAJES
  // ============================================
  const allMessages = document.querySelectorAll('[data-testid="chat-message"]');

  allMessages.forEach(msg => {
    const dataNick = msg.getAttribute('data-nick');

    // Ignorar mensajes sin data-nick (avisos del sistema)
    if (!dataNick) return;

    // Determinar si es mensaje del broadcaster o fan
    const isModelMessage = dataNick === broadcasterUsername;
    const username = dataNick;

    // Determinar si es PM o público SEGÚN LA PESTAÑA ACTIVA
    const isPM = isPMTabActive;

    // Obtener texto del mensaje
    let messageText = '';
    const textElements = msg.querySelectorAll('.msg-text, [class*="message-text"]');
    textElements.forEach(el => {
      const text = el.textContent.trim();
      if (text && text.length > messageText.length) {
        messageText = text;
      }
    });

    // Si no encontró texto, intentar directamente
    if (!messageText) {
      messageText = msg.textContent.trim();
      // Remover username del inicio
      messageText = messageText.replace(new RegExp(`^${username}\\s*`, 'i'), '').trim();
    }

    // Limpiar @mentions solo del inicio
    messageText = messageText.replace(/^@\S+\s*/g, '').trim();

    // Detectar tips
    const isTip = messageText.includes('tipped') || messageText.includes('tokens');
    let tipAmount = 0;
    if (isTip) {
      const match = messageText.match(/(\d+)\s*(tokens?|tips?)/i);
      if (match) tipAmount = parseInt(match[1]);
    }

    // Ya procesado?
    if (msg.dataset.processed) return;

    // Ignorar mensajes anteriores a cuando se cargó la extensión
    // const messageTime = parseInt(msg.getAttribute('data-ts') || '0');
    // if (messageTime > 0 && messageTime < extensionStartTime) {
    //   msg.dataset.processed = 'true'; // Marcar como procesado pero no guardar
    //   return;
    // }

    // Ignorar mensajes anteriores SOLO en chat público
    // const messageTime = parseInt(msg.getAttribute('data-ts') || '0');
    // if (!isPM && messageTime > 0 && messageTime < extensionStartTime) {
    //   msg.dataset.processed = 'true';
    //   return;
    // }

    msg.dataset.processed = 'true';

    // ============================================
    // ============================================
    // GUARDAR EN HISTORIAL CORRECTO
    // ============================================

    if (!isTip && messageText) {
      const history = isPM ? pmHistory : publicHistory;

      // Si la modelo responde con @mention, guardar en historial del fan mencionado
      let targetUsername = username;

      if (isModelMessage && !isPM) {
        // Buscar @mention en el mensaje original (antes de limpiar)
        const mentionMatch = msg.textContent.match(/@(\w+)/);
        if (mentionMatch) {
          targetUsername = mentionMatch[1]; // El username mencionado
          console.log(`🎯 Modelo menciona a: ${targetUsername}`);
        }
      }

      // EN PM: guardar mensajes de modelo en historial del fan
      if (isModelMessage && isPM) {
        // Buscar el último mensaje de un fan (que no sea la modelo)
        const fanMessages = Array.from(allMessages).filter(m => {
          const nick = m.getAttribute('data-nick');
          return nick && nick !== broadcasterUsername;
        });

        if (fanMessages.length > 0) {
          // Tomar el data-nick del último mensaje de fan
          const lastFanMessage = fanMessages[fanMessages.length - 1];
          targetUsername = lastFanMessage.getAttribute('data-nick');
          console.log(`🎯 PM con: ${targetUsername}`);
        }
      }

      // Inicializar historial del usuario con estructura separada
      if (!history[targetUsername]) {
        history[targetUsername] = { messages: [], tips: [] };
      }

      // Guardar mensaje con timestamp real
      const msgTs = parseInt(msg.getAttribute('data-ts') || '0') || Date.now();
      history[targetUsername].messages.push({
        type: isModelMessage ? 'model' : 'fan',
        message: messageText,
        timestamp: msgTs
      });

      // Mantener últimos 70 mensajes
      if (history[targetUsername].messages.length > 70) {
        history[targetUsername].messages.shift();
      }

      console.log(`💬 ${isPM ? 'PM' : 'Público'} - ${isModelMessage ? 'Modelo' : 'Fan'} (guardado en historial de: ${targetUsername}): ${messageText}`);
    }

    // ============================================
    // AGREGAR BOTÓN IA SOLO EN MENSAJES DE FANS
    // ============================================

    // Agregar botón IA:
    // - En mensajes normales del fan
    // - En tips que tienen mensaje personalizado
    const hasTipMessage = isTip && messageText && !messageText.match(/^tipped \d+ tokens?$/i);

    if (!isModelMessage && messageText && !msg.querySelector('.ai-btn')) {
      if (!isTip || hasTipMessage) {
        addAIButton(msg, username, messageText, isPM, isPM ? 'pm' : 'public', tipAmount);
      }
    }

    // ============================================
    // GUARDAR TIP
    // ============================================

    if (isTip && tipAmount > 0) {
      const history = isPM ? pmHistory : publicHistory;

      if (!history[username]) {
        history[username] = { messages: [], tips: [] };
      }

      // Verificar si ya existe un tip duplicado (mismo usuario, cantidad y tiempo)
      const now = Date.now();
      const isDuplicate = history[username].tips.some(item => {
        return item.type === 'tip' &&
          item.amount === tipAmount &&
          Math.abs(item.timestamp - now) < 2000; // Menos de 2 segundos
      });

      if (!isDuplicate) {
        history[username].tips.push({
          type: 'tip',
          amount: tipAmount,
          timestamp: now
        });

        // Mantener últimos 5 tips
        if (history[username].tips.length > 5) {
          history[username].tips.shift();
        }
        console.log(`💰 ${isPM ? 'PM' : 'Público'} - Tip de ${username}: ${tipAmount} tokens`);
      } else {
        console.log(`⚠️ Tip duplicado ignorado - ${username}: ${tipAmount} tokens`);
      }
    }
  });
  // ============================================
  // 3. DETECTAR MENSAJES DEL MODAL PM FLOTANTE
  // ============================================

  // Obtener username del modal PM
  let modalPmUser = null;
  const modalHeader = document.querySelector('[data-testid="virtual-list"]')?.closest('div')?.querySelector('[class*="username"], [class*="user-name"]');
  if (!modalHeader) {
    // Buscar en el título del modal (el nombre arriba)
    const modalTitle = document.querySelector('div[style*="z-index"] span[class*="user"]');
    if (modalTitle) {
      modalPmUser = modalTitle.textContent.trim();
    }
  } else {
    modalPmUser = modalHeader.textContent.trim();
  }

  // Mensajes en el modal PM flotante
  const modalPmMessages = document.querySelectorAll('[data-testid="received-message"], [data-testid="sent-message"]');

  modalPmMessages.forEach(msg => {
    if (msg.dataset.processedModal) return;

    const isModelMessage = msg.getAttribute('data-testid') === 'sent-message';

    // Obtener texto
    let messageText = '';
    const contentEl = msg.querySelector('[data-testid="message-contents"] span');
    if (contentEl) {
      messageText = contentEl.textContent.trim();
    }

    // Detectar si tiene imagen
    const imageEl = msg.querySelector('img[data-testid="pvt-img"]');
    const imageUrl = imageEl ? imageEl.src : null;

    if (!messageText) return;

    // Obtener username del header si no lo tenemos
    if (!modalPmUser) {
      modalPmUser = 'pm_user';
    }

    msg.dataset.processedModal = 'true';

    if (!pmHistory[modalPmUser]) {
      pmHistory[modalPmUser] = { messages: [], tips: [] };
    }

    pmHistory[modalPmUser].messages.push({
      type: isModelMessage ? 'model' : 'fan',
      message: messageText,
      timestamp: Date.now()
    });

    if (pmHistory[modalPmUser].messages.length > 70) {
      pmHistory[modalPmUser].messages.shift();
    }

    console.log(`💬 Modal PM - ${isModelMessage ? 'Modelo' : 'Fan'} (${modalPmUser}): ${messageText}`);

    // Agregar botón IA solo en mensajes de fans
    if (!isModelMessage && !msg.querySelector('.ai-btn')) {
      addAIButton(msg, modalPmUser, messageText, true, 'pm', 0, imageUrl);
    }
  });

  // ============================================
  // 4. DETECTAR IMÁGENES EN PM (chat-image)
  // ============================================
  const pmImages = document.querySelectorAll('[data-testid="chat-image"]');

  pmImages.forEach(imgContainer => {
    if (imgContainer.dataset.processedImage) return;

    const dataNick = imgContainer.getAttribute('data-nick');
    if (!dataNick) return;

    if (dataNick === broadcasterUsername) return;

    const imgEl = imgContainer.querySelector('img[data-testid="pvt-img"]');
    if (!imgEl) return;

    const imageUrl = imgEl.src;
    if (!imageUrl) return;

    imgContainer.dataset.processedImage = 'true';

    console.log(`🖼️ Imagen detectada de ${dataNick}: ${imageUrl.substring(0, 50)}...`);

    if (!pmHistory[dataNick]) {
      pmHistory[dataNick] = { messages: [], tips: [] };
    }

    const imageTs = parseInt(imgContainer.getAttribute('data-ts') || '0') || Date.now();
    pmHistory[dataNick].messages.push({
      type: 'image',
      imageUrl: imageUrl,
      timestamp: imageTs
    });

    if (pmHistory[dataNick].messages.length > 70) {
      pmHistory[dataNick].messages.shift();
    }

    if (!imgContainer.querySelector('.ai-btn')) {
      addAIButton(imgContainer, dataNick, '[Envió una imagen]', true, 'pm', 0, imageUrl);
    }
  });

}, 2000);

// ============================================
// FUNCIÓN PARA AGREGAR BOTÓN IA
// ============================================
function addAIButton(container, username, messageText, isPM, context, tipAmount, imageUrl = null) {
  const btn = document.createElement('button');
  btn.textContent = '🤖';
  btn.className = 'ai-btn';
  btn.style.cssText = imageUrl
    ? 'background:#10B981;color:white;border:none;padding:3px 8px;margin-left:5px;cursor:pointer;border-radius:5px;font-size:12px'
    : 'background:#8B5CF6;color:white;border:none;padding:3px 8px;margin-left:5px;cursor:pointer;border-radius:5px;font-size:12px';

  btn.onclick = async () => {
    // Detectar pestaña activa AL MOMENTO del click
    const pmTab = document.querySelector('#pm-tab-default');
    const currentlyInPM = pmTab && pmTab.classList.contains('active');

    // Obtener historial correcto según pestaña actual
    const history = currentlyInPM ? pmHistory : publicHistory;
    const userHistory = history[username] || [];

    console.log(`🔵 IA para ${currentlyInPM ? 'PM' : 'público'} - Usuario: ${username}`);

    btn.textContent = '...';

    const getResponse = async () => {
      // SI ESTAMOS EN PM, incluir historial público también
      // Combinar mensajes y tips del historial
      const userMessages = userHistory.messages || [];
      const userTips = userHistory.tips || [];
      let fullContext = [...userMessages, ...userTips];

      if (isPM && publicHistory[username]) {
        const pubMessages = publicHistory[username].messages || [];
        const pubTips = publicHistory[username].tips || [];
        fullContext = [...pubMessages, ...pubTips, ...fullContext];
      }

      console.log('📨 Mensajes:', userMessages.length, '| Tips:', userTips.length);

      // Ordenar por timestamp
      // Ordenar por timestamp
      fullContext = fullContext.sort((a, b) => a.timestamp - b.timestamp);

      console.log('📚 Historial enviado a IA (últimos 70):');
      console.table(fullContext.slice(-70).map((item, index) => ({
        '#': index,
        'Quién': item.type === 'fan' ? '👤 Fan' : item.type === 'model' ? '💃 Modelo' : item.type === 'image' ? '🖼️ Imagen' : '💰 Tip',
        'Mensaje': item.type === 'tip' ? `${item.amount} tokens` : item.type === 'image' ? '[Imagen]' : (item.message ? item.message.substring(0, 50) + (item.message.length > 50 ? '...' : '') : ''),
        'Timestamp': new Date(item.timestamp).toLocaleTimeString()
      })));

      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          platform: 'chaturbate',
          username,
          message: messageText,
          context: fullContext.slice(-70),
          isPM: currentlyInPM,
          isPrivateShow: isInPrivateShow(),
          tip: tipAmount,
          imageUrl,
          ...getGoalAndTipMenu()
        })
      });
      return response.json();
    };
    try {
      const data = await getResponse();
      console.log('🟢 Respuesta:', data.suggestion);
      console.log('🌍 Traducción:', data.translation);

      // COPIAR AUTOMÁTICO AL PORTAPAPELES
      try {
        navigator.clipboard.writeText(data.suggestion);
      } catch (e) {
        console.log('No se pudo copiar al portapapeles');
      }

      // Crear popup
      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:450px';

      const title = document.createElement('h3');
      title.style.marginTop = '0';
      title.textContent = `💬 ${isPM ? 'PM' : 'Público'} - @${username} ✅ Copiado!`;

      // RESPUESTA PARA COPIAR
      const responseText = document.createElement('p');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:10px;border-radius:3px;max-height:200px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px';
      responseText.textContent = data.suggestion;

      // MOSTRAR TRADUCCIÓN SOLO SI ES DIFERENTE (fan escribió en inglés)
      let translationText = null;
      let translationContent = null;

      // Comparar sin espacios extras para evitar falsos positivos
      const suggestionClean = data.suggestion ? data.suggestion.replace(/\s+/g, ' ').trim().toLowerCase() : '';
      const translationClean = data.translation ? data.translation.replace(/\s+/g, ' ').trim().toLowerCase() : '';

      if (suggestionClean !== translationClean) {
        translationText = document.createElement('div');
        translationText.style.cssText = 'background:#e3f2fd;padding:10px;border-radius:3px;margin-bottom:10px;border-left:3px solid #2196F3';

        const translationLabel = document.createElement('div');
        translationLabel.style.cssText = 'font-size:11px;color:#1976D2;font-weight:600;margin-bottom:5px';
        translationLabel.textContent = '📝 Traducción (para ti):';

        translationContent = document.createElement('div');
        translationContent.style.cssText = 'color:#333';
        translationContent.textContent = data.translation;

        translationText.appendChild(translationLabel);
        translationText.appendChild(translationContent);
      }

      // const copyBtn = document.createElement('button');
      // copyBtn.textContent = '📋 Copiar';
      // copyBtn.style.cssText = 'background:green;color:white;padding:5px 10px;border:none;cursor:pointer;border-radius:3px;font-size:12px';
      // copyBtn.onclick = () => {
      //   navigator.clipboard.writeText(responseText.textContent);
      //   copyBtn.textContent = '✓ Copiado!';
      //   setTimeout(() => popup.remove(), 500);
      // };
      const regenBtn = document.createElement('button');
      regenBtn.textContent = '🔄 Regenerar';
      regenBtn.style.cssText = 'margin-left:5px;padding:5px 10px;cursor:pointer;border-radius:3px;font-size:12px';
      regenBtn.onclick = async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '...';
        try {
          const newData = await getResponse();

          if (newData.suggestion && !newData.suggestion.includes('Error')) {
            responseText.textContent = newData.suggestion;
            try {
              navigator.clipboard.writeText(newData.suggestion);
            } catch (e) {
              console.log('No se pudo copiar al portapapeles');
            }

            // Actualizar traducción si existe
            if (translationContent && newData.translation) {
              const newSuggestionClean = newData.suggestion.replace(/\s+/g, ' ').trim().toLowerCase();
              const newTranslationClean = newData.translation.replace(/\s+/g, ' ').trim().toLowerCase();

              if (newSuggestionClean !== newTranslationClean) {
                translationContent.textContent = newData.translation;
              }
            }
          } else {
            console.error('Respuesta inválida:', newData);
          }
        } catch (error) {
          console.error('Error regenerando:', error);
        }
        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '❌ Cerrar';
      closeBtn.style.cssText = 'margin-left:10px;padding:5px 10px;cursor:pointer;font-size:12px';
      closeBtn.onclick = () => popup.remove();

      popup.appendChild(title);
      popup.appendChild(responseText);
      if (translationText) {
        popup.appendChild(translationText);
      }

      popup.appendChild(regenBtn);
      popup.appendChild(closeBtn);

      const oldPopup = document.getElementById('ai-popup');
      if (oldPopup) oldPopup.remove();

      document.body.appendChild(popup);

      btn.textContent = '✓';
      setTimeout(() => btn.textContent = imageUrl ? '🖼️' : '🤖', 2000);

    } catch (error) {
      console.error('Error:', error);
      btn.textContent = '!';
      setTimeout(() => btn.textContent = imageUrl ? '🖼️' : '🤖', 2000);
    }
  };

  container.appendChild(btn);
}