const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/Buktal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const orange = '#F2673C';
const ink = '#232B33';
const bubble = 'M48 32H104C146 32 176 60 176 100C176 140 146 168 104 168H76L40 194Q32 200 32 188V48Q32 32 48 32ZM68 68V132H104C126 132 140 119 140 100C140 81 126 68 104 68Z';
const capsule = 'M64 28H192C214 28 232 46 232 68C232 90 214 108 192 108H112L64 136V108C42 108 24 90 24 68C24 46 42 28 64 28Z';
const dlink = 'M60 36H104C141.555 36 172 66.445 172 104S141.555 172 104 172H92L44 208V52Q44 36 60 36ZM80 72V136H104A32 32 0 0 0 104 72Z';
const bands = 'M64 40H152C191.765 40 224 72.235 224 112S191.765 184 152 184H120L64 220V148H152A36 36 0 0 0 152 76H64Z';
const marks = [
  `<path d="${bubble}" fill="${orange}" fill-rule="evenodd"/><path d="${bubble}" fill="${ink}" fill-rule="evenodd" transform="rotate(180 128 128)"/>`,
  `<path d="${bubble}" fill="${orange}" fill-rule="evenodd"/><path d="${bubble}" fill="${orange}" fill-rule="evenodd" transform="rotate(180 128 128)"/>`,
  `<path d="${capsule}" fill="${orange}"/><path d="${capsule}" fill="${ink}" transform="rotate(180 128 128)"/><path d="M72 68H176M80 188H184" stroke="#F8F5EF" stroke-width="20" stroke-linecap="round"/>`,
  `<path d="${dlink}" fill="${orange}" fill-rule="evenodd"/><path d="${dlink}" fill="${ink}" fill-rule="evenodd" transform="rotate(180 128 128)"/>`,
  `<path d="${bands}" fill="${orange}" transform="translate(0 -10) scale(.72)"/><path d="${bands}" fill="${ink}" transform="translate(256 266) rotate(180) scale(.72)"/>`,
  `<path d="M72 36H148A72 72 0 0 1 148 180H112L56 220V52Q56 36 72 36ZM96 76V140H148A32 32 0 0 0 148 76Z" fill="${orange}" fill-rule="evenodd"/><rect x="24" y="68" width="80" height="28" rx="14" fill="${ink}"/><rect x="24" y="120" width="80" height="28" rx="14" fill="${ink}"/>`
];
const names = ['01 / Linked dialogue', '02 / Joined dialogue', '03 / Duplex', '04 / Double D', '05 / Relay', '06 / Shared port'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1020" viewBox="0 0 1440 1020"><rect width="1440" height="1020" fill="#F8F5EF"/>${marks.map((mark,i)=>{let x=40+(i%3)*470,y=40+Math.floor(i/3)*490;return `<g transform="translate(${x} ${y})"><rect width="450" height="450" rx="12" fill="#fff"/><g transform="translate(97 52)">${mark}</g><text x="32" y="380" fill="${ink}" font-family="Segoe UI" font-size="20">${names[i]}</text><g transform="translate(352 340) scale(.22)">${mark}</g></g>`}).join('')}</svg>`;
fs.writeFileSync(path.join(__dirname, 'explore.svg'), svg);
sharp(Buffer.from(svg)).png().toFile(path.join(__dirname,'explore.png'));
