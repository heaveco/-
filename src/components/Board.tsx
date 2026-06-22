// src/components/Board.tsx
import React from 'react';
import type { Piece as PieceType, Position, PlayerId } from '../entities/types';
import { Piece } from './Piece';
import { getOccupiedPositions } from '../rules/movement';
import { PIECE_DEFINITIONS } from '../data/pieces'; 

interface Props {
  pieces: PieceType[];
  selectedPieceId: string | null;
  selectedCapturedPiece: PieceType | undefined;
  movablePositions: Position[];
  onCellClick: (x: number, y: number) => void;
  currentPlayer: PlayerId;
  isFlipped: boolean; 
  explosions?: Position[];
}

export const Board: React.FC<Props> = ({ pieces, selectedPieceId, selectedCapturedPiece, movablePositions, onCellClick, currentPlayer, isFlipped, explosions = [] }) => {
  const cells = Array.from({ length: 25 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5) }));
  const activePiece = pieces.find(p => p.id === selectedPieceId) || selectedCapturedPiece;

  return (
    <div className="flex items-center justify-center w-full mt-8">
      <div className="grid grid-cols-5 gap-1 bg-gray-700 p-2 rounded-lg relative">
        {cells.map((cell) => {
          const pieceOnCellAnchor = pieces.find(p => p.position.x === cell.x && p.position.y === cell.y);
          const isVisible = !(PIECE_DEFINITIONS[pieceOnCellAnchor?.definitionId || '']?.tags?.includes('invisible_to_enemy') && pieceOnCellAnchor?.owner !== currentPlayer);

          // ★修正: 選択中のコマ（黄色ハイライト）の反転対応
          let isSelected = false;
          if (selectedPieceId) {
            const sp = pieces.find(p => p.id === selectedPieceId);
            if (sp) {
              const origSp = isFlipped ? { ...sp, position: { x: 4 - sp.position.x, y: 4 - sp.position.y } } : sp;
              const origOccupied = getOccupiedPositions(origSp);
              isSelected = origOccupied.some(origPos => {
                const dispPos = isFlipped ? { x: 4 - origPos.x, y: 4 - origPos.y } : origPos;
                return dispPos.x === cell.x && dispPos.y === cell.y;
              });
            }
          }

          // ★修正: 移動可能マス（緑色ハイライト）の反転対応
          let isMovable = false;
          if (activePiece) {
            const isGhostDetachment = !selectedCapturedPiece && activePiece.components?.ghostAttached === currentPlayer;
            if (isGhostDetachment) {
               isMovable = movablePositions.some(mPos => mPos.x === cell.x && mPos.y === cell.y);
            } else {
               isMovable = movablePositions.some(mPos => {
                 // アンカーを一度反転前の座標に戻す
                 const origMPos = isFlipped ? { x: 4 - mPos.x, y: 4 - mPos.y } : mPos;
                 // 反転前の座標で、本来の占有マス（2マス等）を計算する
                 const origOccupied = getOccupiedPositions({ ...activePiece, position: origMPos });
                 
                 // 計算結果の各マスを反転後の座標に変換し、現在のセルと一致するか判定する
                 return origOccupied.some(origPos => {
                   const dispPos = isFlipped ? { x: 4 - origPos.x, y: 4 - origPos.y } : origPos;
                   return dispPos.x === cell.x && dispPos.y === cell.y;
                 });
               });
            }
          }

          const isExploding = explosions.some(e => e.x === cell.x && e.y === cell.y);

          let bgClass = 'bg-gray-300 hover:bg-gray-400';
          if (isSelected) bgClass = 'bg-yellow-200 shadow-[0_0_15px_rgba(253,224,71,0.6)]';
          else if (isMovable) bgClass = 'bg-green-300 shadow-[inset_0_0_10px_rgba(34,197,94,0.5)] cursor-pointer';

          const zIndexClass = (pieceOnCellAnchor && isVisible) ? 'z-30' : (isSelected || isMovable ? 'z-10' : 'z-0');

          return (
            <div key={`${cell.x}-${cell.y}`} className={`relative w-16 h-16 flex items-center justify-center rounded transition-all duration-200 ${bgClass} ${zIndexClass}`} onClick={() => onCellClick(cell.x, cell.y)}>
              {pieceOnCellAnchor && isVisible ? (
                <Piece piece={pieceOnCellAnchor} inHand={false} currentPlayer={currentPlayer} isFlipped={isFlipped} />
              ) : null}

              {isExploding && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[100]">
                   <div className="absolute w-24 h-24 bg-red-500 rounded-full mix-blend-screen animate-ping opacity-75"></div>
                   <div className="absolute text-6xl animate-bounce">💥</div>
                 </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};