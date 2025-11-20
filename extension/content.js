console.log("CamAssist loaded!");

// Observar chat
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      // Buscar mensajes nuevos
      if (node.nodeType === 1 && node.classList?.contains('message')) {
        console.log('Nuevo mensaje:', node.textContent);
        
        // Agregar botón IA
        const btn = document.createElement('button');
        btn.textContent = '✨';
        btn.style.cssText = 'margin-left:5px;cursor:pointer';
        btn.onclick = () => handleAI(node);
        node.appendChild(btn);
      }
    });
  });
});

// Iniciar observador
setTimeout(() => {
  const chatElement = document.querySelector('.chat-list, .message-list, #chat');
  if (chatElement) {
    observer.observe(chatElement, { childList: true, subtree: true });
    console.log('Observando chat...');
  } else {
    console.log('Chat no encontrado');
  }
}, 2000);

function handleAI(messageNode) {
  console.log('Click IA:', messageNode.textContent);
}