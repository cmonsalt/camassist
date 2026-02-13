// api/chrome-updates.js
// Endpoint que Chrome consulta para auto-update de extensiones
// Chrome chequea esto cada ~5 horas automáticamente

export default async function handler(req, res) {
  const { platform } = req.query;

  // Versiones actuales de cada extensión
  // ACTUALIZAR ESTOS VALORES cuando subas nueva versión
  const versions = {
    chaturbate: {
      version: '1.0.9',
      id: 'camassist-chaturbate',
      crx: 'https://camassist.co/updates/chaturbate/camassist-cb.crx'
    },
    stripchat: {
      version: '1.0.9',
      id: 'camassist-stripchat',
      crx: 'https://camassist.co/updates/stripchat/camassist-sc.crx'
    },
    streamate: {
      version: '1.6.0',
      id: 'camassist-streamate',
      crx: 'https://camassist.co/updates/streamate/camassist-st.crx'
    },
    xmodels: {
      version: '1.0.0',
      id: 'camassist-xmodels',
      crx: 'https://camassist.co/updates/xmodels/camassist-xm.crx'
    }
  };

  // Si piden una plataforma específica
  if (platform && versions[platform]) {
    const ext = versions[platform];
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${ext.id}'>
    <updatecheck crsxversion='3' version='${ext.version}' prodversionmin='100.0'
      codebase='${ext.crx}'/>
  </app>
</gupdate>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.status(200).send(xml);
  }

  // Si piden todas
  let apps = '';
  for (const [key, ext] of Object.entries(versions)) {
    apps += `
  <app appid='${ext.id}'>
    <updatecheck crsxversion='3' version='${ext.version}' prodversionmin='100.0'
      codebase='${ext.crx}'/>
  </app>`;
  }

  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>${apps}
</gupdate>`;

  res.setHeader('Content-Type', 'application/xml');
  return res.status(200).send(xml);
}
