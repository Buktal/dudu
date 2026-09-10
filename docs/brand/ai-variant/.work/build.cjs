const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/Buktal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const out = path.resolve(__dirname,'..');
const ORANGE = '#F2673C';
const INK = '#232B33';
const CREAM = '#F8F5EF';

// The D is a soft message silhouette, rather than a typographic outline.
const BODY = 'M73 44C48 43 33 59 32 85L28 197C27 210 39 218 50 211L78 194C90 198 108 200 126 200C186 200 226 167 228 124C230 79 191 44 133 42C112 41 91 42 73 44Z';
const EYE = 'M69.2 105.5C73 121 81 128 94 128C107 128 115 121 118.8 105.5C119.7 101.7 117.4 98 113.6 97.2C109.8 96.3 106.1 98.6 105.2 102.4C103.1 111.2 99.6 114 94 114C88.4 114 84.9 111.2 82.8 102.4C81.9 98.6 78.2 96.3 74.4 97.2C70.6 98 68.3 101.7 69.2 105.5Z';
const LETTER_D = 'M6 0H44C82 0 106 21 106 56C106 91 82 112 44 112H6Q2 112 2 108V4Q2 0 6 0ZM28 25V87H44C67 87 80 76 80 56C80 36 67 25 44 25Z';
const LETTER_U = 'M0 32H24V75C24 86 31 92 42 92C53 92 60 86 60 75V32H84V76C84 100 67 114 42 114C17 114 0 100 0 76Z';

// Bake affine transforms into absolute M/L/C coordinates. Exports need only
// a single even-odd path: facial features stay transparent on any background.
function transform(d, {sx=1,sy=1,dx=0,dy=0,angle=0,cx=0,cy=0}={}) {
  const values=d.match(/[MLCZ]|-?(?:\d*\.)?\d+/g);
  const result=[];
  const a=angle*Math.PI/180, cos=Math.cos(a), sin=Math.sin(a);
  for (let i=0;i<values.length;) {
    if (/^[MLCZ]$/.test(values[i])) { result.push(values[i++]); continue; }
    const x=Number(values[i++])*sx+dx, y=Number(values[i++])*sy+dy;
    const ox=cx+(x-cx)*cos-(y-cy)*sin;
    const oy=cy+(x-cx)*sin+(y-cy)*cos;
    result.push(String(+ox.toFixed(2)),String(+oy.toFixed(2)));
  }
  return result.join(' ');
}

const EYE_LEFT=transform(EYE,{sx:.9,sy:.95,dx:6.4,dy:12.8});
const EYE_RIGHT=transform(EYE,{sx:.9,sy:.95,dx:80.4,dy:12.8});
const FACE=`${BODY} ${EYE_LEFT} ${EYE_RIGHT}`;
const SMALL_FACE=`${BODY} ${transform(EYE,{sx:1.04,sy:1.05,dx:-3.76,dy:6.24})} ${transform(EYE,{sx:1.04,sy:1.05,dx:64.24,dy:6.24})}`;

function mark(color=ORANGE,small=false) {
  return `<path d="${small?SMALL_FACE:FACE}" fill="${color}" fill-rule="evenodd"/>`;
}
function wordmark(color=INK) {
  return `<g fill="${color}" fill-rule="evenodd">
    <path d="${LETTER_D}"/>
    <path d="${LETTER_U}" transform="translate(120)"/>
    <path d="${LETTER_D}" transform="translate(226)"/>
    <path d="${LETTER_U}" transform="translate(346)"/>
  </g>`;
}
function lockup(face=ORANGE,text=INK) {
  return `<g transform="scale(.75)">${mark(face)}</g>
  <g transform="translate(216 40)">${wordmark(text)}</g>`;
}
function svg({id,width,height,viewBox=`0 0 ${width} ${height}`,title,desc,content,color}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-labelledby="${id}-title ${id}-desc"${color?` color="${color}"`:''}>
  <title id="${id}-title">${title}</title>
  <desc id="${id}-desc">${desc}</desc>
  ${content}
</svg>
`;
}
function save(name,data) {fs.writeFileSync(path.join(out,name),data,'utf8');}

const description='A soft D-inspired message bubble contains two rounded U-shaped eyes, open at the top. Both eyes are transparent cutouts. The D and U forms reference the DuDu name.';
const files={
  'dudu-ai-mark.svg':svg({id:'dudu-ai-mark',width:256,height:256,title:'DuDu — 表情 D / U 形眼睛版',desc:description,content:mark()}),
  'dudu-ai-mark-simple.svg':svg({id:'dudu-ai-mark-simple',width:256,height:256,title:'DuDu — U 形眼睛版',desc:description,content:mark()}),
  'dudu-ai-mark-mono.svg':svg({id:'dudu-ai-mono',width:256,height:256,title:'DuDu — monochrome AI mark',desc:description,color:INK,content:mark('currentColor')}),
  'dudu-ai-mark-white.svg':svg({id:'dudu-ai-white',width:256,height:256,title:'DuDu — white AI mark',desc:description,content:mark('#fff')}),
  'dudu-ai-logo.svg':svg({id:'dudu-ai-logo',width:672,height:192,title:'DuDu — 嘟嘟 / 表情 D',desc:'The DuDu expression-D mark with the original custom outlined DuDu wordmark. Transparent background.',content:lockup()}),
  'dudu-ai-logo-simple.svg':svg({id:'dudu-ai-logo-simple',width:672,height:192,title:'DuDu — U 形眼睛版横版',desc:'The DuDu mark with two upright U eyes and the custom outlined DuDu wordmark.',content:lockup()}),
  'dudu-ai-logo-dark.svg':svg({id:'dudu-ai-dark',width:672,height:192,title:'DuDu — AI logo for dark backgrounds',desc:'Orange expression-D mark and warm-white DuDu wordmark. All lettering is vector paths.',content:lockup(ORANGE,CREAM)}),
  'dudu-ai-logo-mono.svg':svg({id:'dudu-ai-logo-mono',width:672,height:192,title:'DuDu — monochrome AI logo',desc:'Single-color expression-D logo and DuDu wordmark, with transparent eyes and background.',color:INK,content:lockup('currentColor','currentColor')}),
  'dudu-ai-app.svg':svg({id:'dudu-ai-app',width:256,height:256,title:'DuDu — AI application icon',desc:'White expression-D mark on a rounded orange square.',content:`<rect width="256" height="256" rx="58" fill="${ORANGE}"/>${mark('#fff')}`}),
  'dudu-ai-app-dark.svg':svg({id:'dudu-ai-app-dark',width:256,height:256,title:'DuDu — dark AI application icon',desc:'Orange expression-D mark on a rounded ink square.',content:`<rect width="256" height="256" rx="58" fill="${INK}"/>${mark()}`}),
  'dudu-ai-favicon.svg':svg({id:'dudu-ai-favicon',width:32,height:32,viewBox:'16 16 224 224',title:'DuDu',desc:'Small-size eye-only DuDu mark. Both U eyes are open at the top and enlarged for browser tabs.',content:mark(ORANGE,true)})
};
for(const [name,data] of Object.entries(files))save(name,data);

const preview=svg({id:'dudu-ai-preview',width:1440,height:1040,title:'DuDu — 表情 D / U 形眼睛版',desc:'A second DuDu logo direction: a soft D-like bubble with two U eyes open at the top. Shown as a large mark, horizontal logo, application icons and monochrome versions.',content:`
  <rect width="1440" height="1040" fill="${CREAM}"/>
  <g font-family="Segoe UI, Microsoft YaHei, sans-serif">
    <circle cx="66" cy="55" r="6" fill="${ORANGE}"/>
    <text x="86" y="62" font-size="19" letter-spacing="2.2" font-weight="600" fill="${INK}">DUDU / 嘟嘟</text>
    <text x="1380" y="62" text-anchor="end" font-size="19" fill="#707576">02 / 表情 D · U 形眼睛</text>
    <rect x="60" y="102" width="536" height="470" rx="22" fill="#fff"/>
    <text x="96" y="151" font-size="20" fill="#737778">消息，有了表情。</text>
    <g transform="translate(148 171) scale(1.4)">${mark()}</g>
    <text x="96" y="532" font-size="20" fill="#737778">一个柔软的 D · 两个向上的 U</text>
    <rect x="620" y="102" width="760" height="470" rx="22" fill="#fff"/>
    <text x="656" y="151" font-size="20" fill="#737778">横版组合</text>
    <g transform="translate(656 270)">${lockup()}</g>
    <text x="656" y="532" font-size="23" fill="${INK}">连接消息，也多一点亲近。</text>
    <rect x="60" y="596" width="850" height="270" rx="22" fill="${INK}"/>
    <text x="96" y="641" font-size="19" fill="#C2C6C8">深色背景</text>
    <g transform="translate(182 673) scale(.9)">${lockup(ORANGE,CREAM)}</g>
    <rect x="934" y="596" width="446" height="270" rx="22" fill="#fff"/>
    <text x="970" y="641" font-size="19" fill="#737778">应用图标</text>
    <g transform="translate(986 682) scale(.55)"><rect width="256" height="256" rx="58" fill="${ORANGE}"/>${mark('#fff')}</g>
    <g transform="translate(1190 682) scale(.55)"><rect width="256" height="256" rx="58" fill="${INK}"/>${mark()}</g>
    <line x1="60" y1="900" x2="1380" y2="900" stroke="#DDDCD6"/>
    <text x="60" y="943" font-size="19" fill="#737778">单色 / 小尺寸</text>
    ${[24,32,48].map((size,i)=>`<g transform="translate(${272+i*104} ${954-size/2}) scale(${size/256})">${mark(INK)}</g><text x="${272+i*104+size/2}" y="1003" text-anchor="middle" font-size="15" fill="#737778">${size}px</text>`).join('')}
    <g transform="translate(660 920) scale(.27)">${mark(ORANGE)}</g>
    <text x="694" y="1003" text-anchor="middle" font-size="15" fill="#737778">独立图标</text>
    <rect x="1070" y="932" width="22" height="22" rx="5" fill="${ORANGE}"/>
    <text x="1106" y="949" font-size="18" fill="${INK}">#F2673C</text>
    <rect x="1230" y="932" width="22" height="22" rx="5" fill="${INK}"/>
    <text x="1266" y="949" font-size="18" fill="${INK}">#232B33</text>
  </g>`});
save('preview.svg',preview);

async function render() {
  await sharp(Buffer.from(preview)).png().toFile(path.join(out,'preview.png'));
  await sharp(Buffer.from(files['dudu-ai-mark.svg'])).resize(1024,1024).png().toFile(path.join(out,'dudu-ai-mark.png'));
  await sharp(Buffer.from(files['dudu-ai-app.svg'])).resize(512,512).png().toFile(path.join(out,'dudu-ai-app.png'));
  const qaRows=[['dudu-ai-mark.svg','#fff'],['dudu-ai-mark-mono.svg','#fff'],['dudu-ai-mark-white.svg',INK],['dudu-ai-app.svg','#fff'],['dudu-ai-favicon.svg','#fff']];
  const tiles=[];
  for(let r=0;r<qaRows.length;r++) {
    for(let c=0;c<4;c++) {
      const size=[16,24,32,48][c];
      const small=await sharp(Buffer.from(files[qaRows[r][0]])).resize(size,size).flatten({background:qaRows[r][1]}).png().toBuffer();
      const enlarged=await sharp(small).resize(size*5,size*5,{kernel:'nearest'}).png().toBuffer();
      tiles.push({input:enlarged,left:c*260+16,top:r*260+16});
    }
  }
  await sharp({create:{width:1040,height:1300,channels:4,background:CREAM}}).composite(tiles).png().toFile(path.join(__dirname,'pixel-check.png'));
  console.log(JSON.stringify({directory:out,svgAssets:Object.keys(files),preview:'preview.png',status:'rendered'},null,2));
}
render().catch(error=>{console.error(error);process.exitCode=1;});
