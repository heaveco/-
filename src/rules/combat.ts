// @ts-nocheck
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

  if (targetDef?.tags?.includes('split_on_hit')) {
    nextBoard = nextBoard.filter(p => p.id !== target.id);
    capturedPiece = null; 
    attackerFinalPos = clickedPos; 

    const hitX = clickedPos.x;
    const survivingX = hitX === target.position.x ? target.position.x + 1 : target.position.x;

    nextBoard.push({
      id: `${target.owner}_gold_split_${Date.now()}_${Math.random()}`,
      definitionId: 'gold',
      owner: target.owner,
      position: { x: survivingX, y: target.position.y },
      components: {}
    });
  } 
  else if (targetDef?.tags?.includes('boss_target')) {
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
        const myNextArea = getOccupiedPositions({ ...attacker, position: nextPos });
        if (targetArea.some(tp => myNextArea.some(mp => tp.x === mp.x && tp.y === mp.y))) break;
        
        previous = nextPos;
        current = nextPos;
        if (current.x === clickedPos.x && current.y === clickedPos.y) break;
      }
      attackerFinalPos = previous;
    }

    if (newHp > 0) {
      nextBoard = nextBoard.map(p => {
        if (p.id === target.id) {
          const newComps = { ...p.components, hp: newHp };
          if (target.definitionId === 'twins') {
            newComps.recoveryTimer = 1;
          }
          return { ...p, components: newComps };
        }
        return p;
      });
    } else {
      nextBoard = nextBoard.filter(p => p.id !== target.id);
      capturedPiece = { ...target, components: { ...target.components, hp: 2 } }; 
      if (capturedPiece.definitionId === 'wolf') delete capturedPiece.components.mimicRole;
      if (capturedPiece.definitionId === 'bomb') { capturedPiece.components.isActivated = false; capturedPiece.components.bombTimer = 0; }
      if (capturedPiece.definitionId === 'white_sage') capturedPiece.components.isExhausted = false; // ★追加
    }
  } 
  else {
    nextBoard = nextBoard.filter(p => p.id !== target.id);
    capturedPiece = { ...target, components: { ...target.components } };
    if (capturedPiece.definitionId === 'wolf') delete capturedPiece.components.mimicRole;
    if (capturedPiece.definitionId === 'bomb') { capturedPiece.components.isActivated = false; capturedPiece.components.bombTimer = 0; }
    if (capturedPiece.definitionId === 'white_sage') capturedPiece.components.isExhausted = false; // ★追加
    if (capturedPiece.definitionId === 'nuisance') capturedPiece.definitionId = 'harm';
  }

  nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos } : p);
  return { nextBoard, capturedPiece };
};