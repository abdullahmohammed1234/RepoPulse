/**
 * Realtime Service
 * WebSocket server for live dashboard updates
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const webhookService = require('./webhookService');

let wss = null;
const clients = new Map(); // sessionId -> { ws, repositoryId, userId, eventTypes, alive }

// Heartbeat interval
let heartbeatInterval = null;

/**
 * Initialize WebSocket server
 */
function initializeRealtimeServer(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });
  
  console.log('🔌 WebSocket server initialized on /ws');
  
  wss.on('connection', (ws, req) => {
    handleConnection(ws, req);
  });
  
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });
  
  // Start heartbeat interval
  startHeartbeat();
  
  // Set up webhook broadcast function
  webhookService.setBroadcastFunction(broadcastToRepository);
  
  return wss;
}

/**
 * Handle new WebSocket connection
 */
async function handleConnection(ws, req) {
  const sessionId = uuidv4();
  
  console.log(`📡 New WebSocket connection: ${sessionId}`);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    data: {
      sessionId,
      message: 'Connected to RepoPulse realtime server',
      timestamp: new Date().toISOString()
    }
  }));
  
  // Store client
  clients.set(sessionId, {
    ws,
    repositoryId: null,
    userId: null,
    eventTypes: ['*'],
    alive: true,
    connectedAt: new Date()
  });
  
  // Handle messages from client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleMessage(sessionId, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invalid message format' }
      }));
    }
  });
  
  // Handle pong (heartbeat response)
  ws.on('pong', () => {
    const client = clients.get(sessionId);
    if (client) {
      client.alive = true;
    }
  });
  
  // Handle disconnection
  ws.on('close', async () => {
    console.log(`📴 WebSocket disconnected: ${sessionId}`);
    await handleDisconnection(sessionId);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${sessionId}:`, error);
    handleDisconnection(sessionId);
  });
}

/**
 * Handle incoming messages
 */
async function handleMessage(sessionId, data) {
  const client = clients.get(sessionId);
  if (!client) return;
  
  switch (data.type) {
    case 'subscribe':
      await handleSubscribe(sessionId, data);
      break;
      
    case 'unsubscribe':
      await handleUnsubscribe(sessionId);
      break;
      
    case 'heartbeat':
      await webhookService.updateHeartbeat(sessionId);
      client.alive = true;
      wsSend(sessionId, {
        type: 'heartbeat_ack',
        data: { timestamp: new Date().toISOString() }
      });
      break;
      
    case 'ping':
      wsSend(sessionId, {
        type: 'pong',
        data: { timestamp: new Date().toISOString() }
      });
      break;
      
    default:
      console.log(`Unknown message type: ${data.type}`);
  }
}

/**
 * Handle subscription request
 */
async function handleSubscribe(sessionId, data) {
  const { repositoryId, eventTypes } = data;
  const client = clients.get(sessionId);
  
  if (!client) return;
  
  // Update client subscription
  client.repositoryId = repositoryId ? parseInt(repositoryId) : null;
  client.eventTypes = eventTypes || ['*'];
  
  // Register in database
  await webhookService.registerSubscription(
    sessionId,
    client.userId,
    client.repositoryId,
    client.eventTypes
  );
  
  // Send confirmation
  wsSend(sessionId, {
    type: 'subscribed',
    data: {
      repositoryId: client.repositoryId,
      eventTypes: client.eventTypes,
      timestamp: new Date().toISOString()
    }
  });
  
  console.log(`✅ Session ${sessionId} subscribed to repository ${repositoryId}`);
  
  // Send initial state
  wsSend(sessionId, {
    type: 'initial_state',
    data: {
      repositoryId: client.repositoryId,
      connectedAt: client.connectedAt.toISOString(),
      sessionId
    }
  });
}

/**
 * Handle unsubscription request
 */
async function handleUnsubscribe(sessionId) {
  const client = clients.get(sessionId);
  
  if (client) {
    client.repositoryId = null;
    client.eventTypes = [];
  }
  
  await webhookService.unregisterSubscription(sessionId);
  
  wsSend(sessionId, {
    type: 'unsubscribed',
    data: {
      timestamp: new Date().toISOString()
    }
  });
  
  console.log(`📭 Session ${sessionId} unsubscribed`);
}

/**
 * Handle disconnection
 */
async function handleDisconnection(sessionId) {
  const client = clients.get(sessionId);
  
  if (client) {
    await webhookService.unregisterSubscription(sessionId);
    clients.delete(sessionId);
  }
}

/**
 * Send message to specific client
 */
function wsSend(sessionId, message) {
  const client = clients.get(sessionId);
  
  if (client && client.ws && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

/**
 * Broadcast message to all clients subscribed to a repository
 */
function broadcastToRepository(repositoryId, event) {
  if (!wss) return;
  
  let recipientCount = 0;
  
  for (const [sessionId, client] of clients) {
    // Check if client should receive this event
    if (!shouldReceiveEvent(client, event)) continue;
    
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(event));
      recipientCount++;
    }
  }
  
  if (recipientCount > 0) {
    console.log(`📢 Broadcast ${event.type} to ${recipientCount} client(s)`);
  }
}

/**
 * Check if client should receive the event
 */
function shouldReceiveEvent(client, event) {
  // If client has no specific repository, receive all
  if (!client.repositoryId) return true;
  
  // If event has repositoryId, check match
  if (event.data && event.data.repositoryId !== undefined) {
    return event.data.repositoryId === client.repositoryId;
  }
  
  return true;
}

/**
 * Broadcast to all connected clients (admin broadcasts)
 */
function broadcastToAll(event) {
  if (!wss) return;
  
  for (const [sessionId, client] of clients) {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(event));
    }
  }
}

/**
 * Start heartbeat to keep connections alive
 */
function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    for (const [sessionId, client] of clients) {
      if (!client.alive) {
        // Connection is dead, terminate it
        console.log(`💀 Terminating dead connection: ${sessionId}`);
        client.ws.terminate();
        handleDisconnection(sessionId);
        continue;
      }
      
      // Reset alive flag
      client.alive = false;
      
      // Send ping
      if (client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Get connected clients info
 */
function getConnectedClients() {
  const info = [];
  
  for (const [sessionId, client] of clients) {
    info.push({
      sessionId,
      repositoryId: client.repositoryId,
      userId: client.userId,
      eventTypes: client.eventTypes,
      connectedAt: client.connectedAt,
      alive: client.alive
    });
  }
  
  return info;
}

/**
 * Get client count
 */
function getClientCount() {
  return clients.size;
}

/**
 * Get subscribers count for a repository
 */
function getSubscriberCount(repositoryId) {
  let count = 0;
  
  for (const [sessionId, client] of clients) {
    if (client.repositoryId === repositoryId || !client.repositoryId) {
      count++;
    }
  }
  
  return count;
}

/**
 * Send notification to all clients
 */
function sendNotification(title, message, type = 'info') {
  broadcastToAll({
    type: 'notification',
    data: {
      title,
      message,
      notificationType: type,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('🛑 Shutting down WebSocket server...');
  
  stopHeartbeat();
  
  // Close all connections
  for (const [sessionId, client] of clients) {
    if (client.ws) {
      client.ws.close(1001, 'Server shutting down');
    }
  }
  
  if (wss) {
    wss.close();
    wss = null;
  }
  
  console.log('✅ WebSocket server shut down');
}

module.exports = {
  initializeRealtimeServer,
  broadcastToRepository,
  broadcastToAll,
  getConnectedClients,
  getClientCount,
  getSubscriberCount,
  sendNotification,
  shutdown,
  wsSend
};
