-- ============================================================================
-- DISC GOLF SCORING SYSTEM — DATABASE SCHEMA
-- Vastab Master Script v1.1 spetsifikatsioonile
-- PostgreSQL 14+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ABIFUNKTSIOON: updated_at automaatne uuendamine
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. ADMINS
-- Korraldajad. Eraldi ja tugevam autentimine kui mängijatel (punkt 44).
-- ============================================================================
CREATE TABLE admins (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'admin'
                        CHECK (role IN ('admin', 'super_admin')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_admins_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 2. PLAYERS
-- Mängija konto — üks kord loodud, jääb alles aastate lõikes (punkt 3).
-- ============================================================================
CREATE TABLE players (
    id                          SERIAL PRIMARY KEY,
    player_number               INTEGER NOT NULL UNIQUE, -- nähtav Player ID (nt 18472)
    first_name                  VARCHAR(100) NOT NULL,
    last_name                   VARCHAR(100) NOT NULL,
    pin_hash                    TEXT,                     -- NULL kui admin lisas mängija, kes pole veel kontot loonud (punkt E)
    pdga_number                 VARCHAR(20),
    country                     VARCHAR(100),
    email                       VARCHAR(255),
    phone                       VARCHAR(30),
    profile_image_url           TEXT,
    recovery_code_hash          TEXT,                     -- fallback PIN-taastamiseks kui email/telefon puudub
    wants_event_notifications   BOOLEAN NOT NULL DEFAULT TRUE,   -- konkreetse võistluse praktiline info
    wants_marketing_notifications BOOLEAN NOT NULL DEFAULT FALSE, -- tulevaste võistluste turundus
    is_claimed                  BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = admin lõi kirje, mängija pole veel kontot sidunud
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE player_number_seq START WITH 10000;

CREATE INDEX idx_players_name ON players (last_name, first_name);
CREATE INDEX idx_players_email ON players (email) WHERE email IS NOT NULL;
CREATE INDEX idx_players_phone ON players (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_players_pdga ON players (pdga_number) WHERE pdga_number IS NOT NULL;

CREATE TRIGGER trg_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. EVENTS
-- Iga võistlus oma brändingu, kuupäevade ja staatusega (punktid 12, 15, 48).
-- ============================================================================
CREATE TABLE events (
    id                      SERIAL PRIMARY KEY,
    name                    VARCHAR(255) NOT NULL,
    slug                    VARCHAR(255) NOT NULL UNIQUE, -- nt "tallinn-open-2027"
    location                VARCHAR(255),
    start_date              DATE NOT NULL,
    end_date                DATE NOT NULL,
    registration_start      TIMESTAMPTZ,
    registration_end        TIMESTAMPTZ,
    registration_limit      INTEGER,                       -- NULL = piiramatu
    logo_url                TEXT,
    branding_theme          JSONB NOT NULL DEFAULT '{}',    -- värvid, taust, sponsorid jms
    status                  VARCHAR(30) NOT NULL DEFAULT 'draft'
                                CHECK (status IN (
                                    'draft', 'registration_open', 'registration_closed',
                                    'live', 'finished', 'archived'
                                )),
    organizer_admin_id      INTEGER NOT NULL REFERENCES admins(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_dates ON events (start_date, end_date);

CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. DIVISIONS
-- MPO, FPO, MP40 jne (punkt 50). Iga event defineerib omad.
-- ============================================================================
CREATE TABLE divisions (
    id          SERIAL PRIMARY KEY,
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        VARCHAR(50) NOT NULL,          -- "MPO", "FPO", "MP40"
    sort_order  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (event_id, name)
);

-- ============================================================================
-- 5. PARKS / SECTORS
-- Rajad grupeeritud parkidesse, igaühel oma statistika (punktid 34-37, 51).
-- ============================================================================
CREATE TABLE parks (
    id          SERIAL PRIMARY KEY,
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,         -- "Anne kanal"
    color       VARCHAR(20),                   -- UI värv, nt "#0F5C4A"
    icon        VARCHAR(50),
    sponsor     VARCHAR(255),
    sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- 6. ROUNDS
-- Võistluse ringid (R1, R2, ...).
-- ============================================================================
CREATE TABLE rounds (
    id              SERIAL PRIMARY KEY,
    event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    round_number    INTEGER NOT NULL,
    name            VARCHAR(50),                -- "Round 1" — vaikimisi genereeritav
    round_date      DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'not_started'
                        CHECK (status IN ('not_started', 'live', 'finished')),
    UNIQUE (event_id, round_number)
);

-- ============================================================================
-- 7. HOLES
-- Rajad kuuluvad ringi (erinevad ringid võivad kasutada erinevat rada/par-i).
-- ============================================================================
CREATE TABLE holes (
    id              SERIAL PRIMARY KEY,
    round_id        INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    park_id         INTEGER REFERENCES parks(id),
    hole_number     INTEGER NOT NULL,           -- 1..27, 1..47 jne
    par             INTEGER NOT NULL DEFAULT 3,
    length_meters   INTEGER,
    sort_order      INTEGER NOT NULL,
    UNIQUE (round_id, hole_number)
);

CREATE INDEX idx_holes_park ON holes (park_id);

-- ============================================================================
-- 8. REGISTRATIONS
-- Mängija registreerimine konkreetsele võistlusele + divisjonile (punktid 13, 66C).
-- ============================================================================
CREATE TABLE registrations (
    id              SERIAL PRIMARY KEY,
    event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    player_id       INTEGER NOT NULL REFERENCES players(id),
    division_id     INTEGER NOT NULL REFERENCES divisions(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'registered'
                        CHECK (status IN (
                            'registered', 'confirmed', 'waitlist',
                            'dns', 'dnf', 'removed'
                        )),
    pin_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,  -- registreerimine PIN-iga kinnitatud (punkt 13)
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at    TIMESTAMPTZ,                      -- kui admin näeb makset ja kinnitab
    confirmed_by_admin_id INTEGER REFERENCES admins(id),
    UNIQUE (event_id, player_id)
);

CREATE INDEX idx_registrations_event_status ON registrations (event_id, status);
CREATE INDEX idx_registrations_player ON registrations (player_id);

-- ============================================================================
-- 9. POOLS (GROUPS)
-- Stardigrupid (punktid 54-55).
-- ============================================================================
CREATE TABLE pools (
    id              SERIAL PRIMARY KEY,
    round_id        INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    division_id     INTEGER REFERENCES divisions(id),
    pool_number     INTEGER NOT NULL,
    start_time      TIME,
    start_hole      INTEGER NOT NULL DEFAULT 1,
    -- topelt- vs ühekordne märkimine selle grupi jaoks (Ralfi otsus)
    require_double_verification BOOLEAN NOT NULL DEFAULT FALSE,
    status          VARCHAR(20) NOT NULL DEFAULT 'not_started'
                        CHECK (status IN ('not_started', 'playing', 'finished')),
    UNIQUE (round_id, pool_number)
);

CREATE TABLE pool_players (
    id              SERIAL PRIMARY KEY,
    pool_id         INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    registration_id INTEGER NOT NULL REFERENCES registrations(id),
    UNIQUE (pool_id, registration_id)
);

-- ============================================================================
-- 10. SCORE ENTRIES (raw log — iga sisestuskatse, ka need mis matchivad)
-- Miski siin EI KUSTU kunagi. See on täielik ajalugu (punkt 28).
-- ============================================================================
CREATE TABLE score_entries (
    id                  SERIAL PRIMARY KEY,
    round_id            INTEGER NOT NULL REFERENCES rounds(id),
    hole_id             INTEGER NOT NULL REFERENCES holes(id),
    player_id           INTEGER NOT NULL REFERENCES players(id),      -- kelle tulemus
    entered_by_player_id INTEGER NOT NULL REFERENCES players(id),     -- kes sisestas
    strokes             INTEGER NOT NULL CHECK (strokes >= 1),
    matched_existing     BOOLEAN NOT NULL DEFAULT FALSE,  -- kas ühtis olemasoleva ametliku tulemusega
    caused_conflict       BOOLEAN NOT NULL DEFAULT FALSE, -- kas tekitas konflikti
    entered_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_score_entries_lookup ON score_entries (round_id, hole_id, player_id);

-- ============================================================================
-- 11. OFFICIAL SCORES
-- Üks ametlik tulemus mängija+ringi+raja kohta (punktid 23-26).
-- Ei kirjutata KUNAGI vaikselt üle — ainult matching entry või admin muudab.
-- ============================================================================
CREATE TABLE official_scores (
    id                  SERIAL PRIMARY KEY,
    round_id            INTEGER NOT NULL REFERENCES rounds(id),
    hole_id             INTEGER NOT NULL REFERENCES holes(id),
    player_id           INTEGER NOT NULL REFERENCES players(id),
    strokes             INTEGER NOT NULL CHECK (strokes >= 1),
    status              VARCHAR(20) NOT NULL DEFAULT 'normal'
                            CHECK (status IN ('normal', 'conflict')),
    last_entry_id       INTEGER REFERENCES score_entries(id),
    set_by_admin_id     INTEGER REFERENCES admins(id),  -- kui admin muutis käsitsi
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (round_id, hole_id, player_id)
);

CREATE INDEX idx_official_scores_round ON official_scores (round_id);
CREATE INDEX idx_official_scores_player ON official_scores (player_id);
CREATE INDEX idx_official_scores_conflict ON official_scores (status) WHERE status = 'conflict';

-- ============================================================================
-- 12. SCORE CONFLICTS
-- Kui sisestatud tulemus erineb olemasolevast (punktid 25-27).
-- ============================================================================
CREATE TABLE score_conflicts (
    id                      SERIAL PRIMARY KEY,
    round_id                INTEGER NOT NULL REFERENCES rounds(id),
    hole_id                 INTEGER NOT NULL REFERENCES holes(id),
    player_id               INTEGER NOT NULL REFERENCES players(id),
    existing_value          INTEGER NOT NULL,
    attempted_value         INTEGER NOT NULL,
    attempted_by_player_id  INTEGER NOT NULL REFERENCES players(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'resolved')),
    resolved_by_admin_id    INTEGER REFERENCES admins(id),
    resolution_value        INTEGER,
    resolution_reason       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at             TIMESTAMPTZ
);

CREATE INDEX idx_score_conflicts_open ON score_conflicts (status) WHERE status = 'open';

-- ============================================================================
-- 13. SCORE AUDIT LOG
-- Kõik muudatused (sh admini omad) täieliku ajaloo jaoks (punktid 28-29).
-- ============================================================================
CREATE TABLE score_audit_log (
    id              SERIAL PRIMARY KEY,
    round_id        INTEGER NOT NULL REFERENCES rounds(id),
    hole_id         INTEGER NOT NULL REFERENCES holes(id),
    player_id       INTEGER NOT NULL REFERENCES players(id),
    actor_type      VARCHAR(10) NOT NULL CHECK (actor_type IN ('player', 'admin')),
    actor_player_id INTEGER REFERENCES players(id),
    actor_admin_id  INTEGER REFERENCES admins(id),
    action          VARCHAR(30) NOT NULL,   -- 'entry', 'match', 'conflict', 'admin_change'
    old_value        INTEGER,
    new_value        INTEGER,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_score_audit_log_round ON score_audit_log (round_id, hole_id, player_id);

-- ============================================================================
-- VALMIS. Rakenduse äriloogika (score-matching, conflict-tuvastus,
-- automaatne player_number genereerimine) elab backend-koodis,
-- mitte andmebaasi trigger'ites — nii on lihtsam siluda ja loogikat muuta.
-- ============================================================================
