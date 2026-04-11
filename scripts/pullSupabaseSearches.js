// Continuous Supabase data pull for model training
const fs = require('fs');
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://ofvpetcgufslyvwrlnqp.supabase.co/rest/v1/searches';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';
const LAST_FETCH_FILE = __dirname + '/last_fetch.txt';
const OUTPUT_FILE = __dirname + '/new_searches.jsonl';

function getLastFetch() {
  if (fs.existsSync(LAST_FETCH_FILE)) {
    return fs.readFileSync(LAST_FETCH_FILE, 'utf8').trim();
  }
  return '2025-01-01T00:00:00Z';
}

function setLastFetch(ts) {
  fs.writeFileSync(LAST_FETCH_FILE, ts);
}

async function main() {
  while (true) {
    const lastFetch = getLastFetch();
    const now = new Date().toISOString();
    const url = `${SUPABASE_URL}?select=*&createdAt=gte.${lastFetch}&order=createdAt.asc`;

    const res = await fetch(url, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
    });

    if (!res.ok) {
      console.error('Fetch error:', res.status, await res.text());
    } else {
      const data = await res.json();
      if (data.length > 0) {
        for (const row of data) {
          fs.appendFileSync(OUTPUT_FILE, JSON.stringify(row) + '\n');
        }
      }
      setLastFetch(now);
      console.log(`Fetched ${data.length} new records at ${now}`);
    }
    await new Promise((r) => setTimeout(r, 300_000)); // 5 minutes
  }
}

main();
