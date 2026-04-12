const https = require('https');

function testProxy(proxyUrl) {
  return new Promise((resolve) => {
    const url = new URL(proxyUrl);
    const req = https.request(url, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,notion-version',
        'Origin': 'https://ais-dev-etllivc52kqpjs2tplnevb-9318705075.europe-west1.run.app'
      }
    }, (res) => {
      resolve({
        url: proxyUrl,
        status: res.statusCode,
        allowHeaders: res.headers['access-control-allow-headers']
      });
    });
    req.on('error', (e) => resolve({ url: proxyUrl, error: e.message }));
    req.end();
  });
}

async function run() {
  const target = encodeURIComponent('https://api.notion.com/v1/search');
  const proxies = [
    `https://corsproxy.io/?${target}`,
    `https://api.codetabs.com/v1/proxy?quest=${target}`,
    `https://thingproxy.freeboard.io/fetch/https://api.notion.com/v1/search`,
    `https://cors-anywhere.herokuapp.com/https://api.notion.com/v1/search`
  ];

  for (const p of proxies) {
    const res = await testProxy(p);
    console.log(res);
  }
}

run();
