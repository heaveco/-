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
  let actualTarget = target;

  // ★盾の身代わり処理（王への直接攻撃時）
  let isShieldSacrifice = false;
  if (actualTarget.definitionId === 'king') {
    const shield = nextBoard.find(p => p.owner === actualTarget.owner && p.definitionId === 'shield');
    if (shield) {
      actualTarget = shield; // 王の代わりに盾が攻撃を受ける
      isShieldSacrifice = true;
    }
  }

  const actualTargetDef = getEffectiveDefinition(actualTarget);
  const attackerDef = getEffectiveDefinition(attacker);

  // ★霊の憑依処理（霊が攻撃した時）
  if (attacker.definitionId === 'ghost' && !attacker.components?.possessed) {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id); // 敵は消滅
    attackerFinalPos = clickedPos;
    nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos, components: { ...p.components, possessed: actualTarget.definitionId } } : p);
    return { nextBoard, capturedPiece: null };
  }

  // ★霊の憑依処理（霊が攻撃された時）
  if (actualTarget.definitionId === 'ghost' && !actualTarget.components?.possessed) {
    nextBoard = nextBoard.filter(p => p.id !== attacker.id); // 攻撃してきた敵が消滅
    nextBoard = nextBoard.map(p => p.id === actualTarget.id ? { ...p, components: { ...p.components, possessed: attacker.definitionId } } : p);
    return { nextBoard, capturedPiece: null };
  }

  // 手前で止まる座標の計算
  const calcStopPos = () => {
    const isKnight = attackerDef.id === 'knight'; 
    if (isKnight) return attacker.position;
    const dx = Math.sign(clickedPos.x - attacker.position.x);
    const dy = Math.sign(clickedPos.y - attacker.position.y);
    let current = attacker.position;
    let previous = current;
    const targetArea = getOccupiedPositions(actualTarget);
    for (let i = 0; i < 5; i++) {
      const nextPos = { x: current.x + dx, y: current.y + dy };
      const myNextArea = getOccupiedPositions({ ...attacker, position: nextPos });
      if (targetArea.some(tp => myNextArea.some(mp => tp.x === mp.x && tp.y === mp.y))) break;
      previous = nextPos;
      current = nextPos;
      if (current.x === clickedPos.x && current.y === clickedPos.y) break;
    }
    return previous;
  };

  if (actualTargetDef?.tags?.includes('split_on_hit')) {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
    capturedPiece = null; 
    attackerFinalPos = clickedPos; 

    const hitX = clickedPos.x;
    const survivingX = hitX === actualTarget.position.x ? actualTarget.position.x + 1 : actualTarget.position.x;
    nextBoard.push({
      id: `${actualTarget.owner}_gold_split_${Date.now()}_${Math.random()}`,
      definitionId: 'gold', owner: actualTarget.owner, position: { x: survivingX, y: actualTarget.position.y }, components: {}
    });
  } 
  else if (actualTargetDef?.tags?.includes('boss_target') || isShieldSacrifice || actualTarget.definitionId === 'shield') {
    attackerFinalPos = calcStopPos();

    if (isShieldSacrifice || actualTarget.definitionId === 'shield') {
      nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
      if (!isShieldSacrifice) capturedPiece = { ...actualTarget, components: {} }; // 盾直接攻撃なら取得
      else capturedPiece = null; // 身代わり時は消滅するだけ
    } else {
      const hp = actualTarget.components.hp ?? 2;
      const newHp = hp - 1;
      if (newHp > 0) {
        nextBoard = nextBoard.map(p => {
          if (p.id === actualTarget.id) {
            const newComps = { ...p.components, hp: newHp };
            if (actualTarget.definitionId === 'twins') newComps.recoveryTimer = 1;
            return { ...p, components: newComps };
          }
          return p;
        });
      } else {
        nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
        capturedPiece = { ...actualTarget, components: { ...actualTarget.components, hp: 2 } }; 
      }
    }
  } 
  else {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
    capturedPiece = { ...actualTarget, components: { ...actualTarget.components } };
  }

  // 取得後の共通クリーンアップ
  if (capturedPiece) {
    if (capturedPiece.definitionId === 'wolf') delete capturedPiece.components.mimicRole;
    if (capturedPiece.definitionId === 'bomb') { capturedPiece.components.isActivated = false; capturedPiece.components.bombTimer = 0; }
    if (capturedPiece.definitionId === 'white_sage') capturedPiece.components.isExhausted = false;
    if (capturedPiece.definitionId === 'nuisance') capturedPiece.definitionId = 'harm';
  }

  // ★茸（毒）の処理：取得した場合、取得者に休眠タイマーを付与
  let newAttackerComponents = { ...attacker.components };
  if (actualTargetDef?.tags?.includes('poisonous') && capturedPiece) {
    newAttackerComponents.mushroomTimer = 2; // 2ターン行動不能
  }

  nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos, components: newAttackerComponents } : p);
  return { nextBoard, capturedPiece };
};