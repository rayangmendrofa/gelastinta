/*
 * dc-lite.js — a tiny renderer for GelasTinta's interactive pages.
 *
 * Each interactive page ships three things:
 *   <template id="dc-tpl">  the page markup, with {{holes}}, <sc-if> and <sc-for>
 *   <script type="text/x-dc" id="dc-logic">  class Component extends DCLogic { renderVals() {...} }
 *   <div id="dc-root">  the pre-rendered page (filled at build time, patched here)
 *
 * This file renders the template with the values from renderVals(), wires up
 * onClick / onChange / ... handlers, and re-renders whenever setState() is called.
 * It patches the existing DOM in place, so focus and scroll are kept.
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

  var instance = null, tpl = null, root = null, pending = false;

  function DCLogic(props) { this.props = props || {}; this.state = null; }
  DCLogic.prototype.setState = function (patch) {
    if (typeof patch === 'function') patch = patch(this.state || {}, this.props);
    this.state = Object.assign({}, this.state || {}, patch || {});
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  DCLogic.prototype.renderVals = function () { return {}; };

  function schedule() {
    if (pending) return;
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

  // ---- render template -> fresh nodes ------------------------------------
  function renderChildren(parentTpl, scope, out) {
    for (var n = parentTpl.firstChild; n; n = n.nextSibling) renderNode(n, scope, out);
    return out;
  }

  function renderNode(t, scope, out) {
    if (t.nodeType === 3) { out.push(document.createTextNode(interp(t.data, scope))); return; }
    if (t.nodeType !== 1) return;
    var name = t.localName;

    if (name === 'sc-if') {
      var cond = valueOf(t.getAttribute('value'), scope);
      if (cond) renderChildren(t, scope, out);
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

  function valueOf(attr, scope) {
    if (attr == null) return undefined;
    var w = attr.match(WHOLE);
    return w ? lookup(w[1], scope) : attr;
  }

  // ---- patch live DOM ----------------------------------------------------
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

  function patchChildren(parent, fresh) {
    var i = 0;
    for (; i < fresh.length; i++) {
      var old = parent.childNodes[i], nu = fresh[i];
      if (!old) { appendFresh(parent, nu); continue; }
      if (old.nodeType === 8) { parent.removeChild(old); i--; continue; } // drop comments
      if (sameKind(old, nu)) patchNode(old, nu);
      else { parent.replaceChild(nu, old); wire(nu); }
    }
    while (parent.childNodes.length > fresh.length) parent.removeChild(parent.lastChild);
  }

  function appendFresh(parent, nu) { parent.appendChild(nu); wire(nu); }

  function wire(node) { // attach handlers + props on a newly inserted subtree
    if (node.nodeType !== 1) return;
    bind(node, node.__dcH); syncProps(node, node.__dcProp);
    for (var c = node.firstChild; c; c = c.nextSibling) wire(c);
  }

  function patchNode(old, nu) {
    if (old.nodeType === 3) { if (old.data !== nu.data) old.data = nu.data; return; }
    var a, i;
    for (i = old.attributes.length - 1; i >= 0; i--) {
      a = old.attributes[i];
      if (!nu.hasAttribute(a.name)) old.removeAttribute(a.name);
    }
    for (i = 0; i < nu.attributes.length; i++) {
      a = nu.attributes[i];
      if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);
    }
    bind(old, nu.__dcH);
    syncProps(old, nu.__dcProp);
    if (old.localName === 'textarea') return; // content lives in .value
    patchChildren(old, Array.prototype.slice.call(nu.childNodes));
  }

  // ---- boot --------------------------------------------------------------
  function update() {
    var vals = instance.renderVals() || {};
    var fresh = renderChildren(tpl.content, vals, []);
    patchChildren(root, fresh);
    if (!root.__dcDidMount && typeof instance.componentDidMount === 'function') {
      root.__dcDidMount = true; instance.componentDidMount();
    }
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
  }

  window.DCLite = { boot: boot, DCLogic: DCLogic };
  if (!window.__DC_NO_AUTOBOOT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
