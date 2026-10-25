// Safe arithmetic evaluator. No eval(), no Function(): a small recursive-descent
// parser over a whitelisted grammar. This keeps "calculate ..." from ever being a
// code-execution path.

const TOKEN = /\s*(\d+(?:\.\d+)?|[-+*/%^()]|[a-z]+)/gy;

function tokenize(input) {
  const s = String(input).toLowerCase()
    .replace(/\bplus\b|\band\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\btimes\b|\bmultiplied by\b|\bx\b/g, '*')
    .replace(/\bdivided by\b|\bover\b/g, '/')
    .replace(/\bmodulo\b|\bmod\b/g, '%')
    .replace(/\bpower of\b|\bto the power of\b/g, '^')
    .replace(/\bpoint\b/g, '.')
    .replace(/,/g, '');
  const tokens = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(s)) !== null) tokens.push(m[1]);
  return tokens;
}

export function evaluate(input) {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpression() {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = parseFactor();
      if (op === '*') left = left * right;
      else if (op === '/') left = left / right;
      else left = left % right;
    }
    return left;
  }
  function parseFactor() {
    let base = parseUnary();
    if (peek() === '^') {
      next();
      base = Math.pow(base, parseFactor());
    }
    return base;
  }
  function parseUnary() {
    if (peek() === '-') { next(); return -parseUnary(); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const tok = next();
    if (tok === '(') {
      const v = parseExpression();
      if (next() !== ')') throw new Error('unbalanced parentheses');
      return v;
    }
    if (tok === undefined || Number.isNaN(Number(tok))) throw new Error('unexpected token');
    return Number(tok);
  }

  try {
    const value = parseExpression();
    if (pos !== tokens.length) return null;
    if (!Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e10) / 1e10);
}
