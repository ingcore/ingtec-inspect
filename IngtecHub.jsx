import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";

/* ============================================================================
   INGTEC HUB — Overlay / Experience Layer
   PRD-INGTEC-PLATFORM-001 v1.0  ·  EPIC-01: Design Tokens, Icon Registry, App Registry
   ----------------------------------------------------------------------------
   Dieses Overlay ist die Hülle über ALLEN Anwendungen: Kopfzeile, Kontextfilter,
   globale Suche, "+ Neu", Favoriten, Zuletzt verwendet, Deep Link + Rücksprung.
   Bestehende Eigenanwendungen (BSK, Bilder-Index, Niederschrift) sind als
   Registry-Einträge vom Typ "eigen" eingehängt — ohne Quellcodeänderung (HUB-004).

   Abgedeckt: HUB-001..009, NAV-001/002, DS-001..004
   Bewusst offen (Backend): serverseitige Autorisierung (P-01/23.3), Persistenz
   von Favoriten via API (HUB-002 — hier In-Memory, siehe persistence()).
   ========================================================================== */

/* ---------------------------------------------------------------- 1. TOKENS */
const T = {
  green: "#9DC31A",
  greenDark: "#5F7600",
  ink: "#14171C",
  ink70: "#4A5058",
  ink40: "#878D95",
  line: "#DEE1DC",
  lineSoft: "#ECEEE9",
  surface: "#FFFFFF",
  canvas: "#F7F8F5",
  assess: "#E7E9E3",      // Bewertungsfläche
  critical: "#B3261E",    // nur mit Text + Symbol (P-09 / DS-003)
  radius: "10px",
  tap: "44px",
  motion: "160ms cubic-bezier(.2,.6,.2,1)",
  fontDisplay:
    '"Microsoft JhengHei UI Light","Microsoft JhengHei UI","Microsoft JhengHei","Segoe UI Light","Segoe UI",Arial,sans-serif',
  fontBody: 'Arial,"Helvetica Neue",Helvetica,sans-serif',
  fontMono: '"SFMono-Regular",Consolas,"Liberation Mono",monospace',
};

const CSS = `
.ig-root{--ig-green:${T.green};--ig-ink:${T.ink};font-family:${T.fontBody};color:${T.ink};background:${T.canvas};min-height:100%;}
.ig-root *,.ig-root *::before,.ig-root *::after{box-sizing:border-box;}
.ig-display{font-family:${T.fontDisplay};font-weight:300;letter-spacing:.01em;}
.ig-mono{font-family:${T.fontMono};font-variant-numeric:tabular-nums;}
.ig-focus:focus-visible{outline:2px solid ${T.ink};outline-offset:2px;box-shadow:0 0 0 4px rgba(157,195,26,.45);border-radius:6px;}
.ig-btn{min-height:${T.tap};min-width:${T.tap};display:inline-flex;align-items:center;justify-content:center;gap:8px;
  background:transparent;border:1px solid transparent;border-radius:${T.radius};cursor:pointer;font:inherit;color:inherit;
  padding:0 12px;transition:background ${T.motion},border-color ${T.motion};}
.ig-btn:hover{background:${T.lineSoft};}
.ig-btn[disabled]{opacity:.45;cursor:not-allowed;}
.ig-btn--primary{background:${T.ink};color:#fff;border-color:${T.ink};padding:0 18px;}
.ig-btn--primary:hover{background:#000;}
.ig-btn--outline{border-color:${T.line};background:${T.surface};}
.ig-tile{display:flex;flex-direction:column;align-items:center;gap:12px;background:transparent;border:0;padding:6px 4px 10px;
  cursor:pointer;font:inherit;color:inherit;width:100%;max-width:172px;}
.ig-tile__plate{position:relative;width:104px;height:104px;display:grid;place-items:center;background:${T.surface};
  border:1px solid ${T.line};border-radius:20px;box-shadow:0 1px 2px rgba(20,23,28,.05);
  transition:border-color ${T.motion},transform ${T.motion},box-shadow ${T.motion};}
.ig-tile:hover .ig-tile__plate{border-color:${T.ink};transform:translateY(-3px);box-shadow:0 10px 24px rgba(20,23,28,.10);}
.ig-tile:active .ig-tile__plate{transform:translateY(0);}
.ig-tile__code{position:absolute;top:7px;right:9px;font-size:9.5px;letter-spacing:.06em;color:${T.ink40};}
.ig-tile__name{font-size:14px;line-height:1.3;font-weight:700;text-align:center;max-width:100%;}
@media(max-width:720px){.ig-tile__plate{width:88px;height:88px;border-radius:18px;}.ig-tile__name{font-size:13px;}}
.ig-fav{position:absolute;top:4px;left:50%;margin-left:-54px;width:34px;height:34px;border:0;background:transparent;
  cursor:pointer;display:grid;place-items:center;border-radius:8px;}
@media(max-width:720px){.ig-fav{margin-left:-46px;}}
.ig-grid{display:grid;gap:22px 12px;grid-template-columns:repeat(6,minmax(0,1fr));justify-items:center;}
@media(max-width:1180px){.ig-grid{grid-template-columns:repeat(4,minmax(0,1fr));}}
@media(max-width:720px){.ig-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.ig-hide-sm{display:none!important;}}
.ig-only-sm{display:none!important;}
@media(max-width:720px){.ig-only-sm{display:flex!important;}}
@media(max-width:460px){.ig-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
.ig-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid ${T.line};
  background:${T.surface};font-size:13px;cursor:pointer;transition:all ${T.motion};}
.ig-chip[aria-pressed="true"]{background:${T.ink};color:#fff;border-color:${T.ink};}
.ig-scrim{position:fixed;inset:0;background:rgba(20,23,28,.42);display:flex;align-items:flex-start;justify-content:center;
  padding:8vh 16px 16px;z-index:50;}
.ig-sheet{background:${T.surface};border:1px solid ${T.line};border-radius:14px;width:100%;max-width:720px;
  box-shadow:0 24px 64px rgba(20,23,28,.24);overflow:hidden;}
.ig-input{width:100%;height:${T.tap};border:1px solid ${T.line};border-radius:${T.radius};padding:0 14px;font:inherit;background:${T.surface};}
.ig-input:focus-visible{outline:2px solid ${T.ink};outline-offset:1px;}
.ig-row{display:flex;width:100%;align-items:center;gap:12px;padding:10px 16px;min-height:${T.tap};background:transparent;
  border:0;border-top:1px solid ${T.lineSoft};cursor:pointer;font:inherit;text-align:left;}
.ig-row:hover,.ig-row[data-active="true"]{background:${T.lineSoft};}
.ig-lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${T.ink40};}
@media(prefers-reduced-motion:reduce){.ig-root *{transition:none!important;animation:none!important;}}
`;

/* ------------------------------------------------- 2. ICON REGISTRY (DS-002)
   Ein technisches Grundmotiv, anthrazitfarbene Kontur, EIN grüner Funktions-
   akzent, einheitliche Strichstärke. Keine Emojis, keine bunten Illustrationen. */
const S = { fill: "none", stroke: T.ink, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
const A = { ...S, stroke: T.green };

const Icon = ({ code, size = 30 }) => {
  const P = ICONS[code] || ICONS.__fallback;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-hidden="true" focusable="false">
      <P />
    </svg>
  );
};

const ICONS = {
  __fallback: () => <><rect x="6" y="6" width="20" height="20" rx="3" {...S} /><path d="M11 16h10" {...A} /></>,
  AUF: () => <><path d="M6 19a10 10 0 0 1 20 0" {...S} /><path d="M4 19h24" {...S} /><path d="M16 9V5" {...S} /><path d="M12 15l3 3 5-6" {...A} /></>,
  PRUEF: () => <><path d="M16 4l10 4v8c0 6-4.5 10-10 12C10.5 26 6 22 6 16V8z" {...S} /><path d="M11 16l3.5 3.5L21 13" {...A} /></>,
  OBJ: () => <><path d="M5 27V13l7-4v4l7-4v18" {...S} /><path d="M19 27V11h8v16" {...S} /><circle cx="23" cy="17" r="2.4" {...A} /></>,
  MGL: () => <><path d="M16 5l11 19H5z" {...S} /><path d="M16 12v6" {...S} /><path d="M16 21.5v.5" {...S} /><path d="M20 27h7" {...A} /></>,
  BER: () => <><path d="M8 4h11l5 5v19H8z" {...S} /><path d="M19 4v5h5" {...S} /><circle cx="16" cy="19" r="3.6" {...A} /><path d="M14 23.5l-1 4 3-1.6 3 1.6-1-4" {...A} /></>,
  SCORE: () => <><path d="M16 4l10 4v8c0 6-4.5 10-10 12C10.5 26 6 22 6 16V8z" {...S} /><path d="M11 20h10" {...S} /><path d="M12 17v-3M16 17v-5M20 17v-7" {...A} /></>,
  PLAN: () => <><rect x="4" y="7" width="24" height="18" rx="2" {...S} /><path d="M4 12h24M11 25V12" {...S} /><path d="M16 16h8M16 20h5" {...A} /></>,
  CRM: () => <><circle cx="12" cy="12" r="4" {...S} /><path d="M4 25c0-4.4 3.6-7 8-7s8 2.6 8 7" {...S} /><rect x="20" y="14" width="8" height="11" rx="1.5" {...A} /></>,
  ANG: () => <><path d="M7 4h13l5 5v19H7z" {...S} /><path d="M11 13h10M11 18h7" {...S} /><path d="M18 25l7-7 2.5 2.5-7 7H18z" {...A} /></>,
  ZEIT: () => <><rect x="4" y="7" width="24" height="21" rx="2" {...S} /><path d="M4 13h24M10 4v5M22 4v5" {...S} /><path d="M9 20h8" {...A} /><circle cx="20" cy="20" r="2" {...A} /></>,
  EUR: () => <><path d="M8 4h16v24l-3-2-2.5 2-2.5-2-2.5 2-2.5-2-3 2z" {...S} /><path d="M20 12.5A5 5 0 0 0 12.5 16 5 5 0 0 0 20 19.5" {...A} /><path d="M11 15h5M11 17.5h5" {...A} /></>,
  SRV: () => <><circle cx="16" cy="16" r="4" {...S} /><path d="M6 12a11 11 0 0 1 3-3M23 9a11 11 0 0 1 3 3M26 20a11 11 0 0 1-3 3M9 23a11 11 0 0 1-3-3" {...S} /><path d="M16 5v3M16 24v3" {...A} /></>,
  WEB: () => <><rect x="3" y="7" width="19" height="13" rx="1.5" {...S} /><path d="M9 24h8" {...S} /><path d="M12.5 20v4" {...S} /><rect x="22" y="15" width="7" height="12" rx="1.5" {...A} /></>,
  WIS: () => <><circle cx="16" cy="16" r="3" {...S} /><circle cx="8" cy="9" r="2.4" {...S} /><circle cx="24" cy="9" r="2.4" {...S} /><circle cx="8" cy="23" r="2.4" {...S} /><circle cx="24" cy="23" r="2.4" {...A} /><path d="M13.6 14.2 10 10.6M18.4 14.2 22 10.6M13.6 17.8 10 21.4M18.4 17.8 22 21.4" {...S} /></>,
  NORM: () => <><path d="M16 9c-3-2.5-7-3-11-2.5v17C9 23 13 23.5 16 26c3-2.5 7-3 11-2.5v-17C23 6 19 6.5 16 9z" {...S} /><path d="M16 9v17" {...S} /><path d="M20 13h4M20 17h3" {...A} /></>,
  TXT: () => <><path d="M8 4h12l4 4v20H8z" {...S} /><path d="M12 12h10M12 16h10M12 20h6" {...S} /><path d="M20 24h4" {...A} /></>,
  DOK: () => <><path d="M4 9V7h9l2 3h13v4H4z" {...S} /><path d="M4 12h24v14H4z" {...S} /><path d="M11 19h10" {...A} /></>,
  AI: () => <><rect x="7" y="9" width="18" height="14" rx="5" {...S} /><path d="M16 4v5" {...S} /><circle cx="16" cy="4" r="1.6" {...A} /><path d="M12.5 15v2M19.5 15v2" {...A} /><path d="M4 14v4M28 14v4" {...S} /></>,
  AKD: () => <><path d="M16 5 4 11l12 6 12-6z" {...S} /><path d="M9 14v6c0 2.5 3.5 4 7 4s7-1.5 7-4v-6" {...S} /><path d="M13 18.5l2.5 2.5 4.5-5" {...A} /></>,
  GF: () => <><rect x="3" y="6" width="26" height="20" rx="2" {...S} /><path d="M8 20a8 8 0 0 1 16 0" {...S} /><path d="M16 20l5-5" {...A} /></>,
  KPI: () => <><path d="M5 26V6M5 26h22" {...S} /><path d="M10 21v-5M15 21v-9M20 21v-6" {...S} /><path d="M9 13l5-6 5 4 7-8" {...A} /></>,
  AST: () => <><path d="M3 20v-7h13l4 4h8v3" {...S} /><circle cx="9" cy="22" r="2.6" {...S} /><circle cx="23" cy="22" r="2.6" {...S} /><path d="M11.6 22h8.8" {...S} /><path d="M6 9h8" {...A} /></>,
  QM: () => <><rect x="5" y="5" width="22" height="22" rx="3" {...S} /><path d="M10 16.5l4 4 8-9" {...A} /><path d="M5 22h22" {...S} /></>,
  SYS: () => <><circle cx="16" cy="16" r="4" {...S} /><path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2 2M22.5 22.5l2 2M24.5 7.5l-2 2M9.5 22.5l-2 2" {...S} /><path d="M16 12v4l3 2" {...A} /></>,
  /* --- Eigenanwendungen Hannes ------------------------------------------- */
  BSK: () => <><path d="M6 27V9l10-5 10 5v18z" {...S} /><path d="M16 22c-2.2 0-4-1.6-4-3.8 0-2.6 2.6-3.6 2.6-6.2 2.8 1.2 3.6 3 3.6 4.2 1-.6 1.2-1.6 1.2-2.4 1.4 1.4 2.6 3 2.6 4.4 0 2.2-1.8 3.8-6 3.8z" {...A} /></>,
  BILD: () => <><rect x="4" y="7" width="24" height="18" rx="2" {...S} /><path d="M4 20l6-5 5 4 4-3 9 7" {...S} /><circle cx="21" cy="12.5" r="2.2" {...A} /></>,
  NIED: () => <><path d="M8 4h11l5 5v19H8z" {...S} /><path d="M19 4v5h5" {...S} /><path d="M12 14h8M12 18h8M12 22h5" {...S} /><path d="M20.5 24.5l2 2 4-4.5" {...A} /></>,
};

/* ------------------------------------------------- 3. APP REGISTRY (HUB-004)
   Neue Kachel = neuer Eintrag. Kein Quellcode. In der Zielarchitektur kommt
   diese Liste versioniert aus /api/v1/hub/apps (berechtigungsgefiltert). */
const GROUPS = [
  { id: "work", label: "Arbeit und Prüfung" },
  { id: "sales", label: "Vertrieb und Steuerung" },
  { id: "knowledge", label: "Wissen und KI" },
  { id: "mgmt", label: "Management und System" },
  { id: "own", label: "Eigene Werkzeuge" },
];

const AREAS = ["TECHNIK", "BUSINESS", "CONSULTING"];
const ALL = AREAS;

// type: native | integriert | launcher | modul | eigen
const APPS = [
  { id: "APP-01", name: "Aufträge & Einsätze", code: "AUF", icon: "AUF", group: "work", type: "native", lead: "Odoo (Auftrag)", areas: ALL, roles: ["*"], badge: { n: 4, label: "heute" }, release: "P0" },
  { id: "APP-02", name: "INGTEC Inspect", code: "PRÜF", icon: "PRUEF", group: "work", type: "native", areas: ALL, roles: ["*"], badge: { n: 2, label: "offen" }, release: "P0", nav: ["Cockpit", "Vorgänge", "Kunden & Objekte", "Feststellungen & Maßnahmen", "Ergebnisse", "Wissen & Standards", "Kundenservice", "Administration"] },
  { id: "APP-03", name: "Kunden & Objekte", code: "OBJ", icon: "OBJ", group: "work", type: "native", lead: "Odoo (Kundenstamm)", areas: ALL, roles: ["*"], release: "P0" },
  { id: "APP-04", name: "Feststellungen & Maßnahmen", code: "MGL", icon: "MGL", group: "work", type: "native", areas: ALL, roles: ["*"], badge: { n: 12, label: "offen", critical: true }, release: "P0" },
  { id: "APP-05", name: "Berichte & Ergebnisse", code: "BER", icon: "BER", group: "work", type: "native", lead: "SharePoint (Dokumente)", areas: ALL, roles: ["pruefer", "fach", "qs", "gf", "admin"], badge: { n: 2, label: "Freigaben" }, release: "P0" },
  { id: "APP-06", name: "Safety-Score®", code: "S®", icon: "SCORE", group: "work", type: "native", areas: ["TECHNIK"], roles: ["fach", "qs", "gf", "admin"], release: "P0 (BMA)" },
  { id: "APP-07", name: "INGTEC PLAN", code: "PLAN", icon: "PLAN", group: "work", type: "modul", flag: "plan_module", areas: ["TECHNIK", "CONSULTING"], roles: ["fach", "gf", "admin"], release: "P1/P2" },

  { id: "APP-08", name: "CRM & Kontakte", code: "CRM", icon: "CRM", group: "sales", type: "launcher", lead: "Odoo", areas: ALL, roles: ["assistenz", "fach", "gf", "admin"], release: "P0" },
  { id: "APP-09", name: "Angebote & Verträge", code: "ANG", icon: "ANG", group: "sales", type: "launcher", lead: "Odoo", areas: ALL, roles: ["assistenz", "gf", "admin"], release: "P0" },
  { id: "APP-10", name: "Planung & Zeiten", code: "ZEIT", icon: "ZEIT", group: "sales", type: "integriert", lead: "Odoo / M365", areas: ALL, roles: ["*"], release: "P1" },
  { id: "APP-11", name: "Abrechnung", code: "EUR", icon: "EUR", group: "sales", type: "launcher", lead: "Odoo", areas: ALL, roles: ["assistenz", "gf", "admin"], release: "P0" },
  { id: "APP-12", name: "Kundenservice", code: "SRV", icon: "SRV", group: "sales", type: "integriert", lead: "Odoo (kaufmännisch)", areas: ALL, roles: ["assistenz", "fach", "gf", "admin"], release: "P1" },
  { id: "APP-13", name: "Kundenportal", code: "WEB", icon: "WEB", group: "sales", type: "integriert", areas: ALL, roles: ["assistenz", "gf", "admin"], release: "P1" },

  { id: "APP-14", name: "INGMIND", code: "WIS", icon: "WIS", group: "knowledge", type: "integriert", lead: "SharePoint / Suchindex", areas: ALL, roles: ["*"], release: "P1" },
  { id: "APP-15", name: "INGNORM", code: "NORM", icon: "NORM", group: "knowledge", type: "native", areas: ALL, roles: ["*"], release: "P1" },
  { id: "APP-16", name: "INGTEXT & Vorlagen", code: "TXT", icon: "TXT", group: "knowledge", type: "native", areas: ALL, roles: ["*"], release: "P0/P1" },
  { id: "APP-17", name: "Dokumente", code: "DOK", icon: "DOK", group: "knowledge", type: "integriert", lead: "SharePoint", areas: ALL, roles: ["*"], release: "P0" },
  { id: "APP-18", name: "INGTEC Assist", code: "AI", icon: "AI", group: "knowledge", type: "native", lead: "AI Gateway", areas: ALL, roles: ["*"], release: "P1" },
  { id: "APP-19", name: "INGTEC Academy", code: "AKD", icon: "AKD", group: "knowledge", type: "modul", flag: "academy", areas: ALL, roles: ["*"], release: "P2" },

  { id: "APP-20", name: "Management Cockpit", code: "GF", icon: "GF", group: "mgmt", type: "native", areas: ALL, roles: ["gf", "admin"], release: "P1" },
  { id: "APP-21", name: "Analysen & KPI", code: "KPI", icon: "KPI", group: "mgmt", type: "integriert", lead: "Power BI", areas: ALL, roles: ["gf", "qs", "admin"], release: "P1" },
  { id: "APP-22", name: "Assets & Fleet", code: "AST", icon: "AST", group: "mgmt", type: "native", areas: ALL, roles: ["assistenz", "gf", "admin"], release: "P2" },
  { id: "APP-23", name: "Qualitätsmanagement", code: "QM", icon: "QM", group: "mgmt", type: "native", areas: ALL, roles: ["qs", "gf", "admin"], release: "P0/P1" },
  { id: "APP-24", name: "Administration", code: "SYS", icon: "SYS", group: "mgmt", type: "native", areas: ALL, roles: ["admin"], release: "P0" },

  /* Bestehende Eigenanwendungen — als Launcher-Ziel eingehängt, bis sie nativ
     integriert sind. Bedienung, Kopfzeile und Rücksprung bleiben identisch (3.3). */
  { id: "OWN-01", name: "Brandschutzkonzept", code: "BSK", icon: "BSK", group: "own", type: "eigen", lead: "Eigenentwicklung · OIB-RL 2/2.1/2.2/2.3", areas: ["TECHNIK", "CONSULTING"], roles: ["fach", "gf", "admin"], release: "Bestand" },
  { id: "OWN-02", name: "Bilder-Index", code: "BILD", icon: "BILD", group: "own", type: "eigen", lead: "Eigenentwicklung · lokal", areas: ["TECHNIK"], roles: ["*"], release: "Bestand" },
  { id: "OWN-03", name: "Niederschrift Feuerbeschau", code: "NIED", icon: "NIED", group: "own", type: "eigen", lead: "Eigenentwicklung · INGTEC-Vorlage", areas: ["TECHNIK"], roles: ["pruefer", "fach", "qs", "admin"], release: "Bestand" },
];

const TYPE_LABEL = {
  native: "Native Anwendung",
  integriert: "Integrierte Anwendung",
  launcher: "Launcher-Ziel",
  modul: "Feature-Modul",
  eigen: "Eigenanwendung",
};

const ROLES = [
  { id: "pruefer", label: "Prüfer" },
  { id: "assistenz", label: "Assistenz" },
  { id: "fach", label: "Fachverantwortung" },
  { id: "qs", label: "Qualitätssicherung" },
  { id: "gf", label: "Geschäftsführung" },
  { id: "admin", label: "Administration" },
];

/* Feature Flags: Owner + Ablaufdatum gehören in die Konfiguration (16.4). */
const FLAGS = { plan_module: true, academy: false };

/* HUB-001: Sichtbarkeit = Rolle ∧ Feature Flag ∧ Kontextfilter.
   Im Produkt entscheidet das Backend; hier gespiegelt für die Overlay-Logik. */
const isPermitted = (app, role) =>
  (app.roles.includes("*") || app.roles.includes(role)) && (!app.flag || FLAGS[app.flag]);

const inArea = (app, area) => area === "ALLE" || app.areas.includes(area);

/* Persistenzadapter — im Produkt: GET/PUT /api/v1/hub/preferences (HUB-002).
   Kein Browser-Storage in dieser Vorschau. */
const persistence = {
  load: () => ({ favorites: ["APP-02", "APP-01", "APP-04", "OWN-01", "APP-17"], recent: ["APP-02", "OWN-03", "APP-04"] }),
  save: () => {},
};

/* ------------------------------------------------------------ 4. BAUSTEINE */

function Badge({ badge }) {
  if (!badge) return null;
  const crit = badge.critical;
  return (
    <span
      className="ig-mono"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, lineHeight: 1,
        padding: "5px 8px", borderRadius: 999,
        border: `1px solid ${crit ? T.critical : T.line}`,
        color: crit ? T.critical : T.ink70, background: crit ? "#FDF3F2" : T.surface,
      }}
    >
      {crit && (
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1l5 9H1z" fill="none" stroke={T.critical} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}
      {badge.n} {badge.label}
    </span>
  );
}

function Tile({ app, onOpen, fav, onFav }) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <button
        className="ig-tile ig-focus"
        onClick={() => onOpen(app)}
        aria-label={`${app.name} öffnen — ${TYPE_LABEL[app.type]}`}
      >
        <span className="ig-tile__plate">
          <Icon code={app.icon} size={56} />
          <span className="ig-mono ig-tile__code">{app.code}</span>
        </span>
        <span className="ig-tile__name">{app.name}</span>
        <Badge badge={app.badge} />
      </button>
      <button
        className="ig-focus ig-fav"
        onClick={() => onFav(app.id)}
        aria-pressed={fav}
        aria-label={fav ? `${app.name} aus Favoriten entfernen` : `${app.name} zu Favoriten hinzufügen`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.5 9.7l5.9-.8z"
            fill={fav ? T.green : "none"} stroke={fav ? T.greenDark : T.ink40} strokeWidth="1.5" strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function Section({ label, hint, children }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h2 className="ig-lbl" style={{ margin: 0 }}>{label}</h2>
        {hint && <span style={{ fontSize: 12, color: T.ink40 }}>{hint}</span>}
        <span style={{ flex: 1, height: 1, background: T.line }} />
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------- 5. GLOBALE SUCHE (Ctrl+K)
   HUB-006: Filterung VOR Ausgabe. Exakte Kennungen und QR-IDs vor unscharfen
   Treffern. Datensätze hier als Beispielindex; im Produkt /api/v1/search. */
const RECORDS = [
  { type: "Prüfung", title: "BMA Jahresprüfung — Halle 3", meta: "PR-2026-0418 · in Prüfung", app: "APP-02" },
  { type: "Feststellung", title: "Rauchmelder Zone 4 defekt", meta: "FE-2026-1177 · kritisch · Frist 12.08.", app: "APP-04" },
  { type: "Kunde", title: "Voith Hydro Standort Linz", meta: "KD-0413 · 6 Anlagen", app: "APP-03" },
  { type: "Bericht", title: "Niederschrift Feuerbeschau 2026", meta: "260803_KD-0413_ARTNR · Entwurf", app: "OWN-03" },
  { type: "Norm", title: "TRVB 123 S — Brandmeldeanlagen", meta: "Ausgabe 2022 · lizenziert", app: "APP-15" },
];

function SearchPalette({ apps, onOpen, onClose }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ids = apps.map((a) => a.id);
    const exact = s
      ? [...apps.filter((a) => a.code.toLowerCase() === s || a.id.toLowerCase() === s)]
      : [];
    const appHits = apps.filter(
      (a) => !exact.includes(a) && (!s || a.name.toLowerCase().includes(s) || a.code.toLowerCase().includes(s))
    );
    const recHits = RECORDS.filter(
      (r) => ids.includes(r.app) && s && (r.title.toLowerCase().includes(s) || r.meta.toLowerCase().includes(s) || r.type.toLowerCase().includes(s))
    );
    return [
      ...exact.map((a) => ({ kind: "app", a, exact: true })),
      ...appHits.slice(0, 6).map((a) => ({ kind: "app", a })),
      ...recHits.slice(0, 6).map((r) => ({ kind: "rec", r })),
    ];
  }, [q, apps]);

  useEffect(() => setI(0), [q]);

  const pick = (it) => {
    if (!it) return;
    onOpen(apps.find((a) => a.id === (it.kind === "app" ? it.a.id : it.r.app)), it.kind === "rec" ? it.r : null);
  };

  return (
    <div className="ig-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ig-sheet" role="dialog" aria-modal="true" aria-label="Globale Suche">
        <div style={{ padding: 14, borderBottom: `1px solid ${T.lineSoft}` }}>
          <input
            ref={ref} className="ig-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Anwendung, Kunde, Anlage, Prüfung, Kennung oder QR-ID"
            aria-label="Suchbegriff"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(v + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
              if (e.key === "Enter") pick(results[i]);
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
        <div style={{ maxHeight: "46vh", overflowY: "auto" }}>
          {results.length === 0 && (
            <p style={{ padding: "22px 16px", margin: 0, fontSize: 13.5, color: T.ink70 }}>
              Kein berechtigter Treffer. Prüfen Sie die Schreibweise oder den Geschäftsbereichsfilter.
            </p>
          )}
          {results.map((it, n) => (
            <button
              key={n} className="ig-row" data-active={n === i} onMouseEnter={() => setI(n)} onClick={() => pick(it)}
            >
              {it.kind === "app" ? (
                <>
                  <Icon code={it.a.icon} size={22} />
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{it.a.name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: T.ink40 }}>
                      Anwendung · {TYPE_LABEL[it.a.type]}
                    </span>
                  </span>
                  {it.exact && <span className="ig-mono" style={{ fontSize: 10, color: T.greenDark }}>EXAKT</span>}
                </>
              ) : (
                <>
                  <span className="ig-mono" style={{ fontSize: 10, color: T.ink40, width: 74, flexShrink: 0 }}>
                    {it.r.type.toUpperCase()}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{it.r.title}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: T.ink40 }}>{it.r.meta}</span>
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
        <div style={{ padding: "9px 16px", borderTop: `1px solid ${T.lineSoft}`, fontSize: 11.5, color: T.ink40, display: "flex", gap: 16 }}>
          <span>↑ ↓ auswählen</span><span>↵ öffnen</span><span>Esc schließen</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------- 6. "+ NEU"-ASSISTENT
   HUB-005: nur fachlich zulässige Kombinationen, Dublettenprüfung vor Anlage. */
const WIZARD = {
  vorgang: ["Auftrag", "Einsatz", "Prüfung", "Begehung", "Gutachten", "Planung", "Maßnahme", "Angebot"],
  area: AREAS,
  field: {
    TECHNIK: ["Brandschutz", "Elektrotechnik", "Maschinen & Anlagen", "Aufzüge"],
    BUSINESS: ["Betreiberpflichten", "Schulung", "Auditbegleitung"],
    CONSULTING: ["Brandschutzkonzept", "Behördenverfahren", "Sachverständigenleistung"],
  },
  profile: {
    Brandschutz: ["BMA wiederkehrend v4.2", "Feuerbeschau v2.1"],
    Elektrotechnik: ["E-Befund ÖVE E8001 v3.0"],
    "Maschinen & Anlagen": ["Maschinenprüfung v1.8"],
    Aufzüge: ["Aufzugsprüfung v2.0"],
    Brandschutzkonzept: ["BSK OIB 2023 v1.0"],
  },
};

function NewWizard({ onClose, onCreate }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState({ vorgang: "", area: "", field: "", customer: "", profile: "" });
  const set = (k, v) => setD((p) => ({ ...p, [k]: v, ...(k === "area" ? { field: "", profile: "" } : {}), ...(k === "field" ? { profile: "" } : {}) }));

  const steps = [
    { key: "vorgang", q: "Was möchten Sie anlegen?", opts: WIZARD.vorgang },
    { key: "area", q: "Geschäftsbereich", opts: WIZARD.area },
    { key: "field", q: "Geschäftsfeld", opts: d.area ? WIZARD.field[d.area] : [] },
    { key: "customer", q: "Kunde und Standort", opts: ["Voith Hydro — Linz", "Stadtwerke Amstetten — Zentrale", "Lenzing AG — Werk 2"] },
    { key: "profile", q: "Freigegebenes Leistungs-/Prüfprofil", opts: d.field ? WIZARD.profile[d.field] || [] : [] },
  ];
  const cur = steps[step];
  const dupe = d.customer === "Voith Hydro — Linz" && d.profile === "BMA wiederkehrend v4.2";

  return (
    <div className="ig-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ig-sheet" role="dialog" aria-modal="true" aria-label="Neuen Vorgang anlegen" style={{ maxWidth: 620 }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.lineSoft}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="ig-display" style={{ margin: 0, fontSize: 19 }}>Neu anlegen</h2>
          <span className="ig-mono" style={{ fontSize: 11, color: T.ink40 }}>SCHRITT {step + 1}/{steps.length + 1}</span>
        </div>

        <div style={{ padding: 18 }}>
          {step < steps.length ? (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>{cur.q}</p>
              {cur.opts.length === 0 ? (
                <p style={{ fontSize: 13.5, color: T.ink70, background: T.assess, padding: 12, borderRadius: 8, margin: 0 }}>
                  Für diese Auswahl ist kein freigegebenes Profil hinterlegt. Wählen Sie einen Schritt zurück oder
                  lassen Sie ein Profil in der Administration freigeben.
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {cur.opts.map((o) => (
                    <button
                      key={o} className="ig-chip ig-focus" aria-pressed={d[cur.key] === o}
                      onClick={() => { set(cur.key, o); setStep(step + 1); }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="ig-lbl" style={{ margin: "0 0 10px" }}>Zusammenfassung</p>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "130px 1fr", gap: "8px 12px", fontSize: 13.5 }}>
                {steps.map((s) => (
                  <React.Fragment key={s.key}>
                    <dt style={{ color: T.ink40 }}>{s.q}</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{d[s.key] || "—"}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {dupe && (
                <p style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "#FDF3F2", border: `1px solid ${T.critical}`, fontSize: 13, color: T.critical }}>
                  ⚠ Dublettenverdacht: Für diesen Kunden besteht bereits ein offener Vorgang mit demselben Profil
                  (PR-2026-0418). Anlage nur nach bewusster Bestätigung.
                </p>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.lineSoft}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <button className="ig-btn ig-btn--outline ig-focus" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? "Abbrechen" : "Zurück"}
          </button>
          {step === steps.length ? (
            <button className="ig-btn ig-btn--primary ig-focus" onClick={() => onCreate(d, dupe)}>
              {dupe ? "Trotzdem anlegen" : "Vorgang anlegen"}
            </button>
          ) : (
            <button className="ig-btn ig-btn--outline ig-focus" disabled={!d[cur.key]} onClick={() => setStep(step + 1)}>
              Weiter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------- 7. APP-SHELL (das Overlay)
   Jede Anwendung — nativ, integriert, Launcher-Ziel oder Eigenanwendung —
   läuft in derselben Hülle: Kopfzeile, Kontext, Rücksprung, Fehlerbild (3.3). */
function AppShell({ app, record, area, onBack, degraded }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 0 18px", borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" }}>
        <button className="ig-btn ig-btn--outline ig-focus" onClick={onBack}>← Hub</button>
        <Icon code={app.icon} size={26} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <h1 className="ig-display" style={{ margin: 0, fontSize: 22 }}>{app.name}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: T.ink40 }}>
            {TYPE_LABEL[app.type]}
            {app.lead ? ` · führendes System: ${app.lead}` : ""} · Kontext: {area}
          </p>
        </div>
        <span className="ig-mono" style={{ fontSize: 11, color: T.ink40 }}>{app.id} · {app.code}</span>
      </div>

      {app.nav && (
        <nav aria-label="Anwendungsnavigation" style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "12px 0", borderBottom: `1px solid ${T.lineSoft}` }}>
          {app.nav.map((n, i) => (
            <button key={n} className="ig-btn ig-focus" style={{ padding: "0 12px", fontSize: 13, borderBottom: i === 0 ? `2px solid ${T.green}` : "2px solid transparent", borderRadius: 0, fontWeight: i === 0 ? 700 : 400 }}>
              {n}
            </button>
          ))}
        </nav>
      )}

      <div style={{ padding: "26px 0" }}>
        {record && (
          <div style={{ background: T.assess, border: `1px solid ${T.line}`, borderRadius: T.radius, padding: 16, marginBottom: 20 }}>
            <p className="ig-lbl" style={{ margin: "0 0 6px" }}>Deep Link — geöffneter Datensatz</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{record.title}</p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: T.ink70 }}>{record.meta}</p>
          </div>
        )}
        {app.type === "launcher" ? (
          <div style={{ border: `1px dashed ${T.line}`, borderRadius: T.radius, padding: 28, textAlign: "center", background: T.surface }}>
            <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700 }}>Launcher-Ziel: {app.lead}</p>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: T.ink70, maxWidth: 460, marginInline: "auto" }}>
              Der Aufruf erfolgt als signierter SSO-Deep-Link. Kontext, Berechtigung und Rücksprung bleiben im Hub.
            </p>
            <button className="ig-btn ig-btn--primary ig-focus" disabled={degraded}>
              {degraded ? "Führendes System nicht erreichbar" : `In ${app.lead} öffnen`}
            </button>
          </div>
        ) : (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radius, padding: 28, background: T.surface }}>
            <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Arbeitsfläche — {app.name}</p>
            <p style={{ margin: 0, fontSize: 13.5, color: T.ink70, lineHeight: 1.55, maxWidth: 620 }}>
              Diese Fläche nimmt das Fachmodul auf. Das Overlay liefert Identität, Rolle, Geschäftsbereich,
              Objektkontext, Benachrichtigungen und Rücksprung; die Anwendung liefert ausschließlich ihre Fachlogik.
            </p>
            {app.type === "eigen" && (
              <p style={{ margin: "16px 0 0", padding: 12, background: T.assess, borderRadius: 8, fontSize: 13, color: T.ink70 }}>
                Bestandsanwendung. Einbindung zunächst über die Hülle, Migration in die Domänenmodule
                (Documents, Reports, Knowledge) über eigenes Arbeitspaket.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 8. HUB */
export default function IngtecHub() {
  const [role, setRole] = useState("fach");
  const [area, setArea] = useState("ALLE");
  const [open, setOpen] = useState(null);
  const [record, setRecord] = useState(null);
  const [search, setSearch] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [toast, setToast] = useState("");
  const [degraded, setDegraded] = useState(false);
  const init = persistence.load();
  const [favorites, setFavorites] = useState(init.favorites);
  const [recent, setRecent] = useState(init.recent);

  const permitted = useMemo(() => APPS.filter((a) => isPermitted(a, role)), [role]);
  const visible = useMemo(() => permitted.filter((a) => inArea(a, area)), [permitted, area]);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
      if (e.key === "Escape") { setSearch(false); setWizard(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const openApp = useCallback((app, rec = null) => {
    if (!app) return;
    setOpen(app); setRecord(rec); setSearch(false);
    setRecent((r) => [app.id, ...r.filter((x) => x !== app.id)].slice(0, 6));
    persistence.save();
  }, []);

  const toggleFav = (id) => {
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
    persistence.save();
  };

  const byId = (id) => visible.find((a) => a.id === id);
  const favApps = favorites.map(byId).filter(Boolean);
  const recentApps = recent.map(byId).filter(Boolean);

  return (
    <div className="ig-root">
      <style>{CSS}</style>

      {/* Kopfzeile — 6.1 */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: T.surface, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button className="ig-btn ig-focus" onClick={() => { setOpen(null); setRecord(null); }} style={{ padding: "0 8px 0 4px", gap: 10 }} aria-label="Zum INGTEC Hub">
            <span style={{ width: 30, height: 30, borderRadius: 7, background: T.ink, display: "grid", placeItems: "center" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: T.green }} />
            </span>
            <span className="ig-display" style={{ fontSize: 17, letterSpacing: ".06em" }}>INGTEC HUB</span>
          </button>

          <button
            className="ig-btn ig-btn--outline ig-focus ig-hide-sm"
            onClick={() => setSearch(true)}
            style={{ flex: 1, justifyContent: "space-between", maxWidth: 460, color: T.ink40, fontSize: 13.5 }}
          >
            Suchen — Objekt, Vorgang, Kennung
            <span className="ig-mono" style={{ fontSize: 11, border: `1px solid ${T.line}`, borderRadius: 5, padding: "3px 6px" }}>⌘K</span>
          </button>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            <button className="ig-btn ig-focus ig-only-sm" onClick={() => setSearch(true)} aria-label="Globale Suche öffnen">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" {...S} /><path d="M16 16l4.5 4.5" {...S} />
              </svg>
            </button>
            <button className="ig-btn ig-btn--primary ig-focus" onClick={() => setWizard(true)}>+ Neu</button>
            <button className="ig-btn ig-focus" onClick={() => openApp(APPS.find((a) => a.id === "APP-18"))} aria-label="INGTEC Assist öffnen">
              <Icon code="AI" size={22} />
            </button>
            <button className="ig-btn ig-focus ig-hide-sm" aria-label="Benachrichtigungen: 3 handlungsrelevant" style={{ position: "relative" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 10a6 6 0 0 1 12 0v5l2 3H4l2-3z" {...S} />
                <path d="M10 21h4" {...S} />
              </svg>
              <span className="ig-mono" style={{ position: "absolute", top: 6, right: 6, background: T.ink, color: "#fff", fontSize: 10, borderRadius: 999, padding: "1px 5px" }}>3</span>
            </button>
            <button
              className="ig-btn ig-focus"
              onClick={() => setDegraded((v) => !v)}
              aria-label={degraded ? "Synchronisation: gestört" : "Synchronisation: aktuell"}
              title="Synchronisationsstatus umschalten (Demo)"
              style={{ gap: 6, fontSize: 12, color: degraded ? T.critical : T.ink70 }}
            >
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: degraded ? T.critical : T.green }} />
              <span className="ig-hide-sm">{degraded ? "Sync gestört" : "Sync aktuell"}</span>
            </button>
            <select
              value={role} onChange={(e) => setRole(e.target.value)} className="ig-focus"
              aria-label="Angemeldete Rolle (Demo)"
              style={{ height: 36, borderRadius: 8, border: `1px solid ${T.line}`, background: T.surface, font: "inherit", fontSize: 12.5, padding: "0 8px" }}
            >
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>

        {degraded && (
          <div style={{ background: "#FDF3F2", borderTop: `1px solid ${T.critical}`, color: T.critical, fontSize: 12.5, padding: "8px 20px", textAlign: "center" }}>
            ⚠ Degradierter Modus: Odoo nicht erreichbar. Prüfung und Bericht laufen weiter, kaufmännische Aktionen werden gequeued.
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "0 20px 110px" }}>
        {open ? (
          <AppShell app={open} record={record} area={area === "ALLE" ? "Alle Bereiche" : area} degraded={degraded} onBack={() => { setOpen(null); setRecord(null); }} />
        ) : (
          <>
            {/* Kontextfilter — 6.1 / HUB-003 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 0 6px", flexWrap: "wrap" }}>
              {["ALLE", ...AREAS].map((a) => (
                <button key={a} className="ig-chip ig-focus" aria-pressed={area === a} onClick={() => setArea(a)}>
                  {a === "ALLE" ? "Alle" : a}
                </button>
              ))}
              <span style={{ fontSize: 12, color: T.ink40, marginLeft: 6 }}>
                Filter der Inhalte — keine getrennten Datenwelten
              </span>
            </div>

            <p style={{ fontSize: 12.5, color: T.ink40, margin: "10px 0 26px" }}>
              {visible.length} von {APPS.length} Anwendungen sichtbar · Rolle {ROLES.find((r) => r.id === role).label}
              {!FLAGS.academy && " · 1 Feature-Modul deaktiviert"}
            </p>

            {recentApps.length > 0 && (
              <Section label="Weiterarbeiten" hint="zuletzt verwendet">
                <div className="ig-grid">
                  {recentApps.map((a) => <Tile key={a.id} app={a} onOpen={openApp} fav={favorites.includes(a.id)} onFav={toggleFav} />)}
                </div>
              </Section>
            )}

            {favApps.length > 0 && (
              <Section label="Favoriten" hint="benutzerbezogen gespeichert">
                <div className="ig-grid">
                  {favApps.map((a) => <Tile key={a.id} app={a} onOpen={openApp} fav onFav={toggleFav} />)}
                </div>
              </Section>
            )}

            {GROUPS.map((g) => {
              const list = visible.filter((a) => a.group === g.id);
              if (!list.length) return null;
              return (
                <Section key={g.id} label={g.label}>
                  <div className="ig-grid">
                    {list.map((a) => <Tile key={a.id} app={a} onOpen={openApp} fav={favorites.includes(a.id)} onFav={toggleFav} />)}
                  </div>
                </Section>
              );
            })}

            {visible.length === 0 && (
              <p style={{ padding: 28, background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radius, fontSize: 14 }}>
                Für diese Rolle und diesen Geschäftsbereich ist keine Anwendung freigegeben. Wechseln Sie den Filter
                oder lassen Sie die Berechtigung in der Administration erweitern.
              </p>
            )}
          </>
        )}
      </main>

      {/* Mobile Hauptnavigation — 6.5 / NAV-001: genau fünf feste Tabs.
          "Erfassen" ist kontextuelle Primäraktion, kein sechster Tab. */}
      <nav
        className="ig-only-sm" aria-label="Hauptnavigation"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: T.surface,
          borderTop: `1px solid ${T.line}`, paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {[
          { id: "heute", label: "Heute", app: "APP-01" },
          { id: "einsaetze", label: "Einsätze", app: "APP-01" },
          { id: "objekte", label: "Objekte", app: "APP-03" },
          { id: "maengel", label: "Mängel", app: "APP-04" },
          { id: "mehr", label: "Mehr", app: null },
        ].map((t) => {
          const active = t.app ? open?.id === t.app : !open;
          return (
            <button
              key={t.id} className="ig-focus" aria-current={active ? "page" : undefined}
              onClick={() => (t.app ? openApp(byId(t.app) || APPS.find((a) => a.id === t.app)) : (setOpen(null), setRecord(null)))}
              style={{
                flex: 1, minHeight: T.tap, border: 0, background: "transparent", cursor: "pointer",
                font: "inherit", fontSize: 11, color: active ? T.ink : T.ink40,
                fontWeight: active ? 700 : 400, borderTop: `2px solid ${active ? T.green : "transparent"}`,
                padding: "8px 2px 10px",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {search && <SearchPalette apps={visible} onOpen={openApp} onClose={() => setSearch(false)} />}
      {wizard && (
        <NewWizard
          onClose={() => setWizard(false)}
          onCreate={(d, dupe) => {
            setWizard(false);
            setToast(`${d.vorgang} angelegt — ${d.customer}, ${d.profile}${dupe ? " (Dublette bewusst bestätigt)" : ""}`);
            openApp(APPS.find((a) => a.id === "APP-02"));
          }}
        />
      )}

      {toast && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", background: T.ink, color: "#fff", padding: "12px 18px", borderRadius: 10, fontSize: 13.5, maxWidth: "92vw", zIndex: 60 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
