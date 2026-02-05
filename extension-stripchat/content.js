console.log("CamAssist StripChat loaded!");

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

// Obtener token de chrome.storage si existe
chrome.storage.local.get(['model_token'], (result) => {
  if (result.model_token) {
    localStorage.setItem('model_token', result.model_token);
    console.log('✅ Token cargado desde extensión:', result.model_token);
  }
});

// HISTORIALES SEPARADOS
let publicHistory = {};
let pmHistory = {};

// Obtener username del broadcaster desde la URL
const broadcasterUsername = window.location.pathname.split('/')[1] || '';
console.log('👤 Broadcaster username:', broadcasterUsername);

const extensionStartTime = Date.now();
console.log('⏰ Extension cargada en:', new Date(extensionStartTime).toLocaleTimeString());

// ============================================
// FUNCIÓN PARA OBTENER GOAL Y TIP MENU (StripChat)
// ============================================
function getGoalAndTipMenu() {
  // GOAL
  let goal = '';
  const goalTokens = document.querySelector('.epic-goal-progress__tokens');
  const goalText = document.querySelector('.epic-goal-progress__information span');
  const goalProgress = document.querySelector('.epic-goal-progress__status');
  if (goalTokens && goalText) {
    const progress = goalProgress ? goalProgress.textContent.trim() : '';
    goal = `${goalText.textContent.trim()} - ${goalTokens.textContent.trim()} (${progress} completado)`;
    console.log('🎯 GOAL detectado:', goal);
  } else {
    console.log('⚠️ No se encontró GOAL');
  }

  // TIP MENU - desde los inputs del menú de propinas
  let tipMenu = [];
  const menuItems = document.querySelectorAll('input[id^="activity"]');
  menuItems.forEach(input => {
    const name = input.value;
    const priceInput = input.closest('li')?.querySelector('input[id^="price"]');
    const price = priceInput ? priceInput.value : '';
    if (name && price) {
      tipMenu.push(`${name} (${price}tk)`);
    }
  });

  console.log('📋 TIP MENU detectado:', tipMenu.length, 'items:', tipMenu);

  return {
    goal: goal,
    tipMenu: tipMenu.join(' | ')
  };
}

let messageCounter = 0;

// OBTENER HISTORIAL FRESCO DEL DOM
function getHistoryFromDOM(username, isPM, chatContainer = null) {
  const history = [];

  if (isPM) {
    const searchRoot = chatContainer || document;
    const allMessages = searchRoot.querySelectorAll('div[data-message-id][class*="base-message"]');

    allMessages.forEach(msg => {
      // 1. DETECTAR TIP PRIMERO
      if (msg.querySelector('.tipped-message')) {
        const tipTextEl = msg.querySelector('.tip-message-text');
        if (tipTextEl) {
          const tipText = tipTextEl.textContent.trim();
          const tipMatch = tipText.match(/(\d+)\s*(tk|tokens?)/i);
          if (tipMatch) {
            history.push({ type: 'tip', amount: parseInt(tipMatch[1]) });
          }
        }
        return;
      }

      // 2. DETECTAR IMAGEN
      if (msg.classList.contains('photo-message')) {
        const imgEl = msg.querySelector('img.photo-image');
        if (imgEl) {
          history.push({ type: 'fan', message: '[Imagen enviada]', imageUrl: imgEl.src });
        }
        return;
      }

      // 3. MENSAJE NORMAL - Detectar si es modelo o fan
      const isModel = msg.className.includes('OwnBaseMessage') ||
        msg.className.includes('own') ||
        msg.className.includes('position-right');

      // Obtener texto
      let text = '';
      const textEl = msg.querySelector('font[dir="auto"]');
      if (textEl) text = textEl.textContent.trim();

      // Fallback
      if (!text) {
        const textEl2 = msg.querySelector('[class*="TextMessage"]');
        if (textEl2) {
          const clone = textEl2.cloneNode(true);
          clone.querySelectorAll('[class*="indicators"], [class*="time"], span').forEach(el => el.remove());
          text = clone.textContent.trim();
        }
      }

      // Detectar tip
      const isTip = msg.classList.contains('tipped-message') || text.includes('propina');
      if (isTip) {
        const tipMatch = text.match(/(\d+)\s*(tk|tokens?)/i);
        if (tipMatch) {
          history.push({ type: 'tip', amount: parseInt(tipMatch[1]) });
        }
        return;
      }

      // Detectar imagen
      const imgEl = msg.querySelector('img.photo-image');
      if (imgEl) {
        history.push({ type: 'fan', message: '[Imagen enviada]', imageUrl: imgEl.src });
        return;
      }

      if (text) {
        history.push({
          type: isModel ? 'model' : 'fan',
          message: text
        });
      }
    });
  } else {
    // PÚBLICO - usar el historial en memoria (ese sí funciona bien)
    const userHistory = publicHistory[username] || { messages: [], tips: [] };
    return [...userHistory.messages, ...userHistory.tips];
  }

  return history;
}

function processAllMessages() {

  // ============================================
  // 1. DETECTAR MENSAJES DE CHAT PÚBLICO
  // ============================================
  const publicMessages = document.querySelectorAll('div[data-message-id].regular-public-message, div[data-message-id].tip-message');

  publicMessages.forEach(msg => {
    if (msg.dataset.processed) return;

    // Obtener username
    const usernameEl = msg.querySelector('.message-username');
    const username = usernameEl ? usernameEl.textContent.trim() : null;

    if (!username) return;

    // Determinar si es mensaje del broadcaster
    const isModelMessage = usernameEl && usernameEl.classList.contains('user-levels-username-chat-owner');

    // Obtener texto del mensaje
    let messageText = '';
    const bodyEl = msg.querySelector('.message-body');
    if (bodyEl) {
      const clone = bodyEl.cloneNode(true);
      const usernameInBody = clone.querySelector('.message-username');
      if (usernameInBody) usernameInBody.remove();
      clone.querySelectorAll('button').forEach(b => b.remove());
      messageText = clone.textContent.trim();
    }

    messageText = messageText.replace(/^@\S+\s*/g, '').trim();

    if (!messageText) return;

    // Detectar tips
    const isTip = messageText.includes('tipped') || messageText.includes('tokens') || messageText.includes('propina') || messageText.includes('tk de') || msg.classList.contains('tip-message');
    let tipAmount = 0;
    if (isTip) {
      const match = messageText.match(/(\d+)\s*(tokens?|tips?|tk)/i);
      if (match) tipAmount = parseInt(match[1]);
    }

    msg.dataset.processed = 'true';

    // Guardar en historial
    if (!isTip && messageText) {
      let targetUsername = username;

      if (isModelMessage) {
        const mentionMatch = msg.textContent.match(/@(\w+)/);
        if (mentionMatch) {
          targetUsername = mentionMatch[1];
        }
      }

      if (!publicHistory[targetUsername]) {
        publicHistory[targetUsername] = { messages: [], tips: [] };
      }

      const msgId = parseInt(msg.getAttribute('data-message-id')) || messageCounter++;

      // Evitar duplicados consecutivos (mismo mensaje justo antes)
      const lastMsg = publicHistory[targetUsername].messages.slice(-1)[0];
      const isDuplicate = lastMsg &&
        lastMsg.message === messageText &&
        lastMsg.type === (isModelMessage ? 'model' : 'fan');

      if (!isDuplicate) {
        publicHistory[targetUsername].messages.push({
          type: isModelMessage ? 'model' : 'fan',
          message: messageText,
          timestamp: msgId
        });
      }

      if (publicHistory[targetUsername].messages.length > 70) {
        publicHistory[targetUsername].messages.shift();
      }

      console.log(`💬 Público - ${isModelMessage ? 'Modelo' : 'Fan'} (${targetUsername}): ${messageText}`);
    }

    // Agregar botón IA en mensajes de fans
    const hasTipMessage = isTip && messageText && !messageText.match(/^tipped \d+ tokens?$/i);

    if (!isModelMessage && messageText && !msg.querySelector('.ai-btn')) {
      if (!isTip || hasTipMessage) {
        addAIButton(msg, username, messageText, false, 'public', tipAmount);
      }
    }

    // Guardar tip
    if (isTip && tipAmount > 0) {
      if (!publicHistory[username]) {
        publicHistory[username] = { messages: [], tips: [] };
      }
      const msgId = parseInt(msg.getAttribute('data-message-id')) || Date.now();
      const isDuplicate = publicHistory[username].tips.some(item =>
        item.type === 'tip' && item.timestamp === msgId
      );
      if (!isDuplicate) {
        publicHistory[username].tips.push({ type: 'tip', amount: tipAmount, timestamp: msgId });
        if (publicHistory[username].tips.length > 5) {
          publicHistory[username].tips.shift();
        }
        console.log(`💰 Público - Tip de ${username}: ${tipAmount} tokens`);
      }
    }
  });

  // ============================================
  // 2. DETECTAR MENSAJES DE PM (pestaña o modal)
  // ============================================

  // Obtener username del PM desde el link del header
  // Obtener username del PM desde múltiples fuentes
  let pmUser = null;

  // 1. Desde el link del popup de info
  const usernameLink = document.querySelector('a.user-levels-username-link');
  if (usernameLink) {
    const href = usernameLink.getAttribute('href');
    if (href && href.includes('/user/')) {
      pmUser = href.split('/user/')[1];
    }
  }

  // 2. Desde el header del modal de chat
  if (!pmUser) {
    const chatHeader = document.querySelector('[class*="MessengerChat"] [class*="username"], [class*="ChatHeader"] [class*="name"]');
    if (chatHeader) {
      pmUser = chatHeader.textContent.trim();
    }
  }

  // 3. Desde el título del modal (el nombre arriba del chat)
  if (!pmUser) {
    const modalTitle = document.querySelector('[class*="user-info-popup-header"] a');
    if (modalTitle) {
      const href = modalTitle.getAttribute('href');
      if (href && href.includes('/user/')) {
        pmUser = href.split('/user/')[1];
      }
    }
  }
  if (usernameLink) {
    const href = usernameLink.getAttribute('href');
    if (href && href.includes('/user/')) {
      pmUser = href.split('/user/')[1];
    }
  }
  // Fallback: span con el nombre
  if (!pmUser) {
    const usernameSpan = document.querySelector('span.user-levels-username-text');
    if (usernameSpan) {
      pmUser = usernameSpan.textContent.trim();
    }
  }

  // Detectar tips en PM (tienen estructura diferente)
  const pmTips = document.querySelectorAll('div.tipped-message:not([data-processed])');
  pmTips.forEach(tip => {
    if (tip.dataset.processed) return;

    const tipTextEl = tip.querySelector('.tip-message-text');
    if (!tipTextEl) return;

    const tipText = tipTextEl.textContent.trim();
    const tipMatch = tipText.match(/(\d+)\s*(tk|tokens?)/i);

    if (tipMatch) {
      const targetUser = pmUser || 'fan';
      if (!pmHistory[targetUser]) {
        pmHistory[targetUser] = { messages: [], tips: [] };
      }
      const tipAmount = parseInt(tipMatch[1]);
      const msgId = parseInt(tip.closest('[data-message-id]')?.getAttribute('data-message-id')) || Date.now();
      pmHistory[targetUser].tips.push({ type: 'tip', amount: tipAmount, timestamp: msgId });
      if (pmHistory[targetUser].tips.length > 5) {
        pmHistory[targetUser].tips.shift();
      }
      console.log(`💰 PM - Tip de ${targetUser}: ${tipAmount} tokens`);
    }
    tip.dataset.processed = 'true';
  });

  // Detectar imágenes en PM
  const pmImages = document.querySelectorAll('div.photo-message:not([data-processed])');
  pmImages.forEach(imgMsg => {
    if (imgMsg.dataset.processed) return;

    const imgEl = imgMsg.querySelector('img.photo-image');
    if (!imgEl) return;

    const imageUrl = imgEl.getAttribute('src');
    if (!imageUrl) return;

    const targetUser = pmUser || 'fan';

    // Guardar en historial
    if (!pmHistory[targetUser]) {
      pmHistory[targetUser] = { messages: [], tips: [] };
    }
    const msgId = parseInt(imgMsg.closest('[data-message-id]')?.getAttribute('data-message-id')) || Date.now();
    pmHistory[targetUser].messages.push({
      type: 'fan',
      message: '[Imagen enviada]',
      timestamp: msgId,
      imageUrl: imageUrl
    });
    if (pmHistory[targetUser].messages.length > 70) {
      pmHistory[targetUser].messages.shift();
    }

    console.log(`🖼️ PM - Imagen de ${targetUser}: ${imageUrl.substring(0, 50)}...`);

    // Agregar botón IA azul para imagen
    if (!imgMsg.querySelector('.ai-btn')) {
      addImageAIButton(imgMsg, targetUser, imageUrl);
    }

    imgMsg.dataset.processed = 'true';
  });

  // TODOS los mensajes de PM (fan y modelo juntos, en orden del DOM)

  // TODOS los mensajes de PM (fan y modelo juntos, en orden del DOM)
  const allPmMessages = document.querySelectorAll('div[data-message-id][class*="base-message"]');

  allPmMessages.forEach(msg => {
    if (msg.dataset.processed) return;

    // Determinar si es mensaje de modelo o fan
    const isModelMessage = msg.className.includes('OwnBaseMessage') ||
      msg.className.includes('own') ||
      msg.className.includes('position-right');

    // Obtener texto SIN el timestamp
    let messageText = '';
    const textEl = msg.querySelector('[class*="TextMessage"][class*="base-message"]');
    if (textEl) {
      const clone = textEl.cloneNode(true);
      clone.querySelectorAll('[class*="indicators"], [class*="time"], span').forEach(el => el.remove());
      messageText = clone.textContent.trim();
    }

    // Fallback
    if (!messageText) {
      const fontEl = msg.querySelector('font[dir="auto"]');
      if (fontEl) {
        messageText = fontEl.textContent.trim();
      }
    }

    if (!messageText) return;

    // Detectar si es tip en PM
    const isTipPM = msg.classList.contains('tipped-message') || messageText.includes('propina');
    if (isTipPM) {
      const tipMatch = messageText.match(/(\d+)\s*(tk|tokens?)/i);
      if (tipMatch) {
        const targetUser = pmUser || 'fan';
        if (!pmHistory[targetUser]) {
          pmHistory[targetUser] = { messages: [], tips: [] };
        }
        const tipAmount = parseInt(tipMatch[1]);
        const msgId = parseInt(msg.getAttribute('data-message-id')) || Date.now();
        const exists = pmHistory[targetUser].tips.some(item => item.timestamp === msgId && item.type === 'tip');
        if (!exists) {
          pmHistory[targetUser].tips.push({ type: 'tip', amount: tipAmount, timestamp: msgId });
          if (pmHistory[targetUser].tips.length > 5) {
            pmHistory[targetUser].tips.shift();
          }
          console.log(`💰 PM - Tip de ${targetUser}: ${tipAmount} tokens`);
        }
      }
      msg.dataset.processed = 'true';
      return;
    }

    const targetUser = pmUser || 'fan';

    msg.dataset.processed = 'true';

    if (!pmHistory[targetUser]) {
      pmHistory[targetUser] = { messages: [], tips: [] };
    }

    const msgId = parseInt(msg.getAttribute('data-message-id')) || messageCounter++;

    // Evitar duplicados consecutivos (mismo mensaje justo antes)
    const lastMsg = pmHistory[targetUser].messages.slice(-1)[0];
    const isDuplicate = lastMsg &&
      lastMsg.message === messageText &&
      lastMsg.type === (isModelMessage ? 'model' : 'fan');

    if (!isDuplicate) {
      pmHistory[targetUser].messages.push({
        type: isModelMessage ? 'model' : 'fan',
        message: messageText,
        timestamp: msgId
      });
    }

    if (pmHistory[targetUser].messages.length > 70) {
      pmHistory[targetUser].messages.shift();
    }

    console.log(`💬 PM - ${isModelMessage ? 'Modelo' : 'Fan'} (${targetUser}): ${messageText}`);

    // Agregar botón IA solo en mensajes de fans
    if (!isModelMessage && !msg.querySelector('.ai-btn')) {
      addAIButton(msg, targetUser, messageText, true, 'pm', 0);
    }
  });

}

// Ejecutar cada 2 segundos
setInterval(processAllMessages, 2000);

// ============================================
// FUNCIÓN PARA AGREGAR BOTÓN IA
// ============================================
function addAIButton(container, username, messageText, isPM, context, tipAmount) {
  const btn = document.createElement('button');
  btn.textContent = '🤖';
  btn.className = 'ai-btn';

  if (isPM) {
    btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:2px 5px;cursor:pointer;border-radius:4px;font-size:10px;margin-left:5px;vertical-align:middle;display:inline;';
  } else {
    btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:3px 8px;margin-left:5px;cursor:pointer;border-radius:5px;font-size:12px;';
  }

  // DESPUÉS:
  btn.onclick = async () => {
    console.log(`🔵 IA para ${isPM ? 'PM' : 'público'} - Usuario: ${username}`);
    btn.textContent = '...';

    // Encontrar el contenedor del chat específico
    let chatContainer = null;
    if (isPM) {
      chatContainer = container.closest('div.messenger-chat');
      console.log(`📦 Chat container para ${username}:`, chatContainer ? 'encontrado' : 'NO encontrado');
    }

    // OBTENER HISTORIAL FRESCO DEL DOM
    const freshHistory = getHistoryFromDOM(username, isPM, chatContainer);

    console.log('📚 Historial fresco del DOM:', freshHistory.length, 'mensajes');
    console.table(freshHistory.slice(-20).map((item, i) => ({
      '#': i,
      'Quién': item.type === 'tip' ? '💰 Tip' : item.type === 'model' ? '💃 Modelo' : '👤 Fan',
      'Mensaje': item.type === 'tip' ? `${item.amount} tk` : item.message?.substring(0, 40)
    })));

    console.log(`🔵 IA para ${isPM ? 'PM' : 'público'} - Usuario: ${username}`);

    btn.textContent = '...';

    const getResponse = async () => {
      // Usar historial fresco (ya está en orden del DOM)
      let fullContext = freshHistory;

      // Si es PM, agregar contexto público al inicio
      if (isPM && publicHistory[username]) {
        const pubMessages = publicHistory[username].messages || [];
        const pubTips = publicHistory[username].tips || [];
        fullContext = [...pubMessages, ...pubTips, ...freshHistory];
      }

      // TABLA DE HISTORIAL
      console.log('📚 Historial enviado a IA (últimos 70):');
      console.table(fullContext.slice(-70).map((item, index) => ({
        '#': index,
        'Quién': item.type === 'fan' ? '👤 Fan' : item.type === 'model' ? '💃 Modelo' : '💰 Tip',
        'Mensaje': item.type === 'tip' ? `${item.amount} tokens` : item.message?.substring(0, 50)
      })));

      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          platform: 'stripchat',
          version: '1.0.7',
          broadcaster_username: broadcasterUsername,
          username,
          message: messageText,
          context: fullContext.slice(-70),
          isPM,
          tip: tipAmount,
          ...getGoalAndTipMenu()
        })
      });
      return response.json();
    };
    try {
      const data = await getResponse();
      console.log('🟢 Respuesta:', data.suggestion);

      try {
        navigator.clipboard.writeText(data.suggestion);
      } catch (e) {
        console.log('No se pudo copiar al portapapeles');
      }

      // Crear popup
      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #8B5CF6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;cursor:move';

      // Hacer el popup movible
      let isDragging = false;
      let offsetX, offsetY;

      popup.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
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
      title.style.cssText = 'margin:0 0 15px 0;color:#333;';
      title.textContent = `💬 ${isPM ? 'PM' : 'Público'} - @${username} ✅ Copiado!`;

      const responseText = document.createElement('textarea');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:12px;border-radius:5px;height:100px;width:100%;resize:vertical;word-wrap:break-word;margin-bottom:10px;color:#333;border:1px solid #ccc;font-family:inherit;font-size:14px;box-sizing:border-box';
      responseText.value = data.suggestion;

      responseText.addEventListener('keydown', (e) => {
        e.stopPropagation();
      });

      // Traducción
      let translationText = null;
      let translationContent = null;

      const suggestionClean = data.suggestion ? data.suggestion.replace(/\s+/g, ' ').trim().toLowerCase() : '';
      const translationClean = data.translation ? data.translation.replace(/\s+/g, ' ').trim().toLowerCase() : '';

      if (data.translation && suggestionClean !== translationClean) {
        translationText = document.createElement('div');
        translationText.style.cssText = 'background:#e3f2fd;padding:10px;border-radius:5px;margin-bottom:10px;border-left:3px solid #2196F3;';

        const translationLabel = document.createElement('div');
        translationLabel.style.cssText = 'font-size:11px;color:#1976D2;font-weight:600;margin-bottom:5px;';
        translationLabel.textContent = '📝 Traducción (para ti):';

        translationContent = document.createElement('div');
        translationContent.style.cssText = 'color:#333;';
        translationContent.textContent = data.translation;

        translationText.appendChild(translationLabel);
        translationText.appendChild(translationContent);
      }

      const regenBtn = document.createElement('button');
      regenBtn.textContent = '🔄 Regenerar';
      regenBtn.style.cssText = 'padding:8px 15px;cursor:pointer;border-radius:5px;font-size:12px;border:1px solid #ddd;background:#f5f5f5;margin-right:10px;';
      regenBtn.onclick = async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '...';
        try {
          const newData = await getResponse();
          responseText.value = newData.suggestion;
          navigator.clipboard.writeText(newData.suggestion);
          if (translationContent && newData.translation) {
            translationContent.textContent = newData.translation;
          }
        } catch (error) {
          console.error('Error regenerando:', error);
        }
        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '❌ Cerrar';
      closeBtn.style.cssText = 'padding:8px 15px;cursor:pointer;font-size:12px;border:none;background:#8B5CF6;color:white;border-radius:5px;';
      closeBtn.onclick = () => popup.remove();

      popup.appendChild(title);
      popup.appendChild(responseText);
      if (translationText) {
        popup.appendChild(translationText);
      }
      // Botón Enviar
      const sendBtn = document.createElement('button');
      sendBtn.textContent = '📤 Enviar';
      sendBtn.style.cssText = 'padding:8px 15px;cursor:pointer;border-radius:5px;font-size:12px;border:none;background:#22c55e;color:white;margin-right:10px;';
      // sendBtn.onclick = () => {
      //   const text = responseText.value;

      //   // Detectar si estamos en PM
      //   const privateTab = document.querySelector('.model-chat-nav a[href*="private"].active, [class*="private"][class*="active"]');
      //   const isCurrentlyPM = privateTab !== null;

      //   let input, sendButton;
      //   if (isCurrentlyPM) {
      //     input = document.querySelector('textarea[class*="ChatInput__input"]');
      //   }
      //   if (!input) {
      //     input = document.querySelector('input[class*="ChatInput__input"]');
      //   }
      //   sendButton = document.querySelector('button[class*="ChatInput__sendBtn"]');

      //   if (input && sendButton) {
      //     input.value = text;
      //     input.dispatchEvent(new Event('input', { bubbles: true }));
      //     setTimeout(() => {
      //       sendButton.click();
      //       popup.remove();
      //     }, 100);
      //   }
      // };
      sendBtn.onclick = () => {
        const text = responseText.value;

        // Buscar primero el input de PM, luego el de público
        let input = document.querySelector('textarea[placeholder*="privado"]');
        if (!input) {
          input = document.querySelector('input[class*="ChatInput__input"]');
        }
        const sendButton = document.querySelector('button[class*="ChatInput__sendBtn"]');

        console.log('🔍 input:', input);
        console.log('🔍 sendButton:', sendButton);

        if (input && sendButton) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => {
            sendButton.click();
            popup.remove();
          }, 100);
        } else {
          console.log('❌ No se encontraron elementos');
        }
      };

      popup.appendChild(regenBtn);
      popup.appendChild(sendBtn);
      popup.appendChild(closeBtn);

      const oldPopup = document.getElementById('ai-popup');
      if (oldPopup) oldPopup.remove();

      document.body.appendChild(popup);

      btn.textContent = '✓';
      setTimeout(() => btn.textContent = '🤖', 2000);

    } catch (error) {
      console.error('Error:', error);
      btn.textContent = '!';
      setTimeout(() => btn.textContent = '🤖', 2000);
    }
  };

  // Dónde poner el botón
  if (isPM) {
    const textEl = container.querySelector('font[dir="auto"]') || container.querySelector('[class*="TextMessage"]');
    if (textEl) {
      textEl.parentElement.style.display = 'inline';
      textEl.after(btn);
    } else {
      container.appendChild(btn);
    }
  } else {
    const messageBody = container.querySelector('.message-body');
    const targetEl = messageBody || container;
    targetEl.appendChild(btn);
  }
}

function addImageAIButton(container, username, imageUrl) {
  const btn = document.createElement('button');
  btn.textContent = '🤖';
  btn.className = 'ai-btn';
  btn.style.cssText = 'background:#3B82F6;color:white;border:none;padding:4px 8px;cursor:pointer;border-radius:5px;font-size:12px;position:absolute;bottom:5px;right:5px;z-index:100;';

  btn.onclick = async () => {
    const history = pmHistory[username] || [];

    console.log(`🔵 IA para imagen PM - Usuario: ${username}`);
    btn.textContent = '...';

    try {
      const userMessages = history.messages || [];
      const userTips = history.tips || [];
      let fullContext = [...userMessages, ...userTips];

      if (publicHistory[username]) {
        const pubMessages = publicHistory[username].messages || [];
        const pubTips = publicHistory[username].tips || [];
        fullContext = [...pubMessages, ...pubTips, ...fullContext];
      }
      fullContext = fullContext.sort((a, b) => a.timestamp - b.timestamp);

      console.log('📚 Historial enviado a IA (últimos 70):');
      console.table(fullContext.slice(-70).map((item, index) => ({
        '#': index,
        'Quién': item.type === 'fan' ? '👤 Fan' : item.type === 'model' ? '💃 Modelo' : '💰 Tip',
        'Mensaje': item.type === 'tip' ? `${item.amount} tokens` : item.message.substring(0, 50)
      })));

      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          platform: 'stripchat',
          version: '1.0.7',
          broadcaster_username: broadcasterUsername,
          username,
          message: '[Fan envió una imagen]',
          context: fullContext.slice(-70),
          isPM: true,
          tip: 0,
          hasImage: true,
          imageUrl: imageUrl
        })
      });

      const data = await response.json();
      console.log('🟢 Respuesta:', data.suggestion);

      try {
        navigator.clipboard.writeText(data.suggestion);
      } catch (e) {
        console.log('No se pudo copiar al portapapeles');
      }

      // Crear popup
      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #3B82F6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;';

      const title = document.createElement('h3');
      title.style.cssText = 'margin:0 0 15px 0;color:#333;';
      title.textContent = `🖼️ Imagen PM - @${username} ✅ Copiado!`;

      const responseText = document.createElement('p');
      responseText.style.cssText = 'background:#f0f0f0;padding:12px;border-radius:5px;max-height:200px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px;color:#333;';
      responseText.textContent = data.suggestion;

      // Traducción
      let translationText = null;
      if (data.translation && data.suggestion.toLowerCase() !== data.translation.toLowerCase()) {
        translationText = document.createElement('div');
        translationText.style.cssText = 'background:#e3f2fd;padding:10px;border-radius:5px;margin-bottom:10px;border-left:3px solid #2196F3;';
        translationText.innerHTML = `<div style="font-size:11px;color:#1976D2;font-weight:600;margin-bottom:5px;">📝 Traducción:</div><div style="color:#333;">${data.translation}</div>`;
      }

      const regenBtn = document.createElement('button');
      regenBtn.textContent = '🔄 Regenerar';
      regenBtn.style.cssText = 'padding:8px 15px;cursor:pointer;border-radius:5px;font-size:12px;border:1px solid #ddd;background:#f5f5f5;margin-right:10px;';
      regenBtn.onclick = async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '...';
        try {
          const newResponse = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: localStorage.getItem('model_token') || 'demo_token',
              platform: 'stripchat',
              version: '1.0.7',
              broadcaster_username: broadcasterUsername,
              username,
              message: '[Fan envió una imagen]',
              context: fullContext.slice(-70),
              isPM: true,
              tip: 0,
              hasImage: true,
              imageUrl: imageUrl
            })
          });
          const newData = await newResponse.json();
          responseText.textContent = newData.suggestion;
          navigator.clipboard.writeText(newData.suggestion);
        } catch (error) {
          console.error('Error regenerando:', error);
        }
        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '❌ Cerrar';
      closeBtn.style.cssText = 'padding:8px 15px;cursor:pointer;font-size:12px;border:none;background:#3B82F6;color:white;border-radius:5px;';
      closeBtn.onclick = () => popup.remove();

      popup.appendChild(title);
      popup.appendChild(responseText);
      if (translationText) popup.appendChild(translationText);
      // Botón Enviar
      const sendBtn = document.createElement('button');
      sendBtn.textContent = '📤 Enviar';
      sendBtn.style.cssText = 'padding:8px 15px;cursor:pointer;border-radius:5px;font-size:12px;border:none;background:#22c55e;color:white;margin-right:10px;';
      sendBtn.onclick = () => {
        const text = responseText.textContent;

        let input = document.querySelector('textarea[placeholder*="privado"]');
        if (!input) {
          input = document.querySelector('input[class*="ChatInput__input"]');
        }
        const sendButton = document.querySelector('button[class*="ChatInput__sendBtn"]');

        if (input && sendButton) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => {
            sendButton.click();
            popup.remove();
          }, 100);
        }
      };

      popup.appendChild(regenBtn);
      popup.appendChild(sendBtn);
      popup.appendChild(closeBtn);

      const oldPopup = document.getElementById('ai-popup');
      if (oldPopup) oldPopup.remove();

      document.body.appendChild(popup);

      btn.textContent = '✓';
      setTimeout(() => btn.textContent = '🤖', 2000);

    } catch (error) {
      console.error('Error:', error);
      btn.textContent = '!';
      setTimeout(() => btn.textContent = '🤖', 2000);
    }
  };

  // Posicionar el botón sobre la imagen
  container.style.position = 'relative';
  container.appendChild(btn);
}
