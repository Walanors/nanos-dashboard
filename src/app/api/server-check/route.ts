import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // This is a simple endpoint that doesn't require authentication
    // It can be used to check if the server is running correctly
    
    return NextResponse.json(
      { 
        status: 'ok',
        clientTimestamp: Date.now(),
        nextJsEndpoint: true,
        socketIoHint: 'Make sure socket.io server is running on the same port'
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error', 
        message: (error as Error).message 
      },
      { status: 500 }
    );
  }
} 