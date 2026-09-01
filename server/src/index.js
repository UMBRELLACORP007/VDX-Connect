require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const turnRoutes = require('./routes/turn');
const { registerSocketHandlers } = require('./sockets');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/turn', turnRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
registerSocketHandlers(io);

const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => console.log(`VDX Connect signaling server on :${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
