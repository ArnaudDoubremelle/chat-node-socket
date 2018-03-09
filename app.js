require('colors');

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const requestIp = require('request-ip');
const redis = require('redis');
const client = redis.createClient();

function consoleLog(event, method, msg = undefined) {
    console.log(event.red + '.' + method.yellow + (msg !== undefined ? (' => ' + msg) : ''))
}

const s = {
    CONNECT: "connection",
    DISCONNECT: "disconnect",
    CHAT_JOIN: "chat.join",
    CHAT_DISCONNECT: "chat.disconnect",
    ROOMS_GETLIST: "rooms.getList",
    ROOMS_JOIN: "rooms.join",
    ROOMS_GETUSERS: "rooms.getUsers",
    ROOMS_NEWUSER: "rooms.newUser",
    ROOMS_GETMESSAGES: "rooms.getMessages",
    ROOMS_POSTMESSAGE: "rooms.postMessage",
};

app.use('/static', express.static('public'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html')
});

io.on(s.CONNECT, function (socket) {
    consoleLog('socket', 'connection', 'another user connected');

    socket.on(s.CHAT_JOIN, (username) => {
        // 1. Save username
        socket.username = username;
        socket.userIp = requestIp.getClientIp(socket.request);
        socket.room = "General";
        socket.status = "active";

        socket.join(socket.room);

        client.hmset(`users:${socket.username}`, ['username', socket.username, 'ip', socket.userIp]);

        client.hmset(`rooms:${socket.room}:users:${socket.username}`, ['username', socket.username, 'status', socket.status]);

        // 2. Broadcast username
        socket.to(socket.room).emit(s.CHAT_JOIN, {'username': socket.username});

        client.smembers("rooms", (err, res) => {
            socket.emit(s.ROOMS_GETLIST, res)
        });

        client.lrange(`rooms:${socket.room}:messages`, 0, 20, (err, res) => {
            socket.emit(s.ROOMS_GETMESSAGES, res.reverse().map(json => JSON.parse(json)));
        });
    });

    socket.on(s.ROOMS_JOIN, room => {
        socket.leave(socket.room, () => {
            consoleLog('rooms', 'join', `User ${socket.username} leave room "${socket.room}" and is joining room "${room}"`);

            client.del(`rooms:${socket.room}:users:${socket.username}`);

            socket.join(room, () => {
                socket.room = room;

                client.hmset(`rooms:${socket.room}:users:${socket.username}`, ['username', socket.username, 'status', socket.status]);

                socket.to(socket.room).emit(s.ROOMS_NEWUSER, socket.username);

                client.lrange(`rooms:${socket.room}:messages`, 0, 20, (err, res) => {
                    socket.emit(s.ROOMS_GETMESSAGES, res.reverse().map(json => JSON.parse(json)));
                });

                client.keys(`rooms:${socket.room}:users:*`, (err, userKeys) => {
                    for (let userKey of userKeys) {
                        client.hgetall(userKey, (err, user) => {
                            socket.emit(s.ROOMS_GETUSERS, user);
                        })
                    }
                });
            });
        });
    });

    socket.on(s.ROOMS_POSTMESSAGE, (message) => {
        client.lpush(`rooms:${socket.room}:messages`, JSON.stringify({
            'username': socket.username,
            'message': message
        }));

        io.in(socket.room).emit(s.ROOMS_GETMESSAGES, {'username': socket.username, 'message': message});
    });

    socket.on(s.DISCONNECT, function () {
        console.log('user disconnected');

        if (socket.username !== undefined) {
            socket.broadcast.emit(s.CHAT_DISCONNECT, {username: socket.username});
            client.del(`rooms:${socket.room}:users:${socket.username}`);
            client.del(`users:${socket.username}`);
        }
    })
});

http.listen(3000, () => console.log('Listening on ' + 'http://localhost:3000\n'.green));
