console.log("CamAssist loaded!");

// Debug: ver TODA la estructura
setInterval(() => {
  const allMessages = document.querySelectorAll('div[data-nick]');
  if (allMessages.length > 0) {
    console.log('✅ Encontré mensajes:', allMessages.length);
    
    allMessages.forEach(msg => {
      if (!msg.querySelector('.ai-btn')) {
        const btn = document.createElement('button');
        btn.textContent = 'IA';
        btn.className = 'ai-btn';
        btn.style.cssText = 'background:red;color:white;padding:2px 5px';
        msg.appendChild(btn);
      }
    });
  }
}, 2000);