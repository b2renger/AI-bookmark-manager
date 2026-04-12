async function testProxy(proxyUrl) {
  const target = 'https://api.notion.com/v1/search';
  const finalUrl = proxyUrl + target;
  try {
    const res = await fetch(finalUrl, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,notion-version',
        'Origin': 'https://ais-dev-etllivc52kqpjs2tplnevb-9318705075.europe-west1.run.app'
      }
    });
    console.log(`[OPTIONS] ${proxyUrl} -> Status: ${res.status}`);
    console.log(`  CORS Headers: ${res.headers.get('access-control-allow-headers')}`);
  } catch (e) {
    console.log(`[OPTIONS] ${proxyUrl} -> Error: ${e.message}`);
  }
}

async function run() {
  await testProxy('https://proxy.cors.sh/');
}

run();
