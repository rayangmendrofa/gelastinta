  componentDidMount() {
    // Load saved comments for this page, and remember a returning commenter.
    const page = (typeof location !== 'undefined' ? location.pathname : '/').replace(/\/+$/, '') || '/';
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('gt-commenter') || 'null'); } catch (e) { saved = null; }
    const cur = Object.assign({ name: '', email: '', draft: '', user: null, items: [], err: '', busy: false }, (this.state && this.state.cm) || {});
    if (saved && saved.name && saved.email) cur.user = saved;
    this.setState({ cm: cur });
    if (typeof fetch !== 'function') return;
    fetch('/api/comments?page=' + encodeURIComponent(page))
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((d) => {
        const c = Object.assign({}, (this.state && this.state.cm) || cur);
        c.items = (d.comments || []).map((x) => ({ name: x.name, initial: (x.name || '?').charAt(0).toUpperCase(), text: x.text, when: x.when }));
        this.setState({ cm: c });
      })
      .catch(() => {});
  }
  commentVals() {
    const blank = { name: '', email: '', draft: '', user: null, items: [], err: '', busy: false };
    const cur = () => Object.assign({}, blank, (this.state && this.state.cm) || {});
    const c = cur();
    const set = (patch) => this.setState({ cm: Object.assign(cur(), patch) });
    const okEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    const page = (typeof location !== 'undefined' ? location.pathname : '/').replace(/\/+$/, '') || '/';
    const n = c.items.length;
    return {
      name: c.name, email: c.email, draft: c.draft,
      notReg: !c.user, reg: !!c.user, who: c.user ? c.user.name : '',
      hasErr: !!c.err, err: c.err,
      count: n === 0 ? 'No comments yet' : (n === 1 ? '1 comment' : n + ' comments'),
      empty: n === 0, some: n > 0,
      items: c.items,
      onName: (e) => set({ name: e.target.value, err: '' }),
      onEmail: (e) => set({ email: e.target.value, err: '' }),
      onDraft: (e) => set({ draft: e.target.value, err: '' }),
      register: () => {
        const s = cur(); const nm = s.name.trim(); const em = s.email.trim();
        if (!nm) return set({ err: 'Please add your name.' });
        if (!okEmail(em)) return set({ err: 'Please enter a valid email address.' });
        const user = { name: nm, email: em };
        try { localStorage.setItem('gt-commenter', JSON.stringify(user)); } catch (e) {}
        set({ user: user, err: '' });
      },
      post: () => {
        const s = cur(); const t = s.draft.trim();
        if (!s.user || s.busy) return;
        if (!t) return set({ err: 'Write a comment first.' });
        set({ busy: true, err: '' });
        fetch('/api/comments', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ page: page, name: s.user.name, email: s.user.email, text: t })
        })
          .then((r) => r.json().then((d) => ({ ok: r.ok, d: d })))
          .then((res) => {
            if (!res.ok) return set({ busy: false, err: res.d.error || 'Could not post your comment. Please try again.' });
            const x = res.d.comment;
            const now = cur();
            set({ busy: false, draft: '', err: '', items: now.items.concat([{ name: x.name, initial: x.name.charAt(0).toUpperCase(), text: x.text, when: x.when }]) });
          })
          .catch(() => set({ busy: false, err: 'Could not post your comment. Please check your connection and try again.' }));
      },
      signout: () => {
        try { localStorage.removeItem('gt-commenter'); } catch (e) {}
        set({ user: null, err: '' });
      }
    };
  }
