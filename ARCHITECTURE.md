# Iustus Mercatura - Professionelle Systemarchitektur

## Vision
Eine sichere, skalierbare und zukunftsfähige Infrastruktur mit Replikation,
Edge-Caching und klarer Trennung von öffentlichen und privaten Daten.

---

## Architektur-Übersicht

```
                                    ┌─────────────────────────────────────┐
                                    │         CLOUDFLARE                  │
                                    │     (CDN + Security + R2)           │
                                    │                                     │
                                    │  ┌─────────────┐  ┌──────────────┐ │
                                    │  │   CDN       │  │  R2 Storage  │ │
                                    │  │  (Caching)  │  │  (Bilder)    │ │
                                    │  └─────────────┘  └──────────────┘ │
                                    │                                     │
                                    │  ┌─────────────────────────────┐   │
                                    │  │   Workers (Edge Functions)   │   │
                                    │  │   - Image Optimization       │   │
                                    │  │   - Request Validation       │   │
                                    │  └─────────────────────────────┘   │
                                    └─────────────────────────────────────┘
                                                      │
                          ┌───────────────────────────┼───────────────────────────┐
                          │                           │                           │
                          ▼                           ▼                           ▼
┌─────────────────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│         TURSO DATABASE              │ │    RENDER SERVER        │ │   PRIVATE SYNC          │
│     (Globale SQLite Edge)           │ │    (API Gateway)        │ │   (P2P / WebRTC)        │
│                                     │ │                         │ │                         │
│  ┌───────────────────────────────┐  │ │  - API Endpoints        │ │  Dev ◄──────► Admin    │
│  │  PRIMARY (Frankfurt)          │  │ │  - Auth Middleware      │ │       Direkte Sync     │
│  │  - Team, Produkte, Standorte  │  │ │  - Rate Limiting        │ │       für sensible     │
│  │  - Projekte, Blocks, Pages    │  │ │  - WebSocket Hub        │ │       Daten            │
│  │  - Settings, Media-Metadata   │  │ │                         │ │                         │
│  └───────────────────────────────┘  │ └─────────────────────────┘ └─────────────────────────┘
│              │                      │
│              ▼ Replikation          │
│  ┌───────────────────────────────┐  │
│  │  REPLICAS (Edge Locations)    │  │
│  │  - US East, US West           │  │
│  │  - Asia Pacific               │  │
│  │  - Read-Only für Speed        │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Datenfluss & Berechtigungen

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATENFLUSS                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ÖFFENTLICHE DATEN (Turso + Cloudflare CDN)                                   │
│   ═══════════════════════════════════════════                                   │
│                                                                                 │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐              │
│   │   DEV   │ ───► │  TURSO  │ ───► │  ADMIN  │ ───► │  INDEX  │              │
│   │  R/W/D  │ ◄─── │   DB    │ ◄─── │   R/W   │      │   R     │              │
│   └─────────┘      └─────────┘      └─────────┘      └─────────┘              │
│       │                                                    │                   │
│       │ Rollback (48h)                                     │ Anfragen          │
│       ▼                                                    ▼                   │
│   ┌─────────────────────────────────────────────────────────────────┐         │
│   │                    CHANGE HISTORY                               │         │
│   │              (Alle Änderungen mit Timestamp)                    │         │
│   └─────────────────────────────────────────────────────────────────┘         │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   PRIVATE DATEN (Lokale Sync - NICHT über Render)                              │
│   ════════════════════════════════════════════════                              │
│                                                                                 │
│   ┌─────────┐                              ┌─────────┐                         │
│   │   DEV   │ ◄────── P2P WebRTC ────────► │  ADMIN  │                         │
│   │         │      (Verschlüsselt)         │         │                         │
│   └─────────┘                              └─────────┘                         │
│       │                                         │                              │
│       └─────────────────┬───────────────────────┘                              │
│                         ▼                                                       │
│               ┌─────────────────┐                                              │
│               │  private.json   │                                              │
│               │  - Anfragen     │                                              │
│               │  - Termine      │                                              │
│               │  - Notizen      │                                              │
│               │  - Entwürfe     │                                              │
│               └─────────────────┘                                              │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   BILDER & MEDIEN (Cloudflare R2 + CDN)                                        │
│   ══════════════════════════════════════                                        │
│                                                                                 │
│   ┌─────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────┐      │
│   │ UPLOAD  │ ───► │ CF Worker   │ ───► │  R2 Bucket  │ ───► │   CDN   │      │
│   │         │      │ (Validate)  │      │  (Storage)  │      │ (Cache) │      │
│   └─────────┘      │ (Optimize)  │      └─────────────┘      └─────────┘      │
│                    └─────────────┘                                ▲            │
│                                                                   │            │
│                    ┌──────────────────────────────────────────────┘            │
│                    │                                                           │
│   ┌─────────┐      │                                                           │
│   │  INDEX  │ ─────┘  Bilder werden direkt von CDN geladen                    │
│   │  ADMIN  │         (Nicht über Render Server!)                              │
│   │   DEV   │                                                                  │
│   └─────────┘                                                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Berechtigungsmatrix

| Aktion                    | DEV | ADMIN | INDEX |
|---------------------------|-----|-------|-------|
| Content lesen             | ✅  | ✅    | ✅    |
| Content bearbeiten        | ✅  | ✅    | ❌    |
| Content löschen           | ✅  | ❌    | ❌    |
| Änderungen rückgängig     | ✅  | ❌    | ❌    |
| Bilder hochladen          | ✅  | ✅    | ❌    |
| Bilder löschen            | ✅  | ❌    | ❌    |
| Anfragen senden           | ❌  | ❌    | ✅    |
| Anfragen lesen            | ✅  | ✅    | ❌    |
| Anfragen beantworten      | ✅  | ✅    | ❌    |
| Private Notizen           | ✅  | ✅    | ❌    |
| System-Einstellungen      | ✅  | ❌    | ❌    |
| Benutzer verwalten        | ✅  | ❌    | ❌    |

---

## Technologie-Stack

### Datenbank
```
TURSO (LibSQL - SQLite Edge)
├── Primary: Frankfurt (eu-west-1)
├── Replicas: Auto-scaling basierend auf Traffic
├── Embedded Replicas: Lokales Caching auf Server
└── Features:
    ├── Multi-Region Replikation
    ├── Automatische Failover
    ├── Point-in-Time Recovery
    └── Branching für Dev/Staging
```

### Bilder & Medien
```
CLOUDFLARE R2
├── S3-kompatible API
├── Kein Egress-Kosten (kostenloser Ausgang!)
├── Automatisches CDN-Caching
├── Workers für:
│   ├── Image Resizing (on-the-fly)
│   ├── WebP/AVIF Konvertierung
│   ├── Thumbnail-Generierung
│   └── Upload-Validierung
└── Kostenlos: 10GB Storage, 10M Requests/Monat
```

### CDN & Security
```
CLOUDFLARE (Free Tier)
├── DDoS Protection
├── WAF (Web Application Firewall)
├── SSL/TLS (automatisch)
├── Caching (statische Assets)
├── Analytics
└── Rate Limiting
```

### Hosting
```
RENDER
├── Web Service (Bun Runtime)
├── Persistent Disk (Backup)
├── Auto-Deploy von GitHub
├── SSL automatisch
└── Rolle: API Gateway + WebSocket Hub
```

### Private Sync
```
WebRTC / PeerJS
├── Direkte P2P-Verbindung
├── Ende-zu-Ende Verschlüsselung
├── Kein Server als Mittelsmann
├── Signaling über Render (nur Verbindungsaufbau)
└── Daten: Anfragen, Termine, Notizen
```

---

## Replikationsstrategie

```
                    WRITE                           READ
                      │                               │
                      ▼                               ▼
            ┌─────────────────┐           ┌─────────────────────────┐
            │  PRIMARY NODE   │           │     EDGE REPLICAS       │
            │  (Frankfurt)    │──────────►│  (Weltweit verteilt)    │
            │                 │  async    │                         │
            │  All Writes     │  replica  │  - US East              │
            │  go here        │  tion     │  - US West              │
            └─────────────────┘           │  - Singapore            │
                      │                   │  - Sydney               │
                      │                   └─────────────────────────┘
                      ▼
            ┌─────────────────┐
            │  EMBEDDED       │
            │  REPLICA        │
            │  (Render)       │
            │                 │
            │  Lokaler Cache  │
            │  für schnelle   │
            │  Reads          │
            └─────────────────┘
```

---

## Sicherheitskonzept

### 1. API-Authentifizierung
```
┌─────────────────────────────────────────────────────────┐
│                    AUTH FLOW                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  DEV/ADMIN                                              │
│  ─────────                                              │
│  1. Login mit API-Key + Secret                          │
│  2. JWT Token (1h Gültigkeit)                           │
│  3. Refresh Token (7d Gültigkeit)                       │
│  4. IP-Whitelist optional                               │
│                                                         │
│  INDEX (Public)                                         │
│  ─────────────                                          │
│  1. Rate Limiting (100 req/min)                         │
│  2. CSRF Token für Formulare                            │
│  3. Honeypot für Spam                                   │
│  4. reCAPTCHA bei Anfragen                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2. Datenverschlüsselung
```
┌─────────────────────────────────────────────────────────┐
│                  ENCRYPTION                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  In Transit:                                            │
│  ───────────                                            │
│  - TLS 1.3 für alle Verbindungen                        │
│  - Cloudflare SSL (Full Strict)                         │
│  - WebRTC DTLS für P2P                                  │
│                                                         │
│  At Rest:                                               │
│  ────────                                               │
│  - Turso: Encrypted by default                          │
│  - R2: Server-side encryption (SSE)                     │
│  - Private Data: AES-256 (client-side)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3. Change History & Audit Log
```
┌─────────────────────────────────────────────────────────┐
│                  AUDIT TRAIL                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Jede Änderung wird protokolliert:                      │
│                                                         │
│  {                                                      │
│    "id": "chg_abc123",                                  │
│    "timestamp": "2026-01-06T00:30:00Z",                 │
│    "user": "admin",                                     │
│    "user_type": "admin_panel",                          │
│    "action": "update",                                  │
│    "table": "items",                                    │
│    "record_id": "team_1",                               │
│    "before": { ... },                                   │
│    "after": { ... },                                    │
│    "ip": "xxx.xxx.xxx.xxx",                             │
│    "reversible_until": "2026-01-08T00:30:00Z"           │
│  }                                                      │
│                                                         │
│  DEV kann alle Änderungen der letzten 48h               │
│  mit einem Klick rückgängig machen.                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Implementierungsplan

### Phase 1: Cloudflare Setup (Heute)
- [ ] Cloudflare Account erstellen
- [ ] Domain hinzufügen (oder Subdomain)
- [ ] R2 Bucket erstellen
- [ ] Worker für Image Upload

### Phase 2: Bild-Migration (Tag 2)
- [ ] Bestehende Bilder zu R2 migrieren
- [ ] Server.ts für R2 Upload anpassen
- [ ] Admin/Dev für direkten R2 Upload

### Phase 3: Change History (Tag 3)
- [ ] History-Tabelle in Turso
- [ ] Before/After Logging
- [ ] Rollback-API für Dev

### Phase 4: Private Sync (Tag 4)
- [ ] WebRTC/PeerJS Integration
- [ ] Anfragen-System
- [ ] Inbox für Dev/Admin

### Phase 5: Security Hardening (Tag 5)
- [ ] API-Key System
- [ ] Rate Limiting
- [ ] CSRF Protection
- [ ] Audit Logging

---

## Kosten (Monatlich)

| Service          | Free Tier              | Geschätzt     |
|------------------|------------------------|---------------|
| Turso            | 9GB, 500M rows read    | €0            |
| Cloudflare       | Unlimited Bandwidth    | €0            |
| Cloudflare R2    | 10GB, 10M requests     | €0            |
| Render           | 750h/Monat             | €0            |
| **TOTAL**        |                        | **€0/Monat**  |

Bei Wachstum:
- Turso Pro: $29/Monat (50GB, unlimited reads)
- R2: $0.015/GB nach 10GB
- Render: $7/Monat (Pro)

---

## Zusammenfassung

Diese Architektur bietet:

1. **Globale Replikation** - Turso Edge für schnelle Reads weltweit
2. **Sichere Bildverwaltung** - Cloudflare R2 mit CDN (nicht über Render)
3. **Private Kommunikation** - P2P Sync für sensible Daten
4. **Audit Trail** - 48h Rollback für alle Änderungen
5. **Zukunftssicher** - Skaliert von 0 bis Millionen Requests
6. **Kostenlos** - Alle Services haben großzügige Free Tiers
