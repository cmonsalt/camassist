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
        console.log('🔵 Click en IA');
        btn.textContent = '...';
        
        try {
          const response = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, message: text})
          });
          
          const data = await response.json();
          console.log('🟢 Respuesta:', data.suggestion);
          
          // Buscar input
          const input = document.querySelector('input[type="text"]');
          console.log('🟡 Input encontrado?', !!input);
          
          if (input) {
            input.value = data.suggestion;
            input.focus();
            btn.textContent = '✓';
            
            // Buscar botón ENVIAR
            const sendBtn = document.querySelector('button[data-testid="send_message_button"], button.send-button, button:has-text("ENVIAR")');
            console.log('🔴 Botón enviar encontrado?', !!sendBtn);
            
            if (sendBtn) {
              setTimeout(() => sendBtn.click(), 1000);
            }
          } else {
            // Probar otro selector
            const input2 = document.querySelector('textarea, input[placeholder*="Enviar"]');
            console.log('🟣 Input alternativo?', !!input2);
            if (input2) {
              input2.value = data.suggestion;
            }
          }
        } catch(error) {
          console.error('🔴 Error:', error);
        }
      };
      
      msg.appendChild(btn);
    }
  });
}, 2000);