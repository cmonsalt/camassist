console.log("CamAssist loaded!");

// Cada 2 segundos buscar mensajes
setInterval(() => {
  // Buscar TODOS los elementos que tengan texto
  document.querySelectorAll('.chat-list span').forEach(element => {
    const text = element.textContent;
    // Si tiene texto y NO tiene botón ya
    if (text && text.includes('Wow que culote') && !element.querySelector('.ai-btn')) {
      console.log('💚 ENCONTRADO:', text);
      
      const btn = document.createElement('button');
      btn.className = 'ai-btn';
      btn.textContent = 'IA';
      btn.style.cssText = 'background:red;color:white;padding:2px 5px;margin:0 5px';
      element.appendChild(btn);
    }
  });
}, 2000);