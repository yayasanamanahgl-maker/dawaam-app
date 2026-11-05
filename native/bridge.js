import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Kode ini hanya dijalankan pada aplikasi Android asli, bukan situs GitHub Pages.
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  const baseId = 4100;
  const testId = 4999;
  const prayerNames = ['Subuh','Dzuhur','Ashar','Maghrib','Isya'];
  const targetNames = { tilawah: 'Tilawah Al-Qur’an', dhuha: 'Shalat Dhuha', dzikir: 'Dzikir', sedekah: 'Sedekah' };
  const keys = [...prayerNames.map(name => 'prayer:' + name), ...Object.keys(targetNames).map(name => 'target:' + name)];
  const optInKey = 'dawaam-native-notification-opt-in';
  let busy = false;
  let label = null;

  function say(message, isError = false) {
    if (!label) return;
    label.textContent = message;
    label.style.color = isError ? '#9b2929' : '#695633';
  }

  function todayKey() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }

  async function readData() {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dawaam-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Gagal membuka database'));
      request.onupgradeneeded = () => reject(new Error('Database aplikasi belum siap'));
    });
    try {
      if (!db.objectStoreNames.contains('settings') || !db.objectStoreNames.contains('days')) {
        throw new Error('Buka dan simpan pengingat DAWAAM terlebih dahulu');
      }
      const tx = db.transaction(['settings','days'], 'readonly');
      function get(store, key) {
        return new Promise((resolve, reject) => {
          const request = tx.objectStore(store).get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Tidak bisa membaca pengaturan'));
        });
      }
      const [reminders, targets, day] = await Promise.all([
        get('settings','user-reminders-v1'),
        get('settings','user-targets-v1'),
        get('days','day:' + todayKey())
      ]);
      return { reminders: reminders || {}, targets: targets || {}, special: day?.special === true };
    } finally { db.close(); }
  }

  function makeSchedule(key, i, item, target, special) {
    if (!item || item.enabled !== true || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) return null;
    if (special && (key.startsWith('prayer:') || key === 'target:dhuha')) return null;
    const isTarget = key.startsWith('target:');
    if (isTarget && target?.enabled !== true) return null;
    const [hour, minute] = item.time.split(':').map(Number);
    const on = { hour, minute, second: 0 };
    if (isTarget && target.frequency === 'weekly') {
      if (!Number.isInteger(target.weekday) || target.weekday < 0 || target.weekday > 6) return null;
      on.weekday = target.weekday + 1; // Capacitor: Ahad=1, Senin=2, ..., Sabtu=7.
    }
    if (isTarget && target.frequency === 'monthly') {
      if (!Number.isInteger(target.monthday) || target.monthday < 1 || target.monthday > 28) return null;
      on.day = target.monthday;
    }
    const name = key.startsWith('prayer:') ? key.split(':')[1] : targetNames[key.split(':')[1]];
    return {
      id: baseId + i,
      title: 'DAWAAM • ' + name,
      body: 'Saatnya menjaga kebiasaan baik. Mulai dari yang mampu.',
      schedule: { on, allowWhileIdle: true },
      isExactNotification: false,
      autoCancel: true
    };
  }

  async function sync() {
    if (busy) return;
    busy = true;
    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') {
        say('Notifikasi belum diizinkan. Klik Aktifkan Notifikasi Android.');
        return;
      }
      const { reminders, targets, special } = await readData();
      const pending = await LocalNotifications.getPending();
      const ours = (pending.notifications || [])
        .filter(n => n.id >= baseId && n.id < baseId + keys.length)
        .map(n => ({ id: n.id }));
      if (ours.length) await LocalNotifications.cancel({ notifications: ours });
      const items = keys.map((key,i) => makeSchedule(key,i,reminders[key],targets[key.split(':')[1]],special)).filter(Boolean);
      if (items.length) await LocalNotifications.schedule({ notifications: items });
      say('✓ ' + items.length + ' pengingat aktif di Android.' + (special ? ' Pengingat shalat disembunyikan saat mode haid/nifas aktif.' : ''));
    } catch (error) {
      console.error('DAWAAM notifikasi:', error);
      say('Gagal mengatur notifikasi: ' + (error?.message || 'periksa izin aplikasi'), true);
    } finally { busy = false; }
  }

  function scheduleSyncSoon() {
    if (localStorage.getItem(optInKey) !== 'yes') return;
    // Tunggu transaksi IndexedDB UI selesai, lalu baca data yang sudah tersimpan.
    setTimeout(sync, 1500);
  }

  async function activate() {
    try {
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') {
        say('Izin notifikasi ditolak. Aktifkan melalui Pengaturan Android.',true);
        return;
      }
      localStorage.setItem(optInKey, 'yes');
      await sync();
    } catch (error) { say('Tidak dapat mengaktifkan notifikasi: ' + (error?.message || ''),true); }
  }

  async function testNotification() {
    try {
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') { say('Izinkan notifikasi terlebih dahulu.',true); return; }
      await LocalNotifications.cancel({ notifications: [{ id: testId }] });
      await LocalNotifications.schedule({ notifications: [{
        id: testId,
        title: 'DAWAAM • Uji notifikasi',
        body: 'Pengingat lokal DAWAAM berhasil.',
        schedule: { at: new Date(Date.now() + 90 * 1000), allowWhileIdle: true },
        isExactNotification: false
      }] });
      say('Uji dijadwalkan sekitar 90 detik. Tutup aplikasi dan periksa notifikasi. Waktu dapat bergeser karena optimasi baterai.');
    } catch (error) { say('Uji gagal: ' + (error?.message || ''),true); }
  }

  async function main() {
    const pengingat = document.getElementById('pengingat');
    if (!pengingat) return;
    const panel = document.createElement('div');
    panel.className = 'notice';
    const title = document.createElement('strong');
    title.textContent = 'Notifikasi Android saat aplikasi ditutup';
    title.style.display = 'block';
    title.style.marginBottom = '9px';
    const enable = document.createElement('button');
    enable.type = 'button';
    enable.textContent = 'Aktifkan Notifikasi Android';
    enable.className = 'primary';
    enable.style.marginRight = '7px';
    const test = document.createElement('button');
    test.type = 'button';
    test.textContent = 'Uji 90 Detik';
    label = document.createElement('p');
    label.className = 'muted';
    label.setAttribute('role','status');
    label.textContent = 'Pengingat diatur melalui jam yang kamu simpan. Izin notifikasi diperlukan.';
    panel.append(title, enable, test, label);
    pengingat.append(panel);
    enable.addEventListener('click', activate);
    test.addEventListener('click', testNotification);
    for (const id of ['saveReminders','saveTargets','haid','restoreBackup']) {
      document.getElementById(id)?.addEventListener('click', scheduleSyncSoon);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleSyncSoon();
    });
    if (localStorage.getItem(optInKey) === 'yes') {
      setTimeout(sync, 1800);
    }
  }
  // Script defer berjalan setelah DOM selesai dibaca.
  main();
}