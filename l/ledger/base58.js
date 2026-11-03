/** Base58 (alfabeto do Bitcoin/Solana), só o que o selo precisa: assinaturas de 64 bytes. */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s        )                    {
  let n = 0n;
  for (const c of s) {
    const d = ALPHABET.indexOf(c);
    if (d < 0) return null;
    n = n * 58n + BigInt(d);
  }
  const bytes           = [];
  while (n > 0n) { bytes.push(Number(n & 0xffn)); n >>= 8n; }
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  return Uint8Array.from([...new Array        (zeros).fill(0), ...bytes.reverse()]);
}

export function base58Encode(b            )         {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = '';
  while (n > 0n) { s = ALPHABET[Number(n % 58n)]  + s; n /= 58n; }
  let zeros = 0;
  while (zeros < b.length && b[zeros] === 0) zeros++;
  return '1'.repeat(zeros) + s;
}
