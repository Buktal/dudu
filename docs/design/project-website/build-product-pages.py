"""Build the bilingual module pages and shared product navigation.

Run from the repository root after editing module-content.json.
"""

from html import escape
from pathlib import Path
import json
import re

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[2] / "website"
MODULES = json.loads((HERE / "module-content.json").read_text(encoding="utf-8"))
BASE = "https://buktal.github.io/dudu/"


def filename(module, en):
    return module["id"] + (".en" if en else "") + ".html"


def menu(prefix, en, selected=None):
    links = "".join(
        f'<a href="{prefix}products/{filename(m, en)}"'
        + (' aria-current="page"' if m["id"] == selected else '')
        + f'>{m["name"]} · {m["role"][en]}</a>'
        for m in MODULES
    )
    guides = f'<a href="{prefix}guides/index{(".en" if en else "")}.html">' + ("All usage guides ↗" if en else "部署与使用指南 ↗") + '</a>'
    channels = f'<a href="{prefix}{("en.html" if en else "index.html")}#channels">' + ("Supported channels ↗" if en else "支持渠道 ↗") + '</a>'
    return '<details class="product-menu"><summary>' + ("Products" if en else "产品") + '</summary><div class="product-menu-links">' + links + channels + guides + '</div></details>'


for module in MODULES:
    for en in (False, True):
        def t(zh, english):
            return english if en else zh

        slug = filename(module, en)
        zh_url = BASE + "products/" + filename(module, False)
        en_url = BASE + "products/" + filename(module, True)
        canonical = en_url if en else zh_url
        home = "../en.html" if en else "../index.html"
        guide = "../guides/index.en.html" if en else "../guides/index.html"
        title = module["name"] + " · " + module["role"][en] + " | DuDu"
        display_title = module['title'][en] if en else ''.join(f'<span class="module-title-part">{part}</span>' for part in module['title'][en].replace('，', '，|', 1).split('|'))
        nav = ''.join(f'<a href="{filename(m, en)}"' + (' aria-current="page"' if m == module else '') + f'>{m["name"]}<br>{m["role"][en]}</a>' for m in MODULES)
        cards = ''.join(f'<article><h3>{f[en]}</h3><p>{f[en + 2]}</p></article>' for f in module["features"])
        steps = ''.join(f'<li>{step[en]}</li>' for step in module["steps"])
        image = module["image"]
        share_image = f'<meta property="og:image" content="{BASE}assets/{image}"><meta name="twitter:card" content="summary_large_image">' if image else '<meta name="twitter:card" content="summary">'
        if image:
            visual = f'<figure><a href="../assets/{image}"><img src="../assets/{image}" width="1280" height="720" alt="{module["name"]} · {module["role"][en]}" fetchpriority="high"></a><figcaption>{t("界面示例，内容为演示数据。点击图片查看原图。", "Interface preview with sample data. Select the image to view it in full.")}</figcaption></figure>'
        else:
            flow = [t("官方渠道来信", "Incoming channel message"), t("验证与解析 → 会话和消息存储", "Verification and parsing → conversation storage"), t("实时更新 → 坐席工作台 → 渠道回复", "Real-time update → agent workspace → channel reply")]
            visual = '<div class="server-flow" aria-label="' + t("消息处理流程", "Message processing flow") + '">' + '<span aria-hidden="true">↓</span>'.join(f'<div>{step}</div>' for step in flow) + '</div>'
        toggle = '<button type="button" id="theme-toggle" class="theme-toggle" hidden aria-label="' + t("切换外观", "Switch appearance") + '"><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.6 8.6 0 0 1 10 3.5 8.6 8.6 0 1 0 20.5 14Z"/></svg></button>'
        translation_visual = ""
        if translation := module.get("translation"):
            translation_visual = f'''\n<section id="translation"><h2>{escape(translation['title'][en])}</h2>
<p class="module-lead">{escape(translation['description'][en])}</p>
<figure><a href="../assets/{translation['image']}"><img src="../assets/{translation['image']}" width="{translation['width']}" height="{translation['height']}" alt="{escape(translation['alt'][en], quote=True)}" loading="lazy"></a>
<figcaption>{t('固定演示数据，未连接翻译供应商。点击图片查看原图。', 'Fixed sample data; no translation provider is connected. Select the image to view it in full.')}</figcaption></figure></section>'''
        if assistant := module.get("assistant"):
            translation_visual += f'''\n<section id="assistant"><h2>{escape(assistant['title'][en])}</h2>
<p class="module-lead">{escape(assistant['description'][en])}</p>
<figure><a href="../assets/{assistant['image']}"><img src="../assets/{assistant['image']}" width="{assistant['width']}" height="{assistant['height']}" alt="{escape(assistant['alt'][en], quote=True)}" loading="lazy"></a>
<figcaption>{t('固定演示数据与模型响应，实际使用需配置企业模型服务。点击图片查看原图。', 'Sample data and model responses. Actual use requires your own model service. Select the image to view it in full.')}</figcaption></figure></section>'''
        source = f'''<!doctype html>
<html lang="{t('zh-CN', 'en')}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(module['lead'][en], quote=True)}">
<meta property="og:title" content="{escape(title, quote=True)}"><meta property="og:description" content="{escape(module['lead'][en], quote=True)}">
<meta property="og:type" content="website"><meta property="og:url" content="{canonical}">
{share_image}
<meta name="theme-color" content="#0b151e">
<link rel="canonical" href="{canonical}"><link rel="alternate" hreflang="zh-CN" href="{zh_url}"><link rel="alternate" hreflang="en" href="{en_url}">
<script src="../theme.js"></script><script defer src="../navigation.js"></script>
<link rel="stylesheet" href="../style.css"><link rel="stylesheet" href="../navigation.css"><link rel="stylesheet" href="product.css"><link rel="icon" type="image/svg+xml" href="../assets/dudu.svg">
</head>
<body>
<a class="skip" href="#main">{t('跳至正文', 'Skip to content')}</a>
<header class="site-header shell"><a class="brand" href="{home}"><img src="../assets/dudu.svg" width="32" height="32" alt=""><strong>DuDu</strong></a>
<nav aria-label="{t('主导航', 'Main navigation')}">{menu('../', en, module['id'])}<a href="{guide}">{t('文档', 'Docs')}</a><a href="{filename(module, not en)}" lang="{t('en', 'zh-CN')}">{t('EN', '中')}</a>{toggle}<a class="nav-source" href="https://github.com/Buktal/dudu">GitHub ↗</a></nav></header>
<main id="main" class="shell module-layout"><aside class="module-nav" aria-label="{t('子项目导航', 'Module navigation')}">{nav}</aside>
<article class="module-content"><div class="kicker">{module['name']} / {module['role'][en]}</div><h1>{display_title}</h1><p class="module-lead">{module['lead'][en]}</p>
<div class="actions"><a class="button primary" href="https://github.com/Buktal/dudu/blob/main/{module['repo']}/README.md">{t('使用与部署文档 ↗', 'Usage and setup documentation ↗')}</a><a class="text-link" href="{home}#demo">{t('体验接待导览 ↗', 'Explore the support tour ↗')}</a></div>
{visual}{translation_visual}
<section><h2>{t('主要功能', 'Key capabilities')}</h2><div class="module-cards">{cards}</div></section>
<section><h2>{t('使用流程', 'How it works')}</h2><ol>{steps}</ol></section>
<section class="module-scope"><h2>{t('使用条件与范围', 'Requirements and scope')}</h2><p>{module['scope'][en]}</p><p>{t('各模块配合使用：Admin 开通企业，Console 配置团队与渠道，Desk 负责接待，Server 提供共用服务。MockPulse 为可选的开发联调工具。', 'The modules work together: Admin provisions organizations, Console configures teams and channels, Desk handles conversations, and Server provides shared services. MockPulse is an optional development tool.')}</p></section>
<div class="actions"><a class="text-link" href="{home}#products">{t('返回产品总览 ↗', 'Back to product overview ↗')}</a><a class="text-link" href="{guide}">{t('查看使用指南 ↗', 'Read the guides ↗')}</a></div>
</article></main><footer class="shell"><span>DuDu · Apache-2.0</span><a href="https://github.com/Buktal/dudu">GitHub ↗</a></footer>
</body></html>
'''
        (SITE / "products" / slug).write_text(source, encoding="utf-8")

# Every public page shares the same header; local directories stay inside main.
for path in list(SITE.glob("*.html")) + list((SITE / "guides").glob("*.html")) + list((SITE / "products").glob("*.html")):
    text = path.read_text(encoding="utf-8")
    en = '<html lang="en">' in text
    prefix = "../" if path.parent != SITE else ""
    home = prefix + ("en.html" if en else "index.html")
    guides = prefix + "guides/index" + (".en" if en else "") + ".html"
    language = ("index.html" if en else "en.html") if path.name in ("index.html", "en.html") and path.parent == SITE else (path.name.replace(".en.html", ".html") if en else path.name.replace(".html", ".en.html"))
    demo = prefix + ("demo.en.html" if en else "demo.html")
    in_demo = path.name in ("demo.html", "demo.en.html")
    in_docs = path.parent.name == "guides"
    in_products = path.parent.name == "products"
    product_menu = menu(prefix, en, path.stem.replace('.en', '') if in_products else None)
    if in_products:
        product_menu = product_menu.replace('<summary>', '<summary aria-current="true">', 1)
    theme_button = '<button type="button" id="theme-toggle" class="theme-toggle" hidden aria-label="' + ('Switch appearance' if en else '切换外观') + '"><svg class="sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg><svg class="moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20.5 14A8.6 8.6 0 0 1 10 3.5 8.6 8.6 0 1 0 20.5 14Z"/></svg></button>'
    header = f'''<header class="site-header shell">
<a class="brand" href="{home}" aria-label="{'DuDu home' if en else 'DuDu 首页'}"><img src="{prefix}assets/dudu.svg" width="32" height="32" alt=""><strong>DuDu</strong></a>
<nav aria-label="{'Main navigation' if en else '主导航'}">{product_menu}
<a href="{demo}"{(' aria-current="page"' if in_demo else '')}>{'Demo' if en else '演示'}</a>
<a href="{guides}"{(' aria-current="true"' if in_docs else '')}>{'Docs' if en else '文档'}</a>
<a href="{language}" lang="{'zh-CN' if en else 'en'}" aria-label="{'Switch to Chinese' if en else '切换到英文'}">{'中' if en else 'EN'}</a>
{theme_button}<a class="nav-source" href="https://github.com/Buktal/dudu">GitHub ↗</a>
</nav></header>'''
    text = re.sub(r'<header class="site-header shell">.*?</header>', lambda _: header, text, count=1, flags=re.S)
    if 'href="' + prefix + 'navigation.css"' not in text:
        text = text.replace('</head>', f'<link rel="stylesheet" href="{prefix}navigation.css">\n<script defer src="{prefix}navigation.js"></script>\n</head>')
    # Homepage product panels lead to a product introduction before technical docs.
    if path.parent == SITE:
        for module in MODULES:
            pattern = r'(<article[^>]+id="panel-' + module['id'] + r'".*?<div class="panel-summary">.*?<a class="text-link" href=")[^"]+("[^>]*>)[^<]+</a>'
            text = re.sub(pattern, lambda m: m.group(1) + 'products/' + filename(module, en) + m.group(2) + ('Explore ' if en else '了解 ') + module['name'] + ' ↗</a>', text, flags=re.S)
    text = text.replace(f'href="{home}#demo"', f'href="{demo}"')
    path.write_text(text, encoding="utf-8")

pages = ["", "en.html", "demo.html", "demo.en.html"] + ["guides/" + p.name for p in sorted((SITE / "guides").glob("*.html"))] + ["products/" + p.name for p in sorted((SITE / "products").glob("*.html"))]
(SITE / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>{BASE}{page}</loc></url>\n' for page in pages) + '</urlset>\n', encoding="utf-8")
print(f"Built 10 module pages; updated product navigation and {len(pages)} sitemap entries.")
