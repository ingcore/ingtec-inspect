# INGTEC BSB – API-Kontrakt für Backend-Integration

**Version:** 1.0.0  
**Status:** Spezifikation für zukünftige Backend-Implementierung  
**Last Updated:** 2026-08-31

---

## Übersicht

Der BSB-Workspace (Brandschutzbegehungen) in INGTEC Inspect generiert lokal im Frontend eine Sync-Queue von Ereignissen. Dieser Kontrakt definiert die REST-API-Schnittstelle, die ein echtes Backend implementieren muss, um diese Events zu empfangen, zu speichern und zu verarbeiten.

### Kerneigenschaften
- **Asynchrone Event-basierte Synchronisation**: Frontend sendet Batch von Änderungen, Backend bestätigt
- **Fallback auf lokale Speicherung**: Wenn API nicht verfügbar, bleibt alles lokal
- **Audit & Compliance**: Alle Operationen werden mit Zeitstempel, Akteur und Quelle protokolliert
- **Optionale Authentifizierung**: Bearer Token für Sicherheit (HTTPS erforderlich)

---

## Authentifizierung

### Bearer Token (empfohlen für Produktion)
```
Authorization: Bearer {accessToken}
```

Das Token wird vom Frontend über `window.getAccessToken?.()` geholt oder kann fest in `state.syncToken` gespeichert sein.

### Fallback (Entwicklung ohne Authentifizierung)
Anfragen ohne `Authorization`-Header werden akzeptiert; Backend loggt einen Sicherheitshinweis.

---

## Endpoints

### 1. POST `/api/bsb/sync`

**Zweck:** Batch von lokalen BSB-Änderungen zum Backend synchronisieren.

**Request-Header:**
```
Content-Type: application/json
Authorization: Bearer {token}  # optional
```

**Request-Body:**
```json
{
  "events": [
    {
      "id": "BSB-1725112400000-a7f3b",
      "at": "2026-08-31T12:00:00.000Z",
      "entityType": "BSB",
      "entityId": "BEG-0001",
      "label": "BSB-Begehung finalisiert",
      "summary": "Betriebsgebäude Klagenfurt · A · freigegeben",
      "source": "BSB",
      "status": "bereit zur Synchronisierung"
    },
    {
      "id": "BSB-1725112410000-b4c2e",
      "at": "2026-08-31T12:00:10.000Z",
      "entityType": "BSB",
      "entityId": "REP-BEG-0001",
      "label": "BSB-Bericht exportiert",
      "summary": "Betriebsgebäude Klagenfurt · JSON Export",
      "source": "BSB",
      "status": "bereit zur Synchronisierung"
    }
  ],
  "source": "BSB",
  "savedAt": "2026-08-31T12:00:15.000Z"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "received": 2,
  "processed": 2,
  "errors": [],
  "serverTimestamp": "2026-08-31T12:00:15.123Z",
  "nextSyncCursor": "2026-08-31T12:00:15.123Z"
}
```

**Response (400 Bad Request):**
```json
{
  "ok": false,
  "message": "Events ist erforderlich (Array)",
  "received": 0,
  "processed": 0,
  "errors": ["Events ist erforderlich"]
}
```

**Response (401 Unauthorized):**
```json
{
  "ok": false,
  "message": "Authentifizierung erforderlich.",
  "received": 0,
  "processed": 0
}
```

**Response (500 Internal Server Error):**
```json
{
  "ok": false,
  "message": "Fehler beim Verarbeiten der Events",
  "received": 2,
  "processed": 0,
  "errors": ["Datenbankfehler: Connection timeout"]
}
```

---

### 2. POST `/api/bsb/export`

**Zweck:** Einen einzelnen BSB-Bericht mit allen Mängeln und Metadaten für die Integration oder Langzeitarchivierung exportieren.

**Request-Header:**
```
Content-Type: application/json
Authorization: Bearer {token}  # optional
```

**Request-Body:**
```json
{
  "reportId": "REP-BEG-0001",
  "objectId": "OBJ-101",
  "customerId": "CUS-1042",
  "exportFormat": "json",
  "includePhotos": false,
  "includePdf": false
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "reportId": "REP-BEG-0001",
  "objectName": "Betriebsgebäude Klagenfurt",
  "date": "2026-08-31",
  "safetyGrade": "A",
  "findingsCount": 3,
  "releaseState": "RELEASED",
  "storedAt": "https://example.com/reports/REP-BEG-0001.json",
  "serverTimestamp": "2026-08-31T12:00:15.123Z"
}
```

---

### 3. GET `/api/bsb/reports`

**Zweck:** Liste aller abgeschlossenen BSB-Berichte abrufen (z. B. für Archiv-Ansicht).

**Query-Parameter:**
- `objectId` (optional): Filtern nach Objekt
- `customerId` (optional): Filtern nach Kunde
- `from` (optional): ISO-Datum; Berichte ab diesem Datum
- `to` (optional): ISO-Datum; Berichte bis zu diesem Datum
- `limit` (optional): max. Anzahl; Standard 50
- `offset` (optional): Pagination; Standard 0

**Beispiel:**
```
GET /api/bsb/reports?customerId=CUS-1042&limit=10&offset=0
```

**Response (200 OK):**
```json
{
  "ok": true,
  "reports": [
    {
      "id": "REP-BEG-0001",
      "objectId": "OBJ-101",
      "objectName": "Betriebsgebäude Klagenfurt",
      "date": "2026-08-31",
      "safetyGrade": "A",
      "findingsCount": 3,
      "releaseState": "RELEASED",
      "createdAt": "2026-08-31T12:00:15.000Z",
      "createdBy": "M. Šop"
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 10
}
```

---

## Event-Typen (entityType)

| entityType | Beschreibung |
|-----------|-------------|
| `BSB` | Generischer BSB-Event (Standard für alle BSB-Operationen) |
| `BSB-Inspection` | Spezifische Begehungs-Änderung |
| `BSB-Finding` | Mangelerfassung/-änderung |
| `BSB-Report` | Berichts-Export oder -Freigabe |

---

## Status-Codes (Events)

| Status | Bedeutung |
|--------|-----------|
| `bereit zur Synchronisierung` | Lokal erzeugt, wartet auf Versand an Backend |
| `wird synchronisiert` | Frontend sendet gerade an Backend |
| `synchronisiert` | Backend hat erfolgreich empfangen & gespeichert |
| `wartet auf Synchronisierung` | Vorheriger Versuch fehlgeschlagen, wird erneut versucht |
| `lokal gespeichert` | Backend nicht verfügbar; Event bleibt lokal persistent |

---

## Fehlerbehandlung

### Transiente Fehler (Backend sollte Retry ermöglichen)
- HTTP 503 (Service Unavailable)
- HTTP 429 (Too Many Requests)
- Timeout (>30 Sekunden)

**Aktion Frontend:** Ereignis bleibt in Queue, wird bei nächstem `bsbSyncNow()` erneut versendet.

### Permanente Fehler
- HTTP 400 (Bad Request)
- HTTP 401 (Unauthorized)
- HTTP 422 (Unprocessable Entity – Datenvalidierung fehlgeschlagen)

**Aktion Frontend:** Ereignis wird als fehlgeschlagen markiert, kann manuell neu versendet werden.

---

## Implementierungs-Roadmap für Backend

### Phase 1: Empfang & Logging
- ✓ POST `/api/bsb/sync` akzeptiert Events und loggt sie
- ✓ Grundlegende Validierung (erforderliche Felder)
- ✓ Rückgabe von `{ok: true, received, processed}`

### Phase 2: Persistenz
- ☐ Ereignisse in Datenbank speichern
- ☐ Duplikate erkennen (idempotent via `id`)
- ☐ Timestamp-Validierung (Server vs. Client)

### Phase 3: Abfrage & Export
- ☐ GET `/api/bsb/reports` implementieren
- ☐ POST `/api/bsb/export` Berichte als JSON/PDF bereitstellen
- ☐ Langzeit-Archivierung + Compliance-Audit

### Phase 4: Authentifizierung & Autorisierung
- ☐ OIDC/Entra-Integration (Bearer Token Validierung)
- ☐ Role-basierte Zugriffskontrolle (RBAC)
- ☐ Audit-Trail (wer hat wann was exportiert)

---

## Frontend-Konfiguration

Im Frontend kann der BSB-Workspace so konfiguriert werden, dass er mit dem Backend spricht:

```javascript
// Im state oder per config:
state.syncApiEndpoint = 'https://api.example.com/api/bsb/sync';
state.syncToken = 'eyJhbGciOiJIUzI1NiIs...'; // oder dynamisch geholt

// Manuell triggern:
window.bsbSyncNow({
  endpoint: 'https://api.example.com/api/bsb/sync',
  token: await getAccessToken()
});

// Oder automatisch bei jedem finishInspection() aufgerufen
```

---

## Sicherheit & Compliance

- **HTTPS erforderlich** für alle API-Calls (Produktion)
- **CORS-Policy** auf Backend: Frontend-Origin erlauben
- **Idempotenz-Sicherheit**: Events haben eindeutige IDs; Backend darf Duplikate ignorieren
- **Audit-Logging**: Alle API-Calls mit `createdAt`, `source`, `entityId` persistent speichern
- **Datenschutz**: Keine persönlichen Daten in Event-Summaries (nur Objektnamen & Rollen)

---

## Mocking & Lokale Entwicklung

Falls kein Backend verfügbar ist, kann das Frontend so konfiguriert werden:

```javascript
// Im index.html oder als Runtime-Flag:
state.syncApiEndpoint = null;  // Deaktiviert API-Calls
// oder
state.syncApiEndpoint = 'mock';  // Verwendet lokalen Mock (siehe unten)
```

### Lokaler Mock-Server (optional)
Ein einfacher Mock-Endpunkt könnte im Service Worker oder eine lokale Node-Instanz implementiert werden:

```javascript
// Mock-Implementation (für Tests)
window.bsbMockSyncEndpoint = async (payload) => {
  console.log('Mock Sync:', payload);
  return {
    ok: true,
    received: payload.events?.length || 0,
    processed: payload.events?.length || 0,
    errors: [],
    serverTimestamp: new Date().toISOString()
  };
};
```

---

## Beispiel: Kompletter Request/Response-Workflow

### Szenario: Begehung abschließen und exportieren

**1. Frontend erfasst & speichert lokal:**
```javascript
const report = finishInspection(object, inspection, 'Begehung abgeschlossen.');
// → 2 Events werden zu syncQueue hinzugefügt:
//   - "BSB-Begehung finalisiert"
//   - "BSB-Bericht exportiert"
```

**2. Frontend versendet (manuell oder auto):**
```javascript
const result = await window.bsbSyncNow({
  endpoint: 'https://api.example.com/api/bsb/sync',
  token: 'Bearer xxx'
});
```

**3. Backend empfängt:**
```json
{
  "events": [
    {
      "id": "BSB-...",
      "at": "2026-08-31T12:00:00.000Z",
      "entityType": "BSB",
      "entityId": "BEG-0001",
      "label": "BSB-Begehung finalisiert",
      "summary": "...",
      "source": "BSB",
      "status": "bereit zur Synchronisierung"
    },
    ...
  ],
  "source": "BSB",
  "savedAt": "2026-08-31T12:00:15.000Z"
}
```

**4. Backend antwortet:**
```json
{
  "ok": true,
  "received": 2,
  "processed": 2,
  "errors": [],
  "serverTimestamp": "2026-08-31T12:00:15.123Z"
}
```

**5. Frontend aktualisiert Status:**
```javascript
// Events in syncQueue werden als "synchronisiert" markiert
// Benutzer sieht: "Synchronisierung erfolgreich"
```

---

## Testing & Validierung

### Unit-Tests (Backend)
```bash
POST /api/bsb/sync
  ✓ Leere Events-Liste wird abgelehnt
  ✓ Events ohne erforderliche Felder werden abgelehnt
  ✓ Duplikate werden erkannt (gleiche ID)
  ✓ Response enthält korrekte Zählwerte
  ✓ Fehlerhafte Daten werden in 'errors' array gesammelt
```

### Integration-Tests (Frontend + Backend)
```bash
1. Frontend speichert Begehung lokal
2. Frontend ruft bsbSyncNow() auf
3. Backend empfängt & speichert
4. Frontend prüft syncQueue-Status → "synchronisiert"
5. Backend-Query zeigt die gespeicherten Events
```

---

## Versioning

Falls die API in Zukunft geändert wird:

```
POST /api/v1/bsb/sync      # Aktuelle Version
POST /api/v2/bsb/sync      # Zukünftige Änderungen
```

Der Frontend-Code sollte die API-Version konfigurierbar machen:

```javascript
state.syncApiVersion = 'v1';  // Standard
state.syncApiEndpoint = `https://api.example.com/api/${state.syncApiVersion}/bsb/sync`;
```

---

## Kontakt & Support

Für Fragen zur Implementierung oder Änderungen am Kontrakt: Siehe ARCHITECTURE.md oder README.md.
