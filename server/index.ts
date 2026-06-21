// server/index.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { gameReducer, getInitialGameState } from '../src/engine/gameReducer';
import { PIECE_DEFINITIONS } from '../src/data/pieces';
import type { GameState } from '../src/engine/types';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const roomStates = new Map<string, GameState>();
const roomPlayers = new Map<string, { player1?: string, player2?: string }>();

const maskState = (state: GameState, playerId: string): GameState => {
  const masked = JSON.parse(JSON.stringify(state)) as GameState;
  
  if (playerId === 'player1') {
    masked.p2Queue = masked.p2Queue.map(() => 'hidden_piece');
    masked.p2TrapQueue = masked.p2TrapQueue.map(() => 'hidden_trap');
  } else if (playerId === 'player2') {
    masked.p1Queue = masked.p1Queue.map(() => 'hidden_piece');
    masked.p1TrapQueue = masked.p1TrapQueue.map(() => 'hidden_trap');
  }

  masked.pieces = masked.pieces.filter(p => {
    const isTrap = PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap');
    if (isTrap && p.owner !== playerId) return false;
    return true;
  });

  masked.pieces.forEach(p => {
    if (p.definitionId === 'wolf' && p.owner !== playerId && p.components?.mimicRole) {
      delete p.components.mimicRole;
    }
  });

  return masked;
};

io.on('connection', (socket) => {
  console.log(`🟢 プレイヤー接続: ${socket.id}`);

  socket.on('create_room', (roomId) => {
    socket.join(roomId);
    roomStates.set(roomId, getInitialGameState());
    
    const players = roomPlayers.get(roomId) || {};
    players.player1 = socket.id;
    roomPlayers.set(roomId, players);
    
    console.log(`🏠 部屋 [${roomId}] を作成`);
    socket.emit('room_created', { roomId, playerId: 'player1' }); 
  });

  socket.on('join_room', (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const numClients = room ? room.size : 0;

    if (numClients === 0) {
      socket.emit('error_message', 'その合言葉の部屋は存在しません。');
    } else if (numClients === 1) {
      socket.join(roomId);
      
      const players = roomPlayers.get(roomId) || {};
      players.player2 = socket.id;
      roomPlayers.set(roomId, players);

      console.log(`🤝 部屋 [${roomId}] でマッチング成立！`);
      socket.emit('room_joined', { roomId, playerId: 'player2' }); 
      
      const initialState = roomStates.get(roomId)!;
      io.to(players.player1!).emit('game_start', { message: '対戦相手が見つかりました！', state: maskState(initialState, 'player1') });
      io.to(players.player2!).emit('game_start', { message: '対戦相手が見つかりました！', state: maskState(initialState, 'player2') });
    } else {
      socket.emit('error_message', 'その部屋はすでに満員です。');
    }
  });

  socket.on('send_action', ({ roomId, action }) => {
    try {
      const currentState = roomStates.get(roomId);
      if (!currentState) return;

      const nextState = gameReducer(currentState, action);
      roomStates.set(roomId, nextState);

      const players = roomPlayers.get(roomId);
      if (players?.player1) io.to(players.player1).emit('update_state', maskState(nextState, 'player1'));
      if (players?.player2) io.to(players.player2).emit('update_state', maskState(nextState, 'player2'));
      
    } catch (error) {
      console.error('❌ アクション処理中にエラーが発生しました:', error);
      socket.emit('error_message', 'ゲームエンジン内でエラーが発生しました。');
    }
  });

  // ★新規追加：意図的な退出処理
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    io.to(roomId).emit('opponent_disconnected'); // 残された側に通知
    roomStates.delete(roomId);
    roomPlayers.delete(roomId);
  });

  // ★変更：ブラウザを閉じるなどの不慮の切断時の処理
  socket.on('disconnect', () => {
    console.log(`🔴 プレイヤー切断: ${socket.id}`);
    
    // 切断したプレイヤーが参加していた部屋を探し、相手に通知する
    for (const [roomId, players] of roomPlayers.entries()) {
      if (players.player1 === socket.id || players.player2 === socket.id) {
        io.to(roomId).emit('opponent_disconnected');
        roomStates.delete(roomId);
        roomPlayers.delete(roomId);
      }
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 対戦サーバーがポート ${PORT} で起動しました！`);
});