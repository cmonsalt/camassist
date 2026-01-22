// CamAssist - Streamate Extension
// SMConnect Interface

(function() {
  'use strict';

  // ============ CONFIGURACIÓN ============
  const CONFIG = {
    API_URL: 'https://www.camassist.co/api/generate',
    PLATFORM: 'streamate',
    CURRENCY: 'gold',
    SELECTORS: {
      // Chat container
      chatContainer: '[data-ta-locator="ChatDisplay__Message"]',
      // Mensajes
      messageWrapper: '[data-ta-locator="ChatDisplay__Message"]',
      messageAudience: '[data-ta-locator="PerformerMessage__Audience"]',
      messageText: '[data-ta-locator="PerformerMessage__Message"]',
      translation: 'span.translation',
      // Input
      chatInput: '#message_text_input, [data-ta-locator="ChatTools__ChatInputText"]',
      // Header para detectar modo
      headerMode: '[class*="ChatHeader"], [class*="header"]',
      // Pestañas
      tabAll: '[class*="Todos"]',
      tabPaid: '[class*="Pagado"]',
      tabGuest: '[class*="Huésped"]'
    },
    DEBOUNCE_MS: 500,
    MAX_CONTEXT_MESSAGES: 70
  };

  // ============ ESTADO ============
  let state = {
    token: null,
    isEnabled: true,
    lastProcessedMessage: null,
    processing: false,
    observer: null,
    buttonInjected: false
  };

  // ============ UTILIDADES ============
  function log(message, data = '') {
    console.log(`[CamAssist Streamate] ${message}`, data);
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ============ DETECTAR MODO (ALL vs GUEST vs PAID) ============
  function detectChatMode() {
    // Método 1: Leer el placeholder/label del input
    const input = document.querySelector(CONFIG.SELECTORS.chatInput);
    if (input) {
      const parent = input.closest('div');
      const inputArea = parent?.parentElement;
      const text = inputArea?.textContent || '';
      
      if (text.includes('Pagado') || text.includes('Paid')) {
        return 'PAID';
      }
      if (text.includes('Huésped') || text.includes('Guest')) {
        return 'GUEST';
      }
      if (text.includes('Todos') || text.includes('All')) {
        return 'ALL';
      }
    }

    // Método 2: Buscar texto en el área del input
    const inputWrapper = document.querySelector('[class*="TextInput-container"]');
    if (inputWrapper) {
      const labels = inputWrapper.querySelectorAll('span, div');
      for (const label of labels) {
        const txt = label.textContent.toLowerCase();
        if (txt.includes('pagado') || txt.includes('paid')) return 'PAID';
        if (txt.includes('huésped') || txt.includes('guest')) return 'GUEST';
        if (txt.includes('todos') || txt.includes('all')) return 'ALL';
      }
    }

    // Método 3: Buscar en el header
    const header = document.body.textContent;
    if (header.includes('Sesión Pagada') || header.includes('Private') || header.includes('Exclusive')) {
      return 'PAID';
    }

    // Default: ALL (público)
    return 'ALL';
  }

  // ============ EXTRAER MENSAJES DEL CHAT ============
  function extractChatMessages() {
    const messages = [];
    const chatContainer = document.querySelector('[id*="scroll-target"]')?.parentElement;
    
    if (!chatContainer) {
      log('Chat container not found');
      return messages;
    }

    const messageElements = chatContainer.querySelectorAll('[data-ta-locator*="Message"]');
    
    messageElements.forEach(el => {
      try {
        // Buscar nombre del usuario
        const audienceEl = el.querySelector('[data-ta-locator="PerformerMessage__Audience"]');
        const messageEl = el.querySelector('[data-ta-locator="PerformerMessage__Message"]');
        
        if (messageEl) {
          let username = '';
          let messageText = '';
          
          // Extraer username
          if (audienceEl) {
            username = audienceEl.textContent.replace(/^A\s*/, '').trim();
          }
          
          // Extraer mensaje (sin traducción)
          const fullText = messageEl.textContent;
          const translationEl = messageEl.querySelector('.translation, [class*="translation"]');
          
          if (translationEl) {
            // Remover traducción del texto
            messageText = fullText.replace(translationEl.textContent, '').trim();
          } else {
            messageText = fullText.trim();
          }
          
          // Determinar si es mensaje del fan o de la modelo
          const isModelMessage = el.textContent.startsWith('A ') && audienceEl;
          
          if (username && messageText) {
            messages.push({
              username: username,
              message: messageText,
              isModel: isModelMessage
            });
          }
        }
        
        // Detectar tips de GOLD
        const text = el.textContent;
        const goldMatch = text.match(/(\d+\.?\d*)\s*GOLD\s*desde\s*(\w+)/i);
        if (goldMatch) {
          messages.push({
            username: goldMatch[2],
            message: `ha dado ${goldMatch[1]} GOLD de propina`,
            isModel: false,
            isTip: true
          });
        }
      } catch (err) {
        // Ignorar errores de parsing
      }
    });

    return messages.slice(-CONFIG.MAX_CONTEXT_MESSAGES);
  }

  // ============ OBTENER ÚLTIMO MENSAJE DEL FAN ============
  function getLastFanMessage() {
    const messages = extractChatMessages();
    
    // Filtrar solo mensajes de fans (no modelo, no tips de sistema)
    const fanMessages = messages.filter(m => !m.isModel && !m.isTip && m.message);
    
    if (fanMessages.length === 0) return null;
    
    const lastMsg = fanMessages[fanMessages.length - 1];
    return {
      username: lastMsg.username,
      message: lastMsg.message
    };
  }

  // ============ CONSTRUIR CONTEXTO ============
  function buildContext() {
    const messages = extractChatMessages();
    const context = [];
    
    messages.forEach(m => {
      if (m.isTip) {
        context.push(`[TIP] ${m.username}: ${m.message}`);
      } else if (m.isModel) {
        context.push(`You: ${m.message}`);
      } else {
        context.push(`${m.username}: ${m.message}`);
      }
    });
    
    return context.join('\n');
  }

  // ============ LLAMAR A LA API ============
  async function callAPI(username, message) {
    if (!state.token) {
      log('No token configured');
      showNotification('Token no configurado. Abre el popup de la extensión.', 'error');
      return null;
    }

    const mode = detectChatMode();
    const isPaid = mode === 'PAID';
    const isGuest = mode === 'GUEST';
    const treatAsPM = isPaid || isGuest;
    
    log(`Mode detected: ${mode}, treatAsPM: ${treatAsPM}`);

    const payload = {
      token: state.token,
      username: username,
      message: message,
      isPM: treatAsPM, // PAGADO o HUÉSPED = como PM (no vender agresivo)
      context: buildContext(),
      contextLength: CONFIG.MAX_CONTEXT_MESSAGES,
      hasImage: false,
      platform: CONFIG.PLATFORM
    };

    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      log('API Error:', error);
      showNotification('Error al conectar con CamAssist', 'error');
      return null;
    }
  }

  // ============ MOSTRAR SUGERENCIA ============
  function showSuggestion(suggestion, username) {
    // Remover sugerencia anterior si existe
    removeSuggestion();

    const input = document.querySelector(CONFIG.SELECTORS.chatInput);
    if (!input) return;

    const container = input.closest('div');
    if (!container) return;

    const suggestionBox = document.createElement('div');
    suggestionBox.id = 'camassist-suggestion';
    suggestionBox.innerHTML = `
      <div class="camassist-suggestion-header">
        <span class="camassist-logo">🤖 CamAssist</span>
        <span class="camassist-username">para ${username}</span>
        <button class="camassist-close" title="Cerrar">×</button>
      </div>
      <div class="camassist-suggestion-text">${suggestion}</div>
      <div class="camassist-suggestion-actions">
        <button class="camassist-btn camassist-btn-copy" title="Copiar">📋 Copiar</button>
        <button class="camassist-btn camassist-btn-insert" title="Insertar">✍️ Insertar</button>
        <button class="camassist-btn camassist-btn-send" title="Enviar">🚀 Enviar</button>
      </div>
    `;

    // Insertar antes del input
    container.parentElement.insertBefore(suggestionBox, container);

    // Event listeners
    suggestionBox.querySelector('.camassist-close').addEventListener('click', removeSuggestion);
    
    suggestionBox.querySelector('.camassist-btn-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(suggestion);
      showNotification('Copiado!', 'success');
    });

    suggestionBox.querySelector('.camassist-btn-insert').addEventListener('click', () => {
      insertTextToInput(suggestion);
      removeSuggestion();
    });

    suggestionBox.querySelector('.camassist-btn-send').addEventListener('click', () => {
      insertTextToInput(suggestion);
      sendMessage();
      removeSuggestion();
    });
  }

  function removeSuggestion() {
    const existing = document.getElementById('camassist-suggestion');
    if (existing) existing.remove();
  }

  // ============ INSERTAR TEXTO EN INPUT ============
  function insertTextToInput(text) {
    const input = document.querySelector(CONFIG.SELECTORS.chatInput);
    if (!input) return;

    // Simular input de usuario
    input.focus();
    input.value = text;
    
    // Disparar eventos para React
    const inputEvent = new Event('input', { bubbles: true });
    input.dispatchEvent(inputEvent);
    
    const changeEvent = new Event('change', { bubbles: true });
    input.dispatchEvent(changeEvent);
  }

  // ============ ENVIAR MENSAJE ============
  function sendMessage() {
    const input = document.querySelector(CONFIG.SELECTORS.chatInput);
    if (!input || !input.value) return;

    // Simular Enter
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    });
    input.dispatchEvent(enterEvent);
  }

  // ============ NOTIFICACIONES ============
  function showNotification(message, type = 'info') {
    const existing = document.getElementById('camassist-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'camassist-notification';
    notification.className = `camassist-notification camassist-notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // ============ BOTÓN DE ACTIVACIÓN ============
  function injectActivationButton() {
    if (state.buttonInjected) return;

    const input = document.querySelector(CONFIG.SELECTORS.chatInput);
    if (!input) return;

    const container = input.closest('div');
    if (!container) return;

    const button = document.createElement('button');
    button.id = 'camassist-trigger';
    button.innerHTML = '🤖';
    button.title = 'Obtener sugerencia de CamAssist';
    button.className = 'camassist-trigger-btn';

    button.addEventListener('click', async () => {
      if (state.processing) return;
      
      state.processing = true;
      button.classList.add('camassist-loading');
      
      const lastMsg = getLastFanMessage();
      if (lastMsg) {
        const suggestion = await callAPI(lastMsg.username, lastMsg.message);
        if (suggestion) {
          showSuggestion(suggestion, lastMsg.username);
        }
      } else {
        showNotification('No hay mensajes de fans para responder', 'error');
      }
      
      state.processing = false;
      button.classList.remove('camassist-loading');
    });

    // Insertar el botón
    const inputWrapper = container.parentElement;
    if (inputWrapper) {
      inputWrapper.style.position = 'relative';
      inputWrapper.appendChild(button);
      state.buttonInjected = true;
      log('Activation button injected');
    }
  }

  // ============ OBSERVER PARA NUEVOS MENSAJES ============
  function setupObserver() {
    const chatArea = document.querySelector('[id*="scroll-target"]')?.parentElement;
    
    if (!chatArea) {
      log('Chat area not found, retrying...');
      setTimeout(setupObserver, 2000);
      return;
    }

    if (state.observer) {
      state.observer.disconnect();
    }

    state.observer = new MutationObserver(debounce((mutations) => {
      if (!state.isEnabled) return;

      const lastMsg = getLastFanMessage();
      if (lastMsg && lastMsg.message !== state.lastProcessedMessage) {
        log('New message detected:', lastMsg);
        // Auto-sugerir si está habilitado
        // Por ahora solo actualizamos el estado
        state.lastProcessedMessage = lastMsg.message;
      }
    }, CONFIG.DEBOUNCE_MS));

    state.observer.observe(chatArea, {
      childList: true,
      subtree: true
    });

    log('Observer started');
  }

  // ============ CARGAR TOKEN ============
  async function loadToken() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['modelToken'], (result) => {
        if (result.modelToken) {
          state.token = result.modelToken;
          log('Token loaded:', state.token.substring(0, 10) + '...');
        }
        resolve();
      });
    });
  }

  // ============ ESCUCHAR CAMBIOS DE TOKEN ============
  function listenForTokenChanges() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.modelToken) {
        state.token = changes.modelToken.newValue;
        log('Token updated');
        showNotification('Token actualizado', 'success');
      }
    });
  }

  // ============ INICIALIZACIÓN ============
  async function init() {
    log('Initializing CamAssist for Streamate...');

    await loadToken();
    listenForTokenChanges();

    // Esperar a que cargue el chat
    const waitForChat = setInterval(() => {
      const input = document.querySelector(CONFIG.SELECTORS.chatInput);
      if (input) {
        clearInterval(waitForChat);
        log('Chat found, injecting...');
        injectActivationButton();
        setupObserver();
        showNotification('CamAssist activo 🤖', 'success');
      }
    }, 1000);

    // Timeout después de 30 segundos
    setTimeout(() => {
      clearInterval(waitForChat);
    }, 30000);
  }

  // ============ INICIAR ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
