// record.js
// Opens the injected HTML in headless Chrome and records it as a GIF

const puppeteer = require('puppeteer');
const { createCanvas } = require('canvas');
const GIFEncoder = require('gifencoder');
const fs = require('fs');
const path = require('path');

const HTML_FILE = path.resolve('scripts/animation_injected.html');
const OUTPUT    = 'spiderman.gif';

// Canvas dimensions matching the HTML
const WIDTH  = 1288;
const HEIGHT = 282;

// Record for 12 seconds at 20fps = 240 frames
const FPS      = 20;
const DURATION = 12; // seconds
const FRAMES   = FPS * DURATION;

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH + 80, height: HEIGHT + 120 });
  await page.goto(`file://${HTML_FILE}`, { waitUntil: 'networkidle0' });

  // Wait for animation to start
  await new Promise(r => setTimeout(r, 800));

  console.log(`Recording ${FRAMES} frames at ${FPS}fps...`);

  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  const stream  = encoder.createWriteStream({ repeat: 0, delay: Math.round(1000/FPS), quality: 8 });
  stream.pipe(fs.createWriteStream(OUTPUT));
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(Math.round(1000 / FPS));
  encoder.setQuality(8);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx    = canvas.getContext('2d');

  for (let i = 0; i < FRAMES; i++) {
    // Screenshot just the canvas element
    const element = await page.$('canvas#c');
    const screenshotBuffer = await element.screenshot({ type: 'png' });

    // Draw into node-canvas for GIF encoding
    const { Image } = require('canvas');
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = screenshotBuffer;
    });

    ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
    encoder.addFrame(ctx);

    if (i % 20 === 0) console.log(`  Frame ${i}/${FRAMES}`);

    // Wait for next frame
    await new Promise(r => setTimeout(r, Math.round(1000 / FPS)));
  }

  encoder.finish();
  await browser.close();
  console.log(`✅ GIF saved to ${OUTPUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
