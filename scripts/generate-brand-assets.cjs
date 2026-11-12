/**
 * Generates the SAMSAL temporary logo set (SVG + PNG).
 *
 * Run:  npm run brand:assets      (needs the "sharp" dev dependency)
 *
 * To replace the logo with the final artwork, simply overwrite the files in
 * /public/logo and /src/app (icon.svg, apple-icon.png, opengraph-image.png)
 * keeping the same file names. No component code needs to change.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const NAVY = "#142D4E";
const TEAL = "#0B8F87";
const TEAL_LIGHT = "#6FD0C8";
const AMBER = "#F2A541";
const WHITE = "#FFFFFF";

const root = path.join(__dirname, "..");
const logoDir = path.join(root, "public", "logo");
const appDir = path.join(root, "src", "app");
fs.mkdirSync(logoDir, { recursive: true });

/** 48x48 symbol: abstract S = a path from an origin node (teal) to a forward arrow (amber). */
function markGroup(onDark) {
  const box = onDark ? WHITE : NAVY;
  const stroke = onDark ? NAVY : WHITE;
  return `
  <rect width="48" height="48" rx="9" fill="${box}"/>
  <path d="M31 15H19.5a4.5 4.5 0 0 0 0 9h9a4.5 4.5 0 0 1 0 9H18" fill="none" stroke="${stroke}" stroke-width="4.6"/>
  <path d="M30.5 9.5 L39 15 L30.5 20.5 Z" fill="${AMBER}"/>
  <circle cx="13.2" cy="33" r="3.4" fill="${TEAL}"/>`;
}

/** Geometric SAMSAL wordmark drawn as outlines (no font dependency). 152 x 28. */
function wordmarkGroup(color) {
  const S = `<path d="M22 2.4H8.2a5.8 5.8 0 0 0 0 11.6H13.8a5.8 5.8 0 0 1 0 11.6H0" fill="none" stroke="${color}" stroke-width="4.8"/>`;
  const A = `<path fill="${color}" fill-rule="evenodd" d="M0 28 8.6 0H13.4L22 28H17.2L15.55 22.6H6.45L4.8 28ZM11 7.8 14 17.6H8Z"/>`;
  const M = `<path fill="${color}" d="M0 28V0H5.4L11 12.2 16.6 0H22V28H17.2V10.6L12.6 20.6H9.4L4.8 10.6V28Z"/>`;
  const L = `<path fill="${color}" d="M0 0H4.8V23.2H22V28H0Z"/>`;
  const letters = [S, A, M, S, A, L];
  return letters
    .map((l, i) => `<g transform="translate(${i * 26} 0)">${l}</g>`)
    .join("");
}

function fullSvg(onDark) {
  const word = onDark ? WHITE : NAVY;
  const desc = onDark ? TEAL_LIGHT : TEAL;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 212 54" role="img" aria-label="SAMSAL Supply &amp; Distribution">
  <g transform="translate(0 3)">${markGroup(onDark)}</g>
  <g transform="translate(60 4)">${wordmarkGroup(word)}</g>
  <text x="60" y="48.5" font-family="Inter, Arial, Helvetica, sans-serif" font-size="8.4" font-weight="700" fill="${desc}" textLength="152" lengthAdjust="spacing">SUPPLY &amp; DISTRIBUTION</text>
</svg>
`;
}

function markSvg(onDark) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="SAMSAL">${markGroup(onDark)}
</svg>
`;
}

/** Square social-profile artwork: mark centred on brand navy. */
function socialSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="${NAVY}"/>
  <g transform="translate(100 100) scale(4.1667)">${markGroup(true)}</g>
</svg>
`;
}

/** 1200x630 Open Graph card. */
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${NAVY}"/>
  <g stroke="#ffffff" stroke-opacity="0.06">
    ${Array.from({ length: 21 }, (_, i) => `<path d="M${i * 60} 0V630"/>`).join("")}
    ${Array.from({ length: 11 }, (_, i) => `<path d="M0 ${i * 60}H1200"/>`).join("")}
  </g>
  <g transform="translate(80 90) scale(2.55)">
    <g transform="translate(0 3)">${markGroup(true)}</g>
    <g transform="translate(60 4)">${wordmarkGroup(WHITE)}</g>
    <text x="60" y="48.5" font-family="Inter, Arial, Helvetica, sans-serif" font-size="8.4" font-weight="700" fill="${TEAL_LIGHT}" textLength="152" lengthAdjust="spacing">SUPPLY &amp; DISTRIBUTION</text>
  </g>
  <rect x="80" y="330" width="72" height="6" fill="${AMBER}"/>
  <text x="80" y="420" font-family="Inter, Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="${WHITE}">Reliable Supply.</text>
  <text x="80" y="496" font-family="Inter, Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="${WHITE}">Smarter Procurement.</text>
  <text x="80" y="560" font-family="Inter, Arial, Helvetica, sans-serif" font-size="28" font-weight="500" fill="${TEAL_LIGHT}">Procurement. Supply. Delivery.  ·  Nairobi, Kenya</text>
</svg>
`;
}

const write = (file, data) => fs.writeFileSync(file, data);

async function main() {
  write(path.join(logoDir, "samsal-logo.svg"), fullSvg(false));
  write(path.join(logoDir, "samsal-logo-on-dark.svg"), fullSvg(true));
  write(path.join(logoDir, "samsal-mark.svg"), markSvg(false));
  write(path.join(logoDir, "samsal-mark-on-dark.svg"), markSvg(true));
  write(path.join(logoDir, "samsal-social-profile.svg"), socialSvg());
  write(path.join(appDir, "icon.svg"), markSvg(false));

  const png = (svg, w, h, out) =>
    sharp(Buffer.from(svg), { density: 300 }).resize(w, h).png().toFile(out);

  await png(fullSvg(false), 1060, 270, path.join(logoDir, "samsal-logo.png"));
  await png(fullSvg(true), 1060, 270, path.join(logoDir, "samsal-logo-on-dark.png"));
  await png(markSvg(false), 512, 512, path.join(logoDir, "samsal-mark-512.png"));
  await png(socialSvg(), 1080, 1080, path.join(logoDir, "samsal-social-profile.png"));
  await png(markSvg(false), 180, 180, path.join(appDir, "apple-icon.png"));
  await png(ogSvg(), 1200, 630, path.join(appDir, "opengraph-image.png"));
  console.log("Brand assets written to public/logo and src/app");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
