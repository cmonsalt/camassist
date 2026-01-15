console.log("CamAssist XModels loaded!");

// Obtener token de chrome.storage si existe
chrome.storage.local.get(['model_token'], (result) => {
  if (result.model_token) {
    localStorage.setItem('model_token', result.model_token);
    console.log('✅ Token cargado desde extensión:', result.model_token);
  }
});

// HISTORIALES SEPARADOS POR TIPO DE CHAT
let freeHistory = {};
let secretHistory = {};
let privateHistory = {};

const extensionStartTime = Date.now();
console.log('⏰ Extension cargada en:', new Date(extensionStartTime).toLocaleTimeString());

let messageCounter = 0;

// ============================================
// DETECTAR TIPO DE CHAT (FREE, PRIVATE, VIP, SECRET)
// ============================================
function detectChatType() {
  // Buscar en el header/status bar
  const headerText = document.body.innerText.substring(0, 500).toUpperCase();
  
  // Buscar indicador de estado
  const statusEl = document.querySelector('[class*="status"], [class*="mode"]');
  const statusText = statusEl ? statusEl.textContent.toUpperCase() : '';
  
  // Buscar en input de chat secreto
  const secretInput = document.querySelector('input[placeholder*="secreto"], input[placeholder*="secret"]');
  if (secretInput) {
    // Extraer nombre del fan del placeholder "Chat secreto con [nombre]"
    const match = secretInput.placeholder.match(/con\s+(\w+)/i);
    if (match) {
      return { type: 'secret', fanName: match[1] };
    }
    return { type: 'secret', fanName: null };
  }
  
  // Detectar por tabs activos
  const activeTab = document.querySelector('[class*="tab"][class*="active"], [class*="selected"]');
  if (activeTab) {
    const tabText = activeTab.textContent.trim();
    // Si el tab tiene nombre de fan (no es "Público" o "Free")
    if (tabText && !tabText.match(/público|public|free/i) && tabText.length < 30) {
      return { type: 'secret', fanName: tabText.replace(/[❤️💜💕]/g, '').trim() };
    }
  }
  
  // Detectar por header principal
  if (headerText.includes('VIP')) {
    return { type: 'vip', fanName: null };
  }
  if (headerText.includes('PRIVATE')) {
    return { type: 'private', fanName: null };
  }
  
  return { type: 'free', fanName: null };
}

// ============================================
// OBTENER GOAL (si existe)
// ============================================
function getGoalInfo() {
  // XModels muestra goal de manera diferente
  // Buscar elementos que puedan contener el goal
  const goalEl = document.querySelector('[class*="goal"], [class*="target"], [class*="objective"]');
  if (goalEl) {
    return goalEl.textContent.trim();
  }
  return '';
}

// ============================================
// PROCESAR MENSAJES
// ============================================
setInterval(() => {
  const chatInfo = detectChatType();
  const chatType = chatInfo.type;
  const secretFan = chatInfo.fanName;
  
  // Seleccionar historial según tipo de chat
  let currentHistory;
  if (chatType === 'secret') {
    currentHistory = secretHistory;
  } else if (chatType === 'private' || chatType === 'vip') {
    currentHistory = privateHistory;
  } else {
    currentHistory = freeHistory;
  }
  
  // ============================================
  // DETECTAR MENSAJES
  // ============================================
  const messages = document.querySelectorAll('app-chat-message');
  
  messages.forEach(msg => {
    if (msg.dataset.processed) return;
    
    // Detectar si es mensaje de sistema (entrada/salida de usuarios)
    const isSystemMessage = msg.querySelector('.system-message, .system-message-text');
    if (isSystemMessage) {
      msg.dataset.processed = 'true';
      return;
    }
    
    // Obtener username
    const usernameEl = msg.querySelector('span.messageNickname, .messageNickname');
    const username = usernameEl ? usernameEl.textContent.trim() : null;
    if (!username) {
      msg.dataset.processed = 'true';
      return;
    }
    
    // Detectar si es mensaje de la modelo o del fan
    const isModelMessage = msg.querySelector('.cammer-bubble, .mine') !== null;
    
    // Obtener texto del mensaje (original, no traducido)
    let messageText = '';
    
    // Primero intentar span.original-text (PRIVATE/SECRET)
    const spanOriginal = msg.querySelector('span.original-text');
    if (spanOriginal) {
      messageText = spanOriginal.textContent.trim();
    }
    
    // Si no, intentar div.original-text (FREE)
    if (!messageText) {
      const divOriginal = msg.querySelector('div.original-text');
      if (divOriginal) {
        messageText = divOriginal.textContent.trim();
      }
    }
    
    // Fallback: buscar en chatMessage
    if (!messageText) {
      const chatMsg = msg.querySelector('.chatMessage');
      if (chatMsg) {
        // Clonar y remover elementos de traducción
        const clone = chatMsg.cloneNode(true);
        clone.querySelectorAll('.translated-text, .timestamp, .reactionTrigger').forEach(el => el.remove());
        messageText = clone.textContent.trim();
      }
    }
    
    if (!messageText) {
      msg.dataset.processed = 'true';
      return;
    }
    
    // Limpiar username del mensaje si está al inicio
    messageText = messageText.replace(new RegExp('^' + username + '\\s*', 'i'), '').trim();
    
    // Detectar tips en el mensaje
    let tipAmount = 0;
    const tipMatch = messageText.match(/(\d+)\s*(credits?|cr)/i);
    if (tipMatch) {
      tipAmount = parseInt(tipMatch[1]);
    }
    
    // Determinar el usuario target (para secret chat usar el nombre del fan)
    const targetUser = (chatType === 'secret' && secretFan) ? secretFan : username;
    
    // Guardar en historial
    if (!currentHistory[targetUser]) {
      currentHistory[targetUser] = { messages: [], tips: [] };
    }
    
    const msgId = messageCounter++;
    
    // Verificar duplicados
    const exists = currentHistory[targetUser].messages.some(item => 
      item.message === messageText && Math.abs(item.timestamp - msgId) < 10
    );
    
    if (!exists) {
      currentHistory[targetUser].messages.push({
        type: isModelMessage ? 'model' : 'fan',
        message: messageText,
        timestamp: msgId
      });
      
      // Mantener máximo 20 mensajes
      if (currentHistory[targetUser].messages.length > 20) {
        currentHistory[targetUser].messages.shift();
      }
      
      console.log(`💬 ${chatType.toUpperCase()} - ${isModelMessage ? 'Modelo' : 'Fan'} (${targetUser}): ${messageText}`);
    }
    
    // Guardar tips
    if (tipAmount > 0) {
      const tipExists = currentHistory[targetUser].tips.some(item => 
        item.amount === tipAmount && Math.abs(item.timestamp - msgId) < 10
      );
      if (!tipExists) {
        currentHistory[targetUser].tips.push({ type: 'tip', amount: tipAmount, timestamp: msgId });
        if (currentHistory[targetUser].tips.length > 5) {
          currentHistory[targetUser].tips.shift();
        }
        console.log(`💰 ${chatType.toUpperCase()} - Tip de ${targetUser}: ${tipAmount} credits`);
      }
    }
    
    // Agregar botón IA solo en mensajes de fans
    if (!isModelMessage && !msg.querySelector('.ai-btn')) {
      addAIButton(msg, targetUser, messageText, chatType, tipAmount);
    }
    
    msg.dataset.processed = 'true';
  });
  
}, 2000);

// ============================================
// FUNCIÓN PARA AGREGAR BOTÓN IA
// ============================================
function addAIButton(container, username, messageText, chatType, tipAmount) {
  const btn = document.createElement('button');
  btn.textContent = '🤖';
  btn.className = 'ai-btn';
  btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:3px 8px;margin-left:5px;cursor:pointer;border-radius:5px;font-size:12px;';
  
  btn.onclick = async () => {
    // Determinar historial según tipo
    let history;
    if (chatType === 'secret') {
      history = secretHistory;
    } else if (chatType === 'private' || chatType === 'vip') {
      history = privateHistory;
    } else {
      history = freeHistory;
    }
    
    const userHistory = history[username] || { messages: [], tips: [] };
    
    // Determinar isPM basado en chatType
    const isPM = chatType !== 'free';
    
    console.log(`🔵 IA para ${chatType.toUpperCase()} - Usuario: ${username}`);
    
    btn.textContent = '...';
    
    const getResponse = async () => {
      const userMessages = userHistory.messages || [];
      const userTips = userHistory.tips || [];
      let fullContext = [...userMessages, ...userTips];
      
      // Si estamos en secret/private, incluir historial público si existe
      if (isPM && freeHistory[username]) {
        const pubMessages = freeHistory[username].messages || [];
        const pubTips = freeHistory[username].tips || [];
        fullContext = [...pubMessages, ...pubTips, ...fullContext];
      }
      
      // Ordenar por timestamp
      fullContext = fullContext.sort((a, b) => a.timestamp - b.timestamp);
      
      // Log de historial
      console.log('📚 Historial enviado a IA (últimos 10):');
      console.table(fullContext.slice(-10).map((item, index) => ({
        '#': index,
        'Quién': item.type === 'fan' ? '👤 Fan' : item.type === 'model' ? '💃 Modelo' : '💰 Tip',
        'Mensaje': item.type === 'tip' ? `${item.amount} credits` : item.message.substring(0, 50),
        'Hora': new Date(item.timestamp).toLocaleTimeString()
      })));
      
      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          platform: 'xmodels',
          username,
          message: messageText,
          context: fullContext.slice(-20),
          isPM,
          chatType, // NUEVO: enviar tipo de chat específico
          tip: tipAmount,
          goal: getGoalInfo()
        })
      });
      return response.json();
    };
    
    try {
      const data = await getResponse();
      console.log('🟢 Respuesta:', data.suggestion);
      
      // Copiar al portapapeles
      try {
        navigator.clipboard.writeText(data.suggestion);
      } catch (e) {
        console.log('No se pudo copiar al portapapeles');
      }
      
      // Crear popup
      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #8B5CF6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;';
      
      // Título con tipo de chat
      const chatTypeLabel = {
        'free': '🌐 FREE',
        'secret': '🤫 SECRETO',
        'private': '🔒 PRIVATE',
        'vip': '⭐ VIP'
      };
      
      const title = document.createElement('h3');
      title.style.cssText = 'margin:0 0 15px 0;color:#333;';
      title.textContent = `💬 ${chatTypeLabel[chatType] || chatType} - @${username} ✅ Copiado!`;
      
      // Respuesta
      const responseText = document.createElement('p');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:12px;border-radius:5px;max-height:200px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px;color:#333;';
      responseText.textContent = data.suggestion;
      
      // Traducción (si existe y es diferente)
      let translationText = null;
      if (data.translation) {
        const suggestionClean = data.suggestion.replace(/\s+/g, ' ').trim().toLowerCase();
        const translationClean = data.translation.replace(/\s+/g, ' ').trim().toLowerCase();
        
        if (suggestionClean !== translationClean) {
          translationText = document.createElement('p');
          translationText.style.cssText = 'background:#e8f4e8;padding:12px;border-radius:5px;max-height:150px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px;color:#555;font-size:13px;';
          translationText.innerHTML = '<strong>🇪🇸 Traducción:</strong><br>' + data.translation;
        }
      }
      
      // Botón regenerar
      const regenBtn = document.createElement('button');
      regenBtn.textContent = '🔄 Regenerar';
      regenBtn.style.cssText = 'padding:8px 15px;cursor:pointer;font-size:12px;border:none;background:#10B981;color:white;border-radius:5px;margin-right:10px;';
      regenBtn.onclick = async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '⏳...';
        try {
          const newData = await getResponse();
          responseText.textContent = newData.suggestion;
          navigator.clipboard.writeText(newData.suggestion);
        } catch (error) {
          console.error('Error regenerando:', error);
        }
        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };
      
      // Botón cerrar
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '❌ Cerrar';
      closeBtn.style.cssText = 'padding:8px 15px;cursor:pointer;font-size:12px;border:none;background:#EF4444;color:white;border-radius:5px;';
      closeBtn.onclick = () => popup.remove();
      
      popup.appendChild(title);
      popup.appendChild(responseText);
      if (translationText) popup.appendChild(translationText);
      popup.appendChild(regenBtn);
      popup.appendChild(closeBtn);
      
      // Remover popup anterior
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
  
  container.appendChild(btn);
}
