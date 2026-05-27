import fs from 'fs';
import sharp from 'sharp';

const W = 1200;
const H = 630;

// Direct static-source workflow: use one screenshot image as-is (no synthetic globe / gif / text overlays).
const finalPng = await sharp('public/splash-static-source.png')
  .resize({
    width: W,
    height: H,
    fit: 'contain',
    background: '#FFFFFF',
  })
  .png({ compressionLevel: 9, quality: 92 })
  .toBuffer();

const sparkleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <path d="M760 225 L764 241 L780 245 L764 249 L760 265 L756 249 L740 245 L756 241 Z" fill="#6366F1"/>
  <path d="M760 231 L763 242 L774 245 L763 248 L760 259 L757 248 L746 245 L757 242 Z" fill="#EEF2FF"/>
</svg>
`;

const withSparkle = await sharp(finalPng)
  .composite([{ input: Buffer.from(sparkleSvg), left: 0, top: 0 }])
  .png({ compressionLevel: 9, quality: 92 })
  .toBuffer();

fs.writeFileSync('public/social-preview.png', withSparkle);
fs.writeFileSync('public/social-preview-replica.png', withSparkle);
fs.writeFileSync('public/social-preview-replica-v2.png', withSparkle);
fs.writeFileSync('public/social-preview-latest.png', withSparkle);

const fallbackSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  <text x="50%" y="50%" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#6B7280">
    Static splash screenshot source: /public/splash-static-source.png
  </text>
</svg>
`;
fs.writeFileSync('public/social-preview.svg', fallbackSvg);

console.log('Generated social preview from static splash frame.');
