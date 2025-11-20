console.log("CamAssist loaded!");

setInterval(() => {
  const allMessages = document.querySelectorAll('div[data-nick]');
  
  allMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn')) {
      const username = msg.dataset.nick;
      
      // DEBUG: Ver estructura completa
      console.log('🔍 Analizando mensaje de:', username);
      console.log('HTML completo:', msg.innerHTML);
      
      // Buscar todos los spans y ver su contenido
      const spans = msg.querySelectorAll('span');
      let messageText = '';
      
      spans.forEach((span, index) => {
        const content = span.textContent.trim();
        console.log(`  Span ${index}:`, content);
        
        // El mensaje real suele ser el span más largo sin el username
        if (content && content !== username && content.length > messageText.length) {
          messageText = content;
        }
      });
      
      console.log('✅ Mensaje detectado:', messageText);
      
      const btn = document.createElement('button');
      btn.textContent = 'IA';
      btn.className = 'ai-btn';
      btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 6px;margin-left:5px;cursor:pointer;border-radius:3px';
      
      btn.onclick = async () => {
        console.log('🔵 Click IA - Usuario:', username, 'Mensaje:', messageText);
        
        // Resto del código igual...
        btn.textContent = '...';
        
        try {
          const response = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, message: messageText})
          });
          
          const data = await response.json();
          
          const popup = document.createElement('div');
          popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px';
          popup.innerHTML = `
            <h3>Respuesta IA:</h3>
            <p style="background:#f0f0f0;padding:10px">${data.suggestion}</p>
            <button onclick="navigator.clipboard.writeText('${data.suggestion}');this.textContent='✓ Copiado!'" style="background:green;color:white;padding:5px 10px;border:none;cursor:pointer">📋 Copiar</button>
            <button onclick="this.parentElement.remove()" style="margin-left:10px;padding:5px 10px">❌ Cerrar</button>
          `;
          document.body.appendChild(popup);
          
          btn.textContent = '✓';
        } catch(error) {
          console.error('🔴 Error:', error);
        }
      };
      
      msg.appendChild(btn);
    }
  });
}, 2000);