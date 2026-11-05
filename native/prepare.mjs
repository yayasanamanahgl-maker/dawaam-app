import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(here, 'www');
fs.mkdirSync(out, { recursive: true });
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('id="pengingat"')) throw new Error('Bagian pengingat DAWAAM tidak ditemukan');
// Dalam paket Android semua aset sudah lokal. Sembunyikan tombol instal PWA di versi APK.
html = html.replace('</head>', '<style>section[aria-label="Status aplikasi offline"]{display:none!important}</style>\n</head>');
html = html.replace('</body>', '<script defer src="./native-bridge.js"></script>\n</body>');
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const name of ['icon-192.jpg','icon-512.jpg']) {
  fs.copyFileSync(path.join(root, name), path.join(out, name));
}
// Jangan membundel file cadangan pribadi, kredensial, atau data browser pengguna.
console.log('Aset DAWAAM Android siap dibangun, tanpa menyertakan data pribadi.');