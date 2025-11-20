// api/generate.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { username, message, tip = 0 } = req.body;
  
  // Prompt para contenido explícito
  const systemPrompt = `You are a flirty webcam model responding to fans. Be sexually suggestive, playful, and explicit when appropriate. Use emojis and casual language. Keep responses under 50 words.`;
  
  const userPrompt = `Fan "${username}" ${tip > 0 ? `(tipped ${tip} tokens)` : '(no tip)'} says: "${message}"`;

  try {
    // Llamar xAI/Grok API
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9,
        max_tokens: 50
      })
    });

    const data = await response.json();
    const suggestion = data.choices[0].message.content;
    
    return res.status(200).json({ 
      success: true,
      suggestion 
    });
    
  } catch (error) {
    console.error('Grok API error:', error);
    return res.status(200).json({ 
      suggestion: "Mmm that sounds so hot baby! 😈 Show me more 💋" 
    });
  }
}