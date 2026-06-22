// @ts-nocheck
// src/components/Piece.tsx
import React from 'react';
import type { Piece as PieceType, PlayerId } from '../entities/types';
import { PIECE_DEFINITIONS } from '../data/pieces';

interface Props { piece: PieceType; inHand?: boolean; currentPlayer: PlayerId; isFlipped?: boolean; }

export const Piece: React.FC<Props> = ({ piece, inHand, currentPlayer, isFlipped }) => {
  const def = PIECE_DEFINITIONS[piece.definitionId];
  
  const isSageExhausted = piece.definitionId === 'white_sage' && piece.components?.isExhausted;
  
  // ★追加：反成（anti_promote）が成ったあとの行動不能判定
  const isAntiPromoted = piece.definitionId === 'promoted_anti_promote';
  
  const isPoisoned = (piece.components?.mushroomTimer || 0) > 0;
  
  // ★修正：白賢、反成、茸の毒のいずれかの場合はグレーにする
  const bgColor = (isSageExhausted || isAntiPromoted || isPoisoned) ? 'bg-gray-600' : (piece.owner === 'player1' ? 'bg-blue-500' : 'bg-red-500');
  
  if (def?.tags?.includes('invisible_to_enemy') && piece.owner !== currentPlayer && !inHand) {
    return null;
  }

  let displayName = def?.name || '?';
  if (piece.definitionId === 'wolf') {
    if (piece.components?.mimicRole && piece.owner === currentPlayer) displayName = `狼(${PIECE_DEFINITIONS[piece.components.mimicRole]?.name || '?'})`;
    else displayName = '狼';
  }

  if (piece.definitionId === 'bomb' && piece.components?.isActivated) {
    displayName = '起爆';
  }
  
  if (piece.definitionId === 'ghost' && piece.components?.possessed) {
    displayName = `霊(${PIECE_DEFINITIONS[piece.components.possessed]?.name || '?'})`;
  }

  // ★修正：白の賢人 または 反成 の能力使用後は「×」を表示
  if (isSageExhausted || isAntiPromoted) {
    displayName = '×';
  }

// 40行目付近: テキストサイズのロジックを修正
  let textSizeClass = 'text-lg';
  if (displayName.length === 2) textSizeClass = 'text-sm';
  else if (displayName.length === 3 || displayName.length === 4) textSizeClass = 'text-xs leading-tight tracking-tighter';
  else if (displayName.length >= 5) textSizeClass = 'text-[9px] leading-none tracking-tighter'; // ★追加: 超長文用

  const width = def?.size?.width || 1; 
  const height = def?.size?.height || 1;

  // 46行目付近: 大型コマの描画方向を反転状況によって変更する
  let dimensionClasses = 'w-12 h-12 relative';
  if (!inHand) {
    if (width === 2 && height === 2) {
      // 反転時は基点が右下になるため、上と左に向かって拡張させる
      dimensionClasses = `w-[132px] h-[132px] absolute ${isFlipped ? 'bottom-0 right-0' : 'top-0 left-0'}`;
    } else if (width === 2 && height === 1) {
      dimensionClasses = `w-[132px] h-[64px] absolute ${isFlipped ? 'bottom-0 right-0' : 'top-0 left-0'}`;
    }
  }

  return (
    <div className={`${dimensionClasses} rounded-full flex items-center justify-center text-white font-bold shadow-[0_4px_15px_rgba(0,0,0,0.4)] ${bgColor} transform transition-transform hover:scale-105 text-center p-1 pointer-events-none`}>
      {/* ★変更: 長すぎる場合は改行を許可する（wordBreakの動的変更） */}
      <span className={textSizeClass} style={{ wordBreak: displayName.length >= 5 ? 'normal' : 'keep-all' }}>{displayName}</span>
      
      {isPoisoned && (
        <span className="absolute -top-2 -left-2 bg-purple-700 text-white text-[10px] px-1 py-0.5 rounded-full shadow-lg border border-purple-400 animate-pulse font-bold z-10">
          🍄{piece.components.mushroomTimer}
        </span>
      )}

      {piece.components?.hp !== undefined && (
        <span className={`absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded-full border shadow-md ${piece.components.hp === 1 && piece.definitionId === 'twins' ? 'bg-purple-600 border-purple-400 animate-pulse' : 'bg-black border-gray-500'}`}>
          HP:{piece.components.hp}{piece.components.hp === 1 && piece.definitionId === 'twins' ? ' (休)' : ''}
        </span>
      )}
      
      {piece.components?.isActivated && <span className="absolute -top-1 -right-1 bg-yellow-400 text-black text-xs px-2 py-0.5 rounded-full shadow border border-yellow-600 animate-pulse font-bold">{piece.components.bombTimer}</span>}
    </div>
  );
};