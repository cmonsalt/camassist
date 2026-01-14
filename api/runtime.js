import { createClient } from '@supabase/supabase-js';

const supabase = process.env.SUPABASE_URL ? createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
) : null;

// ============================================
// CÓDIGO DE CHATURBATE
// ============================================
const chaturbateCode = `
console.log("CamAssist loaded!");

chrome.storage.local.get(['model_token'], (result) => {
  if (result.model_token) {
    localStorage.setItem('model_token', result.model_token);
    console.log('✅ Token cargado desde extensión:', result.model_token);
  }
});

let publicHistory = {};
let pmHistory = {};

const broadcasterUsername = window.location.pathname.split('/b/')[1]?.split('/')[0] || '';
console.log('👤 Broadcaster username:', broadcasterUsername);

const extensionStartTime = Date.now();

function getGoalAndTipMenu() {
  let goal = '';
  const goalEl = document.querySelector('span.RoomSubjectSpan, [data-testid="room-subject-span"]');
  if (goalEl) {
    goal = goalEl.textContent.trim();
    console.log('🎯 GOAL detectado:', goal);
  }

  let tipMenu = [];
  const tipMenuItems = document.querySelectorAll('a[data-testid="shortcode-link"]');
  tipMenuItems.forEach(item => {
    const parentText = item.closest('.msg-text, [class*="message"]')?.textContent.trim() || item.parentElement?.textContent.trim();
    const text = parentText || item.textContent.trim();
    if (text && !tipMenu.includes(text)) {
      tipMenu.push(text);
    }
  });

  return {
    goal: goal,
    tipMenu: tipMenu.join(' | ')
  };
}

console.log('⏰ Extension cargada en:', new Date(extensionStartTime).toLocaleTimeString());

setInterval(() => {
  const pmTab = document.querySelector('#pm-tab-default');
  const isPMTabActive = pmTab && pmTab.classList.contains('active');

  const allMessages = document.querySelectorAll('[data-testid="chat-message"]');

  allMessages.forEach(msg => {
    const dataNick = msg.getAttribute('data-nick');
    if (!dataNick) return;

    const isModelMessage = dataNick === broadcasterUsername;
    const username = dataNick;
    const isPM = isPMTabActive;

    let messageText = '';
    const textElements = msg.querySelectorAll('.msg-text, [class*="message-text"]');
    textElements.forEach(el => {
      const text = el.textContent.trim();
      if (text && text.length > messageText.length) {
        messageText = text;
      }
    });

    if (!messageText) {
      messageText = msg.textContent.trim();
      messageText = messageText.replace(new RegExp('^' + username + '\\\\s*', 'i'), '').trim();
    }

    messageText = messageText.replace(/^@\\S+\\s*/g, '').trim();

    const isTip = messageText.includes('tipped') || messageText.includes('tokens');
    let tipAmount = 0;
    if (isTip) {
      const match = messageText.match(/(\\d+)\\s*(tokens?|tips?)/i);
      if (match) tipAmount = parseInt(match[1]);
    }

    if (msg.dataset.processed) return;
    msg.dataset.processed = 'true';

    if (!isTip && messageText) {
      const history = isPM ? pmHistory : publicHistory;
      let targetUsername = username;

      if (isModelMessage && !isPM) {
        const mentionMatch = msg.textContent.match(/@(\\w+)/);
        if (mentionMatch) {
          targetUsername = mentionMatch[1];
        }
      }

      if (isModelMessage && isPM) {
        const fanMessages = Array.from(allMessages).filter(m => {
          const nick = m.getAttribute('data-nick');
          return nick && nick !== broadcasterUsername;
        });

        if (fanMessages.length > 0) {
          const lastFanMessage = fanMessages[fanMessages.length - 1];
          targetUsername = lastFanMessage.getAttribute('data-nick');
        }
      }

      if (!history[targetUsername]) {
        history[targetUsername] = { messages: [], tips: [] };
      }

      const msgTs = parseInt(msg.getAttribute('data-ts') || '0') || Date.now();
      history[targetUsername].messages.push({
        type: isModelMessage ? 'model' : 'fan',
        message: messageText,
        timestamp: msgTs
      });

      if (history[targetUsername].messages.length > 20) {
        history[targetUsername].messages.shift();
      }

      console.log('💬 ' + (isPM ? 'PM' : 'Público') + ' - ' + (isModelMessage ? 'Modelo' : 'Fan') + ' (' + targetUsername + '): ' + messageText);
    }

    const hasTipMessage = isTip && messageText && !messageText.match(/^tipped \\d+ tokens?$/i);

    if (!isModelMessage && messageText && !msg.querySelector('.ai-btn')) {
      if (!isTip || hasTipMessage) {
        addAIButton(msg, username, messageText, isPM, isPM ? 'pm' : 'public', tipAmount);
      }
    }

    if (isTip && tipAmount > 0) {
      const history = isPM ? pmHistory : publicHistory;

      if (!history[username]) {
        history[username] = { messages: [], tips: [] };
      }

      const now = Date.now();
      const isDuplicate = history[username].tips.some(item => {
        return item.type === 'tip' &&
          item.amount === tipAmount &&
          Math.abs(item.timestamp - now) < 2000;
      });

      if (!isDuplicate) {
        history[username].tips.push({
          type: 'tip',
          amount: tipAmount,
          timestamp: now
        });

        if (history[username].tips.length > 5) {
          history[username].tips.shift();
        }
        console.log('💰 ' + (isPM ? 'PM' : 'Público') + ' - Tip de ' + username + ': ' + tipAmount + ' tokens');
      }
    }
  });

  let modalPmUser = null;
  const modalHeader = document.querySelector('[data-testid="virtual-list"]')?.closest('div')?.querySelector('[class*="username"], [class*="user-name"]');
  if (!modalHeader) {
    const modalTitle = document.querySelector('div[style*="z-index"] span[class*="user"]');
    if (modalTitle) {
      modalPmUser = modalTitle.textContent.trim();
    }
  } else {
    modalPmUser = modalHeader.textContent.trim();
  }

  const modalPmMessages = document.querySelectorAll('[data-testid="received-message"], [data-testid="sent-message"]');

  modalPmMessages.forEach(msg => {
    if (msg.dataset.processedModal) return;

    const isModelMessage = msg.getAttribute('data-testid') === 'sent-message';

    let messageText = '';
    const contentEl = msg.querySelector('[data-testid="message-contents"] span');
    if (contentEl) {
      messageText = contentEl.textContent.trim();
    }

    const imageEl = msg.querySelector('img[data-testid="pvt-img"]');
    const imageUrl = imageEl ? imageEl.src : null;

    if (!messageText) return;

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

    if (pmHistory[modalPmUser].messages.length > 15) {
      pmHistory[modalPmUser].messages.shift();
    }

    console.log('💬 Modal PM - ' + (isModelMessage ? 'Modelo' : 'Fan') + ' (' + modalPmUser + '): ' + messageText);

    if (!isModelMessage && !msg.querySelector('.ai-btn')) {
      addAIButton(msg, modalPmUser, messageText, true, 'pm', 0, imageUrl);
    }
  });

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

    console.log('🖼️ Imagen detectada de ' + dataNick + ': ' + imageUrl.substring(0, 50) + '...');

    if (!pmHistory[dataNick]) {
      pmHistory[dataNick] = { messages: [], tips: [] };
    }

    const imageTs = parseInt(imgContainer.getAttribute('data-ts') || '0') || Date.now();
    pmHistory[dataNick].messages.push({
      type: 'image',
      imageUrl: imageUrl,
      timestamp: imageTs
    });

    if (pmHistory[dataNick].messages.length > 15) {
      pmHistory[dataNick].messages.shift();
    }

    if (!imgContainer.querySelector('.ai-btn')) {
      addAIButton(imgContainer, dataNick, '[Envió una imagen]', true, 'pm', 0, imageUrl);
    }
  });

}, 2000);

function addAIButton(container, username, messageText, isPM, context, tipAmount, imageUrl = null) {
  const btn = document.createElement('button');
  btn.textContent = '🤖';
  btn.className = 'ai-btn';
  btn.style.cssText = imageUrl
    ? 'background:#10B981;color:white;border:none;padding:3px 8px;margin-left:5px;cursor:pointer;border-radius:5px;font-size:12px'
    : 'background:#8B5CF6;color:white;border:none;padding:3px 8px;margin-left:5px;cursor:pointer;border-radius:5px;font-size:12px';

  btn.onclick = async () => {
    const pmTab = document.querySelector('#pm-tab-default');
    const currentlyInPM = pmTab && pmTab.classList.contains('active');

    const history = currentlyInPM ? pmHistory : publicHistory;
    const userHistory = history[username] || [];

    console.log('🔵 IA para ' + (currentlyInPM ? 'PM' : 'público') + ' - Usuario: ' + username);

    btn.textContent = '...';

    const getResponse = async () => {
      const userMessages = userHistory.messages || [];
      const userTips = userHistory.tips || [];
      let fullContext = [...userMessages, ...userTips];

      if (isPM && publicHistory[username]) {
        const pubMessages = publicHistory[username].messages || [];
        const pubTips = publicHistory[username].tips || [];
        fullContext = [...pubMessages, ...pubTips, ...fullContext];
      }

      fullContext = fullContext.sort((a, b) => a.timestamp - b.timestamp);

      console.log('📚 Historial enviado a IA (últimos 20):');
      console.table(fullContext.slice(-20).map((item, index) => ({
        '#': index,
        'Quién': item.type === 'fan' ? '👤 Fan' : item.type === 'model' ? '💃 Modelo' : item.type === 'image' ? '🖼️ Imagen' : '💰 Tip',
        'Mensaje': item.type === 'tip' ? item.amount + ' tokens' : item.type === 'image' ? '[Imagen]' : (item.message ? item.message.substring(0, 50) + (item.message.length > 50 ? '...' : '') : ''),
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
          context: fullContext.slice(-20),
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

      try {
        navigator.clipboard.writeText(data.suggestion);
      } catch (e) {
        console.log('No se pudo copiar al portapapeles');
      }

      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:450px';

      const title = document.createElement('h3');
      title.style.marginTop = '0';
      title.textContent = '💬 ' + (isPM ? 'PM' : 'Público') + ' - @' + username + ' ✅ Copiado!';

      const responseText = document.createElement('p');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:10px;border-radius:3px;max-height:200px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px';
      responseText.textContent = data.suggestion;

      let translationText = null;
      let translationContent = null;

      const suggestionClean = data.suggestion ? data.suggestion.replace(/\\s+/g, ' ').trim().toLowerCase() : '';
      const translationClean = data.translation ? data.translation.replace(/\\s+/g, ' ').trim().toLowerCase() : '';

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

            if (translationContent && newData.translation) {
              const newSuggestionClean = newData.suggestion.replace(/\\s+/g, ' ').trim().toLowerCase();
              const newTranslationClean = newData.translation.replace(/\\s+/g, ' ').trim().toLowerCase();

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
`;

// ============================================
// CÓDIGO DE STRIPCHAT
// ============================================
const stripchatCode = `
console.log("CamAssist StripChat loaded!");

chrome.storage.local.get(['model_token'], (result) => {
  if (result.model_token) {
    localStorage.setItem('model_token', result.model_token);
    console.log('✅ Token cargado desde extensión:', result.model_token);
  }
});

let publicHistory = {};
let pmHistory = {};

const broadcasterUsername = window.location.pathname.split('/')[1] || '';
console.log('👤 Broadcaster username:', broadcasterUsername);

const extensionStartTime = Date.now();
console.log('⏰ Extension cargada en:', new Date(extensionStartTime).toLocaleTimeString());

function getGoalAndTipMenu() {
  let goal = '';
  const goalTokens = document.querySelector('.epic-goal-progress__tokens');
  const goalText = document.querySelector('.epic-goal-progress__information span');
  const goalProgress = document.querySelector('.epic-goal-progress__status');
  if (goalTokens && goalText) {
    const progress = goalProgress ? goalProgress.textContent.trim() : '';
    goal = goalText.textContent.trim() + ' - ' + goalTokens.textContent.trim() + ' (' + progress + ' completado)';
    console.log('🎯 GOAL detectado:', goal);
  }

  let tipMenu = [];
  const menuItems = document.querySelectorAll('input[id^="activity"]');
  menuItems.forEach(input => {
    const name = input.value;
    const priceInput = input.closest('li')?.querySelector('input[id^="price"]');
    const price = priceInput ? priceInput.value : '';
    if (name && price) {
      tipMenu.push(name + ' (' + price + 'tk)');
    }
  });

  return {
    goal: goal,
    tipMenu: tipMenu.join(' | ')
  };
}

let messageCounter = 0;

setInterval(() => {
  const publicMessages = document.querySelectorAll('div[data-message-id].regular-public-message, div[data-message-id].tip-message');

  publicMessages.forEach(msg => {
    if (msg.dataset.processed) return;

    const usernameEl = msg.querySelector('.message-username');
    const username = usernameEl ? usernameEl.textContent.trim() : null;

    if (!username) return;

    const isModelMessage = usernameEl && usernameEl.classList.contains('user-levels-username-chat-owner');

    let messageText = '';
    const bodyEl = msg.querySelector('.message-body');
    if (bodyEl) {
      const clone = bodyEl.cloneNode(true);
      const usernameInBody = clone.querySelector('.message-username');
      if (usernameInBody) usernameInBody.remove();
      clone.querySelectorAll('button').forEach(b => b.remove());
      messageText = clone.textContent.trim();
    }

    messageText = messageText.replace(/^@\\S+\\s*/g, '').trim();

    if (!messageText) return;

    const isTip = messageText.includes('tipped') || messageText.includes('tokens') || messageText.includes('propina') || messageText.includes('tk de') || msg.classList.contains('tip-message');
    let tipAmount = 0;
    if (isTip) {
      const match = messageText.match(/(\\d+)\\s*(tokens?|tips?|tk)/i);
      if (match) tipAmount = parseInt(match[1]);
    }

    msg.dataset.processed = 'true';

    if (!isTip && messageText) {
      let targetUsername = username;

      if (isModelMessage) {
        const mentionMatch = msg.textContent.match(/@(\\w+)/);
        if (mentionMatch) {
          targetUsername = mentionMatch[1];
        }
      }

      if (!publicHistory[targetUsername]) {
        publicHistory[targetUsername] = { messages: [], tips: [] };
      }

      const msgId = messageCounter++;

      const exists = publicHistory[targetUsername].messages.some(item => item.timestamp === msgId);
      if (!exists) {
        publicHistory[targetUsername].messages.push({
          type: isModelMessage ? 'model' : 'fan',
          message: messageText,
          timestamp: msgId
        });
      }

      if (publicHistory[targetUsername].messages.length > 20) {
        publicHistory[targetUsername].messages.shift();
      }

      console.log('💬 Público - ' + (isModelMessage ? 'Modelo' : 'Fan') + ' (' + targetUsername + '): ' + messageText);
    }

    const hasTipMessage = isTip && messageText && !messageText.match(/^tipped \\d+ tokens?$/i);

    if (!isModelMessage && messageText && !msg.querySelector('.ai-btn')) {
      if (!isTip || hasTipMessage) {
        addAIButton(msg, username, messageText, false, 'public', tipAmount);
      }
    }

    if (isTip && tipAmount > 0) {
      if (!publicHistory[username]) {
        publicHistory[username] = { messages: [], tips: [] };
      }
      const msgId = messageCounter++;
      const isDuplicate = publicHistory[username].tips.some(item =>
        item.type === 'tip' && item.timestamp === msgId
      );
      if (!isDuplicate) {
        publicHistory[username].tips.push({ type: 'tip', amount: tipAmount, timestamp: msgId });
        if (publicHistory[username].tips.length > 5) {
          publicHistory[username].tips.shift();
        }
        console.log('💰 Público - Tip de ' + username + ': ' + tipAmount + ' tokens');
      }
    }
  });

  let pmUser = null;

  const usernameLink = document.querySelector('a.user-levels-username-link');
  if (usernameLink) {
    const href = usernameLink.getAttribute('href');
    if (href && href.includes('/user/')) {
      pmUser = href.split('/user/')[1];
    }
  }

  if (!pmUser) {
    const chatHeader = document.querySelector('[class*="MessengerChat"] [class*="username"], [class*="ChatHeader"] [class*="name"]');
    if (chatHeader) {
      pmUser = chatHeader.textContent.trim();
    }
  }

  if (!pmUser) {
    const modalTitle = document.querySelector('[class*="user-info-popup-header"] a');
    if (modalTitle) {
      const href = modalTitle.getAttribute('href');
      if (href && href.includes('/user/')) {
        pmUser = href.split('/user/')[1];
      }
    }
  }

  if (!pmUser) {
    const usernameSpan = document.querySelector('span.user-levels-username-text');
    if (usernameSpan) {
      pmUser = usernameSpan.textContent.trim();
    }
  }

  const pmTips = document.querySelectorAll('div.tipped-message:not([data-processed])');
  pmTips.forEach(tip => {
    if (tip.dataset.processed) return;

    const tipTextEl = tip.querySelector('.tip-message-text');
    if (!tipTextEl) return;

    const tipText = tipTextEl.textContent.trim();
    const tipMatch = tipText.match(/(\\d+)\\s*(tk|tokens?)/i);

    if (tipMatch) {
      const targetUser = pmUser || 'fan';
      if (!pmHistory[targetUser]) {
        pmHistory[targetUser] = { messages: [], tips: [] };
      }
      const tipAmount = parseInt(tipMatch[1]);
      const msgId = messageCounter++;
      pmHistory[targetUser].tips.push({ type: 'tip', amount: tipAmount, timestamp: msgId });
      if (pmHistory[targetUser].tips.length > 5) {
        pmHistory[targetUser].tips.shift();
      }
      console.log('💰 PM - Tip de ' + targetUser + ': ' + tipAmount + ' tokens');
    }
    tip.dataset.processed = 'true';
  });

  const pmImages = document.querySelectorAll('div.photo-message:not([data-processed])');
  pmImages.forEach(imgMsg => {
    if (imgMsg.dataset.processed) return;

    const imgEl = imgMsg.querySelector('img.photo-image');
    if (!imgEl) return;

    const imageUrl = imgEl.getAttribute('src');
    if (!imageUrl) return;

    const targetUser = pmUser || 'fan';

    if (!pmHistory[targetUser]) {
      pmHistory[targetUser] = { messages: [], tips: [] };
    }
    const msgId = messageCounter++;
    pmHistory[targetUser].messages.push({
      type: 'fan',
      message: '[Imagen enviada]',
      timestamp: msgId,
      imageUrl: imageUrl
    });
    if (pmHistory[targetUser].messages.length > 20) {
      pmHistory[targetUser].messages.shift();
    }

    console.log('🖼️ PM - Imagen de ' + targetUser + ': ' + imageUrl.substring(0, 50) + '...');

    if (!imgMsg.querySelector('.ai-btn')) {
      addImageAIButton(imgMsg, targetUser, imageUrl);
    }

    imgMsg.dataset.processed = 'true';
  });

  const allPmMessages = document.querySelectorAll('div[data-message-id][class*="base-message"]');

  allPmMessages.forEach(msg => {
    if (msg.dataset.processed) return;

    const isModelMessage = msg.className.includes('OwnBaseMessage') ||
      msg.className.includes('own') ||
      msg.className.includes('position-right');

    let messageText = '';
    const textEl = msg.querySelector('[class*="TextMessage"][class*="base-message"]');
    if (textEl) {
      const clone = textEl.cloneNode(true);
      clone.querySelectorAll('[class*="indicators"], [class*="time"], span').forEach(el => el.remove());
      messageText = clone.textContent.trim();
    }

    if (!messageText) {
      const fontEl = msg.querySelector('font[dir="auto"]');
      if (fontEl) {
        messageText = fontEl.textContent.trim();
      }
    }

    if (!messageText) return;

    const isTipPM = msg.classList.contains('tipped-message') || messageText.includes('propina');
    if (isTipPM) {
      const tipMatch = messageText.match(/(\\d+)\\s*(tk|tokens?)/i);
      if (tipMatch) {
        const targetUser = pmUser || 'fan';
        if (!pmHistory[targetUser]) {
          pmHistory[targetUser] = { messages: [], tips: [] };
        }
        const tipAmount = parseInt(tipMatch[1]);
        const msgId = messageCounter++;
        const exists = pmHistory[targetUser].tips.some(item => item.timestamp === msgId && item.type === 'tip');
        if (!exists) {
          pmHistory[targetUser].tips.push({ type: 'tip', amount: tipAmount, timestamp: msgId });
          if (pmHistory[targetUser].tips.length > 5) {
            pmHistory[targetUser].tips.shift();
          }
          console.log('💰 PM - Tip de ' + targetUser + ': ' + tipAmount + ' tokens');
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

    const msgId = messageCounter++;

    const exists = pmHistory[targetUser].messages.some(item => item.timestamp === msgId);
    if (!exists) {
      pmHistory[targetUser].messages.push({
        type: isModelMessage ? 'model' : 'fan',
        message: messageText,
        timestamp: msgId
      });
    }

    if (pmHistory[targetUser].messages.length > 20) {
      pmHistory[targetUser].messages.shift();
    }

    console.log('💬 PM - ' + (isModelMessage ? 'Modelo' : 'Fan') + ' (' + targetUser + '): ' + messageText);

    if (!isModelMessage && !msg.querySelector('.ai-btn')) {
      addAIButton(msg, targetUser, messageText, true, 'pm', 0);
    }
  });

}, 2000);

function addAIButton(container, username, messageText, isPM, context, tipAmount) {
  const btn = document.createElement('button');
  btn.textContent = '🤖';
  btn.className = 'ai-btn';

  if (isPM) {
    btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:2px 5px;cursor:pointer;border-radius:4px;font-size:10px;margin-left:5px;vertical-align:middle;display:inline;';
  } else {
    btn.style.cssText = 'background:#8B5CF6;color:white;border:none;padding:3px 8px;margin-left:5px;cursor:pointer;border-radius:5px;font-size:12px;';
  }

  btn.onclick = async () => {
    const history = context === 'pm' ? pmHistory : publicHistory;
    const userHistory = history[username] || [];

    console.log('🔵 IA para ' + (isPM ? 'PM' : 'público') + ' - Usuario: ' + username);

    btn.textContent = '...';

    const getResponse = async () => {
      const userMessages = userHistory.messages || [];
      const userTips = userHistory.tips || [];
      let fullContext = [...userMessages, ...userTips];

      if (isPM && publicHistory[username]) {
        const pubMessages = publicHistory[username].messages || [];
        const pubTips = publicHistory[username].tips || [];
        fullContext = [...pubMessages, ...pubTips, ...fullContext];
      }

      fullContext = fullContext.sort((a, b) => a.timestamp - b.timestamp);

      console.log('📚 Historial enviado a IA (últimos 10):');
      console.table(fullContext.slice(-10).map((item, index) => ({
        '#': index,
        'Quién': item.type === 'fan' ? '👤 Fan' : item.type === 'model' ? '💃 Modelo' : '💰 Tip',
        'Mensaje': item.type === 'tip' ? item.amount + ' tokens' : item.message.substring(0, 50),
        'Hora': new Date(item.timestamp).toLocaleTimeString()
      })));

      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          platform: 'stripchat',
          username,
          message: messageText,
          context: fullContext.slice(-20),
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

      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #8B5CF6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;';

      const title = document.createElement('h3');
      title.style.cssText = 'margin:0 0 15px 0;color:#333;';
      title.textContent = '💬 ' + (isPM ? 'PM' : 'Público') + ' - @' + username + ' ✅ Copiado!';

      const responseText = document.createElement('p');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:12px;border-radius:5px;max-height:200px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px;color:#333;';
      responseText.textContent = data.suggestion;

      let translationText = null;
      let translationContent = null;

      const suggestionClean = data.suggestion ? data.suggestion.replace(/\\s+/g, ' ').trim().toLowerCase() : '';
      const translationClean = data.translation ? data.translation.replace(/\\s+/g, ' ').trim().toLowerCase() : '';

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
          responseText.textContent = newData.suggestion;
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
      popup.appendChild(regenBtn);
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

    console.log('🔵 IA para imagen PM - Usuario: ' + username);
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

      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          platform: 'stripchat',
          username,
          message: '[Fan envió una imagen]',
          context: fullContext.slice(-10),
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

      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #3B82F6;z-index:99999;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:450px;font-family:Arial,sans-serif;';

      const title = document.createElement('h3');
      title.style.cssText = 'margin:0 0 15px 0;color:#333;';
      title.textContent = '🖼️ Imagen PM - @' + username + ' ✅ Copiado!';

      const responseText = document.createElement('p');
      responseText.style.cssText = 'background:#f0f0f0;padding:12px;border-radius:5px;max-height:200px;overflow-y:auto;word-wrap:break-word;margin-bottom:10px;color:#333;';
      responseText.textContent = data.suggestion;

      let translationText = null;
      if (data.translation && data.suggestion.toLowerCase() !== data.translation.toLowerCase()) {
        translationText = document.createElement('div');
        translationText.style.cssText = 'background:#e3f2fd;padding:10px;border-radius:5px;margin-bottom:10px;border-left:3px solid #2196F3;';
        translationText.innerHTML = '<div style="font-size:11px;color:#1976D2;font-weight:600;margin-bottom:5px;">📝 Traducción:</div><div style="color:#333;">' + data.translation + '</div>';
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
              username,
              message: '[Fan envió una imagen]',
              context: fullContext.slice(-10),
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
      popup.appendChild(regenBtn);
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

  container.style.position = 'relative';
  container.appendChild(btn);
}
`;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/javascript');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { host, token } = req.query;

  // Validar token si existe
  if (token && supabase) {
    try {
      const { data: model, error } = await supabase
        .from('models')
        .select('id, subscription_status, deleted_at')
        .eq('token', token)
        .single();

      if (error || !model) {
        return res.status(200).send('console.error("CamAssist: Token inválido");');
      }

      if (model.deleted_at) {
        return res.status(200).send('console.error("CamAssist: Modelo desactivada");');
      }

      if (model.subscription_status === 'suspended') {
        return res.status(200).send('console.error("CamAssist: Cuenta suspendida - Contacta soporte");');
      }
    } catch (err) {
      console.error('Error validando token:', err);
    }
  }

  // Determinar qué código enviar según el host
  if (host && host.includes('chaturbate')) {
    return res.status(200).send(chaturbateCode);
  }

  if (host && host.includes('stripchat')) {
    return res.status(200).send(stripchatCode);
  }

  // Host no soportado
  return res.status(200).send('console.log("CamAssist: Plataforma no soportada");');
}
