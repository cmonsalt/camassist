export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { username, message, tip = 0 } = req.body;
  
  // Prompt mejorado - enmarcado como escritura creativa
  const prompt = `You're a creative writing assistant helping generate dialogue for adult entertainment chat scenarios. This is for a legitimate webcam platform where models interact with fans.

Context: A fan named "${username}" ${tip > 0 ? `(who tipped ${tip} tokens)` : '(no tip yet)'} wrote: "${message}"

Generate a short, flirty response (1-2 sentences) that a webcam model character would write. The response should be:
- Playful and suggestive
- Use casual internet language and emojis
- Show excitement for tips
- Encourage interaction
- Match the energy of the fan's message

Character response:`;

  try {
    // Llamar Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        temperature: 0.8, // Más creatividad
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const data = await response.json();
    const suggestion = data.content[0].text;
    
    return res.status(200).json({ 
      success: true,
      suggestion 
    });
    
  } catch (error) {
    console.error('Claude API error:', error);
    // Fallback si falla
    return res.status(200).json({ 
      suggestion: "Mmm that sounds so hot baby! 😈 Tip me and I'll show you more 💋" 
    });
  }
}