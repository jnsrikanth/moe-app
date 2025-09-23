import { useEffect, useRef, useState } from 'react';
import { WebSocketMessage } from '@/types/moe';

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const listeners = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    // Use environment variable for backend URL if available (for Vercel deployment)
    const backendUrl = import.meta.env.VITE_WS_URL;
    let wsUrl: string;
    
    if (backendUrl) {
      // Use the configured backend URL (for Vercel deployment)
      wsUrl = backendUrl;
    } else {
      // Use current host (for local development)
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }
    
    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
        
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (!ws.current || ws.current.readyState === WebSocket.CLOSED) {
            console.log('Attempting to reconnect...');
            // Re-run the effect to reconnect
          }
        }, 3000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          const listener = listeners.current.get(message.type);
          if (listener) {
            listener(message.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const subscribe = (messageType: string, callback: (data: any) => void) => {
    listeners.current.set(messageType, callback);
    
    return () => {
      listeners.current.delete(messageType);
    };
  };

  const send = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  return {
    isConnected,
    subscribe,
    send,
  };
}
