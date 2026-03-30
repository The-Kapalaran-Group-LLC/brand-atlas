import fs from 'fs';

const W = 1200;
const H = 630;
const FONT = 'system-ui, -apple-system, Segoe UI, Avenir Next, sans-serif';

let out = '';
out += `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">\n`;
out += `<defs>\n`;
out += `<linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">`;
out += `<stop offset="0" stop-color="#FAFAFA"/>`;
out += `<stop offset="1" stop-color="#F1F3F9"/>`;
out += `</linearGradient>\n`;
out += `<radialGradient id="blobA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(140 96) rotate(16) scale(520 320)">`;
out += `<stop offset="0" stop-color="#C7D2FE" stop-opacity="0.32"/>`;
out += `<stop offset="1" stop-color="#C7D2FE" stop-opacity="0"/>`;
out += `</radialGradient>\n`;
out += `<radialGradient id="blobB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1010 130) rotate(-12) scale(560 320)">`;
out += `<stop offset="0" stop-color="#DDD6FE" stop-opacity="0.26"/>`;
out += `<stop offset="1" stop-color="#DDD6FE" stop-opacity="0"/>`;
out += `</radialGradient>\n`;
out += `<radialGradient id="blobC" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(910 520) rotate(-8) scale(600 260)">`;
out += `<stop offset="0" stop-color="#F0ABFC" stop-opacity="0.22"/>`;
out += `<stop offset="1" stop-color="#F0ABFC" stop-opacity="0"/>`;
out += `</radialGradient>\n`;
out += `<linearGradient id="brandGradient" x1="520" y1="0" x2="1110" y2="0">`;
out += `<stop offset="0" stop-color="#6366F1"/>`;
out += `<stop offset="1" stop-color="#D946EF"/>`;
out += `</linearGradient>\n`;
out += `<linearGradient id="iconGradient" x1="0" y1="0" x2="1" y2="1">`;
out += `<stop offset="0" stop-color="#4F46E5"/>`;
out += `<stop offset="0.55" stop-color="#7C3AED"/>`;
out += `<stop offset="1" stop-color="#D946EF"/>`;
out += `</linearGradient>\n`;
out += `<filter id="noise" x="0" y="0" width="${W}" height="${H}">`;
out += `<feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="1" seed="6" result="noise"/>`;
out += `<feComponentTransfer><feFuncA type="table" tableValues="0 0 0.014 0.03"/></feComponentTransfer>`;
out += `</filter>\n`;
out += `</defs>\n`;

out += `<rect width="${W}" height="${H}" fill="url(#bg)"/>\n`;
out += `<rect width="${W}" height="${H}" fill="url(#blobA)"/>\n`;
out += `<rect width="${W}" height="${H}" fill="url(#blobB)"/>\n`;
out += `<rect width="${W}" height="${H}" fill="url(#blobC)"/>\n`;

// Transparent-background magnifying glass icon.
out += `<circle cx="600" cy="171" r="19" stroke="url(#iconGradient)" stroke-width="7" fill="none"/>\n`;
out += `<line x1="614" y1="185" x2="632" y2="203" stroke="url(#iconGradient)" stroke-width="7" stroke-linecap="round"/>\n`;

// Header copy (main-page look and feel).
out += `<text x="130" y="332" font-family="${FONT}" font-size="110" font-weight="500" letter-spacing="-2.8" fill="#09090B">Cultural</text>\n`;
out += `<text x="530" y="332" font-family="${FONT}" font-size="110" font-weight="500" letter-spacing="-2.8" fill="url(#brandGradient)">Archeologist</text>\n`;

// Subheadline from main page.
out += `<text x="600" y="402" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="500" fill="#52525B">Deep dive into any culture or audience.</text>\n`;

// Bottom soft atmospheric sweep for depth.
out += `<ellipse cx="600" cy="602" rx="560" ry="96" fill="#FFFFFF" fill-opacity="0.38"/>\n`;
out += `<rect width="${W}" height="${H}" filter="url(#noise)" opacity="0.62"/>\n`;
out += `</svg>\n`;

fs.writeFileSync('public/social-preview.svg', out);
console.log('Generated public/social-preview.svg (main-page style)');
