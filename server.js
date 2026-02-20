/*
  =============================================
  ESP32 LED Control - Node.js WebSocket Server
  VPS da ishlatiladi (masalan DigitalOcean, Render, Railway)
  =============================================
  O'rnatish:
    npm install ws express
  Ishga tushirish:
    node server.js
  =============================================
*/

const express   = require('express');
const http      = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Static fayllar (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// ---- Ulanganlarni saqlash ----
let esp32Socket   = null;   // ESP32 ulanishi
const browsers    = new Set(); // Brauzer ulanishlari

// LED holatlari (server xotirasi)
const ledState = { red: false, blue: false };

// =============================================
// WebSocket ulanishlar
// =============================================
wss.on('connection', (ws, req) => {
  console.log('Yangi ulanish:', req.socket.remoteAddress);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }

    // ---- ESP32 o'zini tanishtiradi ----
    if (msg.type === 'register' && msg.device === 'esp32') {
      esp32Socket = ws;
      ws.role = 'esp32';
      console.log('✓ ESP32 ulandi!');

      // Hozirgi holatni ESP32 ga yuborish
      sendToESP32({ type: 'state', red: ledState.red, blue: ledState.blue });

      // Barcha brauzerlarga xabar
      broadcast({ type: 'esp32_connected', connected: true });
      return;
    }

    // ---- Brauzer o'zini tanishtiradi ----
    if (msg.type === 'register' && msg.device === 'browser') {
      browsers.add(ws);
      ws.role = 'browser';
      console.log('✓ Brauzer ulandi. Jami:', browsers.size);

      // Hozirgi holatni yuborish
      ws.send(JSON.stringify({
        type: 'state',
        red: ledState.red,
        blue: ledState.blue,
        esp32_connected: esp32Socket?.readyState === WebSocket.OPEN
      }));
      return;
    }

    // ---- Brauzerdan LED buyrug'i ----
    if (msg.type === 'led' && ws.role === 'browser') {
      const { color, action } = msg;
      if (!['red','blue'].includes(color)) return;
      if (!['on','off'].includes(action)) return;

      ledState[color] = (action === 'on');
      console.log(`LED ${color}: ${action.toUpperCase()}`);

      // ESP32 ga yuborish
      sendToESP32({ type: 'led', color, action });

      // Barcha brauzerlarga yangi holatni yuborish
      broadcast({ type: 'state', red: ledState.red, blue: ledState.blue });
    }

    // ---- ESP32 dan knopka bosildi xabari ----
    if (msg.type === 'button' && ws.role === 'esp32') {
      console.log('Knopka bosildi!');
      // Barcha brauzerlarga yuborish
      broadcast({ type: 'button', action: 'pressed' });
    }
  });

  ws.on('close', () => {
    if (ws.role === 'esp32') {
      esp32Socket = null;
      console.log('✗ ESP32 uzildi');
      broadcast({ type: 'esp32_connected', connected: false });
    }
    if (ws.role === 'browser') {
      browsers.delete(ws);
      console.log('✗ Brauzer uzildi. Qolgan:', browsers.size);
    }
  });

  ws.on('error', (e) => console.error('WS xato:', e.message));
});

// =============================================
// Yordamchi funksiyalar
// =============================================
function sendToESP32(data) {
  if (esp32Socket?.readyState === WebSocket.OPEN) {
    esp32Socket.send(JSON.stringify(data));
  } else {
    console.warn('ESP32 ulanmagan, buyruq yo\'qoldi:', data);
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of browsers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// =============================================
// Serverni ishga tushirish
// =============================================
server.listen(PORT, () => {
  console.log(`\n🚀 Server ishga tushdi: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});