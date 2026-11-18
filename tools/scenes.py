# GelasTinta pixel scenes (owner's character pack v3: 128 x 80 frames, one row sprite sheets with
# their own room drawn in). Each sits under the heading of the section it illustrates, as a small
# pixel window: no caption, crisp pixels (image-rendering: pixelated, whole number scale), plays on
# its own, still under reduced motion.
#
#   Hobby-GestureMusic  "A webcam that listens to your hands"   hoodie guitar
#   Hobby-TARS          "Why build a robot from a film?"        lab coat 3D printing
#   Hobby-InMoov        "Why rebuild someone else's hand?"      lab coat robot arm
#   Hobby-FlyBrain      "A brain you can switch on"             lab coat microscope
#   Thesis-BEng         "The abstract, simply"                  lab coat soldering
#   Thesis-MSc          "How it was done"                       lab coat mixing flasks
#   Products            "GelasTinta study packs"                hoodie studying
#   Talks               "Articles"                              suit on the mic
#   Author              "Around the studies"                    suit keynote
#
# Usage: python3 tools/scenes.py [--edits DIR]
#   Applies to src/pages. With --edits, also writes DIR/<page>.json ([{old_text, new_text}]) for
#   pages with comments, to send to the canvas with edit_version (their canvas copy differs from
#   src/pages only in the comments code, so these small edits apply there unchanged).
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PAGES = os.path.join(ROOT, 'src', 'pages')

# name: (asset id, frames, ms per frame)
SC = {
    'guitar': ('dbcf1291740597febe2de2a9ffb43eca', 12, 120),
    'study': ('9a5be7997e4e55b0796ce117cc1ae15a', 12, 170),
    'experiment': ('3742938e71d0a117b44d58aea65a3d5b', 16, 140),
    'microscope': ('7daa6b6a390e9020a0f87db77e7dade6', 14, 170),
    '3d_print': ('6e9ac7a9302e60e3e9b1d9e4603c5a7b', 14, 160),
    'robot_arm': ('8cd63303a2e7db011a8eb2974f6694b4', 14, 170),
    'soldering': ('2fdde950ebf388af93e9cb2003b24fae', 12, 150),
    'keynote': ('5d09be64373c825146583644681ecd34', 14, 170),
    'mic': ('1d9a1f259b72f3fd455a78fd1f8b8252', 10, 150),
}

H2 = '<h2 class="t-h2">{}</h2>'
PLACES = [
    ('Hobby-GestureMusic.dc.html', H2.format('A webcam that listens to your hands'), 'guitar', 'Pixel scene: the GelasTinta character in a hoodie strumming a guitar in his room, music notes floating up'),
    ('Hobby-TARS.dc.html', H2.format('Why build a robot from a film?'), '3d_print', 'Pixel scene: the GelasTinta character in a lab coat waiting while a 3D printer builds a gear layer by layer, then holding it up'),
    ('Hobby-InMoov.dc.html', H2.format('Why rebuild someone else’s hand?'), 'robot_arm', 'Pixel scene: the GelasTinta character in a lab coat starting a robot arm that picks up a cube and hands it over'),
    ('Hobby-FlyBrain.dc.html', H2.format('A brain you can switch on'), 'microscope', 'Pixel scene: the GelasTinta character in a lab coat looking into a microscope as magnified cells appear'),
    ('Thesis-BEng.dc.html', H2.format('The abstract, simply'), 'soldering', 'Pixel scene: the GelasTinta character in a lab coat soldering a circuit board, then showing it off with a blinking light'),
    ('Thesis-MSc.dc.html', H2.format('How it was done'), 'experiment', 'Pixel scene: the GelasTinta character in a lab coat mixing two flasks, which bubble and puff smoke'),
    ('Products.dc.html', H2.format('GelasTinta study packs'), 'study', 'Pixel scene: the GelasTinta character in a hoodie studying at his desk with a laptop and a mug while rain falls outside'),
    ('Talks.dc.html', H2.format('Articles'), 'mic', 'Pixel scene: the GelasTinta character in a suit talking into a microphone under a spotlight'),
    ('Author.dc.html', H2.format('Around the studies'), 'keynote', 'Pixel scene: the GelasTinta character in a suit presenting on stage as a chart grows on the screen and the audience cheers'),
]
COMMENT_PAGES = {'Hobby-GestureMusic.dc.html', 'Hobby-TARS.dc.html', 'Hobby-InMoov.dc.html', 'Hobby-FlyBrain.dc.html', 'Thesis-BEng.dc.html', 'Thesis-MSc.dc.html'}

CSS = '''/* pxs:start */
.pxs{--s:2;position:relative;display:block;flex:none;width:calc(128px*var(--s));max-width:100%;aspect-ratio:128/80;overflow:hidden;border-radius:6px;margin:6px 0 4px;box-shadow:0 1px 2px rgba(16,19,28,.12),0 10px 26px rgba(16,19,28,.12)}
.pxs img{display:block;height:100%;width:auto;max-width:none;image-rendering:crisp-edges;image-rendering:pixelated;animation:pxs-run var(--t) steps(var(--n)) infinite;pointer-events:none;user-select:none;-webkit-user-drag:none}
@keyframes pxs-run{to{transform:translateX(-100%)}}
@media (min-width:1100px){.pxs{--s:3}}
@media (prefers-reduced-motion:reduce){.pxs img{animation:none}}
/* pxs:end */'''


def scene(name, label):
    sid, n, ms = SC[name]
    return (f'<div class="pxs" role="img" aria-label="{label}" style="--n:{n};--t:{n * ms}ms">'
            f'<img src="/_blob/{sid}" alt="" draggable="false"></div>')


def edits_for(s, head, name, label):
    i = s.index('</style>')
    j = s.rfind('\n', 0, i - 60)
    css_old = s[j:i + len('</style>')]
    out = [(css_old, css_old[:-len('</style>')] + CSS + '\n</style>'), (head, head + '\n' + scene(name, label))]
    for o, _ in out:
        assert s.count(o) == 1, (o[:60], s.count(o))
    return out


if __name__ == '__main__':
    out = sys.argv[sys.argv.index('--edits') + 1] if '--edits' in sys.argv else None
    for page, head, name, label in PLACES:
        p = os.path.join(PAGES, page)
        s = open(p).read()
        if '/* pxs:start */' in s:
            print('done already:', page)
            continue
        ed = edits_for(s, head, name, label)
        for o, n in ed:
            s = s.replace(o, n)
        open(p, 'w').write(s)
        if out and page in COMMENT_PAGES:
            os.makedirs(out, exist_ok=True)
            json.dump([{'old_text': o, 'new_text': n} for o, n in ed], open(os.path.join(out, page + '.json'), 'w'), ensure_ascii=False, indent=1)
        print('scene:', page, name)
