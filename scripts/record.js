// record.js
// Records ONE complete cycle: Goblin in → bombs → Spidey swings → exits → wait ends
// Stops exactly when the WAIT phase finishes (just before Goblin would re-enter)
// This gives a clean seamless loop on the GIF

const puppeteer = require('puppeteer');
const { createCanvas } = require('canvas');
const GIFEncoder = require('gifencoder');
const fs = require('fs');
const path = require('path');

const HTML_FILE = path.resolve('scripts/animation_injected.html');
const OUTPUT    = 'spiderman.gif';

const WIDTH  = 1288;
const HEIGHT = 282;
const FPS    = 20;
const FRAME_DELAY = Math.round(1000 / FPS);

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage();
  // Wide enough so canvas renders at full 1288px without scaling
  await page.setViewport({ width: 1500, height: 500 });
  await page.goto(`file://${HTML_FILE}`, { waitUntil: 'networkidle0' });

  // Patch the page to signal when one full cycle completes (WAIT phase ends)
  await page.evaluate(() => {
    window._cycleComplete = false;
    const orig = window.initGoblin;
    let firstCall = true;
    window.initGoblin = function() {
      if (!firstCall) {
        window._cycleComplete = true;
      }
      firstCall = false;
      orig.apply(this, arguments);
    };
  });

  // Wait for animation to start
  await new Promise(r => setTimeout(r, 1000));

  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  const stream  = encoder.createWriteStream({ repeat: 0, delay: FRAME_DELAY, quality: 6 });
  stream.pipe(fs.createWriteStream(OUTPUT));
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(FRAME_DELAY);
  encoder.setQuality(6);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx    = canvas.getContext('2d');
  const { Image } = require('canvas');

  let frameCount = 0;
  const MAX_FRAMES = FPS * 120; // 2 min safety cap

  console.log('Recording until one full cycle completes...');

  while (frameCount < MAX_FRAMES) {
    const element = await page.$('canvas#c');
    const buf = await element.screenshot({ type: 'png' });

    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = buf; });
    ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
    encoder.addFrame(ctx);
    frameCount++;

    if (frameCount % 20 === 0) {
      const phase = await page.evaluate(() => window.phase || '');
      console.log(`  Frame ${frameCount} (~${Math.round(frameCount/FPS)}s) | phase: ${phase}`);
    }

    // Stop when cycle complete — but only after at least 10s so we don't stop too early
    const done = await page.evaluate(() => window._cycleComplete);
    if (done && frameCount > FPS * 10) {
      console.log(`✅ Full cycle complete at frame ${frameCount} (~${Math.round(frameCount/FPS)}s)`);
      break;
    }

    await new Promise(r => setTimeout(r, FRAME_DELAY));
  }

  encoder.finish();
  await browser.close();

  const sizeMB = (fs.statSync(OUTPUT).size / (1024 * 1024)).toFixed(1);
  console.log(`✅ GIF saved: ${OUTPUT} (${sizeMB} MB, ${frameCount} frames)`);
}

main().catch(err => { console.error(err); process.exit(1); });