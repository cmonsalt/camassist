console.log("CamAssist loaded!");

setInterval(() => {
  const allMessages = document.querySelectorAll('div[data-nick]');
  
  allMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn')) {
      const username = msg.dataset.nick;
      const text = msg.textContent.replace('IA', '').trim();
      
      const btn = document.createElement('button');
      btn.textContent = 'IA';
      btn.className = 'ai-btn';
      btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 6px;margin-left:5px;cursor:pointer;border-radius:3px';
      
      btn.onclick = async () => {
        console.log('🔵 Click en IA para:', username);
        btn.textContent = '...';
        
        try {
          const response = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, message: text})
          });
          
          const data = await response.json();
          console.log('🟢 Respuesta:', data.suggestion);
          
          // Buscar el input contenteditable
          const input = document.querySelector('.chat-input-field[contenteditable="true"]');
          
          if (input) {
            // Limpiar y llenar
            input.innerHTML = '';
            input.textContent = data.suggestion;
            
            // Forzar eventos para que Chaturbate lo reconozca
            input.dispatchEvent(new Event('focus'));
            input.dispatchEvent(new KeyboardEvent('keydown', {key: 'a'}));
            input.dispatchEvent(new Event('input', {bubbles: true}));
            
            btn.textContent = '✓';
            console.log('✅ Texto insertado');
          } else {
            console.log('❌ No encontré input');
          }
        } catch(error) {
          console.error('🔴 Error:', error);
        }
      };
      
      msg.appendChild(btn);
    }
  });
}, 2000);