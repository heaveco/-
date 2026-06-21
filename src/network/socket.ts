// src/network/socket.ts
import { io } from 'socket.io-client';

// サーバーのアドレス（先ほど立ち上げたポート3001番）
const SERVER_URL = 'http://localhost:3001';

// ソケットのインスタンスを作成（自動接続はオフにしておく）
export const socket = io(SERVER_URL, {
  autoConnect: false,
});