export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const { email, password } = req.body;
    
    // Hardcoded por ahora, después Supabase
    const studios = {
        'emma@studio.com': {
            password: 'emma123',
            studioName: "Emma's Studio",
            studioId: 'studio_001',
            model_token: 'mdl_test_001'
        }
    };
    
    const studio = studios[email];
    
    if (studio && studio.password === password) {
        const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
        
        return res.json({
            success: true,
            token: studio.model_token, 
            studioName: studio.studioName,
            studioId: studio.studioId
        });
    }
    
    return res.json({
        success: false,
        message: 'Invalid credentials'
    });
}