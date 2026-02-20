export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { platform, version } = req.query;

  // Versiones más recientes por plataforma
  const latestVersions = {
    chaturbate: '1.1.0',
    stripchat: '1.1.0',
    streamate: '1.4.0',
    xmodels: '1.1.0'
  };

  const latest = latestVersions[platform] || '1.0.0';
  const updateAvailable = version && compareVersions(version, latest) < 0;

  return res.status(200).json({
    platform,
    current_version: version,
    latest_version: latest,
    update_available: updateAvailable,
    download_url: updateAvailable ? 'https://www.camassist.co/downloads' : null
  });
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
