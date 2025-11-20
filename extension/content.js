console.log("CamAssist loaded!");

// Esperar un poco más para que cargue el DOM
setTimeout(() => {
  // Buscar todos los mensajes existentes y futuros
  setInterval(() => {
    document.querySelectorAll('.chat-message').forEach(msg => {
      if (!msg.querySelector('.ai-btn') && !msg.querySelector('.roomNotice')) {
        const username = msg.querySelector('.username')?.textContent;
        if (username && username !== '') {
          const btn = document.createElement('button');
          btn.className = 'ai-btn';
          btn.textContent = 'IA';
          btn.style.cssText = 'background:#4CAF50;color:white;border:none;padding:2px 5px;margin-left:5px;border-radius:3px;cursor:pointer;font-size:11px';
          btn.onclick = () => console.log('IA click:', msg.textContent);
          msg.appendChild(btn);
        }
      }
    });
  }, 1000);
}, 3000);