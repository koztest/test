const WebSocket = require('ws');
const {EmbedBuilder} = require("discord.js");

class SocketProxy {
  listen(url) {
    if (this._server) {
      return;
    }

    this._url = url;
    this._previousQuestionNumber = 0;
    
    this.close();
    this._startServer();
    this._connectAgain();
  }

  setHook(hook) {
    this._hook = hook;
  }
  
  get socket() {
    return this._server;
  }

  _handleMessage(data) {
    data = JSON.parse(data);
    if (data.type === 'question') {
      this.broadcast(data);
      if (this._hook) {
        this._previousQuestionNumber = data.questionNumber;
        const embed = new EmbedBuilder()
        .setTitle('Q' + data.questionNumber + ' - ' + data.question)
        .setURL("https://google.com/search?q=" + encodeURIComponent(data.question))
        .setColor(0x36399A)
        .addFields(
          { name: "1. ", value: '['+data.answers[0].text+'](https://google.com/search?q=' + encodeURIComponent(data.answers[0].text) + ')', inline: false },
          { name: "2. ", value: '['+data.answers[1].text+'](https://google.com/search?q=' + encodeURIComponent(data.answers[1].text) + ')', inline: false },
          { name: "3. ", value: '['+data.answers[2].text+'](https://google.com/search?q=' + encodeURIComponent(data.answers[2].text) + ')', inline: false }
          );

          this._hook.send({
            embeds: [embed],
          });
      }
    } else if (data.type === 'questionSummary') {
      if (this._hook) {
        const embed = new EmbedBuilder()
        .setTitle('Question ' + this._previousQuestionNumber)
        .setColor(0x808080)
        .setDescription((data.answerCounts[0].correct ? ":white_check_mark:" : ":one:") + "  " + data.answerCounts[0].answer + " (" + data.answerCounts[0].count + ")\n" + (data.answerCounts[1].correct ? ":white_check_mark:" : ":two:") + "  " + data.answerCounts[1].answer + " (" + data.answerCounts[1].count + ")\n" + (data.answerCounts[2].correct ? ":white_check_mark:" : ":three:") + " " + data.answerCounts[2].answer + " (" + data.answerCounts[2].count + ")");

        this._hook.send({
          embeds: [embed],
        });
      }
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