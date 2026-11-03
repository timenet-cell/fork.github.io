/**
 * JSON canónico e leitura estrita, espelho de `entry.rs` (`canonical_json`, `parse_strict`).
 * Canónico: chaves ordenadas por bytes UTF-8, sem espaços, texto como o `JSON.stringify`,
 * só inteiros em ±(2^53−1). Estrito ao ler: sem chaves repetidas, sem números que não sejam
 * inteiros seguros, sem texto depois do valor, sem substitutos soltos.
 */
import { LedgerError } from './error.js';
import { utf8 } from './bytes.js';

export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER; // 2^53 − 1
/** Nada que se leia passa disto, nem com espaços: recusa-se antes de interpretar. */
export const MAX_INPUT_BYTES = 64 * 1024;
/** O limite de recursão do serde_json (128): mais fundo do que 127 níveis é recusado. */
const MAX_DEPTH = 127;

                                                                                    
                                                        

/** Um objeto sem protótipo: `__proto__` é só mais uma chave. */
export const newObject = ()             => Object.create(null)              ;

export const isObject = (v         )                  =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function compareBytes(a        , b        )         {
  const x = utf8(a);
  const y = utf8(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i]  - y[i] ;
  return x.length - y.length;
}

export function canonicalJson(v           )         {
  switch (typeof v) {
    case 'object': {
      if (v === null) return 'null';
      if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
      const keys = Object.keys(v).sort(compareBytes);
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k] )}`).join(',')}}`;
    }
    case 'number':
      if (!Number.isSafeInteger(v) || Object.is(v, -0)) {
        throw new LedgerError('bad_json', `${v} is not an integer within ±(2^53-1)`);
      }
      return String(v);
    case 'string':
    case 'boolean':
      return JSON.stringify(v);
    default:
      throw new LedgerError('bad_json', `${typeof v} is not JSON`);
  }
}

const bad = (m        )              => new LedgerError('bad_json', m);

export function parseStrict(s        , max = MAX_INPUT_BYTES)            {
  const size = utf8(s).length;
  if (size > max) throw new LedgerError('too_large', `${size} bytes`);
  let i = 0;

  const ws = ()       => {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++;
  };

  const str = ()         => {
    i++; // "
    let out = '';
    for (;;) {
      if (i >= s.length) throw bad('unterminated string');
      const c = s.charCodeAt(i);
      if (c === 0x22) { i++; return out; }
      if (c < 0x20) throw bad('control character in a string');
      if (c !== 0x5c) {
        if (c >= 0xd800 && c <= 0xdbff) {
          const n = s.charCodeAt(i + 1);
          if (!(n >= 0xdc00 && n <= 0xdfff)) throw bad('lone surrogate');
          out += s[i]  + s[i + 1] ;
          i += 2;
          continue;
        }
        if (c >= 0xdc00 && c <= 0xdfff) throw bad('lone surrogate');
        out += s[i] ;
        i++;
        continue;
      }
      const e = s[i + 1];
      i += 2;
      switch (e) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'u': {
          const unit = ()         => {
            const h = s.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) throw bad('bad \\u escape');
            i += 4;
            return parseInt(h, 16);
          };
          const u = unit();
          if (u >= 0xdc00 && u <= 0xdfff) throw bad('lone surrogate');
          if (u >= 0xd800 && u <= 0xdbff) {
            if (s[i] !== '\\' || s[i + 1] !== 'u') throw bad('lone surrogate');
            i += 2;
            const lo = unit();
            if (!(lo >= 0xdc00 && lo <= 0xdfff)) throw bad('lone surrogate');
            out += String.fromCharCode(u, lo);
          } else out += String.fromCharCode(u);
          break;
        }
        default: throw bad('bad escape');
      }
    }
  };

  const num = ()         => {
    const m = /^-?(0|[1-9][0-9]*)/.exec(s.slice(i, i + 400));
    if (!m) throw bad('bad number');
    const next = s[i + m[0].length];
    if (next === '.' || next === 'e' || next === 'E') throw bad('a number that is not an integer');
    i += m[0].length;
    const n = Number(m[0]);
    if (m[0] === '-0') throw bad('negative zero');
    if (!Number.isSafeInteger(n)) throw bad(`${m[0]} is beyond ±(2^53-1)`);
    return n;
  };

  const value = (depth        )            => {
    ws();
    const c = s[i];
    if (c === '{') {
      if (depth >= MAX_DEPTH) throw bad('recursion limit exceeded');
      i++;
      const o = newObject();
      ws();
      if (s[i] === '}') { i++; return o; }
      for (;;) {
        ws();
        if (s[i] !== '"') throw bad('expected a key');
        const k = str();
        if (Object.hasOwn(o, k)) throw bad(`key ${JSON.stringify(k)} appears twice`);
        ws();
        if (s[i] !== ':') throw bad('expected ":"');
        i++;
        o[k] = value(depth + 1);
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return o; }
        throw bad('expected "," or "}"');
      }
    }
    if (c === '[') {
      if (depth >= MAX_DEPTH) throw bad('recursion limit exceeded');
      i++;
      const a              = [];
      ws();
      if (s[i] === ']') { i++; return a; }
      for (;;) {
        a.push(value(depth + 1));
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        throw bad('expected "," or "]"');
      }
    }
    if (c === '"') return str();
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return num();
    for (const [word, val] of [['true', true], ['false', false], ['null', null]]         ) {
      if (s.startsWith(word, i)) { i += word.length; return val; }
    }
    throw bad('not json');
  };

  const v = value(0);
  ws();
  if (i < s.length) throw bad('trailing characters');
  return v;
}
