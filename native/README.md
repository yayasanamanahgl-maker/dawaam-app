# DAWAAM Android — tahap 3A (uji notifikasi)

**Tujuan:** notifikasi lokal Android untuk jam yang disetel pengguna, tanpa login, backend atau koneksi saat notifikasi berjalan. Ini **berbeda** dari PWA GitHub Pages yang tidak dapat menjamin notifikasi saat ditutup.

## Cara membuat APK tanpa Android Studio di komputer pengguna

Di GitHub buka Actions → **Bangun DAWAAM Android (Uji)** → Run workflow. Jika build berhasil, buka tab Releases dan unduh langsung **DAWAAM-Android-Uji.apk** (bukan ZIP). Ini APK debug uji, bukan APK rilis produksi. GitHub Actions membuat instalasi Capacitor dan membangun aplikasi di server GitHub.

Di aplikasi APK: buka menu Pengingat, isi jam, klik Simpan Pengingat, klik **Aktifkan Notifikasi Android**, izinkan notifikasi, lalu pilih **Uji 90 Detik**. Tutup aplikasi dan periksa notifikasi. Pengaturan baterai, Doze, dan izin notifikasi dapat membuat waktu pengingat tidak presisi.

**Batasan penting**
- APK uji dibuat dengan kunci debug sementara. Untuk memperbarui instalasi APK secara aman tanpa kehilangan data, nantinya wajib menggunakan keystore rilis yang stabil dan rahasia. Jangan mendistribusikan APK uji sebagai produk publik.
- Cadangan JSON dari PWA lama diperlukan untuk memindahkan catatan ke APK. Kedua aplikasi memiliki area penyimpanan yang berbeda. **Jangan hapus PWA** sebelum memulihkan dan memeriksa data.
- Mode haid/nifas di aplikasi saat ini berlaku per hari dan sinkronisasi pengingat mengikuti kondisi yang terakhir dicatat ketika APK dibuka/disimpan. Notifikasi fardhu di hari berikutnya belum bisa otomatis menyesuaikan kondisi jika APK tidak dibuka. Ini perlu disempurnakan sebelum rilis publik.
- Jam shalat diisi manual dan tidak menghitung waktu shalat berdasarkan lokasi.
- Notifikasi tidak dijamin tepat menit di semua ponsel Android; versi uji menjadwalkan notifikasi inexact untuk menghindari meminta izin alarm presisi.
- Backup JSON tidak terenkripsi. Simpan secara pribadi, jangan unggah ke repository publik.