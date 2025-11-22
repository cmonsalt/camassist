console.log("CamAssist loaded!");

// HISTORIALES SEPARADOS
let publicHistory = {};  // Por username en chat público
let pmHistory = {};      // Por username en PM

setInterval(() => {
  
  // ============================================
  // 1. CHAT PÚBLICO
  // ============================================
  const publicMessages = document.querySelectorAll('div[data-nick]');
  
  publicMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn') && !msg.dataset.processed) {
      msg.dataset.processed = 'true';
      
      const username = msg.dataset.nick;
      const spans = msg.querySelectorAll('span');
      let messageText = '';
      
      spans.forEach((span) => {
        const content = span.textContent.trim();
        if (content && content !== username && content.length > messageText.length) {
          messageText = content;
        }
      });
      
      messageText = messageText.replace(/@\S+\s?/g, '').trim();
      
      // Detectar si es tip/token
      const isTip = messageText.includes('tipped') || messageText.includes('tokens');
      let tipAmount = 0;
      if (isTip) {
        const match = messageText.match(/(\d+)\s*(tokens?|tips?)/i);
        if (match) tipAmount = parseInt(match[1]);
      }
      
      if (messageText && !isTip) {
        // Inicializar historial del usuario si no existe
        if (!publicHistory[username]) {
          publicHistory[username] = [];
        }
        
        // Guardar mensaje del fan
        publicHistory[username].push({
          type: 'fan',
          message: messageText,
          timestamp: Date.now()
        });
        
        // Mantener últimos 20 por usuario
        if (publicHistory[username].length > 20) {
          publicHistory[username].shift();
        }
        
        addAIButton(msg, username, messageText, false, 'public', tipAmount);
      }
      
      // Guardar tip sin agregar botón
      if (isTip && tipAmount > 0) {
        if (!publicHistory[username]) {
          publicHistory[username] = [];
        }
        publicHistory[username].push({
          type: 'tip',
          amount: tipAmount,
          timestamp: Date.now()
        });
      }
    }
  });
  
  // ============================================
  // 2. PM - MENSAJES DEL FAN
  // ============================================
  const pmFanMessages = document.querySelectorAll('[data-testid="received-message"]');
  
  pmFanMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn') && !msg.dataset.processed) {
      msg.dataset.processed = 'true';
      
      const textElement = msg.querySelector('[data-testid="message-contents"]');
      const messageText = textElement ? textElement.textContent.trim() : '';
      
      // Obtener username del PM (del título de la conversación)
      const pmTitle = document.querySelector('.private-message-header, [class*="conversation"]');
      const username = pmTitle ? pmTitle.textContent.match(/con\s+(\w+)/)?.[1] || 'fan_pm' : 'fan_pm';
      
      if (messageText && textElement) {
        // Inicializar historial PM del usuario si no existe
        if (!pmHistory[username]) {
          pmHistory[username] = [];
        }
        
        // Guardar mensaje del fan
        pmHistory[username].push({
          type: 'fan',
          message: messageText,
          timestamp: Date.now()
        });
        
        // Mantener últimos 20
        if (pmHistory[username].length > 20) {
          pmHistory[username].shift();
        }
        
        addAIButton(textElement, username, messageText, true, 'pm', 0);
      }
    }
  });
  
  // ============================================
  // 3. PM - MENSAJES DE LA MODELO (guardar para contexto)
  // ============================================
  const pmModelMessages = document.querySelectorAll('[data-testid="sent-message"]');
  
  pmModelMessages.forEach(msg => {
    if (!msg.dataset.processed) {
      msg.dataset.processed = 'true';
      
      const textElement = msg.querySelector('[data-testid="message-contents"]');
      const messageText = textElement ? textElement.textContent.trim() : '';
      
      // Obtener username del PM
      const pmTitle = document.querySelector('.private-message-header, [class*="conversation"]');
      const username = pmTitle ? pmTitle.textContent.match(/con\s+(\w+)/)?.[1] || 'fan_pm' : 'fan_pm';
      
      if (messageText) {
        if (!pmHistory[username]) {
          pmHistory[username] = [];
        }
        
        pmHistory[username].push({
          type: 'model',
          message: messageText,
          timestamp: Date.now()
        });
        
        if (pmHistory[username].length > 20) {
          pmHistory[username].shift();
        }
      }
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
    console.log('📚 Historial del usuario:', userHistory);
    
    btn.textContent = '...';
    
    const getResponse = async () => {
      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token',
          username,
          message: messageText,
          context: userHistory, // Historial solo de este usuario
          isPM,
          tip: tipAmount
        })
      });
      return response.json();
    };
    
    try {
      const data = await getResponse();
      console.log('🟢 Respuesta:', data.suggestion);
      
      // GUARDAR RESPUESTA EN HISTORIAL
      if (!history[username]) {
        history[username] = [];
      }
      history[username].push({
        type: 'model',
        message: data.suggestion,
        timestamp: Date.now()
      });
      if (history[username].length > 20) {
        history[username].shift();
      }
      
      // Crear popup
      const popup = document.createElement('div');
      popup.id = 'ai-popup';
      popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:450px';
      
      const title = document.createElement('h3');
      title.style.marginTop = '0';
      title.textContent = `💬 ${isPM ? 'PM' : 'Público'} - ${username}`;
      
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
          
          // Actualizar última respuesta en historial
          if (history[username].length > 0 && history[username][history[username].length - 1].type === 'model') {
            history[username][history[username].length - 1].message = newData.suggestion;
          }
        } catch(error) {
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
      
    } catch(error) {
      console.error('Error:', error);
      btn.textContent = '!';
      setTimeout(() => btn.textContent = 'IA', 2000);
    }
  };
  
  container.appendChild(btn);
}
