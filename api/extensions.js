import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { studio_id, action, platform } = req.method === 'GET' ? req.query : req.body;

  // Verificar autenticación
  if (!studio_id) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }

  // Verificar que el studio existe
  const { data: studio, error: studioError } = await supabase
    .from('studios')
    .select('id, name, extension_platforms')
    .eq('id', studio_id)
    .single();

  if (studioError || !studio) {
    return res.status(401).json({ success: false, message: 'Studio no encontrado' });
  }

  // LISTAR extensiones disponibles para este studio
  if (action === 'list' || req.method === 'GET') {
    try {
      const allowedPlatforms = studio.extension_platforms || [];

      // Obtener versiones de las plataformas permitidas
      let query = supabase
        .from('extension_versions')
        .select('*')
        .eq('is_latest', true)
        .order('platform');

      // Si tiene plataformas asignadas, filtrar
      if (allowedPlatforms.length > 0) {
        query = query.in('platform', allowedPlatforms);
      }

      const { data: versions, error } = await query;

      if (error) throw error;

      // Obtener alertas activas
      const { data: alerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('is_active', true)
        .or(`target.eq.all,target.eq.studios,target.eq.${studio_id}`)
        .order('created_at', { ascending: false });

      // Filtrar alertas expiradas
      const now = new Date();
      const activeAlerts = (alerts || []).filter(alert => {
        if (!alert.expires_at) return true;
        return new Date(alert.expires_at) > now;
      });

      return res.json({
        success: true,
        extensions: versions || [],
        alerts: activeAlerts,
        allowed_platforms: allowedPlatforms
      });

    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // DESCARGAR extensión
  if (action === 'download') {
    try {
      const allowedPlatforms = studio.extension_platforms || [];

      // Verificar que tiene acceso a esta plataforma
      if (allowedPlatforms.length > 0 && !allowedPlatforms.includes(platform)) {
        return res.status(403).json({ 
          success: false, 
          message: 'No tienes acceso a esta extensión' 
        });
      }

      // Obtener la versión más reciente de la plataforma
      const { data: version, error: versionError } = await supabase
        .from('extension_versions')
        .select('*')
        .eq('platform', platform)
        .eq('is_latest', true)
        .single();

      if (versionError || !version) {
        return res.status(404).json({ 
          success: false, 
          message: 'Extensión no encontrada' 
        });
      }

      // Generar URL firmada (expira en 5 minutos)
      const filePath = `${platform}/${version.filename}`;
      const { data: signedUrl, error: signError } = await supabase
        .storage
        .from('extensions')
        .createSignedUrl(filePath, 300); // 300 segundos = 5 minutos

      if (signError) {
        console.error('Error generando URL:', signError);
        return res.status(500).json({ 
          success: false, 
          message: 'Error generando enlace de descarga' 
        });
      }

      // Opcional: registrar la descarga
      await supabase
        .from('extension_downloads')
        .insert({
          studio_id: studio_id,
          platform: platform,
          version: version.version
        })
        .select();

      return res.json({
        success: true,
        download_url: signedUrl.signedUrl,
        version: version.version,
        filename: version.filename
      });

    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  return res.status(400).json({ success: false, message: 'Acción no válida' });
}
