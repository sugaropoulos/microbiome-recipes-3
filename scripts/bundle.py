"""Bundle the multi-file app into single HTML files.

  python3 scripts/bundle.py

Writes:
  dist/artifact.html  — page content for publishing as a claude.ai artifact (claude.ai adds <html>/<head>/<body>)
  dist/index.html     — one self-contained file (e.g. to send or to host anywhere as a single file)

GitHub Pages does not need this: it serves index.html + css/ + js/ + data/ directly.
"""
import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'index.html').read_text(encoding='utf-8')

def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')

def inline(html, skip_css=()):
    def css(m):
        href = m.group(1)
        if href.startswith('http'): return m.group(0)
        if href in skip_css: return ''
        return '<style>\n' + read(href) + '\n</style>'
    def js(m):
        s = m.group(1)
        if s.startswith('http'): return m.group(0)
        body = read(s)
        assert '</script' not in body.lower(), f'{s} contains </script'
        return f'<script>\n// ---- {s} ----\n{body}\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    return html

full = inline(src)
(ROOT / 'dist').mkdir(exist_ok=True)
(ROOT / 'dist' / 'index.html').write_text(full, encoding='utf-8')

# artifact: head content (minus charset/viewport) + body content, no base.css (claude.ai provides the same reset)
art = inline(src, skip_css=('css/base.css',))
head = re.search(r'<head>(.*?)</head>', art, re.S).group(1)
head = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', '', head)
body = re.search(r'<body>(.*)</body>', art, re.S).group(1)
(ROOT / 'dist' / 'artifact.html').write_text(head.strip() + '\n' + body.strip() + '\n', encoding='utf-8')
for f in ('index.html', 'artifact.html'):
    print(f'dist/{f}: {(ROOT / "dist" / f).stat().st_size / 1e6:.2f} MB')
