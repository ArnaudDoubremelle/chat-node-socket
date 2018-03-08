require('colors')

const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const requestIp = require('request-ip')
const redis = require('redis')
const client = redis.createClient()

function consoleLog(event, method, msg = undefined) {
    console.log(event.red + '.' + method.yellow + (msg !== undefined ? (' => ' + msg) : ''))
}

app.use('/static', express.static('public'));
app.get('/', function (req, res) { res.sendFile(__dirname + '/index.html') })

io.on('connection', function(socket){
    consoleLog('socket', 'connection', 'another user connected')

    socket.on('chat.join', (data) => {

        const json = JSON.parse(data)
        // 1. Save username
        socket.username = json.username
        socket.userIp = requestIp.getClientIp(socket.request)
        socket.channel = json.channel

        socket.join(socket.channel);

        client.sadd('users', JSON.stringify({'username': socket.username, 'ip': socket.userIp}), (err, res) => {
            consoleLog('redis', 'lpush', `${socket.username} has IP ${socket.userIp} to users list`)
        })

        consoleLog('chat', 'join', `${socket.username} has IP ${requestIp.getClientIp(socket.userIp)}`)
        // 2. Broadcast username
        socket.broadcast.to(socket.channel).emit('chat.join', JSON.stringify({'username': socket.username}))

        client.smembers("users", (err, res) => {
            for (let data of res) {
                socket.emit('chat.join', data)
                //consoleLog('redisx', 'lrange', data)
            }
        })

        client.lrange("messages:"+socket.channel, 0, 19, (err, res) => {
            for (let data of res.reverse()) {
                socket.emit('chat.message', data);
            }
        })

    })

    socket.on('chat.message', (data) => {
        const json = JSON.parse(data)
        socket.username = json.username

        client.lpush('messages:'+socket.channel, JSON.stringify({'username': socket.username, 'message': json.message, 'channel': socket.channel}), (err, reply) => {
            console.log('redis lpush => ' + reply);
        });


        consoleLog('chat', 'message', ('[' + socket.username + ']').bold + ' message ' + socket.message)
        socket.to(socket.channel).broadcast.emit('chat.message', JSON.stringify({'username': socket.username, 'message': json.message}))

        socket.emit('chat.message', JSON.stringify({'username': socket.username, 'message': json.message}))
    })

    socket.on('disconnect', function(){
        console.log('user disconnected')

        if (socket.username !== undefined) {
            socket.broadcast.emit('chat.disconnect', JSON.stringify({username: socket.username}))
            client.srem('users', JSON.stringify({'username': socket.username, 'ip': socket.userIp}))
        }

    })
})

http.listen(3000, () => console.log('Listening on ' + 'http://localhost:3000\n'.green))
