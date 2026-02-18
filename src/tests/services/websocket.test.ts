/**
 * WebSocket Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketService } from '../../services/websocket';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/tauri', () => ({
    invoke: vi.fn().mockResolvedValue(undefined),
}));

// Mock WebSocket
class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    url: string;
    onopen: any;
    onmessage: any;
    onerror: any;
    onclose: any;
    readyState: number = 0; // CONNECTING

    constructor(url: string) {
        this.url = url;
        this.readyState = 0;
        // Simulate async connection
        setTimeout(() => {
            this.readyState = 1; // OPEN
            if (this.onopen) this.onopen();
        }, 5);
    }

    send(data: string) {
        // Mock send
    }

    close() {
        this.readyState = 3; // CLOSED
        if (this.onclose) this.onclose({ code: 1000, reason: 'Normal Closure' });
    }
}

// @ts-ignore
global.WebSocket = MockWebSocket;

describe('WebSocketService', () => {
    let service: WebSocketService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new WebSocketService('ws://localhost:9999');
    });

    it('should connect to websocket', async () => {
        const connectPromise = service.connect('user-1', 'store-1');
        await expect(connectPromise).resolves.toBeUndefined();

        expect(service.isConnected()).toBe(true);
        expect(service.getStatus()).toBe('connected');
    });

    it('should broadcast messages to listeners', async () => {
        const callback = vi.fn();
        service.on('PRODUCT_UPDATED', callback);

        await service.connect('user-1', 'store-1');

        // Simulate incoming message
        const ws = (service as any).ws;
        expect(ws).toBeDefined();

        ws.onmessage({
            data: JSON.stringify({
                type: 'PRODUCT_UPDATED',
                data: { id: 1, name: 'Test Product' },
                timestamp: new Date().toISOString()
            })
        });

        expect(callback).toHaveBeenCalledWith({ id: 1, name: 'Test Product' });
    });

    it('should send messages when connected', async () => {
        await service.connect('user-1', 'store-1');

        const ws = (service as any).ws;
        const sendSpy = vi.spyOn(ws, 'send');

        service.send('STOCK_CHANGED', { productId: 123, newStock: 10 });

        expect(sendSpy).toHaveBeenCalled();
        const sentData = JSON.parse(sendSpy.mock.calls[0][0] as string);
        expect(sentData.type).toBe('STOCK_CHANGED');
        expect(sentData.data.productId).toBe(123);
    });

    it('should handle disconnection and status correctly', async () => {
        await service.connect('user-1', 'store-1');

        expect(service.getStatus()).toBe('connected');

        service.disconnect();
        expect(service.getStatus()).toBe('disconnected');
        expect(service.isConnected()).toBe(false);
        expect((service as any).ws).toBeNull();
    });
});

