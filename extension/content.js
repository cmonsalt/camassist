console.log("CamAssist loaded!");

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.classList?.contains('chat-message') && 
          !node.querySelector('.roomNotice')) {
        
        const msgText = node.querySelector('.msg-text');
        if (msgText && !node.querySelector('.ai-btn')) {
          // Crear contenedor para botón
          const btnContainer = document.createElement('span');
          btnContainer.className = 'ai-btn';
          btnContainer.innerHTML = ' <button style="background:#4CAF50;color:white;border:none;padding:1px 4px;border-radius:3px;cursor:pointer;font-size:11px">IA</button>';
          btnContainer.onclick = () => handleAI(msgText.textContent);
          
          // Insertar DESPUÉS del mensaje
          msgText.parentNode.insertBefore(btnContainer, msgText.nextSibling);
          console.log('✅ Botón agregado');
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
  console.log('🤖 IA para:', message);
}