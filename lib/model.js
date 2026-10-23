'use strict';
/**
 * Datenmodell: Konfigurationsprüfung und Aufbau der Datenpunkt-Struktur.
 * Struktur: <gruppe>.<Name>.<TotalActivePower|online>, <gruppe>.info.<Count|Total_Power>
 */
const SAFE = /^[A-Za-z0-9_-]+$/;
const SERIAL = /^[0-9A-Fa-f]{12}$/;

// Schlüssel = letzter Pfadabschnitt des Quell-Datenpunkts, KLEIN geschrieben
const METRICS = {
    totalactivepower: { key: 'TotalActivePower', name: 'Ausgangsleistung (TotalActivePower)', type: 'number', unit: 'W', role: 'value.power', def: 0 },
    online: { key: 'online', name: 'online', type: 'boolean', unit: '', role: 'indicator.reachable', def: false },
};

/**
 * Prüft die Gerätetabelle; ungültige oder doppelte Zeilen werden mit Warnung übersprungen.
 * Der Anzeigename wird automatisch vergeben: Meter1, Meter2, … je Gruppe in Tabellenreihenfolge.
 */
function normalizeDevices(rows, log) {
    const out = [];
    const serials = new Set();
    const counters = {};
    for (const [i, row] of (Array.isArray(rows) ? rows : []).entries()) {
        const group = String((row && row.group) || '').trim();
        const serial = String((row && row.serial) || '').trim();
        const where = `Zeile ${i + 1}`;
        if (!group && !serial) continue;
        if (!SAFE.test(group) || group.toLowerCase() === 'info') { log.warn(`${where}: Gruppe "${group}" ungültig (erlaubt: A-Z, 0-9, _, -; "info" ist reserviert) – übersprungen`); continue; }
        if (!SERIAL.test(serial)) { log.warn(`${where}: Kennung "${serial}" ist keine 12-stellige Hex-MAC – übersprungen`); continue; }
        const up = serial.toUpperCase();
        if (serials.has(up)) { log.warn(`${where}: Kennung ${serial} doppelt zugeordnet – übersprungen`); continue; }
        serials.add(up);
        counters[group] = (counters[group] || 0) + 1;
        out.push({ group, name: `Meter${counters[group]}`, serial, up });
    }
    return out;
}

/** Baut Kanäle und Datenpunkte (IDs relativ zum Namensraum der Instanz). */
function buildModel(devices) {
    const channels = [];
    const states = [];
    const groups = {};
    for (const d of devices) (groups[d.group] = groups[d.group] || []).push(d);
    for (const [group, list] of Object.entries(groups)) {
        channels.push({ id: group, name: `Gruppe ${group}` }, { id: `${group}.info`, name: `Information ${group}` });
        states.push(
            { id: `${group}.info.Count`, common: { name: `Anzahl Geräte in ${group}`, type: 'number', role: 'value', read: true, write: false, def: list.length } },
            { id: `${group}.info.Total_Power`, common: { name: `Gesamt-Ausgangsleistung ${group}`, type: 'number', unit: 'W', role: 'value.power', read: true, write: false, def: 0 } },
        );
        for (const d of list) {
            channels.push({ id: `${group}.${d.name}`, name: `${d.name} (${d.serial})` });
            for (const m of Object.values(METRICS)) {
                const common = { name: `${d.name} (${d.serial}) - ${m.name}`, type: m.type, role: m.role, read: true, write: false, def: m.def };
                if (m.unit) common.unit = m.unit;
                states.push({ id: `${group}.${d.name}.${m.key}`, common });
            }
        }
    }
    return { channels, states, groups };
}

module.exports = { METRICS, normalizeDevices, buildModel };
