// ============================================
// BACKGROUND SERVICE WORKER - StripChat
// ============================================

console.log('🟣 CamAssist StripChat Background iniciado');

// Crear alarma para sync cada 30 minutos
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('syncEarnings', { periodInMinutes: 30 });
  console.log('⏰ Alarma de sync creada (cada 30 min)');
});

// Manejar la alarma
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncEarnings') {
    console.log('⏰ Ejecutando sync automático...');
    
    // Obtener token guardado
    const result = await chrome.storage.local.get(['model_token']);
    if (!result.model_token) {
      console.log('❌ No hay token guardado');
      return;
    }

    // Abrir pestaña de earnings en segundo plano
    const tab = await chrome.tabs.create({
      url: 'https://stripchat.com/earnings/tokens-history',
      active: false
    });

    console.log('📊 Pestaña de earnings abierta:', tab.id);

    // Cerrar después de 30 segundos
    setTimeout(async () => {
      try {
        await chrome.tabs.remove(tab.id);
        console.log('📊 Pestaña cerrada');
      } catch (e) {
        // Tab ya cerrada
      }
    }, 30000);
  }
});

// Escuchar mensajes del content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_COMPLETE') {
    console.log('✅ Sync completado:', message.result);
  }
});