// src/components/Piece.tsx
import React from 'react';
import type { Piece as PieceType, PlayerId } from '../entities/types';
import { PIECE_DEFINITIONS } from '../data/pieces';

interface Props { piece: PieceType; inHand?: boolean; currentPlayer: PlayerId; }

export const Piece: React.FC<Props> = ({ piece, inHand, currentPlayer }) => {
  const def = PIECE_DEFINITIONS[piece.definitionId];
  const bgColor = piece.owner === 'player1' ? 'bg-blue-500' : 'bg-red-500';
  
  if (def?.tags?.includes('invisible_to_enemy') && piece.owner !== currentPlayer && !inHand) {
    return null;
  }

  let displayName = def?.name || '?';
  if (piece.definitionId === 'wolf') {
    if (piece.components?.mimicRole && piece.owner === currentPlayer) displayName = `狼(${PIECE_DEFINITIONS[piece.components.mimicRole]?.name || '?'})`;
    else displayName = '狼';
  }

  // ★爆弾の起動時に正しく「起爆」に名前を書き換える
  if (piece.definitionId === 'bomb' && piece.components?.isActivated) {
    displayName = '起爆';
  }

  let textSizeClass = 'text-lg';
  if (displayName.length === 2) textSizeClass = 'text-sm';
  else if (displayName.length >= 3) textSizeClass = 'text-xs leading-tight tracking-tighter';

  const width = def?.size?.width || 1; const height = def?.size?.height || 1;
  const dimensionClasses = (!inHand && (width > 1 || height > 1)) ? 'w-[132px] h-[132px] absolute top-0 left-0' : 'w-12 h-12 relative';

  return (
    <div className={`${dimensionClasses} rounded-full flex items-center justify-center text-white font-bold shadow-[0_4px_15px_rgba(0,0,0,0.4)] ${bgColor} transform transition-transform hover:scale-105 text-center p-1 pointer-events-none`}>
      <span className={textSizeClass} style={{ wordBreak: 'keep-all' }}>{displayName}</span>
      {piece.components?.hp !== undefined && <span className="absolute bottom-2 right-2 bg-black text-xs px-2 py-0.5 rounded-full border border-gray-500 shadow-md">HP:{piece.components.hp}</span>}
      {/* 爆弾タイマーの表示 */}
      {piece.components?.isActivated && <span className="absolute -top-1 -right-1 bg-yellow-400 text-black text-xs px-2 py-0.5 rounded-full shadow border border-yellow-600 animate-pulse font-bold">{piece.components.bombTimer}</span>}
    </div>
  );
};