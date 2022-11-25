require('dotenv').config()
const {Client, WebhookClient, EmbedBuilder, Events, GatewayIntentBits} = require("discord.js");
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const hqSocket = require('./lib/socket');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session')
const pgStore = new (require('connect-pg-simple')(session))();
const path = require('path');
const helmet = require('helmet');
const PORT = process.env.PORT || 5000
const url = require('url');
const cookie = require('cookie');
const cookieParser = require('cookie-parser');
const express = require('express')
const app = express()
const server = require('http').createServer();
const passport = require('passport');
var DiscordStrategy = require('passport-discord').Strategy;
var gwebhook;
var socket_url;
 
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.WEB_URL + '/auth/discord/callback',
    scope: 'identify',
    passReqToCallback: true
}, function(req, accessToken, refreshToken, profile, cb) {
  fetch(process.env.DISCORD_URL+profile.id, {
      headers: { 'Authorization': process.env.DISCORD_AUTH }
  })
  .then(res => res.json())
  .then(json => {
    var err = null;
    if (json.code === 10007) {
      err = {};
      err.message = "You lost or something...";
      err.status = 401;
    } else {
      json.roles.forEach(function(role) {
        if (role === process.env.TRIAL_MEMBER_ROLE) {
          err = {};
          err.message = "Sorry, Trial Members do not have access..."
          err.status = 401;
        }
      });
    }
    return cb(err, profile);
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  done(null, id);
});

// add & configure middleware
app.use(session({
  genid: (req) => {
    return uuidv4() // use UUIDs for session IDs
  },
  store: pgStore,
  secret: 'mysecretsecret',
  resave: false,
  saveUninitialized: true,
  name: 'id',
  cookie: { httpOnly: true, secure: process.env.SSL == "true" || false,  maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.session());
app.use(helmet.hidePoweredBy());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function isAuth(req, res, next) {
  if (req.isAuthenticated())
      return next();
  res.redirect('/login');
}

app.set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', isAuth, (req, res) => {
    res.redirect('/member/home');
  }).get('/member/home', isAuth, (req, res) => {
    res.render('pages/member/home');
  });

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/login'
}), function(req, res) {
    res.redirect('/member/home') // Successful auth
});


// create the login get and post routes
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect('/member/home');
    return;
  }
  res.render('pages/login')
})

app.get('/member/checkHQ', (req, res) => {
  fetch(process.env.CHECK_URL)
    .then(res => res.json())
    .then(json => {
      if (json.broadcast && json.broadcast.socketUrl) {
        socket_url = json.broadcast.socketUrl;
        console.log("Fonund socket url");
        res.json({
          active: true,
          socketUrl: process.env.WEB_URL.replace(/^http/, 'ws') + "/hq"
        });

        return;
      } else {
        socket_url = null;
        res.json({
          active: false
        });
        
        return;
      }
    });
});

app.get('/member/testBroadcast', (req, res) => {
  var data = {
      "type": "Q",
      "question": "test question",
      "questionNumber": "1",
      "answers": [
          {
              "text": "one"
          },
          {
              "text": "two"
          },
          {
              "text": "three"
          }
      ]
  };
  hqSocket.broadcast(data);
  res.json({
    tested: true
  });
  return;
});

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});
client.login(process.env.DISCORD_TOKEN);

server.on('upgrade', function upgrade(request, socket, head) {

  const pathname = url.parse(request.url).pathname;
 
  var cookies=cookie.parse(request.headers.cookie);
  var sid=cookieParser.signedCookie(cookies["id"],"mysecretsecret");
  request.sid = sid;

  if (request.headers.origin != process.env.WEB_URL) {
    socket.destroy();
    JRdb.logError((new Date()) + ' Connection from origin ' + request.headers.origin + ' rejected.');
    return;
  }

  var socketToUse = null;
  if (pathname === '/hq') {
    socketToUse = hqSocket;
  } else {
    socket.destroy();
    return;
  }
  if (socketToUse.socket == undefined) {
    socketToUse.setHook(gwebhook);
    socketToUse.listen(socket_url);
  }
  socketToUse.socket.clients.forEach(function each(ws) {
    if (ws.sid === sid) {
      ws.terminate();
    }
  });

  socketToUse.socket.handleUpgrade(request, socket, head, function done(ws) {
    socketToUse.socket.emit('connection', ws, request);
  });
});

server.on('request', app);

setInterval(function(){hqSocket.ping();}, 3000);

server.listen(PORT, () => console.log(`Listening on ${ PORT }`))

client.once(Events.ClientReady, async () => {
  const channel = client.channels.cache.get(process.env.CHANNEL_ID);
  try {
    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.find(wh => wh.token);

    if (!webhook) {
      return console.log('No webhook was found that I can use!');
    }

    gwebhook = webhook;

  } catch (error) {
    console.error('Error trying to send a message: ', error);
  }
});