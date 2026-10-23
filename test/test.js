'use strict';
const assert = require('assert');
const { normalizeDevices, buildModel } = require('../lib/model');
const { ShellyCore } = require('../lib/core');

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };
const warns = [];
const log = { debug() {}, info() {}, warn: (m) => warns.push(m), error() {} };
const ROWS = [
    { group: 'wohnung_links', serial: '08f9e0e9c330' },
    { group: 'wohnung_rechts', serial: '08f9e0e6e680' },
];
const mk = (rows = ROWS, extra = {}) => {
    const w = {};
    const t = { now: 1_000_000 };
    const core = new ShellyCore({ log, write: async (id, v) => { w[id] = v; }, adapters: ['shelly.0'], devices: normalizeDevices(rows, log), now: () => t.now, ...extra });
    return { w, t, core };
};
const P1 = 'shelly.0.shellypro3em#08F9E0E9C330#1.Em0.TotalActivePower';
const O1 = 'shelly.0.shellypro3em#08F9E0E9C330#1.online';
const P2 = 'shelly.0.shellypro3em#08F9E0E6E680#1.Em0.TotalActivePower';

(async () => {
    await test('Konfiguration: gültige Zeilen', () => {
        const d = normalizeDevices(ROWS, log);
        assert.strictEqual(d.length, 2);
        assert.strictEqual(d[0].up, '08F9E0E9C330');
    });
    await test('Konfiguration: ungültige und doppelte Zeilen werden übersprungen', () => {
        warns.length = 0;
        const d = normalizeDevices([
            { group: 'a', serial: '08f9e0e9c330' },
            { group: 'a', serial: '08F9E0E9C330' },   // doppelte Kennung
            { group: 'a b', serial: '08f9e0e9c331' },  // Leerzeichen
            { group: 'info', serial: '08f9e0e9c332' }, // reserviert
            { group: 'a', serial: '1234' },            // keine MAC
            { group: 'a', serial: '08f9e0e9c333' },    // gültig
            { group: '', serial: '' },                 // leer: still ignoriert
            null,
        ], log);
        assert.deepStrictEqual(d.map((x) => `${x.group}.${x.name}`), ['a.Meter1', 'a.Meter2']);
        assert.strictEqual(warns.length, 4);
    });
    await test('Anzeigename: automatisch Meter1, Meter2 … je Gruppe, Altwert name wird ignoriert', () => {
        const d = normalizeDevices([
            { group: 'x', name: 'Zähler', serial: 'aaaaaaaaaaaa' },
            { group: 'y', serial: 'bbbbbbbbbbbb' },
            { group: 'x', name: 'Meter', serial: 'cccccccccccc' },
            { group: 'x', serial: 'dddddddddddd' },
        ], log);
        assert.deepStrictEqual(d.map((x) => `${x.group}.${x.name}`), ['x.Meter1', 'y.Meter1', 'x.Meter2', 'x.Meter3']);
    });
    await test('Modell: Kanäle und Datenpunkte', () => {
        const m = buildModel(normalizeDevices(ROWS, log));
        assert.strictEqual(m.states.length, 8);
        assert.strictEqual(m.channels.length, 6);
        const ids = m.states.map((s) => s.id);
        assert.ok(ids.includes('wohnung_links.Meter1.TotalActivePower'));
        assert.ok(ids.includes('wohnung_rechts.info.Total_Power'));
        assert.strictEqual(new Set(ids).size, ids.length);
    });
    await test('parseId: Kennung groß/klein, Instanz, Metrik', () => {
        const { core } = mk();
        assert.strictEqual(core.parseId(P1).device.group, 'wohnung_links');
        assert.strictEqual(core.parseId(P1.replace('08F9E0E9C330', '08f9e0e9c330')).device.group, 'wohnung_links');
        assert.strictEqual(core.parseId(P1.replace('shelly.0', 'shelly.1')), null);
        assert.strictEqual(core.parseId(P1.replace('TotalActivePower', 'Voltage')), null);
        assert.strictEqual(core.parseId('shelly.0.shellypro3em#AAAAAAAAAAAA#1.online'), null);
        assert.strictEqual(core.parseId('x.y'), null);
    });
    await test('Leistung wird gespiegelt, Summe pro Gruppe', async () => {
        const { w, core } = mk([...ROWS, { group: 'wohnung_links', serial: '112233445566' }]);
        await core.handle(P1, { val: 120.5 });
        await core.handle('shelly.0.shellyplus1pm#112233445566#1.Switch0.TotalActivePower'.replace('Switch0', 'Em0'), { val: '30' });
        assert.strictEqual(w['wohnung_links.Meter1.TotalActivePower'], 120.5);
        assert.strictEqual(w['wohnung_links.Meter2.TotalActivePower'], 30);
        assert.strictEqual(w['wohnung_links.info.Total_Power'], 150.5);
        await core.handle(P2, { val: -40 });
        assert.strictEqual(w['wohnung_rechts.info.Total_Power'], -40);
        assert.strictEqual(w['wohnung_links.info.Total_Power'], 150.5);
    });
    await test('Online-Status: Umwandlung und offline = 0 W', async () => {
        const { w, core } = mk();
        await core.handle(P1, { val: 200 });
        await core.handle(O1, { val: 'true' });
        assert.strictEqual(w['wohnung_links.Meter1.online'], true);
        assert.strictEqual(w['info.connection'], true);
        await core.handle(O1, { val: 0 });
        assert.strictEqual(w['wohnung_links.Meter1.online'], false);
        assert.strictEqual(w['wohnung_links.info.Total_Power'], 0);
        assert.strictEqual(w['info.connection'], false);
    });
    await test('Ungültige Werte werden ignoriert', async () => {
        const { w, core } = mk();
        assert.strictEqual(await core.handle(P1, { val: 'abc' }), 'invalid');
        assert.strictEqual(await core.handle(P1, { val: null }), 'skip');
        assert.strictEqual(await core.handle(P1, null), 'skip');
        assert.strictEqual(w['wohnung_links.Meter1.TotalActivePower'], undefined);
    });
    await test('Stale-Timeout nimmt veraltete Geräte aus der Summe', async () => {
        const { w, t, core } = mk(ROWS, { staleSec: 60 });
        await core.handle(P1, { val: 300 });
        assert.strictEqual(w['wohnung_links.info.Total_Power'], 300);
        t.now += 61_000;
        await core.checkStale();
        assert.strictEqual(w['wohnung_links.info.Total_Power'], 0);
        await core.handle(P1, { val: 50 });
        assert.strictEqual(w['wohnung_links.info.Total_Power'], 50);
    });
    await test('Ohne Stale-Timeout bleibt der letzte Wert', async () => {
        const { w, t, core } = mk();
        await core.handle(P1, { val: 300 });
        t.now += 3_600_000;
        await core.checkStale();
        assert.strictEqual(w['wohnung_links.info.Total_Power'], 300);
    });
    await test('Fehlende Geräte werden gemeldet', async () => {
        const { core } = mk();
        await core.handle(P1, { val: 1 });
        assert.deepStrictEqual(core.missingDevices().map((d) => d.group), ['wohnung_rechts']);
    });
    await test('Leere Konfiguration: nichts passt', async () => {
        const { core } = mk([]);
        assert.strictEqual(core.parseId(P1), null);
        assert.strictEqual(await core.handle(P1, { val: 5 }), 'ignored');
    });
    console.log(`\n${passed} Tests bestanden`);
})().catch((e) => { console.error(e); process.exit(1); });
