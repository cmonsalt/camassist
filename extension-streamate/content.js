// CamAssist - Streamate Extension v1.3.0
// Soporta: Chat en vivo (performerclient) + Messenger Inbox (engagement/messenger)

(function () {
  'use strict';

  console.log('🤖 CamAssist Streamate v1.3.0 cargando...');

  // ============ CONFIGURACIÓN ============
  const CONFIG = {
    API_URL: 'https://www.camassist.co/api/generate',
    PLATFORM: 'streamate',
    VERSION: '1.7.0',
    CURRENCY: 'gold',
    MAX_CONTEXT_MESSAGES: 70
  };

  // ============ TOKEN ============
  let modelToken = null;

  modelToken = localStorage.getItem('model_token');
  if (modelToken) {
    console.log('🔑 Token cargado desde localStorage:', modelToken.substring(0, 15) + '...');
  }

  chrome.storage.local.get(['model_token'], (result) => {
    if (result.model_token) {
      modelToken = result.model_token;
      localStorage.setItem('model_token', modelToken);
      console.log('🔑 Token cargado desde storage:', modelToken.substring(0, 15) + '...');
    }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.model_token) {
      modelToken = changes.model_token.newValue;
      localStorage.setItem('model_token', modelToken);
      console.log('🔑 Token actualizado');
    }
  });

  // ============ DETECTAR MODO: STREAMING vs MESSENGER ============
  const isMessenger = window.location.href.includes('/engagement/messenger');
  const isStreaming = window.location.href.includes('performerclient.');

  if (isMessenger) {
    console.log('📬 Modo MESSENGER detectado');
    initMessenger();
  } else if (isStreaming) {
    console.log('📡 Modo STREAMING detectado');
    initStreaming();
  } else {
    console.log('⚠️ Página no reconocida, intentando streaming...');
    initStreaming();
  }

  // ============================================================
  // =================== MODO STREAMING =========================
  // ============================================================
  function initStreaming() {
    const fanHistory = {};

    let broadcasterUsername = 'Model';
    const usernameInterval = setInterval(() => {
      const nicknameEl = document.querySelector('[data-ta-locator="Header__Nickname"]');
      if (nicknameEl) {
        const name = nicknameEl.textContent.trim();
        if (name && name !== 'Model') {
          broadcasterUsername = name;
          console.log('👤 Broadcaster username:', broadcasterUsername);
          clearInterval(usernameInterval);
        }
      }
    }, 2000);

    function detectChatMode() {
      const inputArea = document.querySelector('[class*="TextInput-container"]');
      if (inputArea) {
        const text = inputArea.textContent.toLowerCase();
        if (text.includes('pagado') || text.includes('paid')) return 'PAID';
        if (text.includes('huésped') || text.includes('guest')) return 'GUEST';
      }
      const tabs = document.querySelectorAll('[class*="tab"], [role="tab"]');
      for (const tab of tabs) {
        const text = tab.textContent.toLowerCase();
        const isActive = tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true' || tab.querySelector('[class*="active"]');
        if (isActive && (text.includes('pagado') || text.includes('paid'))) return 'PAID';
        if (isActive && (text.includes('huésped') || text.includes('guest'))) return 'GUEST';
      }
      return 'FREE';
    }

    function processAllMessages() {
      const chatContainer = document.querySelector('[id*="scroll-target"]')?.parentElement;
      if (!chatContainer) return;

      const allMessages = chatContainer.querySelectorAll('[data-ta-locator="ChatDisplay__Message"]');

      allMessages.forEach(msg => {
        if (msg.dataset.processed) return;
        try {
          // Detectar si es un mensaje de TIP (tiene icono goldCoin)
          const goldCoinIcon = msg.querySelector('svg[name="goldCoin"]');
          if (goldCoinIcon) {
            const tipText = msg.textContent || '';
            const tipMatch = tipText.match(/(\d+\.?\d*)\s*GOLD/i);
            const fromMatch = tipText.match(/desde\s+(\w+)/i) || tipText.match(/from\s+(\w+)/i);

            if (tipMatch && fromMatch) {
              const tipAmount = parseFloat(tipMatch[1]);
              const username = fromMatch[1];

              if (!fanHistory[username]) fanHistory[username] = { messages: [], tips: [] };
              fanHistory[username].tips.push({ type: 'tip', amount: tipAmount, timestamp: Date.now() });
              console.log(`💰 Tip de ${username}: ${tipAmount} GOLD`);
            }
            msg.dataset.processed = 'true';
            return;
          }
          const userMessageText = msg.querySelector('[data-ta-locator="UserMessage__MessageText"]');
          const performerMessageText = msg.querySelector('[data-ta-locator="PerformerMessage__Message"]');

          if (userMessageText) {
            const audienceEl = msg.querySelector('[data-ta-locator="UserMessage__Audience"]');
            const messageEl = msg.querySelector('[data-ta-locator="UserMessage__Message"]');
            if (!messageEl) { msg.dataset.processed = 'true'; return; }

            let username = '';
            if (audienceEl) {
              const spanEl = audienceEl.querySelector('span');
              username = spanEl ? spanEl.textContent.trim() : audienceEl.textContent.trim();
            }

            let messageText = '';
            const fullText = messageEl.textContent || '';
            const translationEl = messageEl.querySelector('.translation, [class*="translation"]');
            messageText = translationEl ? fullText.replace(translationEl.textContent, '').trim() : fullText.trim();

            if (!username || !messageText) { msg.dataset.processed = 'true'; return; }
            msg.dataset.processed = 'true';

            const isTip = messageText.toLowerCase().includes('gold') && /\d+/.test(messageText);
            let tipAmount = 0;
            if (isTip) {
              const match = messageText.match(/(\d+\.?\d*)\s*gold/i);
              if (match) tipAmount = parseFloat(match[1]);
            }

            if (!fanHistory[username]) fanHistory[username] = { messages: [], tips: [] };

            if (isTip && tipAmount > 0) {
              fanHistory[username].tips.push({ type: 'tip', amount: tipAmount, timestamp: Date.now() });
              console.log(`💰 Tip de ${username}: ${tipAmount} GOLD`);
            } else {
              fanHistory[username].messages.push({ type: 'fan', message: messageText, timestamp: Date.now() });
              if (fanHistory[username].messages.length > 70) fanHistory[username].messages.shift();
              console.log(`💬 Fan ${username}: ${messageText.substring(0, 50)}...`);
            }

            if (messageText && !msg.querySelector('.ai-btn') && (!isTip || messageText.length > 20)) {
              addStreamingAIButton(msg, username, messageText);
            }

          } else if (performerMessageText) {
            const audienceEl = msg.querySelector('[data-ta-locator="PerformerMessage__Audience"]');
            const messageEl = msg.querySelector('[data-ta-locator="PerformerMessage__Message"]');
            if (!messageEl) { msg.dataset.processed = 'true'; return; }

            let targetUser = '';
            if (audienceEl) targetUser = audienceEl.textContent.replace(/^A\s*/i, '').trim();

            let messageText = '';
            const fullText = messageEl.textContent || '';
            const translationEl = messageEl.querySelector('.translation, [class*="translation"]');
            messageText = translationEl ? fullText.replace(translationEl.textContent, '').trim() : fullText.trim();

            msg.dataset.processed = 'true';

            if (targetUser && messageText) {
              if (!fanHistory[targetUser]) fanHistory[targetUser] = { messages: [], tips: [] };
              fanHistory[targetUser].messages.push({ type: 'model', message: messageText, timestamp: Date.now() });
              if (fanHistory[targetUser].messages.length > 70) fanHistory[targetUser].messages.shift();
              console.log(`💬 Modelo→ ${targetUser}: ${messageText.substring(0, 50)}...`);
            }
          } else {
            msg.dataset.processed = 'true';
          }
        } catch (err) {
          console.error('Error procesando mensaje:', err);
          msg.dataset.processed = 'true';
        }
      });
    }

    function addStreamingAIButton(container, username, messageText) {
      const btn = document.createElement('button');
      btn.textContent = '🤖';
      btn.className = 'ai-btn';
      btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:4px 8px;margin-left:8px;cursor:pointer;border-radius:5px;font-size:12px;vertical-align:middle;';

      btn.onclick = async () => {
        btn.textContent = '...';
        try {
          const mode = detectChatMode();
          const isPaid = mode === 'PAID' || mode === 'GUEST';
          const userHistory = fanHistory[username] || { messages: [], tips: [] };
          let fullContext = [...userHistory.messages, ...userHistory.tips].sort((a, b) => a.timestamp - b.timestamp);

          const data = await callAPI({
            username, message: messageText,
            context: fullContext.slice(-CONFIG.MAX_CONTEXT_MESSAGES),
            isPM: isPaid, chatType: mode.toLowerCase(),
            broadcaster_username: broadcasterUsername
          });

          if (data) {
            navigator.clipboard.writeText(data.suggestion);
            showStreamingPopup(username, data.suggestion, data.translation, detectChatMode());
            btn.textContent = '✓';
          } else {
            btn.textContent = '!';
          }
        } catch (error) {
          console.error('Error:', error);
          btn.textContent = '!';
        }
        setTimeout(() => btn.textContent = '🤖', 2000);
      };

      const messageEl = container.querySelector('[data-ta-locator="UserMessage__Message"]');
      if (messageEl) {
        messageEl.style.display = 'inline';
        messageEl.after(btn);
      } else {
        container.appendChild(btn);
      }
    }

    function showStreamingPopup(username, suggestion, translation, mode) {
      const oldPopup = document.getElementById('ai-popup');
      if (oldPopup) oldPopup.remove();

      const modeLabel = { 'FREE': '🌐 FREE', 'GUEST': '👤 GUEST', 'PAID': '💰 PAID' };

      let translationHtml = '';
      if (translation) {
        const sClean = suggestion.replace(/\s+/g, ' ').trim().toLowerCase();
        const tClean = translation.replace(/\s+/g, ' ').trim().toLowerCase();
        if (sClean !== tClean) {
          translationHtml = `<p style="background:#e8f4e8;padding:12px;border-radius:5px;color:#555;font-size:13px;margin-bottom:10px;"><strong>🇪🇸 Traducción:</strong><br>${translation}</p>`;
        }
      }

      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #8B5CF6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;cursor:move;';

      popup.innerHTML = `
        <h3 style="margin:0 0 15px 0;color:#333;">${modeLabel[mode] || mode} - @${username} ✅ Copiado!</h3>
       <textarea id="ai-response" style="background:#f0f0f0;padding:12px;border-radius:5px;height:80px;width:100%;resize:vertical;margin-bottom:10px;color:#333;border:1px solid #ccc;font-family:inherit;font-size:14px;box-sizing:border-box">${suggestion}</textarea>
        ${translationHtml}
        <div style="display:flex;gap:10px;">
          <button id="btn-regen" style="padding:8px 15px;cursor:pointer;border:none;background:#10B981;color:white;border-radius:5px;">🔄 Regenerar</button>
          <button id="btn-insert" style="padding:8px 15px;cursor:pointer;border:none;background:#22c55e;color:white;border-radius:5px;">📤 Enviar</button>
          <button id="btn-close" style="padding:8px 15px;cursor:pointer;border:none;background:#EF4444;color:white;border-radius:5px;">❌ Cerrar</button>
        </div>
      `;

      document.body.appendChild(popup);

      let isDragging = false, offsetX, offsetY;
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
      document.addEventListener('mouseup', () => { isDragging = false; });
      popup.querySelector('#ai-response').addEventListener('keydown', (e) => e.stopPropagation());
      popup.querySelector('#btn-close').onclick = () => popup.remove();

      popup.querySelector('#btn-insert').onclick = () => {
        const input = document.querySelector('#message_text_input');
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          const text = popup.querySelector('#ai-response').value;
          nativeInputValueSetter.call(input, text);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          }, 100);
        }
        popup.remove();
      };

      popup.querySelector('#btn-regen').onclick = async () => {
        const regenBtn = popup.querySelector('#btn-regen');
        regenBtn.disabled = true;
        regenBtn.textContent = '⏳...';

        const userHistory = fanHistory[username] || { messages: [], tips: [] };
        let fullContext = [...userHistory.messages, ...userHistory.tips].sort((a, b) => a.timestamp - b.timestamp);
        const lastMsg = fanHistory[username]?.messages.slice(-1)[0]?.message || '';

        const data = await callAPI({
          username, message: lastMsg,
          context: fullContext.slice(-CONFIG.MAX_CONTEXT_MESSAGES),
          isPM: detectChatMode() !== 'FREE', chatType: detectChatMode().toLowerCase(),
          broadcaster_username: broadcasterUsername
        });

        if (data) {
          popup.querySelector('#ai-response').value = data.suggestion;
          suggestion = data.suggestion;
          navigator.clipboard.writeText(data.suggestion);
        }

        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };
    }

    injectStyles();
    setInterval(processAllMessages, 2000);
    setTimeout(processAllMessages, 1000);
    console.log('✅ CamAssist Streamate Streaming activo');
  }

  // ============================================================
  // =================== MODO MESSENGER =========================
  // ============================================================
  function initMessenger() {
    let inboxHistory = [];

    function getFanUsername() {
      const allH3 = document.querySelectorAll('h3[data-ta-locator="Text"]');
      for (const el of allH3) {
        if (el.className.includes('streamfans')) return el.textContent.trim();
      }
      const h3 = document.querySelector('h3.streamfans');
      if (h3) return h3.textContent.trim();
      return null;
    }

    let broadcasterUsername = 'Model';

    function processInboxMessages() {
      const fanUsername = getFanUsername();
      if (!fanUsername) return;

      const allMessages = document.querySelectorAll('[data-ta-locator="user-message"]');

      allMessages.forEach(msg => {
        if (msg.dataset.processed) return;

        const messageText = msg.textContent.trim();
        if (!messageText) { msg.dataset.processed = 'true'; return; }

        const isModelMessage = msg.outerHTML.includes('messenger');

        msg.dataset.processed = 'true';

        const lastMsg = inboxHistory[inboxHistory.length - 1];
        const isDuplicate = lastMsg && lastMsg.message === messageText && lastMsg.type === (isModelMessage ? 'model' : 'fan');
        if (!isDuplicate) {
          inboxHistory.push({
            type: isModelMessage ? 'model' : 'fan',
            message: messageText,
            timestamp: Date.now()
          });
        }

        if (inboxHistory.length > CONFIG.MAX_CONTEXT_MESSAGES) inboxHistory.shift();

        console.log(`💬 INBOX - ${isModelMessage ? 'Modelo' : 'Fan'} ${fanUsername}: ${messageText.substring(0, 50)}...`);

        if (!isModelMessage && !msg.querySelector('.ai-btn')) {
          addInboxAIButton(msg, fanUsername, messageText);
        }
      });

      const goldMessages = document.querySelectorAll('[data-ta-locator="gold-message"]');
      goldMessages.forEach(msg => {
        if (msg.dataset.processed) return;
        msg.dataset.processed = 'true';

        const text = msg.textContent.trim();
        const match = text.match(/(\d+\.?\d*)\s*GOLD/i);
        if (match) {
          const amount = parseFloat(match[1]);
          inboxHistory.push({ type: 'tip', amount: amount, timestamp: Date.now() });
          console.log(`💰 INBOX - Tip: ${amount} GOLD`);
        }
      });
    }

    function addInboxAIButton(container, username, messageText) {
      const btn = document.createElement('button');
      btn.textContent = '🤖';
      btn.className = 'ai-btn';
      btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:4px 8px;margin-left:8px;cursor:pointer;border-radius:5px;font-size:12px;vertical-align:middle;';

      btn.onclick = async () => {
        btn.textContent = '...';
        try {
          const sortedHistory = inboxHistory.sort((a, b) => a.timestamp - b.timestamp);

          const data = await callAPI({
            username, message: messageText,
            context: sortedHistory.slice(-CONFIG.MAX_CONTEXT_MESSAGES),
            isPM: true, chatType: 'inbox',
            broadcaster_username: broadcasterUsername
          });

          if (data) {
            navigator.clipboard.writeText(data.suggestion);
            showInboxPopup(username, data.suggestion, data.translation, messageText);
            btn.textContent = '✓';
          } else {
            btn.textContent = '!';
          }
        } catch (error) {
          console.error('Error:', error);
          btn.textContent = '!';
        }
        setTimeout(() => btn.textContent = '🤖', 2000);
      };

      container.appendChild(btn);
    }

    function showInboxPopup(username, suggestion, translation, originalMessage) {
      const oldPopup = document.getElementById('ai-popup');
      if (oldPopup) oldPopup.remove();

      let translationHtml = '';
      if (translation) {
        const sClean = suggestion.replace(/\s+/g, ' ').trim().toLowerCase();
        const tClean = translation.replace(/\s+/g, ' ').trim().toLowerCase();
        if (sClean !== tClean) {
          translationHtml = `<p style="background:#e8f4e8;padding:12px;border-radius:5px;color:#555;font-size:13px;margin-bottom:10px;"><strong>🇪🇸 Traducción:</strong><br>${translation}</p>`;
        }
      }

      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #8B5CF6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;cursor:move;';

      popup.innerHTML = `
        <h3 style="margin:0 0 15px 0;color:#333;">📬 INBOX - @${username} ✅ Copiado!</h3>
        <textarea id="ai-response" style="background:#f0f0f0;padding:12px;border-radius:5px;height:100px;width:100%;resize:vertical;margin-bottom:10px;color:#333;border:1px solid #ccc;font-family:inherit;font-size:14px;box-sizing:border-box">${suggestion}</textarea>
        ${translationHtml}
        <div style="display:flex;gap:10px;">
          <button id="btn-regen" style="padding:8px 15px;cursor:pointer;border:none;background:#10B981;color:white;border-radius:5px;">🔄 Regenerar</button>
          <button id="btn-send" style="padding:8px 15px;cursor:pointer;border:none;background:#22c55e;color:white;border-radius:5px;">📤 Enviar</button>
          <button id="btn-close" style="padding:8px 15px;cursor:pointer;border:none;background:#EF4444;color:white;border-radius:5px;">❌ Cerrar</button>
        </div>
      `;

      document.body.appendChild(popup);

      let isDragging = false, offsetX, offsetY;
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
      document.addEventListener('mouseup', () => { isDragging = false; });

      popup.querySelector('#ai-response').addEventListener('keydown', (e) => e.stopPropagation());

      popup.querySelector('#btn-close').onclick = () => popup.remove();

      popup.querySelector('#btn-send').onclick = () => {
        const text = popup.querySelector('#ai-response').value;
        const textarea = document.querySelector('textarea[data-ta-locator="create-message-input"]');
        const sendBtn = document.querySelector('button[data-ta-locator="send-button"]');

        if (textarea && sendBtn) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeSetter.call(textarea, text);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));

          setTimeout(() => {
            sendBtn.click();
            popup.remove();
          }, 200);
        } else {
          navigator.clipboard.writeText(text);
          alert('Texto copiado. No se encontró el input del messenger.');
        }
      };

      popup.querySelector('#btn-regen').onclick = async () => {
        const regenBtn = popup.querySelector('#btn-regen');
        regenBtn.disabled = true;
        regenBtn.textContent = '⏳...';

        const sortedHistory = inboxHistory.sort((a, b) => a.timestamp - b.timestamp);

        const data = await callAPI({
          username, message: originalMessage,
          context: sortedHistory.slice(-CONFIG.MAX_CONTEXT_MESSAGES),
          isPM: true, chatType: 'inbox',
          broadcaster_username: broadcasterUsername
        });

        if (data) {
          popup.querySelector('#ai-response').value = data.suggestion;
          suggestion = data.suggestion;
          navigator.clipboard.writeText(data.suggestion);
        }

        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };
    }

    // Detectar cambio de fan
    let currentFan = null;
    setInterval(() => {
      const newFan = getFanUsername();
      if (newFan && newFan !== currentFan) {
        currentFan = newFan;
        inboxHistory = [];
        document.querySelectorAll('[data-ta-locator="user-message"]').forEach(m => m.dataset.processed = '');
        document.querySelectorAll('[data-ta-locator="gold-message"]').forEach(m => m.dataset.processed = '');
        console.log(`👤 INBOX - Cambió a fan: ${newFan}`);
      }
    }, 1000);

    injectStyles();
    setInterval(processInboxMessages, 2000);
    setTimeout(processInboxMessages, 1000);
    console.log('✅ CamAssist Streamate Messenger activo');
  }

  // ============================================================
  // =================== FUNCIONES COMPARTIDAS ==================
  // ============================================================

  async function callAPI(params) {
    if (!modelToken) {
      alert('⚠️ Token no configurado. Abre el popup de la extensión.');
      return null;
    }

    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: modelToken,
          platform: CONFIG.PLATFORM,
          version: CONFIG.VERSION,
          ...params
        })
      });

      const data = await response.json();

      if (data.success) {
        return { suggestion: data.suggestion, translation: data.translation };
      } else {
        console.error('API Error:', data.error);
        return null;
      }
    } catch (error) {
      console.error('API Error:', error);
      return null;
    }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .ai-btn { transition: all 0.2s; }
      .ai-btn:hover { background: #7C3AED !important; transform: scale(1.1); }
      #ai-popup { animation: fadeIn 0.2s ease; }
      @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

})();
