const https = require('https');
const fs = require('fs');

const USERNAME = process.env.GITHUB_USERNAME || '4-thkind';
const TOKEN    = process.env.GITHUB_TOKEN;

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            contributionCount
          }
        }
      }
    }
  }
}`;

function fetchContributions() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables: { login: USERNAME } });
    const options = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': '4-thkind-profile',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Fetching contribution data for', USERNAME);
  const result = await fetchContributions();
  const weeks = result.data.user.contributionsCollection.contributionCalendar.weeks;

  const COLS = 52, ROWS = 7;
  const grid = [];
  const sliced = weeks.slice(-COLS);

  for (let w = 0; w < COLS; w++) {
    grid.push([]);
    const week = sliced[w] || { contributionDays: [] };
    for (let d = 0; d < ROWS; d++) {
      const day = week.contributionDays[d];
      const count = day ? day.contributionCount : 0;
      let val = 0;
      if (count === 0)     val = 0;
      else if (count <= 2) val = 1;
      else if (count <= 5) val = 3;
      else if (count <= 9) val = 6;
      else                 val = 10;
      grid[w].push(val);
    }
  }

  let html = fs.readFileSync('scripts/animation.html', 'utf8');

  // Replace the entire grid generation block (from the comment line through generateGrid() call)
  // with real GitHub data injected directly into ORIGINAL_GRID and GRID
  const realGridCode = `// ── REAL GitHub contribution data (injected by CI) ──────────────────────
const REAL_GRID = ${JSON.stringify(grid)};
const ORIGINAL_GRID = REAL_GRID.map(col => [...col]);
const GRID = REAL_GRID.map(col => [...col]);

function generateGrid() {
  // no-op: real data already loaded above
}
generateGrid();`;

  // Match from the grid generation comment through the generateGrid() call
  const oldPattern = /\/\/ ── Grid generation[^\n]*\n[\s\S]*?generateGrid\(\);/;

  if (!oldPattern.test(html)) {
    console.error('❌ Pattern not found in HTML! Check animation.html structure.');
    process.exit(1);
  }

  html = html.replace(oldPattern, realGridCode);

  fs.writeFileSync('scripts/animation_injected.html', html);
  console.log('✅ Done! Real grid injected.');
  console.log('Sample col 0:', grid[0]);
  console.log('Total weeks fetched:', weeks.length);
}

main().catch(err => { console.error(err); process.exit(1); });