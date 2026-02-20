document.addEventListener('DOMContentLoaded', async () => {
  const tokenInput = document.getElementById('token');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const modelName = document.getElementById('modelName');
  const updateBanner = document.getElementById('updateBanner');

  // Versión actual de la extensión
  const manifest = chrome.runtime.getManifest();
  const currentVersion = manifest.version;
  const platform = document.getElementById('platformId')?.value || 'unknown';

  // Mostrar versión actual
  const versionEl = document.getElementById('currentVersion');
  if (versionEl) versionEl.textContent = `v${currentVersion}`;

  // Cargar token guardado
  chrome.storage.local.get(['model_token', 'model_name'], (result) => {
    if (result.model_token) {
      tokenInput.value = result.model_token;
      if (result.model_name) {
        showConnected(result.model_name);
      } else {
        verifyToken(result.model_token);
      }
    }
  });

  // Check versión
  checkForUpdate(platform, currentVersion);

  // Guardar token
  saveBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    
    if (!token) {
      alert('Por favor ingresa tu token');
      return;
    }

    saveBtn.textContent = '⏳ Verificando...';
    saveBtn.disabled = true;

    const verified = await verifyToken(token);
    
    if (verified) {
      chrome.storage.local.set({ model_token: token });
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (tk) => localStorage.setItem('model_token', tk),
            args: [token]
          });
        }
      });
      
      alert('✅ Token guardado! Recarga la página.');
    }

    saveBtn.textContent = '💾 Guardar Token';
    saveBtn.disabled = false;
  });

  async function verifyToken(token) {
    try {
      const response = await fetch('https://camassist.vercel.app/api/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showConnected(data.model_name);
        chrome.storage.local.set({ model_name: data.model_name });
        return true;
      } else {
        showDisconnected('Token inválido');
        return false;
      }
    } catch (error) {
      showDisconnected('Error de conexión');
      return false;
    }
  }

  async function checkForUpdate(platform, currentVersion) {
    try {
      const response = await fetch(`https://www.camassist.co/api/check-version?platform=${platform}&version=${currentVersion}`);
      const data = await response.json();
      
      if (data.update_available && updateBanner) {
        updateBanner.style.display = 'block';
        const link = updateBanner.querySelector('a');
        if (link && data.download_url) {
          link.href = data.download_url;
        }
        // Mostrar changelog si existe
        if (data.changelog) {
          const changelogEl = updateBanner.querySelector('.changelog');
          if (changelogEl) changelogEl.textContent = data.changelog;
        }
      }
    } catch (e) {
      // Silently fail
    }
  }

  function showConnected(name) {
    status.className = 'status connected';
    status.textContent = '✅ Conectado';
    modelName.textContent = `Modelo: ${name}`;
  }

  function showDisconnected(msg) {
    status.className = 'status disconnected';
    status.textContent = `⚠️ ${msg}`;
    modelName.textContent = '';
  }
});
