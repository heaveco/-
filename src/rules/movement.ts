// @ts-nocheck
// src/rules/movement.ts
import type { Piece, Position } from '../entities/types';
import { PIECE_DEFINITIONS } from '../data/pieces';

const getDirectionMultiplier = (owner: string) => (owner === 'player1' ? 1 : -1);

export const getEffectiveDefinition = (piece: Piece) => {
  if (piece.definitionId === 'wolf' && piece.components?.mimicRole) {
    return PIECE_DEFINITIONS[piece.components.mimicRole];
  }
  return PIECE_DEFINITIONS[piece.definitionId];
};

export const getOccupiedPositions = (piece: Piece): Position[] => {
  const def = getEffectiveDefinition(piece);
  const width = def?.size?.width || 1;
  const height = def?.size?.height || 1;
  const positions: Position[] = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      positions.push({ x: piece.position.x + dx, y: piece.position.y + dy });
    }
  }
  return positions;
};

const isPositionInArea = (pos: Position, area: Position[]): boolean => {
  return area.some(p => p.x === pos.x && p.y === pos.y);
};

export const checkPushFeasibility = (pusher: Piece, targetPos: Position, board: Piece[]): boolean => {
  const dx = Math.sign(targetPos.x - pusher.position.x);
  const dy = Math.sign(targetPos.y - pusher.position.y);
  if (dx === 0 && dy === 0) return false;

  const hypotheticalPusher = { ...pusher, position: targetPos };
  const pusherArea = getOccupiedPositions(hypotheticalPusher);
  
  let pushedGroup = board.filter(p => p.id !== pusher.id && getOccupiedPositions(p).some(pos => pusherArea.some(pa => pa.x === pos.x && pa.y === pos.y)));
  if (pushedGroup.length === 0) return true; 
  
  const O1 = pushedGroup[0].owner;
  if (pushedGroup.some(p => p.owner !== O1)) return false;

  let groupIds = new Set(pushedGroup.map(p => p.id));
  let isExpanding = true;
  
  while (isExpanding) {
    isExpanding = false;
    const nextArea: Position[] = [];
    pushedGroup.forEach(p => getOccupiedPositions({ ...p, position: { x: p.position.x + dx, y: p.position.y + dy } }).forEach(pos => nextArea.push(pos)));

    if (nextArea.some(pos => pos.x < 0 || pos.x > 4 || pos.y < 0 || pos.y > 4)) return false;

    const newHits = board.filter(p => p.id !== pusher.id && !groupIds.has(p.id) && getOccupiedPositions(p).some(pos => nextArea.some(na => na.x === pos.x && na.y === pos.y)));
    const alliesInHits = newHits.filter(p => p.owner === O1);
    
    if (alliesInHits.length > 0) {
      alliesInHits.forEach(p => { pushedGroup.push(p); groupIds.add(p.id); });
      isExpanding = true;
    }
  }

  const nextArea: Position[] = [];
  pushedGroup.forEach(p => getOccupiedPositions({ ...p, position: { x: p.position.x + dx, y: p.position.y + dy } }).forEach(pos => nextArea.push(pos)));
  const targets = board.filter(p => p.id !== pusher.id && !groupIds.has(p.id) && getOccupiedPositions(p).some(pos => nextArea.some(na => na.x === pos.x && na.y === pos.y)));

  if (targets.some(t => t.owner === O1)) return false;
  
  const solidTargets = targets.filter(t => !PIECE_DEFINITIONS[t.definitionId]?.tags?.includes('trap'));

  if (solidTargets.length > 0) {
    if (pushedGroup.some(p => (PIECE_DEFINITIONS[p.definitionId]?.size?.width || 1) > 1)) {
      if (solidTargets.length >= 2) return false;
    } else {
      if (solidTargets.length >= 2) return false;
    }
  }
  return true;
};

export const calculateMovablePositions = (piece: Piece, board: Piece[], turnCount: number = 1): Position[] => {
  const definition = getEffectiveDefinition(piece);
  if (!definition) return [];
  if (definition.tags?.includes('requires_turn_5') && turnCount < 5) return [];
  
  // ★新規：被弾した「回復双子」の移動不可判定
  if (definition.tags?.includes('immobilized_if_damaged') && (piece.components?.hp || 2) < 2) return [];

  const movablePositions: Position[] = [];
  const dir = getDirectionMultiplier(piece.owner);

  for (const rule of definition.moveRules) {
    if (rule.generator === 'relative') {
      for (const offset of rule.params) {
        movablePositions.push({ x: piece.position.x + offset.dx, y: piece.position.y + (offset.dy * dir) });
      }
    } else if (rule.generator === 'edge_warp') {
      if (piece.position.x === 0) movablePositions.push({ x: 4, y: piece.position.y });
      if (piece.position.x === 4) movablePositions.push({ x: 0, y: piece.position.y });
      if (piece.position.y === 0) movablePositions.push({ x: piece.position.x, y: 4 });
      if (piece.position.y === 4) movablePositions.push({ x: piece.position.x, y: 0 });
    } else if (rule.generator === 'straight') {
      for (const offset of rule.params) {
        let curX = piece.position.x;
        let curY = piece.position.y;
        while (true) {
          curX += offset.dx;
          curY += (offset.dy * dir);
          if (curX < 0 || curX > 4 || curY < 0 || curY > 4) break;
          movablePositions.push({ x: curX, y: curY });
          const isHit = board.some(p => p.id !== piece.id && !PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap') && getOccupiedPositions(p).some(pos => pos.x === curX && pos.y === curY));
          if (isHit) break;
        }
      }
    }
  }

  return movablePositions.filter(targetPos => {
    if (definition.tags?.includes('pusher')) {
      return checkPushFeasibility(piece, targetPos, board);
    }

    const hypotheticalPiece: Piece = { ...piece, position: targetPos };
    const destinationArea = getOccupiedPositions(hypotheticalPiece);
    const isAllOnBoard = destinationArea.every(pos => pos.x >= 0 && pos.x <= 4 && pos.y >= 0 && pos.y <= 4);
    if (!isAllOnBoard) return false;

    const overlappingPieces = board.filter(otherPiece => {
      if (otherPiece.id === piece.id) return false; 
      if (PIECE_DEFINITIONS[otherPiece.definitionId]?.tags?.includes('trap')) return false;
      const otherPieceArea = getOccupiedPositions(otherPiece);
      return destinationArea.some(destPos => isPositionInArea(destPos, otherPieceArea));
    });

    if (definition.size && (definition.size.width > 1 || definition.size.height > 1)) {
      const allyCount = overlappingPieces.filter(p => p.owner === piece.owner).length;
      const enemyCount = overlappingPieces.filter(p => p.owner !== piece.owner).length;
      if (allyCount > 0) return false;
      if (enemyCount >= 2) return false;
      return true;
    }

    const hasAlly = overlappingPieces.some(p => p.owner === piece.owner);
    if (hasAlly) return false;

    return true;
  });
};

export const checkPromotion = (piece: Piece, newPos: Position): boolean => {
  const definition = getEffectiveDefinition(piece);
  if (!definition?.promotion || definition.promotion.condition !== 'in_enemy_zone') return false;
  if (piece.owner === 'player1' && newPos.y <= 1) return true;
  if (piece.owner === 'player2' && newPos.y >= 3) return true;
  return false;
};