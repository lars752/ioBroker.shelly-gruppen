'use strict';
const { METRICS } = require('./model');

const esc = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';

/**
 * Kernlogik: ordnet Quell-Datenpunkte (shelly.N.<modell>#<MAC>#<index>.….<metrik>) über die Kennung
 * einer Gruppe zu, spiegelt Leistung und online-Status und bildet pro Gruppe die Summe.
 * Alle Schreibzugriffe laufen über opts.write(relativeId, wert).
 */
class ShellyCore {
    constructor(opts) {
        this.log = opts.log;
        this.write = opts.write;
        this.now = opts.now || Date.now;
        this.adapters = opts.adapters;
        this.staleMs = (opts.staleSec || 0) * 1000;
        this.devices = opts.devices;
        this.bySerial = new Map(this.devices.map((d) => [d.up, d]));
        this.groups = {};
        for (const d of this.devices) (this.groups[d.group] = this.groups[d.group] || []).push(d);
        const alt = [...this.bySerial.keys()].map(esc).join('|');
        this.serialRe = alt ? new RegExp(`(${alt})`, 'i') : /(?!)/;
        this.cache = new Map(); // KENNUNG -> { val, ts }
        this.alive = new Map(); // KENNUNG -> bool
        this.lastSum = {};
        this.lastConn = null;
        this.seen = new Set();
    }

    /** Zerlegt eine Quell-ID; liefert { device, metric } oder null. */
    parseId(id) {
        const parts = String(id).split('.');
        if (parts.length < 4 || !this.adapters.includes(`${parts[0]}.${parts[1]}`)) return null;
        const metric = METRICS[parts[parts.length - 1].toLowerCase()];
        if (!metric) return null;
        const m = parts.slice(2, -1).join('.').match(this.serialRe);
        const device = m ? this.bySerial.get(m[1].toUpperCase()) : null;
        return device ? { device, metric } : null;
    }

    async handle(id, state) {
        if (!state || state.val === null || state.val === undefined) return 'skip';
        const p = this.parseId(id);
        if (!p) return 'ignored';
        const { device, metric } = p;
        this.seen.add(device.up);
        const rel = `${device.group}.${device.name}.${metric.key}`;
        if (metric.key === 'TotalActivePower') {
            const val = Number(state.val);
            if (!Number.isFinite(val)) return 'invalid';
            this.cache.set(device.up, { val, ts: this.now() });
            this.alive.set(device.up, true);
            await this.write(rel, val);
            await this.updateGroupSum(device.group);
        } else {
            const online = toBool(state.val);
            this.alive.set(device.up, online);
            await this.write(rel, online);
            if (!online) {
                this.cache.set(device.up, { val: 0, ts: this.now() }); // offline zählt mit 0 W
                await this.updateGroupSum(device.group);
            }
        }
        await this.updateConnection();
        return 'ok';
    }

    async updateGroupSum(group) {
        let sum = 0;
        for (const d of this.groups[group] || []) {
            const e = this.cache.get(d.up);
            if (!e) continue;
            if (this.staleMs > 0 && this.now() - e.ts > this.staleMs) continue;
            sum += e.val;
        }
        sum = Math.round(sum * 10) / 10;
        if (this.lastSum[group] === sum) return;
        this.lastSum[group] = sum;
        await this.write(`${group}.info.Total_Power`, sum);
    }

    async checkStale() {
        if (this.staleMs <= 0) return;
        for (const g of Object.keys(this.groups)) await this.updateGroupSum(g);
    }

    async updateConnection() {
        const conn = [...this.alive.values()].some(Boolean);
        if (conn === this.lastConn) return;
        this.lastConn = conn;
        await this.write('info.connection', conn);
    }

    missingDevices() {
        return this.devices.filter((d) => !this.seen.has(d.up));
    }
}

module.exports = { ShellyCore };
