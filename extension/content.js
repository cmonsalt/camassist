console.log("CamAssist loaded!");

// Test button (temporal)
setTimeout(() => {
  fetch('https://camassist.vercel.app/api/generate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: 'test'})
  })
  .then(r => r.json())
  .then(data => console.log('API:', data));
}, 2000);