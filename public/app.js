// ============================================================================
// DECLUTTERED & STRUCTURED FRONTEND: FREITAGS-PLATTENRUNDE
// ============================================================================

const state = {
  db: null,
  catalog: [],
  currentLeagueId: 'league_01',
  currentRoundId: 'round_01',
  currentUserId: 'user_1',   // Host (Philipp)
  mainView: 'ROUND',        // 'ROUND' | 'SEASON' | 'BOOKMARKS' | 'NOTIFICATIONS' | 'PROFILE'
  platformMode: 'spotify',  // 'spotify' | 'youtube'
  perTrackPlatform: {},     // { [trackId]: 'spotify' | 'youtube' }
  expandedTrackId: null,    // Accordion: only 1 song expanded at a time
  theme: 'dark',            // 'dark' | 'light'
  menuOpen: false,          // Slide-over right menu drawer

  // Phase 01 (Submission) local state
  subSearchQuery: '',
  subSearchResults: [],
  subSelectedTrack: null,
  subPitch: '',
  subPitchVisibility: 'VOTING',
  calloutExpanded: false,
  calloutSearchQuery: '',
  calloutSearchResults: [],
  calloutSelectedTrack: null,

  // Phase 02 (Voting) local working ballot
  workingVotes: {},

  // Phase 03 (Reveal) local state
  revealSubTab: 'SONGS',    // 'SONGS' | 'DETECTIVE'
  revealMode: 'ALL',        // 'ALL' | 'COUNTDOWN'
  countdownStep: 1,
  expandedRevealTrackId: 'track_r4_1',
  replyDrafts: {},

  // Season & Admin
  newIdeaTitle: '',
  newIdeaDesc: '',
  hostToolsExpanded: false,
  toastMessage: null
};

let toastTimer = null;
function showToast(msg) {
  state.toastMessage = msg;
  render();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toastMessage = null;
    render();
  }, 3200);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCurrentLeague() {
  if (!state.db) return null;
  return state.db.leagues.find(l => l.id === state.currentLeagueId) || state.db.leagues[0];
}

function getCurrentRound() {
  const league = getCurrentLeague();
  if (!league) return null;
  return league.rounds.find(r => r.id === state.currentRoundId) ||
         league.rounds.find(r => r.id === league.active_round_id) ||
         league.rounds[0];
}

function getCurrentUser() {
  if (!state.db) return null;
  return state.db.users.find(u => u.id === state.currentUserId) || state.db.users[0];
}

function getUserById(userId) {
  if (!state.db) return { id: userId, name: 'Unbekannt' };
  return state.db.users.find(u => u.id === userId) || { id: userId, name: 'Ehemaliges Mitglied' };
}

function isUserHostOrCoHost(league, userId) {
  if (!league) return false;
  if (league.host_user_id === userId || league.co_host_user_id === userId) return true;
  const mem = league.members.find(m => m.user_id === userId);
  return mem && (mem.role === 'HOST' || mem.role === 'CO_HOST');
}

function syncLocalFormsFromDb() {
  const round = getCurrentRound();
  const user = getCurrentUser();
  if (!round || !user) return;

  const ownSub = round.tracks.find(t => t.submitted_by === user.id);
  if (ownSub) {
    state.subSelectedTrack = {
      title: ownSub.title,
      artist: ownSub.artist,
      album: ownSub.album,
      cover_url: ownSub.cover_url,
      platforms: JSON.parse(JSON.stringify(ownSub.platforms))
    };
    state.subPitch = ownSub.pitch || '';
    state.subPitchVisibility = ownSub.pitch_visibility || 'VOTING';
  } else {
    state.subSelectedTrack = null;
    state.subPitch = '';
    state.subPitchVisibility = 'VOTING';
  }

  const ownCallout = (round.callouts || []).find(c => c.user_id === user.id);
  if (ownCallout) {
    state.calloutSelectedTrack = { ...ownCallout.predicted_track };
    state.calloutExpanded = true;
  } else {
    state.calloutSelectedTrack = null;
    state.calloutExpanded = false;
  }

  const ballot = (round.ballots || []).find(b => b.voter_id === user.id);
  state.workingVotes = {};
  for (const t of round.tracks) {
    const existingVote = ballot?.votes?.find(v => v.track_id === t.id);
    state.workingVotes[t.id] = {
      points: existingVote ? Number(existingVote.points) || 0 : 0,
      comment: existingVote?.comment || '',
      guessed_user_id: existingVote?.guessed_user_id || ''
    };
  }
}

async function fetchInitialState() {
  const res = await fetch('/api/state');
  const data = await res.json();
  state.db = data.db;
  state.catalog = data.catalog || [];
  const league = getCurrentLeague();
  if (league) {
    state.currentRoundId = league.active_round_id || league.rounds[0]?.id || 'round_01';
  }
  const user = getCurrentUser();
  if (user) {
    state.currentUserId = user.id;
    state.platformMode = user.preferred_platform || 'spotify';
    state.theme = user.preferred_theme || 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
  }
  syncLocalFormsFromDb();
  render();
}

async function dispatchAction(type, payload, successToast) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Aktion konnte nicht ausgeführt werden.');
      return null;
    }
    state.db = data.db;
    if (successToast) showToast(successToast);
    return data;
  } catch (err) {
    showToast('Netzwerkfehler: ' + err.message);
    return null;
  }
}

// ============================================================================
// SCORING & RANKING ENGINE
// ============================================================================
function computeRoundResults(league, round) {
  const submittedVoterIds = new Set(
    (round.ballots || []).filter(b => b.status === 'SUBMITTED').map(b => b.voter_id)
  );

  const trackRows = round.tracks.map(track => {
    const votesForTrack = [];
    let rawPoints = 0;
    let votersCount = 0;
    let threePointCount = 0;
    let twoPointCount = 0;
    const detectiveGuessesOnTrack = [];

    for (const ballot of (round.ballots || [])) {
      if (ballot.status !== 'SUBMITTED') continue;
      const v = (ballot.votes || []).find(item => item.track_id === track.id);
      if (!v) continue;
      const pts = Number(v.points) || 0;
      if (pts > 0) {
        rawPoints += pts;
        votersCount += 1;
        if (pts === 3) threePointCount += 1;
        if (pts === 2) twoPointCount += 1;
      }
      if (pts > 0 || (v.comment && v.comment.trim())) {
        votesForTrack.push({
          voter_id: ballot.voter_id,
          voter_name: getUserById(ballot.voter_id).name,
          points: pts,
          comment: v.comment || ''
        });
      }
      if (v.guessed_user_id) {
        const isCorrect = v.guessed_user_id === track.submitted_by;
        detectiveGuessesOnTrack.push({
          voter_id: ballot.voter_id,
          voter_name: getUserById(ballot.voter_id).name,
          guessed_user_id: v.guessed_user_id,
          guessed_user_name: getUserById(v.guessed_user_id).name,
          isCorrect
        });
      }
    }

    const submitterDidVote = submittedVoterIds.has(track.submitted_by);
    const fairnessPenalty = round.phase === 'REVEAL' && !submitterDidVote;
    const effectivePoints = fairnessPenalty ? 0 : rawPoints;

    return {
      track,
      submitter: getUserById(track.submitted_by),
      rawPoints,
      effectivePoints,
      fairnessPenalty,
      votersCount,
      threePointCount,
      twoPointCount,
      votesForTrack: votesForTrack.sort((a, b) => b.points - a.points),
      detectiveGuessesOnTrack
    };
  });

  trackRows.sort((a, b) => {
    if (b.effectivePoints !== a.effectivePoints) return b.effectivePoints - a.effectivePoints;
    if (b.votersCount !== a.votersCount) return b.votersCount - a.votersCount;
    if (b.threePointCount !== a.threePointCount) return b.threePointCount - a.threePointCount;
    return b.twoPointCount - a.twoPointCount;
  });

  trackRows.forEach((row, idx) => {
    if (idx > 0) {
      const prev = trackRows[idx - 1];
      const isTied = prev.effectivePoints === row.effectivePoints &&
                     prev.votersCount === row.votersCount &&
                     prev.threePointCount === row.threePointCount;
      row.rank = isTied ? prev.rank : idx + 1;
    } else {
      row.rank = 1;
    }
  });

  const detectiveByUser = {};
  for (const m of league.members) {
    detectiveByUser[m.user_id] = {
      user: getUserById(m.user_id),
      status: m.status,
      calloutPrediction: null,
      calloutHit: false,
      calloutPoints: 0,
      correctGuesses: 0,
      wrongGuesses: 0,
      guessPoints: 0,
      totalDetectivePoints: 0
    };
  }

  for (const c of (round.callouts || [])) {
    const entry = detectiveByUser[c.user_id];
    if (!entry) continue;
    entry.calloutPrediction = c.predicted_track;
    const matchedTrack = round.tracks.find(t =>
      t.submitted_by !== c.user_id && t.normalized_key === c.predicted_track.normalized_key
    );
    if (matchedTrack) {
      entry.calloutHit = true;
      entry.calloutMatchedSubmitter = getUserById(matchedTrack.submitted_by).name;
      entry.calloutPoints = 1;
    }
  }

  for (const ballot of (round.ballots || [])) {
    if (ballot.status !== 'SUBMITTED') continue;
    const entry = detectiveByUser[ballot.voter_id];
    if (!entry) continue;
    for (const v of (ballot.votes || [])) {
      if (!v.guessed_user_id) continue;
      const track = round.tracks.find(t => t.id === v.track_id);
      if (!track) continue;
      if (v.guessed_user_id === track.submitted_by) {
        entry.correctGuesses += 1;
        entry.guessPoints += 1;
      } else {
        entry.wrongGuesses += 1;
        entry.guessPoints -= 1;
      }
    }
  }

  const detectiveRows = Object.values(detectiveByUser).map(d => {
    d.totalDetectivePoints = d.calloutPoints + d.guessPoints;
    return d;
  }).sort((a, b) => b.totalDetectivePoints - a.totalDetectivePoints || b.correctGuesses - a.correctGuesses);

  return { trackRows, detectiveRows };
}

function computeSeasonStats(league) {
  const statsByUser = {};
  const pointsGivenMatrix = {};

  for (const m of league.members) {
    statsByUser[m.user_id] = {
      user: getUserById(m.user_id),
      roundWins: 0,
      songPointsTotal: 0,
      detectivePointsTotal: 0,
      calloutHitsTotal: 0,
      guessesCorrectTotal: 0,
      guessesMadeTotal: 0,
      ownTrackGuessedCorrectly: 0,
      ownTrackGuessedTotal: 0
    };
    pointsGivenMatrix[m.user_id] = {};
  }

  const allSeasonTracks = [];
  const winnerTracks = [];

  for (const r of league.rounds) {
    if (r.tracks.length === 0) continue;
    const { trackRows, detectiveRows } = computeRoundResults(league, r);

    trackRows.forEach(tr => {
      allSeasonTracks.push(tr.track);
      if (tr.rank === 1 && tr.effectivePoints > 0) winnerTracks.push(tr.track);
      const st = statsByUser[tr.track.submitted_by];
      if (st) {
        st.songPointsTotal += tr.effectivePoints;
        if (tr.rank === 1 && tr.effectivePoints > 0) st.roundWins += 1;
        st.ownTrackGuessedTotal += tr.detectiveGuessesOnTrack.length;
        st.ownTrackGuessedCorrectly += tr.detectiveGuessesOnTrack.filter(g => g.isCorrect).length;
      }
      for (const v of tr.votesForTrack) {
        if (v.points > 0 && pointsGivenMatrix[v.voter_id]) {
          pointsGivenMatrix[v.voter_id][tr.track.submitted_by] =
            (pointsGivenMatrix[v.voter_id][tr.track.submitted_by] || 0) + v.points;
        }
      }
    });

    detectiveRows.forEach(dr => {
      const st = statsByUser[dr.user.id];
      if (st) {
        st.detectivePointsTotal += dr.totalDetectivePoints;
        if (dr.calloutHit) st.calloutHitsTotal += 1;
        st.guessesCorrectTotal += dr.correctGuesses;
        st.guessesMadeTotal += (dr.correctGuesses + dr.wrongGuesses);
      }
    });
  }

  const currentUid = state.currentUserId;
  let biggestFan = null;
  let maxReceived = 0;
  for (const [giverId, recMap] of Object.entries(pointsGivenMatrix)) {
    if (giverId === currentUid) continue;
    const pts = recMap[currentUid] || 0;
    if (pts > maxReceived) {
      maxReceived = pts;
      biggestFan = { name: getUserById(giverId).name, points: pts };
    }
  }

  let favoriteSupplier = null;
  let maxGiven = 0;
  const givenMap = pointsGivenMatrix[currentUid] || {};
  for (const [recId, pts] of Object.entries(givenMap)) {
    if (recId === currentUid) continue;
    if (pts > maxGiven) {
      maxGiven = pts;
      favoriteSupplier = { name: getUserById(recId).name, points: pts };
    }
  }

  return {
    songLeaderboard: Object.values(statsByUser).sort((a, b) => b.songPointsTotal - a.songPointsTotal),
    detectiveLeaderboard: Object.values(statsByUser).sort((a, b) => b.detectivePointsTotal - a.detectivePointsTotal),
    statsByUser,
    biggestFan,
    favoriteSupplier,
    allSeasonTracks,
    winnerTracks
  };
}

function buildYoutubeQueueUrl(tracks) {
  const ids = tracks.map(t => t.platforms?.youtube?.video_id).filter(Boolean);
  if (ids.length === 0) return 'https://www.youtube.com';
  return `https://www.youtube.com/watch_videos?video_ids=${ids.slice(0, 50).join(',')}`;
}

// ============================================================================
// MAIN RENDER FUNCTION (CLEAN 1-LINE NAVBAR + AUTOMATIC PHASE SCREEN)
// ============================================================================
function render() {
  const root = document.getElementById('app');
  if (!state.db) {
    root.innerHTML = `<div style="padding: 40px 20px; color: var(--text-muted);">Lade...</div>`;
    return;
  }

  const league = getCurrentLeague();
  const round = getCurrentRound();
  const user = getCurrentUser();

  root.innerHTML = `
    <!-- 1. SINGLE ULTRA-CLEAN TOP NAVBAR -->
    <header class="navbar">
      <div class="nav-left">
        <button
          class="nav-link ${state.mainView === 'ROUND' ? 'active' : ''}"
          onclick="window.appHandlers.setMainView('ROUND')"
        >
          Runde 0${round.number}
        </button>
        <button
          class="nav-link ${state.mainView === 'SEASON' ? 'active' : ''}"
          onclick="window.appHandlers.setMainView('SEASON')"
        >
          Saison
        </button>
      </div>

      <div class="nav-right">
        <!-- Slide-Over Menu Button -->
        <button class="menu-btn" onclick="window.appHandlers.toggleMenu()">
          <span>${escapeHtml(user.name)}</span>
          <span style="color: var(--text-muted);">· Menü</span>
        </button>
      </div>
    </header>

    <!-- 2. MAIN CONTENT VIEW -->
    <main>
      ${state.mainView === 'ROUND' ? renderActiveRoundScreen(league, round, user) : ''}
      ${state.mainView === 'SEASON' ? renderSeasonScreen(league, round, user) : ''}
      ${state.mainView === 'BOOKMARKS' ? renderBookmarksScreen(league, round, user) : ''}
      ${state.mainView === 'NOTIFICATIONS' ? renderNotificationsScreen(league, user) : ''}
      ${state.mainView === 'PROFILE' ? renderProfileScreen(league, user) : ''}
    </main>

    <!-- 3. SLIDE-OVER MENU DRAWER (Holds all secondary controls cleanly) -->
    ${state.menuOpen ? renderMenuDrawer(league, round, user) : ''}

    <!-- 4. TOAST -->
    ${state.toastMessage ? `<div class="toast-banner">${escapeHtml(state.toastMessage)}</div>` : ''}
  `;
}

// ============================================================================
// AUTOMATIC ROUND SCREEN (Renders Submission, Voting, or Reveal based on Phase)
// ============================================================================
function renderActiveRoundScreen(league, round, user) {
  const isHost = isUserHostOrCoHost(league, user.id);
  const activeMembers = league.members.filter(m => m.status === 'ACTIVE');
  const submittedBallotsCount = (round.ballots || []).filter(b => b.status === 'SUBMITTED').length;
  const submittedTracksCount = round.tracks.length;

  const phaseLabel =
    round.phase === 'SUBMISSION' ? `Einreichung läuft · ${submittedTracksCount} von ${activeMembers.length} Songs da` :
    round.phase === 'VOTING' ? `Voting läuft · ${submittedBallotsCount} von ${activeMembers.length} Stimmen abgegeben` :
    round.phase === 'REVEAL' ? `Runde abgeschlossen · Ergebnisse & Auflösung` :
    `Geplante Runde`;

  const playlistHref = state.platformMode === 'youtube'
    ? buildYoutubeQueueUrl(round.tracks)
    : (round.tracks[0]?.platforms?.spotify?.url || 'https://open.spotify.com');

  return `
    <!-- Calm Round Header -->
    <section class="round-hero">
      <div class="round-meta-line">
        <span>${escapeHtml(league.name)} · ${phaseLabel}</span>
      </div>

      <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <h1 class="round-title">${escapeHtml(round.title)}</h1>
        ${isHost ? `<button class="btn-text" onclick="window.appHandlers.toggleRoundEditor()">${state.roundEditorOpen ? 'Schließen ✕' : 'Motto bearbeiten ✎'}</button>` : ''}
      </div>

      ${state.roundEditorOpen ? `
        <div class="card-box" style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div class="drawer-label">Runden-Motto anpassen</div>
          <input id="edit-round-title" type="text" class="input-field" value="${escapeHtml(round.title)}" placeholder="Runden-Titel..." />
          <textarea id="edit-round-desc" class="textarea-field" placeholder="Beschreibung / Thema der Runde...">${escapeHtml(round.description || '')}</textarea>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button class="btn" onclick="window.appHandlers.toggleRoundEditor()">Abbrechen</button>
            <button class="btn btn-accent" onclick="window.appHandlers.saveRoundDetails('${round.id}')">Speichern</button>
          </div>
        </div>
      ` : `
        <div class="round-desc-row">
          <p class="round-desc">${escapeHtml(round.description)}</p>
          ${round.tracks.length > 0 && round.phase !== 'SUBMISSION' ? `
            <a href="${playlistHref}" target="_blank" rel="noopener noreferrer" class="btn-text" style="color: var(--accent); font-weight: 500;">
              Ganze Runde in ${state.platformMode === 'youtube' ? 'YouTube' : 'Spotify'} hören ↗
            </a>
          ` : ''}
        </div>
      `}
    </section>

    <!-- Phase Content -->
    ${round.phase === 'SUBMISSION' ? renderCleanSubmission(league, round, user) : ''}
    ${round.phase === 'VOTING' ? renderCleanVotingAccordion(league, round, user) : ''}
    ${round.phase === 'REVEAL' ? renderCleanReveal(league, round, user) : ''}
    ${round.phase === 'UPCOMING' ? `
      <div style="padding: 40px 20px; color: var(--text-secondary);">
        Diese Runde ist als nächstes geplant. Sobald sie vom Host freigegeben wird, können Songs eingereicht werden.
      </div>
    ` : ''}
  `;
}

// ============================================================================
// PHASE 1: CLEAN SUBMISSION VIEW (With Collapsible Callout Prediction)
// ============================================================================
function renderCleanSubmission(league, round, user) {
  const existingSub = round.tracks.find(t => t.submitted_by === user.id);
  const sel = state.subSelectedTrack;
  const calloutSel = state.calloutSelectedTrack;

  return `
    <div style="padding: 24px 20px; display: flex; flex-direction: column; gap: 20px;">
      <!-- Card 1: Own Song -->
      <div class="card-box" style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between;">
          <h2 style="font-size: 16px; font-weight: 500;">Dein Song für diese Runde</h2>
          <span style="font-size: 12px; color: var(--text-muted);">
            ${existingSub ? 'Gespeichert · Noch änderbar' : 'Noch offen'}
          </span>
        </div>

        <div style="display: flex; gap: 8px;">
          <input
            type="text"
            class="input-field"
            placeholder="Songtitel suchen oder Spotify-/YouTube-Link einfügen..."
            value="${escapeHtml(state.subSearchQuery)}"
            oninput="window.appHandlers.onSubSearchInput(this.value)"
            onkeydown="if(event.key==='Enter') window.appHandlers.resolveSubInput()"
          />
          <button class="btn btn-primary" style="flex-shrink: 0;" onclick="window.appHandlers.resolveSubInput()">
            Auswählen
          </button>
        </div>

        ${state.subSearchResults.length > 0 ? `
          <div style="border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
            ${state.subSearchResults.map((item, idx) => `
              <div
                style="padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; cursor: pointer;"
                onclick="window.appHandlers.selectSubCatalogItem(${idx})"
              >
                <div style="display: flex; align-items: center; gap: 12px;">
                  <img src="${item.cover_url}" alt="" class="album-cover" style="width: 38px; height: 38px;" />
                  <div>
                    <div style="font-size: 14px; font-weight: 500;">${escapeHtml(item.title)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.artist)}</div>
                  </div>
                </div>
                <span style="font-size: 12px; color: var(--accent);">Wählen</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${sel ? `
          <div style="padding: 14px; border: 1px solid var(--border); border-radius: 8px; background-color: var(--surface-inset); display: flex; align-items: center; justify-content: space-between; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 14px; min-width: 0;">
              <img src="${sel.cover_url}" alt="" class="album-cover" />
              <div style="min-width: 0;">
                <div style="font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(sel.title)}</div>
                <div style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(sel.artist)}</div>
              </div>
            </div>
            <span style="font-size: 12px; color: var(--positive); flex-shrink: 0;">Spotify &amp; YouTube verknüpft ✓</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <label style="font-size: 12px; color: var(--text-secondary);">Persönliche Anmerkung (optional)</label>
              <button
                type="button"
                class="btn-text"
                style="font-size: 12px;"
                onclick="window.appHandlers.setPitchVisibility('${state.subPitchVisibility === 'VOTING' ? 'REVEAL' : 'VOTING'}')"
              >
                ${state.subPitchVisibility === 'VOTING' ? 'Sichtbarkeit: Schon beim Voten' : 'Sichtbarkeit: Erst bei Auflösung (Spoiler-Schutz)'}
              </button>
            </div>
            <input
              type="text"
              class="input-field"
              placeholder="Kurze Geschichte oder Gedanke zum Song..."
              value="${escapeHtml(state.subPitch)}"
              oninput="window.appHandlers.setSubPitch(this.value)"
            />
          </div>
        ` : ''}
      </div>

      <!-- Card 2: Collapsible Bonus Prediction ("Offensichtlicher Song") -->
      <div class="card-box">
        <div
          style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;"
          onclick="window.appHandlers.toggleCalloutExpanded()"
        >
          <div>
            <div style="font-size: 14px; font-weight: 500;">
              Bonus-Tipp: Offensichtlicher Song
              <span class="mono" style="font-size: 12px; color: var(--accent); margin-left: 6px;">+1 Pkt.</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              ${calloutSel ? `Dein Tipp: ${escapeHtml(calloutSel.title)} — ${escapeHtml(calloutSel.artist)}` : 'Welcher Song wird garantiert von einem Mitspieler eingereicht?'}
            </div>
          </div>
          <span style="font-size: 12px; color: var(--text-muted);">${state.calloutExpanded ? 'Schließen ▲' : 'Öffnen ▼'}</span>
        </div>

        ${state.calloutExpanded ? `
          <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; gap: 8px;">
              <input
                type="text"
                class="input-field"
                placeholder="Erwarteten Song suchen (z. B. a-ha - Take On Me)..."
                value="${escapeHtml(state.calloutSearchQuery)}"
                oninput="window.appHandlers.onCalloutSearchInput(this.value)"
                onkeydown="if(event.key==='Enter') window.appHandlers.resolveCalloutInput()"
              />
              <button class="btn" style="flex-shrink: 0;" onclick="window.appHandlers.resolveCalloutInput()">Setzen</button>
            </div>

            ${state.calloutSearchResults.length > 0 ? `
              <div style="border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
                ${state.calloutSearchResults.map((item, idx) => `
                  <div
                    style="padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; cursor: pointer;"
                    onclick="window.appHandlers.selectCalloutCatalogItem(${idx})"
                  >
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <img src="${item.cover_url}" alt="" class="album-cover" style="width: 34px; height: 34px;" />
                      <span style="font-size: 13px;">${escapeHtml(item.title)} — ${escapeHtml(item.artist)}</span>
                    </div>
                    <span style="font-size: 12px; color: var(--accent);">Tippen</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${calloutSel ? `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 6px; background-color: var(--surface-inset);">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <img src="${calloutSel.cover_url}" alt="" class="album-cover" style="width: 36px; height: 36px;" />
                  <span style="font-size: 13px; font-weight: 500;">${escapeHtml(calloutSel.title)} — ${escapeHtml(calloutSel.artist)}</span>
                </div>
                <button class="btn-text" onclick="window.appHandlers.clearCallout()">Entfernen</button>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-accent" style="padding: 10px 22px; font-size: 13px;" onclick="window.appHandlers.submitTrackAndCallout()">
          ${existingSub ? 'Änderungen speichern' : 'Beitrag verbindlich speichern'}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// PHASE 2: ACCORDION VOTING FEED (Calm Rows + Single Expanded Song Drawer)
// ============================================================================
function renderCleanVotingAccordion(league, round, user) {
  const tracks = [...round.tracks].sort((a, b) => a.shuffle_order - b.shuffle_order);
  const existingBallot = (round.ballots || []).find(b => b.voter_id === user.id);
  const isLocked = existingBallot && existingBallot.status === 'SUBMITTED';

  let usedPoints = 0;
  const assignedGuessMap = {};
  for (const t of tracks) {
    const w = state.workingVotes[t.id] || { points: 0, comment: '', guessed_user_id: '' };
    if (t.submitted_by !== user.id) {
      usedPoints += Number(w.points) || 0;
      if (w.guessed_user_id) assignedGuessMap[w.guessed_user_id] = t.shuffle_order;
    }
  }
  const remainingPoints = round.points_budget - usedPoints;

  const candidatePlayers = league.members
    .filter(m => m.status === 'ACTIVE' && m.user_id !== user.id)
    .map(m => getUserById(m.user_id));

  return `
    <div class="track-list">
      ${tracks.map(track => {
        const isOwn = track.submitted_by === user.id;
        const isExpanded = state.expandedTrackId === track.id && !isOwn;
        const w = state.workingVotes[track.id] || { points: 0, comment: '', guessed_user_id: '' };
        const effectivePlatform = state.perTrackPlatform[track.id] || state.platformMode;
        const isBookmarked = (user.bookmarks || []).includes(track.id);
        const numStr = String(track.shuffle_order).padStart(2, '0');
        const guessedName = w.guessed_user_id ? getUserById(w.guessed_user_id).name : null;

        if (isOwn) {
          return `
            <div class="track-item own-song">
              <div class="track-row-summary" style="cursor: default;">
                <div class="track-left">
                  <span class="track-index mono">${numStr}</span>
                  <div class="cover-wrap">
                    <img src="${track.cover_url}" alt="" class="album-cover" style="opacity: 0.7;" />
                  </div>
                  <div class="track-info">
                    <div class="track-title" style="color: var(--text-secondary);">${escapeHtml(track.title)}</div>
                    <div class="track-subtitle">${escapeHtml(track.artist)}</div>
                  </div>
                </div>
                <span style="font-size: 12px; color: var(--text-muted);">Dein Beitrag</span>
              </div>
            </div>
          `;
        }

        return `
          <div class="track-item ${isExpanded ? 'expanded' : ''}">
            <!-- Compact Summary Row -->
            <div class="track-row-summary" onclick="window.appHandlers.toggleExpandTrack('${track.id}')">
              <div class="track-left">
                <span class="track-index mono">${numStr}</span>
                <div class="cover-wrap">
                  <img src="${track.cover_url}" alt="${escapeHtml(track.title)}" class="album-cover" />
                  <div class="cover-play-badge">${isExpanded ? '▾' : '▶'}</div>
                </div>
                <div class="track-info">
                  <div class="track-title">${escapeHtml(track.title)}</div>
                  <div class="track-subtitle">${escapeHtml(track.artist)}</div>
                </div>
              </div>

              <!-- Direct Points Selector (Stop propagation so clicking points doesn't toggle accordion) -->
              <div class="points-pill-group mono" onclick="event.stopPropagation()">
                ${[0, 1, 2, 3].map(pt => {
                  const isSelected = Number(w.points) === pt;
                  const deltaNeeded = pt - (Number(w.points) || 0);
                  const disabled = isLocked || (!isSelected && deltaNeeded > remainingPoints);
                  return `
                    <button
                      type="button"
                      class="pt-btn mono ${isSelected ? 'active' : ''}"
                      ${disabled ? 'disabled' : ''}
                      onclick="window.appHandlers.setTrackPoints('${track.id}', ${pt})"
                    >
                      ${pt === 0 ? '0' : `+${pt}`}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Expanded Drawer (Only visible for the active track) -->
            ${isExpanded ? `
              <div class="track-drawer">
                ${track.pitch && track.pitch_visibility !== 'REVEAL' ? `
                  <div class="pitch-line">„${escapeHtml(track.pitch)}“</div>
                ` : ''}

                <!-- Clean Embedded Player -->
                <div class="embed-box">
                  ${effectivePlatform === 'spotify' ? `
                    <iframe
                      src="https://open.spotify.com/embed/track/${encodeURIComponent(track.platforms.spotify.track_id)}?utm_source=generator&theme=0"
                      width="100%"
                      height="152"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                    ></iframe>
                  ` : `
                    <iframe
                      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(track.platforms.youtube.video_id)}?rel=0"
                      width="100%"
                      height="210"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  `}
                  <div class="embed-toolbar">
                    <span>
                      ${effectivePlatform === 'spotify' ? 'Nur 30s Vorschau ohne Abo?' : 'YouTube-Wiedergabe in voller Länge'}
                    </span>
                    <div style="display: flex; align-items: center; gap: 14px;">
                      <button
                        type="button"
                        class="btn-text"
                        onclick="window.appHandlers.toggleTrackPlatform('${track.id}', '${effectivePlatform === 'spotify' ? 'youtube' : 'spotify'}')"
                      >
                        ${effectivePlatform === 'spotify' ? 'Auf YouTube hören →' : 'Zu Spotify wechseln →'}
                      </button>
                      <button
                        type="button"
                        class="btn-text"
                        style="color: ${isBookmarked ? 'var(--accent)' : 'var(--text-secondary)'};"
                        onclick="window.appHandlers.toggleBookmark('${track.id}')"
                      >
                        ${isBookmarked ? 'Gemerkt ✓' : 'Merken'}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Side-by-Side: Larger Comment Field (Left) + Submitter Guess (Right) -->
                <div class="drawer-inputs-grid">
                  <textarea
                    rows="2"
                    class="textarea-field"
                    placeholder="Kommentar zum Song hinterlassen (optional)..."
                    ${isLocked ? 'readonly' : ''}
                    oninput="window.appHandlers.setTrackComment('${track.id}', this.value)"
                  >${escapeHtml(w.comment)}</textarea>

                  <select
                    class="select-field"
                    ${isLocked ? 'disabled' : ''}
                    onchange="window.appHandlers.setTrackGuess('${track.id}', this.value)"
                    title="Optionaler Detektiv-Tipp: +1 Punkt bei Treffer, -1 Punkt falls falsch"
                  >
                    <option value="" ${!w.guessed_user_id ? 'selected' : ''}>Von wem? (Kein Tipp ±0)</option>
                    ${candidatePlayers.map(cp => {
                      const isCurrentPick = w.guessed_user_id === cp.id;
                      const assignedAtNum = assignedGuessMap[cp.id];
                      const suffix = (!isCurrentPick && assignedAtNum) ? ` (#0${assignedAtNum})` : '';
                      return `<option value="${cp.id}" ${isCurrentPick ? 'selected' : ''}>Tipp: ${escapeHtml(cp.name)}${suffix}</option>`;
                    }).join('')}
                  </select>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>

    <!-- Clean Sticky Bottom Bar -->
    <div class="sticky-bar">
      <div class="sticky-bar-inner">
        <div>
          <span style="font-size: 13px; color: var(--text-secondary);">Verbleibend:</span>
          <strong class="mono" style="font-size: 14px; margin-left: 4px; color: ${remainingPoints === 0 ? 'var(--accent)' : 'var(--text-primary)'};">
            ${remainingPoints} von ${round.points_budget} Punkten
          </strong>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          ${!isLocked ? `
            <button class="btn" onclick="window.appHandlers.saveBallot('DRAFT')">
              Zwischenspeichern
            </button>
            <button
              class="btn btn-accent"
              ${remainingPoints !== 0 ? 'disabled' : ''}
              onclick="window.appHandlers.saveBallot('SUBMITTED')"
            >
              Final absenden
            </button>
          ` : `
            <span style="font-size: 12px; color: var(--text-muted);">Stimmzettel final eingereicht ✓</span>
          `}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// PHASE 3: CLEAN REVEAL (Podium + Accordion Track Breakdown + Detective Tab)
// ============================================================================
function renderCleanReveal(league, round, user) {
  const { trackRows, detectiveRows } = computeRoundResults(league, round);
  const totalTracks = trackRows.length;
  const top3 = trackRows.slice(0, 3);

  const visibleTrackRows = state.revealMode === 'COUNTDOWN'
    ? trackRows.slice(Math.max(0, totalTracks - state.countdownStep)).reverse()
    : trackRows;

  return `
    <!-- Clean Toolbar -->
    <div style="padding: 12px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
      <div class="segmented">
        <button class="${state.revealSubTab === 'SONGS' ? 'active' : ''}" onclick="window.appHandlers.setRevealSubTab('SONGS')">Song-Wertung</button>
        <button class="${state.revealSubTab === 'DETECTIVE' ? 'active' : ''}" onclick="window.appHandlers.setRevealSubTab('DETECTIVE')">Detektiv-Wertung</button>
      </div>

      ${state.revealSubTab === 'SONGS' ? `
        <div style="display: flex; align-items: center; gap: 10px;">
          <button
            class="btn-text"
            onclick="window.appHandlers.setRevealMode('${state.revealMode === 'ALL' ? 'COUNTDOWN' : 'ALL'}')"
          >
            ${state.revealMode === 'ALL' ? 'Spannungs-Countdown starten' : 'Alle Plätze zeigen'}
          </button>
          <button class="btn-text" onclick="window.appHandlers.copyRoundSummary()">Ergebnis kopieren</button>
        </div>
      ` : ''}
    </div>

    ${state.revealSubTab === 'SONGS' ? `
      ${state.revealMode === 'COUNTDOWN' ? `
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); background-color: var(--surface-elevated); display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 13px;">Aufgedeckt: <strong>${state.countdownStep} von ${totalTracks}</strong> (vom letzten bis zum 1. Platz)</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn" onclick="window.appHandlers.stepCountdown(-1)" ${state.countdownStep <= 1 ? 'disabled' : ''}>Zurück</button>
            <button class="btn btn-accent" onclick="window.appHandlers.stepCountdown(1)" ${state.countdownStep >= totalTracks ? 'disabled' : ''}>Nächster Platz →</button>
          </div>
        </div>
      ` : `
        <!-- Top 3 Podium -->
        <div style="padding: 22px 20px; border-bottom: 1px solid var(--border);">
          <div class="podium-grid">
            ${top3.map(row => `
              <div class="podium-item ${row.rank === 1 ? 'first' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                  <span class="mono" style="font-size: 12px; color: ${row.rank === 1 ? 'var(--accent)' : 'var(--text-muted)'}; font-weight: 600;">
                    Platz 0${row.rank}
                  </span>
                  <span class="mono" style="font-size: 14px; font-weight: 600;">${row.effectivePoints} Pkt.</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <img src="${row.track.cover_url}" alt="" class="album-cover-lg" />
                  <div style="min-width: 0;">
                    <div style="font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(row.track.title)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(row.track.artist)}</div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">von <strong style="color: var(--text-primary);">${escapeHtml(row.submitter.name)}</strong></div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `}

      <!-- Accordion Results List (Click any song to see full votes, guesses & comments) -->
      <div class="track-list">
        ${visibleTrackRows.map(row => {
          const t = row.track;
          const isExp = state.expandedRevealTrackId === t.id;
          const replyDraft = state.replyDrafts[t.id] || '';
          return `
            <div class="track-item ${isExp ? 'expanded' : ''}">
              <div class="track-row-summary" onclick="window.appHandlers.toggleExpandRevealTrack('${t.id}')">
                <div class="track-left">
                  <span class="track-index mono" style="font-weight: 600; color: ${row.rank === 1 ? 'var(--accent)' : 'var(--text-muted)'};">
                    #${row.rank}
                  </span>
                  <img src="${t.cover_url}" alt="" class="album-cover" />
                  <div class="track-info">
                    <div class="track-title">${escapeHtml(t.title)} — ${escapeHtml(t.artist)}</div>
                    <div class="track-subtitle">
                      Eingereicht von <strong style="color: var(--text-primary);">${escapeHtml(row.submitter.name)}</strong>
                      · ${row.votesForTrack.filter(v => v.comment).length} Kommentare
                    </div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="mono" style="font-size: 15px; font-weight: 600; color: ${row.rank === 1 ? 'var(--accent)' : 'var(--text-primary)'};">
                    ${row.effectivePoints} Pkt.
                  </span>
                  <span style="font-size: 11px; color: var(--text-muted);">${isExp ? '▲' : '▼'}</span>
                </div>
              </div>

              ${isExp ? `
                <div class="track-drawer">
                  ${t.pitch ? `<div class="pitch-line">„${escapeHtml(t.pitch)}“ — ${escapeHtml(row.submitter.name)}</div>` : ''}

                  <div style="font-size: 13px; color: var(--text-secondary);">
                    <strong style="color: var(--text-primary);">Punkte:</strong>
                    ${row.votesForTrack.filter(v => v.points > 0).map(v => `${escapeHtml(v.voter_name)} (+${v.points})`).join(' · ') || 'Keine'}
                  </div>

                  ${row.detectiveGuessesOnTrack.length > 0 ? `
                    <div style="font-size: 13px; color: var(--text-secondary);">
                      <strong style="color: var(--text-primary);">Detektiv-Tipps:</strong>
                      ${row.detectiveGuessesOnTrack.map(g => `
                        <span style="color: ${g.isCorrect ? 'var(--positive)' : 'var(--negative)'}; margin-right: 8px;">
                          ${escapeHtml(g.voter_name)} tippte ${escapeHtml(g.guessed_user_name)} (${g.isCorrect ? '+1' : '−1'})
                        </span>
                      `).join('')}
                    </div>
                  ` : ''}

                  <!-- Comments & Replies -->
                  <div style="display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid var(--border-subtle);">
                    ${row.votesForTrack.filter(v => v.comment).map(v => `
                      <div style="font-size: 13px;">
                        <strong style="color: var(--text-secondary);">${escapeHtml(v.voter_name)} (+${v.points}):</strong>
                        „${escapeHtml(v.comment)}“
                      </div>
                    `).join('')}

                    ${(t.replies || []).map(rep => `
                      <div style="font-size: 13px; padding-left: 12px; border-left: 2px solid var(--accent); color: var(--text-secondary);">
                        <strong style="color: var(--text-primary);">${escapeHtml(getUserById(rep.user_id).name)}:</strong>
                        ${escapeHtml(rep.text)}
                      </div>
                    `).join('')}

                    <div style="display: flex; gap: 8px; margin-top: 6px;">
                      <input
                        type="text"
                        class="input-field"
                        placeholder="Antwort schreiben..."
                        value="${escapeHtml(replyDraft)}"
                        oninput="window.appHandlers.setReplyDraft('${t.id}', this.value)"
                        onkeydown="if(event.key==='Enter') window.appHandlers.submitReply('${t.id}')"
                      />
                      <button class="btn" onclick="window.appHandlers.submitReply('${t.id}')">Senden</button>
                    </div>
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    ` : `
      <!-- Sub-Tab: Detective Score Table & Callout Predictions -->
      <div style="padding: 22px 20px; display: flex; flex-direction: column; gap: 24px;">
        <table class="clean-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Spieler</th>
              <th>Offensichtlicher Song (+1)</th>
              <th>Wer war’s? (+1 / −1)</th>
              <th style="text-align: right;">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            ${detectiveRows.map((d, idx) => `
              <tr>
                <td class="mono">${idx + 1}</td>
                <td style="font-weight: 500;">${escapeHtml(d.user.name)}</td>
                <td style="font-size: 12px; color: var(--text-secondary);">
                  ${d.calloutPrediction
                    ? `${escapeHtml(d.calloutPrediction.title)} ${d.calloutHit ? '(+1 ✓)' : '(0)'}`
                    : '—'}
                </td>
                <td class="mono" style="font-size: 12px; color: var(--text-secondary);">
                  ${d.correctGuesses}✓ / ${d.wrongGuesses}✗
                </td>
                <td class="mono" style="text-align: right; font-weight: 600; color: ${d.totalDetectivePoints > 0 ? 'var(--positive)' : d.totalDetectivePoints < 0 ? 'var(--negative)' : 'var(--text-primary)'};">
                  ${d.totalDetectivePoints > 0 ? `+${d.totalDetectivePoints}` : d.totalDetectivePoints}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

// ============================================================================
// SEASON SCREEN (Clean Tables, Personal Stats & Motto Pool)
// ============================================================================
function renderSeasonScreen(league, round, user) {
  const { songLeaderboard, detectiveLeaderboard, statsByUser, biggestFan, favoriteSupplier, allSeasonTracks } = computeSeasonStats(league);
  const myStats = statsByUser[user.id] || {};
  const detRate = myStats.guessesMadeTotal > 0 ? Math.round((myStats.guessesCorrectTotal / myStats.guessesMadeTotal) * 100) : 0;
  const isHost = (league.host_user_id === user.id) || (league.members.find(m => m.user_id === user.id)?.role === 'HOST');

  return `
    <section class="round-hero">
      <div class="round-meta-line">
        <span>${escapeHtml(league.name)} · Saison 0${league.season_number}</span>
        <a href="${buildYoutubeQueueUrl(allSeasonTracks)}" target="_blank" rel="noopener noreferrer" class="btn-text" style="color: var(--accent);">
          Alle ${allSeasonTracks.length} Saison-Songs als Playlist ↗
        </a>
      </div>
      <h1 class="round-title">Saison-Gesamtwertung</h1>
    </section>

    <div style="padding: 24px 20px; display: flex; flex-direction: column; gap: 28px;">
      <!-- Two Leaderboards Side-by-Side -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px;">
        <div class="card-box">
          <div class="drawer-label" style="margin-bottom: 10px;">Song-Wertung</div>
          <table class="clean-table">
            <thead>
              <tr><th>#</th><th>Spieler</th><th>Siege</th><th style="text-align:right;">Punkte</th></tr>
            </thead>
            <tbody>
              ${songLeaderboard.map((r, i) => `
                <tr>
                  <td class="mono">${i + 1}</td>
                  <td style="font-weight: 500;">${escapeHtml(r.user.name)}</td>
                  <td class="mono">${r.roundWins}</td>
                  <td class="mono" style="text-align:right; font-weight:600;">${r.songPointsTotal}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card-box">
          <div class="drawer-label" style="margin-bottom: 10px;">Detektiv-Wertung</div>
          <table class="clean-table">
            <thead>
              <tr><th>#</th><th>Spieler</th><th>Treffer</th><th style="text-align:right;">Punkte</th></tr>
            </thead>
            <tbody>
              ${detectiveLeaderboard.map((r, i) => `
                <tr>
                  <td class="mono">${i + 1}</td>
                  <td style="font-weight: 500;">${escapeHtml(r.user.name)}</td>
                  <td class="mono">${r.guessesCorrectTotal + r.calloutHitsTotal}</td>
                  <td class="mono" style="text-align:right; font-weight:600;">${r.detectivePointsTotal > 0 ? '+' + r.detectivePointsTotal : r.detectivePointsTotal}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Compact Personal Stats Row -->
      <div class="card-box" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
        <div>
          <div class="drawer-label">Größter Fan</div>
          <div style="font-size: 15px; font-weight: 500; margin-top: 4px;">${biggestFan ? `${escapeHtml(biggestFan.name)} (${biggestFan.points} Pkt.)` : '—'}</div>
        </div>
        <div>
          <div class="drawer-label">Lieblings-Lieferant</div>
          <div style="font-size: 15px; font-weight: 500; margin-top: 4px;">${favoriteSupplier ? `${escapeHtml(favoriteSupplier.name)} (${favoriteSupplier.points} Pkt.)` : '—'}</div>
        </div>
        <div>
          <div class="drawer-label">Deine Detektiv-Quote</div>
          <div class="mono" style="font-size: 15px; font-weight: 500; margin-top: 4px;">${detRate}% richtig</div>
        </div>
      </div>

      <!-- Motto Idea Box -->
      <div class="card-box" style="display: flex; flex-direction: column; gap: 14px;">
        <div class="drawer-label">Motto-Ideenbox für kommende Runden</div>
        <div style="display: flex; gap: 8px;">
          <input
            type="text"
            class="input-field"
            placeholder="Neues Motto vorschlagen..."
            value="${escapeHtml(state.newIdeaTitle)}"
            oninput="window.appHandlers.setNewIdea('title', this.value)"
          />
          <button class="btn btn-primary" onclick="window.appHandlers.addThemeIdea()">Hinzufügen</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(league.theme_ideas || []).map(idea => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 6px; background-color: var(--surface-inset); gap: 10px;">
              <span style="font-size: 13px; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(idea.title)}</span>
              <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <button class="btn mono" onclick="window.appHandlers.toggleIdeaVote('${idea.id}')">+${(idea.votes || []).length}</button>
                ${isHost ? `
                  <button class="btn-text" style="font-size: 12px; color: var(--accent);" onclick="window.appHandlers.promoteIdeaToNextRound('${idea.id}')">Als neue Runde starten →</button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// SECONDARY SCREENS (Opened cleanly from the Slide-Over Menu)
// ============================================================================
function renderBookmarksScreen(league, round, user) {
  const bookmarkedIds = new Set(user.bookmarks || []);
  const items = [];
  for (const l of state.db.leagues) {
    for (const r of l.rounds) {
      for (const t of r.tracks) {
        if (bookmarkedIds.has(t.id)) items.push({ track: t, roundTitle: r.title });
      }
    }
  }
  return `
    <section class="round-hero">
      <div class="round-meta-line">
        <span>Persönliches Archiv</span>
        <button class="btn-text" onclick="window.appHandlers.setMainView('ROUND')">← Zurück zur Runde</button>
      </div>
      <h1 class="round-title">Meine Merkliste (${items.length})</h1>
    </section>
    <div class="track-list">
      ${items.length === 0 ? `<div style="padding: 30px 20px; color: var(--text-muted);">Noch keine Songs gemerkt.</div>` : items.map(it => `
        <div class="track-item">
          <div class="track-row-summary" style="cursor: default;">
            <div class="track-left">
              <img src="${it.track.cover_url}" alt="" class="album-cover" />
              <div class="track-info">
                <div class="track-title">${escapeHtml(it.track.title)}</div>
                <div class="track-subtitle">${escapeHtml(it.track.artist)} · ${escapeHtml(it.roundTitle)}</div>
              </div>
            </div>
            <button class="btn-text" onclick="window.appHandlers.toggleBookmark('${it.track.id}')">Entfernen</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNotificationsScreen(league, user) {
  const logs = state.db.notifications_log || [];
  return `
    <section class="round-hero">
      <div class="round-meta-line">
        <span>E-Mail &amp; Web-Push</span>
        <button class="btn-text" onclick="window.appHandlers.setMainView('ROUND')">← Zurück zur Runde</button>
      </div>
      <h1 class="round-title">Postfach (${logs.length})</h1>
    </section>
    <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px;">
      ${logs.map(n => `
        <div class="card-box">
          <div style="font-size: 11px; color: var(--accent);" class="mono">An ${escapeHtml(n.recipient_name)} · ${(n.channels || []).join(' + ')}</div>
          <div style="font-size: 14px; font-weight: 500; margin-top: 4px;">${escapeHtml(n.subject)}</div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(n.message)}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function renderProfileScreen(league, user) {
  return `
    <section class="round-hero">
      <div class="round-meta-line">
        <span>Einstellungen &amp; Benachrichtigungen</span>
        <button class="btn-text" onclick="window.appHandlers.setMainView('ROUND')">← Zurück zur Runde</button>
      </div>
      <h1 class="round-title">Profil von ${escapeHtml(user.name)}</h1>
    </section>
    <div style="padding: 24px 20px; display: flex; flex-direction: column; gap: 18px;">
      <div class="card-box" style="display: flex; flex-direction: column; gap: 12px;">
        <label style="font-size: 12px; color: var(--text-secondary);">Anzeigename</label>
        <input id="prof-name" type="text" class="input-field" value="${escapeHtml(user.name)}" />
        <label style="font-size: 12px; color: var(--text-secondary);">E-Mail-Adresse (für Login-Code &amp; Updates)</label>
        <input id="prof-email" type="email" class="input-field" value="${escapeHtml(user.email)}" />

        <div style="padding-top: 8px; display: flex; flex-direction: column; gap: 8px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
            <input id="prof-notif-email" type="checkbox" ${user.notifications?.email_enabled ? 'checked' : ''} />
            E-Mail bei neuer Playlist &amp; Rundenende
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
            <input id="prof-notif-push" type="checkbox" ${user.notifications?.web_push_enabled ? 'checked' : ''} />
            Smartphone / Browser Web-Push
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
            <input id="prof-notif-rem" type="checkbox" ${user.notifications?.deadline_reminders_enabled ? 'checked' : ''} />
            Erinnerung vor Fristablauf
          </label>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px;">
          <button class="btn-text" style="color: var(--negative);" onclick="window.appHandlers.anonymizeAccount()">Account löschen</button>
          <button class="btn btn-accent" onclick="window.appHandlers.saveProfile()">Speichern</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// SLIDE-OVER MENU DRAWER (Holds all secondary navigation, Archive, Theme, Host)
// ============================================================================
function renderMenuDrawer(league, round, user) {
  const isHost = isUserHostOrCoHost(league, user.id);

  return `
    <div class="drawer-backdrop" onclick="if(event.target===this) window.appHandlers.toggleMenu()">
      <aside class="slide-drawer">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 15px; font-weight: 600;">Menü &amp; Einstellungen</span>
          <button class="btn-text" onclick="window.appHandlers.toggleMenu()">Schließen ✕</button>
        </div>

        <!-- 1. Quick Links -->
        <div class="drawer-section">
          <div class="drawer-label">Persönlicher Bereich</div>
          <button class="btn" style="justify-content: space-between; width: 100%;" onclick="window.appHandlers.openSubScreen('BOOKMARKS')">
            <span>Meine Merkliste</span>
            <span class="mono">${(user.bookmarks || []).length}</span>
          </button>
          <button class="btn" style="justify-content: space-between; width: 100%;" onclick="window.appHandlers.openSubScreen('NOTIFICATIONS')">
            <span>Postfach (E-Mail &amp; Push)</span>
            <span class="mono">${(state.db.notifications_log || []).length}</span>
          </button>
          <button class="btn" style="justify-content: space-between; width: 100%;" onclick="window.appHandlers.openSubScreen('PROFILE')">
            <span>Profil &amp; Benachrichtigungen</span>
            <span>→</span>
          </button>
        </div>

        <!-- 2. Preferred Streaming Service & Appearance -->
        <div class="drawer-section">
          <div class="drawer-label">Standard-Musikdienst</div>
          <div class="segmented" style="width: 100%;">
            <button style="flex: 1;" class="${state.platformMode === 'spotify' ? 'active' : ''}" onclick="window.appHandlers.setGlobalPlatform('spotify')">Spotify</button>
            <button style="flex: 1;" class="${state.platformMode === 'youtube' ? 'active' : ''}" onclick="window.appHandlers.setGlobalPlatform('youtube')">YouTube</button>
          </div>

          <div class="drawer-label" style="margin-top: 6px;">Erscheinungsbild</div>
          <div class="segmented" style="width: 100%;">
            <button style="flex: 1;" class="${state.theme === 'dark' ? 'active' : ''}" onclick="window.appHandlers.setTheme('dark')">Warm Dark</button>
            <button style="flex: 1;" class="${state.theme === 'light' ? 'active' : ''}" onclick="window.appHandlers.setTheme('light')">Warm Paper</button>
          </div>
        </div>

        <!-- 3. Round Archive & League Switcher -->
        <div class="drawer-section">
          <div class="drawer-label">Runde &amp; Liga wechseln</div>
          <select class="select-field" onchange="window.appHandlers.changeRound(this.value)">
            ${league.rounds.map(r => `
              <option value="${r.id}" ${r.id === round.id ? 'selected' : ''}>
                Runde 0${r.number}: ${escapeHtml(r.title)} (${r.phase === 'REVEAL' ? 'Archiv' : r.phase === 'UPCOMING' ? 'Geplant' : 'Aktiv'})
              </option>
            `).join('')}
          </select>

          <select class="select-field" onchange="window.appHandlers.changeLeague(this.value)">
            ${state.db.leagues.map(l => `
              <option value="${l.id}" ${l.id === league.id ? 'selected' : ''}>Liga: ${escapeHtml(l.name)}</option>
            `).join('')}
          </select>
        </div>

        <!-- 4. Player Perspective & Phase Simulation (For testing / Host) -->
        <div class="drawer-section">
          <div class="drawer-label">Aktiver Spieler (Perspektive)</div>
          <select class="select-field" onchange="window.appHandlers.changeUser(this.value)">
            ${league.members.map(m => {
              const u = getUserById(m.user_id);
              return `<option value="${u.id}" ${u.id === user.id ? 'selected' : ''}>${escapeHtml(u.name)} (${m.role})</option>`;
            }).join('')}
          </select>

          <div class="drawer-label" style="margin-top: 6px;">Runden-Status (Host / Vorschau)</div>
          <div class="segmented" style="width: 100%;">
            <button style="flex: 1;" class="${round.phase === 'SUBMISSION' ? 'active' : ''}" onclick="window.appHandlers.setRoundPhase('SUBMISSION')">Einreichen</button>
            <button style="flex: 1;" class="${round.phase === 'VOTING' ? 'active' : ''}" onclick="window.appHandlers.setRoundPhase('VOTING')">Voten</button>
            <button style="flex: 1;" class="${round.phase === 'REVEAL' ? 'active' : ''}" onclick="window.appHandlers.setRoundPhase('REVEAL')">Ergebnis</button>
          </div>
        </div>

        <!-- 5. Host Tools (Collapsible inside Drawer) -->
        ${isHost ? `
          <div class="drawer-section">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="drawer-label">Host-Werkzeuge</span>
              <button class="btn-text" onclick="window.appHandlers.toggleHostTools()">
                ${state.hostToolsExpanded ? 'Ausblenden' : 'Einblenden'}
              </button>
            </div>
            ${state.hostToolsExpanded ? `
              <button class="btn" onclick="window.appHandlers.createNewRoundPrompt()">+ Neue Runde anlegen</button>
              <button class="btn" onclick="window.appHandlers.extendDeadline(24)">Frist um +24 Std. verlängern</button>
              <button class="btn" onclick="window.appHandlers.exportJsonBackup()">JSON-Backup herunterladen</button>
              <button class="btn" style="color: var(--negative); width: 100%; justify-content: flex-start;" onclick="window.appHandlers.resetToCleanSeason()">Saison 1 auf Anfang zurücksetzen (Leere Runde 1)</button>
              ${league.members.map(m => {
                const u = getUserById(m.user_id);
                const bal = (round.ballots || []).find(b => b.voter_id === u.id);
                const isLocked = bal && bal.status === 'SUBMITTED';
                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding-top: 4px;">
                    <span>${escapeHtml(u.name)}</span>
                    ${isLocked ? `<button class="btn-text" onclick="window.appHandlers.unlockBallot('${u.id}')">Vote entsperren</button>` : `<span style="color:var(--text-muted);">Offen</span>`}
                  </div>
                `;
              }).join('')}
            ` : ''}
          </div>
        ` : ''}
      </aside>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================
let subSearchDebounceTimer = null;
let calloutSearchDebounceTimer = null;

window.appHandlers = {
  setMainView(view) {
    state.mainView = view;
    state.menuOpen = false;
    render();
  },
  openSubScreen(view) {
    state.mainView = view;
    state.menuOpen = false;
    render();
  },
  toggleMenu() {
    state.menuOpen = !state.menuOpen;
    render();
  },
  toggleHostTools() {
    state.hostToolsExpanded = !state.hostToolsExpanded;
    render();
  },
  setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    dispatchAction('UPDATE_USER_PREFS', { user_id: state.currentUserId, preferred_theme: theme });
    render();
  },
  setGlobalPlatform(platform) {
    state.platformMode = platform;
    state.perTrackPlatform = {};
    dispatchAction('UPDATE_USER_PREFS', { user_id: state.currentUserId, preferred_platform: platform });
    render();
  },
  changeLeague(leagueId) {
    state.currentLeagueId = leagueId;
    const league = getCurrentLeague();
    state.currentRoundId = league.active_round_id || league.rounds[0].id;
    state.menuOpen = false;
    syncLocalFormsFromDb();
    render();
  },
  changeRound(roundId) {
    state.currentRoundId = roundId;
    state.mainView = 'ROUND';
    state.menuOpen = false;
    syncLocalFormsFromDb();
    render();
  },
  changeUser(userId) {
    state.currentUserId = userId;
    const user = getCurrentUser();
    if (user) state.platformMode = user.preferred_platform || 'spotify';
    state.menuOpen = false;
    syncLocalFormsFromDb();
    showToast(`Angemeldet als ${user.name}`);
  },
  toggleExpandTrack(trackId) {
    state.expandedTrackId = state.expandedTrackId === trackId ? null : trackId;
    render();
  },
  toggleExpandRevealTrack(trackId) {
    state.expandedRevealTrackId = state.expandedRevealTrackId === trackId ? null : trackId;
    render();
  },
  toggleTrackPlatform(trackId, targetPlatform) {
    state.perTrackPlatform[trackId] = targetPlatform;
    render();
  },
  toggleCalloutExpanded() {
    state.calloutExpanded = !state.calloutExpanded;
    render();
  },
  onSubSearchInput(val) {
    state.subSearchQuery = val;
    clearTimeout(subSearchDebounceTimer);
    const q = val.trim();
    if (q.length < 1) {
      state.subSearchResults = [];
      render();
      return;
    }
    const qLower = q.toLowerCase();
    state.subSearchResults = state.catalog.filter(item =>
      item.title.toLowerCase().includes(qLower) || item.artist.toLowerCase().includes(qLower)
    ).slice(0, 5);
    render();

    if (q.length >= 2 && !q.startsWith('http://') && !q.startsWith('https://')) {
      subSearchDebounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&platform=${state.platformMode}`);
          if (res.ok) {
            const data = await res.json();
            if (state.subSearchQuery.trim() === q && Array.isArray(data.results) && data.results.length > 0) {
              state.subSearchResults = data.results;
              render();
            }
          }
        } catch (_) {}
      }, 300);
    }
  },
  async selectSubCatalogItem(idx) {
    const item = state.subSearchResults[idx];
    if (!item) return;
    state.subSelectedTrack = JSON.parse(JSON.stringify(item));
    state.subSearchQuery = `${item.artist} — ${item.title}`;
    state.subSearchResults = [];
    render();

    const spUrl = item.platforms?.spotify?.url;
    const ytUrl = item.platforms?.youtube?.url;
    if ((spUrl && !ytUrl) || (ytUrl && !spUrl)) {
      try {
        const queryOrUrl = spUrl || ytUrl;
        const res = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queryOrUrl })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.resolved) {
            state.subSelectedTrack = data.resolved;
            render();
          }
        }
      } catch (_) {}
    }
  },
  async resolveSubInput() {
    const q = state.subSearchQuery.trim();
    if (!q) return showToast('Bitte Songtitel oder Link eingeben.');
    const res = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryOrUrl: q })
    });
    const data = await res.json();
    if (res.ok && data.resolved) {
      state.subSelectedTrack = data.resolved;
      state.subSearchResults = [];
      render();
    }
  },
  setPitchVisibility(vis) {
    state.subPitchVisibility = vis;
    render();
  },
  setSubPitch(val) {
    state.subPitch = val;
  },
  onCalloutSearchInput(val) {
    state.calloutSearchQuery = val;
    clearTimeout(calloutSearchDebounceTimer);
    const q = val.trim();
    if (q.length < 1) {
      state.calloutSearchResults = [];
      render();
      return;
    }
    const qLower = q.toLowerCase();
    state.calloutSearchResults = state.catalog.filter(item =>
      item.title.toLowerCase().includes(qLower) || item.artist.toLowerCase().includes(qLower)
    ).slice(0, 5);
    render();

    if (q.length >= 2 && !q.startsWith('http://') && !q.startsWith('https://')) {
      calloutSearchDebounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&platform=${state.platformMode}`);
          if (res.ok) {
            const data = await res.json();
            if (state.calloutSearchQuery.trim() === q && Array.isArray(data.results) && data.results.length > 0) {
              state.calloutSearchResults = data.results;
              render();
            }
          }
        } catch (_) {}
      }, 300);
    }
  },
  async selectCalloutCatalogItem(idx) {
    const item = state.calloutSearchResults[idx];
    if (!item) return;
    state.calloutSelectedTrack = JSON.parse(JSON.stringify(item));
    state.calloutSearchQuery = `${item.artist} — ${item.title}`;
    state.calloutSearchResults = [];
    render();

    const spUrl = item.platforms?.spotify?.url;
    const ytUrl = item.platforms?.youtube?.url;
    if ((spUrl && !ytUrl) || (ytUrl && !spUrl)) {
      try {
        const queryOrUrl = spUrl || ytUrl;
        const res = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queryOrUrl })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.resolved) {
            state.calloutSelectedTrack = data.resolved;
            render();
          }
        }
      } catch (_) {}
    }
  },
  async resolveCalloutInput() {
    const q = state.calloutSearchQuery.trim();
    if (!q) return;
    const res = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryOrUrl: q })
    });
    const data = await res.json();
    if (res.ok && data.resolved) {
      state.calloutSelectedTrack = data.resolved;
      state.calloutSearchResults = [];
      render();
    }
  },
  clearCallout() {
    state.calloutSelectedTrack = null;
    state.calloutSearchQuery = '';
    render();
  },
  async submitTrackAndCallout() {
    if (!state.subSelectedTrack) return showToast('Bitte wähle zuerst deinen Song aus.');
    const result = await dispatchAction('SUBMIT_TRACK', {
      league_id: state.currentLeagueId,
      round_id: state.currentRoundId,
      user_id: state.currentUserId,
      track: { ...state.subSelectedTrack, pitch: state.subPitch, pitch_visibility: state.subPitchVisibility },
      callout: state.calloutSelectedTrack,
      auto_advance_if_complete: true
    });
    if (result) {
      syncLocalFormsFromDb();
      showToast('Dein Beitrag wurde gespeichert.');
      render();
    }
  },
  setTrackPoints(trackId, points) {
    if (!state.workingVotes[trackId]) state.workingVotes[trackId] = { points: 0, comment: '', guessed_user_id: '' };
    state.workingVotes[trackId].points = points;
    render();
  },
  setTrackGuess(trackId, guessedUserId) {
    if (guessedUserId) {
      for (const [otherId, v] of Object.entries(state.workingVotes)) {
        if (otherId !== trackId && v.guessed_user_id === guessedUserId) v.guessed_user_id = '';
      }
    }
    if (!state.workingVotes[trackId]) state.workingVotes[trackId] = { points: 0, comment: '', guessed_user_id: '' };
    state.workingVotes[trackId].guessed_user_id = guessedUserId || null;
    render();
  },
  setTrackComment(trackId, comment) {
    if (!state.workingVotes[trackId]) state.workingVotes[trackId] = { points: 0, comment: '', guessed_user_id: '' };
    state.workingVotes[trackId].comment = comment;
  },
  async saveBallot(mode) {
    const votesArray = Object.entries(state.workingVotes).map(([track_id, v]) => ({
      track_id,
      points: Number(v.points) || 0,
      comment: v.comment || '',
      guessed_user_id: v.guessed_user_id || null
    }));
    const result = await dispatchAction('SAVE_BALLOT', {
      league_id: state.currentLeagueId,
      round_id: state.currentRoundId,
      voter_id: state.currentUserId,
      mode,
      votes: votesArray
    });
    if (result) {
      syncLocalFormsFromDb();
      if (result.autoAdvanced) {
        showToast('Alle Stimmen sind da! Ergebnisse wurden aufgedeckt.');
      } else {
        showToast(mode === 'SUBMITTED' ? 'Wertung final abgesendet.' : 'Entwurf zwischengespeichert.');
      }
      render();
    }
  },
  async toggleBookmark(trackId) {
    await dispatchAction('TOGGLE_BOOKMARK', { user_id: state.currentUserId, track_id: trackId });
    render();
  },
  setRevealSubTab(subTab) {
    state.revealSubTab = subTab;
    render();
  },
  setRevealMode(mode) {
    state.revealMode = mode;
    state.countdownStep = 1;
    render();
  },
  stepCountdown(delta) {
    const round = getCurrentRound();
    state.countdownStep = Math.max(1, Math.min(round.tracks.length, state.countdownStep + delta));
    render();
  },
  setReplyDraft(trackId, text) {
    state.replyDrafts[trackId] = text;
  },
  async submitReply(trackId) {
    const text = (state.replyDrafts[trackId] || '').trim();
    if (!text) return;
    state.replyDrafts[trackId] = '';
    await dispatchAction('ADD_TRACK_REPLY', {
      league_id: state.currentLeagueId,
      round_id: state.currentRoundId,
      track_id: trackId,
      user_id: state.currentUserId,
      text
    }, 'Antwort gesendet.');
    render();
  },
  copyRoundSummary() {
    const league = getCurrentLeague();
    const round = getCurrentRound();
    const { trackRows } = computeRoundResults(league, round);
    const lines = trackRows.slice(0, 3).map(r => `#${r.rank} ${r.track.title} — ${r.track.artist} (${r.effectivePoints} Pkt. · ${r.submitter.name})`);
    navigator.clipboard.writeText(`${league.name} · ${round.title}\n` + lines.join('\n'));
    showToast('Zusammenfassung in die Zwischenablage kopiert.');
  },
  async setRoundPhase(phase) {
    await dispatchAction('SET_ROUND_PHASE', {
      league_id: state.currentLeagueId,
      round_id: state.currentRoundId,
      phase
    });
    render();
  },
  async unlockBallot(voterId) {
    await dispatchAction('HOST_UNLOCK_BALLOT', {
      league_id: state.currentLeagueId,
      round_id: state.currentRoundId,
      voter_id: voterId
    }, 'Stimmzettel wieder entsperrt.');
    syncLocalFormsFromDb();
    render();
  },
  async extendDeadline(hours) {
    await dispatchAction('HOST_EXTEND_DEADLINE', {
      league_id: state.currentLeagueId,
      round_id: state.currentRoundId,
      hours
    }, 'Frist um 24 Stunden verlängert.');
    render();
  },
  exportJsonBackup() {
    const blob = new Blob([JSON.stringify(state.db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plattenrunde-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  },
  setNewIdea(field, val) {
    if (field === 'title') state.newIdeaTitle = val;
    else state.newIdeaDesc = val;
  },
  async addThemeIdea() {
    if (!state.newIdeaTitle.trim()) return;
    await dispatchAction('ADD_THEME_IDEA', {
      league_id: state.currentLeagueId,
      user_id: state.currentUserId,
      title: state.newIdeaTitle,
      description: ''
    }, 'Motto-Idee gespeichert.');
    state.newIdeaTitle = '';
    render();
  },
  async toggleIdeaVote(ideaId) {
    await dispatchAction('TOGGLE_IDEA_VOTE', {
      league_id: state.currentLeagueId,
      idea_id: ideaId,
      user_id: state.currentUserId
    });
    render();
  },
  async saveProfile() {
    const name = document.getElementById('prof-name')?.value || '';
    const email = document.getElementById('prof-email')?.value || '';
    const emailEnabled = Boolean(document.getElementById('prof-notif-email')?.checked);
    const pushEnabled = Boolean(document.getElementById('prof-notif-push')?.checked);
    const remEnabled = Boolean(document.getElementById('prof-notif-rem')?.checked);
    await dispatchAction('UPDATE_USER_PREFS', {
      user_id: state.currentUserId,
      name,
      email,
      notifications: { email_enabled: emailEnabled, web_push_enabled: pushEnabled, deadline_reminders_enabled: remEnabled }
    }, 'Profil gespeichert.');
    state.mainView = 'ROUND';
    render();
  },
  async anonymizeAccount() {
    await dispatchAction('DELETE_USER_ACCOUNT', { user_id: state.currentUserId }, 'Account anonymisiert.');
    state.mainView = 'ROUND';
    render();
  },
  toggleRoundEditor() {
    state.roundEditorOpen = !state.roundEditorOpen;
    render();
  },
  async saveRoundDetails(roundId) {
    const title = (document.getElementById('edit-round-title')?.value || '').trim();
    const description = (document.getElementById('edit-round-desc')?.value || '').trim();
    if (!title) return showToast('Bitte gib einen Titel ein.');
    const res = await dispatchAction('HOST_UPDATE_ROUND', {
      league_id: state.currentLeagueId,
      round_id: roundId,
      title,
      description
    }, 'Runden-Motto aktualisiert.');
    if (res) {
      state.roundEditorOpen = false;
      render();
    }
  },
  async promoteIdeaToNextRound(ideaId) {
    if (!confirm('Diese Motto-Idee als nächste offizielle Runde anlegen?')) return;
    const res = await dispatchAction('PROMOTE_IDEA_TO_ROUND', {
      league_id: state.currentLeagueId,
      idea_id: ideaId
    }, 'Neue Runde aus Idee erstellt.');
    if (res) {
      render();
    }
  },
  async createNewRoundPrompt() {
    const title = prompt('Titel / Motto für die neue Runde:');
    if (!title || !title.trim()) return;
    const desc = prompt('Beschreibung oder Thema (optional):', '') || '';
    const res = await dispatchAction('HOST_CREATE_ROUND', {
      league_id: state.currentLeagueId,
      title: title.trim(),
      description: desc.trim(),
      start_immediately: false
    }, 'Neue Runde angelegt.');
    if (res) {
      render();
    }
  },
  async resetToCleanSeason() {
    if (!confirm('Möchtest du wirklich alle Testdaten löschen und Saison 1 mit einer leeren Runde 1 starten?')) return;
    const res = await dispatchAction('HOST_RESET_TO_CLEAN_SEASON', { user_id: state.currentUserId }, 'Saison 1 wurde auf Anfang zurückgesetzt.');
    if (res) {
      state.currentRoundId = 'round_01';
      state.currentUserId = 'user_1';
      state.mainView = 'ROUND';
      state.menuOpen = false;
      syncLocalFormsFromDb();
      render();
    }
  }
};

fetchInitialState();
