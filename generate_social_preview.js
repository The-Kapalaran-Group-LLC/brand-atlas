import fs from 'fs';

const W = 1200;
const H = 630;
const FONT_SIZE = 160;
const FONT_FAMILY = 'system-ui, -apple-system, Segoe UI, Avenir Next, sans-serif';
const LETTER_SPACING = '-3';

let out = '';
out += `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">\n`;
out += `<defs>\n`;

// Background gradient
out += `<linearGradient id="bgGradient" x1="0" y1="0" x2="${W}" y2="${H}">\n`;
out += `  <stop offset="0%" stop-color="#F5F5F7"/>\n`;
out += `  <stop offset="100%" stop-color="#EBEBF0"/>\n`;
out += `</linearGradient>\n`;

// Purple to pink gradient for "Archeologist"
out += `<linearGradient id="textGradient" x1="${Math.round(W * 0.4)}" y1="0" x2="${Math.round(W * 0.92)}" y2="0">\n`;
out += `  <stop offset="0%" stop-color="#6366F1"/>\n`;
out += `  <stop offset="50%" stop-color="#7C3AED"/>\n`;
out += `  <stop offset="100%" stop-color="#EC4899"/>\n`;
out += `</linearGradient>\n`;

// Subtle accent gradients
out += `<radialGradient id="accent1" cx="15%" cy="20%">\n`;
out += `  <stop offset="0%" stop-color="#C7D2FE" stop-opacity="0.15"/>\n`;
out += `  <stop offset="100%" stop-color="#C7D2FE" stop-opacity="0"/>\n`;
out += `</radialGradient>\n`;

out += `<radialGradient id="accent2" cx="85%" cy="80%">\n`;
out += `  <stop offset="0%" stop-color="#DDD6FE" stop-opacity="0.12"/>\n`;
out += `  <stop offset="100%" stop-color="#DDD6FE" stop-opacity="0"/>\n`;
out += `</radialGradient>\n`;

out += `</defs>\n`;

// Background
out += `<rect width="1200" height="630" fill="url(#bgGradient)"/>\n`;

// Subtle accent overlays
out += `<circle cx="${Math.round(W * 0.125)}" cy="${Math.round(H * 0.16)}" r="${Math.round(H * 0.79)}" fill="url(#accent1)"/>\n`;
out += `<circle cx="${Math.round(W * 0.875)}" cy="${Math.round(H * 0.84)}" r="${Math.round(H * 0.71)}" fill="url(#accent2)"/>\n`;

// "Cultural" in black
out += `<text x="${Math.round(W * 0.192)}" y="${Math.round(H * 0.492)}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="900" fill="#000000" letter-spacing="${LETTER_SPACING}">\n`;
out += `Cultural\n`;
out += `</text>\n`;

// "Archeologist" in gradient (same line)
out += `<text x="${Math.round(W * 0.475)}" y="${Math.round(H * 0.492)}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="900" fill="url(#textGradient)" letter-spacing="${LETTER_SPACING}">\n`;
out += `Archeologist\n`;
out += `</text>\n`;

out += `</svg>\n`;

fs.writeFileSync('public/social-preview.svg', out);
console.log('Generated public/social-preview.svg with horizontal text layout');
