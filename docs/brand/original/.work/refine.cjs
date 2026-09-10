const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/Buktal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const a = 'M48 32H104C146 32 176 60 176 100C176 140 146 168 104 168H76L40 194Q32 200 32 188V48Q32 32 48 32ZM72 68H104C126 68 140 81 140 100C140 119 126 132 104 132H72Q68 132 68 128V72Q68 68 72 68Z';
function mark(id, mode, mono=false, gap=12) {
  let color=mono?'#F2673C':'#232B33';
  let pa=`<path d="${a}" fill-rule="evenodd"`, pb=`<path d="${a}" fill-rule="evenodd" transform="rotate(180 128 128)"`;
  const defs=`<defs><clipPath id="top-${id}"><rect width="256" height="128"/></clipPath><clipPath id="low-${id}"><rect y="128" width="256" height="128"/></clipPath><mask id="a-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="white"/><g ${mode==='weave'?`clip-path="url(#low-${id})"`:''}>${pb} fill="black" stroke="black" stroke-width="${gap}"/></g></mask><mask id="b-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="white"/><g clip-path="url(#top-${id})">${pa} fill="black" stroke="black" stroke-width="${gap}"/></g></mask></defs>`;
  return defs+`${pa} fill="#F2673C" ${mode!=='none'?`mask="url(#a-${id})"`:''}/><g ${mode==='weave'?`mask="url(#b-${id})"`:''}>${pb} fill="${color}"/></g>`;
}
const choices=[['Original', 'none',false,0],['Air gap', 'cut',false,12],['Linked, two colors', 'weave',false,12],['Linked, orange', 'weave',true,12],['Linked, 16u gap', 'weave',true,16],['Air gap, orange', 'cut',true,12]];
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1020" viewBox="0 0 1440 1020"><rect width="1440" height="1020" fill="#F8F5EF"/>${choices.map(([name,mode,mono,gap],i)=>{let x=40+(i%3)*470,y=40+Math.floor(i/3)*490;return `<g transform="translate(${x} ${y})"><rect width="450" height="450" rx="12" fill="#fff"/><g transform="translate(97 36)">${mark('large'+i,mode,mono,gap)}</g><text x="32" y="334" fill="#232B33" font-family="Segoe UI" font-size="20">${name}</text>${[16,24,32,48].map((size,j)=>`<g transform="translate(${32+j*96} 375) scale(${size/256})">${mark('small'+i+'-'+j,mode,mono,gap)}</g>`).join('')}</g>`}).join('')}</svg>`;
fs.writeFileSync(path.join(__dirname, 'refine.svg'),svg);
sharp(Buffer.from(svg)).png().toFile(path.join(__dirname,'refine.png'));
module.exports={a,mark};
