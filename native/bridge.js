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
      visibility: 1
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

  // Untuk Android, tanggal/jam konkret terbukti lebih mudah diuji dibanding pola on/cron.
  // Setiap kali DAWAAM dibuka atau pengaturan disimpan, antrian 7 hari diperbarui.
  // Target mingguan/bulanan ditambahkan sampai 35 hari supaya jadwal langka tidak terlewat.
  const maxPerKey = 50;
  function makeSchedule(key, i, item, target, special, now) {
    if (!item || item.enabled !== true || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) return [];
    if (special && (key.startsWith('prayer:') || key === 'target:dhuha')) return [];
    const isTarget = key.startsWith('target:');
    if (isTarget && target?.enabled !== true) return [];
    const [hour, minute] = item.time.split(':').map(Number);
    const frequency = isTarget ? target.frequency : 'daily';
    const horizon = frequency === 'daily' ? 7 : 35;
    const results = [];
    const name = key.startsWith('prayer:') ? key.split(':')[1] : targetNames[key.split(':')[1]];
    for (let offset = 0; offset < horizon; offset++) {
      const at = new Date(now.getFullYear(),now.getMonth(),now.getDate() + offset,hour,minute,0,0);
      if (at.getTime() <= now.getTime() + 10000) continue;
      if (frequency === 'weekly' && at.getDay() !== target.weekday) continue;
      if (frequency === 'monthly' && at.getDate() !== target.monthday) continue;
      results.push({
        id: baseId + i * maxPerKey + offset,
        title: 'DAWAAM • ' + name,
        channelId,
        body: 'Saatnya menjaga kebiasaan baik. Mulai dari yang mampu.',
        schedule: { at, allowWhileIdle: true },
        isExactNotification: false,
        autoCancel: true,
        extra: { dawaamKey: key, scheduledAt: at.toISOString() }
      });
    }
    return results;
  }

  async function sync() {
    if (busy) {
      say('Pengingat sedang diproses. Klik Daftarkan Jadwal sekali lagi setelah selesai.');
      return;
    }
    busy = true;
    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') {
        say('Notifikasi belum diizinkan. Klik Aktifkan Notifikasi.', true);
        return;
      }
      await ensureChannel();
      const { reminders, targets, special } = await readData();
      const now = new Date();
      const items = keys.flatMap((key,i) =>
        makeSchedule(key,i,reminders[key],targets[key.split(':')[1]],special,now)
      );
      const pending = await LocalNotifications.getPending();
      const ours = (pending.notifications || [])
        .filter(n => n.id >= baseId && n.id < baseId + maxPerKey * keys.length)
        .map(n => ({ id: n.id }));
      if (ours.length) await LocalNotifications.cancel({ notifications: ours });
      if (items.length) await LocalNotifications.schedule({ notifications: items });
      const confirmation = await LocalNotifications.getPending();
      const registered = (confirmation.notifications || []).filter(n =>
        n.id >= baseId && n.id < baseId + maxPerKey * keys.length
      );
      const idx = keys.indexOf('target:tilawah');
      const tilawahPending = registered.filter(n =>
        n.id >= baseId + idx * maxPerKey && n.id < baseId + (idx+1)*maxPerKey
      );
      const tilawahSetting = reminders['target:tilawah'];
      const tilawahTarget = targets.tilawah;
      let note = 'Alarm Android tercatat: ' + registered.length + ' dari ' + items.length + ' jadwal.';
      if (!tilawahTarget?.enabled) {
        note += '\nTilawah BELUM terdaftar: aktifkan target Tilawah di Atur Target, lalu Simpan Semua Target.';
      } else if (!tilawahSetting?.enabled) {
        note += '\nTilawah BELUM terdaftar: aktifkan pengingat Tilawah, pilih jam, lalu Simpan Pengingat.';
      } else if (!tilawahPending.length) {
        note += '\nPERHATIAN: Tilawah aktif tetapi tidak ada alarm terdaftar. Klik Periksa Status.';
      } else {
        const nearest = items.filter(n => n.extra?.dawaamKey === 'target:tilawah')
          .sort((a,b) => a.schedule.at - b.schedule.at)[0];
        note += '\n✓ Tilawah: ' + tilawahPending.length + ' alarm terdaftar. Berikutnya: ' +
          (nearest ? nearest.schedule.at.toLocaleString('id-ID',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'periksa jadwal');
      }
      if (special) note += '\nMode haid/nifas aktif: pengingat shalat fardhu dan Dhuha dikecualikan.';
      note += '\nJadwal harian disiapkan 7 hari; buka DAWAAM setidaknya seminggu sekali untuk memperbaruinya.';
      say(note, registered.length !== items.length);
    } catch(error) {
      console.error('DAWAAM gagal mengatur pengingat:', error);
      say('Gagal mendaftarkan jadwal: ' + (error?.message || String(error)), true);
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
      await ensureChannel();
      await sync();
    } catch (error) { say('Tidak dapat mengaktifkan notifikasi: ' + (error?.message || ''),true); }
  }

  async function checkStatus() {
    try {
      const [permission, enabled, pending, delivered, channels, saved] = await Promise.all([
        LocalNotifications.checkPermissions(),
        LocalNotifications.areEnabled(),
        LocalNotifications.getPending(),
        LocalNotifications.getDeliveredNotifications(),
        LocalNotifications.listChannels(),
        readData()
      ]);
      const ourChannel = (channels.channels || []).find(ch => ch.id === channelId);
      const pendingList = pending.notifications || [];
      const testPending = pendingList.some(n => n.id === testId);
      const deliveredTest = (delivered.notifications || []).some(n => n.id === immediateId || n.id === testId);
      const tilawahIndex = keys.indexOf('target:tilawah');
      const tilawahPending = pendingList.filter(n =>
        n.id >= baseId + tilawahIndex*maxPerKey && n.id < baseId + (tilawahIndex + 1)*maxPerKey
      );
      const allPending = pendingList.filter(n => n.id >= baseId && n.id < baseId + keys.length*maxPerKey);
      const setting = saved.reminders?.['target:tilawah'];
      const target = saved.targets?.tilawah;
      const msg =
        'Izin: ' + (permission.display === 'granted' ? 'DIIZINKAN' : 'BELUM DIIZINKAN') +
        '\nNotifikasi sistem: ' + (enabled.value ? 'AKTIF' : 'NONAKTIF') +
        '\nKanal: ' + (!ourChannel ? 'BELUM DIBUAT' : Number(ourChannel.importance) === 0 ? 'DIBLOKIR' : 'AKTIF') +
        '\nTarget Tilawah: ' + (target?.enabled ? 'AKTIF' : 'NONAKTIF') +
        '\nFrekuensi Tilawah: ' + (target?.frequency || 'belum disimpan') +
        '\nPengingat Tilawah: ' + (setting?.enabled ? 'AKTIF' : 'NONAKTIF') +
        '\nJam Tilawah: ' + (setting?.time || 'BELUM DIATUR') +
        '\nAlarm Tilawah terdaftar: ' + tilawahPending.length +
        '\nSemua alarm ibadah: ' + allPending.length +
        '\nUji 2 menit: ' + (testPending ? 'TERJADWAL' : deliveredTest ? 'SUDAH TERKIRIM' : 'TIDAK TERDAFTAR') +
        '\nJika jam telah lewat, jadwal berikutnya bisa terjadi besok atau sesuai frekuensi.';
      say(msg, permission.display !== 'granted' || !enabled.value || !tilawahPending.length);
    } catch(error) {
      say('Gagal memeriksa status: ' + (error?.message || String(error)), true);
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
    title.textContent = 'Pengingat Android • Tilawah & Diagnostik';
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
    statusButton.textContent = 'Periksa Status Tilawah';
    const scheduleButton = document.createElement('button');
    scheduleButton.type = 'button';
    scheduleButton.textContent = '4. Daftarkan Jadwal Ibadah';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:8px';
    controls.append(enable, now, test, scheduleButton, statusButton);
    label = document.createElement('p');
    label.className = 'muted';
    label.style.whiteSpace = 'pre-line';
    label.setAttribute('role','status');
    label.textContent = 'Atur target dan jam Tilawah, klik Simpan, lalu klik 4. Daftarkan Jadwal Ibadah dan Periksa Status Tilawah.';
    panel.append(title, controls, label);
    pengingat.append(panel);
    enable.addEventListener('click', activate);
    now.addEventListener('click', testNow);
    test.addEventListener('click', testNotification);
    statusButton.addEventListener('click', checkStatus);
    scheduleButton.addEventListener('click', sync);
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