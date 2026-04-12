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
  await testProxyPost('https://api.allorigins.win/raw?url=', true);
}

run();
