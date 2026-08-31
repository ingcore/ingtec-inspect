# BSB Backend-Integration: Schnellstart

**Ziel:** Den BSB-Workspace mit einem echten API-Endpunkt verbinden (statt nur lokal zu speichern).

---

## Optionen

### 1. **Schnelltest mit Mock-Server (lokal)**

Der Mock-Server simuliert einen echten Backend und akzeptiert alle BSB-Sync-Calls.

#### Setup:
```bash
cd /path/to/ingtec-inspect
node bsb-mock-server.js
```

Erwartet:
```
╔═══════════════════════════════════════════════════════════════╗
║        INGTEC BSB – Mock API Server (v1.0.0)               ║
╠═══════════════════════════════════════════════════════════════╣
║  Server läuft auf: http://localhost:3001                   ║
║  ...
```

#### Im Frontend konfigurieren:
Öffne die Browser-Konsole und führe aus:
```javascript
state.syncApiEndpoint = 'http://localhost:3001/api/bsb/sync';
```

Oder in [index.html](index.html) vor dem Speichern:
```javascript
// In der window.saveState oder localStorage-Initalisierung:
if (location.hostname === 'localhost') {
  state.syncApiEndpoint = 'http://localhost:3001/api/bsb/sync';
}
```

#### Test:
1. Begehung abschließen in der BSB-App
2. Im Workspace sollte eine Erfolgs-Meldung erscheinen: "Synchronisierung erfolgreich"
3. Mock-Server sollte folgende Logs zeigen:
   ```
   [2026-08-31T12:00:00Z] POST /api/bsb/sync
     Input: 2 Events
     Output: 2 verarbeitet, 0 Fehler
   ```

---

### 2. **Mit echtem Backend (Express.js Beispiel)**

Falls du selbst einen Backend-Server schreiben willst, hier ist ein Minimal-Beispiel:

#### server.js:
```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Datenbank: Hier würde deine echte DB-Verbindung gehen
// (z. B. Prisma, TypeORM, SQLAlchemy, etc.)
const events = [];

app.post('/api/bsb/sync', (req, res) => {
  const { events: incomingEvents = [] } = req.body;

  if (!Array.isArray(incomingEvents)) {
    return res.status(400).json({
      ok: false,
      message: 'events ist erforderlich (Array)',
      received: 0,
      processed: 0
    });
  }

  // Speichern in DB (Pseudo-Code)
  let processed = 0;
  for (const event of incomingEvents) {
    // await Event.create(event); // Mit echte DB
    events.push(event);
    processed++;
  }

  res.json({
    ok: true,
    received: incomingEvents.length,
    processed,
    errors: [],
    serverTimestamp: new Date().toISOString()
  });
});

app.listen(3000, () => {
  console.log('BSB Backend läuft auf http://localhost:3000');
});
```

#### Frontend-Konfiguration:
```javascript
state.syncApiEndpoint = 'http://localhost:3000/api/bsb/sync';
```

---

### 3. **Mit echtem Backend (Python FastAPI Beispiel)**

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

events_db = []

class BsbEvent(BaseModel):
    id: str
    at: str
    entityType: str
    entityId: str
    label: str
    summary: str
    source: str
    status: str

class SyncRequest(BaseModel):
    events: List[BsbEvent]
    source: str
    savedAt: str

@app.post("/api/bsb/sync")
async def sync_bsb(request: SyncRequest):
    if not request.events:
        raise HTTPException(status_code=400, detail="events erforderlich")
    
    processed = 0
    for event in request.events:
        # await db.events.insert(event.dict())  # Mit echter DB
        events_db.append(event.dict())
        processed += 1
    
    return {
        "ok": True,
        "received": len(request.events),
        "processed": processed,
        "errors": [],
        "serverTimestamp": datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
```

```bash
pip install fastapi uvicorn
python server.py
```

---

## API-Vertrag

Der vollständige Vertrag ist in [BSB_API_CONTRACT.md](BSB_API_CONTRACT.md) dokumentiert.

### Wichtige Endpoints:

| Methode | Endpoint | Zweck |
|---------|----------|-------|
| POST | `/api/bsb/sync` | BSB-Events synchronisieren |
| POST | `/api/bsb/export` | Bericht exportieren |
| GET | `/api/bsb/reports` | Berichte abrufen |

---

## Debugging & Logging

### Frontend-Konsole:
```javascript
// Aktueller Sync-Status
console.log(state.syncQueue);

// Manuell Sync triggern
await window.bsbSyncNow();

// Mit Debug-Logs
const result = await window.bsbSyncNow({
  endpoint: 'http://localhost:3001/api/bsb/sync'
});
console.log(result);
```

### Network Inspector (F12 → Network):
Alle POST-Requests zu `/api/bsb/sync` sollten sichtbar sein.

---

## Häufige Fehler

### ❌ "CORS-Fehler"
Backend antwortet nicht auf `OPTIONS`-Requests.

**Lösung:**
```javascript
// Node.js/Express:
app.use(cors());

// Python/FastAPI: bereits in obigem Beispiel enthalten
```

### ❌ "Network Error / Timeout"
Backend läuft nicht oder Port ist falsch.

**Lösung:**
```bash
# Prüfe ob Server läuft:
curl http://localhost:3001/api/bsb/status

# Wenn Fehler: Starte Mock-Server neu
node bsb-mock-server.js
```

### ❌ "401 Unauthorized"
Backend erwartet Authentication Token.

**Lösung:**
```javascript
// Token übergeben:
await window.bsbSyncNow({
  endpoint: 'https://api.example.com/api/bsb/sync',
  token: 'Bearer eyJhbGciOiJIUzI1NiIs...'
});
```

---

## Nächste Schritte

### Für Entwicklung:
1. ✅ Starte Mock-Server (`node bsb-mock-server.js`)
2. ✅ Konfiguriere Frontend (`state.syncApiEndpoint = 'http://localhost:3001/...'`)
3. ✅ Teste BSB-Workflow (Begehung → Abschluss → Sync)
4. ✅ Prüfe Mock-Server Logs

### Für Produktion:
1. ☐ Implementiere echten Backend (Express, FastAPI, etc.)
2. ☐ Datenbankanbindung (PostgreSQL, SQLite, etc.)
3. ☐ Authentifizierung (OIDC, JWT, etc.)
4. ☐ HTTPS + Sicherheit
5. ☐ Load-Testing & Performance-Tuning
6. ☐ Monitoring & Alerting (Sentry, DataDog, etc.)

---

## Kontakt

Fragen zur Integration? Siehe [ARCHITECTURE.md](ARCHITECTURE.md) oder [BSB_API_CONTRACT.md](BSB_API_CONTRACT.md).
