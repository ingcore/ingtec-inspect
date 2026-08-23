# INGTEC Inspect – Architektur und Betriebsgrenzen

## Ausgangszustand

Die Anwendung ist ein lokaler HTML-Demonstrator. `index.html` enthält Shell, Basiszustand, Rollenmodell, Kalender, Bericht/QS, Chat und große Teile der Geschäftslogik. Fachlich spezialisierte Oberflächen liegen in `INGTEC_Assets/` für Tagesarbeitsplatz, Prüfung, Feststellungen, Maßnahmen und Zusammenarbeit. Persistiert wird primär in `localStorage`; der Chat nutzt zusätzlich IndexedDB für Warteschlange und Anhänge.

Der durchgängige Prozess bleibt:

`Auftrag → Objekt → Prüfung → Feststellung → Maßnahme → Qualitätssicherung → Kundenfreigabe`

Vor dieser Überarbeitung bestanden folgende Hauptrisiken:

- Ein monolithischer globaler Zustand ohne zentrale Schema- oder Konsistenzprüfung.
- Direkte `localStorage`-Schreibvorgänge ohne gültigen Wiederherstellungspunkt.
- Viele aufeinander aufbauende globale Funktionsüberschreibungen.
- Uploadprüfungen und Laufzeitfehler wurden nicht an einer gemeinsamen Grenze behandelt.
- Der Maßnahmenbestand hatte zwei konkurrierende Statusmodelle (V3 und V4), die sich beim Öffnen gegenseitig überschreiben konnten.
- Offline-Betrieb war fachlich simuliert, aber nicht als installierbare PWA umgesetzt.
- Modal-Fokus und Fehlerdiagnostik waren je Funktion unterschiedlich.

## Zielarchitektur

`INGTEC_Assets/app-platform.js` bildet eine Querschnittsschicht um den bestehenden Demonstrator:

- Zustandsversion `schemaVersion: 2`, Validierung und nicht-destruktive Reparatur ableitbarer Beziehungen.
- Checkpoint und letzter gültiger Backupstand vor jedem Speichern.
- Zentrale Datei- und URL-Sicherheitsregeln.
- Lokaler IndexedDB-Dateitresor für Feststellungs- und Maßnahmen-Nachweise; die Fachprüfung akzeptiert nur gespeicherte Nachweise.
- Ein schreibgeschütztes, nicht serialisiertes V4-Lesemodell für verbleibende V3-Ansichten. Bearbeitung, Nachweis und Wirksamkeit bleiben im Maßnahmen-Workspace die einzige fachliche Wahrheit.
- Laufzeitdiagnostik, globale Fehlererfassung und Modal-Fokusmanagement.
- Export und explizite Wiederherstellung lokaler Backups.
- PWA-Registrierung für HTTP(S)-Bereitstellungen.

Die Fachmodule bleiben für Darstellung und domänenspezifische Interaktionen verantwortlich. Neue Querschnittsfunktionen gehören in den Plattform-Layer; neue Fachregeln in das jeweils passende Fachmodul.

## Historischer Hub-Start (vor App Shell)

`INGTEC_Assets/hub-launcher.js` und `hub-launcher.css` ergänzen einen vorgeschalteten App-Launcher. Er ist ein direkter Geschwisterknoten der bestehenden `.app`-Shell und wird daher nicht durch `renderAll()` ersetzt. Die vorhandene Seitenleiste bleibt unverändert; der Hub verwendet ausschließlich die vorhandenen Funktionen `canAccessPage()` und `setPage()`.

- Regulärer Erststart: Hub sichtbar, Anwendungsshell verborgen.
- Start einer Kachel: Hub wird ausgeblendet, die Shell wiederhergestellt und die vorhandene Route geöffnet.
- Rückkehr: Der Kopfzeilen-Button „Apps“ öffnet den Hub ohne Fachzustand oder offene Daten zu verwerfen.
- Routing: `?hub=1` kennzeichnet die Auswahl im Verlauf. Direkte Fachlinks, zum Beispiel `#inspection`, bleiben funktionsfähig und überspringen den Launcher.
- Berechtigung: Nicht erreichbare Apps werden nicht als startbare Kachel gerendert. Das Kundenportal besitzt zusätzlich das fachliche Gate `Finalisiert` plus `customerReleasedAt`.
- Fachliche Aufteilung: Feststellungen, Maßnahmen und Profile besitzen eigene Startkacheln. Die Collaboration-Suite ist als einzelne Daten- und Berechtigungsgrenze erhalten, wird im Hub aber getrennt nach Aktivität, Chats, Teams & Kanälen, Besprechungen, Aufgaben und Dateien gestartet.
- Persistenz: Es werden nur validierte Favoriten und Verlaufseinträge pro Konto im separaten Schlüssel `ingtecHub.preferences.v1.<account>` abgelegt.
- Persönliche Reihenfolge: In „Alle Apps“ lassen sich startbare Kacheln mit einem separaten Griff per Maus, Touch oder Tastatur sortieren. Das validierte Feld `tileOrder` bleibt eine reine Bedienpräferenz pro Konto; die Standardreihenfolge ist jederzeit wiederherstellbar.
- Offline: Beide Hub-Dateien gehören zur versionierten Service-Worker-App-Shell (`ingtec-inspect-v2.5.23`).

`IngtecHub.jsx` bleibt eine UI-Referenz und wird nicht unmittelbar geladen, weil für dieses HTML-Projekt kein React-Build-Scaffold vorhanden ist. Seine Informationsarchitektur (Gruppen, Codes, Favoriten, Verlauf und klar gekennzeichnete Integrationen in Vorbereitung) wurde in die statische Anwendung übertragen.

## App-Shell, Routing und INGTEC Hub

`INGTEC_Assets/app-registry.js` ist die einzige Definition der Fach-Apps. `app-shell.js` bindet sie an die vorhandene `.app`-Shell an; `hub-launcher.js` liest dieselbe Registry für Kacheln, Favoriten und Verlauf. Fachseiten, Datenmodelle und Berechtigungen bleiben dabei unverändert.

- Der Hub ist die zentrale Einstiegsebene; `#/apps` ist seine explizite Route.
- Die statische/offlinefähige Variante verwendet Hash-Routen wie `#/app/pruefungen/befundungen` und `#/app/teamarbeit/aufgaben`. Bei einem späteren Hosting mit Server-Rewrites kann dieselbe Registry echte `/app/...`-Pfade bedienen.
- Bestehende einfache Links wie `#inspection` und `?collab=tasks#chats` werden in den passenden App-Kontext überführt.
- Die gemeinsame Sidebar zeigt nur die Navigation der aktiven App. Vollständig migriert sind `Prüfungen` und `Teamarbeit`.
- Der globale Kopfzeilen-Button „Apps“ öffnet einen schnellen Switcher. „Alle Apps anzeigen“ führt zum vollständigen Hub.
- Registry und Sidebar verwenden weiter `canAccessPage()`; das Kundenportal behält zusätzlich das Gate `Finalisiert` plus `customerReleasedAt`.
- Registry, App-Shell und Hub gehören zur Service-Worker-App-Shell `ingtec-inspect-v2.5.24`.

## Daten- und Sicherheitsgrenzen

- Browserrollen und UI-Berechtigungen sind keine serverseitige Autorisierung.
- Lokales Auditlog und Backups sind nicht manipulationssicher.
- Produktive Freigaben benötigen unveränderliche, serverseitige Revisionen und Identitätsnachweise.
- Odoo, SharePoint/Graph, Entra ID und die Chat-API bleiben Integrationsziele. Tokens dürfen nicht dauerhaft im Browserzustand gespeichert werden.
- Aktive Dateitypen (`html`, `svg`, Skripte und ausführbare Dateien) werden lokal blockiert. Produktiv sind zusätzlich Malwareprüfung, Content-Disposition und serverseitige MIME-Prüfung erforderlich.
- Der Service Worker speichert nur die definierte App-Shell. API-, Download- und Dokumentantworten werden nicht gecacht. Die Offline-App muss über HTTP(S) bereitgestellt werden.
- Ein produktives Deployment muss HTTPS, eine nonce-/hash-basierte Content-Security-Policy und serverseitige Mandantenprüfung erzwingen. Die aktuelle Inline-Struktur verhindert noch eine strikte CSP ohne weitere Modularisierung.

## Prioritäten

- P0 umgesetzt: Datenintegrität, sichere Speicherung, Recovery, V4-Maßnahmenmodell, Nachweisablage, Uploadschutz und Fehlerfang.
- P1 umgesetzt: Plattformgrenze, Laufzeitdiagnostik, Fokusmanagement, mobile Kopfzeile sowie robuste Fachbereichsauswahl.
- P2 umgesetzt: Manifest, eingeschränkter Service-Worker-Cache, zentraler Selbsttest und Betriebsdokumentation.
- Folgeschritt für ein echtes Produkt: Aufteilung von `index.html` in ES-Module/Komponenten und Ablösung des Browserzustands durch eine versionierte Server-API mit PostgreSQL, Objektablage und Entra-ID-Autorisierung.

## Prüfbarkeit

Im Browser stehen bereit:

- `INGTECPlatform.runtimeReport()` – Laufzeit- und Datenzustand.
- `INGTECPlatform.validateState()` – Konsistenzprüfung.
- `window.__INGTEC_PLATFORM_TESTS__` – Plattform-Selbsttests.
- `window.INGTECAppRegistry.runTests()` und `window.INGTECAppShell.runTests()` – Registry- und App-Routingvertrag.
- `window.INGTECHub.runTests()` bzw. `window.__INGTEC_HUB_TESTS__` – Hub-Registry, Routingvertrag und Präferenztrennung.
- Bestehende Tests wie `runWorkspaceContractTests()` und die fachmodulspezifischen `__INGTEC_*_TESTS__`.

In den Einstellungen erscheint die Karte „Lokale Datenintegrität“ mit Diagnose, Backup-Export und expliziter Wiederherstellung.
