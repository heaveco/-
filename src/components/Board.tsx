// src/components/Board.tsx
import React from 'react';
import type { Piece as PieceType, Position, PlayerId } from '../entities/types';
import { Piece } from './Piece';
import { getOccupiedPositions, getEffectiveDefinition } from '../rules/movement';
import { PIECE_DEFINITIONS } from '../data/pieces';

interface Props {
  pieces: PieceType[];
  selectedPieceId: string | null;
  selectedCapturedPiece: PieceType | undefined;
  movablePositions: Position[];
  onCellClick: (x: number, y: number) => void;
  currentPlayer: PlayerId;
}

export const Board: React.FC<Props> = ({ pieces, selectedPieceId, selectedCapturedPiece, movablePositions, onCellClick, currentPlayer }) => {
  const cells = Array.from({ length: 25 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5) }));
  const activePiece = pieces.find(p => p.id === selectedPieceId) || selectedCapturedPiece;

  return (
    <div className="flex items-center justify-center w-full mt-8">
      <div className="grid grid-cols-5 gap-1 bg-gray-700 p-2 rounded-lg relative">
        {cells.map((cell) => {
          const pieceOnCellAnchor = pieces.find(p => p.position.x === cell.x && p.position.y === cell.y);

          let isSelected = false;
          if (selectedPieceId) {
            const sp = pieces.find(p => p.id === selectedPieceId);
            if (sp) isSelected = getOccupiedPositions(sp).some(pos => pos.x === cell.x && pos.y === cell.y);
          }

          let isMovable = false;
          if (activePiece) {
            isMovable = movablePositions.some(mPos => getOccupiedPositions({ ...activePiece, position: mPos }).some(pos => pos.x === cell.x && pos.y === cell.y));
          }

          let bgClass = 'bg-gray-300 hover:bg-gray-400';
          if (isSelected) bgClass = 'bg-yellow-200 shadow-[0_0_15px_rgba(253,224,71,0.6)]';
          else if (isMovable) bgClass = 'bg-green-300 shadow-[inset_0_0_10px_rgba(34,197,94,0.5)] cursor-pointer';

          const zIndexClass = pieceOnCellAnchor ? 'z-30' : (isSelected || isMovable ? 'z-10' : 'z-0');

          return (
            <div key={`${cell.x}-${cell.y}`} className={`relative w-16 h-16 flex items-center justify-center rounded transition-all duration-200 ${bgClass} ${zIndexClass}`} onClick={() => onCellClick(cell.x, cell.y)}>
              {pieceOnCellAnchor && (
                // ★修正：コマの幅（width）が2以上の場合は、CSSで左上に位置を補正する
                <div className={`absolute top-0 left-0 ${PIECE_DEFINITIONS[pieceOnCellAnchor.definitionId]?.size?.width === 2 ? '-translate-x-[68px]' : ''}`}>
                  <Piece piece={pieceOnCellAnchor} inHand={false} currentPlayer={currentPlayer} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};