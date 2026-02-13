// api/chrome-updates.js
// Chrome consulta este endpoint cada ~5 horas para auto-update
// ACTUALIZAR version cuando subas nueva version

export default async function handler(req, res) {
  const { platform } = req.query;

  const versions = {
    chaturbate: {
      version: '1.0.9',
      id: 'oopipndbdlglgnabjahaofhefcepnnec',
      crx: 'https://camassist.co/updates/chaturbate/camassist-cb.crx'
    },
    stripchat: {
      version: '1.0.9',
      id: 'gfinnaemomdobdkdmnldgnkocnocleeo',
      crx: 'https://camassist.co/updates/stripchat/camassist-sc.crx'
    },
    streamate: {
      version: '1.6.0',
      id: 'hiogeegcpenaielgfijdfddfgofdemak',
      crx: 'https://camassist.co/updates/streamate/camassist-st.crx'
    },
    xmodels: {
      version: '1.0.0',
      id: 'kaiblfkbdbahbpldoffmolgidgfklacb',
      crx: 'https://camassist.co/updates/xmodels/camassist-xm.crx'
    }
  };

  if (platform && versions[platform]) {
    const ext = versions[platform];
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${ext.id}'>
    <updatecheck codebase='${ext.crx}' version='${ext.version}' />
  </app>
</gupdate>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.status(200).send(xml);
  }

  let apps = '';
  for (const [key, ext] of Object.entries(versions)) {
    apps += `
  <app appid='${ext.id}'>
    <updatecheck codebase='${ext.crx}' version='${ext.version}' />
  </app>`;
  }

  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>${apps}
</gupdate>`;

  res.setHeader('Content-Type', 'application/xml');
  return res.status(200).send(xml);
}
