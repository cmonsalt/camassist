console.log("CamAssist loaded!");

setInterval(() => {
  const allMessages = document.querySelectorAll('div[data-nick]');
  
  allMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn')) {
      const username = msg.dataset.nick;
      // FIX: Buscar el texto real del mensaje
      const textElement = msg.querySelector('span[data-nick]') || msg.querySelector('span');
      const text = textElement ? textElement.textContent : msg.innerText.replace('IA', '').trim();
      
      const btn = document.createElement('button');
      btn.textContent = 'IA';
      btn.className = 'ai-btn';
      btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 6px;margin-left:5px;cursor:pointer;border-radius:3px';
      
      btn.onclick = async () => {
        console.log('🔵 Mensaje capturado:', text);
        btn.textContent = '...';
        
        try {
          const response = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, message: text})
          });
          
          const data = await response.json();
          
          // Por ahora mostrar en popup para copiar/pegar
          const popup = document.createElement('div');
          popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid green;z-index:9999;border-radius:5px';
          popup.innerHTML = `
            <h3>Respuesta IA:</h3>
            <p id="ai-text" style="background:#f0f0f0;padding:10px">${data.suggestion}</p>
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