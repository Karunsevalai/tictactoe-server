const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {}; // roomId -> { players: {socketId: {symbol}}, board, turn, nextStarter }

const ips=[];

io.on('connection',async (socket) => {
  console.log('New connection:', socket.id);
  //......................

let ip =
  socket.handshake.headers["x-forwarded-for"]?.split(",")[0].trim() ||
  socket.handshake.address ||
  "0.0.0.0";

ip = ip.replace("::ffff:", "");
ips.push(ip);

console.log("User IP",ip);

// let geo = null;

// try {
//   const res = await axios.get(`https://ip-api.com/json/${ip}`);
//   geo = res.data;
//   console.log("User IP:", ip);
//   console.log("User Geo:", geo);
// } catch (err) {
//   console.log("User IP:", ip);
//   console.log("Geo lookup failed:", err.message);
// }
// //''''''''''''''''''''''''''


  socket.on('joinRoom', ({ roomId }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {}, // socketId -> { symbol }
        board: Array.from({ length: 3 }, () => Array(3).fill('')),
        turn: 'X',
        nextStarter: 'X'
      };
    }

    const room = rooms[roomId];

    // Remove disconnected sockets
    for (const sid of Object.keys(room.players)) {
      if (!io.sockets.sockets.get(sid)) delete room.players[sid];
    }

    if (Object.keys(room.players).length >= 2) {
      socket.emit('roomFull');
      return;
    }

    socket.join(roomId);

    // Assign symbol
    const symbol = Object.keys(room.players).length === 0 ? 'X' : 'O';
    room.players[socket.id] = { symbol };
    socket.emit('playerAssigned', symbol);

    // Start game if 2 players
    if (Object.keys(room.players).length === 2) {
      room.turn = room.nextStarter;
      room.nextStarter = room.nextStarter === 'X' ? 'O' : 'X';
      io.to(roomId).emit('startGame', { board: room.board, turn: room.turn });
    }
  });

  socket.on('makeMove', ({ roomId, row, col }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players[socket.id];
    if (!player || player.symbol !== room.turn) return; // invalid turn
    if (room.board[row][col] !== '') return;

    // Apply move
    room.board[row][col] = player.symbol;

    // Switch turn
    room.turn = room.turn === 'X' ? 'O' : 'X';

    io.to(roomId).emit('updateBoard', { board: room.board, turn: room.turn });

    const winner = checkWinner(room.board);
    const isDraw = !winner && room.board.flat().every(cell => cell !== '');

    if (winner || isDraw) {
      io.to(roomId).emit('gameOver', { winner, draw: isDraw });

      // Reset board
      room.board = Array.from({ length: 3 }, () => Array(3).fill(''));

      // Set starter for next game
      room.turn = room.nextStarter;
      room.nextStarter = room.nextStarter === 'X' ? 'O' : 'X';

      setTimeout(() => {
        io.to(roomId).emit('startGame', { board: room.board, turn: room.turn });
      }, 1000);
    }
  });

    socket.on('disconnect', () => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.players[socket.id]) {
      // Remove the disconnecting player
      delete room.players[socket.id];

      const remainingPlayers = Object.keys(room.players);

      if (remainingPlayers.length === 1) {
        // Only one player left, reset board and make them 'X'
        const remainingSocketId = remainingPlayers[0];
       // room.board = Array.from({ length: 3 }, () => Array(3).fill(''));
       // room.turn = 'X';
       // room.nextStarter = 'O'; // the next new player will be 'O'
        //room.players[remainingSocketId].symbol = 'X';

        // Notify remaining player
        io.to(remainingSocketId).emit('playerAssigned', 'X');
        io.to(roomId).emit('updateBoard', { board: room.board, turn: room.turn });
        io.to(roomId).emit('playerLeft');
      } else if (remainingPlayers.length === 0) {
        // No players left, delete room
        delete rooms[roomId];
        //console.log(`Room ${roomId} deleted because all players left`);
      }
    }
  }
});

  // socket.on('disconnect', () => {
  //   for (const roomId in rooms) {
  //     const room = rooms[roomId];
  //     if (room.players[socket.id]) {
  //       delete room.players[socket.id];
  //       socket.to(roomId).emit('playerLeft');
  //     }
  //     if (Object.keys(room.players).length === 0) delete rooms[roomId];
  //   }
  // });
});

function checkWinner(board) {
  const lines = [
    [[0,0],[0,1],[0,2]], [[1,0],[1,1],[1,2]], [[2,0],[2,1],[2,2]],
    [[0,0],[1,0],[2,0]], [[0,1],[1,1],[2,1]], [[0,2],[1,2],[2,2]],
    [[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]]
  ];
  for (const line of lines) {
    const [[a1,a2],[b1,b2],[c1,c2]] = line;
    if (board[a1][a2] && board[a1][a2] === board[b1][b2] && board[a1][a2] === board[c1][c2])
      return board[a1][a2];
  }
  return null;
}

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
