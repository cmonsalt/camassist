// ============================================
// BACKGROUND SERVICE WORKER - EARNINGS SYNC
// ============================================

// Crear alarma cada 15 minutos
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('syncEarnings', { periodInMinutes: 15 });
  console.log('⏰ Alarma de sync creada (cada 15 min)');
});

// Escuchar la alarma
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncEarnings') {
    console.log('⏰ Ejecutando sync de earnings...');
    await triggerEarningsSync();
  }
});

// Función para abrir pestaña y sincronizar
async function triggerEarningsSync() {
  // Obtener token guardado
  const result = await chrome.storage.local.get(['model_token', 'broadcaster_username']);
  const token = result.model_token;
  const username = result.broadcaster_username;
  
  if (!token || !username) {
    console.log('❌ No hay token o username guardado');
    return;
  }
  
  // Verificar si tiene plan pro
  try {
    const checkResponse = await fetch('https://camassist.vercel.app/api/check-features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    
    const features = await checkResponse.json();
    if (!features.analytics) {
      console.log('❌ Studio no tiene plan pro');
      return;
    }
  } catch (e) {
    console.error('Error checking features:', e);
    return;
  }
  
  // Abrir pestaña de tokens en background
  const url = `https://chaturbate.com/p/${username}/?tab=tokens`;
  
  const tab = await chrome.tabs.create({ 
    url, 
    active: false // Pestaña en background
  });
  
  console.log('📊 Pestaña de tokens abierta:', tab.id);
  
  // Esperar a que cargue y cerrar después de 10 segundos
  setTimeout(async () => {
    try {
      await chrome.tabs.remove(tab.id);
      console.log('📊 Pestaña cerrada');
    } catch (e) {
      // Tab ya cerrada
    }
  }, 10000);
}

// Guardar broadcaster_username cuando se detecte
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_BROADCASTER') {
    chrome.storage.local.set({ broadcaster_username: message.username });
    console.log('👤 Broadcaster guardado:', message.username);
  }
});