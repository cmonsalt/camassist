import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { platform, version } = req.query;

  if (!platform || !version) {
    return res.status(400).json({ error: 'platform y version requeridos' });
  }

  try {
    // Buscar última versión de la plataforma en BD
    const { data: latest, error } = await supabase
      .from('extension_versions')
      .select('*')
      .eq('platform', platform)
      .eq('is_latest', true)
      .single();

    if (error || !latest) {
      return res.status(200).json({
        platform,
        current_version: version,
        latest_version: version,
        update_available: false
      });
    }

    const updateAvailable = compareVersions(version, latest.version) < 0;

    let download_url = null;
    if (updateAvailable) {
      // Generar URL firmada de Supabase Storage (expira en 10 min)
      const filePath = `${platform}/${latest.filename}`;
      const { data: signedUrl } = await supabase
        .storage
        .from('extensions')
        .createSignedUrl(filePath, 600);

      download_url = signedUrl?.signedUrl || null;
    }

    return res.status(200).json({
      platform,
      current_version: version,
      latest_version: latest.version,
      update_available: updateAvailable,
      download_url,
      changelog: latest.changelog || null
    });

  } catch (e) {
    return res.status(200).json({
      platform,
      current_version: version,
      latest_version: version,
      update_available: false
    });
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
