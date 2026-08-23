# INGTEC Inspect – Überarbeitungs- und Prüfbericht

Stand: 10. August 2026

## Ausgangszustand

`index.html` ist ein umfangreicher lokaler Demonstrator mit zentralem Browserzustand. Die vorhandenen Fachmodule, Manifest, Service Worker und alle statisch referenzierten Dateien im Ordner `INGTEC_Assets` waren vorhanden. Der fachliche Ablauf bleibt unverändert:

`Auftrag → Objekt → Prüfung → Feststellung → Maßnahme → Qualitätssicherung → Kundenfreigabe`

Die wesentlichen Risiken lagen in der lokalen Vertrauensgrenze, in konkurrierenden Maßnahmenstatusmodellen, nur metadatenbasierten Nachweisen, einer zu weit gefassten Service-Worker-Cache-Regel und in mobilen Überläufen der Kopfzeile.

## Umgesetzte Prioritäten

### P0 – Fachlichkeit, Datenintegrität und Sicherheit

- Korrupt gespeicherte Zustände werden vor dem Bootstrapping quarantänisiert und aus Checkpoint oder Backup wiederhergestellt, statt still durch Demodaten ersetzt zu werden.
- Neue lokale Passwörter verwenden PBKDF2-SHA-256 mit 210.000 Iterationen; erfolgreiche Altanmeldungen werden migriert. Das verbessert den Demonstrator, ersetzt aber keine serverseitige Identität.
- Das Maßnahmenmodell V4 ist jetzt das einzige persistierte Schreibmodell. Eine nur lesende, nicht serialisierte V3-Kompatibilitätsprojektion verhindert, dass Dashboard, Bericht oder Kundensicht wieder alte Statusfelder speichern.
- Feststellungs- und Maßnahmen-Nachweise werden mit Referenz auf einen IndexedDB-Dateitresor abgelegt. Eine fachliche Anerkennung bzw. ein Abschluss wird blockiert, solange keine gesicherte Datei referenziert ist.
- Uploads prüfen Dateiendung, MIME-Konsistenz und Größenlimit. Aktive oder unbekannte Dateitypen werden abgewiesen.
- Chat-Upload- und Download-URLs werden auf HTTPS sowie API-Origin bzw. explizit konfigurierte Upload-Origins begrenzt.
- Der Service Worker cached ausschließlich die definierte App-Shell. API-, Download-, PII- und beliebige Same-Origin-Antworten sind ausgeschlossen.

### P1 – Bedienbarkeit und Wartbarkeit

- Die mobile Kopfzeile komprimiert Suche, Benachrichtigungen und Synchronisierung ohne horizontalen Überlauf; das Profil wird auf sehr schmalen Ansichten sinnvoll reduziert.
- Auswahlfelder haben eine einheitliche Formensprache; die Fachbereichsauswahl bleibt über Karten sichtbar, ist scrollbar und wird nicht mehr abgeschnitten.
- Der Plattform-Layer bündelt Diagnose, Sicherung, Dateivalidierung, Modal-Fokusmanagement und Laufzeitfehlererfassung.
- Die bestehende Suche, Dark Mode, Statusfarben und mobile Bottom-Navigation bleiben erhalten.

### P2 – Offline- und Qualitätsgrundlage

- Die PWA-App-Shell ist versioniert und auf minimale Cacheflächen begrenzt.
- Der interne Browser-Testlauf umfasst Plattform-, Arbeitsplatz-, Prüfungs-, Feststellungs-, Maßnahmen-, Vertrags- und Shell-Prüfungen.
- Die Architektur- und Betriebsgrenzen sind in `ARCHITECTURE.md` festgehalten.

## Durchgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Vollständigkeit der statisch referenzierten Assets, Manifest und Service-Worker-Shell | bestanden |
| Maßnahmen-V4-Migration gegen Rückschreiben von V3-Feldern | bestanden |
| Browser-Selbsttest bei 1440 × 1000 | 85 von 85 bestanden |
| Persönliche Kachelreihenfolge per Maus, Touch und Tastatur inklusive Neuladen | bestanden |
| Mobile Sichtprüfung bei 500 × 844 | bestanden, kein horizontaler Kopfzeilenüberlauf |
| Prüfung der Cache-Regeln auf App-Shell- und Navigationsbeschränkung | bestanden |

Der PWA-Service-Worker wird absichtlich nur über HTTP(S) registriert. Eine Live-Aktivierung muss daher nach dem Deployment über die Ziel-HTTPS-Domain wiederholt werden; `file://` ist dafür kein valider Betriebsmodus.

## Verbleibende Produktionsgrenzen

- Rollen, Freigaben und Auditdaten sind weiterhin browserseitig und damit nicht manipulationssicher. Für Produktion sind Entra ID/OIDC, serverseitige Autorisierung, Mandantentrennung und ein revisionssicheres Auditlog erforderlich.
- Der lokale Dateitresor ist eine Offline-Stufe, keine revisionssichere Dokumentenablage. Produktiv sind Objektablage, Malwareprüfung, Aufbewahrung, Verschlüsselung und SharePoint/Graph- oder vergleichbare Serverintegration notwendig.
- Die monolithische Inline-Struktur verhindert derzeit eine strikte nonce-/hash-basierte CSP. Dafür müssen Inline-Skripte, `onclick`-Handler und Styles in versionierte Module überführt werden.
- Odoo, SharePoint/Graph und Chat-Synchronisierung bleiben bewusst unkonfiguriert, bis serverseitige Schnittstellen, Secrets und Datenverträge bereitstehen.

## Nachtrag: INGTEC Hub

- Beim regulären Start erscheint nun die App-Auswahl `INGTEC Hub`. Sie basiert auf der fachlichen Struktur aus `IngtecHub.jsx`, ist jedoch als wartbares Vanilla-JS-Modul umgesetzt.
- Jede startbare Kachel ruft ausschließlich die vorhandenen Routen über `setPage()` auf; `canAccessPage()` und die vorhandenen Rollenrechte bleiben die alleinige Zugriffsgrenze.
- Nicht konfigurierte Ziele (CRM, Angebote, Abrechnung, Academy) sind sichtbar als „In Vorbereitung“, aber nicht anklickbar. Das Kundenportal bleibt bis zur expliziten Kundenfreigabe gesperrt.
- Favoriten und zuletzt geöffnete Apps werden pro lokalem Benutzer unter `ingtecHub.preferences.v1.<account>` gespeichert. Fach- und Freigabedaten werden dadurch nicht verändert.
- Startbare Kacheln lassen sich in der Ansicht „Alle Apps“ per Ziehgriff (Maus/Touch) oder Tastatur umsortieren. Die persönliche Reihenfolge wird pro Benutzer gespeichert und kann auf die Standardreihenfolge zurückgesetzt werden.
- Ein „Apps“-Button in der Kopfzeile bringt jederzeit ohne Datenverlust zur Auswahl zurück. Direkte Links wie `#inspection` überspringen den Hub absichtlich.

Zusätzlich zum Selbsttest wurden der echte Browserwechsel `Hub → Aufträge → Hub` sowie ein direkter `#inspection`-Link per Chrome-DevTools-Protokoll geprüft. Beide Routen lieferten den erwarteten sichtbaren Bereich und unveränderten lokalen Fachzustand.
