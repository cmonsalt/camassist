export default function handler(req, res) {
  // CORS completo
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(200).json({ message: 'Use POST' });
  }
  
  return res.status(200).json({ 
    suggestion: "Mmm yes baby, I love that idea 😈" 
  });
}