# ioBroker.shelly-gruppen

Ordnet **Shelly-Geräte** anhand ihrer Kennung (MAC) frei wählbaren **Gruppen** zu, spiegelt `TotalActivePower` und `online` und bildet pro Gruppe die **Summe der Leistung**.

## Funktionen

- **Gruppen frei konfigurierbar:** Tabelle mit Gruppe und Kennung, Anzeigename (`Meter1`, `Meter2`, …) wird je Gruppe in Tabellenreihenfolge automatisch vergeben.
- **Mehrere Quell-Instanzen** gleichzeitig (kommagetrennt, z. B. `shelly.0,shelly.1`).
- **Kennung per Regex im Pfad:** Shelly-Pfade haben das Format `shelly.0.<modell>#<MAC>#<index>…`; die Kennung wird unabhängig von Groß-/Kleinschreibung erkannt.
- **Offline = 0 W:** Meldet ein Gerät `online = false`, zählt es mit 0 W in der Gruppensumme.
- **Stale-Timeout (optional):** Geräte ohne Update seit X Sekunden zählen als 0 W.
- **Eigener Namensraum:** Alle Datenpunkte liegen unter `shelly-gruppen.<Instanz>.*`.
- **Aufräumen beim Start:** Nicht mehr konfigurierte Datenpunkte werden entfernt (abschaltbar), falsche Datentypen werden korrigiert.
- **Eingabeprüfung:** Ungültige oder doppelte Einträge (falsche Kennung, Sonderzeichen in der Gruppe, reservierter Name `info`) werden mit Warnung übersprungen.
- `info.connection` ist `true`, solange mindestens ein Gerät Daten liefert.

## Installation

1. ioBroker Admin → Adapter → Experten-Modus → „Adapter aus eigener URL installieren":  
   `https://github.com/lars752/ioBroker.shelly-gruppen`  
   Alternativ: `iobroker url https://github.com/lars752/ioBroker.shelly-gruppen`
2. Instanz anlegen und konfigurieren.

**Voraussetzungen:** Node.js ≥ 18, js-controller ≥ 5.0.19, Admin ≥ 6, laufender Shelly-Adapter.

## Konfiguration

| Einstellung | Standard | Bedeutung |
|---|---|---|
| Quell-Instanzen | `shelly.0` | Instanz(en) des Shelly-Adapters, kommagetrennt |
| Stale-Timeout | 0 s | Sekunden bis ein Gerät als 0 W zählt, 0 = deaktiviert |
| Aufräumen beim Start | an | nicht mehr konfigurierte Datenpunkte löschen |
| Tabelle | leer | pro Gerät: Gruppe und Kennung |

Neue Geräte am Ende der Gruppe eintragen, damit bestehende Namen unverändert bleiben. Änderungen starten die Instanz neu.

## Datenpunkte (`shelly-gruppen.0.*`)

| Datenpunkt | Inhalt |
|---|---|
| `<gruppe>.Meter<N>.TotalActivePower` | Wirkleistung des Geräts in W |
| `<gruppe>.Meter<N>.online` | Gerät erreichbar |
| `<gruppe>.info.Total_Power` | Summe der Wirkleistung aller Geräte der Gruppe |
| `<gruppe>.info.Count` | Anzahl konfigurierter Geräte der Gruppe |
| `info.connection` | `true`, solange mindestens ein Gerät Daten liefert |

## Import / Export der Konfiguration

Im Reiter **„Import / Export"** der Instanz:

- **Export:** schreibt die aktuelle Konfiguration als JSON in das Textfeld.
- **Import:** JSON einfügen und „JSON aus dem Textfeld importieren" drücken. Die Werte erscheinen im Formular, danach „Speichern und schließen".

Ungültige Zeilen, fehlerhaftes JSON oder der Export einer anderen Adapterart werden abgelehnt. Fehlende Felder werden mit Standardwerten ergänzt. Der Anzeigename ist nicht Teil der Datei, er ergibt sich aus der Reihenfolge der Geräte je Gruppe.

```json
{
  "adapter": "shelly-gruppen",
  "version": 1,
  "config": {
    "sourceAdapters": "shelly.0",
    "staleTimeoutSec": 0,
    "pruneOnStart": true,
    "devices": [
      { "group": "wohnzimmer", "serial": "<Kennung>" }
    ]
  }
}
```

## Entwicklung

```bash
npm install
npm test     # läuft ohne ioBroker-Instanz
```

Struktur: `lib/model.js` (Konfiguration, Datenmodell), `lib/core.js` (Zuordnung, Summen), `lib/configio.js` (JSON-Import/-Export), `main.js` (Adapter).  
Der Workflow `.github/workflows/test.yml` führt die Tests bei jedem Push auf Node 18, 20 und 22 aus.

## Lizenz

MIT
