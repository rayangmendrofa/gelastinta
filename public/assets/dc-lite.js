/*
 * dc-lite.js — a tiny renderer for GelasTinta's interactive pages.
 *
 * Each interactive page ships three things:
 *   <template id="dc-tpl">  the page markup, with {{holes}}, <sc-if> and <sc-for>
 *   <script type="text/x-dc" id="dc-logic">  class Component extends DCLogic { renderVals() {...} }
 *   <div id="dc-root">  the pre-rendered page (filled at build time, hydrated here)
 *
 * It renders the template with the values from renderVals(), wires up onClick / onChange / ...
 * handlers, and re-renders whenever setState() is called. Like React, it compares each render
 * with the PREVIOUS RENDER (not with the live page), so changes made to the page by other code —
 * the motion layer splitting titles into letters, inline animation styles — are left alone
 * unless the template output for that spot actually changes.
 *
 * Lifecycle: componentDidMount() after the first render, componentDidUpdate() after each later
 * render, componentWillUnmount() when the page is left.
 */
(function () {
  'use strict';

  var EVENT_MAP = {
    onclick: 'click', onchange: 'input', oninput: 'input', onsubmit: 'submit',
    onfocus: 'focus', onblur: 'blur', onmouseenter: 'mouseenter',
    onmouseleave: 'mouseleave', onkeydown: 'keydown', onkeyup: 'keyup'
  };
  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;
  var PRERENDER = !!window.__DC_PRERENDER;

  var instance = null, tpl = null, root = null, pending = false, mounted = false;

  function DCLogic(props) { this.props = props || {}; this.state = null; }
  DCLogic.prototype.setState = function (patch) {
    if (typeof patch === 'function') patch = patch(this.state || {}, this.props);
    this.state = Object.assign({}, this.state || {}, patch || {});
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  DCLogic.prototype.renderVals = function () { return {}; };

  function schedule() {
    if (pending || PRERENDER) return;
    pending = true;
    var run = function () { pending = false; update(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
  }

  // ---- value lookup -------------------------------------------------------
  function lookup(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var q = expr.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    var parts = expr.split('.'), cur;
    for (var s = scope; s; s = s.__parent) {
      if (Object.prototype.hasOwnProperty.call(s, parts[0])) { cur = s[parts[0]]; break; }
    }
    for (var i = 1; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, e) {
      var v = lookup(e, scope);
      return v == null || v === false ? '' : String(v);
    });
  }
  function child(scope, extra) { extra.__parent = scope; return extra; }
  function valueOf(attr, scope) {
    if (attr == null) return undefined;
    var w = attr.match(WHOLE);
    return w ? lookup(w[1], scope) : attr;
  }

  // ---- render template -> fresh (detached) nodes ---------------------------
  function renderChildren(parentTpl, scope, out) {
    for (var n = parentTpl.firstChild; n; n = n.nextSibling) renderNode(n, scope, out);
    return out;
  }

  function renderNode(t, scope, out) {
    if (t.nodeType === 3) { out.push(document.createTextNode(interp(t.data, scope))); return; }
    if (t.nodeType !== 1) return;
    var name = t.localName;

    if (name === 'sc-if') {
      if (valueOf(t.getAttribute('value'), scope)) renderChildren(t, scope, out);
      return;
    }
    if (name === 'sc-for') {
      var list = valueOf(t.getAttribute('list'), scope) || [];
      var as = t.getAttribute('as') || 'item';
      for (var i = 0; i < list.length; i++) {
        var extra = { $index: i }; extra[as] = list[i];
        renderChildren(t, child(scope, extra), out);
      }
      return;
    }

    var el = t.namespaceURI && t.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(t.namespaceURI, t.tagName)
      : document.createElement(name);
    el.__dcH = {};
    for (var a = 0; a < t.attributes.length; a++) {
      var at = t.attributes[a], an = at.name, av = at.value;
      if (an.indexOf('hint-') === 0) continue;
      var whole = av.match(WHOLE);
      if (EVENT_MAP[an]) {
        if (whole) { var fn = lookup(whole[1], scope); if (typeof fn === 'function') el.__dcH[EVENT_MAP[an]] = fn; }
        continue;
      }
      var val = whole ? lookup(whole[1], scope) : interp(av, scope);
      if (an === 'value' || an === 'checked') { el.__dcProp = el.__dcProp || {}; el.__dcProp[an] = val; }
      if (val == null || val === false) continue;
      if (val === true) val = '';
      try { el.setAttribute(at.name, String(val)); } catch (e) { /* ignore invalid names */ }
    }
    var src = name === 'template' ? t.content : t;
    var kids = renderChildren(src, scope, []);
    for (var k = 0; k < kids.length; k++) el.appendChild(kids[k]);
    out.push(el);
  }

  // ---- bookkeeping: what we rendered last time ----------------------------
  function attrMap(el) {
    var m = {};
    for (var i = 0; i < el.attributes.length; i++) m[el.attributes[i].name] = el.attributes[i].value;
    return m;
  }
  function liveKids(el) {
    var out = [];
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 || c.nodeType === 3) out.push(c);
    return out;
  }
  function record(node) { // remember a freshly inserted subtree as "last render"
    if (node.nodeType === 3) { node.__dcText = node.data; return; }
    if (node.nodeType !== 1) return;
    node.__dcAttrs = attrMap(node);
    node.__dcKids = liveKids(node);
    bind(node, node.__dcH); syncProps(node, node.__dcProp);
    for (var i = 0; i < node.__dcKids.length; i++) record(node.__dcKids[i]);
  }

  // ---- patch live DOM -----------------------------------------------------
  function bind(el, handlers) {
    el.__dcH = handlers || {};
    el.__dcBound = el.__dcBound || {};
    Object.keys(el.__dcH).forEach(function (type) {
      if (el.__dcBound[type]) return;
      el.__dcBound[type] = true;
      el.addEventListener(type, function (e) { var h = el.__dcH && el.__dcH[type]; if (h) return h(e); });
    });
  }

  function syncProps(el, props) {
    if (!props) return;
    if ('value' in props) {
      var v = props.value == null ? '' : String(props.value);
      if (el.value !== v) el.value = v;
    }
    if ('checked' in props) el.checked = !!props.checked;
  }

  function sameKind(a, b) {
    return a.nodeType === b.nodeType && (a.nodeType !== 1 ||
      (a.localName === b.localName && a.namespaceURI === b.namespaceURI));
  }

  function placeAfter(parent, node, prev) {
    // insert `node` right after `prev` (a node we rendered) — or first, if there is none
    var ref = prev && prev.parentNode === parent ? prev.nextSibling : parent.firstChild;
    parent.insertBefore(node, ref);
  }

  function patchChildren(parent, fresh) {
    var olds = parent.__dcKids || liveKids(parent); // first update: hydrate the pre-rendered page
    var kept = [], prev = null;
    for (var i = 0; i < fresh.length; i++) {
      var old = olds[i], nu = fresh[i];
      if (old && sameKind(old, nu)) {
        patchNode(old, nu);
        kept.push(old); prev = old;
      } else {
        if (old && old.parentNode === parent) parent.replaceChild(nu, old);
        else placeAfter(parent, nu, prev);
        record(nu);
        kept.push(nu); prev = nu;
      }
    }
    for (var j = fresh.length; j < olds.length; j++) {
      if (olds[j].parentNode === parent) parent.removeChild(olds[j]);
    }
    parent.__dcKids = kept;
  }

  function patchNode(old, nu) {
    if (old.nodeType === 3) {
      var lastText = old.__dcText != null ? old.__dcText : old.data;
      if (lastText !== nu.data) old.data = nu.data;
      old.__dcText = nu.data;
      return;
    }
    var last = old.__dcAttrs || attrMap(old), next = attrMap(nu), k;
    for (k in last) if (!(k in next) && old.hasAttribute(k)) old.removeAttribute(k);
    for (k in next) if (last[k] !== next[k] || !old.hasAttribute(k)) old.setAttribute(k, next[k]);
    old.__dcAttrs = next;
    bind(old, nu.__dcH);
    syncProps(old, nu.__dcProp);
    if (old.localName === 'textarea') return; // its content lives in .value
    patchChildren(old, Array.prototype.slice.call(nu.childNodes));
  }

  // ---- boot --------------------------------------------------------------
  function call(name) {
    if (PRERENDER || typeof instance[name] !== 'function') return;
    try { instance[name](); } catch (e) { if (window.console) console.warn('[dc-lite] ' + name, e); }
  }

  function update() {
    var vals = instance.renderVals() || {};
    patchChildren(root, renderChildren(tpl.content, vals, []));
    if (!mounted) { mounted = true; call('componentDidMount'); }
    else call('componentDidUpdate');
  }

  function boot() {
    tpl = document.getElementById('dc-tpl');
    root = document.getElementById('dc-root');
    var logic = document.getElementById('dc-logic');
    if (!tpl || !root) return;
    var Component = DCLogic;
    if (logic && /class\s+Component/.test(logic.textContent)) {
      Component = new Function('DCLogic', logic.textContent + '\n;return Component;')(DCLogic);
    }
    instance = new Component({});
    update();
    if (!PRERENDER) window.addEventListener('pagehide', function () { call('componentWillUnmount'); });
  }

  window.DCLite = { boot: boot, DCLogic: DCLogic };
  if (!window.__DC_NO_AUTOBOOT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
