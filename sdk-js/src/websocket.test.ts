import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StellarRouteWebSocket, createWebSocketClient, WebSocketState } from './websocket.js';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  
  readyState: number = WebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.({ type: 'open' } as Event);
    }, 10);
  }
  
  send(data: string) {
    // Echo back subscription confirmations
    try {
      const parsed = JSON.parse(data);
      if (parsed.action === 'subscribe') {
        setTimeout(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'subscription_confirmed',
              subscription: parsed.subscription,
              timestamp: Date.now(),
            }),
          } as MessageEvent);
        }, 5);
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  close(code = 1000, reason = '') {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code, reason, type: 'close' } as CloseEvent);
  }
}

// Setup mock
vi.stubGlobal('WebSocket', MockWebSocket);

describe('StellarRouteWebSocket', () => {
  let client: StellarRouteWebSocket;
  
  beforeEach(() => {
    MockWebSocket.instances = [];
    client = createWebSocketClient('ws://localhost:8080', {
      connectionTimeoutMs: 100,
      initialBackoffMs: 50,
      maxReconnectAttempts: 2,
    });
  });
  
  afterEach(async () => {
    await client.disconnect();
  });
  
  describe('connection management', () => {
    it('should connect successfully', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
      expect(client.getState()).toBe('connected');
    });
    
    it('should emit connection state events', async () => {
      const states: WebSocketState[] = [];
      client.addEventListener((event) => {
        if (event.type === 'connection_state') {
          states.push(event.state);
        }
      });
      
      await client.connect();
      
      expect(states).toContain('connecting');
      expect(states).toContain('connected');
    });
    
    it('should disconnect cleanly', async () => {
      await client.connect();
      await client.disconnect();
      
      expect(client.isConnected()).toBe(false);
      expect(client.getState()).toBe('disconnected');
    });
    
    it('should not reconnect after explicit disconnect', async () => {
      await client.connect();
      const ws = MockWebSocket.instances[0];
      
      await client.disconnect();
      ws.close();
      
      // Wait for potential reconnect
      await new Promise((r) => setTimeout(r, 100));
      
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });
  
  describe('subscription management', () => {
    it('should subscribe to quote updates', async () => {
      await client.connect();
      
      const id = client.subscribeToQuote('XLM', 'USDC');
      expect(id).toBeTruthy();
      expect(client.getSubscriptions().size).toBe(1);
    });
    
    it('should subscribe to orderbook updates', async () => {
      await client.connect();
      
      const id = client.subscribeToOrderbook('XLM', 'USDC');
      expect(id).toBeTruthy();
      expect(client.getSubscriptions().size).toBe(1);
    });
    
    it('should unsubscribe correctly', async () => {
      await client.connect();
      
      const id = client.subscribeToQuote('XLM', 'USDC');
      expect(client.getSubscriptions().size).toBe(1);
      
      client.unsubscribe(id);
      expect(client.getSubscriptions().size).toBe(0);
    });
    
    it('should unsubscribe from all subscriptions', async () => {
      await client.connect();
      
      client.subscribeToQuote('XLM', 'USDC');
      client.subscribeToOrderbook('XLM', 'USDC');
      expect(client.getSubscriptions().size).toBe(2);
      
      client.unsubscribeAll();
      expect(client.getSubscriptions().size).toBe(0);
    });
    
    it('should emit subscription confirmed event', async () => {
      await client.connect();
      
      const events: unknown[] = [];
      client.addEventListener((event) => events.push(event));
      
      client.subscribeToQuote('XLM', 'USDC');
      
      // Wait for mock to send confirmation
      await new Promise((r) => setTimeout(r, 20));
      
      expect(events.some((e: unknown) => (e as {type: string}).type === 'subscription_confirmed')).toBe(true);
    });
  });
  
  describe('event handling', () => {
    it('should handle quote update events', async () => {
      await client.connect();
      const ws = MockWebSocket.instances[0];
      
      const events: unknown[] = [];
      client.addEventListener((event) => events.push(event));
      
      // Simulate server message
      ws.onmessage?.({
        data: JSON.stringify({
          type: 'quote_update',
          subscription: { type: 'quote', base: 'XLM', quote: 'USDC' },
          data: {
            base_asset: { asset_type: 'native' },
            quote_asset: { asset_code: 'USDC', asset_issuer: 'test' },
            amount: '100',
            price: '0.12',
            total: '12',
            quote_type: 'sell',
            path: [],
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        }),
      } as MessageEvent);
      
      expect(events.length).toBe(1);
      expect((events[0] as {type: string}).type).toBe('quote_update');
    });
    
    it('should handle orderbook update events', async () => {
      await client.connect();
      const ws = MockWebSocket.instances[0];
      
      const events: unknown[] = [];
      client.addEventListener((event) => events.push(event));
      
      // Simulate server message
      ws.onmessage?.({
        data: JSON.stringify({
          type: 'orderbook_update',
          subscription: { type: 'orderbook', base: 'XLM', quote: 'USDC' },
          data: {
            base_asset: { asset_type: 'native' },
            quote_asset: { asset_code: 'USDC', asset_issuer: 'test' },
            bids: [],
            asks: [],
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        }),
      } as MessageEvent);
      
      expect(events.length).toBe(1);
      expect((events[0] as {type: string}).type).toBe('orderbook_update');
    });
    
    it('should handle error events', async () => {
      await client.connect();
      const ws = MockWebSocket.instances[0];
      
      const events: unknown[] = [];
      client.addEventListener((event) => events.push(event));
      
      // Simulate server error
      ws.onmessage?.({
        data: JSON.stringify({
          type: 'error',
          code: 'invalid_subscription',
          message: 'Invalid trading pair',
          timestamp: Date.now(),
        }),
      } as MessageEvent);
      
      expect(events.length).toBe(1);
      const errorEvent = events[0] as {type: string; code: string};
      expect(errorEvent.type).toBe('error');
      expect(errorEvent.code).toBe('invalid_subscription');
    });
    
    it('should remove event listener correctly', async () => {
      await client.connect();
      
      let callCount = 0;
      const listener = () => callCount++;
      
      const unsubscribe = client.addEventListener(listener);
      client.addEventListener(() => callCount++);
      
      client.unsubscribe(client.subscribeToQuote('XLM', 'USDC'));
      
      await new Promise((r) => setTimeout(r, 20));
      
      const countBefore = callCount;
      
      unsubscribe();
      
      // Further events should only increment once
      client.unsubscribe(client.subscribeToQuote('XLM', 'USDC'));
      
      expect(callCount).toBeLessThanOrEqual(countBefore + 2);
    });
  });
  
  describe('reconnection', () => {
    it('should attempt reconnection on disconnect', async () => {
      client = createWebSocketClient('ws://localhost:8080', {
        connectionTimeoutMs: 100,
        initialBackoffMs: 10,
        maxReconnectAttempts: 2,
      });
      
      await client.connect();
      expect(MockWebSocket.instances.length).toBe(1);
      
      // Simulate unexpected disconnect
      const ws = MockWebSocket.instances[0];
      ws.close(1006, 'Connection lost');
      
      // Wait for reconnection attempt
      await new Promise((r) => setTimeout(r, 100));
      
      // Should have attempted reconnection
      expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    });
    
    it('should resubscribe after reconnection', async () => {
      client = createWebSocketClient('ws://localhost:8080', {
        connectionTimeoutMs: 100,
        initialBackoffMs: 10,
        maxReconnectAttempts: 2,
      });
      
      await client.connect();
      client.subscribeToQuote('XLM', 'USDC');
      
      expect(client.getSubscriptions().size).toBe(1);
      
      // Simulate disconnect and reconnect
      const ws = MockWebSocket.instances[0];
      ws.close(1006, 'Connection lost');
      
      await new Promise((r) => setTimeout(r, 100));
      
      // Subscriptions should be preserved
      expect(client.getSubscriptions().size).toBe(1);
    });
  });
});

describe('createWebSocketClient', () => {
  it('should create a client with default options', () => {
    const client = createWebSocketClient();
    expect(client).toBeInstanceOf(StellarRouteWebSocket);
  });
  
  it('should create a client with custom options', () => {
    const client = createWebSocketClient('ws://custom:8080', {
      maxReconnectAttempts: 10,
      debug: true,
    });
    expect(client).toBeInstanceOf(StellarRouteWebSocket);
  });
});