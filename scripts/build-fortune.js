require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchFortune, profileFromEnv } = require('../lib/fortune');

async function main() {
  const profile = profileFromEnv(process.env);
  const data = await fetchFortune(profile);

  const outPath = path.join(__dirname, '..', 'docs', 'fortune.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`written: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
