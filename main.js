'use strict';
const utils = require('@iobroker/adapter-core');
const { normalizeDevices, buildModel, METRICS } = require('./lib/model');
const { ShellyCore } = require('./lib/core');

class ShellyGruppen extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'shelly-gruppen' });
        this.cache = new Map();
        this.queue = Promise.resolve();
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /** Schreibt geänderte Werte nacheinander in den Namensraum der Instanz (shelly-gruppen.<N>). */
    write(id, val) {
        this.queue = this.queue
            .then(async () => {
                if (this.cache.get(id) === val) return;
                this.cache.set(id, val);
                await this.setStateAsync(id, { val, ack: true });
            })
            .catch((e) => this.log.error(`Schreiben von ${id} fehlgeschlagen: ${e.message}`));
        return this.queue;
    }

    /** Legt Kanäle und Datenpunkte an, korrigiert falsche Typen und entfernt Altlasten. */
    async ensureStructure(model) {
        const expected = new Set(['info', 'info.connection']);
        for (const ch of model.channels) {
            expected.add(ch.id);
            await this.extendObjectAsync(ch.id, { type: 'channel', common: { name: ch.name }, native: {} });
        }
        for (const st of model.states) {
            expected.add(st.id);
            const obj = await this.getObjectAsync(st.id);
            if (obj && obj.common && obj.common.type !== st.common.type) {
                this.log.info(`Typ von ${st.id} war ${obj.common.type}, lege neu als ${st.common.type} an`);
                await this.delObjectAsync(st.id);
            }
            await this.extendObjectAsync(st.id, { type: 'state', common: st.common, native: {} });
            const cur = await this.getStateAsync(st.id);
            if (!cur || cur.val === null) await this.setStateAsync(st.id, { val: st.common.def, ack: true });
        }
        if (this.config.pruneOnStart !== false) {
            const all = await this.getAdapterObjectsAsync();
            for (const full of Object.keys(all)) {
                const rel = full.slice(this.namespace.length + 1);
                if (rel && !expected.has(rel) && !rel.startsWith('info.')) {
                    await this.delObjectAsync(rel);
                    this.log.info(`Veralteten Datenpunkt entfernt: ${rel}`);
                }
            }
        }
        for (const [group, list] of Object.entries(model.groups)) await this.setStateChangedAsync(`${group}.info.Count`, { val: list.length, ack: true });
    }

    async onReady() {
        const c = this.config;
        await this.setStateAsync('info.connection', false, true);

        const adapters = String(c.sourceAdapters || 'shelly.0').split(',').map((s) => s.trim()).filter(Boolean);
        const badAdapter = adapters.find((a) => !/^[A-Za-z0-9_-]+\.\d+$/.test(a));
        if (!adapters.length || badAdapter) {
            this.log.error(`Ungültige Quell-Instanz "${badAdapter || ''}" (erwartet z. B. shelly.0) – Adapter bleibt inaktiv`);
            return;
        }
        const devices = normalizeDevices(c.devices, this.log);
        if (!devices.length) this.log.warn('Keine gültigen Geräte konfiguriert – bitte die Gerätetabelle in der Instanz ausfüllen');
        const model = buildModel(devices);
        await this.ensureStructure(model);

        this.core = new ShellyCore({
            log: this.log,
            write: (id, val) => this.write(id, val),
            adapters,
            devices,
            staleSec: Math.max(0, Number(c.staleTimeoutSec) || 0),
        });

        // Nur Datenpunkte der konfigurierten Geräte abonnieren (MAC groß und klein geschrieben)
        this.patterns = [];
        for (const a of adapters) {
            for (const d of devices) this.patterns.push(`${a}.*${d.up}*`, `${a}.*${d.up.toLowerCase()}*`);
        }
        for (const p of this.patterns) this.subscribeForeignStates(p);

        let count = 0;
        for (const p of this.patterns) {
            const states = await this.getForeignStatesAsync(p);
            for (const [id, state] of Object.entries(states || {})) {
                if (this.core.parseId(id)) {
                    await this.core.handle(id, state);
                    count++;
                }
            }
        }
        this.log.info(`Initial-Sync: ${count} Quell-Datenpunkte übernommen`);
        const missing = this.core.missingDevices();
        if (missing.length) {
            this.log.warn(`Keine passenden Quell-Datenpunkte gefunden für: ${missing.map((d) => d.serial).join(', ')}. Kennung und Datenpunktnamen (${Object.values(METRICS).map((m) => m.key).join(', ')}) prüfen`);
        }

        if (this.core.staleMs > 0) {
            this.staleTimer = setInterval(() => this.core.checkStale().catch((e) => this.log.error(e.message)), 30000);
        }
        this.log.info(`Adapter gestartet (Quelle: ${adapters.join(', ')}), Datenpunkte unter ${this.namespace}.*`);
    }

    onStateChange(id, state) {
        if (!this.core || !state || id.startsWith(`${this.namespace}.`)) return;
        this.core.handle(id, state).catch((e) => this.log.error(`Fehler bei ${id}: ${e.message}`));
    }

    onUnload(callback) {
        try {
            if (this.staleTimer) clearInterval(this.staleTimer);
            this.setState('info.connection', false, true);
        } finally {
            callback();
        }
    }
}

if (require.main !== module) module.exports = (options) => new ShellyGruppen(options);
else new ShellyGruppen();
