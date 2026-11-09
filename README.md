# Freitags-Plattenrunde — Dual-Platform Music Voting League

Soziales Musik-Voting-Spiel (vom Typ *Music League*) mit automatischer Dual-Plattform-Unterstützung (**Spotify & YouTube**), Album-Cover-Artwork, Detektiv-Wertung (*„Wer war's?“* + *„Offensichtlicher Song“*) und reduziertem Editorial-Design (*Warm Dark* & *Warm Paper*).

---

## Schnellstart auf deinem Server (2 Optionen)

Du brauchst auf deinem Server **keine externe Datenbank** – alle Daten werden automatisch in `./data/db.json` gespeichert und bleiben bei Neustarts erhalten.

### Option A (Empfohlen & am einfachsten): Mit Docker Compose

Wenn auf deinem Server Docker installiert ist, genügen 3 Befehle:

```bash
git clone https://github.com/philippfuchs-sketch/freitags-plattenrunde.git
cd freitags-plattenrunde
docker compose up -d --build
```

Die App läuft sofort im Hintergrund auf **Port `3000`** (`http://DEINE-SERVER-IP:3000`) und startet nach einem Server-Reboot automatisch wieder (`restart: unless-stopped`).

**Updates später einspielen:**
```bash
cd freitags-plattenrunde
git pull
docker compose up -d --build
```

---

### Option B: Direkt mit Node.js (ohne Docker)

Falls du kein Docker nutzt und Node.js (ab Version 18+) installiert ist:

```bash
git clone https://github.com/philippfuchs-sketch/freitags-plattenrunde.git
cd freitags-plattenrunde
npm start
```

Damit die App dauerhaft im Hintergrund weiterläuft, wenn du das SSH-Fenster schließt, kannst du **PM2** nutzen:

```bash
npm install -g pm2
pm2 start server.js --name plattenrunde
pm2 save
pm2 startup
```

---

## Eigene Domain & HTTPS (Optional)

Falls du eine eigene Domain (z. B. `musik.deinedomain.de`) auf deinen Server zeigen lässt, ist **Caddy** der einfachste Reverse-Proxy (holt SSL-Zertifikate vollautomatisch):

`/etc/caddy/Caddyfile`:
```caddyfile
musik.deinedomain.de {
    reverse_proxy localhost:3000
}
```

Alternativ für **Nginx**:
```nginx
server {
    server_name musik.deinedomain.de;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## Backup & Datenhaltung

- Alle Ligen, Runden, Songs, Stimmen und Profile liegen in einer einzigen Datei: `data/db.json`.
- Zusätzlich kannst du jederzeit direkt in der App über **`Menü` → `Host-Werkzeuge` → `JSON-Backup herunterladen`** eine Sicherungskopie speichern.
