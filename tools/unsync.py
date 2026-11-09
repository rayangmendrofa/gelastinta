# Rebuild the canvas copy of a page with comments from src/pages, so it can be edited on disk and
# published back without pulling the whole page through the chat. Undoes sync-from-canvas.mjs: puts
# the canvas comments block (tools/canvas-comment.js) and the comment line that leads the next method
# back, and drops the cmMount hook. Compare the printed sha256 with the canvas list_files sha256
# before publishing.  Usage: python3 tools/unsync.py <git rev> <page.dc.html>...
import hashlib, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '.canvas-out', 'talks')   # git-excluded
logic = open(os.path.join(ROOT, 'scripts', 'comment-logic.js')).read().rstrip() + '\n'
canvas = open(os.path.join(ROOT, 'tools', 'canvas-comment.js')).read()
LEAD = {
    '  gtTheme() {': '  // ── Light/dark switch: the header beaker spills its ink and floods the page dark (or back to light).\n',
    '  gtFigs() {\n    if (this.cpOn) return;': '  // ── Talk 10 charts. Self-wiring: one click/key listener on the document (works even if the page\n  // re-renders and replaces nodes), plus a light rescan that sets up any chart it finds. No observers.\n',
    '  gtFigs() {': "  // ── Animated figures: one looping timeline per figure, chapters you can jump to, Play/Pause.\n  // Each figure's drawing is a pure function of time (frame), so every frame is a whole picture.\n",
}
def unsync(s):
    assert s.count(logic) == 1, 'logic block'
    i = s.index(logic) + len(logic)
    lead = ''
    for k, v in LEAD.items():
        if s.startswith(k, i):
            lead = v; break
    s = s.replace(logic, canvas + lead)
    assert s.count(' this.cmMount(); }') == 1
    return s.replace(' this.cmMount(); }', ' }')
if __name__ == '__main__':
    rev = sys.argv[1]
    for name in sys.argv[2:]:
        s = subprocess.run(['git', 'show', f'{rev}:src/pages/{name}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        out = unsync(s)
        os.makedirs(OUT, exist_ok=True); open(os.path.join(OUT, name), 'w').write(out)
        print(name, hashlib.sha256(out.encode()).hexdigest()[:16])
