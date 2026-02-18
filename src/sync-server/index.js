/**
 * ExRetailOS Sync Server
 * Merkez senkronizasyon sunucusu
 * Kasalardan gelen bağlantıları yönetir ve veri gönderir/alır
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Store connections map: storeId -> Set of WebSocket connections
const storeConnections = new Map();
// Device info map: deviceId -> { storeId, ws, deviceInfo }
const deviceMap = new Map();
// Broadcast queue: messageId -> broadcast info
const broadcastQueue = new Map();

// WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws' });

// ========================================
// WebSocket Connection Handler
// ========================================

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const storeId = url.pathname.split('/').pop(); // /ws/{storeId}

  if (!storeId || storeId === 'ws') {
    ws.close(1008, 'Store ID required');
    return;
  }

  console.log(`ğŸ”Œ New connection attempt from store: ${storeId}`);
  let deviceId = null;
  let isRegistered = false;

  // Add to store connections
  if (!storeConnections.has(storeId)) {
    storeConnections.set(storeId, new Set());
  }
  storeConnections.get(storeId).add(ws);

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, storeId, message);
    } catch (error) {
      console.error('❌ Message parse error:', error);
      sendError(ws, 'Invalid message format');
    }
  });

  // Handle connection close
  ws.on('close', () => {
    console.log(`❌ Connection closed for store: ${storeId}, device: ${deviceId || 'unknown'}`);

    if (deviceId) {
      deviceMap.delete(deviceId);
    }

    if (storeConnections.has(storeId)) {
      storeConnections.get(storeId).delete(ws);
      if (storeConnections.get(storeId).size === 0) {
        storeConnections.delete(storeId);
      }
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for store ${storeId}:`, error);
  });

  // Send welcome message
  sendMessage(ws, {
    type: 'Status',
    online_stores: storeConnections.size,
    pending_messages: broadcastQueue.size,
  });

  // Handle messages
  function handleMessage(ws, storeId, message) {
    switch (message.type) {
      case 'Register':
        handleRegister(ws, storeId, message);
        break;

      case 'Ping':
        handlePing(ws, message);
        break;

      case 'Acknowledge':
        handleAcknowledge(ws, message);
        break;

      case 'Response':
        handleResponse(ws, message);
        break;

      case 'Push':
        handlePush(ws, storeId, message);
        break;

      case 'Pull':
        handlePull(ws, storeId, message);
        break;

      default:
        console.warn('⚠️ Unknown message type:', message.type);
        sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  // Register device
  function handleRegister(ws, storeId, message) {
    deviceId = message.device_id || uuidv4();

    deviceMap.set(deviceId, {
      storeId,
      ws,
      deviceId,
      appVersion: message.app_version || '1.0.0',
      registeredAt: new Date(),
    });

    isRegistered = true;
    console.log(`✅ Device registered: ${deviceId} for store: ${storeId}`);

    sendMessage(ws, {
      type: 'Status',
      online_stores: storeConnections.size,
      pending_messages: broadcastQueue.size,
      registered: true,
      device_id: deviceId,
    });

    // Send pending broadcasts for this store
    sendPendingBroadcasts(storeId);
  }

  // Handle ping
  function handlePing(ws, message) {
    sendMessage(ws, {
      type: 'Pong',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle acknowledge
  function handleAcknowledge(ws, message) {
    const { message_id, success, error } = message;

    if (broadcastQueue.has(message_id)) {
      const broadcast = broadcastQueue.get(message_id);
      if (success) {
        broadcast.acknowledged = true;
        broadcast.acknowledgedAt = new Date();
        console.log(`✅ Broadcast acknowledged: ${message_id}`);
      } else {
        broadcast.error = error;
        console.error(`❌ Broadcast error: ${message_id} - ${error}`);
      }
    }
  }

  // Handle response (pull request response)
  function handleResponse(ws, message) {
    console.log(`📥 Response received for message: ${message.message_id}`);
    // Response handling can be extended here
  }

  // Handle push (data from store)
  function handlePush(ws, storeId, message) {
    console.log(`📤 Push received from store ${storeId}:`, message.table_name, message.action);
    // Push data can be stored/processed here
    // For now, just acknowledge
    sendMessage(ws, {
      type: 'Status',
      message: 'Push received',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle pull request
  function handlePull(ws, storeId, message) {
    console.log(`📥 Pull request from store ${storeId}:`, message.pull_type);
    // Pull data can be sent here
    // For now, send empty response
    sendMessage(ws, {
      type: 'Response',
      message_id: uuidv4(),
      data: {
        pull_type: message.pull_type,
        since: message.since,
        data: [],
      },
    });
  }
});

// ========================================
// Helper Functions
// ========================================

function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws, error) {
  sendMessage(ws, {
    type: 'Error',
    error: error,
    timestamp: new Date().toISOString(),
  });
}

function sendPendingBroadcasts(storeId) {
  // Send any pending broadcasts for this store
  for (const [messageId, broadcast] of broadcastQueue.entries()) {
    if (!broadcast.sent_to || !broadcast.sent_to.has(storeId)) {
      if (!broadcast.target_stores || broadcast.target_stores.includes(storeId)) {
        sendBroadcastToStore(storeId, broadcast);
      }
    }
  }
}

function sendBroadcastToStore(storeId, broadcast) {
  const connections = storeConnections.get(storeId);
  if (!connections || connections.size === 0) {
    console.warn(`⚠️ No connections for store: ${storeId}`);
    return false;
  }

  let sent = false;
  for (const ws of connections) {
    try {
      sendMessage(ws, {
        type: 'Broadcast',
        message_id: broadcast.message_id,
        message_type: broadcast.message_type,
        action: broadcast.action,
        payload: broadcast.payload,
      });

      if (!broadcast.sent_to) {
        broadcast.sent_to = new Set();
      }
      broadcast.sent_to.add(storeId);
      broadcast.sentAt = new Date();
      sent = true;
    } catch (error) {
      console.error(`❌ Failed to send broadcast to store ${storeId}:`, error);
    }
  }

  return sent;
}

// ========================================
// REST API Endpoints
// ========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    online_stores: storeConnections.size,
    online_devices: deviceMap.size,
    pending_broadcasts: broadcastQueue.size,
  });
});

// Get online stores
app.get('/api/stores', (req, res) => {
  const stores = Array.from(storeConnections.keys()).map(storeId => ({
    store_id: storeId,
    connections: storeConnections.get(storeId).size,
    devices: Array.from(deviceMap.values())
      .filter(d => d.storeId === storeId)
      .map(d => ({
        device_id: d.deviceId,
        app_version: d.appVersion,
        registered_at: d.registeredAt,
      })),
  }));

  res.json({
    success: true,
    stores,
    total_stores: stores.length,
  });
});

// Create broadcast (send data to stores)
app.post('/api/broadcast', (req, res) => {
  const {
    message_type, // 'product', 'price', 'campaign', 'customer', etc.
    action,       // 'insert', 'update', 'delete'
    payload,      // Data to send
    target_stores, // Optional: specific store IDs, null = all stores
    priority = 'normal', // 'high', 'normal', 'low'
  } = req.body;

  if (!message_type || !action || !payload) {
    return res.status(400).json({
      success: false,
      error: 'message_type, action, and payload are required',
    });
  }

  const messageId = uuidv4();
  const broadcast = {
    message_id: messageId,
    message_type,
    action,
    payload,
    target_stores: target_stores || null, // null = all stores
    priority,
    created_at: new Date(),
    sent_to: new Set(),
    acknowledged: false,
  };

  broadcastQueue.set(messageId, broadcast);

  // Send to target stores
  let sentCount = 0;
  if (target_stores && target_stores.length > 0) {
    // Send to specific stores
    for (const storeId of target_stores) {
      if (sendBroadcastToStore(storeId, broadcast)) {
        sentCount++;
      }
    }
  } else {
    // Send to all stores
    for (const storeId of storeConnections.keys()) {
      if (sendBroadcastToStore(storeId, broadcast)) {
        sentCount++;
      }
    }
  }

  console.log(`📨 Broadcast created: ${messageId} (${message_type}/${action}) sent to ${sentCount} stores`);

  res.json({
    success: true,
    message_id: messageId,
    sent_to: sentCount,
    total_stores: storeConnections.size,
    message: 'Broadcast created and sent',
  });
});

// Get broadcast status
app.get('/api/broadcast/:messageId', (req, res) => {
  const { messageId } = req.params;
  const broadcast = broadcastQueue.get(messageId);

  if (!broadcast) {
    return res.status(404).json({
      success: false,
      error: 'Broadcast not found',
    });
  }

  res.json({
    success: true,
    broadcast: {
      message_id: broadcast.message_id,
      message_type: broadcast.message_type,
      action: broadcast.action,
      priority: broadcast.priority,
      created_at: broadcast.created_at,
      sent_at: broadcast.sent_at,
      sent_to: Array.from(broadcast.sent_to || []),
      acknowledged: broadcast.acknowledged,
      acknowledged_at: broadcast.acknowledgedAt,
    },
  });
});

// Get store status
app.get('/api/stores/:storeId', (req, res) => {
  const { storeId } = req.params;
  const connections = storeConnections.get(storeId);

  if (!connections) {
    return res.status(404).json({
      success: false,
      error: 'Store not found or offline',
    });
  }

  const devices = Array.from(deviceMap.values())
    .filter(d => d.storeId === storeId);

  res.json({
    success: true,
    store: {
      store_id: storeId,
      online: true,
      connections: connections.size,
      devices: devices.map(d => ({
        device_id: d.deviceId,
        app_version: d.appVersion,
        registered_at: d.registeredAt,
      })),
    },
  });
});

// Cleanup old broadcasts (older than 24 hours)
setInterval(() => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let cleaned = 0;
  for (const [messageId, broadcast] of broadcastQueue.entries()) {
    if (broadcast.created_at < oneDayAgo) {
      broadcastQueue.delete(messageId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} old broadcasts`);
  }
}, 60 * 60 * 1000); // Every hour

// ========================================
// Server Start
// ========================================

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log('ğŸš€ ExRetailOS Sync Server başlatıldı');
  console.log(`📡 WebSocket: ws://localhost:${PORT}/ws/:storeId`);
  console.log(`ğŸŒ HTTP API: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⏹️  Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, wss };




