'use client';

import { StableSocket, type Socket as StableSocketInstance } from '@github/stable-socket';

/**
 * A wrapper for StableSocket with additional utilities for better debugging
 * and connection management.
 */
export class StableSocketAdapter {
  private socket: StableSocket | null = null;
  private url: string;
  private onOpenCallbacks: Array<() => void> = [];
  private onCloseCallbacks: Array<(code?: number, reason?: string) => void> = [];
  private onErrorCallbacks: Array<(error: Error) => void> = [];
  private onMessageCallbacks: Array<(message: string) => void> = [];
  private reconnectCount = 0;
  private lastConnectAttempt: number | null = null;
  private _isConnected = false;
  private _isConnecting = false;
  private connectionError: Error | null = null;
  
  constructor(url: string) {
    this.url = url;
  }
  
  /**
   * Initialize the StableSocket with proper connection settings
   */
  public init(): void {
    if (this.socket) {
      this.close();
    }
    
    this._isConnecting = true;
    this.lastConnectAttempt = Date.now();
    
    try {
      // Create the socket delegate to handle events
      const socketDelegate = {
        socketDidOpen: (socket: StableSocketInstance) => {
          this._isConnected = true;
          this._isConnecting = false;
          this.connectionError = null;
          this.onOpenCallbacks.forEach(callback => callback());
        },
        socketDidClose: (socket: StableSocketInstance, code?: number, reason?: string) => {
          this._isConnected = false;
          this._isConnecting = true;
          this.onCloseCallbacks.forEach(callback => callback(code, reason));
        },
        socketDidFinish: (socket: StableSocketInstance) => {
          this._isConnected = false;
          this._isConnecting = false;
          this.onCloseCallbacks.forEach(callback => callback());
        },
        socketDidReceiveMessage: (socket: StableSocketInstance, message: string) => {
          this.onMessageCallbacks.forEach(callback => callback(message));
        },
        socketShouldRetry: (socket: StableSocketInstance, code: number) => {
          this.reconnectCount++;
          // Don't retry if it's a policy violation (1008) or a normal close (1000)
          return code !== 1008 && code !== 1000;
        }
      };
      
      // Connection policy
      const policy = {
        timeout: 10000,      // 10s connection timeout
        attempts: 10,        // Max 10 reconnect attempts
        maxDelay: 30000      // Max 30s between reconnect attempts
      };
      
      // Create the stable socket with the delegate and policy
      this.socket = new StableSocket(this.url, socketDelegate, policy);
      this.socket.open();
    } catch (error) {
      this._isConnecting = false;
      this.connectionError = error instanceof Error ? error : new Error('Unknown error creating StableSocket');
      this.onErrorCallbacks.forEach(callback => callback(this.connectionError as Error));
    }
  }
  
  /**
   * Open the socket connection
   */
  public open(): void {
    if (!this.socket) {
      this.init();
      return;
    }
    
    try {
      this._isConnecting = true;
      this.lastConnectAttempt = Date.now();
      this.socket.open();
    } catch (error) {
      this._isConnecting = false;
      this.connectionError = error instanceof Error ? error : new Error('Unknown error opening StableSocket');
      this.onErrorCallbacks.forEach(callback => callback(this.connectionError as Error));
    }
  }
  
  /**
   * Close the socket connection
   */
  public close(): void {
    if (!this.socket) return;
    
    try {
      this.socket.close();
      this._isConnected = false;
      this._isConnecting = false;
    } catch (error) {
      this.connectionError = error instanceof Error ? error : new Error('Unknown error closing StableSocket');
      this.onErrorCallbacks.forEach(callback => callback(this.connectionError as Error));
    }
  }
  
  /**
   * Send a message through the socket
   */
  public send(message: string): void {
    if (!this.socket) {
      this.connectionError = new Error('Cannot send: Socket not initialized');
      this.onErrorCallbacks.forEach(callback => callback(this.connectionError as Error));
      return;
    }
    
    try {
      this.socket.send(message);
    } catch (error) {
      this.connectionError = error instanceof Error ? error : new Error('Unknown error sending message');
      this.onErrorCallbacks.forEach(callback => callback(this.connectionError as Error));
    }
  }
  
  /**
   * Add an event listener for open events
   */
  public onOpen(callback: () => void): () => void {
    this.onOpenCallbacks.push(callback);
    return () => {
      this.onOpenCallbacks = this.onOpenCallbacks.filter(cb => cb !== callback);
    };
  }
  
  /**
   * Add an event listener for close events
   */
  public onClose(callback: (code?: number, reason?: string) => void): () => void {
    this.onCloseCallbacks.push(callback);
    return () => {
      this.onCloseCallbacks = this.onCloseCallbacks.filter(cb => cb !== callback);
    };
  }
  
  /**
   * Add an event listener for error events
   */
  public onError(callback: (error: Error) => void): () => void {
    this.onErrorCallbacks.push(callback);
    return () => {
      this.onErrorCallbacks = this.onErrorCallbacks.filter(cb => cb !== callback);
    };
  }
  
  /**
   * Add an event listener for message events
   */
  public onMessage(callback: (message: string) => void): () => void {
    this.onMessageCallbacks.push(callback);
    return () => {
      this.onMessageCallbacks = this.onMessageCallbacks.filter(cb => cb !== callback);
    };
  }
  
  /**
   * Get connection state
   */
  public get state() {
    return {
      connected: this._isConnected,
      connecting: this._isConnecting,
      error: this.connectionError ? this.connectionError.message : null,
      reconnectCount: this.reconnectCount,
      lastConnectAttempt: this.lastConnectAttempt
    };
  }
  
  /**
   * Check if the socket is connected
   */
  public get isConnected(): boolean {
    return this._isConnected;
  }
  
  /**
   * Check if the socket is connecting
   */
  public get isConnecting(): boolean {
    return this._isConnecting;
  }
  
  /**
   * Get the connection error
   */
  public get error(): string | null {
    return this.connectionError ? this.connectionError.message : null;
  }
} 