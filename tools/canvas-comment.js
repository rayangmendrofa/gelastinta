  commentVals() {
    const blank = { name: '', email: '', draft: '', user: null, items: [], err: '' };
    const cur = () => Object.assign({}, blank, (this.state && this.state.cm) || {});
    const c = cur();
    const set = (patch) => this.setState({ cm: Object.assign(cur(), patch) });
    const okEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
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
        set({ user: { name: nm, email: em }, err: '' });
      },
      post: () => {
        const s = cur(); const t = s.draft.trim();
        if (!s.user) return;
        if (!t) return set({ err: 'Write a comment first.' });
        const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        set({ items: s.items.concat([{ name: s.user.name, initial: s.user.name.charAt(0).toUpperCase(), text: t, when: when }]), draft: '', err: '' });
      },
      signout: () => set({ user: null, err: '' })
    };
  }
