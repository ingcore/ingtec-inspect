# INGTEC Inspect

Interaktiver Demonstrator für die Prüf-, Bewertungs- und Wissensplattform der INGTEC GmbH: Auftrag → Objekt → Prüfung → Feststellung → Maßnahme → Qualitätssicherung → Kundenfreigabe, inklusive Safety-Score®, Kalender, Chat/Collaboration-Suite und Kundenportal.

Dies ist der eingefrorene HTML/JS-Prototyp mit Demodaten (lokale Speicherung im Browser). Er dient als Referenz und funktionierender Klick-Demonstrator — nicht als Basis für produktive Weiterentwicklung. Die aktive Neuentwicklung (Laravel-API + React/TypeScript) ist ein separates Projekt.

## Technologie

- **Frontend:** reines HTML5 / CSS3 / Vanilla JavaScript (ES2020+), keine Frameworks, kein Build-Schritt
- **Backend:** keines — alle Daten sind Demodaten
- **Datenbank:** keine — Persistenz ausschließlich clientseitig über `localStorage` (Anwendungszustand) und `IndexedDB` (Datei-Nachweise, Chat-Anhänge)
- **PWA:** installierbares Web-App-Manifest (`manifest.webmanifest`) + Service Worker (`service-worker.js`) für Offline-App-Shell

## Lokale Installation

Keine Abhängigkeiten, kein Package Manager, kein Build. Repository klonen:

```bash
git clone https://github.com/ingcore/ingtec-inspect.git
cd ingtec-inspect
```

## Entwicklung starten

Da die App PBKDF2 (Web Crypto) und den Service Worker nutzt, muss sie über HTTP(S) laufen (nicht per Doppelklick über `file://`). Ein beliebiger statischer Webserver reicht, z. B.:

```bash
python -m http.server 8080
# oder
npx serve .
```

Danach im Browser öffnen: `http://localhost:8080`

## Build

Kein Build-Schritt erforderlich — `index.html` wird direkt ausgeliefert.

## Environment Variables

Keine. Die Anwendung macht keine Netzwerk-/API-Aufrufe und benötigt keine Umgebungsvariablen oder Secrets.

## Deployment

Statisches Hosting über **GitHub Pages**, automatisiert per GitHub Actions (`.github/workflows/pages.yml`): jeder Push auf `main` baut kein Artefakt (nicht nötig), sondern veröffentlicht den Repository-Inhalt direkt über `actions/upload-pages-artifact` + `actions/deploy-pages`.

Alle Asset-Pfade (`INGTEC_Assets/...`, Manifest-Icons, Service-Worker-Registrierung) sind relativ, daher funktioniert die App unverändert unter dem GitHub-Pages-Unterpfad `https://ingcore.github.io/ingtec-inspect/`.

## Live-Version

**https://ingcore.github.io/ingtec-inspect/**

## Hinweise zu Produktionsgrenzen

Siehe [ARCHITECTURE.md](./ARCHITECTURE.md) und [QA_REPORT.md](./QA_REPORT.md) für Details zu bewusst nicht produktiven Aspekten (browserseitige Rollen/Freigaben ohne serverseitige Autorisierung, kein revisionssicheres Auditlog, Odoo/SharePoint/Entra ID bewusst unkonfiguriert). `IngtecHub.jsx` ist eine UI-Referenz und wird von der statischen App nicht geladen.
