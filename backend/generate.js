export default async function handler(req, res) {
  const { message, tip, username } = req.body;
  
  // Por ahora mock response
  res.json({ 
    suggestion: "Mmm yes baby, I love that idea 😈" 
  });
}