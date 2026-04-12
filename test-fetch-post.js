async function testProxyPost(proxyUrl, encode) {
  const target = 'https://api.notion.com/v1/search';
  const finalUrl = proxyUrl + (encode ? encodeURIComponent(target) : target);
  try {
    const res = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer secret_dummy',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Origin': 'https://ais-dev-etllivc52kqpjs2tplnevb-9318705075.europe-west1.run.app'
      },
      body: JSON.stringify({ page_size: 1 })
    });
    const text = await res.text();
    console.log(`[${encode ? 'ENCODED' : 'RAW'}] ${proxyUrl} -> Status: ${res.status}`);
    console.log(`  Response: ${text.substring(0, 100)}`);
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
    await testProxyPost(p, false);
  }
}

run();
