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

fs.writeFileSync('public/social-preview.png', finalPng);
fs.writeFileSync('public/social-preview-replica.png', finalPng);
fs.writeFileSync('public/social-preview-replica-v2.png', finalPng);
fs.writeFileSync('public/social-preview-latest.png', finalPng);

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
