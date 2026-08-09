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
const adminPoolRoutes = require('./adminPools');
const scoreRoutes = require('./scores');
const adminScoreRoutes = require('./adminScores');
const controlCenterRoutes = require('./controlCenter');
const leaderboardRoutes = require('./leaderboard');
const playerPoolRoutes = require('./playerPools');
const { UPLOAD_DIR } = require('./uploadConfig');
const { errorHandler } = require('./errorHandler');

const app = express();

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
    res.json({ name: 'Disc Golf Scoring System API', status: 'running' });
});

app.use('/uploads', express.static(UPLOAD_DIR));

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

app.get('/admin-event', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-event.html'));
});

app.get('/control-center', (req, res) => {
    res.sendFile(path.join(__dirname, 'control-center.html'));
});

app.use('/api/health', healthRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/admin/events', adminEventRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/admin/registrations', adminRegistrationRoutes);
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
