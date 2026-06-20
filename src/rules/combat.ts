// @ts-nocheck
// src/rules/combat.ts
import type { Piece, Position } from '../entities/types';
import { getEffectiveDefinition, getOccupiedPositions } from './movement';

export interface CombatResult {
  nextBoard: Piece[];
  capturedPiece: Piece | null;
  promotionCanceled: boolean; // ★新規：手前ストップによる成りキャンセルフラグ
}

export const resolveCombat = (
  attacker: Piece, target: Piece, clickedPos: Position, currentBoard: Piece[]
): CombatResult => {
  let nextBoard = [...currentBoard];
  let capturedPiece: Piece | null = null;
  let attackerFinalPos = clickedPos; 
  let isMoveBlocked = false; // 成りキャンセル判定

  let actualTarget = target;
  let isShieldSacrifice = false;

  // ★修正：王への攻撃時に盾が身代わりになる処理
  if (target.definitionId === 'king') {
    const shield = nextBoard.find(p => p.owner === target.owner && p.definitionId === 'shield');
    if (shield) {
      actualTarget = shield; // 王の代わりに盾が犠牲になる
      isShieldSacrifice = true;
    }
  }

  const actualTargetDef = getEffectiveDefinition(actualTarget);
  const attackerDef = getEffectiveDefinition(attacker);

  // ★修正：手前ストップの計算は常に「王（本来のターゲット）」に向けて行う
  const calcStopPos = () => {
    const isKnight = attackerDef.id === 'knight'; 
    if (isKnight) return attacker.position;
    const dx = Math.sign(clickedPos.x - attacker.position.x);
    const dy = Math.sign(clickedPos.y - attacker.position.y);
    let current = attacker.position;
    let previous = current;
    const targetArea = getOccupiedPositions(target); // 実際の対象(王)の座標基準
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

  // 1. 盾身代わりの実行
  if (isShieldSacrifice) {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id); // 盾は消滅
    capturedPiece = null; // 盾は手に入らない
    attackerFinalPos = calcStopPos(); // 王の手前で止まる
    isMoveBlocked = true; // ★対象のマスに入れなかったので成り不可
  }
  // 2. 霊が攻撃したときの憑依処理
  else if (attacker.definitionId === 'ghost' && !attacker.components?.possessed) {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id); 
    attackerFinalPos = clickedPos;
    nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos, components: { ...p.components, possessed: actualTarget.definitionId } } : p);
    return { nextBoard, capturedPiece: null, promotionCanceled: false };
  }
  // 3. 霊が攻撃されたとき（攻撃者が霊に取り込まれる）
  else if (actualTarget.definitionId === 'ghost' && !actualTarget.components?.possessed) {
    nextBoard = nextBoard.filter(p => p.id !== attacker.id); 
    nextBoard = nextBoard.map(p => p.id === actualTarget.id ? { ...p, components: { ...p.components, possessed: attacker.definitionId } } : p);
    return { nextBoard, capturedPiece: null, promotionCanceled: false };
  }
  // 4. 双暗の分裂
  else if (actualTargetDef?.tags?.includes('split_on_hit')) {
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
  // 5. 巨大ボス駒（および直接盾を叩いた場合）
  else if (actualTargetDef?.tags?.includes('boss_target') || actualTarget.definitionId === 'shield') {
    if (actualTarget.definitionId === 'shield') {
      // 身代わりではなく盾を直接攻撃した場合は通常取得
      nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
      capturedPiece = { ...actualTarget, components: {} }; 
      attackerFinalPos = clickedPos;
    } else {
      const hp = actualTarget.components.hp ?? 2;
      const newHp = hp - 1;
      if (newHp > 0) {
        attackerFinalPos = calcStopPos(); // 倒せないので手前で止まる
        isMoveBlocked = true; // ★マスに入れないため成り不可
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
        attackerFinalPos = clickedPos; 
      }
    }
  } 
  // 6. 通常駒の取得
  else {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
    capturedPiece = { ...actualTarget, components: { ...actualTarget.components } };
    attackerFinalPos = clickedPos;
  }

  // 取得後の共通クリーンアップ
  if (capturedPiece) {
    if (capturedPiece.definitionId === 'wolf') delete capturedPiece.components.mimicRole;
    if (capturedPiece.definitionId === 'bomb') { capturedPiece.components.isActivated = false; capturedPiece.components.bombTimer = 0; }
    if (capturedPiece.definitionId === 'white_sage') capturedPiece.components.isExhausted = false;
    if (capturedPiece.definitionId === 'nuisance') capturedPiece.definitionId = 'harm';
  }

  let newAttackerComponents = { ...attacker.components };
  if (actualTargetDef?.tags?.includes('poisonous') && capturedPiece) {
    newAttackerComponents.mushroomTimer = 2; // 茸の毒
  }

  nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos, components: newAttackerComponents } : p);
  
  return { nextBoard, capturedPiece, promotionCanceled: isMoveBlocked };
};