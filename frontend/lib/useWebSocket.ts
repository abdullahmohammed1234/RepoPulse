/**
 * WebSocket Hook for Real-time Updates
 * Provides reactive WebSocket connection for live dashboard updates
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  data: Record<string, unknown>;
}

interface UseWebSocketOptions {
  repositoryId?: number;
  eventTypes?: string[];
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onWebhookEvent?: (event: WebSocketMessage) => void;
  onAnalysisRequest?: (data: Record<string, unknown>) => void;
  onNotification?: (notification: { title: string; message: string; type: string }) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  sessionId: string | null;
  lastMessage: WebSocketMessage | null;
  subscribe: (repositoryId: number, eventTypes?: string[]) => void;
  unsubscribe: () => void;
  sendHeartbeat: () => void;
  subscriberCount: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    repositoryId,
    eventTypes = ['*'],
    onConnect,
    onDisconnect,
    onError,
    onWebhookEvent,
    onAnalysisRequest,
    onNotification,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const getWebSocketUrl = useCallback(() => {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${typeof window !== 'undefined' ? window.location.host : 'localhost:3001'}`;
    return `${host}/ws`;
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      setLastMessage(message);

      switch (message.type) {
        case 'connected':
          setSessionId(String(message.data.sessionId));
          setIsConnected(true);
          reconnectCountRef.current = 0;
          onConnect?.();
          
          // Subscribe to repository if provided
          if (repositoryId) {
            sendMessage({
              type: 'subscribe',
              data: { repositoryId, eventTypes }
            });
          }
          break;

        case 'subscribed':
          console.log('Subscribed to:', message.data);
          break;

        case 'unsubscribed':
          console.log('Unsubscribed');
          break;

        case 'heartbeat_ack':
          // Heartbeat acknowledged
          break;

        case 'webhook_event':
          onWebhookEvent?.(message);
          break;

        case 'analysis_request':
          onAnalysisRequest?.(message.data);
          break;

        case 'notification':
          onNotification?.({
            title: String(message.data.title),
            message: String(message.data.message),
            type: String(message.data.notificationType)
          });
          break;

        case 'error':
          console.error('WebSocket error:', message.data.message);
          break;

        case 'initial_state':
          setSessionId(String(message.data.sessionId));
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [
    repositoryId, 
    eventTypes, 
    onConnect, 
    onWebhookEvent, 
    onAnalysisRequest, 
    onNotification,
    sendMessage
  ]);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = getWebSocketUrl();
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = handleMessage;

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      onDisconnect?.();

      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Attempt reconnection
      if (reconnectCountRef.current < maxReconnectAttempts) {
        reconnectCountRef.current++;
        console.log(`Reconnecting... (${reconnectCountRef.current}/${maxReconnectAttempts})`);
        setTimeout(connect, reconnectInterval);
      }
    };

    wsRef.current = ws;
  }, [
    getWebSocketUrl, 
    handleMessage, 
    onDisconnect, 
    onError, 
    reconnectInterval, 
    maxReconnectAttempts
  ]);

  const subscribe = useCallback((repoId: number, types?: string[]) => {
    sendMessage({
      type: 'subscribe',
      data: { 
        repositoryId: repoId, 
        eventTypes: types || eventTypes 
      }
    });
  }, [eventTypes, sendMessage]);

  const unsubscribe = useCallback(() => {
    sendMessage({ type: 'unsubscribe', data: {} });
  }, [sendMessage]);

  const sendHeartbeat = useCallback(() => {
    sendMessage({ type: 'heartbeat', data: {} });
  }, [sendMessage]);

  // Connect on mount
  useEffect(() => {
    connect();

    // Set up heartbeat
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendHeartbeat();
      }
    }, 25000);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [connect, sendHeartbeat]);

  // Re-subscribe when repositoryId changes
  useEffect(() => {
    if (isConnected && repositoryId) {
      subscribe(repositoryId, eventTypes);
    }
  }, [isConnected, repositoryId, eventTypes, subscribe]);

  return {
    isConnected,
    sessionId,
    lastMessage,
    subscribe,
    unsubscribe,
    sendHeartbeat,
    subscriberCount
  };
}

/**
 * Hook for managing real-time repository events
 */
export function useRealtimeRepository(repositoryId: number | null) {
  const [events, setEvents] = useState<WebSocketMessage[]>([]);
  const [isLive, setIsLive] = useState(false);

  const handleWebhookEvent = useCallback((event: WebSocketMessage) => {
    if (event.type === 'webhook_event') {
      setEvents(prev => [event, ...prev].slice(0, 50)); // Keep last 50 events
      setIsLive(true);
    }
  }, []);

  const handleConnect = useCallback(() => {
    setIsLive(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsLive(false);
  }, []);

  const { isConnected, sessionId, subscribe, unsubscribe } = useWebSocket({
    repositoryId: repositoryId || undefined,
    onWebhookEvent: handleWebhookEvent,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect
  });

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    isConnected,
    isLive,
    sessionId,
    events,
    subscribe,
    unsubscribe,
    clearEvents
  };
}

/**
 * Hook for receiving analysis request notifications
 */
export function useAnalysisRequests(onAnalysisRequest: (data: Record<string, unknown>) => void) {
  const { lastMessage, isConnected } = useWebSocket({
    onAnalysisRequest
  });

  return {
    isConnected,
    lastAnalysisRequest: lastMessage?.type === 'analysis_request' ? lastMessage.data : null
  };
}
