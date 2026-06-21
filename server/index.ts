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

// ★新規追加：送信直前に相手の隠蔽情報を消去する「マスキング」処理
const maskState = (state: GameState, playerId: string): GameState => {
  const masked = JSON.parse(JSON.stringify(state)) as GameState;
  
  // 1. 相手の待機列（キュー）の中身を隠す
  if (playerId === 'player1') {
    masked.p2Queue = masked.p2Queue.map(() => 'hidden_piece');
    masked.p2TrapQueue = masked.p2TrapQueue.map(() => 'hidden_trap');
  } else if (playerId === 'player2') {
    masked.p1Queue = masked.p1Queue.map(() => 'hidden_piece');
    masked.p1TrapQueue = masked.p1TrapQueue.map(() => 'hidden_trap');
  }

  // 2. 相手が置いた「地雷」を盤面から完全に消去する（見えなくする）
  masked.pieces = masked.pieces.filter(p => {
    const isTrap = PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap');
    if (isTrap && p.owner !== playerId) return false;
    return true;
  });

  // 3. 相手の「狼」が何に化けているか（正体）を隠す
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
    
    // 作成者を Player 1 として登録
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
      
      // 参加者を Player 2 として登録
      const players = roomPlayers.get(roomId) || {};
      players.player2 = socket.id;
      roomPlayers.set(roomId, players);

      console.log(`🤝 部屋 [${roomId}] でマッチング成立！`);
      socket.emit('room_joined', { roomId, playerId: 'player2' }); 
      
      const initialState = roomStates.get(roomId)!;
      // ★マスキングした状態をそれぞれに送信！
      io.to(players.player1!).emit('game_start', { message: '対戦相手が見つかりました！', state: maskState(initialState, 'player1') });
      io.to(players.player2!).emit('game_start', { message: '対戦相手が見つかりました！', state: maskState(initialState, 'player2') });
    } else {
      socket.emit('error_message', 'その部屋はすでに満員です。');
    }
  });

// ==================================================
  // ★変更：エラーが起きてもサーバーが落ちないように try-catch で囲む
  // ==================================================
  socket.on('send_action', ({ roomId, action }) => {
    try {
      const currentState = roomStates.get(roomId);
      if (!currentState) return;

      // サーバーの裏側では「真の盤面」で計算を行う
      const nextState = gameReducer(currentState, action);
      roomStates.set(roomId, nextState);

      // 計算結果をそれぞれマスクして送り返す
      const players = roomPlayers.get(roomId);
      if (players?.player1) io.to(players.player1).emit('update_state', maskState(nextState, 'player1'));
      if (players?.player2) io.to(players.player2).emit('update_state', maskState(nextState, 'player2'));
      
    } catch (error) {
      // エラーが起きてもサーバーは落ちず、ログだけ残す！
      console.error('❌ アクション処理中にエラーが発生しました:', error);
      console.error('エラーの原因となったアクション:', action);
      
      // プレイヤーにエラーを知らせる（必要であれば）
      socket.emit('error_message', 'ゲームエンジン内でエラーが発生しました。申し訳ありませんが最初からやり直してください。');
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔴 プレイヤー切断: ${socket.id}`);
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 対戦サーバーがポート ${PORT} で起動しました！`);
});