const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const { Resvg } = require('@resvg/resvg-js');

// Load Poppins-Bold font
const fontBuffer = fs.readFileSync('/tmp/Poppins-Bold.ttf');
const font = opentype.parse(
  fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength)
);

const fontSize = 120;
const scale = fontSize / font.unitsPerEm; // 0.12

const NAVY = '#0A1128';
const TURQUOISE = '#00D2B4';
const WHITE = '#FFFFFF';

function buildLogoSvg(navyColor) {
  const baselineY = 148;
  const startX = 24;

  // 1. 'yes'
  const pYes = font.getPath('yes', startX, baselineY, fontSize);
  const wYes = font.getAdvanceWidth('yes', fontSize);

  // 2. space
  const wSpace = font.getAdvanceWidth(' ', fontSize) * 0.95;

  // 3. 'dh'
  const xDh = startX + wYes + wSpace;
  const pDh = font.getPath('dh', xDh, baselineY, fontSize);
  const wDh = font.getAdvanceWidth('dh', fontSize);

  // 4. 'o'
  const xO = xDh + wDh;
  const glyphO = font.charToGlyph('o');
  // Glyph 'o' metrics:
  // center is at x = 318, y = 279 in font units (baseline is 0, y increases up)
  // In SVG coords:
  // svgX = xO + 318 * scale
  // svgY = baselineY - 279 * scale
  const oCenterX = xO + 318 * scale;
  const oCenterY = baselineY - 279 * scale;
  const rOuter = 290 * scale; // ~34.8
  const rInner = 116 * scale; // ~13.92

  // Path of the turquoise 'o' outer ring with inner hole
  const pathO = font.getPath('o', xO, baselineY, fontSize);

  // Wave inside 'o' inner hole
  // The inner hole circle has center (oCenterX, oCenterY) and radius rInner
  // The wave flows from left (-rInner, +0) to right (+rInner, +0)
  // In SVG y increases downwards:
  // bottom of inner circle is at oCenterY + rInner
  // The wave fills the bottom part: starts at (oCenterX - rInner, oCenterY + 1)
  // curves down, rises to a crest, then connects to right side (oCenterX + rInner, oCenterY - 2)
  // then follows the bottom arc back to the start!
  const waveStartX = oCenterX - rInner;
  const waveStartY = oCenterY + 1.5;
  const waveEndX = oCenterX + rInner;
  const waveEndY = oCenterY - 1.5;

  const cp1X = oCenterX - rInner * 0.45;
  const cp1Y = oCenterY + rInner * 0.65;
  const cp2X = oCenterX + rInner * 0.35;
  const cp2Y = oCenterY - rInner * 0.75;

  const wavePath = `M ${waveStartX.toFixed(2)} ${waveStartY.toFixed(2)} ` +
    `C ${cp1X.toFixed(2)} ${cp1Y.toFixed(2)}, ${cp2X.toFixed(2)} ${cp2Y.toFixed(2)}, ${waveEndX.toFixed(2)} ${waveEndY.toFixed(2)} ` +
    `A ${rInner.toFixed(2)} ${rInner.toFixed(2)} 0 0 1 ${waveStartX.toFixed(2)} ${waveStartY.toFixed(2)} Z`;

  // 5. 'b'
  const wO = font.getAdvanceWidth('o', fontSize);
  const xB = xO + wO;
  const pB = font.getPath('b', xB, baselineY, fontSize);
  const wB = font.getAdvanceWidth('b', fontSize);

  // 6. 'i'
  const xI = xB + wB;
  const glyphI = font.charToGlyph('i');
  // In Poppins 'i':
  // Stem is M 62, 558 L 233, 558 L 233, 0 L 62, 0 Z
  const stemLeft = xI + 62 * scale;
  const stemWidth = (233 - 62) * scale;
  const stemHeight = 558 * scale;
  const stemTop = baselineY - 558 * scale;
  const stemPath = `M ${stemLeft.toFixed(2)} ${stemTop.toFixed(2)} ` +
    `h ${stemWidth.toFixed(2)} ` +
    `v ${stemHeight.toFixed(2)} ` +
    `h ${(-stemWidth).toFixed(2)} Z`;

  // Droplet above 'i':
  // Centered at stemCenterX
  const stemCenterX = stemLeft + stemWidth / 2;
  // Droplet tip at top, bulbous at bottom
  const dropTipY = baselineY - 805 * scale; // ~51.4
  const dropBottomY = baselineY - 612 * scale; // ~74.5
  const dropHeight = dropBottomY - dropTipY;
  const dropWidth = stemWidth * 0.98;
  const dropLeft = stemCenterX - dropWidth / 2;
  const dropRight = stemCenterX + dropWidth / 2;
  const dropBulbY = dropTipY + dropHeight * 0.68;

  // Droplet path
  const dropletPath = `M ${stemCenterX.toFixed(2)} ${dropTipY.toFixed(2)} ` +
    `C ${(stemCenterX - dropWidth * 0.2).toFixed(2)} ${(dropTipY + dropHeight * 0.35).toFixed(2)}, ` +
    `${dropLeft.toFixed(2)} ${dropBulbY.toFixed(2)}, ` +
    `${dropLeft.toFixed(2)} ${(dropBottomY - dropWidth * 0.35).toFixed(2)} ` +
    `A ${(dropWidth / 2).toFixed(2)} ${(dropWidth / 2).toFixed(2)} 0 0 0 ${dropRight.toFixed(2)} ${(dropBottomY - dropWidth * 0.35).toFixed(2)} ` +
    `C ${dropRight.toFixed(2)} ${dropBulbY.toFixed(2)}, ` +
    `${(stemCenterX + dropWidth * 0.2).toFixed(2)} ${(dropTipY + dropHeight * 0.35).toFixed(2)}, ` +
    `${stemCenterX.toFixed(2)} ${dropTipY.toFixed(2)} Z`;

  // Droplet white shine arc
  const shineStartX = stemCenterX - dropWidth * 0.32;
  const shineStartY = dropTipY + dropHeight * 0.42;
  const shineEndX = stemCenterX - dropWidth * 0.38;
  const shineEndY = dropBottomY - dropWidth * 0.55;
  const shineCpX = stemCenterX - dropWidth * 0.46;
  const shineCpY = dropTipY + dropHeight * 0.62;

  const dropletShine = `M ${shineStartX.toFixed(2)} ${shineStartY.toFixed(2)} ` +
    `Q ${shineCpX.toFixed(2)} ${shineCpY.toFixed(2)} ${shineEndX.toFixed(2)} ${shineEndY.toFixed(2)}`;

  const totalWidth = (stemLeft + stemWidth + 24).toFixed(0);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 190" width="${totalWidth}" height="190" fill="none">
  <!-- Navy letters: yes, dh, b, and i stem -->
  <path d="${pYes.toPathData()}" fill="${navyColor}" />
  <path d="${pDh.toPathData()}" fill="${navyColor}" />
  <path d="${pB.toPathData()}" fill="${navyColor}" />
  <path d="${stemPath}" fill="${navyColor}" />

  <!-- Turquoise 'o': Outer Ring with Inner Hole -->
  <path d="${pathO.toPathData()}" fill="${TURQUOISE}" fill-rule="evenodd" />

  <!-- Wave inside 'o' -->
  <path d="${wavePath}" fill="${TURQUOISE}" />

  <!-- Droplet above 'i' -->
  <path d="${dropletPath}" fill="${navyColor}" />
  <path d="${dropletShine}" stroke="${WHITE}" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.85" />
</svg>`;

  return svg;
}

const navySvg = buildLogoSvg(NAVY);
const whiteSvg = buildLogoSvg(WHITE);

// Ensure directories
['public', 'public/assets', 'src/assets/images'].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Write SVGs
fs.writeFileSync('public/yes-dhobi-logo.svg', navySvg);
fs.writeFileSync('public/yes-dhobi-logo-white.svg', whiteSvg);
fs.writeFileSync('src/assets/images/yes_dhobi_logo.svg', navySvg);
fs.writeFileSync('src/assets/images/yes_dhobi_logo_white.svg', whiteSvg);

console.log('SVGs created successfully!');

// Render high-res PNGs using Resvg (width: 1300px for crystal-clear retina display)
const resvg = new Resvg(navySvg, {
  fitTo: {
    mode: 'width',
    value: 1300,
  },
});
const pngData = resvg.render().asPng();

// Save PNG to all expected locations
fs.writeFileSync('public/yes-dhobi-logo.png', pngData);
fs.writeFileSync('public/Screenshot 2026-10-05 090933.png', pngData);
fs.writeFileSync('public/assets/yesdhobi-logo.png', pngData);
fs.writeFileSync('public/assets/original-yesdhobi-logo.png', pngData);
fs.writeFileSync('src/assets/images/yes-dhobi-logo.png', pngData);

console.log('All PNG logo files generated successfully!');
