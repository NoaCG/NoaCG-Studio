// THE FRONT-MATTER PARSER for the repository's own markdown - a small YAML subset, no dependency.

/**
 * Front matter as `{ data, body, commented }`, or null when the text does not open with a `---`
 * block. `commented` names the keys whose value lost a trailing ` # ...` to the comment rule.
 *
 * The one front-matter parser for the repo's own markdown: the skill adapters that
 * `check-shared-instructions.mjs` validates and the rule store `contracts-lib.mjs` reads. A UTF-8
 * byte order mark is tolerated because Windows PowerShell 5.1 writes one; a trailing ` # comment`
 * is stripped only from an UNQUOTED value, because a quoted value may legitimately carry a `#tag`
 * or an issue number.
 *
 * A QUOTED value runs on until its closing quote, joining continuation lines with a single space
 * the way YAML folds them. Before 2026-09-08 it did not: a value that opened with a quote and
 * closed on a later line fell through to the plain-scalar branch, kept its opening quote, and lost
 * every continuation line, and twelve files printed truncated mid-sentence while the text on disk
 * was correct.
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const data = {};
  const commented = [];
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const [, key, rawValue = ''] = match;
    const value = rawValue.trim();
    if (value === '>-' || value === '>' || value === '|' || value === '|-') {
      const folded = [];
      while (index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1;
        folded.push(lines[index].trim());
      }
      data[key] = folded.join(value.startsWith('>') ? ' ' : '\n').trim();
    } else if (value.startsWith('"') || value.startsWith("'")) {
      // A quoted scalar runs until its closing quote, however many lines that takes. Continuation
      // lines are INDENTED, exactly as in a folded block, so an unclosed quote can never swallow
      // the next key: it stops at the first line in column one and gives back what it read.
      const quote = value[0];
      const parts = [value.slice(1)];
      let closed = closesQuote(parts[0], quote);
      while (!closed && index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1;
        parts.push(lines[index].trim());
        closed = closesQuote(parts[parts.length - 1], quote);
      }
      const joined = parts.join(' ').trim();
      data[key] = unquote((closed ? joined.slice(0, -1) : joined).trim(), quote);
    } else {
      data[key] = value.replace(/\s+#.*$/, '').trim();
      if (data[key] !== value) commented.push(key);
    }
  }
  return { data, body: lines.slice(end + 1).join('\n'), commented };
}

/**
 * Does this text end in the quote that CLOSES a scalar, rather than one written inside it? YAML
 * escapes a quote as `\"` in a double-quoted scalar and as `''` in a single-quoted one, and a
 * value that ends a line on an escape runs on to the next line.
 */
function closesQuote(text, quote) {
  if (!text.endsWith(quote)) return false;
  if (quote === '"') return (/(\\*)$/.exec(text.slice(0, -1))[1].length % 2) === 0;
  return (/('*)$/.exec(text)[1].length % 2) === 1;
}

/** The text inside a quoted scalar, with YAML's escapes read back as the characters they mean. */
function unquote(text, quote) {
  return quote === '"' ? text.replace(/\\(["\\])/g, '$1') : text.replace(/''/g, "'");
}
