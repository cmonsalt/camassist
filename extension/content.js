console.log("CamAssist loaded!");

// HISTORIALES SEPARADOS
let publicHistory = {};  // Por username en chat público
let pmHistory = {};      // Por username en PM

// Obtener username del broadcaster (tú)
const broadcasterUsername = window.location.pathname.split('/b/')[1]?.split('/')[0] || '';
console.log('👤 Broadcaster username:', broadcasterUsername);

const extensionStartTime = Date.now();
console.log('⏰ Extension cargada en:', new Date(extensionStartTime).toLocaleTimeString());


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
    const messageTime = parseInt(msg.getAttribute('data-ts') || '0');
    if (messageTime > 0 && messageTime < extensionStartTime) {
      msg.dataset.processed = 'true'; // Marcar como procesado pero no guardar
      return;
    }

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

      // Inicializar historial del usuario
      if (!history[targetUsername]) {
        history[targetUsername] = [];
      }

      // Guardar mensaje
      history[targetUsername].push({
        type: isModelMessage ? 'model' : 'fan',
        message: messageText,
        timestamp: Date.now()
      });

      // Mantener últimos 20
      if (history[targetUsername].length > 20) {
        history[targetUsername].shift();
      }

      console.log(`💬 ${isPM ? 'PM' : 'Público'} - ${isModelMessage ? 'Modelo' : 'Fan'} (guardado en historial de: ${targetUsername}): ${messageText}`);
    }

    // ============================================
    // AGREGAR BOTÓN IA SOLO EN MENSAJES DE FANS
    // ============================================

    if (!isModelMessage && !isTip && messageText && !msg.querySelector('.ai-btn')) {
      addAIButton(msg, username, messageText, isPM, isPM ? 'pm' : 'public', tipAmount);
    }

    // ============================================
    // GUARDAR TIP
    // ============================================

    if (isTip && tipAmount > 0) {
      const history = isPM ? pmHistory : publicHistory;

      if (!history[username]) {
        history[username] = [];
      }

      history[username].push({
        type: 'tip',
        amount: tipAmount,
        timestamp: Date.now()
      });

      console.log(`💰 ${isPM ? 'PM' : 'Público'} - Tip de ${username}: ${tipAmount} tokens`);
    }
  });

}, 2000);

// ============================================
// FUNCIÓN PARA AGREGAR BOTÓN IA
// ============================================
function addAIButton(container, username, messageText, isPM, context, tipAmount) {
  const btn = document.createElement('button');
  btn.textContent = 'IA';
  btn.className = 'ai-btn';
  btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 6px;margin-left:5px;cursor:pointer;border-radius:3px;font-size:10px';

  btn.onclick = async () => {
    // Obtener historial correcto según contexto
    const history = context === 'pm' ? pmHistory : publicHistory;
    const userHistory = history[username] || [];

    console.log(`🔵 IA para ${isPM ? 'PM' : 'público'} - Usuario: ${username}`);
    console.log('📚 Historial del usuario (últimos 10):', userHistory.slice(-10));

    btn.textContent = '...';

    const getResponse = async () => {
      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          username,
          message: messageText,
          context: userHistory.slice(-10), // Solo últimos 10 del usuario
          isPM,
          tip: tipAmount
        })
      });
      return response.json();
    };

    try {
      const data = await getResponse();
      console.log('🟢 Respuesta:', data.suggestion);

      // Crear popup
      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:450px';

      const title = document.createElement('h3');
      title.style.marginTop = '0';
      title.textContent = `💬 ${isPM ? 'PM' : 'Público'} - @${username}`;

      const responseText = document.createElement('p');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:10px;border-radius:3px;max-height:200px;overflow-y:auto;word-wrap:break-word';
      responseText.textContent = data.suggestion;

      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 Copiar';
      copyBtn.style.cssText = 'background:green;color:white;padding:5px 10px;border:none;cursor:pointer;border-radius:3px;font-size:12px';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(responseText.textContent);
        copyBtn.textContent = '✓ Copiado!';
        setTimeout(() => popup.remove(), 500);
      };

      const regenBtn = document.createElement('button');
      regenBtn.textContent = '🔄 Regenerar';
      regenBtn.style.cssText = 'margin-left:5px;padding:5px 10px;cursor:pointer;border-radius:3px;font-size:12px';
      regenBtn.onclick = async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '...';
        try {
          const newData = await getResponse();
          responseText.textContent = newData.suggestion;
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
      popup.appendChild(copyBtn);
      popup.appendChild(regenBtn);
      popup.appendChild(closeBtn);

      const oldPopup = document.getElementById('ai-popup');
      if (oldPopup) oldPopup.remove();

      document.body.appendChild(popup);

      btn.textContent = '✓';
      setTimeout(() => btn.textContent = 'IA', 2000);

    } catch (error) {
      console.error('Error:', error);
      btn.textContent = '!';
      setTimeout(() => btn.textContent = 'IA', 2000);
    }
  };

  container.appendChild(btn);
}