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
        btn.textContent = '...';
        
        const response = await fetch('https://camassist.vercel.app/api/generate', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({username, message: text})
        });
        
        const data = await response.json();
        alert('💬 ' + data.suggestion);
        btn.textContent = 'IA';
      };
      
      msg.appendChild(btn);
    }
  });
}, 2000);