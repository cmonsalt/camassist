console.log("CamAssist loaded!");

// Observar chat
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1) {
        console.log('Nuevo nodo:', node.className);
      }
    });
  });
});

// Buscar chat
setTimeout(() => {
  const chat = document.querySelector('[class*="chat"], [class*="message"], #chat');
  if (chat) {
    observer.observe(chat, { childList: true, subtree: true });
    console.log('Observando:', chat.className);
  } else {
    console.log('Chat no encontrado');
  }
}, 3000);