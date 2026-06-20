// @ts-nocheck
// src/rules/combat.ts
import type { Piece, Position } from '../entities/types';
import { getEffectiveDefinition, getOccupiedPositions } from './movement';

export interface CombatResult {
  nextBoard: Piece[];
  capturedPiece: Piece | null;
  promotionCanceled: boolean;
}

// ★新規追加：2つの面積（配列）が「いくつ重なっているか」をカウントするヘルパー関数
const getOverlapCount = (areaA: Position[], areaB: Position[]): number => {
  return areaA.filter(a => areaB.some(b => a.x === b.x && a.y === b.y)).length;
};

export const resolveCombat = (
  attacker: Piece, target: Piece, clickedPos: Position, currentBoard: Piece[]
): CombatResult => {
  let nextBoard = [...currentBoard];
  let capturedPiece: Piece | null = null;
  let attackerFinalPos = clickedPos; 
  let isMoveBlocked = false; 

  let actualTarget = target;
  let isShieldSacrifice = false;

  if (target.definitionId === 'king') {
    const shield = nextBoard.find(p => p.owner === target.owner && p.definitionId === 'shield');
    if (shield) {
      actualTarget = shield; 
      isShieldSacrifice = true;
    }
  }

  const actualTargetDef = getEffectiveDefinition(actualTarget);
  const attackerDef = getEffectiveDefinition(attacker);

  // --- 変数としてダメージ量を定義（デフォルトは1） ---
  let calculatedDamage = 1;

  const calcStopPos = () => {
    const isKnight = attackerDef.id === 'knight'; 
    if (isKnight) {
      // 桂馬のジャンプ攻撃は、着地点のめり込み数を計算
      const jumpArea = getOccupiedPositions({ ...attacker, position: clickedPos });
      const targetArea = getOccupiedPositions(target);
      const overlap = getOverlapCount(jumpArea, targetArea);
      if (overlap > 0) calculatedDamage = overlap;
      return attacker.position;
    }

    const dx = Math.sign(clickedPos.x - attacker.position.x);
    const dy = Math.sign(clickedPos.y - attacker.position.y);
    let current = attacker.position;
    let previous = current;
    const targetArea = getOccupiedPositions(target); 

    for (let i = 0; i < 5; i++) {
      const nextPos = { x: current.x + dx, y: current.y + dy };
      const myNextArea = getOccupiedPositions({ ...attacker, position: nextPos });
      
      // ★修正：重なっているマスの数を取得
      const overlap = getOverlapCount(myNextArea, targetArea);
      
      if (overlap > 0) {
        calculatedDamage = overlap; // 接触面積をダメージ量として記録
        break;
      }
      previous = nextPos;
      current = nextPos;
      if (current.x === clickedPos.x && current.y === clickedPos.y) break;
    }
    return previous;
  };

  if (isShieldSacrifice) {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id); 
    capturedPiece = null; 
    attackerFinalPos = calcStopPos(); 
    isMoveBlocked = true; 
  }
  else if (attacker.definitionId === 'ghost' && !attacker.components?.possessed) {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id); 
    attackerFinalPos = clickedPos;
    nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos, components: { ...p.components, possessed: actualTarget.definitionId } } : p);
    return { nextBoard, capturedPiece: null, promotionCanceled: false };
  }
  else if (actualTarget.definitionId === 'ghost' && !actualTarget.components?.possessed) {
    nextBoard = nextBoard.filter(p => p.id !== attacker.id); 
    nextBoard = nextBoard.map(p => p.id === actualTarget.id ? { ...p, components: { ...p.components, possessed: attacker.definitionId } } : p);
    return { nextBoard, capturedPiece: null, promotionCanceled: false };
  }
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
  else if (actualTargetDef?.tags?.includes('boss_target') || actualTarget.definitionId === 'shield') {
    if (actualTarget.definitionId === 'shield') {
      nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
      capturedPiece = { ...actualTarget, components: {} }; 
      attackerFinalPos = clickedPos;
    } else {
      attackerFinalPos = calcStopPos(); // ここで calculatedDamage が算出される
      isMoveBlocked = true; 

      const hp = actualTarget.components.hp ?? 2;
      // ★修正：固定の1ダメージではなく、接触したマス数を引く
      const newHp = hp - calculatedDamage; 

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
        attackerFinalPos = clickedPos; // 倒した場合は手前ではなくそのマスに入れる
        isMoveBlocked = false; // 倒したのでマスに入れて成りも可能
      }
    }
  } 
  else {
    nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
    capturedPiece = { ...actualTarget, components: { ...actualTarget.components } };
    attackerFinalPos = clickedPos;
  }

// クリーンアップ
  if (capturedPiece) {
    if (capturedPiece.definitionId === 'wolf') delete capturedPiece.components.mimicRole;
    if (capturedPiece.definitionId === 'bomb') { capturedPiece.components.isActivated = false; capturedPiece.components.bombTimer = 0; }
    if (capturedPiece.definitionId === 'white_sage') capturedPiece.components.isExhausted = false;
    if (capturedPiece.definitionId === 'nuisance') capturedPiece.definitionId = 'harm';
    
    // ★修正：取得した駒の所有権（owner）を戦闘ルール側で完全に決定する
    // 基本は「攻撃者（取った側）」の持ち駒になる
    capturedPiece.owner = attacker.owner;
    // ただし、攻撃者と元の持ち主が同じ（味方同士討ち）なら「相手」の持ち駒にするペナルティ
    if (attacker.owner === actualTarget.owner) {
      capturedPiece.owner = attacker.owner === 'player1' ? 'player2' : 'player1';
    }
  }

  let newAttackerComponents = { ...attacker.components };
  if (actualTargetDef?.tags?.includes('poisonous') && capturedPiece) {
    newAttackerComponents.mushroomTimer = 2; 
  }

  nextBoard = nextBoard.map(p => p.id === attacker.id ? { ...p, position: attackerFinalPos, components: newAttackerComponents } : p);
  
  return { nextBoard, capturedPiece, promotionCanceled: isMoveBlocked };
};