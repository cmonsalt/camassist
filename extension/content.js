console.log("CamAssist loaded!");

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      // Detectar mensajes de usuarios (no notices)
      if (node.classList?.contains('chat-message') && 
          !node.querySelector('.roomNotice')) {
        
        const text = node.querySelector('.msg-text')?.textContent;
        if (text) {
          console.log('📩', text);
          
          // Agregar botón IA
          const btn = document.createElement('button');
          btn.textContent = '✨';
          btn.style.cssText = 'margin-left:5px;padding:2px 5px;cursor:pointer';
          btn.onclick = () => handleAI(text);
          node.querySelector('.msg-text')?.appendChild(btn);
        }
      }
    });
  });
});

setTimeout(() => {
  const chat = document.querySelector('.chat-list');
  if (chat) {
    observer.observe(chat, { childList: true, subtree: true });
    console.log('✅ Observando chat');
  }
}, 3000);

function handleAI(message) {
  console.log('IA para:', message);
  // Aquí llamaremos API
}