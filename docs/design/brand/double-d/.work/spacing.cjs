const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/Buktal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const a='M48 32H104C146 32 176 60 176 100C176 140 146 168 104 168H76L40 194Q32 200 32 188V48Q32 32 48 32ZM72 68H104C126 68 140 81 140 100C140 119 126 132 104 132H72Q68 132 68 128V72Q68 68 72 68Z';
const letterD='M6 0H44C82 0 106 21 106 56C106 91 82 112 44 112H6Q2 112 2 108V4Q2 0 6 0ZM28 25V87H44C67 87 80 76 80 56C80 36 67 25 44 25Z';
const letterU='M0 32H24V75C24 86 31 92 42 92C53 92 60 86 60 75V32H84V76C84 100 67 114 42 114C17 114 0 100 0 76Z';
const word=`<g fill="#232B33" fill-rule="evenodd"><path d="${letterD}"/><path d="${letterU}" transform="translate(120)"/><path d="${letterD}" transform="translate(226)"/><path d="${letterU}" transform="translate(346)"/></g>`;
function mark(id,shift,mono,gap) {
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="296" height="296"><rect x="-20" y="-20" width="296" height="296" fill="white"/><path d="${a}" fill="black" stroke="black" stroke-width="${gap}" fill-rule="evenodd" transform="rotate(180 128 128) translate(${-shift} ${-shift})"/></mask></defs><g mask="url(#${id})"><path d="${a}" fill="#F2673C" fill-rule="evenodd" transform="translate(${-shift} ${-shift})"/></g><path d="${a}" fill="${mono?'#F2673C':'#232B33'}" fill-rule="evenodd" transform="rotate(180 128 128) translate(${-shift} ${-shift})"/>`;
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900"><rect width="1440" height="900" fill="#F8F5EF"/>${[0,8,16].map((shift,i)=>`<g transform="translate(${i*470+40} 24)"><rect width="450" height="520" rx="12" fill="white"/><g transform="translate(97 20)">${mark('mark'+i,shift,false,12)}</g><g transform="translate(130 280) scale(.75)">${mark('mono'+i,shift,true,12)}</g><text x="32" y="485" font-family="Segoe UI" font-size="20" fill="#232B33">${shift} / spacing</text></g>`).join('')}<g transform="translate(128 620) scale(.7)">${mark('lockup',8,false,12)}</g><g transform="translate(348 665) scale(1.25)">${word}</g></svg>`;
fs.writeFileSync(path.join(__dirname,'spacing.svg'),svg);
sharp(Buffer.from(svg)).png().toFile(path.join(__dirname,'spacing.png'));
module.exports={a,letterD,letterU};
