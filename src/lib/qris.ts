/**
 * QRIS statis → dinamis (EMVCo TLV + CRC16-CCITT/FALSE).
 * Referensi: https://github.com/verssache/qris-dinamis
 *
 * Alur: parse TLV → tag 01 = "12" (dynamic) → inject tag 54 (nominal)
 *       → buang 55/56/57 (tip/fee) → hitung ulang CRC tag 63.
 */

export interface Tlv {
  tag: string;
  value: string;
}

export interface QrisInfo {
  static: boolean;
  merchantName?: string;
  merchantCity?: string;
  currency?: string;
  amount?: string;
}

const TIP_AND_CRC_TAGS = new Set(['54', '55', '56', '57', '63']);

export function parseTlv(payload: string): Tlv[] {
  const out: Tlv[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) throw new Error('TLV terpotong');
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) throw new Error('TLV tidak valid');
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error('panjang TLV tidak cocok');
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

export function serializeTlv(els: Tlv[]): string {
  return els
    .map((e) => `${e.tag}${String(e.value.length).padStart(2, '0')}${e.value}`)
    .join('');
}

const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    table[i] = crc & 0xffff;
  }
  return table;
})();

/** CRC16-CCITT-FALSE, poly 0x1021, init 0xFFFF. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (const ch of Buffer.from(input, 'utf8')) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >> 8) ^ ch) & 0xff]) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function validateQris(payload: string): { valid: boolean; error?: string } {
  try {
    const els = parseTlv(payload);
    if (els[0]?.tag !== '00' || els[0]?.value !== '01') return { valid: false, error: 'payload format indicator bukan 01' };
    if (!els.some((e) => e.tag === '01')) return { valid: false, error: 'tag 01 tidak ada' };
    const crcEl = els.find((e) => e.tag === '63');
    if (!crcEl) return { valid: false, error: 'tag 63 (CRC) tidak ada' };
    if (!/^[0-9A-Fa-f]{4}$/.test(crcEl.value)) return { valid: false, error: 'CRC bukan 4 hex' };
    const body = payload.slice(0, payload.length - 4);
    const expected = crc16(body);
    if (expected !== crcEl.value.toUpperCase()) {
      return { valid: false, error: `CRC mismatch: expected ${expected}, got ${crcEl.value.toUpperCase()}` };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

export function readQris(payload: string): QrisInfo {
  const els = parseTlv(payload);
  const get = (tag: string) => els.find((e) => e.tag === tag)?.value;
  return {
    static: get('01') === '11',
    merchantName: get('59'),
    merchantCity: get('60'),
    currency: get('53'),
    amount: get('54'),
  };
}

/**
 * Ubah QRIS statis jadi dinamis dengan nominal tertentu.
 * Nominal harus bilangan bulat rupiah > 0 (QRIS tidak mendukung desimal).
 */
export function toDynamicQris(staticPayload: string, amountIdr: number): string {
  if (!Number.isInteger(amountIdr) || amountIdr <= 0) throw new Error('nominal harus bilangan bulat > 0');
  if (String(amountIdr).length > 13) throw new Error('nominal terlalu besar');

  const check = validateQris(staticPayload);
  if (!check.valid) throw new Error(`QRIS statis tidak valid: ${check.error}`);

  const els = parseTlv(staticPayload).filter((e) => !TIP_AND_CRC_TAGS.has(e.tag));
  const byTag = new Map(els.map((e) => [e.tag, e]));

  byTag.set('01', { tag: '01', value: '12' });
  byTag.set('54', { tag: '54', value: String(amountIdr) });

  const sorted = [...byTag.values()].sort((a, b) => Number(a.tag) - Number(b.tag));
  const body = `${serializeTlv(sorted)}6304`;
  return body + crc16(body);
}
