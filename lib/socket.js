const WebSocket = require('ws');

class SocketProxy {
  listen(url) {
    if (this._server) {
      return;
    }

    this._url = url;
    
    this.close();
    this._startServer();
    //this._connectAgain();
  }

  get socket() {
    return this._server;
  }

  _handleMessage(data) {
    data = JSON.parse(data);
    if (data.type === 'question') {
      this._broadcast(data);
    } else if (data.type === 'broadcastEnded') {
      if (data.reason && data.reason.includes('join again')) {
        setTimeout(() => this._connectAgain(), 0);
      } else {
        this.close();
      }
    }
  }

  broadcast(data) {
    if (this._server && this._server.clients) {
      if (data) {
        data.received = new Date().toISOString();
        data = JSON.stringify(data);
      }
      this._lastBroadcast = data;
      for (let conn of this._server.clients) {
        conn.send(data);
      }
    }
  }

  _connectAgain() {
    if (this._url) {
      this._client = new WebSocket(this._url.replace(/https?/, 'wss'), {
        headers: {
          authorization: 'Bearer ' + process.env.token
        }
      });
  
      this._client.on('message', data => this._handleMessage(data));
    }
  }


  _startServer() {
    this._server = new WebSocket.Server({
      noServer: true,
      clientTracking: true
    });

    const heartbeat = function heartbeat() {
      this.isAlive = true;
    }

    this._server.on('connection', function connection(ws, req) {
      ws.sid = req.sid;
      ws.isAlive = true;
      ws.on('pong', heartbeat);
      const ip = req.connection.remoteAddress;
      console.log("received connection: " + ip);
    });
  }

  close() {
    if (this._client) {
      this._client.terminate();
      this._client = null;
    }
    if (this._server) {
      this._server.close();
      this._server = null;
    }
  }
  
  ping() {
    if (this._server) {
      this._server.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
    
        ws.isAlive = false;
        ws.ping(function () {});
      });
    }
  }
}

module.exports = new SocketProxy();