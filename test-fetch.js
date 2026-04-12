async function testProxy(proxyUrl, encode) {
  const target = 'https://api.notion.com/v1/search';
  const finalUrl = proxyUrl + (encode ? encodeURIComponent(target) : target);
  try {
    const res = await fetch(finalUrl, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,notion-version',
        'Origin': 'https://ais-dev-etllivc52kqpjs2tplnevb-9318705075.europe-west1.run.app'
      }
    });
    console.log(`[${encode ? 'ENCODED' : 'RAW'}] ${proxyUrl} -> Status: ${res.status}`);
    console.log(`  CORS Headers: ${res.headers.get('access-control-allow-headers')}`);
  } catch (e) {
    console.log(`[${encode ? 'ENCODED' : 'RAW'}] ${proxyUrl} -> Error: ${e.message}`);
  }
}

async function run() {
  const proxies = [
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-anywhere.herokuapp.com/'
  ];

  for (const p of proxies) {
    await testProxy(p, true);
    await testProxy(p, false);
  }
}

run();
