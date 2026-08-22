# Deskbooking

Arbeitsplatz-Buchung für Büros mit begrenzter Platzzahl. Kolleg:innen sehen auf
einem Grundriss, welche Plätze an einem Tag frei sind und wer da ist, und buchen
mit einem Klick.

**Stack:** FastAPI · PostgreSQL · Next.js 14 · Docker Compose
**Integration:** hängt sich in einen vorhandenen Caddy-Reverse-Proxy ein.

---

## 1. Installation

```bash
cd /data
unzip deskbooking.zip
cd deskbooking
cp .env.example .env
nano .env
```

Mindestens anzupassen:

| Variable | Bedeutung |
|---|---|
| `DOMAIN`, `PUBLIC_URL` | Adresse, unter der das Portal erreichbar ist |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32 \| tr -d '=+/'` |
| `JWT_SECRET_KEY` | `openssl rand -base64 48 \| tr -d '=+/'` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Erst-Zugang, wird beim ersten Start angelegt |

> **Sonderzeichen in Passwörtern:** `@ # % / : ?` sind erlaubt — sie werden vor
> dem Einsetzen in die Verbindungs-URL kodiert. `"`, `'` und `$` besser
> vermeiden: Docker Compose und der Python-Parser behandeln sie nicht in jedem
> Grenzfall gleich, was zu schwer auffindbaren Anmeldefehlern führt.

### Caddy einhängen

Das Projekt bringt **keinen eigenen** Caddy mit. Das Frontend tritt dem
Docker-Netzwerk deines vorhandenen Caddy bei (Vorgabe: `webnet`).

1. Heißt dein Netzwerk anders, in `docker-compose.yml` unter `networks: webnet:`
   anpassen (`docker network ls`).
2. Block aus [`caddy-snippet.txt`](./caddy-snippet.txt) ins Caddyfile einfügen.
3. `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`

```bash
docker compose up -d --build
docker compose logs -f backend
```

Erwartete Ausgabe: `Datenbank-Initialisierung abgeschlossen.` →
`Application startup complete.`

---

## 2. Bedienung

### Übersicht (alle Nutzer)

Ein Bedienelement steuert den Zeitraum: Pfeile zum Blättern, Klick auf die
Anzeige öffnet Ansichtswahl (Tag / Woche / Monat / Frei) und Kalender. Ein
„Heute"-Knopf erscheint, sobald man den aktuellen Zeitraum verlassen hat.

Darunter die Tagesleiste: pro Tag ein Balken als Ampel — Akzentfarbe ab 50 %
frei, gelb ab 20 %, orange darunter, rot bei ausgebucht. Klick wechselt den im
Grundriss gezeigten Tag.

Klick auf einen Platz öffnet ein Panel **neben dem Platz** (kein Fenster) mit
Notizfeld und optionaler Mehrtages-Buchung. Belegte Tage werden dabei
übersprungen statt die ganze Aktion abzubrechen.

### Layout-Editor (nur Admins)

- **Inventar links:** Tisch, Tür, Fenster, Pflanze, Schrank, Besprechungstisch,
  Beschriftung — per Drag & Drop auf die Fläche.
- **Wände:** eigener Zeichenmodus, Linie ziehen. Shift rastet auf 15°.
  Fertige Wände sind über die **ganze Länge** anklickbar und verschiebbar;
  bei Auswahl erscheinen Griffe an den Enden für Länge und Winkel.
- **Fenster** werden als Mauer mit hellem Glasband dargestellt — erkennbar als
  Wandöffnung.
- **Bearbeiten:** Klick auf ein Element öffnet ein Panel daneben. `Entf` löscht
  ohne Rückfrage.
- **Speichern:** Der Editor speichert **nicht** automatisch. Änderungen sammeln
  sich und werden über „Speichern" (Strg/Cmd + S) gebündelt übertragen. Der
  Status oben rechts zeigt „Nicht gespeichert" bzw. die Uhrzeit. Neu angelegte
  und gelöschte Elemente wirken sofort, weil sie serverseitig eine ID brauchen.
- **Fläche:** Breite/Höhe frei einstellbar (400–4000 px) oder per Vorgabe. Die
  Zeichenfläche skaliert automatisch auf die Fensterbreite.

### Nutzerverwaltung (nur Admins)

Konten anlegen, Rolle wechseln, Passwort zurücksetzen (meldet alle Sitzungen der
Person ab), deaktivieren/aktivieren, 2FA im Notfall zurücksetzen. Es gibt
bewusst keine Selbstregistrierung.

### Konto

Passwort ändern und **Zwei-Faktor** einrichten: QR-Code scannen, Code
bestätigen. 2FA wird erst nach erfolgreicher Bestätigung scharf — ein
fehlgeschlagener Scan sperrt also niemanden aus.

---

## 3. Darstellung anpassen

Zahnrad oben rechts. Der Dunkelmodus gilt pro Browser, die Farben gelten für
alle (in der Datenbank gespeichert, kein Neustart nötig).

Fünf unabhängige Farben, jeweils mit vollem Farbwähler
(`@uiw/react-color-sketch`: Sättigungsfläche, Farbton-Regler, Hex-Eingabe):

| Farbe | Wirkung |
|---|---|
| **Akzent** | Buttons, Auswahl, freie Plätze, Ampel |
| **Verlauf links / Mitte / rechts** | Verlauf `to right` über drei Stufen |
| **Hintergrund-Schein** | dezenter Lichtschein hinter der Seite |

Verlauf und Schein sind **bewusst nicht** an den Akzent gekoppelt — sie lassen
sich frei kombinieren. „Zurücksetzen" stellt die `.env`-Werte wieder her.

---

## 4. Sicherheit

Kurzfassung, orientiert an ISO 27001 Annex A:

- **Passwörter:** Argon2id, nie im Klartext gespeichert oder geloggt.
- **Sitzungen:** kurzlebiges Access-Token (15 Min.) + rotierendes
  Refresh-Token mit serverseitigem Widerruf. Cookies `httpOnly`, `Secure`,
  `SameSite=Strict`.
- **CSRF:** Double-Submit-Token bei allen ändernden Anfragen.
- **Brute-Force:** 5 Anmeldungen/Minute je IP, Kontosperre nach 5 Fehlversuchen
  für 15 Minuten.
- **Keine Nutzer-Enumeration:** identische Fehlermeldung, egal ob die E-Mail
  existiert. Der 2FA-Status wird erst nach geprüftem Passwort abgefragt.
- **2FA (TOTP):** optional je Konto; Abschalten erfordert das Passwort.
- **Netzwerk:** Datenbank und Backend haben keine nach außen offenen Ports.
- **Container:** Non-Root, `no-new-privileges`, Backend mit read-only Root-FS.
- **Audit-Log:** Anmeldungen (auch fehlgeschlagene, inkl. falscher 2FA-Codes),
  Buchungen und Stornierungen mit Zeit, Nutzer und IP.
- **Header:** HSTS, `X-Frame-Options` etc. kommen zentral aus deinem Caddy
  (`headers_common`); das Backend setzt nur `Cross-Origin-Opener-Policy`, um
  Dopplungen zu vermeiden.

---

## 5. Architektur

```
Browser ──TLS──> dein Caddy ──webnet──> Next.js ──internal──> FastAPI ──> PostgreSQL
                                        (/api/* Rewrite)
```

Next.js leitet `/api/*` intern weiter, dadurch sind Frontend und Backend für den
Browser **eine** Origin — das vereinfacht Cookies und CORS. Caddy sieht nur den
Frontend-Container. Backend → Datenbank läuft über die feste IP `172.28.0.10`
im internen Netz.

**Stammdaten-Cache:** Ein Provider im Root-Layout hält Nutzer, Ebenen und
Kollegenliste über Seitenwechsel hinweg im Speicher. Ohne ihn lädt jede Seite
beim Betreten `/auth/me`, `/floors` und `/admin/users` neu. Nach Änderungen
(z. B. neuer Nutzer) wird gezielt invalidiert.

---

## 6. Datenbank-Schema ändern

Beim Start läuft `_run_migrations()` in `backend/app/main.py` — eine Liste
idempotenter `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-Anweisungen.

**Wichtig:** `Base.metadata.create_all()` legt nur *fehlende Tabellen* an und
fasst bestehende **nie** an. Wer eine Spalte ergänzt, muss die passende Zeile
dort eintragen, sonst scheitert der Start mit `column ... does not exist`.
Für Umbenennungen, Typänderungen oder Datenmigrationen wäre **Alembic** das
richtige Werkzeug.

---

## 7. Grenzen / Ausbaustufen

- Buchung ist tagesbasiert, keine Stunden-Slots.
- Kein Grundriss-Import als Hintergrundbild.
- Keine E-Mail-Benachrichtigungen.
- 2FA ohne Backup-Codes — bei Telefonverlust hilft ein Admin über
  „2FA zurücksetzen". WebAuthn/Passkeys wären die stärkere Alternative.
- Zeitraum-Buchung auf 92 Tage begrenzt.
- Stornierte Buchungen werden gelöscht, nicht als „cancelled" behalten.

---

## 8. Befehle

```bash
docker compose logs -f backend                              # Backend-Logs
docker compose exec db psql -U deskbooking -d deskbooking   # DB-Shell
docker compose up -d --build                                # neu bauen
docker compose down                                         # stoppen (Daten bleiben)
docker compose down -v                                      # stoppen + Daten löschen
```

Update mit Datenerhalt: Ordner ersetzen, `.env` zurückkopieren,
`docker compose up -d --build`. Migrationen laufen beim Start automatisch.
