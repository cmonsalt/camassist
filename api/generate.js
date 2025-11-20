export default function handler(req, res) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'POST') {
    return res.status(200).json({ message: 'Use POST' });
  }
  
  return res.status(200).json({ 
    suggestion: "Mmm yes baby, I love that idea 😈" 
  });
}