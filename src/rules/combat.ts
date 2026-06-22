// @ts-nocheck
// src/rules/combat.ts
import type { Piece, Position } from '../entities/types';
import { getEffectiveDefinition, getOccupiedPositions } from './movement';

export interface CombatResult {
  nextBoard: Piece[];
  capturedPieces: Piece[]; // ★ 配列に変更
  promotionCanceled: boolean;
}

const getOverlapCount = (areaA: Position[], areaB: Position[]): number => {
  return areaA.filter(a => areaB.some(b => a.x === b.x && a.y === b.y)).length;
};

// ★ 新規：1体に対して「このダメージ量で完全取得できるか」を事前チェック
const canFullyCapture = (target: Piece, damage: number): boolean => {
  const def = getEffectiveDefinition(target);
  if (def?.tags?.includes('boss_target')) {
    const hp = target.components.hp ?? 2;
    return hp - damage <= 0;
  }
  // split_on_hit は分裂するだけで取得にならない
  if (def?.tags?.includes('split_on_hit')) return false;
  // ghost（未憑依）は取得にならない
  //if (target.definitionId === 'ghost' && !target.components?.possessed) return false;
  // 通常駒は1ダメージで取得可能
  return true;
};

export const resolveCombat = (
  attacker: Piece,
  targetPieces: Piece | Piece[], // ★ 配列も受け取れるように
  clickedPos: Position,
  currentBoard: Piece[]
): CombatResult | null => { // ★ 2体同時で取得不可な場合は null を返す
  let nextBoard = [...currentBoard];
  let capturedPieces: Piece[] = []; // ★ 配列に変更
  let attackerFinalPos = clickedPos;
  let isMoveBlocked = false;

  // ★ 配列化して共通処理へ
  const targets = Array.isArray(targetPieces) ? targetPieces : [targetPieces];

  // ★ 2体同時攻撃の場合：両方が完全取得できなければ攻撃不可
  if (targets.length >= 2) {
    const attackerDef = getEffectiveDefinition(attacker);
    const attackerDestArea = getOccupiedPositions({ ...attacker, position: clickedPos });

    for (const target of targets) {
      // 盾の肩代わりチェック
      let actualTarget = target;
      if (target.definitionId === 'king') {
        const shield = nextBoard.find(p => p.owner === target.owner && p.definitionId === 'shield');
        if (shield) actualTarget = shield;
      }
      const targetArea = getOccupiedPositions(actualTarget);
      const damage = getOverlapCount(attackerDestArea, targetArea);
      if (!canFullyCapture(actualTarget, damage)) return null; // 一体でも取れなければ全体を不可に
    }
  }

  // ★ 1体ずつ既存ロジックでループ処理
  for (const target of targets) {
    const attackerDef = getEffectiveDefinition(attacker);
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
    let calculatedDamage = 1;

    const calcStopPos = () => {
      if (attackerDef.id === 'knight') {
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
        const overlap = getOverlapCount(myNextArea, targetArea);
        if (overlap > 0) {
          calculatedDamage = overlap;
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
      attackerFinalPos = calcStopPos();
      isMoveBlocked = true;
    }
    else if (attacker.definitionId === 'ghost') {
      // 霊自身は消滅し、対象に「憑依」状態を付与する（対象のサイズは維持される）
      nextBoard = nextBoard.filter(p => p.id !== attacker.id); // 攻撃側の霊を消す
      nextBoard = nextBoard.map(p => p.id === actualTarget.id
        ? { 
            ...p, 
            owner: attacker.owner, // ★所有者を霊の持ち主に変更
            components: { 
              ...p.components, 
              ghostAttached: attacker.owner, 
              originalOwner: p.owner // ★元の所有者を記録
            } 
          }
        : p
      );
      return { nextBoard, capturedPieces: [], promotionCanceled: false };
    }
    //else if (actualTarget.definitionId === 'ghost' && !actualTarget.components?.possessed) {
      //nextBoard = nextBoard.filter(p => p.id !== attacker.id);
      //nextBoard = nextBoard.map(p => p.id === actualTarget.id
        //? { ...p, components: { ...p.components, possessed: attacker.definitionId } }
        //: p
      //);
      //return { nextBoard, capturedPieces: [], promotionCanceled: false };
    //}
    else if (actualTargetDef?.tags?.includes('split_on_hit')) {
      nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
      attackerFinalPos = clickedPos;
      const hitX = clickedPos.x;
      const survivingX = hitX === actualTarget.position.x
        ? actualTarget.position.x + 1
        : actualTarget.position.x;
      nextBoard.push({
        id: `${actualTarget.owner}_loser_split_${Date.now()}_${Math.random()}`,
        definitionId: 'loser', owner: actualTarget.owner,
        position: { x: survivingX, y: actualTarget.position.y }, components: {}
      });
    }
    else if (actualTargetDef?.tags?.includes('boss_target') || actualTarget.definitionId === 'shield') {
      if (actualTarget.definitionId === 'shield') {
        nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
        capturedPieces.push({ ...actualTarget, components: {} });
        attackerFinalPos = clickedPos;
      } else {
        attackerFinalPos = calcStopPos();
        isMoveBlocked = true;
        const hp = actualTarget.components.hp ?? 2;
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
          // ★追加：憑依されている場合は持ち駒に追加せず「破壊」
          if (!actualTarget.components?.ghostAttached) {
            capturedPieces.push({ ...actualTarget, components: { ...actualTarget.components, hp: 2 } });
          }
          attackerFinalPos = clickedPos;
          isMoveBlocked = false;
        }
      }
    }
    else {
      nextBoard = nextBoard.filter(p => p.id !== actualTarget.id);
      // ★追加：憑依されている場合は持ち駒に追加せず「破壊」
      if (!actualTarget.components?.ghostAttached) {
        capturedPieces.push({ ...actualTarget, components: { ...actualTarget.components } });
      }
      attackerFinalPos = clickedPos;
    }

    // 毒チェック（ターゲットごとに判定）
    if (actualTargetDef?.tags?.includes('poisonous') && capturedPieces.length > 0) {
      attacker = { ...attacker, components: { ...attacker.components, mushroomTimer: 2 } };
    }
  }

  // クリーンアップ（全取得駒に対して）
  capturedPieces = capturedPieces.map(cp => {
    let c = { ...cp };
    if (c.definitionId === 'wolf') delete c.components.mimicRole;
    if (c.definitionId === 'bomb') { c.components.isActivated = false; c.components.bombTimer = 0; }
    if (c.definitionId === 'white_sage') c.components.isExhausted = false;
    if (c.definitionId === 'nuisance') c.definitionId = 'harm';
    c.owner = attacker.owner;
    if (attacker.owner === cp.owner) {
      c.owner = attacker.owner === 'player1' ? 'player2' : 'player1';
    }
    return c;
  });

  nextBoard = nextBoard.map(p =>
    p.id === attacker.id
      ? { ...p, position: attackerFinalPos, components: attacker.components }
      : p
  );

  return { nextBoard, capturedPieces, promotionCanceled: isMoveBlocked };
};