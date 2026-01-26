// CamAssist - Streamate Extension
// Reescrita para funcionar igual que CB/SC/XModels

(function() {
  'use strict';

  console.log('🤖 CamAssist Streamate v1.1.0 cargando...');

  // ============ CONFIGURACIÓN ============
  const CONFIG = {
    API_URL: 'https://camassist.vercel.app/api/generate',
    PLATFORM: 'streamate',
    VERSION: '1.1.5',
    CURRENCY: 'gold',
    MAX_CONTEXT_MESSAGES: 70
  };

  // ============ HISTORIAL POR FAN ============
  const fanHistory = {};  // { username: { messages: [], tips: [] } }

  // ============ TOKEN ============
  let modelToken = null;

  // Cargar token desde localStorage primero (por si el popup ya lo guardó)
  modelToken = localStorage.getItem('model_token');
  if (modelToken) {
    console.log('🔑 Token cargado desde localStorage:', modelToken.substring(0, 15) + '...');
  }

  // Cargar token desde chrome.storage
  chrome.storage.local.get(['model_token'], (result) => {
    if (result.model_token) {
      modelToken = result.model_token;
      localStorage.setItem('model_token', modelToken); // Sync con localStorage
      console.log('🔑 Token cargado desde storage:', modelToken.substring(0, 15) + '...');
    }
  });

  // Escuchar cambios de token
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.model_token) {
      modelToken = changes.model_token.newValue;
      localStorage.setItem('model_token', modelToken);
      console.log('🔑 Token actualizado');
    }
  });

  // ============ DETECTAR MODO (FREE vs PAID) ============
  function detectChatMode() {
    // Buscar en el área del input
    const inputArea = document.querySelector('[class*="TextInput-container"]');
    if (inputArea) {
      const text = inputArea.textContent.toLowerCase();
      if (text.includes('pagado') || text.includes('paid')) return 'PAID';
      if (text.includes('huésped') || text.includes('guest')) return 'GUEST';
    }

    // Buscar en el header
    const headerText = document.body.textContent;
    if (headerText.includes('Sesión Pagada') || headerText.includes('Private') || headerText.includes('Exclusive')) {
      return 'PAID';
    }

    // Default: FREE (público)
    return 'FREE';
  }

  // ============ OBTENER USERNAME DE LA MODELO ============
  function getModelUsername() {
    // Buscar en el header donde dice el nombre de la modelo
    const headerEl = document.querySelector('[class*="header"] [class*="name"], [class*="performer"]');
    if (headerEl) return headerEl.textContent.trim();
    
    // Fallback: buscar en la URL o título
    const urlMatch = window.location.href.match(/performer\/(\w+)/i);
    if (urlMatch) return urlMatch[1];
    
    return 'Model';
  }

  // ============ PROCESAR TODOS LOS MENSAJES ============
  function processAllMessages() {
    const chatContainer = document.querySelector('[id*="scroll-target"]')?.parentElement;
    if (!chatContainer) return;

    // Buscar todos los mensajes
    const messageElements = chatContainer.querySelectorAll('[data-ta-locator*="Message"]');

    messageElements.forEach(msg => {
      if (msg.dataset.processed) return;

      try {
        // Buscar elementos del mensaje
        const audienceEl = msg.querySelector('[data-ta-locator="PerformerMessage__Audience"]');
        const messageEl = msg.querySelector('[data-ta-locator="PerformerMessage__Message"]');

        if (!messageEl) {
          msg.dataset.processed = 'true';
          return;
        }

        // Extraer username
        let username = '';
        if (audienceEl) {
          // El formato es "A username" - removemos el "A "
          username = audienceEl.textContent.replace(/^A\s*/i, '').trim();
        }

        // Extraer mensaje (sin traducción)
        let messageText = '';
        const fullText = messageEl.textContent;
        const translationEl = messageEl.querySelector('.translation, [class*="translation"]');
        
        if (translationEl) {
          messageText = fullText.replace(translationEl.textContent, '').trim();
        } else {
          messageText = fullText.trim();
        }

        if (!username || !messageText) {
          msg.dataset.processed = 'true';
          return;
        }

        // Detectar si es mensaje de la modelo (empieza con "A " y tiene audienceEl)
        // En Streamate, los mensajes de la modelo hacia fans empiezan con "A fanname"
        const isModelMessage = msg.textContent.trim().startsWith('A ') && audienceEl;

        // Detectar tips de GOLD
        const isTip = messageText.toLowerCase().includes('gold') && /\d+/.test(messageText);
        let tipAmount = 0;
        if (isTip) {
          const match = messageText.match(/(\d+\.?\d*)\s*gold/i);
          if (match) tipAmount = parseFloat(match[1]);
        }

        msg.dataset.processed = 'true';

        // Inicializar historial del usuario
        if (!fanHistory[username]) {
          fanHistory[username] = { messages: [], tips: [] };
        }

        // Guardar en historial
        if (isTip && tipAmount > 0) {
          fanHistory[username].tips.push({
            type: 'tip',
            amount: tipAmount,
            timestamp: Date.now()
          });
          console.log(`💰 Tip de ${username}: ${tipAmount} GOLD`);
        } else {
          fanHistory[username].messages.push({
            type: isModelMessage ? 'model' : 'fan',
            message: messageText,
            timestamp: Date.now()
          });

          // Mantener últimos 70 mensajes
          if (fanHistory[username].messages.length > 70) {
            fanHistory[username].messages.shift();
          }

          console.log(`💬 ${isModelMessage ? 'Modelo→' : 'Fan'} ${username}: ${messageText.substring(0, 50)}...`);
        }

        // Agregar botón IA solo en mensajes de fans (no modelo, no tips puros)
        if (!isModelMessage && messageText && !msg.querySelector('.ai-btn')) {
          if (!isTip || (isTip && messageText.length > 20)) { // Tips con mensaje personalizado
            addAIButton(msg, username, messageText);
          }
        }

      } catch (err) {
        console.error('Error procesando mensaje:', err);
        msg.dataset.processed = 'true';
      }
    });
  }

  // ============ AGREGAR BOTÓN IA ============
  function addAIButton(container, username, messageText) {
    const btn = document.createElement('button');
    btn.textContent = '🤖';
    btn.className = 'ai-btn';
    btn.style.cssText = `
      background: #8B5CF6;
      color: white;
      border: none;
      padding: 4px 8px;
      margin-left: 8px;
      cursor: pointer;
      border-radius: 5px;
      font-size: 12px;
      vertical-align: middle;
    `;

    btn.onclick = async () => {
      console.log(`🔵 IA para ${username}: "${messageText.substring(0, 30)}..."`);
      btn.textContent = '...';

      try {
        const response = await getAIResponse(username, messageText);
        
        if (response) {
          // Copiar al portapapeles
          navigator.clipboard.writeText(response.suggestion);
          
          // Mostrar popup
          showPopup(username, response.suggestion, response.translation);
          
          btn.textContent = '✓';
          setTimeout(() => btn.textContent = '🤖', 2000);
        } else {
          btn.textContent = '!';
          setTimeout(() => btn.textContent = '🤖', 2000);
        }
      } catch (error) {
        console.error('Error:', error);
        btn.textContent = '!';
        setTimeout(() => btn.textContent = '🤖', 2000);
      }
    };

    // Insertar botón después del mensaje
    const messageEl = container.querySelector('[data-ta-locator="PerformerMessage__Message"]');
    if (messageEl) {
      messageEl.style.display = 'inline';
      messageEl.after(btn);
    } else {
      container.appendChild(btn);
    }
  }

  // ============ LLAMAR API ============
  async function getAIResponse(username, message) {
    if (!modelToken) {
      alert('⚠️ Token no configurado. Abre el popup de la extensión.');
      return null;
    }

    const mode = detectChatMode();
    const isPaid = mode === 'PAID' || mode === 'GUEST';

    // Construir contexto
    const userHistory = fanHistory[username] || { messages: [], tips: [] };
    let fullContext = [...userHistory.messages, ...userHistory.tips];
    fullContext = fullContext.sort((a, b) => a.timestamp - b.timestamp);

    console.log('📚 Historial enviado:', fullContext.length, 'items');

    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: modelToken,
        platform: CONFIG.PLATFORM,
        version: CONFIG.VERSION,
        username: username,
        message: message,
        context: fullContext.slice(-CONFIG.MAX_CONTEXT_MESSAGES),
        isPM: isPaid, // PAID/GUEST = como PM (no vender agresivo)
        chatType: mode.toLowerCase()
      })
    });

    const data = await response.json();
    
    if (data.success) {
      return {
        suggestion: data.suggestion,
        translation: data.translation
      };
    } else {
      console.error('API Error:', data.error);
      return null;
    }
  }

  // ============ MOSTRAR POPUP ============
  function showPopup(username, suggestion, translation) {
    // Remover popup anterior
    const oldPopup = document.getElementById('ai-popup');
    if (oldPopup) oldPopup.remove();

    const mode = detectChatMode();
    const modeLabel = {
      'FREE': '🌐 FREE',
      'GUEST': '👤 GUEST',
      'PAID': '💰 PAID'
    };

    const popup = document.createElement('div');
    popup.id = 'ai-popup';
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border: 2px solid #8B5CF6;
      z-index: 99999;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      max-width: 450px;
      font-family: Arial, sans-serif;
    `;

    // Traducción (si es diferente)
    let translationHtml = '';
    if (translation) {
      const suggestionClean = suggestion.replace(/\s+/g, ' ').trim().toLowerCase();
      const translationClean = translation.replace(/\s+/g, ' ').trim().toLowerCase();
      
      if (suggestionClean !== translationClean) {
        translationHtml = `
          <p style="background:#e8f4e8;padding:12px;border-radius:5px;color:#555;font-size:13px;margin-bottom:10px;">
            <strong>🇪🇸 Traducción:</strong><br>${translation}
          </p>
        `;
      }
    }

    popup.innerHTML = `
      <h3 style="margin:0 0 15px 0;color:#333;">
        ${modeLabel[mode] || mode} - @${username} ✅ Copiado!
      </h3>
      <p id="ai-response" style="background:#f0f0f0;padding:12px;border-radius:5px;color:#333;margin-bottom:10px;">
        ${suggestion}
      </p>
      ${translationHtml}
      <div style="display:flex;gap:10px;">
        <button id="btn-regen" style="padding:8px 15px;cursor:pointer;border:none;background:#10B981;color:white;border-radius:5px;">
          🔄 Regenerar
        </button>
        <button id="btn-insert" style="padding:8px 15px;cursor:pointer;border:none;background:#3B82F6;color:white;border-radius:5px;">
          ✍️ Insertar
        </button>
        <button id="btn-close" style="padding:8px 15px;cursor:pointer;border:none;background:#EF4444;color:white;border-radius:5px;">
          ❌ Cerrar
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    // Event listeners
    popup.querySelector('#btn-close').onclick = () => popup.remove();
    
    popup.querySelector('#btn-insert').onclick = () => {
      insertTextToInput(suggestion);
      popup.remove();
    };

    popup.querySelector('#btn-regen').onclick = async () => {
      const btn = popup.querySelector('#btn-regen');
      btn.disabled = true;
      btn.textContent = '⏳...';
      
      const newResponse = await getAIResponse(username, fanHistory[username]?.messages.slice(-1)[0]?.message || '');
      
      if (newResponse) {
        popup.querySelector('#ai-response').textContent = newResponse.suggestion;
        navigator.clipboard.writeText(newResponse.suggestion);
      }
      
      btn.disabled = false;
      btn.textContent = '🔄 Regenerar';
    };
  }

  // ============ INSERTAR TEXTO EN INPUT ============
  function insertTextToInput(text) {
    const input = document.querySelector('#message_text_input, [data-ta-locator="ChatTools__ChatInputText"]');
    if (!input) return;

    input.focus();
    input.value = text;
    
    // Disparar eventos para React
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ============ ESTILOS ============
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .ai-btn {
        transition: all 0.2s;
      }
      .ai-btn:hover {
        background: #7C3AED !important;
        transform: scale(1.1);
      }
      #ai-popup {
        animation: fadeIn 0.2s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  // ============ INICIALIZACIÓN ============
  function init() {
    console.log('🤖 CamAssist Streamate iniciando...');
    
    injectStyles();
    
    // Procesar mensajes cada 2 segundos
    setInterval(processAllMessages, 2000);
    
    // Procesar inmediatamente
    setTimeout(processAllMessages, 1000);
    
    console.log('✅ CamAssist Streamate activo');
  }

  // ============ INICIAR ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
