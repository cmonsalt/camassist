console.log("CamAssist loaded!");

// Historial de chat (contexto para IA)
let chatHistory = [];

setInterval(() => {
  
  // ============================================
  // 1. CHAT PÚBLICO (funciona para viewer y broadcaster)
  // ============================================
  const publicMessages = document.querySelectorAll('div[data-nick]');
  
  publicMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn') && !msg.dataset.processed) {
      msg.dataset.processed = 'true';
      
      const username = msg.dataset.nick;
      const spans = msg.querySelectorAll('span');
      let messageText = '';
      
      // Buscar el texto del mensaje
      spans.forEach((span) => {
        const content = span.textContent.trim();
        if (content && content !== username && content.length > messageText.length) {
          messageText = content;
        }
      });
      
      // Limpiar @mentions
      messageText = messageText.replace(/@\S+\s?/g, '').trim();
      
      if (messageText) {
        // Guardar en historial
        chatHistory.push({
          type: 'fan',
          username,
          message: messageText,
          timestamp: Date.now()
        });
        
        if (chatHistory.length > 20) chatHistory.shift();
        
        // Agregar botón IA
        addAIButton(msg, username, messageText, false);
      }
    }
  });
  
  // ============================================
  // 2. PM - MENSAJES DEL FAN (broadcaster view)
  // ============================================
  const pmFanMessages = document.querySelectorAll('[data-testid="received-message"]');
  
  pmFanMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn') && !msg.dataset.processed) {
      msg.dataset.processed = 'true';
      
      const textElement = msg.querySelector('[data-testid="message-contents"]');
      const messageText = textElement ? textElement.textContent.trim() : '';
      
      if (messageText && textElement) {
        // Guardar en historial
        chatHistory.push({
          type: 'fan',
          username: 'fan_pm',
          message: messageText,
          timestamp: Date.now()
        });
        
        if (chatHistory.length > 20) chatHistory.shift();
        
        // Agregar botón IA
        addAIButton(textElement, 'fan_pm', messageText, true);
      }
    }
  });
  
  // ============================================
  // 3. PM - MENSAJES DE LA MODELO (solo guardar para contexto)
  // ============================================
  const pmModelMessages = document.querySelectorAll('[data-testid="sent-message"]');
  
  pmModelMessages.forEach(msg => {
    if (!msg.dataset.processed) {
      msg.dataset.processed = 'true';
      
      const textElement = msg.querySelector('[data-testid="message-contents"]');
      const messageText = textElement ? textElement.textContent.trim() : '';
      
      if (messageText) {
        chatHistory.push({
          type: 'model',
          message: messageText,
          timestamp: Date.now()
        });
        
        if (chatHistory.length > 20) chatHistory.shift();
      }
    }
  });
  
}, 2000);

// ============================================
// FUNCIÓN PARA AGREGAR BOTÓN IA
// ============================================
function addAIButton(container, username, messageText, isPM) {
  const btn = document.createElement('button');
  btn.textContent = 'IA';
  btn.className = 'ai-btn';
  btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 6px;margin-left:5px;cursor:pointer;border-radius:3px;font-size:10px';
  
  btn.onclick = async () => {
    console.log(`🔵 IA para ${isPM ? 'PM' : 'chat público'}:`, messageText);
    console.log('📚 Contexto (últimos 10):', chatHistory.slice(-10));
    btn.textContent = '...';
    
    // Función para llamar API
    const getResponse = async () => {
      const response = await fetch('https://camassist.vercel.app/api/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          token: localStorage.getItem('model_token') || 'demo_token', // ← AGREGADO
          username,
          message: messageText,
          context: chatHistory.slice(-10),
          isPM
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
      title.textContent = isPM ? '💬 Respuesta IA (PM)' : '💬 Respuesta IA (Público)';
      
      const responseText = document.createElement('p');
      responseText.id = 'ai-response';
      responseText.style.cssText = 'background:#f0f0f0;padding:10px;border-radius:3px;max-height:200px;overflow-y:auto;word-wrap:break-word';
      responseText.textContent = data.suggestion;
      
      // Botón copiar
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 Copiar';
      copyBtn.style.cssText = 'background:green;color:white;padding:5px 10px;border:none;cursor:pointer;border-radius:3px;font-size:12px';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(responseText.textContent);
        copyBtn.textContent = '✓ Copiado!';
        setTimeout(() => popup.remove(), 500);
      };
      
      // Botón regenerar
      const regenBtn = document.createElement('button');
      regenBtn.textContent = '🔄 Regenerar';
      regenBtn.style.cssText = 'margin-left:5px;padding:5px 10px;cursor:pointer;border-radius:3px;font-size:12px';
      regenBtn.onclick = async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '...';
        try {
          const newData = await getResponse();
          responseText.textContent = newData.suggestion;
        } catch(error) {
          console.error('Error regenerando:', error);
        }
        regenBtn.disabled = false;
        regenBtn.textContent = '🔄 Regenerar';
      };
      
      // Botón cerrar
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '❌ Cerrar';
      closeBtn.style.cssText = 'margin-left:10px;padding:5px 10px;cursor:pointer;font-size:12px';
      closeBtn.onclick = () => popup.remove();
      
      // Agregar todo al popup
      popup.appendChild(title);
      popup.appendChild(responseText);
      popup.appendChild(copyBtn);
      popup.appendChild(regenBtn);
      popup.appendChild(closeBtn);
      
      // Remover popup anterior si existe
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