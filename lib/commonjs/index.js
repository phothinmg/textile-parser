"use strict";
/*! ************************************************************
 * Copyright © 2012, "Borgar Þorsteinsson"                      *
 *                                                              *
 * textile-js -> A fully featured Textile parser in JavaScript. *
 * Github -> https://github.com/borgar/textile-js               *
 * LICENSE -> MIT                                               *
 ****************************************************************/

function merge(a, b) {
  if (b) {
    for (const k in b) {
      a[k] = b[k];
    }
  }
  return a;
}

const _cache = {};
const re = {
  pattern: {
    punct: "[!-/:-@\\[\\\\\\]-`{-~]",
    space: "\\s",
  },
  escape: function (src) {
    return src.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  },
  collapse: function (src) {
    return src.replace(/(?:#.*?(?:\n|$))/g, "").replace(/\s+/g, "");
  },
  expandPatterns: function (src) {
    // TODO: provide escape for patterns: \[:pattern:] ?
    return src.replace(/\[:\s*(\w+)\s*:\]/g, function (m, k) {
      const ex = re.pattern[k];
      if (ex) {
        return re.expandPatterns(ex);
      } else {
        throw new Error("Pattern " + m + " not found in " + src);
      }
    });
  },
  isRegExp: function (r) {
    return Object.prototype.toString.call(r) === "[object RegExp]";
  },
  compile: function (src, flags) {
    if (re.isRegExp(src)) {
      if (arguments.length === 1) {
        // no flags arg provided, use the RegExp one
        flags =
          (src.global ? "g" : "") +
          (src.ignoreCase ? "i" : "") +
          (src.multiline ? "m" : "");
      }
      src = src.source;
    }
    // don't do the same thing twice
    const ckey = src + (flags || "");
    if (ckey in _cache) {
      return _cache[ckey];
    }
    // allow classes
    let rx = re.expandPatterns(src);
    // allow verbose expressions
    if (flags && /x/.test(flags)) {
      rx = re.collapse(rx);
    }
    // allow dotall expressions
    if (flags && /s/.test(flags)) {
      rx = rx.replace(/([^\\])\./g, "$1[^\\0]");
    }
    // TODO: test if MSIE and add replace \s with [\s\u00a0] if it is?
    // clean flags and output new regexp
    flags = (flags || "").replace(/[^gim]/g, "");
    return (_cache[ckey] = new RegExp(rx, flags));
  },
};

function ribbon(feed) {
  const org = String(feed);
  let slot;
  let pos = 0;
  const self = {
    index: () => {
      return pos;
    },
    save: () => {
      slot = pos;
      return self;
    },
    load: () => {
      pos = slot;
      feed = org.slice(pos);
      return self;
    },
    advance: (n) => {
      pos += typeof n === "string" ? n.length : n;
      feed = org.slice(pos);
      return feed;
    },
    skipWS: () => {
      const ws = /^\s+/.exec(feed);
      if (ws) {
        pos += ws[0].length;
        feed = org.slice(pos);
        return ws[0];
      }
      return "";
    },
    lookbehind: (nchars) => {
      nchars = nchars == null ? 1 : nchars;
      return org.slice(pos - nchars, pos);
    },
    startsWith: (s) => {
      return feed.substring(0, s.length) === s;
    },
    slice: (a, b) => {
      return b != null ? feed.slice(a, b) : feed.slice(a);
    },
    valueOf: () => {
      return feed;
    },
    toString: () => {
      return feed;
    },
  };
  return self;
}

re.pattern.html_id = "[a-zA-Z][a-zA-Z\\d:]*";
re.pattern.html_attr = "(?:\"[^\"]+\"|'[^']+'|[^>\\s]+)";
const reAttr = re.compile(/^\s*([^=\s]+)(?:\s*=\s*("[^"]+"|'[^']+'|[^>\s]+))?/);
const reComment = re.compile(/^<!--(.+?)-->/, "s");
const reEndTag = re.compile(/^<\/([:html_id:])([^>]*)>/);
const reTag = re.compile(
  /^<([:html_id:])((?:\s[^=\s/]+(?:\s*=\s*[:html_attr:])?)+)?\s*(\/?)>/,
);
const reHtmlTagBlock = re.compile(
  /^\s*<([:html_id:](?::[a-zA-Z\d]+)*)((?:\s[^=\s/]+(?:\s*=\s*[:html_attr:])?)+)?\s*(\/?)>/,
);
const singletons = {
  area: 1,
  base: 1,
  br: 1,
  col: 1,
  embed: 1,
  hr: 1,
  img: 1,
  input: 1,
  link: 1,
  meta: 1,
  option: 1,
  param: 1,
  wbr: 1,
};
function testComment(src) {
  return reComment.exec(src);
}
function testOpenTagBlock(src) {
  return reHtmlTagBlock.exec(src);
}
function testOpenTag(src) {
  return reTag.exec(src);
}
function testCloseTag(src) {
  return reEndTag.exec(src);
}
function parseHtmlAttr(attrSrc) {
  // parse ATTR and add to element
  const attr = {};
  let m;
  while ((m = reAttr.exec(attrSrc))) {
    attr[m[1]] =
      typeof m[2] === "string" ? m[2].replace(/^(["'])(.*)\1$/, "$2") : null;
    attrSrc = attrSrc.slice(m[0].length);
  }
  return attr;
}
const OPEN = "OPEN";
const CLOSE = "CLOSE";
const SINGLE = "SINGLE";
const TEXT = "TEXT";
const COMMENT = "COMMENT";
const WS = "WS";
function tokenize(src, whitelistTags, lazy) {
  const tokens = [];
  let textMode = false;
  const oktag = (tag) => {
    if (textMode) {
      return tag === textMode;
    }
    if (whitelistTags) {
      return tag in whitelistTags;
    }
    return true;
  };
  const nesting = {};
  let nestCount = 0;
  let m;
  src = ribbon(String(src));
  do {
    // comment
    if ((m = testComment(src)) && oktag("!")) {
      tokens.push({
        type: COMMENT,
        data: m[1],
        pos: src.index(),
        src: m[0],
      });
      src.advance(m[0]);
    }
    // end tag
    else if ((m = testCloseTag(src)) && oktag(m[1])) {
      const token = {
        type: CLOSE,
        tag: m[1],
        pos: src.index(),
        src: m[0],
      };
      src.advance(m[0]);
      tokens.push(token);
      nesting[token.tag]--;
      nestCount--;
      // console.log( '/' + token.tag, nestCount, nesting );
      if (
        lazy &&
        (!nestCount || !nesting[token.tag] < 0 || isNaN(nesting[token.tag]))
      ) {
        return tokens;
      }
      // if parse is in text mode then that ends here
      if (textMode) {
        textMode = null;
      }
    }
    // open/void tag
    else if ((m = testOpenTag(src)) && oktag(m[1])) {
      const token = {
        type: m[3] || m[1] in singletons ? SINGLE : OPEN,
        tag: m[1],
        pos: src.index(),
        src: m[0],
      };
      if (m[2]) {
        token.attr = parseHtmlAttr(m[2]);
      }
      // some elements can move parser into "text" mode
      if (m[1] === "script" || m[1] === "code" || m[1] === "style") {
        textMode = token.tag;
      }
      if (token.type === OPEN) {
        nestCount++;
        nesting[token.tag] = (nesting[token.tag] || 0) + 1;
        // console.log( token.tag, nestCount, nesting );
      }
      tokens.push(token);
      src.advance(m[0]);
    }
    // text content
    else {
      // no match, move by all "uninteresting" chars
      m = /([^<]+|[^\0])/.exec(src);
      if (m) {
        tokens.push({
          type: TEXT,
          data: m[0],
          pos: src.index(),
          src: m[0],
        });
      }
      src.advance(m ? m[0].length || 1 : 1);
    }
  } while (src.valueOf());
  return tokens;
}

// drop or add tab levels to JsonML tree
function reIndent(ml, shiftBy) {
  // a bit obsessive, but there we are...
  if (!shiftBy) {
    return ml;
  }
  return ml.map(function (s) {
    if (/^\n\t+/.test(s)) {
      if (shiftBy < 0) {
        s = s.slice(0, shiftBy);
      } else {
        for (let i = 0; i < shiftBy; i++) {
          s += "\t";
        }
      }
    } else if (Array.isArray(s)) {
      return reIndent(s, shiftBy);
    }
    return s;
  });
}
function escape(text, escapeQuotes) {
  return text
    .replace(
      /&(?!(#\d{2,}|#x[\da-fA-F]{2,}|[a-zA-Z][a-zA-Z1-4]{1,6});)/g,
      "&amp;",
    )
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, escapeQuotes ? "&quot;" : '"')
    .replace(/'/g, escapeQuotes ? "&#39;" : "'");
}
/**
 *
 * @param {import("./index").JmlNode} jsonml
 * @returns {string}
 */
function toHTML(jsonml) {
  jsonml = jsonml.concat();
  // basic case
  if (typeof jsonml === "string") {
    return escape(jsonml);
  }
  const tag = jsonml.shift();
  let attributes = {};
  let tagAttrs = "";
  const content = [];
  if (
    jsonml.length &&
    typeof jsonml[0] === "object" &&
    !Array.isArray(jsonml[0])
  ) {
    attributes = jsonml.shift();
  }
  while (jsonml.length) {
    content.push(toHTML(jsonml.shift()));
  }
  for (const a in attributes) {
    tagAttrs +=
      attributes[a] == null
        ? ` ${a}`
        : ` ${a}="${escape(String(attributes[a]), true)}"`;
  }
  // be careful about adding whitespace here for inline elements
  if (tag === "!") {
    return `<!--${content.join("")}-->`;
  } else if (tag in singletons || (tag.indexOf(":") > -1 && !content.length)) {
    return `<${tag}${tagAttrs} />`;
  } else {
    return `<${tag}${tagAttrs}>${content.join("")}</${tag}>`;
  }
}

function builder(initArr) {
  const arr = Array.isArray(initArr) ? initArr : [];
  return {
    add: function (node) {
      if (typeof node === "string" && typeof arr[arr.length - 1] === "string") {
        // join if possible
        arr[arr.length - 1] += node;
      } else if (Array.isArray(node)) {
        arr.push(node.filter((s) => s !== undefined));
      } else if (node) {
        arr.push(node);
      }
      return this;
    },
    merge: function (arr) {
      for (let i = 0, l = arr.length; i < l; i++) {
        this.add(arr[i]);
      }
      return this;
    },
    linebreak: function () {
      if (arr.length) {
        this.add("\n");
      }
    },
    get: function () {
      return arr;
    },
  };
}

function fixLinks(ml, dict) {
  if (Array.isArray(ml)) {
    if (ml[0] === "a") {
      // found a link
      const attr = ml[1];
      if (typeof attr === "object" && "href" in attr && attr.href in dict) {
        attr.href = dict[attr.href];
      }
    }
    for (let i = 0, l = ml.length; i < l; i++) {
      if (Array.isArray(ml[i])) {
        fixLinks(ml[i], dict);
      }
    }
  }
  return ml;
}

const reClassid = /^\(([^()\n]+)\)/;
const rePaddingL = /^(\(+)/;
const rePaddingR = /^(\)+)/;
const reAlignBlock = /^(<>|<|>|=)/;
const reAlignImg = /^(<|>|=)/;
const reVAlign = /^(~|\^|-)/;
const reColSpan = /^\\(\d+)/;
const reRowSpan = /^\/(\d+)/;
const reStyles = /^\{([^}]*)\}/;
const reCSS = /^\s*([^:\s]+)\s*:\s*(.+)\s*$/;
const reLang = /^\[([^[\]\n]+)\]/;
const pbaAlignLookup = {
  "<": "left",
  "=": "center",
  ">": "right",
  "<>": "justify",
};
const pbaVAlignLookup = {
  "~": "bottom",
  "^": "top",
  "-": "middle",
};
function copyAttr(s, blacklist) {
  if (!s) {
    return undefined;
  }
  const d = {};
  for (const k in s) {
    if (k in s && (!blacklist || !(k in blacklist))) {
      d[k] = s[k];
    }
  }
  return d;
}
function testBlock(name) {
  // "in" test would be better but what about fn#.?
  return /^(?:table|t[dh]|t(?:foot|head|body)|b[qc]|div|notextile|pre|h[1-6]|fn\\d+|p|###)$/.test(
    name,
  );
}

function parseAttr(input, element, endToken) {
  input = String(input);
  if (!input || element === "notextile") {
    return undefined;
  }
  let m;
  const st = {};
  const o = { style: st };
  let remaining = input;
  const isBlock = testBlock(element);
  const isImg = element === "img";
  const isList = element === "li";
  const isPhrase = !isBlock && !isImg && element !== "a";
  const reAlign = isImg ? reAlignImg : reAlignBlock;
  do {
    if ((m = reStyles.exec(remaining))) {
      m[1].split(";").forEach(function (p) {
        const d = p.match(reCSS);
        if (d) {
          st[d[1]] = d[2];
        }
      });
      remaining = remaining.slice(m[0].length);
      continue;
    }
    if ((m = reLang.exec(remaining))) {
      const rm = remaining.slice(m[0].length);
      if (
        (!rm && isPhrase) ||
        (endToken && endToken === rm.slice(0, endToken.length))
      ) {
        m = null;
      } else {
        o.lang = m[1];
        remaining = remaining.slice(m[0].length);
      }
      continue;
    }
    if ((m = reClassid.exec(remaining))) {
      const rm = remaining.slice(m[0].length);
      if (
        (!rm && isPhrase) ||
        (endToken &&
          (rm[0] === " " || endToken === rm.slice(0, endToken.length)))
      ) {
        m = null;
      } else {
        const bits = m[1].split("#");
        if (bits[0]) {
          o.class = bits[0];
        }
        if (bits[1]) {
          o.id = bits[1];
        }
        remaining = rm;
      }
      continue;
    }
    if (isBlock || isList) {
      if ((m = rePaddingL.exec(remaining))) {
        st["padding-left"] = `${m[1].length}em`;
        remaining = remaining.slice(m[0].length);
        continue;
      }
      if ((m = rePaddingR.exec(remaining))) {
        st["padding-right"] = `${m[1].length}em`;
        remaining = remaining.slice(m[0].length);
        continue;
      }
    }
    // only for blocks:
    if (isImg || isBlock || isList) {
      if ((m = reAlign.exec(remaining))) {
        const align = pbaAlignLookup[m[1]];
        if (isImg) {
          o.align = align;
        } else {
          st["text-align"] = align;
        }
        remaining = remaining.slice(m[0].length);
        continue;
      }
    }
    // only for table cells
    if (element === "td" || element === "tr") {
      if ((m = reVAlign.exec(remaining))) {
        st["vertical-align"] = pbaVAlignLookup[m[1]];
        remaining = remaining.slice(m[0].length);
        continue;
      }
    }
    if (element === "td") {
      if ((m = reColSpan.exec(remaining))) {
        o.colspan = m[1];
        remaining = remaining.slice(m[0].length);
        continue;
      }
      if ((m = reRowSpan.exec(remaining))) {
        o.rowspan = m[1];
        remaining = remaining.slice(m[0].length);
        continue;
      }
    }
  } while (m);
  // collapse styles
  const s = [];
  for (const v in st) {
    s.push(`${v}:${st[v]}`);
  }
  if (s.length) {
    o.style = s.join(";");
  } else {
    delete o.style;
  }
  return remaining === input ? undefined : [input.length - remaining.length, o];
}

const reApostrophe = /(\w)'(\w)/g;
const reArrow = /([^-]|^)->/;
const reClosingDQuote = re.compile(/([^\s[(])"(?=$|\s|[:punct:])/g);
const reClosingSQuote = re.compile(/([^\s[(])'(?=$|\s|[:punct:])/g);
const reCopyright = /(\b ?|\s|^)(?:\(C\)|\[C\])/gi;
const reDimsign = /([\d.,]+['"]? ?)x( ?)(?=[\d.,]['"]?)/g;
const reDoublePrime = re.compile(/(\d*[.,]?\d+)"(?=\s|$|[:punct:])/g);
const reEllipsis = /([^.]?)\.{3}/g;
const reEmdash = /(^|[\s\w])--([\s\w]|$)/g;
const reEndash = / - /g;
const reOpenDQuote = /"/g;
const reOpenSQuote = /'/g;
const reRegistered = /(\b ?|\s|^)(?:\(R\)|\[R\])/gi;
const reSinglePrime = re.compile(/(\d*[.,]?\d+)'(?=\s|$|[:punct:])/g);
const reTrademark = /(\b ?|\s|^)(?:\((?:TM|tm)\)|\[(?:TM|tm)\])/g;
function parseGlyph(src) {
  if (typeof src !== "string") {
    return src;
  }
  // NB: order is important here ...
  return (
    src
      .replace(reArrow, "$1&#8594;")
      .replace(reDimsign, "$1&#215;$2")
      .replace(reEllipsis, "$1&#8230;")
      .replace(reEmdash, "$1&#8212;$2")
      .replace(reEndash, " &#8211; ")
      .replace(reTrademark, "$1&#8482;")
      .replace(reRegistered, "$1&#174;")
      .replace(reCopyright, "$1&#169;")
      // double quotes
      .replace(reDoublePrime, "$1&#8243;")
      .replace(reClosingDQuote, "$1&#8221;")
      .replace(reOpenDQuote, "&#8220;")
      // single quotes
      .replace(reSinglePrime, "$1&#8242;")
      .replace(reApostrophe, "$1&#8217;$2")
      .replace(reClosingSQuote, "$1&#8217;")
      .replace(reOpenSQuote, "&#8216;")
      // fractions and degrees
      .replace(/[([]1\/4[\])]/, "&#188;")
      .replace(/[([]1\/2[\])]/, "&#189;")
      .replace(/[([]3\/4[\])]/, "&#190;")
      .replace(/[([]o[\])]/, "&#176;")
      .replace(/[([]\+\/-[\])]/, "&#177;")
  );
}
//src/textile/re_ext.js
/* eslint camelcase: 0 */
const txblocks = "(?:b[qc]|div|notextile|pre|h[1-6]|fn\\d+|p|###)";
const ucaps =
  "A-Z" +
  // Latin extended À-Þ
  "\u00c0-\u00d6\u00d8-\u00de" +
  // Latin caps with embelishments and ligatures...
  "\u0100\u0102\u0104\u0106\u0108\u010a\u010c\u010e\u0110\u0112\u0114\u0116\u0118\u011a\u011c\u011e\u0120\u0122\u0124\u0126\u0128\u012a\u012c\u012e\u0130\u0132\u0134\u0136\u0139\u013b\u013d\u013f" +
  "\u0141\u0143\u0145\u0147\u014a\u014c\u014e\u0150\u0152\u0154\u0156\u0158\u015a\u015c\u015e\u0160\u0162\u0164\u0166\u0168\u016a\u016c\u016e\u0170\u0172\u0174\u0176\u0178\u0179\u017b\u017d" +
  "\u0181\u0182\u0184\u0186\u0187\u0189-\u018b\u018e-\u0191\u0193\u0194\u0196-\u0198\u019c\u019d\u019f\u01a0\u01a2\u01a4\u01a6\u01a7\u01a9\u01ac\u01ae\u01af\u01b1-\u01b3\u01b5\u01b7\u01b8\u01bc" +
  "\u01c4\u01c7\u01ca\u01cd\u01cf\u01d1\u01d3\u01d5\u01d7\u01d9\u01db\u01de\u01e0\u01e2\u01e4\u01e6\u01e8\u01ea\u01ec\u01ee\u01f1\u01f4\u01f6-\u01f8\u01fa\u01fc\u01fe" +
  "\u0200\u0202\u0204\u0206\u0208\u020a\u020c\u020e\u0210\u0212\u0214\u0216\u0218\u021a\u021c\u021e\u0220\u0222\u0224\u0226\u0228\u022a\u022c\u022e\u0230\u0232\u023a\u023b\u023d\u023e" +
  "\u0241\u0243-\u0246\u0248\u024a\u024c\u024e" +
  "\u1e00\u1e02\u1e04\u1e06\u1e08\u1e0a\u1e0c\u1e0e\u1e10\u1e12\u1e14\u1e16\u1e18\u1e1a\u1e1c\u1e1e\u1e20\u1e22\u1e24\u1e26\u1e28\u1e2a\u1e2c\u1e2e\u1e30\u1e32\u1e34\u1e36\u1e38\u1e3a\u1e3c\u1e3e\u1e40" +
  "\u1e42\u1e44\u1e46\u1e48\u1e4a\u1e4c\u1e4e\u1e50\u1e52\u1e54\u1e56\u1e58\u1e5a\u1e5c\u1e5e\u1e60\u1e62\u1e64\u1e66\u1e68\u1e6a\u1e6c\u1e6e\u1e70\u1e72\u1e74\u1e76\u1e78\u1e7a\u1e7c\u1e7e" +
  "\u1e80\u1e82\u1e84\u1e86\u1e88\u1e8a\u1e8c\u1e8e\u1e90\u1e92\u1e94\u1e9e\u1ea0\u1ea2\u1ea4\u1ea6\u1ea8\u1eaa\u1eac\u1eae\u1eb0\u1eb2\u1eb4\u1eb6\u1eb8\u1eba\u1ebc\u1ebe" +
  "\u1ec0\u1ec2\u1ec4\u1ec6\u1ec8\u1eca\u1ecc\u1ece\u1ed0\u1ed2\u1ed4\u1ed6\u1ed8\u1eda\u1edc\u1ede\u1ee0\u1ee2\u1ee4\u1ee6\u1ee8\u1eea\u1eec\u1eee\u1ef0\u1ef2\u1ef4\u1ef6\u1ef8\u1efa\u1efc\u1efe" +
  "\u2c60\u2c62-\u2c64\u2c67\u2c69\u2c6b\u2c6d-\u2c70\u2c72\u2c75\u2c7e\u2c7f" +
  "\ua722\ua724\ua726\ua728\ua72a\ua72c\ua72e\ua732\ua734\ua736\ua738\ua73a\ua73c\ua73e" +
  "\ua740\ua742\ua744\ua746\ua748\ua74a\ua74c\ua74e\ua750\ua752\ua754\ua756\ua758\ua75a\ua75c\ua75e\ua760\ua762\ua764\ua766\ua768\ua76a\ua76c\ua76e\ua779\ua77b\ua77d\ua77e" +
  "\ua780\ua782\ua784\ua786\ua78b\ua78d\ua790\ua792\ua7a0\ua7a2\ua7a4\ua7a6\ua7a8\ua7aa";
const txcite =
  ":((?:[^\\s()]|\\([^\\s()]+\\)|[()])+?)(?=[!-\\.:-@\\[\\\\\\]-`{-~]+(?:$|\\s)|$|\\s)";
const attr_class = "\\([^\\)]+\\)";
const attr_style = "\\{[^\\}]+\\}";
const attr_lang = "\\[[^\\[\\]]+\\]";
const attr_align = "(?:<>|<|>|=)";
const attr_pad = "[\\(\\)]+";
const txattr = `(?:${attr_class}|${attr_style}|${attr_lang}|${attr_align}|${attr_pad})*`;
const txlisthd = `[\\t ]*(\\*|\\#(?:_|\\d+)?)${txattr}(?: +\\S|\\.\\s*(?=\\S|\\n))`;
const txlisthd2 = `[\\t ]*[\\#\\*]*(\\*|\\#(?:_|\\d+)?)${txattr}(?: +\\S|\\.\\s*(?=\\S|\\n))`;
//src/textile/phrase.js
re.pattern.txattr = txattr;
re.pattern.txcite = txcite;
re.pattern.ucaps = ucaps;
const phraseConvert = {
  "*": "strong",
  "**": "b",
  "??": "cite",
  _: "em",
  __: "i",
  "-": "del",
  "%": "span",
  "+": "ins",
  "~": "sub",
  "^": "sup",
  "@": "code",
};
const rePhrase = /^([[{]?)(__?|\*\*?|\?\?|[-+^~@%])/;
const reImage = re.compile(
  /^!(?!\s)([:txattr:](?:\.[^\n\S]|\.(?:[^./]))?)([^!\s]+?) ?(?:\(((?:[^()]|\([^()]+\))+)\))?!(?::([^\s]+?(?=[!-.:-@[\\\]-`{-~](?:$|\s)|\s|$)))?/,
);
const reImageFenced = re.compile(
  /^\[!(?!\s)([:txattr:](?:\.[^\n\S]|\.(?:[^./]))?)([^!\s]+?) ?(?:\(((?:[^()]|\([^()]+\))+)\))?!(?::([^\s]+?(?=[!-.:-@[\\\]-`{-~](?:$|\s)|\s|$)))?\]/,
);
// NB: there is an exception in here to prevent matching "TM)"
const reCaps = re.compile(
  /^((?!TM\)|tm\))[[:ucaps:]](?:[[:ucaps:]\d]{1,}(?=\()|[[:ucaps:]\d]{2,}))(?:\((.*?)\))?(?=\W|$)/,
);
const reLink = re.compile(
  /^"(?!\s)((?:[^"]|"(?![\s:])[^\n"]+"(?!:))+)"[:txcite:]/,
);
const reLinkFenced = /^\["([^\n]+?)":((?:\[[a-z0-9]*\]|[^\]])+)\]/;
const reLinkTitle = /\s*\(((?:\([^()]*\)|[^()])+)\)$/;
const reFootnote = /^\[(\d+)(!?)\]/;
function parsePhrase(src, options) {
  src = ribbon(src);
  const list = builder();
  let m;
  let pba;
  // loop
  do {
    src.save();
    // linebreak -- having this first keeps it from messing to much with other phrases
    if (src.startsWith("\r\n")) {
      src.advance(1); // skip cartridge returns
    }
    if (src.startsWith("\n")) {
      src.advance(1);
      if (src.startsWith(" ")) {
        src.advance(1);
      } else if (options.breaks) {
        list.add(["br"]);
      }
      list.add("\n");
      continue;
    }
    // inline notextile
    if ((m = /^==(.*?)==/.exec(src))) {
      src.advance(m[0]);
      list.add(m[1]);
      continue;
    }
    // lookbehind => /([\s>.,"'?!;:])$/
    const behind = src.lookbehind(1);
    const boundary = !behind || /^[\s<>.,"'?!;:()[\]%{}]$/.test(behind);
    // FIXME: need to test right boundary for phrases as well
    if ((m = rePhrase.exec(src)) && (boundary || m[1])) {
      src.advance(m[0]);
      const tok = m[2];
      const fence = m[1];
      const phraseType = phraseConvert[tok];
      const code = phraseType === "code";
      if ((pba = !code && parseAttr(src, phraseType, tok))) {
        src.advance(pba[0]);
        pba = pba[1];
      }
      // FIXME: if we can't match the fence on the end, we should output fence-prefix as normal text
      // seek end
      let mMid;
      let mEnd;
      if (fence === "[") {
        mMid = "^(.*?)";
        mEnd = "(?:])";
      } else if (fence === "{") {
        mMid = "^(.*?)";
        mEnd = "(?:})";
      } else {
        const t1 = re.escape(tok.charAt(0));
        mMid = code
          ? "^(\\S+|\\S+.*?\\S)"
          : `^([^\\s${t1}]+|[^\\s${t1}].*?\\S(${t1}*))`;
        mEnd = "(?=$|[\\s.,\"'!?;:()«»„“”‚‘’<>])";
      }
      const rx = re.compile(`${mMid}(${re.escape(tok)})${mEnd}`);
      if ((m = rx.exec(src)) && m[1]) {
        src.advance(m[0]);
        if (code) {
          list.add([phraseType, m[1]]);
        } else {
          list.add([phraseType, pba].concat(parsePhrase(m[1], options)));
        }
        continue;
      }
      // else
      src.load();
    }
    // image
    if ((m = reImage.exec(src)) || (m = reImageFenced.exec(src))) {
      src.advance(m[0]);
      pba = m[1] && parseAttr(m[1], "img");
      const attr = pba ? pba[1] : { src: "" };
      let img = ["img", attr];
      attr.src = m[2];
      attr.alt = m[3] ? (attr.title = m[3]) : "";
      if (m[4]) {
        // +cite causes image to be wraped with a link (or link_ref)?
        // TODO: support link_ref for image cite
        img = ["a", { href: m[4] }, img];
      }
      list.add(img);
      continue;
    }
    // html comment
    if ((m = testComment(src))) {
      src.advance(m[0]);
      list.add(["!", m[1]]);
      continue;
    }
    // html tag
    // TODO: this seems to have a lot of overlap with block tags... DRY?
    if ((m = testOpenTag(src))) {
      src.advance(m[0]);
      const tag = m[1];
      const single = m[3] || m[1] in singletons;
      let element = [tag];
      if (m[2]) {
        element.push(parseHtmlAttr(m[2]));
      }
      if (single) {
        // single tag
        list.add(element).add(src.skipWS());
        continue;
      } else {
        // need terminator
        // gulp up the rest of this block...
        const reEndTag = re.compile(`^(.*?)(</${tag}\\s*>)`, "s");
        if ((m = reEndTag.exec(src))) {
          src.advance(m[0]);
          if (tag === "code") {
            element.push(m[1]);
          } else if (tag === "notextile") {
            // HTML is still parsed, even though textile is not
            list.merge(parseHtml(tokenize(m[1])));
            continue;
          } else {
            element = element.concat(parsePhrase(m[1], options));
          }
          list.add(element);
          continue;
        }
        // end tag is missing, treat tag as normal text...
      }
      src.load();
    }
    // footnote
    if ((m = reFootnote.exec(src)) && /\S/.test(behind)) {
      src.advance(m[0]);
      list.add([
        "sup",
        { class: "footnote", id: "fnr" + m[1] },
        m[2] === "!"
          ? m[1] // "!" suppresses the link
          : ["a", { href: "#fn" + m[1] }, m[1]],
      ]);
      continue;
    }
    // caps / abbr
    if ((m = reCaps.exec(src))) {
      src.advance(m[0]);
      let caps = ["span", { class: "caps" }, m[1]];
      if (m[2]) {
        // FIXME: use <abbr>, not acronym!
        caps = ["acronym", { title: m[2] }, caps];
      }
      list.add(caps);
      continue;
    }
    // links
    if ((boundary && (m = reLink.exec(src))) || (m = reLinkFenced.exec(src))) {
      src.advance(m[0]);
      let title = m[1].match(reLinkTitle);
      let inner = title ? m[1].slice(0, m[1].length - title[0].length) : m[1];
      if ((pba = parseAttr(inner, "a"))) {
        inner = inner.slice(pba[0]);
        pba = pba[1];
      } else {
        pba = {};
      }
      if (title && !inner) {
        inner = title[0];
        title = "";
      }
      pba.href = m[2];
      if (title) {
        pba.title = title[1];
      }
      // links may self-reference their url via $
      if (inner === "$") {
        inner = pba.href.replace(/^(https?:\/\/|ftps?:\/\/|mailto:)/, "");
      }
      list.add(
        ["a", pba].concat(parsePhrase(inner.replace(/^(\.?\s*)/, ""), options)),
      );
      continue;
    }
    // no match, move by all "uninteresting" chars
    m = /([a-zA-Z0-9,.':]+|[ \f\r\t\v\xA0\u2028\u2029]+|[^\0])/.exec(src);
    if (m) {
      list.add(m[0]);
    }
    src.advance(m ? m[0].length || 1 : 1);
  } while (src.valueOf());
  return list.get().map(parseGlyph);
}

re.pattern.txlisthd = txlisthd;
re.pattern.txlisthd2 = txlisthd2;
const reList = re.compile(
  /^((?:[:txlisthd:][^\0]*?(?:\r?\n|$))+)(\s*\n|$)/,
  "s",
);
const reitemList = re.compile(/^([#*]+)([^\0]+?)(\n(?=[:txlisthd2:])|$)/, "s");
function listPad(n) {
  let s = "\n";
  while (n--) {
    s += "\t";
  }
  return s;
}
function testList(src) {
  return reList.exec(src);
}
function parseList(src, options) {
  src = ribbon(src.replace(/(^|\r?\n)[\t ]+/, "$1"));
  const stack = [];
  const currIndex = {};
  const lastIndex = options._lst || {};
  let itemIndex = 0;
  let listAttr;
  let m;
  let n;
  let s;
  while ((m = reitemList.exec(src))) {
    const item = ["li"];
    const destLevel = m[1].length;
    const type = m[1].substr(-1) === "#" ? "ol" : "ul";
    let newLi = null;
    let lst;
    let par;
    let pba;
    let r;
    // list starts and continuations
    if ((n = /^(_|\d+)/.exec(m[2]))) {
      itemIndex = isFinite(n[1])
        ? parseInt(n[1], 10)
        : lastIndex[destLevel] || currIndex[destLevel] || 1;
      m[2] = m[2].slice(n[1].length);
    }
    if ((pba = parseAttr(m[2], "li"))) {
      m[2] = m[2].slice(pba[0]);
      pba = pba[1];
    }
    // list control
    if (/^\.\s*$/.test(m[2])) {
      listAttr = pba || {};
      src.advance(m[0]);
      continue;
    }
    // create nesting until we have correct level
    while (stack.length < destLevel) {
      // list always has an attribute object, this simplifies first-pba resolution
      lst = [type, {}, listPad(stack.length + 1), (newLi = ["li"])];
      par = stack[stack.length - 1];
      if (par) {
        par.li.push(listPad(stack.length));
        par.li.push(lst);
      }
      stack.push({
        ul: lst,
        li: newLi,
        // count attributes's found per list
        att: 0,
      });
      currIndex[stack.length] = 1;
    }
    // remove nesting until we have correct level
    while (stack.length > destLevel) {
      r = stack.pop();
      r.ul.push(listPad(stack.length));
      // lists have a predictable structure - move pba from listitem to list
      if (r.att === 1 && !r.ul[3][1].substr) {
        merge(r.ul[1], r.ul[3].splice(1, 1)[0]);
      }
    }
    // parent list
    par = stack[stack.length - 1];
    if (itemIndex) {
      par.ul[1].start = itemIndex;
      currIndex[destLevel] = itemIndex;
      // falsy prevents this from fireing until it is set again
      itemIndex = 0;
    }
    if (listAttr) {
      // "more than 1" prevent attribute transfers on list close
      par.att = 9;
      merge(par.ul[1], listAttr);
      listAttr = null;
    }
    if (!newLi) {
      par.ul.push(listPad(stack.length), item);
      par.li = item;
    }
    if (pba) {
      par.li.push(pba);
      par.att++;
    }
    Array.prototype.push.apply(par.li, parsePhrase(m[2].trim(), options));
    src.advance(m[0]);
    currIndex[destLevel] = (currIndex[destLevel] || 0) + 1;
  }
  // remember indexes for continuations next time
  options._lst = currIndex;
  while (stack.length) {
    s = stack.pop();
    s.ul.push(listPad(stack.length));
    // lists have a predictable structure - move pba from listitem to list
    if (s.att === 1 && !s.ul[3][1].substr) {
      merge(s.ul[1], s.ul[3].splice(1, 1)[0]);
    }
  }
  return s.ul;
}

const reDeflist =
  /^((?:- (?:[^\n]\n?)+?)+:=(?: *\n[^\0]+?=:(?:\n|$)|(?:[^\0]+?(?:$|\n(?=\n|- )))))+/;
const reItem =
  /^((?:- (?:[^\n]\n?)+?)+):=( *\n[^\0]+?=:\s*(?:\n|$)|(?:[^\0]+?(?:$|\n(?=\n|- ))))/;
function testDefList(src) {
  return reDeflist.exec(src);
}
function parseDefList(src, options) {
  src = ribbon(src.trim());
  // late loading to get around the lack of non-circular-dependency support in RequireJS
  const parsePhrase = require("./phrase").parsePhrase;
  const parseFlow = require("./flow").parseFlow;
  const deflist = ["dl", "\n"];
  let terms;
  let def;
  let m;
  while ((m = reItem.exec(src))) {
    // add terms
    terms = m[1].split(/(?:^|\n)- /).slice(1);
    while (terms.length) {
      deflist.push(
        "\t",
        ["dt"].concat(parsePhrase(terms.shift().trim(), options)),
        "\n",
      );
    }
    // add definitions
    def = m[2].trim();
    deflist.push(
      "\t",
      ["dd"].concat(
        /=:$/.test(def)
          ? parseFlow(def.slice(0, -2).trim(), options)
          : parsePhrase(def, options),
      ),
      "\n",
    );
    src.advance(m[0]);
  }
  return deflist;
}

re.pattern.txattr = txattr;
const reTable = re.compile(
  /^((?:table[:txattr:]\.(?:\s(.+?))\s*\n)?(?:(?:[:txattr:]\.[^\n\S]*)?\|.*?\|[^\n\S]*(?:\n|$))+)([^\n\S]*\n+)?/,
  "s",
);
const reHead = /^table(_?)([^\n]*?)\.(?:[ \t](.+?))?\s*\n/;
const reRow = re.compile(
  /^(?:\|([~^-][:txattr:])\.\s*\n)?([:txattr:]\.[^\n\S]*)?\|(.*?)\|[^\n\S]*(\n|$)/,
  "s",
);
const reCaption = /^\|=([^\n+]*)\n/;
const reColgroup = /^\|:([^\n+]*)\|[\r\t ]*\n/;
const reRowgroup = /^\|([\^\-~])([^\n+]*)\.[ \t\r]*\n/;
const charToTag = {
  "^": "thead",
  "~": "tfoot",
  "-": "tbody",
};
function parseColgroup(src) {
  const colgroup = ["colgroup", {}];
  src.split("|").forEach(function (s, isCol) {
    const col = isCol ? {} : colgroup[1];
    let d = s.trim();
    let m;
    if (d) {
      if ((m = /^\\(\d+)/.exec(d))) {
        col.span = +m[1];
        d = d.slice(m[0].length);
      }
      if ((m = parseAttr(d, "col"))) {
        merge(col, m[1]);
        d = d.slice(m[0]);
      }
      if ((m = /\b\d+\b/.exec(d))) {
        col.width = +m[0];
      }
    }
    if (isCol) {
      colgroup.push("\n\t\t", ["col", col]);
    }
  });
  return colgroup.concat(["\n\t"]);
}
function testTable(src) {
  return reTable.exec(src);
}
function parseTable(src, options) {
  src = ribbon(src.trim());
  const rowgroups = [];
  let colgroup;
  let caption;
  const tAttr = {};
  let tCurr;
  let row;
  let inner;
  let pba;
  let more;
  let m;
  let extended = 0;
  const setRowGroup = function (type, pba) {
    tCurr = [type, pba || {}];
    rowgroups.push(tCurr);
  };
  if ((m = reHead.exec(src))) {
    // parse and apply table attr
    src.advance(m[0]);
    pba = parseAttr(m[2], "table");
    if (pba) {
      merge(tAttr, pba[1]);
    }
    if (m[3]) {
      tAttr.summary = m[3];
    }
  }
  // caption
  if ((m = reCaption.exec(src))) {
    caption = ["caption"];
    if ((pba = parseAttr(m[1], "caption"))) {
      caption.push(pba[1]);
      m[1] = m[1].slice(pba[0]);
    }
    if (/\./.test(m[1])) {
      // mandatory "."
      caption.push(
        m[1]
          .slice(1)
          .replace(/\|\s*$/, "")
          .trim(),
      );
      extended++;
      src.advance(m[0]);
    } else {
      caption = null;
    }
  }
  do {
    // colgroup
    if ((m = reColgroup.exec(src))) {
      colgroup = parseColgroup(m[1]);
      extended++;
    }
    // "rowgroup" (tbody, thead, tfoot)
    else if ((m = reRowgroup.exec(src))) {
      // PHP allows any amount of these in any order
      // and simply translates them straight through
      // the same is done here.
      const tag = charToTag[m[1]] || "tbody";
      pba = parseAttr(`${m[2]} `, tag);
      setRowGroup(tag, pba && pba[1]);
      extended++;
    }
    // row
    else if ((m = reRow.exec(src))) {
      if (!tCurr) {
        setRowGroup("tbody");
      }
      row = ["tr"];
      if (m[2] && (pba = parseAttr(m[2], "tr"))) {
        // FIXME: requires "\.\s?" -- else what ?
        row.push(pba[1]);
      }
      tCurr.push("\n\t\t", row);
      inner = ribbon(m[3]);
      do {
        inner.save();
        // cell loop
        const th = inner.startsWith("_");
        let cell = [th ? "th" : "td"];
        if (th) {
          inner.advance(1);
        }
        pba = parseAttr(inner, "td");
        if (pba) {
          inner.advance(pba[0]);
          cell.push(pba[1]); // FIXME: don't do this if next text fails
        }
        if (pba || th) {
          const p = /^\.\s*/.exec(inner);
          if (p) {
            inner.advance(p[0]);
          } else {
            cell = ["td"];
            inner.load();
          }
        }
        const mx = /^(==.*?==|[^|])*/.exec(inner);
        cell = cell.concat(parsePhrase(mx[0], options));
        row.push("\n\t\t\t", cell);
        more = inner.valueOf().charAt(mx[0].length) === "|";
        inner.advance(mx[0].length + 1);
      } while (more);
      row.push("\n\t\t");
    }
    //
    if (m) {
      src.advance(m[0]);
    }
  } while (m);
  // assemble table
  let table = ["table", tAttr];
  if (extended) {
    if (caption) {
      table.push("\n\t", caption);
    }
    if (colgroup) {
      table.push("\n\t", colgroup);
    }
    rowgroups.forEach(function (tbody) {
      table.push("\n\t", tbody.concat(["\n\t"]));
    });
  } else {
    table = table.concat(reIndent(rowgroups[0].slice(2), -1));
  }
  table.push("\n");
  return table;
}

re.pattern.txblocks = txblocks;
re.pattern.txlisthd = txlisthd;
re.pattern.txattr = txattr;
// HTML tags allowed in the document (root) level that trigger HTML parsing
const allowedBlocktags = {
  p: 0,
  hr: 0,
  ul: 1,
  ol: 0,
  li: 0,
  div: 1,
  pre: 0,
  object: 1,
  script: 0,
  noscript: 0,
  blockquote: 1,
  notextile: 1,
};
const reBlock = re.compile(/^([:txblocks:])/);
const reBlockNormal = re.compile(
  /^(.*?)($|\r?\n(?=[:txlisthd:])|\r?\n(?:\s*\n|$)+)/,
  "s",
);
const reBlockExtended = re.compile(
  /^(.*?)($|\r?\n(?=[:txlisthd:])|\r?\n+(?=[:txblocks:][:txattr:]\.))/,
  "s",
);
const reBlockNormalPre = re.compile(/^(.*?)($|\r?\n(?:\s*\n|$)+)/, "s");
const reBlockExtendedPre = re.compile(
  /^(.*?)($|\r?\n+(?=[:txblocks:][:txattr:]\.))/,
  "s",
);
const reRuler = /^(---+|\*\*\*+|___+)(\r?\n\s+|$)/;
const reLinkRef = re.compile(/^\[([^\]]+)\]((?:https?:\/\/|\/)\S+)(?:\s*\n|$)/);
const reFootnoteDef = /^fn\d+$/;
const hasOwn = Object.prototype.hasOwnProperty;
function extend(target, ...args) {
  for (let i = 1; i < args.length; i++) {
    const src = args[i];
    if (src != null) {
      for (const nextKey in src) {
        if (hasOwn.call(src, nextKey)) {
          target[nextKey] = src[nextKey];
        }
      }
    }
  }
  return target;
}
function paragraph(s, tag, pba, linebreak, options) {
  tag = tag || "p";
  let out = [];
  s.split(/(?:\r?\n){2,}/).forEach(function (bit, i) {
    if (tag === "p" && /^\s/.test(bit)) {
      // no-paragraphs
      bit = bit.replace(/\r?\n[\t ]/g, " ").trim();
      out = out.concat(parsePhrase(bit, options));
    } else {
      if (linebreak && i) {
        out.push(linebreak);
      }
      out.push(
        pba
          ? [tag, pba].concat(parsePhrase(bit, options))
          : [tag].concat(parsePhrase(bit, options)),
      );
    }
  });
  return out;
}
/**
 *
 * @param {string} src
 * @param {import("./index").TextileOptions} options
 * @returns {import("./index").JmlNode}
 */
function parseFlow(src, options) {
  const list = builder();
  let linkRefs;
  let m;
  src = ribbon(src.replace(/^( *\r?\n)+/, ""));
  // loop
  while (src.valueOf()) {
    src.save();
    // link_ref -- this goes first because it shouldn't trigger a linebreak
    if ((m = reLinkRef.exec(src))) {
      if (!linkRefs) {
        linkRefs = {};
      }
      src.advance(m[0]);
      linkRefs[m[1]] = m[2];
      continue;
    }
    // add linebreak
    list.linebreak();
    // named block
    if ((m = reBlock.exec(src))) {
      src.advance(m[0]);
      const blockType = m[0];
      let pba = parseAttr(src, blockType);
      if (pba) {
        src.advance(pba[0]);
        pba = pba[1];
      }
      if ((m = /^\.(\.?)(?:\s|(?=:))/.exec(src))) {
        // FIXME: this whole copyAttr seems rather strange?
        // slurp rest of block
        const extended = !!m[1];
        let reBlockGlob = extended ? reBlockExtended : reBlockNormal;
        if (blockType === "bc" || blockType === "pre") {
          reBlockGlob = extended ? reBlockExtendedPre : reBlockNormalPre;
        }
        m = reBlockGlob.exec(src.advance(m[0]));
        src.advance(m[0]);
        // bq | bc | notextile | pre | h# | fn# | p | ###
        if (blockType === "bq") {
          let inner = m[1];
          if ((m = /^:(\S+)\s+/.exec(inner))) {
            if (!pba) {
              pba = {};
            }
            pba.cite = m[1];
            inner = inner.slice(m[0].length);
          }
          // RedCloth adds all attr to both: this is bad because it produces duplicate IDs
          const par = paragraph(
            inner,
            "p",
            copyAttr(pba, { cite: 1, id: 1 }),
            "\n",
            options,
          );
          list.add(["blockquote", pba, "\n"].concat(par).concat(["\n"]));
        } else if (blockType === "bc") {
          const subPba = pba ? copyAttr(pba, { id: 1 }) : null;
          list.add([
            "pre",
            pba,
            subPba ? ["code", subPba, m[1]] : ["code", m[1]],
          ]);
        } else if (blockType === "notextile") {
          list.merge(parseHtml(tokenize(m[1])));
        } else if (blockType === "###") {
          // ignore the insides
        } else if (blockType === "pre") {
          // I disagree with RedCloth, but agree with PHP here:
          // "pre(foo#bar).. line1\n\nline2" prevents multiline preformat blocks
          // ...which seems like the whole point of having an extended pre block?
          list.add(["pre", pba, m[1]]);
        } else if (reFootnoteDef.test(blockType)) {
          // footnote
          // Need to be careful: RedCloth fails "fn1(foo#m). footnote" -- it confuses the ID
          const fnid = blockType.replace(/\D+/g, "");
          if (!pba) {
            pba = {};
          }
          pba.class = (pba.class ? pba.class + " " : "") + "footnote";
          pba.id = "fn" + fnid;
          list.add(
            [
              "p",
              pba,
              ["a", { href: "#fnr" + fnid }, ["sup", fnid]],
              " ",
            ].concat(parsePhrase(m[1], options)),
          );
        } else {
          // heading | paragraph
          list.merge(paragraph(m[1], blockType, pba, "\n", options));
        }
        continue;
      } else {
        src.load();
      }
    }
    // HTML comment
    if ((m = testComment(src))) {
      src.advance(m[0] + (/(?:\s*\n+)+/.exec(src) || [])[0]);
      list.add(["!", m[1]]);
      continue;
    }
    // block HTML
    if ((m = testOpenTagBlock(src))) {
      const tag = m[1];
      // Is block tag? ...
      if (tag in allowedBlocktags) {
        if (m[3] || tag in singletons) {
          // single?
          src.advance(m[0]);
          if (/^\s*(\n|$)/.test(src)) {
            const elm = [tag];
            if (m[2]) {
              elm.push(parseHtmlAttr(m[2]));
            }
            list.add(elm);
            src.skipWS();
            continue;
          }
        } else if (tag === "pre") {
          const t = tokenize(src, { pre: 1, code: 1 }, tag);
          const p = parseHtml(t, true);
          src.load().advance(p.sourceLength);
          if (/^\s*(\n|$)/.test(src)) {
            list.merge(p);
            src.skipWS(); // skip tailing whitespace
            continue;
          }
        } else if (tag === "notextile") {
          // merge all child elements
          const t = tokenize(src, null, tag);
          let s = 1; // start after open tag
          while (/^\s+$/.test(t[s].src)) {
            s++; // skip whitespace
          }
          const p = parseHtml(t.slice(s, -1), true);
          const x = t.pop();
          src.load().advance(x.pos + x.src.length);
          if (/^\s*(\n|$)/.test(src)) {
            list.merge(p);
            src.skipWS(); // skip tailing whitespace
            continue;
          }
        } else {
          src.skipWS();
          const t = tokenize(src, null, tag);
          const x = t.pop(); // this should be the end tag
          let s = 1; // start after open tag
          while (t[s] && /^[\n\r]+$/.test(t[s].src)) {
            s++; // skip whitespace
          }
          if (x.tag === tag) {
            // inner can be empty
            const inner = t.length > 1 ? src.slice(t[s].pos, x.pos) : "";
            src.advance(x.pos + x.src.length);
            if (/^\s*(\n|$)/.test(src)) {
              let elm = [tag];
              if (m[2]) {
                elm.push(parseHtmlAttr(m[2]));
              }
              if (tag === "script" || tag === "style") {
                elm.push(inner);
              } else {
                const innerHTML = inner.replace(/^\n+/, "").replace(/\s*$/, "");
                const isBlock =
                  /\n\r?\n/.test(innerHTML) || tag === "ol" || tag === "ul";
                const innerElm = isBlock
                  ? parseFlow(innerHTML, options)
                  : parsePhrase(
                      innerHTML,
                      extend({}, options, { breaks: false }),
                    );
                if (isBlock || /^\n/.test(inner)) {
                  elm.push("\n");
                }
                if (isBlock || /\s$/.test(inner)) {
                  innerElm.push("\n");
                }
                elm = elm.concat(innerElm);
              }
              list.add(elm);
              src.skipWS(); // skip tailing whitespace
              continue;
            }
          }
        }
      }
      src.load();
    }
    // ruler
    if ((m = reRuler.exec(src))) {
      src.advance(m[0]);
      list.add(["hr"]);
      continue;
    }
    // list
    if ((m = testList(src))) {
      src.advance(m[0]);
      list.add(parseList(m[0], options));
      continue;
    }
    // definition list
    if ((m = testDefList(src))) {
      src.advance(m[0]);
      list.add(parseDefList(m[0], options));
      continue;
    }
    // table
    if ((m = testTable(src))) {
      src.advance(m[0]);
      list.add(parseTable(m[1], options));
      continue;
    }
    // paragraph
    m = reBlockNormal.exec(src);
    list.merge(paragraph(m[1], "p", undefined, "\n", options));
    src.advance(m[0]);
  }
  return linkRefs ? fixLinks(list.get(), linkRefs) : list.get();
}
exports.toHTML = toHTML;
exports.parseFlow = parseFlow;
