#!/usr/bin/env node
/**
 * INGTEC BSB – Mock API Server
 * Einfacher Test-Server zur Validierung des Frontend-Backend-Vertrags
 * 
 * Nutzung:
 *   node bsb-mock-server.js
 * 
 * Danach:
 *   - Frontend konfiguriert: state.syncApiEndpoint = 'http://localhost:3001/api/bsb/sync'
 *   - BSB Sync ausprobieren: window.bsbSyncNow()
 */

const http = require('http');
const url = require('url');

const PORT = 3001;
const API_VERSION = '1.0.0';

// In-Memory Speicher (nur für Tests)
let storage = {
  events: [],
  reports: [],
  syncCursor: null
};

/**
 * Middleware: CORS-Header setzen\
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Middleware: JSON-Body auslesen
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject({ status: 400, message: 'JSON-Parse-Fehler: ' + error.message });
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handler: POST /api/bsb/sync
 */
async function handleSyncBsb(req, body) {
  const errors = [];
  
  // Validierung
  if (!Array.isArray(body.events)) {
    errors.push('events ist erforderlich (Array)');
    return {
      status: 400,
      body: {
        ok: false,
        message: errors[0],
        received: 0,
        processed: 0,
        errors
      }
    };
  }

  const events = body.events || [];
  let processed = 0;
  const processedIds = [];

  // Events verarbeiten
  for (const event of events) {
    // Mindest-Validierung
    if (!event.id || !event.at || !event.entityType) {
      errors.push(`Event ohne erforderliche Felder: ${event.id || 'keine-id'}`);
      continue;
    }

    // Duplikat-Check
    if (storage.events.some(e => e.id === event.id)) {
      console.log(`  ⚠ Duplikat erkannt: ${event.id} (wird ignoriert)`);
      processed++;
      processedIds.push(event.id);
      continue;
    }

    // Speichern
    storage.events.push({
      ...event,
      receivedAt: new Date().toISOString(),
      source: body.source || 'unknown'
    });
    processed++;
    processedIds.push(event.id);
  }

  return {
    status: 200,
    body: {
      ok: errors.length === 0,
      received: events.length,
      processed,
      errors: errors.length ? errors : [],
      processedIds,
      serverTimestamp: new Date().toISOString(),
      nextSyncCursor: new Date().toISOString()
    }
  };
}

/**
 * Handler: POST /api/bsb/export
 */
async function handleExportReport(req, body) {
  const { reportId, objectId, customerId } = body;

  if (!reportId) {
    return {
      status: 400,
      body: {
        ok: false,
        message: 'reportId ist erforderlich'
      }
    };
  }

  // Simuliere: Bericht existiert
  const report = {
    id: reportId,
    objectId: objectId || 'OBJ-000',
    objectName: 'Test Objekt',
    date: new Date().toISOString().split('T')[0],
    safetyGrade: 'A',
    findingsCount: 3,
    releaseState: 'RELEASED',
    storedAt: `https://mock.example.com/reports/${reportId}.json`,
    serverTimestamp: new Date().toISOString()
  };

  storage.reports.push(report);

  return {
    status: 200,
    body: {
      ok: true,
      ...report
    }
  };
}

/**
 * Handler: GET /api/bsb/reports
 */
async function handleGetReports(req, queryParams) {
  const customerId = queryParams.customerId || null;
  const objectId = queryParams.objectId || null;
  const limit = Math.min(50, parseInt(queryParams.limit || '50', 10));
  const offset = parseInt(queryParams.offset || '0', 10);

  let reports = storage.reports;

  if (customerId) {
    reports = reports.filter(r => r.customerId === customerId);
  }
  if (objectId) {
    reports = reports.filter(r => r.objectId === objectId);
  }

  const paginated = reports.slice(offset, offset + limit);

  return {
    status: 200,
    body: {
      ok: true,
      reports: paginated,
      total: reports.length,
      offset,
      limit
    }
  };
}

/**
 * Haupt-Server
 */
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const queryParams = parsedUrl.query;
  const method = req.method;

  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json');

  // Preflight (OPTIONS)
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // POST /api/bsb/sync
    if (method === 'POST' && pathname === '/api/bsb/sync') {
      const body = await parseJsonBody(req);
      console.log(`\n[${new Date().toISOString()}] POST /api/bsb/sync`);
      console.log(`  Eingabe: ${body.events?.length || 0} Events`);
      const result = await handleSyncBsb(req, body);
      res.writeHead(result.status);
      res.end(JSON.stringify(result.body, null, 2));
      console.log(`  Ausgabe: ${result.body.processed} verarbeitet, ${result.body.errors.length} Fehler`);
      return;
    }

    // POST /api/bsb/export
    if (method === 'POST' && pathname === '/api/bsb/export') {
      const body = await parseJsonBody(req);
      console.log(`\n[${new Date().toISOString()}] POST /api/bsb/export`);
      console.log(`  Report: ${body.reportId}`);
      const result = await handleExportReport(req, body);
      res.writeHead(result.status);
      res.end(JSON.stringify(result.body, null, 2));
      return;
    }

    // GET /api/bsb/reports
    if (method === 'GET' && pathname === '/api/bsb/reports') {
      console.log(`\n[${new Date().toISOString()}] GET /api/bsb/reports`);
      console.log(`  Filter: customerId=${queryParams.customerId || 'all'}`);
      const result = await handleGetReports(req, queryParams);
      res.writeHead(result.status);
      res.end(JSON.stringify(result.body, null, 2));
      return;
    }

    // GET /api/bsb/status
    if (method === 'GET' && pathname === '/api/bsb/status') {
      console.log(`\n[${new Date().toISOString()}] GET /api/bsb/status`);
      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        service: 'INGTEC BSB Mock API',
        version: API_VERSION,
        uptime: process.uptime(),
        storage: {
          events: storage.events.length,
          reports: storage.reports.length
        },
        serverTimestamp: new Date().toISOString()
      }, null, 2));
      return;
    }

    // GET / (Info)
    if (method === 'GET' && pathname === '/') {
      console.log(`\n[${new Date().toISOString()}] GET /`);
      res.writeHead(200);
      res.end(JSON.stringify({
        service: 'INGTEC BSB Mock API Server',
        version: API_VERSION,
        endpoints: [
          'POST /api/bsb/sync – BSB-Events synchronisieren',
          'POST /api/bsb/export – Bericht exportieren',
          'GET /api/bsb/reports – Berichte abrufen',
          'GET /api/bsb/status – Server-Status'
        ],
        config: 'Frontend: state.syncApiEndpoint = \'http://localhost:3001/api/bsb/sync\''
      }, null, 2));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({
      ok: false,
      message: 'Endpoint nicht gefunden: ' + pathname
    }, null, 2));

  } catch (error) {
    console.error(`  ✗ Fehler: ${error.message}`);
    res.writeHead(error.status || 500);
    res.end(JSON.stringify({
      ok: false,
      message: error.message || 'Interner Fehler'
    }, null, 2));
  }
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        INGTEC BSB – Mock API Server (v${API_VERSION})               ║
╠═══════════════════════════════════════════════════════════════╣
║  Server läuft auf: http://localhost:${PORT}                   ║
║                                                               ║
║  Frontend-Konfiguration:                                     ║
║    state.syncApiEndpoint = 'http://localhost:${PORT}/api/bsb/sync'   ║
║                                                               ║
║  Endpoints:                                                   ║
║    GET  http://localhost:${PORT}/                            ║
║    GET  http://localhost:${PORT}/api/bsb/status              ║
║    POST http://localhost:${PORT}/api/bsb/sync                ║
║    POST http://localhost:${PORT}/api/bsb/export              ║
║    GET  http://localhost:${PORT}/api/bsb/reports             ║
║                                                               ║
║  Logs:                                                        ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`✗ Port ${PORT} ist bereits in Benutzung.`);
    console.error(`  Versuche: lsof -i :${PORT} / kill -9 <PID>`);
  } else {
    console.error('✗ Server-Fehler:', error.message);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\n✓ Server beendet.');
  process.exit(0);
});
