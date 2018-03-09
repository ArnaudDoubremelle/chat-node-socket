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

        client.hmset(`users:${socket.username}`, ['username', socket.username, 'ip', socket.userIp], (err, res) => {
            consoleLog('redis', 'lpush', `${socket.username} with IP ${socket.userIp} added to users list`);
        });

        consoleLog('chat', 'join', `${socket.username} has IP ${requestIp.getClientIp(socket.userIp)}`);

        client.lpush(`rooms:${socket.room}:users`, JSON.stringify({'username': socket.username, 'status': socket.status}));

        // 2. Broadcast username
        socket.to(socket.room).emit(s.CHAT_JOIN, {'username': socket.username});

        client.smembers("rooms", (err, res) => {
            socket.emit(s.ROOMS_GETLIST, res)
        });
    });

    socket.on(s.ROOMS_JOIN, room => {
        socket.leave(socket.room, () => {
            consoleLog('rooms','join', `User ${socket.username} leave room "${socket.room}" and is joining room "${room}"`);
            socket.join(room);
            socket.room = room;

            console.log(socket.room);

            socket.to(socket.room).emit(s.ROOM_NEWUSER, socket.username);

            client.lrange(`rooms:${socket.room}:messages`, 0, 20, (err, res) => {
                socket.emit(s.ROOMS_GETMESSAGES, res.map(json => JSON.parse(json)));
            });
        });
    });

    socket.on(s.ROOMS_POSTMESSAGE, (message) => {
        client.lpush(`rooms:${socket.room}:messages`, JSON.stringify({'username': socket.username, 'message': message}));

        io.in(socket.room).emit(s.ROOMS_GETMESSAGES, {'username': socket.username, 'message': message});
    });

    socket.on(s.DISCONNECT, function () {
        console.log('user disconnected');

        if (socket.username !== undefined) {
            socket.broadcast.emit(s.CHAT_DISCONNECT, {username: socket.username});
            client.hdel('users', socket.user);
        }
    })
});

http.listen(3000, () => console.log('Listening on ' + 'http://localhost:3000\n'.green));
