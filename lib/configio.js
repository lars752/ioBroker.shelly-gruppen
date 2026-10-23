'use strict';
/**
 * JSON-Import/-Export der Instanz-Konfiguration (für die Admin-Oberfläche).
 * Reine Logik ohne ioBroker-Abhängigkeit; Rückgabe passt zu jsonConfig-sendTo (useNative).
 */
const { normalizeDevices } = require('./model');

const ADAPTER = 'shelly-gruppen';
const FORMAT = 1;
const MAX_CHARS = 200000;
const INSTANCE = /^[A-Za-z0-9_-]+\.\d+$/;

const collector = () => {
    const msgs = [];
    return { msgs, log: { debug() {}, info() {}, warn: (m) => msgs.push(m), error: (m) => msgs.push(m) } };
};
const rowsOf = (devices) => devices.map((d) => ({ group: d.group, serial: d.serial }));

/** Erzeugt den Exporttext aus den (auch ungespeicherten) Formulardaten. */
function exportConfig(native) {
    const n = native || {};
    const c = collector();
    const devices = normalizeDevices(n.devices, c.log);
    const config = {
        sourceAdapters: String(n.sourceAdapters || 'shelly.0').trim(),
        staleTimeoutSec: Math.max(0, Number(n.staleTimeoutSec) || 0),
        pruneOnStart: n.pruneOnStart !== false,
        devices: rowsOf(devices),
    };
    const text = JSON.stringify({ adapter: ADAPTER, version: FORMAT, config }, null, 2);
    const skipped = c.msgs.length ? ` ${c.msgs.length} ungültige Zeile(n) wurden nicht exportiert.` : '';
    return {
        native: { configJson: text },
        result: `Konfiguration mit ${devices.length} Gerät(en) exportiert. Text aus dem Feld kopieren und sichern.${skipped}`,
    };
}

/** Prüft einen Importtext; liefert { native, result } oder { error }. */
function importConfig(text) {
    const raw = String(text || '').trim();
    if (!raw) return { error: 'Das Feld „Konfiguration (JSON)“ ist leer.' };
    if (raw.length > MAX_CHARS) return { error: 'Der Text ist zu groß (max. 200 000 Zeichen).' };
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        return { error: `Kein gültiges JSON: ${e.message}` };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Erwartet wird ein JSON-Objekt.' };
    if (data.adapter !== undefined && data.adapter !== ADAPTER) return { error: `Export gehört zu „${data.adapter}“, erwartet „${ADAPTER}“.` };
    if (data.version !== undefined && data.version !== FORMAT) return { error: `Nicht unterstützte Formatversion ${data.version}.` };
    const cfg = data.config && typeof data.config === 'object' ? data.config : data;

    const adapters = String(cfg.sourceAdapters === undefined ? 'shelly.0' : cfg.sourceAdapters).split(',').map((s) => s.trim()).filter(Boolean);
    const bad = adapters.find((a) => !INSTANCE.test(a));
    if (!adapters.length || bad) return { error: `Ungültige Quell-Instanz „${bad || ''}“ (erwartet z. B. shelly.0).` };
    const stale = cfg.staleTimeoutSec === undefined ? 0 : Number(cfg.staleTimeoutSec);
    if (!Number.isFinite(stale) || stale < 0 || stale > 86400) return { error: 'staleTimeoutSec muss zwischen 0 und 86400 liegen.' };
    if (cfg.devices !== undefined && !Array.isArray(cfg.devices)) return { error: '„devices“ muss eine Liste sein.' };

    const c = collector();
    const devices = normalizeDevices(cfg.devices || [], c.log);
    const native = {
        sourceAdapters: adapters.join(','),
        staleTimeoutSec: Math.round(stale),
        pruneOnStart: cfg.pruneOnStart !== false,
        devices: rowsOf(devices),
        configJson: '',
    };
    let result = `${devices.length} Gerät(e) übernommen. Bitte „Speichern und schließen“ drücken, um die Konfiguration zu aktivieren.`;
    if (c.msgs.length) result += ` Übersprungen: ${c.msgs.slice(0, 5).join('; ')}${c.msgs.length > 5 ? ` … (+${c.msgs.length - 5})` : ''}`;
    return { native, result };
}

module.exports = { exportConfig, importConfig };
