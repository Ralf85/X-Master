require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const healthRoutes = require('./health');
const playerRoutes = require('./players');
const adminRoutes = require('./admin');
const eventRoutes = require('./events');
const adminEventRoutes = require('./adminEvents');
const registrationRoutes = require('./registrations');
const adminRegistrationRoutes = require('./adminRegistrations');
const adminPlayerRoutes = require('./adminPlayers');
const adminAnnouncementRoutes = require('./adminAnnouncements');
const announcementRoutes = require('./announcements');
const adminJokeRoutes = require('./adminJokes');
const jokeRoutes = require('./jokes');
const adminPoolRoutes = require('./adminPools');
const scoreRoutes = require('./scores');
const adminScoreRoutes = require('./adminScores');
const controlCenterRoutes = require('./controlCenter');
const leaderboardRoutes = require('./leaderboard');
const playerPoolRoutes = require('./playerPools');
const { errorHandler } = require('./errorHandler');

const app = express();

// Railway (ja enamik hostinguplatvorme) käivad proxy taga - ilma selleta
// ei tea Express, et ta võib usaldada X-Forwarded-For päist, mis omakorda
// lõhub express-rate-limit'i (viskab vea IGA päringu peale). "1" tähendab
// "usalda ühte proxy hüpet", mis vastab Railway seadistusele.
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'"],
            imgSrc: ["'self'", 'data:'],
        },
    },
}));
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'join.html'));
});

app.get('/join', (req, res) => {
    res.sendFile(path.join(__dirname, 'join.html'));
});

app.get('/api/status', (req, res) => {
    res.json({ name: 'Disc Golf Scoring System API', status: 'running' });
});

app.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

app.get('/scorecard', (req, res) => {
    res.sendFile(path.join(__dirname, 'scorecard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/event', (req, res) => {
    res.sendFile(path.join(__dirname, 'event.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-users', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-users.html'));
});

app.get('/admin-event', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-event.html'));
});

app.get('/control-center', (req, res) => {
    res.sendFile(path.join(__dirname, 'control-center.html'));
});

// Helifailid asuvad repo juurkaustas (mitte eraldi sounds/ alamkaustas) -
// serveeri need otse sealt, aga ainult need kuus konkreetset teadaolevat
// faili (mitte kogu juurkaust, see paljastaks ka .js lähtekoodi jms).
const SCORE_SOUND_FILES = ['1-holar.mp3', '2-birdie.mp3', '3-par.mp3', '4-bougy.mp3', '5-tupla.mp3', '6-oeh.mp3'];
app.get('/sounds/:filename', (req, res) => {
    if (!SCORE_SOUND_FILES.includes(req.params.filename)) {
        return res.status(404).json({ error: 'Helifaili ei leitud.' });
    }
    res.sendFile(path.join(__dirname, req.params.filename));
});

app.use('/api/health', healthRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/admin/events', adminEventRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/admin/registrations', adminRegistrationRoutes);
app.use('/api/admin/players', adminPlayerRoutes);
app.use('/api/admin/announcements', adminAnnouncementRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/admin/jokes', adminJokeRoutes);
app.use('/api/jokes', jokeRoutes);
app.use('/api/admin/pools', adminPoolRoutes);
app.use('/api/scorecard', scoreRoutes);
app.use('/api/admin/scores', adminScoreRoutes);
app.use('/api/admin/control-center', controlCenterRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/pools', playerPoolRoutes);

// 404 käsitleja - peab tulema pärast kõiki route'e
app.use((req, res) => {
    res.status(404).json({ error: 'Endpointi ei leitud.' });
});

// Errorihandler peab olema kõige viimane app.use()
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server töötab pordil ${PORT}`);
});
