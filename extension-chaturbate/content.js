console.log("CamAssist loaded!");

// ============================================
// WIDGET DE TIEMPO
// ============================================
(function () {
  if (document.getElementById('camassist-time-btn')) return;

  const token = localStorage.getItem('model_token') || '';

  const timeBtn = document.createElement('button');
  timeBtn.id = 'camassist-time-btn';
  timeBtn.innerHTML = '⏰';
  timeBtn.style.cssText = 'position:fixed;bottom:80px;right:20px;width:50px;height:50px;border-radius:50%;background:#8b5cf6;color:white;border:none;font-size:24px;cursor:pointer;z-index:9999;box-shadow:0 4px 12px rgba(139,92,246,0.4);';

  const popup = document.createElement('div');
  popup.id = 'camassist-time-popup';
  popup.style.cssText = 'display:none;position:fixed;bottom:140px;right:20px;width:300px;height:420px;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:9999;';
  popup.innerHTML = `<iframe src="https://camassist.vercel.app/time-widget.html?token=${token}" style="width:100%;height:100%;border:none;"></iframe>`;

  timeBtn.onclick = (e) => { e.stopPropagation(); popup.style.display = popup.style.display === 'none' ? 'block' : 'none'; };
  document.addEventListener('click', (e) => { if (!popup.contains(e.target) && e.target !== timeBtn) popup.style.display = 'none'; });

  document.body.appendChild(timeBtn);
  document.body.appendChild(popup);
  console.log('⏰ Time Widget listo');
})();

// Enviar broadcaster al background para sync
const syncBroadcaster = window.location.pathname.split('/b/')[1]?.split('/')[0] || '';
if (syncBroadcaster) {
  chrome.runtime.sendMessage({
    type: 'SET_BROADCASTER',
    username: syncBroadcaster
  });
}

// Capturar seguidores si estamos en página de broadcast
if (window.location.pathname.includes('/b/')) {

  // Función para sincronizar seguidores
  async function syncFollowers() {
    const followersEl = Array.from(document.querySelectorAll('a')).find(a => a.href.includes('followers'));
    const followers = parseInt(followersEl?.textContent?.trim()) || 0;

    if (followers >= 0) {
      const token = localStorage.getItem('model_token');
      if (token) {
        try {
          const response = await fetch('https://camassist.vercel.app/api/sync-followers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              platform: 'chaturbate',
              followers
            })
          });
          const data = await response.json();
          console.log('👥 Followers sync:', data);
        } catch (error) {
          console.error('❌ Error syncing followers:', error);
        }
      }
    }
  }

  // Capturar al cargar la página (después de 5 segundos)
  setTimeout(syncFollowers, 5000);

  // Capturar cada 1 hora mientras transmite
  setInterval(syncFollowers, 60 * 60 * 1000);
}

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


function processAllMessages() {

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

}

// Ejecutar cada 2 segundos
setInterval(processAllMessages, 2000);

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
    // Forzar procesamiento de mensajes antes de enviar
    if (typeof processAllMessages === 'function') {
      processAllMessages();
    }

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
          version: '1.0.10',
          broadcaster_username: broadcasterUsername,  // NUEVO
          username,
          message: messageText,
          context: fullContext.slice(-70),
          isPM: currentlyInPM,
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
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:450px;cursor:move';

      // Hacer el popup movible
      let isDragging = false;
      let offsetX, offsetY;

      popup.addEventListener('mousedown', (e) => {
        // No arrastrar si es el textarea o un botón
        if (e.target === responseText || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        offsetX = e.clientX - popup.getBoundingClientRect().left;
        offsetY = e.clientY - popup.getBoundingClientRect().top;
        popup.style.transform = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        popup.style.left = (e.clientX - offsetX) + 'px';
        popup.style.top = (e.clientY - offsetY) + 'px';
      });

      document.addEventListener('mouseup', () => {
        isDragging = false;
      });

      const title = document.createElement('h3');
      title.style.marginTop = '0';
      title.textContent = `💬 ${isPM ? 'PM' : 'Público'} - @${username} ✅ Copiado!`;

      // RESPUESTA PARA COPIAR
      const responseText = document.createElement('textarea');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:10px;border-radius:3px;height:100px;width:100%;resize:vertical;word-wrap:break-word;margin-bottom:10px;border:1px solid #ccc;font-family:inherit;font-size:14px;box-sizing:border-box';
      responseText.value = data.suggestion;

      responseText.addEventListener('keydown', (e) => {
        e.stopPropagation();
      });

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
            responseText.value = newData.suggestion;
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

      // NUEVO: Botón enviar
      const sendBtn = document.createElement('button');
      sendBtn.textContent = '📤 Enviar';
      sendBtn.style.cssText = 'margin-left:5px;padding:5px 10px;cursor:pointer;border-radius:3px;font-size:12px;background:#10B981;color:white;border:none';
      sendBtn.onclick = () => {
        const text = responseText.value;

        // Detectar si estamos en PM AL MOMENTO de enviar
        const pmTabNow = document.querySelector('#pm-tab-default');
        const isCurrentlyPM = pmTabNow && pmTabNow.classList.contains('active');

        let input, sendButton;

        // Si es PM, buscar selectores de PM primero
        if (isCurrentlyPM) {
          input = document.querySelector('div.theatermodeInputFieldPm[contenteditable="true"]');
          sendButton = document.querySelector('button.SendButton.pm');
        }

        // Si no encontró (o es público), usar selectores de público
        if (!input) {
          input = document.querySelector('[data-testid="chat-input"]');
        }
        if (!sendButton) {
          sendButton = document.querySelector('[data-testid="send-button"]');
        }

        if (input && sendButton) {
          input.innerHTML = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => {
            sendButton.click();
            popup.remove();
          }, 100);
        }
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
      popup.appendChild(sendBtn);
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

// FUNCIÓN PARA ENVIAR MENSAJE
function sendMessage(text) {
  const input = document.querySelector('[data-testid="chat-input"]');
  const sendBtn = document.querySelector('[data-testid="send-button"]');

  if (input && sendBtn) {
    // Insertar texto (es contenteditable, no textarea)
    input.innerHTML = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Click en enviar
    setTimeout(() => {
      sendBtn.click();
    }, 100);

    return true;
  }
  return false;
}


// ============================================
// SINCRONIZACIÓN DE EARNINGS
// ============================================

// Enviar broadcaster al background para sync
if (broadcasterUsername) {
  chrome.runtime.sendMessage({
    type: 'SET_BROADCASTER',
    username: broadcasterUsername
  });
}

// Si estamos en la página de tokens, capturar y enviar
if (window.location.href.includes('tab=tokens')) {
  setTimeout(async () => {
    console.log('📊 Detectada página de tokens, capturando...');

    const token = localStorage.getItem('model_token');
    if (!token) {
      console.log('❌ No hay token guardado');
      return;
    }

    const earnings = [];

    // Buscar la tabla de actividad con selector correcto
    const activityTable = document.querySelector('table.tokenStatsTable');

    if (!activityTable) {
      console.log('❌ No se encontró tabla tokenStatsTable');
      return;
    }

    // Obtener filas de datos (no el header)
    const rows = activityTable.querySelectorAll('tr[data-testid="account-activity-row"]');

    console.log(`📊 Encontradas ${rows.length} filas`);

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const dateStr = cells[0]?.textContent?.trim();
        const actionCell = cells[1];
        const action = actionCell?.textContent?.trim();
        const tokens = parseInt(cells[2]?.textContent?.trim()) || 0;
        const tokenBalance = parseInt(cells[3]?.textContent?.trim()) || 0;

        // Extraer username del link
        const usernameLink = actionCell?.querySelector('a.hrefColor');
        const username = usernameLink?.textContent?.trim() || null;

        if (dateStr && tokens > 0) {
          const parsedDate = parseCBDate(dateStr);
          console.log('📅 FECHA:', dateStr, '→', parsedDate);
          earnings.push({
            date: parsedDate,
            action: action,
            username: username,
            tokens: tokens,
            token_balance: tokenBalance
          });
        }
      }
    });

    console.log(`📊 Encontrados ${earnings.length} registros`, earnings[0]);

    if (earnings.length > 0) {
      console.log('📤 ENVIANDO AL API:', JSON.stringify(earnings.slice(0, 3)));
      try {
        const response = await fetch('https://camassist.vercel.app/api/sync-earnings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            platform: 'chaturbate',
            earnings
          })
        });

        const data = await response.json();
        console.log('📊 Sync result:', data);

        // Notificar al background que terminamos
        chrome.runtime.sendMessage({ type: 'SYNC_COMPLETE', result: data });

      } catch (error) {
        console.error('❌ Error syncing:', error);
      }
    }
  }, 3000); // Esperar que cargue la tabla
}

// Parsear fecha de CB (soporta múltiples formatos)
function parseCBDate(dateStr) {
  const months = {
    // Español
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'ago': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
    // Inglés
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  try {
    // Formato 1: "16 ene 2026, 20:55" (español - día mes año)
    let match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4}),?\s*(\d+):(\d+)/);
    if (match) {
      const [_, day, month, year, hour, minute] = match;
      const monthNum = months[month.toLowerCase()] || '01';
      return `${year}-${monthNum}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00`;
    }

    // Formato 2: "Feb 6, 2026, 5:21 PM" (inglés americano - mes día año)
    match = dateStr.match(/(\w+)\s+(\d+),?\s*(\d{4}),?\s*(\d+):(\d+)\s*(AM|PM)?/i);
    if (match) {
      const [_, month, day, year, hour, minute, ampm] = match;
      const monthNum = months[month.toLowerCase()] || '01';
      let hour24 = parseInt(hour);
      if (ampm?.toUpperCase() === 'PM' && hour24 < 12) hour24 += 12;
      if (ampm?.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
      return `${year}-${monthNum}-${day.padStart(2, '0')}T${String(hour24).padStart(2, '0')}:${minute}:00`;
    }

  } catch (e) {
    console.error('Error parsing date:', dateStr, e);
  }

  console.error('❌ Fecha no parseada:', dateStr);
  return new Date().toISOString();
}