// CamAssist - Streamate Extension Popup

document.addEventListener('DOMContentLoaded', function() {
  const tokenInput = document.getElementById('token');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  const messageDiv = document.getElementById('message');

  // Cargar token guardado
  chrome.storage.sync.get(['modelToken'], function(result) {
    if (result.modelToken) {
      tokenInput.value = result.modelToken;
      updateStatus(true);
    }
  });

  // Guardar token
  saveBtn.addEventListener('click', function() {
    const token = tokenInput.value.trim();
    
    if (!token) {
      showMessage('Por favor ingresa un token válido', 'error');
      return;
    }

    if (!token.startsWith('mdl_')) {
      showMessage('El token debe comenzar con "mdl_"', 'error');
      return;
    }

    chrome.storage.sync.set({ modelToken: token }, function() {
      showMessage('Token guardado correctamente', 'success');
      updateStatus(true);
      
      // Notificar al content script
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0] && tabs[0].url.includes('streamatemodels.com')) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'tokenUpdated', token: token });
        }
      });
    });
  });

  // Guardar con Enter
  tokenInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });

  function updateStatus(connected) {
    statusDiv.className = 'status ' + (connected ? 'connected' : 'disconnected');
    statusDiv.querySelector('span').textContent = connected ? 'Conectado' : 'No conectado';
  }

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    
    setTimeout(function() {
      messageDiv.className = 'message';
    }, 3000);
  }
});
