// src/rules/combat.ts
import type { Piece, Position } from '../entities/types';
import { getEffectiveDefinition, getOccupiedPositions } from './movement';

export interface CombatResult {
  nextBoard: Piece[];
  capturedPiece: Piece | null;
}

export const resolveCombat = (
  attacker: Piece, target: Piece, clickedPos: Position, currentBoard: Piece[]
): CombatResult => {
  let nextBoard = [...currentBoard];
  let capturedPiece: Piece | null = null;
  let attackerFinalPos = clickedPos; 

  const targetDef = getEffectiveDefinition(target);
  const attackerDef = getEffectiveDefinition(attacker);

  if (targetDef?.tags?.includes('boss_target')) {
    const hp = target.components.hp ?? 2;
    const newHp = hp - 1;
    const isKnight = attackerDef.id === 'knight'; 
    
    if (isKnight) {
      attackerFinalPos = attacker.position;
    } else {
      const dx = Math.sign(clickedPos.x - attacker.position.x);
      const dy = Math.sign(clickedPos.y - attacker.position.y);
      let current = attacker.position;
      let previous = current;
      const targetArea = getOccupiedPositions(target);
      
      for (let i = 0; i < 5; i++) {
        const nextPos = { x: current.x + dx, y: current.y + dy };
        // ★バグ修正：攻撃者の「全占有マス」がターゲットと重なるか判定
        const myNextArea = getOccupiedPositions({ ...attacker, position: nextPos });
        if (targetArea.some(tp => myNextArea.some(mp => tp.x === mp.x && tp.y === mp.y))) break;
        
        previous = nextPos;
        current = nextPos;
        if (current.x === clickedPos.x && current.y === clickedPos.y) break;
      }
      attackerFinalPos = previous;
    }

    if (newHp > 0) {
      nextBoard = nextBoard.map(p => p.id === target.id ? { ...p, components: { ...p.components, hp: newHp } } : p);
    } else {
      nextBoard = nextBoard.filter(p => p.id !== target.id);
      capturedPiece = { ...target, components: { ...target.components, hp: 2 } }; 
      if (capturedPiece.definitionId === 'wolf') delete capturedPiece.components.mimicRole;
    }
  } else {
    nextBoard = nextBoard.filter(p => p.id !== target.id);
    capturedPiece = { ...target, components: { ...target.components } };
    if (capturedPiece.definitionId === 'wolf') delete capturedPiece.components.mimicRole;
    
    // ★新規：迷惑は取られると「成害」になる
    if (capturedPiece.definitionId === 'nuisance') {
      capturedPiece.definitionId = 'harm';
    }
  }

  nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos } : p);
  return { nextBoard, capturedPiece };
};