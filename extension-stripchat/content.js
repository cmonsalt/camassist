console.log("CamAssist StripChat loaded!");

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

// Obtener username del broadcaster desde la URL
const broadcasterUsername = window.location.pathname.split('/')[1] || '';
console.log('👤 Broadcaster username:', broadcasterUsername);

const extensionStartTime = Date.now();
console.log('⏰ Extension cargada en:', new Date(extensionStartTime).toLocaleTimeString());

setInterval(() => {
  // 1. DETECTAR MENSAJES DE CHAT PÚBLICO
  // ============================================
  const publicMessages = document.querySelectorAll('div[data-message-id].regular-public-message');
  
  publicMessages.forEach(msg => {
    if (msg.dataset.processed) return;
    
    // Obtener username
    const usernameEl = msg.querySelector('.message-username, .username-userlevels');
    const username = usernameEl ? usernameEl.textContent.trim() : null;
    
    if (!username) return;
    
    // Determinar si es mensaje del broadcaster
    const isModelMessage = username.toLowerCase() === broadcasterUsername.toLowerCase();
    
    // Obtener texto del mensaje
    let messageText = '';
    const bodyEl = msg.querySelector('.message-body');
    if (bodyEl) {
      // Clonar para no modificar el original
      const clone = bodyEl.cloneNode(true);
      // Remover el elemento del username
      const usernameInBody = clone.querySelector('.message-username, .username-userlevels');
      if (usernameInBody) usernameInBody.remove();
      // Remover botones
      clone.querySelectorAll('button').forEach(b => b.remove());
      messageText = clone.textContent.trim();
    }
    
    // Limpiar @mentions del inicio
    messageText = messageText.replace(/^@\S+\s*/g, '').trim();
    
    if (!messageText) return;
    
    // Detectar tips
    const isTip = messageText.includes('tipped') || messageText.includes('tokens');
    let tipAmount = 0;
    if (isTip) {
      const match = messageText.match(/(\d+)\s*(tokens?|tips?)/i);
      if (match) tipAmount = parseInt(match[1]);
    }
    
    msg.dataset.processed = 'true';
    
    // ============================================
    // GUARDAR EN HISTORIAL PÚBLICO
    // ============================================
    if (!isTip && messageText) {
      let targetUsername = username;
      
      // Si la modelo responde con @mention
      if (isModelMessage) {
        const mentionMatch = msg.textContent.match(/@(\w+)/);
        if (mentionMatch) {
          targetUsername = mentionMatch[1];
        }
      }
      
      if (!publicHistory[targetUsername]) {
        publicHistory[targetUsername] = [];
      }
      
      publicHistory[targetUsername].push({
        type: isModelMessage ? 'model' : 'fan',
        message: messageText,
        timestamp: Date.now()
      });
      
      if (publicHistory[targetUsername].length > 20) {
        publicHistory[targetUsername].shift();
      }
      
      console.log(`💬 Público - ${isModelMessage ? 'Modelo' : 'Fan'} (${targetUsername}): ${messageText}`);
    }
    
    // ============================================
    // AGREGAR BOTÓN IA EN MENSAJES DE FANS (PÚBLICO)
    // ============================================
    const hasTipMessage = isTip && messageText && !messageText.match(/^tipped \d+ tokens?$/i);
    
    if (!isModelMessage && messageText && !msg.querySelector('.ai-btn')) {
      if (!isTip || hasTipMessage) {
        addAIButton(msg, username, messageText, false, 'public', tipAmount);
      }
    }
    
    // Guardar tip
    if (isTip && tipAmount > 0) {
      if (!publicHistory[username]) {
        publicHistory[username] = [];
      }
      const now = Date.now();
      const isDuplicate = publicHistory[username].some(item => 
        item.type === 'tip' && item.amount === tipAmount && Math.abs(item.timestamp - now) < 2000
      );
      if (!isDuplicate) {
        publicHistory[username].push({ type: 'tip', amount: tipAmount, timestamp: now });
        console.log(`💰 Público - Tip de ${username}: ${tipAmount} tokens`);
      }
    }
  });

  // ============================================
  // 2. DETECTAR MENSAJES DE PM
  // ============================================
  // PM está abierto si existe el panel de messenger
  const pmContainer = document.querySelector('[class*="messenger-chat"], [class*="private-chat"], [id*="private-chat"]');
  
  // Obtener username del PM desde el header del chat
  let pmUser = null;
  const pmHeader = document.querySelector('[class*="ChatHeader"] span, [class*="messenger-header"]');
  if (pmHeader) {
    pmUser = pmHeader.textContent.trim().split(/\s/)[0];
  }
  
  // Mensajes del fan en PM (counterpart = la otra persona)
  // Selector más amplio para capturar ambas vistas de PM
  const pmFanMessages = document.querySelectorAll('[class*="counterpart-base-message"]');
  
  if (pmFanMessages.length > 0) {
    console.log(`🔍 PM: Encontrados ${pmFanMessages.length} mensajes de fan`);
  }
  
  pmFanMessages.forEach(msg => {
    if (msg.dataset.processed) return;
    
    // Obtener texto del font
    let messageText = '';
    const fontEl = msg.querySelector('font[dir="auto"]');
    if (fontEl) {
      messageText = fontEl.textContent.trim();
    }
    
    if (!messageText) return;
    
    // Obtener username del PM
    const targetUser = pmUser || 'fan';
    
    msg.dataset.processed = 'true';
    
    // Guardar en historial PM
    if (!pmHistory[targetUser]) {
      pmHistory[targetUser] = [];
    }
    
    pmHistory[targetUser].push({
      type: 'fan',
      message: messageText,
      timestamp: Date.now()
    });
    
    if (pmHistory[targetUser].length > 20) {
      pmHistory[targetUser].shift();
    }
    
    console.log(`💬 PM - Fan (${targetUser}): ${messageText}`);
    
    // Agregar botón IA
    if (!msg.querySelector('.ai-btn')) {
      addAIButton(msg, targetUser, messageText, true, 'pm', 0);
    }
  });
  
  // Mensajes de la modelo en PM (para historial)
  const pmModelMessages = document.querySelectorAll('[class*="OwnBaseMessage"]');
  
  pmModelMessages.forEach(msg => {
    if (msg.dataset.processedModel) return;
    
    let messageText = '';
    const fontEl = msg.querySelector('font[dir="auto"]');
    if (fontEl) {
      messageText = fontEl.textContent.trim();
    }
    
    if (!messageText) return;
    
    const targetUser = pmUser || 'fan';
    
    msg.dataset.processedModel = 'true';
    
    if (!pmHistory[targetUser]) {
      pmHistory[targetUser] = [];
    }
    
    pmHistory[targetUser].push({
      type: 'model',
      message: messageText,
      timestamp: Date.now()
    });
    
    if (pmHistory[targetUser].length > 20) {
      pmHistory[targetUser].shift();
    }
    
    console.log(`💬 PM - Modelo: ${messageText}`);
  });

}, 2000);

// ============================================
// FUNCIÓN PARA AGREGAR BOTÓN IA
// ============================================
function addAIButton(container, username, messageText, isPM, context, tipAmount) {
  const btn = document.createElement('button');
  btn.textContent = '🤖';
  btn.className = 'ai-btn';
  btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:4px 10px;margin-left:8px;cursor:pointer;border-radius:5px;font-size:14px;vertical-align:middle;display:inline-block;position:relative;z-index:1000;';

  btn.onclick = async (e) => {
    e.stopPropagation();
    
    // Obtener historial correcto según contexto
    const history = context === 'pm' ? pmHistory : publicHistory;
    const userHistory = history[username] || [];

    console.log(`🔵 IA para ${isPM ? 'PM' : 'público'} - Usuario: ${username}`);
    
    // SI ESTAMOS EN PM, incluir historial público también
    let fullContext = userHistory;
    if (isPM && publicHistory[username]) {
      fullContext = [...publicHistory[username], ...userHistory];
    }

    console.log('📚 Historial del usuario (últimos 10):');
    console.table(fullContext.slice(-10).map((item, index) => ({
      '#': index,
      'Quién': item.type === 'fan' ? '👤 Fan' : item.type === 'model' ? '💃 Modelo' : '💰 Tip',
      'Mensaje': item.type === 'tip' ? `${item.amount} tokens` : (item.message.substring(0, 50) + (item.message.length > 50 ? '...' : '')),
      'Timestamp': new Date(item.timestamp).toLocaleTimeString()
    })));

    btn.textContent = '...';

    const getResponse = async () => {
      let fullContext = userHistory;
      if (isPM && publicHistory[username]) {
        fullContext = [...publicHistory[username], ...userHistory];
      }

      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          username,
          message: messageText,
          context: fullContext.slice(-10),
          isPM,
          tip: tipAmount
        })
      });
      return response.json();
    };
    
    try {
      const data = await getResponse();
      console.log('🟢 Respuesta:', data.suggestion);
      console.log('🌍 Traducción:', data.translation);

      // COPIAR AUTOMÁTICO AL PORTAPAPELES
      navigator.clipboard.writeText(data.suggestion);

      // Crear popup
      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #8B5CF6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;';

      const title = document.createElement('h3');
      title.style.cssText = 'margin:0 0 15px 0;color:#333;';
      title.textContent = `💬 ${isPM ? 'PM' : 'Público'} - @${username} ✅ Copiado!`;

      // RESPUESTA PARA COPIAR
      const responseText = document.createElement('p');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:12px;border-radius:5px;max-height:200px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px;color:#333;';
      responseText.textContent = data.suggestion;

      // MOSTRAR TRADUCCIÓN SOLO SI ES DIFERENTE
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

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display:flex;gap:10px;';

      const regenBtn = document.createElement('button');
      regenBtn.textContent = '🔄 Regenerar';
      regenBtn.style.cssText = 'flex:1;padding:10px;cursor:pointer;border-radius:5px;font-size:13px;border:1px solid #ddd;background:#f5f5f5;';
      regenBtn.onclick = async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '...';
        try {
          const newData = await getResponse();
          responseText.textContent = newData.suggestion;
          navigator.clipboard.writeText(newData.suggestion);

          if (translationContent && newData.translation) {
            const newSuggestionClean = newData.suggestion.replace(/\s+/g, ' ').trim().toLowerCase();
            const newTranslationClean = newData.translation.replace(/\s+/g, ' ').trim().toLowerCase();
            if (newSuggestionClean !== newTranslationClean) {
              translationContent.textContent = newData.translation;
            }
          }
        } catch (error) {
          console.error('Error regenerando:', error);
        }
        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '❌ Cerrar';
      closeBtn.style.cssText = 'flex:1;padding:10px;cursor:pointer;font-size:13px;border:none;background:#8B5CF6;color:white;border-radius:5px;';
      closeBtn.onclick = () => popup.remove();

      buttonContainer.appendChild(regenBtn);
      buttonContainer.appendChild(closeBtn);

      popup.appendChild(title);
      popup.appendChild(responseText);
      if (translationText) {
        popup.appendChild(translationText);
      }
      popup.appendChild(buttonContainer);

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

  // Encontrar mejor lugar para el botón
  const messageBody = container.querySelector('.message-body');
  const textMessage = container.querySelector('[class*="TextMessage"]');
  const fontEl = container.querySelector('font[dir="auto"]');
  const innerWrapper = container.querySelector('[class*="wrapper-inner"]');
  
  // Para PM: poner después del font o en el TextMessage
  // Para público: poner en message-body
  const targetEl = messageBody || textMessage || (fontEl ? fontEl.parentElement : null) || innerWrapper || container;
  
  targetEl.appendChild(btn);
}