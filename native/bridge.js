import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Kode ini hanya dijalankan pada aplikasi Android asli, bukan situs GitHub Pages.
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  const baseId = 4100;
  const testId = 4999;
  const immediateId = 4998;
  const channelId = 'dawaam_notifikasi_2026_v1';
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

  async function ensureChannel() {
    // Kanal khusus Android: bisa dilihat dalam Pengaturan > Notifikasi aplikasi.
    await LocalNotifications.createChannel({
      id: channelId,
      name: 'Pengingat Ibadah DAWAAM',
      description: 'Pengingat ibadah dan tes notifikasi DAWAAM',
      importance: 4,
      vibration: true,
      visibility: 1,
      sound: 'dawaam_chime.wav'
    });
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
      channelId,
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
      await ensureChannel();
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

  async function checkStatus() {
    try {
      const [permission, enabled, pending, delivered, channels] = await Promise.all([
        LocalNotifications.checkPermissions(),
        LocalNotifications.areEnabled(),
        LocalNotifications.getPending(),
        LocalNotifications.getDeliveredNotifications(),
        LocalNotifications.listChannels()
      ]);
      const ourChannel = (channels.channels || []).find(ch => ch.id === channelId);
      const pendingList = (pending.notifications || []);
      const testPending = pendingList.some(n => n.id === testId);
      const deliveredTest = (delivered.notifications || []).some(n => n.id === immediateId || n.id === testId);
      let msg =
        'Izin notifikasi: ' + (permission.display === 'granted' ? 'DIIZINKAN' : 'BELUM DIIZINKAN') +
        '\nNotifikasi sistem: ' + (enabled.value ? 'AKTIF' : 'NONAKTIF') +
        '\nKanal DAWAAM: ' + (!ourChannel ? 'BELUM DIBUAT' : Number(ourChannel.importance) === 0 ? 'DIBLOKIR' : 'AKTIF') +
        '\nUji terjadwal: ' + (testPending ? 'TERDAFTAR' : 'TIDAK ADA') +
        '\nUji di panel notifikasi: ' + (deliveredTest ? 'TERLIHAT SISTEM' : 'BELUM TERDETEKSI');
      if (permission.display !== 'granted' || !enabled.value || Number(ourChannel?.importance) === 0) {
        msg += '\nBuka Pengaturan Android > Aplikasi > DAWAAM Notifikasi Uji > Notifikasi dan izinkan.';
      }
      say(msg, permission.display !== 'granted' || !enabled.value);
    } catch(error) {
      say('Pemeriksaan status gagal: ' + (error?.message || String(error)), true);
    }
  }

  async function testNow() {
    try {
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') {
        say('Izin notifikasi belum aktif. Izinkan lewat Pengaturan Android.', true);
        return;
      }
      await ensureChannel();
      await LocalNotifications.cancel({notifications: [{id: immediateId}]});
      const result = await LocalNotifications.schedule({notifications: [{
        id: immediateId,
        title: 'DAWAAM • Tes langsung',
        body: 'Jika pesan ini muncul, izin dan kanal notifikasi bekerja.',
        channelId,
        foreground: true,
        autoCancel: true,
        isExactNotification: false
      }]});
      say('Tes langsung dikirim. Geser bilah notifikasi HP ke bawah untuk memeriksanya.' +
        (result.warning ? '\nCatatan: ' + result.warning : ''));
    } catch(error) {
      say('Tes langsung gagal: ' + (error?.message || String(error)), true);
    }
  }

  async function testNotification() {
    try {
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') {
        say('Izin notifikasi belum diizinkan. Izinkan melalui pengaturan aplikasi Android.', true);
        return;
      }
      await ensureChannel();
      await LocalNotifications.cancel({notifications: [{id: testId}]});
      const when = new Date(Date.now() + 2 * 60 * 1000);
      const result = await LocalNotifications.schedule({notifications: [{
        id: testId,
        title: 'DAWAAM • Uji pengingat terjadwal',
        body: 'Pengingat lokal telah dijalankan tanpa membuka DAWAAM.',
        channelId,
        autoCancel: true,
        schedule: {at: when, allowWhileIdle: true},
        isExactNotification: false
      }]});
      const pending = await LocalNotifications.getPending();
      const recorded = (pending.notifications || []).some(n => n.id === testId);
      if (!recorded) {
        say('Android tidak menampilkan uji dalam daftar terjadwal. Klik Periksa Status dan kirim screenshot.', true);
        return;
      }
      say('✓ Uji TERDAFTAR untuk sekitar ' + when.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}) +
        '. Tekan Home, jangan Paksa Berhenti. Android bisa menunda alarm yang tidak presisi.' +
        (result.warning ? '\nCatatan: ' + result.warning : ''));
    } catch(error) {
      say('Penjadwalan gagal: ' + (error?.message || String(error)), true);
    }
  }

  async function main() {
    const pengingat = document.getElementById('pengingat');
    if (!pengingat) return;
    const panel = document.createElement('div');
    panel.className = 'notice';
    const title = document.createElement('strong');
    title.textContent = 'Uji Notifikasi Android • Diagnostik';
    title.style.display = 'block';
    title.style.marginBottom = '10px';
    const enable = document.createElement('button');
    enable.type = 'button';
    enable.textContent = '1. Aktifkan Notifikasi';
    enable.className = 'primary';
    const now = document.createElement('button');
    now.type = 'button';
    now.textContent = '2. Uji Sekarang';
    const test = document.createElement('button');
    test.type = 'button';
    test.textContent = '3. Uji 2 Menit';
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.textContent = 'Periksa Status';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:8px';
    controls.append(enable, now, test, statusButton);
    label = document.createElement('p');
    label.className = 'muted';
    label.style.whiteSpace = 'pre-line';
    label.setAttribute('role','status');
    label.textContent = 'Mulai dengan tombol Aktifkan Notifikasi, kemudian Uji Sekarang. Lihat juga panel notifikasi HP.';
    panel.append(title, controls, label);
    pengingat.append(panel);
    enable.addEventListener('click', activate);
    now.addEventListener('click', testNow);
    test.addEventListener('click', testNotification);
    statusButton.addEventListener('click', checkStatus);
    for (const id of ['saveReminders','saveTargets','haid','restoreBackup']) {
      document.getElementById(id)?.addEventListener('click', scheduleSyncSoon);
      document.getElementById(id)?.addEventListener('change', scheduleSyncSoon);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleSyncSoon();
    });
    LocalNotifications.addListener('localNotificationReceived', notification => {
      if (notification.id === immediateId || notification.id === testId) {
        say('✓ Android telah mengirim uji notifikasi. Tarik panel notifikasi untuk melihat hasilnya.');
      }
    }).catch(error => console.warn('Listener notifikasi gagal:', error));
    if (localStorage.getItem(optInKey) === 'yes') {
      setTimeout(sync, 1800);
    }
  }
  // Script defer berjalan setelah DOM selesai dibaca.
  main();
}