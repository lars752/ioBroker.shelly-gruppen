# ioBroker.shelly-gruppen

Ordnet Shelly-Geräte anhand ihrer **Kennung (MAC, 12 Hex-Zeichen)** Gruppen zu, spiegelt `TotalActivePower` und `online` und bildet pro Gruppe die **Summe der Leistung**.
Der Adapter ersetzt das Skript „Shelly Gruppen-Zuordnung“ (`0_userdata.0.Shelly`).

## Funktionen
- **Gruppen in der Admin-Oberfläche:** Eine Tabelle mit Gruppe und Kennung, kein Skript-Editieren mehr. Der Anzeigename wird automatisch vergeben (`Meter1`, `Meter2`, … je Gruppe in Tabellenreihenfolge).
- **Kennung per Regex im Pfad:** Shelly-Pfade haben das Format `shelly.0.<modell>#<MAC>#<index>.….<datenpunkt>`; die MAC wird unabhängig von Groß-/Kleinschreibung gefunden.
- **Offline = 0 W:** Meldet ein Gerät `online = false`, zählt es mit 0 W in der Summe.
- **Stale-Timeout (optional):** Geräte ohne Update seit X Sekunden zählen als 0 W (nur sinnvoll, wenn der Shelly-Adapter auch unveränderte Werte regelmäßig schreibt).
- **Eigener Namensraum:** Alle Datenpunkte liegen unter `shelly-gruppen.<Instanz>.*`. Es wird nichts nach `0_userdata.0` geschrieben.
- **Aufräumen:** Nicht mehr konfigurierte Datenpunkte der Instanz werden beim Start gelöscht (abschaltbar), falsche Datentypen werden korrigiert.
- **Effizient:** Es werden nur Datenpunkte der konfigurierten Geräte abonniert, nicht der gesamte Shelly-Adapter. `info.connection` ist true, solange mindestens ein Gerät Daten liefert.
- **Prüfung der Eingaben:** Ungültige oder doppelte Zeilen (falsche MAC, doppelte Kennung, Sonderzeichen, reservierter Name `info`) werden mit Warnung im Log übersprungen.

## Installation über GitHub
1. Auf GitHub ein **neues Repository `ioBroker.shelly-gruppen`** anlegen (Benutzer `lars752`).
2. ZIP entpacken und den **Inhalt** des Ordners `ioBroker.shelly-gruppen` (nicht den Ordner selbst) ins Hauptverzeichnis des Repositorys hochladen (Branch `main`). Danach müssen `package.json`, `io-package.json`, `main.js`, `lib/` und `admin/` direkt im Hauptverzeichnis sichtbar sein.
3. ioBroker Admin → Adapter → Experten-Modus → „Adapter aus eigener URL installieren“ → `https://github.com/lars752/ioBroker.shelly-gruppen`
   oder `iobroker url https://github.com/lars752/ioBroker.shelly-gruppen`
4. Instanz `shelly-gruppen.0` anlegen und konfigurieren.

Voraussetzungen: Node.js ≥ 18, js-controller ≥ 5.0.19, Admin ≥ 6, laufender Shelly-Adapter.

## Konfiguration
| Einstellung | Bedeutung |
|---|---|
| Quell-Instanzen | Instanz(en) des Shelly-Adapters, Standard `shelly.0` |
| Stale-Timeout | 0 = aus, sonst Sekunden bis ein Gerät als 0 W zählt |
| Aufräumen beim Start | löscht nicht mehr konfigurierte Datenpunkte dieser Instanz |
| Tabelle | pro Gerät: Gruppe und Kennung; der Name (`Meter1`, `Meter2`, …) entsteht automatisch. Neue Geräte am Ende der Gruppe eintragen, damit bestehende Namen gleich bleiben |

Die Tabelle ist nach der Installation leer. Beispiel: Gruppe `wohnung_links`, Kennung `08f9e0e9c330` ergibt `shelly-gruppen.0.wohnung_links.Meter1.*`.

## Import / Export der Konfiguration (JSON)
Im Reiter „Import / Export“ der Instanz:
- **Export:** „Konfiguration als JSON exportieren“ schreibt die aktuelle Konfiguration (auch ungespeicherte Änderungen) in das Textfeld. Mit dem Kopier-Symbol im Feld sichern.
- **Import:** JSON in das Textfeld einfügen und „JSON aus dem Textfeld importieren“ drücken. Die Werte erscheinen im Formular, danach „Speichern und schließen“ drücken, erst dann wird die Instanz neu gestartet.
- Ungültige Zeilen (falsche MAC, doppelte Kennung, Sonderzeichen in der Gruppe) werden beim Import übersprungen und in der Rückmeldung genannt. Ein Export einer anderen Adapterart oder ein defektes JSON wird abgelehnt.
- Die Instanz muss laufen, weil Export und Import über den Adapter abgewickelt werden.

Format:
```json
{
  "adapter": "shelly-gruppen",
  "version": 1,
  "config": {
    "sourceAdapters": "shelly.0",
    "staleTimeoutSec": 0,
    "pruneOnStart": true,
    "devices": [
      { "group": "wohnung_links", "serial": "08f9e0e9c330" }
    ]
  }
}
```
Beim Import genügt auch das reine `config`-Objekt. Der Anzeigename (`Meter1`, `Meter2`, …) ist nicht Teil der Datei, er ergibt sich aus der Reihenfolge der Geräte je Gruppe.

## Datenpunkte (`shelly-gruppen.0.*`)
| Datenpunkt | Inhalt |
|---|---|
| `<gruppe>.Meter<N>.TotalActivePower` | Ausgangsleistung des Geräts in W |
| `<gruppe>.Meter<N>.online` | Gerät erreichbar |
| `<gruppe>.info.Total_Power` | Summe der Gruppe in W |
| `<gruppe>.info.Count` | Anzahl Geräte der Gruppe |
| `info.connection` | mindestens ein Gerät liefert Daten |

Die Struktur entspricht dem bisherigen Skript. Es ändern sich das Präfix und der Gerätename: aus `Meter` wird `Meter1` (bei mehreren Geräten `Meter2`, …).

## Umstieg vom Skript
1. Skript „Shelly Gruppen-Zuordnung“ stoppen, danach den Ordner `0_userdata.0.Shelly` löschen, sobald nichts mehr darauf zugreift.
2. Verbraucher auf die neuen IDs umstellen: `0_userdata.0.Shelly.<gruppe>…` wird zu `shelly-gruppen.0.<gruppe>…`, z. B.
   - `0_userdata.0.Shelly.wohnung_links.info.Total_Power` → `shelly-gruppen.0.wohnung_links.info.Total_Power`
   - `0_userdata.0.Shelly.wohnung_links.Meter.TotalActivePower` → `shelly-gruppen.0.wohnung_links.Meter1.TotalActivePower`
   - `0_userdata.0.Shelly.wohnung_links.Meter.online` → `shelly-gruppen.0.wohnung_links.Meter1.online`

## Entwicklung
```bash
npm install
npm test     # Konfigurationsprüfung, Zuordnung, Summen, Offline und Stale (ohne ioBroker lauffähig)
```
Struktur: `lib/model.js` (Konfiguration, Datenpunkte), `lib/core.js` (Zuordnung, Summen), `lib/configio.js` (JSON-Import/-Export), `main.js` (Adapter).
Der Workflow `.github/workflows/test.yml` führt die Tests bei jedem Push auf Node 18, 20 und 22 aus.

## Lizenz
MIT
