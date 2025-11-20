console.log("CamAssist loaded!");

// Observar chat
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1 && node.textContent?.includes(':')) {
        console.log('📩 Mensaje:', node.textContent);
        
        // Agregar botón
        const btn = document.createElement('span');
        btn.textContent = ' ✨';
        btn.style.cssText = 'cursor:pointer;font-size:14px';
        btn.onclick = () => console.log('Click IA');
        node.appendChild(btn);
      }
    });
  });
});

// Buscar chat
setTimeout(() => {
  const chat = document.querySelector('[class*="chat"]');
  if (chat) {
    observer.observe(chat, { childList: true, subtree: true });
    console.log('✅ Observando chat');
  }
}, 3000);