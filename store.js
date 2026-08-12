// 相対売り損益検証ツール - 統一データストア(schemaVersion付き)
// config.py と同じ構造をlocalStorageで管理する。旧3キー(aitaiUriCalc.lastInput/
// records/freightPresets)からの自動移行も行う。
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RelStore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORE_KEY = "aitaiUriCalc.store";
  const LEGACY_SETTINGS_KEY = "aitaiUriCalc.lastInput";
  const LEGACY_RECORDS_KEY = "aitaiUriCalc.records";
  const LEGACY_FREIGHT_PRESETS_KEY = "aitaiUriCalc.freightPresets";

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function emptyStore() {
    return { schemaVersion: SCHEMA_VERSION, lastInput: {}, records: [], freightPresets: [] };
  }

  function readJson(key, fallback) {
    try {
      const raw = (typeof localStorage !== "undefined") ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function normalize(data) {
    const store = Object.assign(emptyStore(), data || {});
    store.schemaVersion = SCHEMA_VERSION;
    if (!Array.isArray(store.records)) store.records = [];
    if (!Array.isArray(store.freightPresets)) store.freightPresets = [];
    if (typeof store.lastInput !== "object" || store.lastInput === null) store.lastInput = {};
    store.records.forEach((r) => { if (r && !r.id) r.id = newId(); });
    store.freightPresets.forEach((p) => { if (p && !p.id) p.id = newId(); });
    return store;
  }

  function migrateLegacy() {
    const store = emptyStore();
    const lastInput = readJson(LEGACY_SETTINGS_KEY, null);
    if (lastInput && typeof lastInput === "object") store.lastInput = lastInput;
    const records = readJson(LEGACY_RECORDS_KEY, null);
    if (Array.isArray(records)) store.records = records;
    const presets = readJson(LEGACY_FREIGHT_PRESETS_KEY, null);
    if (Array.isArray(presets)) store.freightPresets = presets;
    return normalize(store);
  }

  function loadStore() {
    const existing = readJson(STORE_KEY, null);
    if (existing && typeof existing === "object") return normalize(existing);
    const migrated = migrateLegacy();
    saveStore(migrated);
    return migrated;
  }

  function saveStore(store) {
    const normalized = normalize(store);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(normalized));
    } catch (e) { /* 無視 */ }
  }

  function loadSettings() { return loadStore().lastInput || {}; }
  function saveSettings(data) { const s = loadStore(); s.lastInput = data; saveStore(s); }
  function loadRecords() { return loadStore().records || []; }
  function saveRecords(records) { const s = loadStore(); s.records = records; saveStore(s); }
  function loadFreightPresets() { return loadStore().freightPresets || []; }
  function saveFreightPresets(presets) { const s = loadStore(); s.freightPresets = presets; saveStore(s); }

  return {
    SCHEMA_VERSION, newId, loadStore, saveStore,
    loadSettings, saveSettings, loadRecords, saveRecords, loadFreightPresets, saveFreightPresets,
  };
});
