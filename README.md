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

## Song-Suche & API-Konfiguration (Spotify & YouTube)

Die App funktioniert **vollständig ohne externe API-Keys**:
- Jeder Mitspieler kann einfach einen **Spotify-Link** (`https://open.spotify.com/track/...`) oder **YouTube-Link** (`https://youtube.com/watch?v=...`) in das Suchfeld einfügen und auf **„Auswählen“** klicken.
- Das System löst den Link über Odesli/Songlink automatisch auf, verknüpft Spotify & YouTube zeitgleich und lädt das offizielle Album-Cover.

### Optionale Live-Suche nach Songtiteln & Interpreten

Wenn Mitspieler Songs direkt per Freitextsuche (ohne vorheriges Kopieren eines Links) weltweit durchsuchen können sollen, kannst du kostenlose API-Schlüssel in `/root/plattenrunde/.env` eintragen:

```bash
# In /root/plattenrunde/.env
SPOTIFY_CLIENT_ID=deine_spotify_client_id
SPOTIFY_CLIENT_SECRET=deine_spotify_client_secret
YOUTUBE_API_KEY=dein_youtube_api_key  # Optional
```

1. **Spotify Web API**:
   - Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) mit deinem normalen Spotify-Konto einloggen.
   - Auf **„Create App“** klicken (App-Name z. B. `Plattenrunde`, Redirect URI: `http://localhost`).
   - Unter **Settings** die `Client ID` und das `Client Secret` kopieren.
2. Nach dem Eintragen in `.env` einmal den Container neu starten:
   ```bash
   docker compose up -d --build
   ```

---

## Runden-Themen & Mottos verwalten

1. **Aktives Motto ändern**:
   - Als Host (Philipp) siehst du im Runden-Kopf direkt den Button **„Motto bearbeiten ✎“**.
   - Titel und Beschreibung können dort jederzeit im laufenden Betrieb angepasst und gespeichert werden.
2. **Kommende Runden aus der Ideenbox starten**:
   - Unter **Menü ☰ → Saison & Bestenliste** finden alle Mitspieler die **Motto-Ideenbox** und können Ideen vorschlagen und hochvoten.
   - Der Host kann jede Idee mit einem Klick auf **„Als neue Runde starten →“** direkt als nächste offizielle Runde anlegen.
3. **Neue Runde manuell anlegen**:
   - Im Menü unter **Host-Werkzeuge → „+ Neue Runde anlegen“**.

---

## Backup & Datenhaltung

- Alle Ligen, Runden, Songs, Stimmen und Profile liegen in einer einzigen Datei: `data/db.json`.
- Zusätzlich kannst du jederzeit direkt in der App über **`Menü` → `Host-Werkzeuge` → `JSON-Backup herunterladen`** eine Sicherungskopie speichern.
