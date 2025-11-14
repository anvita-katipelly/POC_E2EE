# Connection Limits and Scalability Guide

## Default Connection Limits

### 1. Node.js HTTP Server
- **Default**: ~65,536 concurrent connections (theoretical max)
- **Practical**: ~10,000-50,000 depending on system resources
- **Bottleneck**: Memory per connection (~2-4KB per WebSocket connection)

### 2. Socket.IO Server
- **Default**: No hard limit (limited by system resources)
- **Recommended**: 10,000-100,000 concurrent connections per server
- **Memory**: ~2-4KB per connection (depends on message queue size)

### 3. System-Level Limits

#### Linux/Unix Systems
- **File Descriptors**: Default 1024 per process, can be increased to 1,000,000+
- **Port Range**: 65,536 ports (not a concern for single-port servers)
- **Memory**: Each connection uses ~2-4KB RAM

#### Windows
- **Max Connections**: Limited by available memory
- **File Handles**: Default 512, can be increased

## Current Configuration

The server currently has **no explicit connection limits** configured, which means:
- It will accept connections until system resources are exhausted
- Default Node.js limits apply (~65K theoretical)
- Memory is the primary constraint

## Optimizing for High Concurrency

### 1. Increase System Limits

#### Linux/Unix:
```bash
# Check current limits
ulimit -n

# Increase file descriptor limit (temporary)
ulimit -n 100000

# Permanent (add to /etc/security/limits.conf)
* soft nofile 100000
* hard nofile 100000
```

#### Systemd Service (if running as service):
```ini
[Service]
LimitNOFILE=100000
```

### 2. Configure Node.js Server

Update server configuration for high concurrency:

```javascript
// In src/server/index.js
const httpServer = http.createServer(app);

// Increase connection limits
httpServer.maxConnections = 100000; // Set max connections
httpServer.keepAliveTimeout = 65000; // 65 seconds
httpServer.headersTimeout = 66000; // 66 seconds
```

### 3. Configure Socket.IO

```javascript
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,      // 60 seconds
  pingInterval: 25000,     // 25 seconds
  maxHttpBufferSize: 1e8,  // 100MB max message size
  transports: ['websocket', 'polling'], // Use WebSocket first
  allowEIO3: true,
  // Connection limits
  connectTimeout: 45000,
  // Per-socket limits
  perMessageDeflate: false, // Disable compression for performance
});
```

### 4. Memory Management

For 10,000 concurrent connections:
- **Memory Usage**: ~20-40MB (just for connections)
- **With Messages**: ~100-500MB (depends on message queue)
- **Total Recommended**: 1-2GB RAM minimum

For 100,000 concurrent connections:
- **Memory Usage**: ~200-400MB (just for connections)
- **With Messages**: ~1-5GB (depends on message queue)
- **Total Recommended**: 8-16GB RAM minimum

## Practical Limits by Machine Size

### Small Machine (2 CPU, 4GB RAM)
- **Recommended**: 1,000-5,000 concurrent connections
- **Max**: ~10,000 connections

### Medium Machine (4 CPU, 8GB RAM)
- **Recommended**: 10,000-25,000 concurrent connections
- **Max**: ~50,000 connections

### Large Machine (8+ CPU, 16GB+ RAM)
- **Recommended**: 50,000-100,000 concurrent connections
- **Max**: ~200,000+ connections (with proper tuning)

### Enterprise Machine (16+ CPU, 32GB+ RAM)
- **Recommended**: 100,000-500,000 concurrent connections
- **Max**: 1,000,000+ connections (with clustering)

## Scaling Strategies

### 1. Single Server Optimization
- Increase file descriptor limits
- Optimize Socket.IO configuration
- Use connection pooling
- Implement message rate limiting

### 2. Horizontal Scaling (Multiple Servers)
- Use load balancer (nginx, HAProxy)
- Implement Redis adapter for Socket.IO
- Use sticky sessions or Redis pub/sub
- Distribute connections across servers

### 3. Vertical Scaling (Bigger Machine)
- More CPU cores
- More RAM
- Faster network
- SSD storage

## Monitoring Connection Count

Add connection monitoring to track usage:

```javascript
// In websocketService.js
let connectionCount = 0;

io.on('connection', (socket) => {
  connectionCount++;
  console.log(`Active connections: ${connectionCount}`);
  
  socket.on('disconnect', () => {
    connectionCount--;
    console.log(`Active connections: ${connectionCount}`);
  });
});
```

## Best Practices

1. **Set Connection Limits**: Prevent resource exhaustion
2. **Monitor Memory**: Watch for memory leaks
3. **Implement Rate Limiting**: Prevent abuse
4. **Use Connection Timeouts**: Clean up idle connections
5. **Implement Health Checks**: Monitor server health
6. **Use Clustering**: Scale across multiple processes
7. **Implement Redis**: For multi-server deployments

## Testing Connection Limits

```bash
# Install artillery for load testing
npm install -g artillery

# Create test script
# Then run: artillery quick --count 10000 --num 1 ws://localhost:3000
```

## Recommended Configuration for Production

For a large machine (16GB+ RAM, 8+ CPU cores):
- **Max Connections**: 100,000-200,000
- **File Descriptors**: 200,000+
- **Memory**: 4-8GB allocated to Node.js
- **CPU**: Use clustering (1 process per CPU core)

