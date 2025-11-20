export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { username, message, tip = 0 } = req.body;
  
  // Construir prompt para Claude
  const prompt = `You are a flirty webcam model assistant. Help respond to this fan message.
  
Fan: ${username} ${tip > 0 ? `(tipped ${tip} tokens)` : '(no tip)'}
Message: "${message}"

Respond in 1-2 sentences. Be flirty and engaging. If they tipped well, be extra enthusiastic.
${tip > 100 ? 'This is a big tipper, show appreciation!' : ''}
${tip === 0 ? 'Encourage them to tip.' : ''}`;

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
      suggestion: "Mmm sounds amazing baby! 😈" 
    });
  }
}