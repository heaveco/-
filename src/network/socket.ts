import { io } from 'socket.io-client';

// 自分のPC（開発）と、Vercel（本番）で接続先を自動で切り替える
const SERVER_URL = import.meta.env.PROD 
  ? 'https://dgjf1r9b9g.onrender.com' 
  : 'http://localhost:3001';

export const socket = io(SERVER_URL, {
  autoConnect: false,
});