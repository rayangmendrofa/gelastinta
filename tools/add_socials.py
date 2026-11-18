# Adds the GelasTinta YouTube, Instagram and TikTok links to every page footer and to the Author contact block.
import glob, re
YT='https://www.youtube.com/@gelastinta'; IG='https://www.instagram.com/gelastinta/'; TT='https://www.tiktok.com/@gelastinta.com'
ICON={
 'yt':'<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="5" width="20" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
 'ig':'<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>',
 'tt':'<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 3c.5 2.6 2.4 4.4 5 4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
}
FOOT=(f'<a class="social" href="{YT}" aria-label="GelasTinta on YouTube: @gelastinta">{ICON["yt"]}YouTube</a>\n'
      f'<a class="social" href="{IG}" aria-label="GelasTinta on Instagram: @gelastinta">{ICON["ig"]}Instagram</a>\n'
      f'<a class="social" href="{TT}" aria-label="GelasTinta on TikTok: @gelastinta.com">{ICON["tt"]}TikTok</a>\n')
n=0
for f in sorted(glob.glob('src/pages/*.dc.html')):
    s=open(f).read()
    if 'GelasTinta on YouTube' in s: continue
    m=re.search(r'<a class="social" href="https://wa.me/447376459918"[^\n]*WhatsApp \+44</a>\n',s)
    assert m, f
    s=s[:m.end()]+FOOT+s[m.end():]
    if f.endswith('Author.dc.html'):
        old='<a href="https://www.linkedin.com/in/raysmendrofa/"><img src="/_blob/49604cde322d454326d28d8c5cfe5ff8" alt="">LinkedIn</a>\n</div>\n'
        assert s.count(old)==1
        row=('<div class="contact-row">\n<span class="kicker" style="color:#C9CED8">GelasTinta socials</span>\n'
             f'<a href="{YT}">{ICON["yt"]}YouTube · @gelastinta</a>\n'
             f'<a href="{IG}">{ICON["ig"]}Instagram · @gelastinta</a>\n'
             f'<a href="{TT}">{ICON["tt"]}TikTok · @gelastinta.com</a>\n</div>\n')
        s=s.replace(old,old+row)
    open(f,'w').write(s); n+=1
print('pages',n)
