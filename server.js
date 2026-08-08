require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const healthRoutes = require('./routes/health');
const playerRoutes = require('./routes/players');
const adminRoutes = require('./routes/admin');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ name: 'Disc Golf Scoring System API', status: 'running' });
});

app.use('/api/health', healthRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/admin', adminRoutes);

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
