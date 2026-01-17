// ============================================
// CAMASSIST TIME WIDGET - v1.0
// ============================================
(function() {
  // Evitar cargar dos veces
  if (document.getElementById('camassist-time-btn')) return;

  const WIDGET_URL = 'https://camassist.vercel.app/time-widget.html';

  function createTimeWidget() {
    const token = localStorage.getItem('model_token') || '';

    // Botón flotante
    const timeBtn = document.createElement('button');
    timeBtn.id = 'camassist-time-btn';
    timeBtn.innerHTML = '⏰';
    timeBtn.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #8b5cf6;
      color: white;
      border: none;
      font-size: 24px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(139,92,246,0.4);
      transition: transform 0.2s;
    `;

    timeBtn.onmouseover = () => timeBtn.style.transform = 'scale(1.1)';
    timeBtn.onmouseout = () => timeBtn.style.transform = 'scale(1)';

    // Popup/iframe
    const popup = document.createElement('div');
    popup.id = 'camassist-time-popup';
    popup.style.cssText = `
      display: none;
      position: fixed;
      bottom: 140px;
      right: 20px;
      width: 300px;
      height: 420px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 9999;
    `;

    popup.innerHTML = `
      <iframe 
        src="${WIDGET_URL}?token=${token}" 
        style="width:100%;height:100%;border:none;">
      </iframe>
    `;

    // Toggle popup
    timeBtn.onclick = (e) => {
      e.stopPropagation();
      popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    };

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== timeBtn) {
        popup.style.display = 'none';
      }
    });

    document.body.appendChild(timeBtn);
    document.body.appendChild(popup);

    console.log('⏰ CamAssist Time Widget cargado');
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createTimeWidget);
  } else {
    createTimeWidget();
  }
})();