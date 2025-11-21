console.log("CamAssist loaded!");

// Función global para regenerar
window.regenerateResponse = async function(username, message) {
  const responseEl = document.getElementById('ai-response');
  const btnEl = event.target;
  
  btnEl.disabled = true;
  btnEl.textContent = '...';
  
  try {
    const response = await fetch('https://camassist.vercel.app/api/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, message})
    });
    
    const data = await response.json();
    responseEl.textContent = data.suggestion;
  } catch(error) {
    console.error('Error regenerando:', error);
  }
  
  btnEl.disabled = false;
  btnEl.textContent = '🔄 Regenerar';
};

setInterval(() => {
  const allMessages = document.querySelectorAll('div[data-nick]');

  allMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn')) {
      const username = msg.dataset.nick;

      // Buscar el mensaje real
      const spans = msg.querySelectorAll('span');
      let messageText = '';

      spans.forEach((span) => {
        const content = span.textContent.trim();
        if (content && content !== username && content.length > messageText.length) {
          messageText = content;
        }
      });

      // Limpiar @mentions
      messageText = messageText.replace(/@\S+\s?/g, '').trim();

      const btn = document.createElement('button');
      btn.textContent = 'IA';
      btn.className = 'ai-btn';
      btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 6px;margin-left:5px;cursor:pointer;border-radius:3px';

      btn.onclick = async () => {
        console.log('🔵 IA para:', messageText);
        btn.textContent = '...';

        try {
          const response = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, message: messageText})
          });

          const data = await response.json();
          console.log('🟢 Respuesta:', data.suggestion);

          const popup = document.createElement('div');
          popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1)';
          popup.innerHTML = `
            <h3 style="margin-top:0">Respuesta IA:</h3>
            <p id="ai-response" style="background:#f0f0f0;padding:10px;border-radius:3px">${data.suggestion}</p>
            <button onclick="
              navigator.clipboard.writeText(document.getElementById('ai-response').textContent);
              this.textContent='✓ Copiado!';
              setTimeout(() => this.parentElement.remove(), 500);
            " style="background:green;color:white;padding:5px 10px;border:none;cursor:pointer;border-radius:3px">📋 Copiar</button>
            
            <button onclick="regenerateResponse('${username}', '${messageText}')" style="margin-left:5px;padding:5px 10px;cursor:pointer;border-radius:3px">🔄 Regenerar</button>
            
            <button onclick="this.parentElement.remove()" style="margin-left:10px;padding:5px 10px;cursor:pointer">❌ Cerrar</button>
          `;
          document.body.appendChild(popup);

          btn.textContent = '✓';
          setTimeout(() => btn.textContent = 'IA', 2000);

        } catch (error) {
          console.error('Error:', error);
          btn.textContent = '!';
        }
      };

      msg.appendChild(btn);
    }
  });
}, 2000);