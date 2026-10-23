# ioBroker.shelly-gruppen

Ordnet Shelly-Geräte anhand ihrer **Kennung (MAC, 12 Hex-Zeichen)** Gruppen zu, spiegelt `TotalActivePower` und `online` und bildet pro Gruppe die **Summe der Leistung**.
Der Adapter ersetzt das Skript „Shelly Gruppen-Zuordnung“ (`0_userdata.0.Shelly`).

## Funktionen
- **Gruppen in der Admin-Oberfläche:** Eine Tabelle mit Gruppe, Name und Kennung, kein Skript-Editieren mehr.
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
| Tabelle | pro Gerät: Gruppe, Name (z. B. `Meter`, bei mehreren `Meter1`, `Meter2`), Kennung |

Die Tabelle ist nach der Installation leer. Beispiel: Gruppe `wohnung_links`, Name `Meter`, Kennung `08f9e0e9c330`.

## Datenpunkte (`shelly-gruppen.0.*`)
| Datenpunkt | Inhalt |
|---|---|
| `<gruppe>.<Name>.TotalActivePower` | Ausgangsleistung des Geräts in W |
| `<gruppe>.<Name>.online` | Gerät erreichbar |
| `<gruppe>.info.Total_Power` | Summe der Gruppe in W |
| `<gruppe>.info.Count` | Anzahl Geräte der Gruppe |
| `info.connection` | mindestens ein Gerät liefert Daten |

Die Struktur ist identisch zum bisherigen Skript, nur das Präfix ändert sich.

## Umstieg vom Skript
1. Skript „Shelly Gruppen-Zuordnung“ stoppen, danach den Ordner `0_userdata.0.Shelly` löschen, sobald nichts mehr darauf zugreift.
2. Verbraucher auf die neuen IDs umstellen: `0_userdata.0.Shelly.<gruppe>…` wird zu `shelly-gruppen.0.<gruppe>…`, z. B.
   - `0_userdata.0.Shelly.wohnung_links.info.Total_Power` → `shelly-gruppen.0.wohnung_links.info.Total_Power`
   - `0_userdata.0.Shelly.wohnung_links.Meter.TotalActivePower` → `shelly-gruppen.0.wohnung_links.Meter.TotalActivePower`
   - `0_userdata.0.Shelly.wohnung_links.Meter.online` → `shelly-gruppen.0.wohnung_links.Meter.online`

## Entwicklung
```bash
npm install
npm test     # Konfigurationsprüfung, Zuordnung, Summen, Offline und Stale (ohne ioBroker lauffähig)
```
Struktur: `lib/model.js` (Konfiguration, Datenpunkte), `lib/core.js` (Zuordnung, Summen), `main.js` (Adapter).
Der Workflow `.github/workflows/test.yml` führt die Tests bei jedem Push auf Node 18, 20 und 22 aus.

## Lizenz
MIT
