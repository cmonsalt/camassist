// Temporal storage (después Supabase)
const studioSettings = {};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({error: 'No token'});
    }
    
    // Decode token to get studio email
    const email = Buffer.from(token, 'base64').toString().split(':')[0];
    
    if (req.method === 'GET') {
        // Return saved settings or defaults
        const settings = studioSettings[email] || {
            adaptiveMode: true,
            explicitLevel: 2,
            emojiLevel: 2
        };
        
        return res.json({success: true, settings});
    }
    
    if (req.method === 'POST') {
        // Save settings
        const { settings } = req.body;
        studioSettings[email] = settings;
        
        return res.json({success: true});
    }
}