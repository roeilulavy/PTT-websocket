const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { instrument } = require('@socket.io/admin-ui');

app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const userIo = io.of('/user', socket => {
  console.log("connected to user namespace with username " + socket.username);
});

// Middleware for user auth
userIo.use((socket, next) => {
  if (socket.handshake.auth.token) {
    socket.username = getUsernameFromToken(socket.handshake.auth.token);
    next();
  } else {
    next(new Error('Please send token'));
  }
});

function getUsernameFromToken(token) {
  return token;
};

io.on('connection', socket => {
  console.log(socket.id + ' - has CONNECTED');

  socket.on('disconnect', socket => {
    console.log(socket.id + ' - has DISCONNECTED');
  });

  socket.on('join-room', room => {
    socket.join(room);
    console.log(socket.id + ' Join to room: ' + room);
  });

  socket.on('change-room', (prevRoom, newRoom) => {
    socket.leave(prevRoom);
    socket.join(newRoom);

    console.log(socket.id + ' Has left room: ' + prevRoom);
    console.log(socket.id +' Join to room: ' + newRoom);
  });

  socket.on('message', (room, message) => {
    socket.broadcast.to(room).emit('new message', message);
  });

  socket.on('sos-start', (id, room) => {
    socket.broadcast.to(room).emit('receive-sos', id);
  });

  socket.on('sos-end', (room) => {
    socket.broadcast.to(room).emit('receive-sos-end');
  });

  socket.on('voice-message-start', (id, room) => {
    socket.broadcast.to(room).emit('receive-voice-message', id);
    console.log('voice message START from: ' + id + ' In room: ' + room);
  });

  socket.on('voice-message-end', (id, room) => {
    socket.broadcast.to(room).emit('receive-voice-message-end');
    console.log('Voice message END from: ' + id + ' In room: ' + room);
  });

  socket.on('bufferHeader', (room, data) => {
    socket.broadcast.to(room).emit('bufferHeader', data);
    // console.log('bufferHeader: ' + data);
  });

  socket.on('stream', (room, streamData) => {
    socket.broadcast.to(room).emit('stream', streamData);
    // console.log('streamData: ' + 'Type: ' + typeof(streamData) + 'Stream: ' + streamData);
  });
});

instrument(io, { auth: false });

server.listen(9000, () => {
  console.log('Server is running...');
});
