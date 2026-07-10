const BACKUP_FOLDER_NAME = 'nununanu-supabase-backups';
const BACKUP_TABLES = [
  { name: 'customers', query: 'select=*&order=created_at.desc' },
  { name: 'bookings', query: 'select=*&order=created_at.desc' },
  { name: 'staff', query: 'select=*&order=created_at.asc' }
];

function getBackupConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_KEY');
  if (!url || !key) {
    throw new Error('Script Properties에 SUPABASE_URL, SUPABASE_KEY를 먼저 설정하세요.');
  }
  return { url: url.replace(/\/$/, ''), key };
}

function fetchSupabaseAll_(table, query) {
  const cfg = getBackupConfig_();
  const pageSize = 1000;
  let from = 0;
  let rows = [];

  while (true) {
    const endpoint = `${cfg.url}/rest/v1/${table}?${query}&limit=${pageSize}&offset=${from}`;
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: 'application/json'
      }
    });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error(`${table} 백업 실패: ${code} ${res.getContentText()}`);
    }
    const chunk = JSON.parse(res.getContentText() || '[]');
    rows = rows.concat(chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function getOrCreateBackupFolder_() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function runNununanuSupabaseBackup() {
  const exportedAt = new Date();
  const backup = {
    app: 'nununanu-reservation',
    exported_at: exportedAt.toISOString(),
    tables: {}
  };

  BACKUP_TABLES.forEach(t => {
    backup.tables[t.name] = fetchSupabaseAll_(t.name, t.query);
  });

  backup.counts = Object.keys(backup.tables).reduce((acc, name) => {
    acc[name] = backup.tables[name].length;
    return acc;
  }, {});

  const folder = getOrCreateBackupFolder_();
  const stamp = Utilities.formatDate(exportedAt, 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  const file = folder.createFile(
    `nununanu-backup-${stamp}.json`,
    JSON.stringify(backup, null, 2),
    MimeType.PLAIN_TEXT
  );

  Logger.log(`Backup created: ${file.getUrl()}`);
  return file.getUrl();
}

function installDailyNununanuBackupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runNununanuSupabaseBackup')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('runNununanuSupabaseBackup')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .inTimezone('Asia/Seoul')
    .create();
}

function testNununanuSupabaseBackup() {
  return runNununanuSupabaseBackup();
}
