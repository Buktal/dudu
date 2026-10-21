"""Check static site links and markup without installing build dependencies.

Run from the repository root: python docs/design/project-website/check-site.py
"""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re


ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "website"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.ids = set()
        self.links = []
        self.errors = []
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            if attrs["id"] in self.ids:
                self.errors.append(f"duplicate id: {attrs['id']}")
            self.ids.add(attrs["id"])
        for attr in ("href", "src"):
            if attr in attrs:
                self.links.append(attrs[attr])
        if tag == "img" and "alt" not in attrs:
            self.errors.append("image missing alt")


pages = {path.resolve(): Page(path) for path in SITE.rglob("*.html")}
errors = []
for path, page in pages.items():
    errors.extend(f"{path.relative_to(ROOT)}: {item}" for item in page.errors)
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = (path.parent / unquote(url.path)).resolve() if url.path else path
        if target.is_dir():
            target /= "index.html"
        if not target.exists():
            errors.append(f"{path.relative_to(ROOT)}: missing {link}")
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            errors.append(f"{path.relative_to(ROOT)}: missing anchor {link}")

for path in SITE.rglob("*.css"):
    for link in re.findall(r'url\(["\']?([^\)"\']+)', path.read_text(encoding="utf-8")):
        if not urlsplit(link).scheme and not (path.parent / unquote(urlsplit(link).path)).exists():
            errors.append(f"{path.relative_to(ROOT)}: missing CSS resource {link}")

for name in ("index.html", "en.html"):
    page = pages[(SITE / name).resolve()]
    for anchor in ("demo", "products", "channels", "start"):
        if anchor not in page.ids:
            errors.append(f"{name}: missing section {anchor}")

if errors:
    raise SystemExit("\n".join(errors))
print(f"PASS: {len(pages)} HTML pages; local resources, anchors, image alt and CSS imports")
