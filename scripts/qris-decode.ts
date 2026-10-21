/**
 * Decode gambar QRIS statis → payload string untuk QRIS_STATIC_PAYLOAD.
 *
 *   npx tsx scripts/qris-decode.ts "path/ke/qris.png"
 *
 * Kalau QRIS-nya berupa PDF/screenshot HP, convert dulu ke PNG.
 * Output ditempel ke .env sebagai QRIS_STATIC_PAYLOAD="...".
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { readQris, validateQris } from '../src/lib/qris';

const file = process.argv[2];
if (!file) {
  console.error('Pemakaian: npx tsx scripts/qris-decode.ts <gambar.png>');
  process.exit(1);
}

const png = PNG.sync.read(readFileSync(file));
const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

if (!result) {
  console.error('QR tidak terbaca. Coba gambar lebih besar/lebih tajam (min ~400px).');
  process.exit(1);
}

const check = validateQris(result.data);
if (!check.valid) {
  console.error(`Bukan QRIS valid: ${check.error}`);
  process.exit(1);
}

const info = readQris(result.data);
console.log('Merchant :', info.merchantName ?? '-');
console.log('Kota     :', info.merchantCity ?? '-');
console.log('Tipe     :', info.static ? 'statis' : 'dinamis');
if (info.amount) console.log('Nominal  :', info.amount);

if (!info.static) {
  console.error('\nQR ini sudah dinamis (ada nominal). Pakai QRIS statis tanpa nominal.');
  process.exit(1);
}

console.log('\nQRIS_STATIC_PAYLOAD=' + result.data);
