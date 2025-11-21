console.log("CamAssist loaded!");

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

        // Función para obtener respuesta
        const getResponse = async () => {
          const response = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, message: messageText})
          });
          return response.json();
        };

        try {
          const data = await getResponse();
          console.log('🟢 Respuesta:', data.suggestion);

          const popup = document.createElement('div');
          popup.id = 'ai-popup';
          popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1)';
          
          // Crear contenido del popup
          const title = document.createElement('h3');
          title.style.marginTop = '0';
          title.textContent = 'Respuesta IA:';
          
          const responseText = document.createElement('p');
          responseText.id = 'ai-response';
          responseText.style.cssText = 'background:#f0f0f0;padding:10px;border-radius:3px';
          responseText.textContent = data.suggestion;
          
          // Botón copiar
          const copyBtn = document.createElement('button');
          copyBtn.textContent = '📋 Copiar';
          copyBtn.style.cssText = 'background:green;color:white;padding:5px 10px;border:none;cursor:pointer;border-radius:3px';
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(responseText.textContent);
            copyBtn.textContent = '✓ Copiado!';
            setTimeout(() => popup.remove(), 500);
          };
          
          // Botón regenerar
          const regenBtn = document.createElement('button');
          regenBtn.textContent = '🔄 Regenerar';
          regenBtn.style.cssText = 'margin-left:5px;padding:5px 10px;cursor:pointer;border-radius:3px';
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
          closeBtn.style.cssText = 'margin-left:10px;padding:5px 10px;cursor:pointer';
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

        } catch (error) {
          console.error('Error:', error);
          btn.textContent = '!';
        }
      };

      msg.appendChild(btn);
    }
  });
}, 2000);