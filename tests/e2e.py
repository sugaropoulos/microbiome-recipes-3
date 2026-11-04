"""End-to-end check in a real browser (Playwright + Chromium).

  python3 tests/e2e.py index.html path/to/report.pdf        # multi-file site, as on GitHub Pages
  python3 tests/e2e.py dist/index.html path/to/report.pdf   # single-file bundle

Loads the page, checks the recipe list, uploads the report, uses the source filter, selects
recipes for three meals and downloads the patient PDF. Reports contain patient data: keep them
out of the repository.
Set LOCAL_LIBS=dir to serve pdf.js / pdfmake / xlsx from a local folder instead of the CDN (offline runs).
"""
import os, sys, pathlib
from playwright.sync_api import sync_playwright
page_path = pathlib.Path(sys.argv[1]).resolve(); report = sys.argv[2]
LIBS = os.environ.get('LOCAL_LIBS')
MAP = {'pdf.js/3.11.174/pdf.min.js': 'pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js': 'pdf.worker.min.js',
       'xlsx/0.18.5/xlsx.full.min.js': 'xlsx.full.min.js', 'pdfmake/0.2.7/pdfmake.min.js': 'pdfmake.min.js'}
def route(r):
    u = r.request.url
    if LIBS:
        for k, f in MAP.items():
            if u.endswith(k): return r.fulfill(path=os.path.join(LIBS, f), content_type='application/javascript')
        if u.startswith('http'): return r.abort()
    return r.continue_()
ok = True
def check(cond, msg):
    global ok; print(('OK   ' if cond else 'FAIL ') + msg); ok = ok and cond
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(accept_downloads=True, viewport={'width': 1200, 'height': 900})
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/*', route)
    pg.goto(page_path.as_uri()); pg.wait_for_timeout(800)
    total = pg.evaluate('BUILTIN_RECIPES.length')
    check(f'{total} από {total}' in pg.inner_text('#countLine'), f'recipe list shows all {total} recipes before a report')
    opts = pg.eval_on_selector_all('#srcSel option', 'os => os.map(o => o.textContent)')
    check(len(opts) >= 4, 'source filter: ' + ' | '.join(opts))
    pg.select_option('#srcSel', 'ig'); pg.wait_for_timeout(150)
    print('     3ada diatrofi ->', pg.inner_text('#countLine'))
    pg.select_option('#srcSel', 'books'); pg.wait_for_timeout(150)
    print('     books ->', pg.inner_text('#countLine'))
    pg.click('.recipe .rhead'); pg.wait_for_timeout(150)
    check('Πηγή:' in pg.inner_text('.recipe .detail'), 'book recipe shows its source: ' + [l for l in pg.inner_text('.recipe .detail').split('\n') if 'Πηγή' in l][0])
    pg.click('.recipe .rhead'); pg.select_option('#srcSel', ''); pg.wait_for_timeout(150)
    pg.set_input_files('#pdfInput', report)
    pg.wait_for_function("/Βρέθηκαν|δεν έχει πίνακα/.test(document.querySelector('#pdfMsg').textContent)", timeout=60000)
    check('Βρέθηκαν' in pg.inner_text('#pdfMsg'), 'report: ' + pg.inner_text('#pdfMsg'))
    print('     tiles:', pg.inner_text('#tiles').replace('\n', ' '))
    for i, meal in enumerate([0, 0, 1, 1, 2, 2]):
        pg.locator('.recipe .addbtn').nth(i).click(); pg.locator('.addmenu button').nth(meal).click(); pg.wait_for_timeout(80)
    check('6 συνταγές' in pg.inner_text('#trayTotal'), 'tray: ' + pg.inner_text('.tray-sum').replace('\n', ' '))
    with pg.expect_download(timeout=60000) as dl: pg.click('#trayExport')
    out = pathlib.Path('dist') / dl.value.suggested_filename; dl.value.save_as(out)
    check(out.stat().st_size > 10000, f'PDF downloaded: {out} ({out.stat().st_size // 1024} KB)')
    check(not errs, 'no script errors' + ('' if not errs else ': ' + '; '.join(errs)))
    b.close()
sys.exit(0 if ok else 1)
