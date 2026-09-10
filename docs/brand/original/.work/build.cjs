const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/Buktal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const out = path.resolve(__dirname, '..');
const ORANGE = '#F2673C';
const INK = '#232B33';
const CREAM = '#F8F5EF';
const DIALOGUE = 'M48 32H104C146 32 176 60 176 100C176 140 146 168 104 168H76L40 194Q32 200 32 188V48Q32 32 48 32ZM72 68H104C126 68 140 81 140 100C140 119 126 132 104 132H72Q68 132 68 128V72Q68 68 72 68Z';
const LETTER_D = 'M6 0H44C82 0 106 21 106 56C106 91 82 112 44 112H6Q2 112 2 108V4Q2 0 6 0ZM28 25V87H44C67 87 80 76 80 56C80 36 67 25 44 25Z';
const LETTER_U = 'M0 32H24V75C24 86 31 92 42 92C53 92 60 86 60 75V32H84V76C84 100 67 114 42 114C17 114 0 100 0 76Z';

function mark(id, first=ORANGE, second=INK, gap=12) {
  return `<defs>
    <mask id="${id}-channel" x="0" y="0" width="256" height="256" maskUnits="userSpaceOnUse" style="mask-type:luminance">
      <rect width="256" height="256" fill="#fff"/>
      <path d="${DIALOGUE}" transform="rotate(180 128 128)" fill="#000" stroke="#000" stroke-width="${gap}" stroke-linejoin="round" fill-rule="evenodd"/>
    </mask>
  </defs>
  <path d="${DIALOGUE}" fill="${first}" fill-rule="evenodd" mask="url(#${id}-channel)"/>
  <path d="${DIALOGUE}" transform="rotate(180 128 128)" fill="${second}" fill-rule="evenodd"/>`;
}

function wordmark(color=INK) {
  return `<g fill="${color}" fill-rule="evenodd">
    <path d="${LETTER_D}"/>
    <path d="${LETTER_U}" transform="translate(120)"/>
    <path d="${LETTER_D}" transform="translate(226)"/>
    <path d="${LETTER_U}" transform="translate(346)"/>
  </g>`;
}

function lockup(id, first=ORANGE, second=INK, text=INK) {
  return `<g transform="scale(.75)">${mark(id, first, second)}</g>
  <g transform="translate(216 40)">${wordmark(text)}</g>`;
}

function svg({id, width, height, viewBox=`0 0 ${width} ${height}`, title, desc, content, color}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-labelledby="${id}-title ${id}-desc"${color ? ` color="${color}"` : ''}>
  <title id="${id}-title">${title}</title>
  <desc id="${id}-desc">${desc}</desc>
  ${content}
</svg>
`;
}

function save(name, content) { fs.writeFileSync(path.join(out, name), content, 'utf8'); }

const sharedDesc = 'Two opposing D-shaped speech bubbles connect through a clear channel, representing DuDu’s unified sending and receiving of messages.';
const files = {
  'dudu-mark.svg': svg({id:'dudu-mark',width:256,height:256,title:'DuDu — 嘟嘟',desc:sharedDesc,content:mark('dudu-mark')}),
  'dudu-mark-mono.svg': svg({id:'dudu-mono',width:256,height:256,title:'DuDu — monochrome mark',desc:sharedDesc,color:INK,content:mark('dudu-mono','currentColor','currentColor')}),
  'dudu-mark-white.svg': svg({id:'dudu-white',width:256,height:256,title:'DuDu — white mark',desc:sharedDesc,content:mark('dudu-white','#fff','#fff')}),
  'dudu-logo.svg': svg({id:'dudu-logo',width:672,height:192,title:'DuDu — 嘟嘟',desc:'DuDu unified messaging logo, with opposing D-shaped speech bubbles and a custom outlined DuDu wordmark.',content:lockup('dudu-logo')}),
  'dudu-logo-dark.svg': svg({id:'dudu-dark',width:672,height:192,title:'DuDu — logo for dark backgrounds',desc:'Orange and warm white DuDu logo. Transparent background. All lettering is drawn as vector paths.',content:lockup('dudu-dark',ORANGE,CREAM,CREAM)}),
  'dudu-logo-mono.svg': svg({id:'dudu-logo-mono',width:672,height:192,title:'DuDu — monochrome logo',desc:'Single-color DuDu logo with transparent background and outlined lettering.',color:INK,content:lockup('dudu-logo-mono','currentColor','currentColor','currentColor')}),
  'dudu-wordmark.svg': svg({id:'dudu-wordmark',width:430,height:114,title:'DuDu — wordmark',desc:'Custom geometric DuDu lettering. All characters are vector paths; no font is required.',color:INK,content:wordmark('currentColor')}),
  'dudu-app.svg': svg({id:'dudu-app',width:256,height:256,title:'DuDu — application icon',desc:'White DuDu speech-bubble monogram on a rounded signal-orange square.',content:`<rect width="256" height="256" rx="58" fill="${ORANGE}"/>\n  ${mark('dudu-app','#fff','#fff')}`}),
  'dudu-favicon.svg': svg({id:'dudu-favicon',width:32,height:32,viewBox:'24 24 208 208',title:'DuDu',desc:'Small-size DuDu mark with enlarged negative space for browser tabs.',content:mark('dudu-favicon',ORANGE,ORANGE,20)})
};
for (const [name, content] of Object.entries(files)) save(name,content);

// Presentation artwork is separate from the production SVG files.
const preview = svg({
  id:'dudu-preview',width:1440,height:960,title:'DuDu logo presentation',
  desc:'DuDu logo in its primary, application-icon, dark-background and small-size versions. Signal orange F2673C and ink 232B33.',
  content:`<rect width="1440" height="960" fill="${CREAM}"/>
  <g font-family="Segoe UI, Microsoft YaHei, sans-serif">
    <circle cx="66" cy="55" r="6" fill="${ORANGE}"/>
    <text x="86" y="62" font-size="19" letter-spacing="2.2" font-weight="600" fill="${INK}">DUDU / 嘟嘟</text>
    <text x="1380" y="62" text-anchor="end" font-size="19" fill="#6A6E6F">统一消息收发平台</text>
    <rect x="60" y="102" width="916" height="454" rx="20" fill="#fff"/>
    <text x="96" y="151" font-size="20" fill="#737778">双 D · 双向对话</text>
    <g transform="translate(93 231) scale(1.25)">${lockup('preview-primary')}</g>
    <text x="96" y="516" font-size="25" fill="${INK}">一个接口，消息自由来往。</text>
    <rect x="1000" y="102" width="380" height="454" rx="20" fill="${ORANGE}"/>
    <text x="1036" y="151" font-size="20" fill="#fff">应用图标</text>
    <g transform="translate(1062 204)">${mark('preview-app','#fff','#fff')}</g>
    <g transform="translate(1121 491) scale(.32)">${wordmark('#fff')}</g>
    <rect x="60" y="580" width="916" height="254" rx="20" fill="${INK}"/>
    <text x="96" y="625" font-size="19" fill="#C2C6C8">深色背景</text>
    <g transform="translate(236 637) scale(.84)">${lockup('preview-dark',ORANGE,CREAM,CREAM)}</g>
    <rect x="1000" y="580" width="380" height="254" rx="20" fill="#fff"/>
    <text x="1036" y="625" font-size="19" fill="#737778">小尺寸 / 单色</text>
    ${[24,32,48].map((size,i)=>`<g transform="translate(${1045+i*81} ${713-size/2}) scale(${size/256})">${mark('preview-size-'+size,INK,INK)}</g><text x="${1045+i*81+size/2}" y="774" text-anchor="middle" font-size="16" fill="#737778">${size}px</text>`).join('')}
    <g transform="translate(1302 692) scale(.18)">${mark('preview-orange',ORANGE,ORANGE)}</g>
    <line x1="60" y1="870" x2="1380" y2="870" stroke="#DDDCD6"/>
    <rect x="60" y="903" width="24" height="24" rx="6" fill="${ORANGE}"/>
    <text x="98" y="922" font-size="18" fill="${INK}">信号橙 <tspan fill="#777B7B">#F2673C</tspan></text>
    <rect x="345" y="903" width="24" height="24" rx="6" fill="${INK}"/>
    <text x="383" y="922" font-size="18" fill="${INK}">深墨色 <tspan fill="#777B7B">#232B33</tspan></text>
    <text x="1380" y="922" text-anchor="end" font-size="18" fill="#777B7B">连接多平台 · 统一收与发</text>
  </g>`
});
save('preview.svg',preview);

async function render() {
  await sharp(Buffer.from(preview)).png().toFile(path.join(out,'preview.png'));
  await sharp(Buffer.from(files['dudu-mark.svg'])).resize(1024,1024).png().toFile(path.join(out,'dudu-mark.png'));
  await sharp(Buffer.from(files['dudu-app.svg'])).resize(512,512).png().toFile(path.join(out,'dudu-app.png'));
  const qaEntries = [
    ['dudu-mark.svg','#fff'],['dudu-mark-mono.svg','#fff'],['dudu-mark-white.svg',INK],['dudu-app.svg','#fff'],['dudu-favicon.svg','#fff']
  ];
  const tiles=[];
  for (let row=0;row<qaEntries.length;row++) {
    const [name,bg]=qaEntries[row];
    for (let col=0;col<4;col++) {
      const size=[16,24,32,64][col];
      const small=await sharp(Buffer.from(files[name])).resize(size,size).flatten({background:bg}).png().toBuffer();
      const tile=await sharp(small).resize(size*6,size*6,{kernel:'nearest'}).png().toBuffer();
      tiles.push({input:tile,left:col*416+16,top:row*416+16});
    }
  }
  await sharp({create:{width:1664,height:2080,channels:4,background:CREAM}}).composite(tiles).png().toFile(path.join(__dirname,'pixel-check.png'));
  console.log(JSON.stringify({svgAssets:Object.keys(files),preview:'preview.png',status:'rendered'},null,2));
}
render().catch(e=>{console.error(e);process.exitCode=1;});
