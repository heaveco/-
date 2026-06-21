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

const randomQueueOn: string[] = []; 
const randomQueueOff: string[] = []; 

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

const removeFromRandomQueue = (socketId: string) => {
  const idxOn = randomQueueOn.indexOf(socketId);
  if (idxOn > -1) randomQueueOn.splice(idxOn, 1);
  const idxOff = randomQueueOff.indexOf(socketId);
  if (idxOff > -1) randomQueueOff.splice(idxOff, 1);
};

io.on('connection', (socket) => {
  console.log(`🟢 プレイヤー接続: ${socket.id}`);

  socket.on('create_room', ({ roomId, useTimer }) => {
    socket.join(roomId);
    
    const initialState = getInitialGameState();
    initialState.ruleSettings = { useTurnTimer: useTimer };
    roomStates.set(roomId, initialState);
    
    const players = roomPlayers.get(roomId) || {};
    players.player1 = socket.id;
    roomPlayers.set(roomId, players);
    
    console.log(`🏠 部屋 [${roomId}] (タイマー:${useTimer}) を作成`);
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

      socket.emit('room_joined', { roomId, playerId: 'player2' }); 
      
      const initialState = roomStates.get(roomId)!;
      io.to(players.player1!).emit('game_start', { message: '対戦相手が見つかりました！', state: maskState(initialState, 'player1') });
      io.to(players.player2!).emit('game_start', { message: '対戦相手が見つかりました！', state: maskState(initialState, 'player2') });
    } else {
      socket.emit('error_message', 'その部屋はすでに満員です。');
    }
  });

  // ★ 修正：自分自身とマッチングしてしまう「自己ループバグ」を完全に防ぎます
  socket.on('join_random', ({ useTimer }) => {
    removeFromRandomQueue(socket.id); // まず自分が別のキューにいたら削除

    const queue = useTimer ? randomQueueOn : randomQueueOff;
    // 自分以外で、かつ現在も接続中のプレイヤーを探す
    const validQueue = queue.filter(id => id !== socket.id && io.sockets.sockets.get(id));

    if (validQueue.length > 0) {
      const opponentId = validQueue.shift()!;
      if (useTimer) randomQueueOn.splice(randomQueueOn.indexOf(opponentId), 1);
      else randomQueueOff.splice(randomQueueOff.indexOf(opponentId), 1);

      const roomId = `random_${Date.now()}_${Math.random()}`;
      socket.join(roomId);
      const opponentSocket = io.sockets.sockets.get(opponentId);
      if (opponentSocket) opponentSocket.join(roomId);

      const initialState = getInitialGameState();
      initialState.ruleSettings = { useTurnTimer: useTimer };
      roomStates.set(roomId, initialState);
      roomPlayers.set(roomId, { player1: opponentId, player2: socket.id });

      io.to(opponentId).emit('room_created', { roomId, playerId: 'player1' });
      socket.emit('room_joined', { roomId, playerId: 'player2' });

      io.to(opponentId).emit('game_start', { message: '野良対戦の相手が見つかりました！', state: maskState(initialState, 'player1') });
      socket.emit('game_start', { message: '野良対戦の相手が見つかりました！', state: maskState(initialState, 'player2') });
    } else {
      if (useTimer) randomQueueOn.push(socket.id);
      else randomQueueOff.push(socket.id);
      socket.emit('waiting_random');
    }
  });

  socket.on('leave_random', () => {
    removeFromRandomQueue(socket.id);
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

  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    io.to(roomId).emit('opponent_disconnected');
    roomStates.delete(roomId);
    roomPlayers.delete(roomId);
  });

  socket.on('disconnect', () => {
    console.log(`🔴 プレイヤー切断: ${socket.id}`);
    removeFromRandomQueue(socket.id);
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