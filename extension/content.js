console.log("CamAssist loaded!");

setInterval(() => {
  const allMessages = document.querySelectorAll('div[data-nick]');
  
  allMessages.forEach(msg => {
    if (!msg.querySelector('.ai-btn')) {
      const username = msg.dataset.nick;
      const msgSpan = msg.querySelector('span:not(.ai-btn)');
      const text = msgSpan ? msgSpan.textContent.trim() : msg.textContent.trim();
      
      const btn = document.createElement('button');
      btn.textContent = 'IA';
      btn.className = 'ai-btn';
      btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 6px;margin-left:5px;cursor:pointer;border-radius:3px';
      
      btn.onclick = async () => {
        console.log('🔵 Click IA - Usuario:', username, 'Mensaje:', text);
        btn.textContent = '...';
        
        try {
          const response = await fetch('https://camassist.vercel.app/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, message: text})
          });
          
          const data = await response.json();
          console.log('🟢 Respuesta:', data.suggestion);
          
          // INYECTAR SCRIPT EN LA PÁGINA
          const script = document.createElement('script');
          script.textContent = `
            const input = document.querySelector('.chat-input-field');
            if (input) {
              input.textContent = "${data.suggestion}";
              input.style.color = "black";
              input.focus();
              input.dispatchEvent(new Event('input', {bubbles: true}));
            }
          `;
          document.body.appendChild(script);
          script.remove();
          
          btn.textContent = '✓';
          console.log('✅ Script inyectado');
          
        } catch(error) {
          console.error('🔴 Error:', error);
        }
      };
      
      msg.appendChild(btn);
    }
  });
}, 2000);