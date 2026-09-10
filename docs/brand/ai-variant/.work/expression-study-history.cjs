const fs=require('node:fs');
const path=require('node:path');
const sharp=require('C:/Users/Buktal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const BODY='M73 44C48 43 33 59 32 85L28 197C27 210 39 218 50 211L78 194C90 198 108 200 126 200C186 200 226 167 228 124C230 79 191 44 133 42C112 41 91 42 73 44Z';
const EYE='M69.2 105.5C73 121 81 128 94 128C107 128 115 121 118.8 105.5C119.7 101.7 117.4 98 113.6 97.2C109.8 96.3 106.1 98.6 105.2 102.4C103.1 111.2 99.6 114 94 114C88.4 114 84.9 111.2 82.8 102.4C81.9 98.6 78.2 96.3 74.4 97.2C70.6 98 68.3 101.7 69.2 105.5Z';
function coords(d,sx,sy,dx,dy){let tokens=d.match(/[MLCZ]|-?(?:\d*\.)?\d+/g),v=[];for(let i=0;i<tokens.length;){if(/^[MLCZ]$/.test(tokens[i])){v.push(tokens[i++]);continue;}v.push(String(+(Number(tokens[i++])*sx+dx).toFixed(2)),String(+(Number(tokens[i++])*sy+dy).toFixed(2)));}return v.join(' ');}
const happy=`${BODY} ${coords(EYE,.9,.95,6.4,12.8)} ${coords(EYE,.9,.95,80.4,12.8)}`;
const mouth='M108 150C107 146 110 144 114 146C122 150 134 150 142 146C146 144 149 146 148 150C145 162 138 169 128 169C118 169 111 162 108 150Z';
const source=fs.existsSync(path.join(__dirname,'expression-study.svg'))?fs.readFileSync(path.join(__dirname,'expression-study.svg'),'utf8'):fs.readFileSync(path.resolve(__dirname,'..','dudu-ai-mark.svg'),'utf8');
const before=source.match(/<path d="([^"]+)"/)[1];
const states=[['调整前',before],['舒展的 U 形眼睛',happy],['U 形眼睛 + 微笑',happy+' '+mouth]];
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="500" viewBox="0 0 1320 500"><rect width="1320" height="500" fill="#F8F5EF"/>${states.map(([name,d],i)=>`<g transform="translate(${30+i*430} 30)"><rect width="400" height="440" rx="20" fill="white"/><g transform="translate(47 46) scale(1.2)"><path d="${d}" fill="#F2673C" fill-rule="evenodd"/></g><text x="32" y="380" font-family="Segoe UI, Microsoft YaHei" font-size="23" fill="#232B33">${name}</text><g transform="translate(316 350) scale(.18)"><path d="${d}" fill="#232B33" fill-rule="evenodd"/></g></g>`).join('')}</svg>`;
fs.writeFileSync(path.join(__dirname,'expression-study.svg'),svg);
fs.writeFileSync(path.resolve(__dirname,'..','expression-comparison.svg'),svg);
sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,'..','expression-comparison.png'));
