// @ts-nocheck
// src/engine/gameReducer.ts
import type { GameState, GameAction } from './types';
import { PIECE_DEFINITIONS } from '../data/pieces';
import type { Piece, PlayerId, Position } from '../entities/types';
import { checkPromotion, getOccupiedPositions, getEffectiveDefinition } from '../rules/movement';
import { resolveCombat } from '../rules/combat';
import { evaluateVictoryConditions, type VictoryResult } from '../rules/victory';

const INITIAL_KINGS: Piece[] = [
  { id: 'p1_king', definitionId: 'king', owner: 'player1', position: { x: 2, y: 4 }, components: {} },
  { id: 'p2_king', definitionId: 'king', owner: 'player2', position: { x: 2, y: 0 }, components: {} },
];

const PIECE_POOL = ['pawn', 'silver', 'gold', 'lance', 'rook', 'bishop', 'knight', 'troll', 'trickster', 'wolf', 'hero', 'nuisance', 'bomb', 'landmine', 'bullet', 'drunk', 'renda', 'twins', 'twin_assassin', 'white_sage', 'mushroom', 'shield', 'ghost', 'gamble_jumper', 'anti_promote']; 
const DEMOTE_MAP: Record<string, string> = { 'tokin': 'pawn', 'promoted_silver': 'silver', 'promoted_lance': 'lance', 'promoted_rook': 'rook', 'promoted_bishop': 'bishop', 'promoted_knight': 'knight', 'promoted_trickster': 'trickster', 'promoted_drunk': 'drunk' , 'promoted_anti_promote': 'anti_promote','activated_bomb': 'bomb' };

const resolveNextPlacementPhase = (np1: string[], np2: string[], nt1: string[], nt2: string[], board: Piece[], cap: Piece[]) => {
  if (np1.length > 0) return { phase: 'placement_p1', player: 'player1' };
  if (np2.length > 0) return { phase: 'placement_p2', player: 'player2' };
  if (nt1.length > 0) return { phase: 'trap_placement_p1', player: 'player1' };
  if (nt2.length > 0) return { phase: 'trap_placement_p2', player: 'player2' };
  
  const hasP2Renda = board.some(p => p.owner === 'player2' && p.definitionId === 'renda') || cap.some(p => p.owner === 'player2' && p.definitionId === 'renda');
  const hasP1Renda = board.some(p => p.owner === 'player1' && p.definitionId === 'renda') || cap.some(p => p.owner === 'player1' && p.definitionId === 'renda');
  
  if (hasP2Renda) return { phase: 'renda_quota_p1', player: 'player1' }; 
  if (hasP1Renda) return { phase: 'renda_quota_p2', player: 'player2' };
  
  return { phase: 'playing', player: 'player1' };
};

export const getInitialGameState = (): GameState => {
  const drawRandomPieces = () => {
    const drawn: string[] = [];
    for (let i = 0; i < 4; i++) drawn.push(PIECE_POOL[Math.floor(Math.random() * PIECE_POOL.length)]);
    return drawn;
  };
  const p1Q: string[] = []; const p2Q: string[] = []; const cap: Piece[] = [];
  const p1TrapQ: string[] = []; const p2TrapQ: string[] = [];
  
  const processDraw = (draw: string[], player: PlayerId, queue: string[], trapQueue: string[]) => {
    draw.forEach(defId => {
      const def = PIECE_DEFINITIONS[defId];
      if (def?.tags?.includes('trap')) trapQueue.push(defId);
      else if (def?.tags?.includes('start_in_hand')) cap.push({ id: `${player}_initcap_${Date.now()}_${Math.random()}`, definitionId: defId, owner: player, position: { x: -1, y: -1 }, components: { ...(def.defaultComponents || {}) } });
      else queue.push(defId);
    });
  };

  processDraw(drawRandomPieces(), 'player1', p1Q, p1TrapQ);
  processDraw(drawRandomPieces(), 'player2', p2Q, p2TrapQ);
  
  const initialData = resolveNextPlacementPhase(p1Q, p2Q, p1TrapQ, p2TrapQ, [...INITIAL_KINGS], cap);
  
  return {
    phase: initialData.phase, pieces: [...INITIAL_KINGS], capturedPieces: cap,
    p1Queue: p1Q, p2Queue: p2Q, p1TrapQueue: p1TrapQ, p2TrapQueue: p2TrapQ,
    currentPlayer: initialData.player as PlayerId, selectedPieceId: null, pendingPromotion: null, winner: null,
    turnCount: 1, mustDropState: null, pendingBombActivation: null,
    rendaQuotas: { player1: 3, player2: 3 }, rendaSettingState: null, rendaPlayState: null,
    bulletMinigameData: null, pendingMineConfirmation: null,
    turnState: { hasDoubledUp: false, isSecondMove: false }, turnSkipState: { player1: false, player2: false },
    pendingAction: null, chohanState: null, rouletteState: null, wolfDeclaration: null, accuseState: null, swapAbilityState: null,
  };
};

const handleTurnStartEvents = (state: GameState, nextPlayer: PlayerId, currentBoard: Piece[]) => {
  let nextBoard = [...currentBoard];
  let newWinner: VictoryResult | null = null;
  
  nextBoard = nextBoard.map(p => {
    let newComps = { ...p.components };
    if (p.owner === nextPlayer) {
      if ((newComps.mushroomTimer || 0) > 0) newComps.mushroomTimer -= 1;
      if (p.definitionId === 'twins' && newComps.hp === 1) {
        if ((newComps.recoveryTimer || 0) > 0) newComps.recoveryTimer -= 1;
        else newComps.hp = 2;
      }
    }
    return { ...p, components: newComps };
  });

  const explodingBombs = nextBoard.filter(p => p.owner === nextPlayer && (p.definitionId === 'bomb' || p.definitionId === 'activated_bomb') && p.components?.isActivated && (p.components.bombTimer || 0) <= 1);
  nextBoard = nextBoard.map(p => {
    if (p.owner === nextPlayer && (p.definitionId === 'bomb' || p.definitionId === 'activated_bomb') && p.components?.isActivated) {
      return { ...p, components: { ...p.components, bombTimer: p.components.bombTimer - 1 } };
    }
    return p;
  });

  if (explodingBombs.length > 0) {
    let allExAreas: Position[] = [];
    explodingBombs.forEach(b => {
      const bx = b.position.x; const by = b.position.y;
      allExAreas.push({x:bx-1, y:by-1}, {x:bx, y:by-1}, {x:bx+1, y:by-1}, {x:bx-1, y:by}, {x:bx, y:by}, {x:bx+1, y:by}, {x:bx-1, y:by+1}, {x:bx, y:by+1}, {x:bx+1, y:by+1});
    });
    
    let shieldsToDestroy = new Set<string>();
    nextBoard.forEach(target => {
      const tArea = getOccupiedPositions(target);
      const isHit = tArea.some(tp => allExAreas.some(ep => tp.x === ep.x && tp.y === ep.y));
      if (isHit && target.definitionId === 'king') {
        const shield = nextBoard.find(p => p.owner === target.owner && p.definitionId === 'shield' && !shieldsToDestroy.has(p.id));
        if (shield) shieldsToDestroy.add(shield.id);
        else newWinner = { winner: target.owner === 'player1' ? 'player2' : 'player1', reason: '爆発により王が消滅しました！' };
      }
    });
    
    nextBoard = nextBoard.filter(target => {
      const tArea = getOccupiedPositions(target);
      const isHit = tArea.some(tp => allExAreas.some(ep => tp.x === ep.x && tp.y === ep.y));
      if (shieldsToDestroy.has(target.id)) return false; 
      if (isHit && target.definitionId === 'king') {
         const shield = nextBoard.find(p => p.owner === target.owner && p.definitionId === 'shield');
         if (shield) return true; 
      }
      return !isHit; 
    });
  }
  return { nextBoard, newWinner };
};

const endCurrentTurn = (state: GameState, tempPieces: Piece[] = state.pieces): GameState => {
  let nextState = { ...state };
  const nextPlayer = nextState.currentPlayer === 'player1' ? 'player2' : 'player1';
  nextState.turnState = { hasDoubledUp: false, isSecondMove: false };
  nextState.turnCount += 1;
  
  const { nextBoard, newWinner } = handleTurnStartEvents(nextState, nextPlayer, tempPieces);
  nextState.pieces = nextBoard;
  if (newWinner) nextState.winner = newWinner;

  if (nextState.turnSkipState[nextPlayer]) {
    nextState.turnSkipState = { ...nextState.turnSkipState, [nextPlayer]: false };
    nextState.currentPlayer = nextState.currentPlayer; 
    nextState.turnCount += 1;
    const res = handleTurnStartEvents(nextState, nextState.currentPlayer, nextBoard);
    nextState.pieces = res.nextBoard;
    if (res.newWinner) nextState.winner = res.newWinner;
  } else {
    nextState.currentPlayer = nextPlayer;
  }
  return nextState;
};

const executeMove = (state: GameState, payload: { pieceId: string, to: Position, isDrop: boolean, skipTurnChange?: boolean, wolfMimicRole?: string, newUseCount?: number, destroyedAllyMineIds?: string[] }): GameState => {
  let nextState = { ...state };
  let nextPieces = [...nextState.pieces];
  let nextCaptured = [...nextState.capturedPieces];
  let lastActionData: any = null;
  let promotionCanceled = false; 

  let { pieceId, to, isDrop, skipTurnChange = false, wolfMimicRole, newUseCount, destroyedAllyMineIds } = payload;
  const activePiece = isDrop ? nextCaptured.find(p => p.id === pieceId) : nextPieces.find(p => p.id === pieceId);
  if (!activePiece) return nextState;

  const activeDef = getEffectiveDefinition(activePiece);
  const isPusher = activeDef?.tags?.includes('pusher');

  if (!destroyedAllyMineIds) {
    let allyMines: string[] = [];
    if (!isDrop) {
      const diffX = to.x - activePiece.position.x;
      const diffY = to.y - activePiece.position.y;
      const isLinearPath = (diffX === 0 || diffY === 0 || Math.abs(diffX) === Math.abs(diffY)) && activeDef?.id !== 'knight' && !(activeDef?.moveRules.some((r: any) => r.generator === 'edge_warp') && (Math.abs(diffX) === 4 || Math.abs(diffY) === 4));
                           
      if (isLinearPath) {
        const dx = Math.sign(diffX); const dy = Math.sign(diffY);
        let cx = activePiece.position.x + dx; let cy = activePiece.position.y + dy;
        if (dx !== 0 || dy !== 0) {
          while(cx !== to.x || cy !== to.y) {
            const mine = nextPieces.find(p => p.position.x === cx && p.position.y === cy && PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap'));
            if (mine && mine.owner === nextState.currentPlayer) allyMines.push(mine.id);
            cx += dx; cy += dy;
          }
        }
      }
    }
    const destMine = nextPieces.find(p => p.position.x === to.x && p.position.y === to.y && PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap'));
    if (destMine && destMine.owner === nextState.currentPlayer && !allyMines.includes(destMine.id)) { allyMines.push(destMine.id); }

    if (allyMines.length > 0) {
      nextState.pendingMineConfirmation = { args: [pieceId, to, isDrop, skipTurnChange, wolfMimicRole, newUseCount, allyMines], mineIds: allyMines };
      nextState.phase = 'mine_confirm';
      return nextState; 
    }
  }

  let finalTo = to;
  let hitMineId: string | null = null;

  if (!isDrop) {
    const diffX = to.x - activePiece.position.x; const diffY = to.y - activePiece.position.y;
    const isLinearPath = (diffX === 0 || diffY === 0 || Math.abs(diffX) === Math.abs(diffY)) && activeDef?.id !== 'knight' && !(activeDef?.moveRules.some((r: any) => r.generator === 'edge_warp') && (Math.abs(diffX) === 4 || Math.abs(diffY) === 4));
    if (isLinearPath) {
      const dx = Math.sign(diffX); const dy = Math.sign(diffY);
      let cx = activePiece.position.x + dx; let cy = activePiece.position.y + dy;
      if (dx !== 0 || dy !== 0) {
        while(cx !== to.x || cy !== to.y) {
          const mine = nextPieces.find(p => p.position.x === cx && p.position.y === cy && PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap'));
          if (mine) { finalTo = { x: cx, y: cy }; hitMineId = mine.id; break; }
          cx += dx; cy += dy;
        }
      }
    }
  }
  
  if (!hitMineId) {
    const mine = nextPieces.find(p => p.position.x === finalTo.x && p.position.y === finalTo.y && PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap'));
    if (mine) hitMineId = mine.id;
  }

  if (hitMineId) {
    if (isDrop) {
      nextCaptured = nextCaptured.filter(p => p.id !== pieceId);
      nextPieces = nextPieces.filter(p => p.id !== hitMineId);
      if (activePiece.definitionId === 'king') nextState.winner = { winner: activePiece.owner === 'player1' ? 'player2' : 'player1', reason: '王が地雷の上に置かれて爆死しました！' };
      if (nextState.mustDropState?.pieceId === pieceId) nextState.mustDropState = null;
      lastActionData = { type: 'drop', definitionId: activePiece.definitionId, x: finalTo.x };
    } else {
      nextPieces = nextPieces.filter(p => p.id !== activePiece.id && p.id !== hitMineId);
      if (activePiece.definitionId === 'king') nextState.winner = { winner: activePiece.owner === 'player1' ? 'player2' : 'player1', reason: '王が地雷を踏んで爆死しました！' };
      lastActionData = { type: 'move' };
    }
  } else if (isDrop) {
    let targetPiece = undefined;
    for (const p of nextPieces) {
      if (p.id === activePiece.id) continue;
      if (p.owner !== nextState.currentPlayer || activePiece.definitionId === 'gamble_jumper') {
        const targetArea = getOccupiedPositions(p);
        const myDestArea = getOccupiedPositions({ ...activePiece, position: finalTo });
        if (myDestArea.some(dp => targetArea.some(tp => tp.x === dp.x && tp.y === dp.y))) { targetPiece = p; break; }
      }
    }
    
    if (targetPiece) {
      nextCaptured = nextCaptured.filter(p => p.id !== pieceId);
      const combatResult = resolveCombat(activePiece, targetPiece, finalTo, nextPieces);
      if (combatResult.capturedPiece) {
        const capDef = combatResult.capturedPiece.definitionId;
        const originalDefId = DEMOTE_MAP[capDef] || capDef;
        const newCapId = `cap_${Date.now()}_${Math.random()}`;
        nextCaptured.push({ ...combatResult.capturedPiece!, owner: combatResult.capturedPiece.owner, definitionId: originalDefId, id: newCapId });
        if (PIECE_DEFINITIONS[capDef]?.tags?.includes('force_drop_if_captured')) {
          nextState.mustDropState = { playerId: nextState.currentPlayer, pieceId: newCapId }; skipTurnChange = false; 
        }
      }
      nextPieces = combatResult.nextBoard;
      promotionCanceled = combatResult.promotionCanceled;
      lastActionData = { type: 'drop', definitionId: activePiece.definitionId, x: finalTo.x };
    } else {
      nextCaptured = nextCaptured.filter(p => p.id !== pieceId);
      const newPiece = { ...activePiece, position: finalTo };
      if (wolfMimicRole) newPiece.components.mimicRole = wolfMimicRole;
      if (newUseCount !== undefined) newPiece.components.useCount = newUseCount;
      nextPieces.push(newPiece);
      lastActionData = { type: 'drop', definitionId: newPiece.definitionId, x: finalTo.x };
    }
    if (nextState.mustDropState?.pieceId === pieceId) nextState.mustDropState = null; 
  } else if (isPusher) {
    const dx = Math.sign(finalTo.x - activePiece.position.x);
    const dy = Math.sign(finalTo.y - activePiece.position.y);
    const hypotheticalPusher = { ...activePiece, position: finalTo };
    const pusherArea = getOccupiedPositions(hypotheticalPusher);
    let pushedGroup = nextPieces.filter(p => p.id !== activePiece.id && getOccupiedPositions(p).some(pos => pusherArea.some(pa => pa.x === pos.x && pa.y === pos.y)));
    
    if (pushedGroup.length > 0) {
      const O1 = pushedGroup[0].owner; 
      let groupIds = new Set(pushedGroup.map(p => p.id));
      let isExpanding = true;
      while (isExpanding) {
        isExpanding = false;
        const nextArea: Position[] = [];
        pushedGroup.forEach(p => getOccupiedPositions({ ...p, position: { x: p.position.x + dx, y: p.position.y + dy } }).forEach(pos => nextArea.push(pos)));
        const newHits = nextPieces.filter(p => p.id !== activePiece.id && !groupIds.has(p.id) && getOccupiedPositions(p).some(pos => nextArea.some(na => na.x === pos.x && na.y === pos.y)));
        const alliesInHits = newHits.filter(p => p.owner === O1);
        if (alliesInHits.length > 0) { alliesInHits.forEach(p => { pushedGroup.push(p); groupIds.add(p.id); }); isExpanding = true; }
      }
      const nextArea: Position[] = [];
      pushedGroup.forEach(p => getOccupiedPositions({ ...p, position: { x: p.position.x + dx, y: p.position.y + dy } }).forEach(pos => nextArea.push(pos)));
      const targets = nextPieces.filter(p => p.id !== activePiece.id && !groupIds.has(p.id) && getOccupiedPositions(p).some(pos => nextArea.some(na => na.x === pos.x && na.y === pos.y)));

      nextPieces = nextPieces.map(p => {
        if (groupIds.has(p.id)) return { ...p, position: { x: p.position.x + dx, y: p.position.y + dy } };
        return p;
      });

      targets.forEach(target => {
        if (PIECE_DEFINITIONS[target.definitionId]?.tags?.includes('trap')) {
          const steppingPiece = pushedGroup.find(p => getOccupiedPositions({ ...p, position: { x: p.position.x + dx, y: p.position.y + dy } }).some(pos => getOccupiedPositions(target).some(tpos => tpos.x === pos.x && tpos.y === pos.y)));
          nextPieces = nextPieces.filter(p => p.id !== target.id && p.id !== steppingPiece?.id);
          if (steppingPiece?.definitionId === 'king') nextState.winner = { winner: O1 === 'player1' ? 'player2' : 'player1', reason: '玉突きで押し出された王が地雷を踏みました！' };
        } else {
          const steppingPiece = pushedGroup.find(p => getOccupiedPositions({ ...p, position: { x: p.position.x + dx, y: p.position.y + dy } }).some(pos => getOccupiedPositions(target).some(tpos => tpos.x === pos.x && tpos.y === pos.y)));
          
          if (target.definitionId === 'king') {
             const shield = nextPieces.find(p => p.owner === target.owner && p.definitionId === 'shield');
             if (shield) { nextPieces = nextPieces.filter(p => p.id !== shield.id); return; }
          }
          if (target.definitionId === 'ghost' && !target.components?.possessed && steppingPiece) {
             target.components.possessed = steppingPiece.definitionId;
             nextPieces = nextPieces.filter(p => p.id !== steppingPiece.id); 
          } else if (steppingPiece?.definitionId === 'ghost' && !steppingPiece.components?.possessed) {
             steppingPiece.components.possessed = target.definitionId;
             nextPieces = nextPieces.filter(p => p.id !== target.id);
          } else if (target.definitionId !== 'twin_assassin') {
            let captured = { ...target };
            if (captured.definitionId === 'wolf') delete captured.components.mimicRole;
            if (captured.definitionId === 'nuisance') captured.definitionId = 'harm';
            if (captured.definitionId === 'bomb'|| captured.definitionId === 'activated_bomb') { captured.components.isActivated = false; captured.components.bombTimer = 0; }
            if (captured.definitionId === 'white_sage') captured.components.isExhausted = false;
            
            const capDef = captured.definitionId;
            const originalDefId = DEMOTE_MAP[capDef] || capDef;
            const newCapId = `cap_${Date.now()}_${Math.random()}`;
            nextCaptured.push({ ...captured, owner: O1, definitionId: originalDefId, id: newCapId, components: { ...captured.components, hp: 2 } });
            if (PIECE_DEFINITIONS[capDef]?.tags?.includes('force_drop_if_captured')) {
              nextState.mustDropState = { playerId: O1, pieceId: newCapId }; skipTurnChange = false; 
            }
            if (PIECE_DEFINITIONS[capDef]?.tags?.includes('poisonous') && steppingPiece) {
               steppingPiece.components.mushroomTimer = 2;
            }
            nextPieces = nextPieces.filter(p => p.id !== target.id);
          }
        }
      });
    }
    nextPieces = nextPieces.map(p => p.id === activePiece.id ? { ...p, position: finalTo } : p);
    lastActionData = { type: 'move' };
  } else {
    let targetPiece = undefined;
    for (const p of nextPieces) {
      if (p.id === activePiece.id) continue; 
      if (p.owner !== nextState.currentPlayer || activePiece.definitionId === 'gamble_jumper') {
        const targetArea = getOccupiedPositions(p);
        const myDestArea = getOccupiedPositions({ ...activePiece, position: finalTo });
        if (myDestArea.some(dp => targetArea.some(tp => tp.x === dp.x && tp.y === dp.y))) { targetPiece = p; break; }
      }
    }
    if (targetPiece) {
      const combatResult = resolveCombat(activePiece, targetPiece, finalTo, nextPieces);
      if (combatResult.capturedPiece) {
        const capDef = combatResult.capturedPiece.definitionId;
        const originalDefId = DEMOTE_MAP[capDef] || capDef;
        const newCapId = `cap_${Date.now()}_${Math.random()}`;
        nextCaptured.push({ ...combatResult.capturedPiece!, owner: combatResult.capturedPiece.owner, definitionId: originalDefId, id: newCapId });
        if (PIECE_DEFINITIONS[capDef]?.tags?.includes('force_drop_if_captured')) {
          nextState.mustDropState = { playerId: nextState.currentPlayer, pieceId: newCapId }; skipTurnChange = false; 
        }
      }
      nextPieces = combatResult.nextBoard;
      promotionCanceled = combatResult.promotionCanceled;
    } else {
      nextPieces = nextPieces.map(p => p.id === activePiece.id ? { ...p, position: finalTo, components: { ...p.components, useCount: newUseCount ?? p.components.useCount } } : p);
    }
    lastActionData = { type: 'move' };
  }

  nextState.pieces = nextPieces;
  nextState.capturedPieces = nextCaptured;

  const victoryResult = evaluateVictoryConditions(nextState.pieces, nextState.currentPlayer, lastActionData);
  if (victoryResult) { nextState.selectedPieceId = null; nextState.winner = victoryResult; return nextState; }

  const isBomb = activePiece.definitionId === 'bomb';
  
  if (isBomb && !hitMineId) { 
    nextState.pendingBombActivation = { pieceId: activePiece.id }; 
    nextState.phase = 'bomb_activation'; 
  } else { 
    if (!isDrop) {
      const movedPieceNow = nextState.pieces.find(p => p.id === activePiece.id);
      if (movedPieceNow && !promotionCanceled && checkPromotion(movedPieceNow, movedPieceNow.position)) {
        const effectiveDef = getEffectiveDefinition(movedPieceNow);
        nextState.pendingPromotion = { pieceId: activePiece.id, promoteTo: effectiveDef.promotion!.promoteTo, skipTurnChange };
        nextState.selectedPieceId = null;
      } else {
        if (!skipTurnChange) { nextState = endCurrentTurn(nextState, nextState.pieces); nextState.selectedPieceId = null; }
        else { nextState.selectedPieceId = activePiece.id; nextState.turnState = { ...nextState.turnState, isSecondMove: true }; }
      }
    } else {
      if (!skipTurnChange) { nextState = endCurrentTurn(nextState, nextState.pieces); nextState.selectedPieceId = null; }
      else { nextState.selectedPieceId = activePiece.id; nextState.turnState = { ...nextState.turnState, isSecondMove: true }; }
    }
    if (nextState.phase === state.phase) nextState.phase = 'playing';
  }

  return nextState;
};

// ============================================================================
// 【コアエンジン】StateとActionを受け取り、新しいStateを返す純粋関数
// ============================================================================
export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'SYSTEM_RESET_GAME':
      return getInitialGameState();
    
    case 'PLACE_INITIAL_PIECE': {
      const { activePlayer, defId, x, y, isTrapPhase, wolfMimicRole } = action.payload;
      let nextState = { ...state };
      
      const isP1 = activePlayer === 'player1';
      let curQ = isTrapPhase ? (isP1 ? nextState.p1TrapQueue : nextState.p2TrapQueue) : (isP1 ? nextState.p1Queue : nextState.p2Queue);
      
      let newPieces = [...nextState.pieces];

      if (isTrapPhase) {
        // ★新規追加：すでにその場所に相手の地雷があるか確認（相殺処理）
        const existingTrapIndex = newPieces.findIndex(p => p.position.x === x && p.position.y === y && PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap'));
        if (existingTrapIndex !== -1) {
          // 相殺：新しい地雷は追加せず、既存の地雷も消滅させる
          newPieces = newPieces.filter((_, idx) => idx !== existingTrapIndex);
        } else {
          // 相手の地雷がなければ普通に追加
          const newPiece = { id: `${activePlayer}_${defId}_${Date.now()}`, definitionId: defId, owner: activePlayer, position: { x, y }, components: { ...(PIECE_DEFINITIONS[defId]?.defaultComponents || {}) } };
          if (wolfMimicRole) newPiece.components.mimicRole = wolfMimicRole;
          newPieces.push(newPiece);
        }
      } else {
        const newPiece = { id: `${activePlayer}_${defId}_${Date.now()}`, definitionId: defId, owner: activePlayer, position: { x, y }, components: { ...(PIECE_DEFINITIONS[defId]?.defaultComponents || {}) } };
        if (wolfMimicRole) newPiece.components.mimicRole = wolfMimicRole;
        newPieces.push(newPiece);
      }

      nextState.pieces = newPieces;
      
      curQ = curQ.slice(1);
      
      if (isTrapPhase) { if(isP1) nextState.p1TrapQueue = curQ; else nextState.p2TrapQueue = curQ; } 
      else { if(isP1) nextState.p1Queue = curQ; else nextState.p2Queue = curQ; }

      if (curQ.length === 0) { 
         const np1 = nextState.p1Queue;
         const np2 = nextState.p2Queue;
         const nt1 = nextState.p1TrapQueue;
         const nt2 = nextState.p2TrapQueue;
         const nextData = resolveNextPlacementPhase(np1, np2, nt1, nt2, newPieces, nextState.capturedPieces);
         nextState.phase = nextData.phase; 
         nextState.currentPlayer = nextData.player as PlayerId;
      }
      return nextState;
    }

    case 'MOVE_PIECE':
      return executeMove(state, action.payload);

    case 'RESOLVE_PROMOTION': {
      if (!state.pendingPromotion) return state;
      let nextBoard = [...state.pieces];
      if (action.payload.doPromote) {
        if (state.pendingPromotion.promoteTo === 'promoted_anti_promote') {
          nextBoard = nextBoard.map(p => {
            if (p.id === state.pendingPromotion!.pieceId) return { ...p, definitionId: 'promoted_anti_promote' };
            if (DEMOTE_MAP[p.definitionId]) return { ...p, definitionId: DEMOTE_MAP[p.definitionId] };
            return p;
          });
        } else {
          nextBoard = nextBoard.map(p => p.id === state.pendingPromotion!.pieceId ? (p.definitionId === 'wolf' ? { ...p, components: { ...p.components, mimicRole: state.pendingPromotion!.promoteTo } } : { ...p, definitionId: state.pendingPromotion!.promoteTo }) : p);
        }
      }
      let nextState = { ...state, pieces: nextBoard };
      if (!state.pendingPromotion.skipTurnChange) {
        nextState = endCurrentTurn(nextState, nextBoard);
        nextState.selectedPieceId = null;
      } else {
        nextState.selectedPieceId = state.pendingPromotion.pieceId;
        nextState.turnState = { ...nextState.turnState, isSecondMove: true };
      }
      nextState.pendingPromotion = null;
      return nextState;
    }

    case 'RESOLVE_BOMB_ACTIVATION': {
      if (!state.pendingBombActivation) return state;
      let nextBoard = [...state.pieces];
      if (action.payload.activate) {
        nextBoard = nextBoard.map(p => p.id === state.pendingBombActivation!.pieceId ? { ...p, definitionId: 'activated_bomb', components: { ...p.components, isActivated: true, bombTimer: 2 } } : p);
      }
      let nextState = { ...state, pieces: nextBoard, pendingBombActivation: null, phase: 'playing' };
      nextState = endCurrentTurn(nextState, nextBoard);
      nextState.selectedPieceId = null;
      return nextState;
    }

    case 'RESOLVE_BULLET': {
      const { targetId } = action.payload;
      let nextState = { ...state };
      nextState.capturedPieces = nextState.capturedPieces.filter(p => p.id !== nextState.selectedPieceId);
      if (targetId) {
        const target = nextState.pieces.find(p => p.id === targetId);
        if (target) {
          nextState.pieces = nextState.pieces.filter(p => p.id !== targetId);
          if (target.definitionId === 'king') nextState.winner = { winner: nextState.currentPlayer, reason: '弾が見事に敵の王を撃ち抜きました！' };
        }
      }
      nextState.bulletMinigameData = null;
      nextState.phase = 'playing';
      nextState = endCurrentTurn(nextState, nextState.pieces);
      nextState.selectedPieceId = null;
      return nextState;
    }

    case 'RESOLVE_GAMBLE_JUMP': {
      const { x, y } = action.payload;
      if (!state.pendingAction) return state;
      let nextState = executeMove(state, { pieceId: state.pendingAction.pieceId, to: { x, y }, isDrop: state.pendingAction.isDrop });
      nextState.phase = 'playing';
      nextState.pendingAction = null;
      return nextState;
    }

    case 'CANCEL_GAMBLE_JUMP':
      return { ...state, phase: 'playing', pendingAction: null, selectedPieceId: null };

    case 'RESOLVE_SWAP_ABILITY': {
      const { answer } = action.payload;
      let nextState = { ...state };
      if (!nextState.swapAbilityState) return state;
      if (nextState.swapAbilityState.step === 'ask') {
        if (answer === 'yes') { nextState.swapAbilityState = { ...nextState.swapAbilityState, step: 'selecting_target' }; }
        else { nextState.swapAbilityState = null; }
      } else if (nextState.swapAbilityState.step === 'confirm') {
        if (answer === 'confirm_yes') {
          const sage = nextState.pieces.find(p => p.id === nextState.swapAbilityState!.pieceId);
          const target = nextState.pieces.find(p => p.id === nextState.swapAbilityState!.targetPieceId);
          if (sage && target) {
            const sagePos = { ...sage.position }; const targetPos = { ...target.position };
            nextState.pieces = nextState.pieces.map(p => {
              if (p.id === sage.id) return { ...p, position: targetPos, components: { ...p.components, isExhausted: true } };
              if (p.id === target.id) return { ...p, position: sagePos };
              return p;
            });
            nextState = endCurrentTurn(nextState, nextState.pieces);
            nextState.selectedPieceId = null;
          }
          nextState.swapAbilityState = null;
        } else {
          nextState.swapAbilityState = { ...nextState.swapAbilityState, step: 'selecting_target' };
        }
      }
      return nextState;
    }

    case 'START_ROULETTE':
      return { ...state, rouletteState: Math.random() < 0.1 ? 'win' : Math.random() < 0.2 ? 'lose' : 'miss', phase: 'minigame_roulette' };

    case 'RESOLVE_ROULETTE': {
      let nextState = { ...state };
      if (nextState.rouletteState === 'win') nextState.winner = { winner: nextState.currentPlayer, reason: '特殊勝利！' };
      else if (nextState.rouletteState === 'lose') nextState.winner = { winner: nextState.currentPlayer === 'player1' ? 'player2' : 'player1', reason: '特殊敗北...' };
      else { nextState = endCurrentTurn(nextState, nextState.pieces); nextState.selectedPieceId = null; }
      nextState.phase = 'playing'; nextState.rouletteState = null;
      return nextState;
    }

    case 'PLAY_CHOHAN': {
      const { guess, isDoubleUp } = action.payload;
      const isWin = ((Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1) % 2 === 0) === (guess === 'cho');
      let nextState = { ...state, chohanState: { dice1: 1, dice2: 2, isWin, isDoubleUpAttempt: isDoubleUp } };
      if (isDoubleUp) nextState.turnState = { ...nextState.turnState, hasDoubledUp: true };
      return nextState;
    }

    case 'RESOLVE_CHOHAN': {
      const { proceed } = action.payload;
      let nextState = { ...state };
      if (!nextState.pendingAction) return state;
      if (proceed && nextState.chohanState?.isWin) {
        nextState = executeMove(nextState, { pieceId: nextState.pendingAction.pieceId, to: nextState.pendingAction.to, isDrop: nextState.pendingAction.isDrop, skipTurnChange: nextState.chohanState.isDoubleUpAttempt });
        nextState.pendingAction = null;
      } else {
        nextState = endCurrentTurn(nextState, nextState.pieces);
        nextState.phase = 'playing'; nextState.pendingAction = null; nextState.selectedPieceId = null;
      }
      return nextState;
    }

    case 'RESOLVE_WOLF_DECLARATION': {
      const { roleId } = action.payload;
      let nextState = { ...state };
      if (!nextState.wolfDeclaration) return state;
      if (nextState.wolfDeclaration.source === 'queue') {
        const defId = 'wolf';
        const newPiece = { id: `${nextState.wolfDeclaration.owner}_${defId}_${Date.now()}`, definitionId: defId, owner: nextState.wolfDeclaration.owner, position: { x: nextState.wolfDeclaration.x, y: nextState.wolfDeclaration.y }, components: { mimicRole: roleId } };
        nextState.pieces = [...nextState.pieces, newPiece];
        const isP1 = nextState.wolfDeclaration.owner === 'player1'; const isTrap = nextState.phase.startsWith('trap');
        let curQ = isTrap ? (isP1 ? nextState.p1TrapQueue : nextState.p2TrapQueue) : (isP1 ? nextState.p1Queue : nextState.p2Queue);
        curQ = curQ.slice(1);
        if (isTrap) { if(isP1) nextState.p1TrapQueue = curQ; else nextState.p2TrapQueue = curQ; } else { if(isP1) nextState.p1Queue = curQ; else nextState.p2Queue = curQ; }

        const np1 = isP1 && !isTrap ? nextState.p1Queue.slice(1) : nextState.p1Queue;
        const np2 = !isP1 && !isTrap ? nextState.p2Queue.slice(1) : nextState.p2Queue;
        const nt1 = isP1 && isTrap ? nextState.p1TrapQueue.slice(1) : nextState.p1TrapQueue;
        const nt2 = !isP1 && isTrap ? nextState.p2TrapQueue.slice(1) : nextState.p2TrapQueue;
        const nextData = resolveNextPlacementPhase(np1, np2, nt1, nt2, nextState.pieces, nextState.capturedPieces);
        nextState.phase = nextData.phase; nextState.currentPlayer = nextData.player;
      } else {
        nextState = executeMove(nextState, { pieceId: nextState.wolfDeclaration.pieceId, to: { x: nextState.wolfDeclaration.x, y: nextState.wolfDeclaration.y }, isDrop: true, wolfMimicRole: roleId });
      }
      nextState.wolfDeclaration = null;
      return nextState;
    }

    case 'PROCEED_ACCUSATION':
      return { ...state, accuseState: { ...state.accuseState, step: action.payload.step, guessedRole: action.payload.guessedRole || state.accuseState?.guessedRole } };

    case 'CANCEL_ACCUSATION':
      return { ...state, accuseState: null };

    case 'RESOLVE_ACCUSATION': {
      let nextState = { ...state };
      if (!nextState.accuseState) return state;
      const target = nextState.pieces.find(p => p.id === nextState.accuseState!.targetPieceId);
      if (!target) return state;
      const isMatch = target.components.mimicRole === nextState.accuseState!.guessedRole || DEMOTE_MAP[target.components.mimicRole] === nextState.accuseState!.guessedRole;
      if (isMatch) {
        nextState.pieces = nextState.pieces.filter(p => p.id !== target.id);
        nextState.turnSkipState = { ...nextState.turnSkipState, [target.owner]: true };
        nextState.accuseState = { ...nextState.accuseState, step: 'result', isSuccess: true };
      } else {
        nextState.accuseState = { ...nextState.accuseState, step: 'result', isSuccess: false };
      }
      return nextState;
    }

    case 'CLOSE_ACCUSATION_RESULT': {
      let nextState = { ...state };
      if (nextState.accuseState?.isSuccess === false) nextState = endCurrentTurn(nextState, nextState.pieces);
      nextState.accuseState = null;
      return nextState;
    }

    case 'RESOLVE_MINE_CONFIRMATION': {
      let nextState = { ...state };
      if (!nextState.pendingMineConfirmation) return state;
      if (action.payload.proceed) {
        nextState = executeMove(nextState, {
          pieceId: nextState.pendingMineConfirmation.args[0],
          to: nextState.pendingMineConfirmation.args[1],
          isDrop: nextState.pendingMineConfirmation.args[2],
          skipTurnChange: nextState.pendingMineConfirmation.args[3],
          wolfMimicRole: nextState.pendingMineConfirmation.args[4],
          newUseCount: nextState.pendingMineConfirmation.args[5],
          destroyedAllyMineIds: nextState.pendingMineConfirmation.args[6]
        });
      } else {
        nextState.phase = 'playing'; nextState.selectedPieceId = null;
      }
      nextState.pendingMineConfirmation = null;
      return nextState;
    }

    case 'START_RENDA_SETTING': return { ...state, rendaSettingState: { clicks: 0, isActive: true, timeLeft: 2 } };
    case 'CLICK_RENDA_SETTING': return { ...state, rendaSettingState: state.rendaSettingState?.isActive ? { ...state.rendaSettingState, clicks: state.rendaSettingState.clicks + 1 } : state.rendaSettingState };
    case 'TICK_RENDA_SETTING': return { ...state, rendaSettingState: state.rendaSettingState ? { ...state.rendaSettingState, timeLeft: state.rendaSettingState.timeLeft - 1 } : null };
    case 'FINISH_RENDA_SETTING': {
      let nextState = { ...state };
      if (!nextState.rendaSettingState) return state;
      const finalClicks = Math.max(1, nextState.rendaSettingState.clicks);
      if (nextState.phase === 'renda_quota_p1') {
        nextState.rendaQuotas = { ...nextState.rendaQuotas, player2: finalClicks };
        const hasP1Renda = nextState.pieces.some(p => p.owner === 'player1' && p.definitionId === 'renda') || nextState.capturedPieces.some(p => p.owner === 'player1' && p.definitionId === 'renda');
        if (hasP1Renda) { nextState.phase = 'renda_quota_p2'; nextState.currentPlayer = 'player2'; }
        else { nextState.phase = 'playing'; nextState.currentPlayer = 'player1'; }
      } else if (nextState.phase === 'renda_quota_p2') {
        nextState.rendaQuotas = { ...nextState.rendaQuotas, player1: finalClicks };
        nextState.phase = 'playing'; nextState.currentPlayer = 'player1';
      }
      nextState.rendaSettingState = null;
      return nextState;
    }

    case 'START_RENDA_PLAY': return { ...state, rendaPlayState: { clicks: 0, required: action.payload.required, isActive: false, timeLeft: 3 }, phase: 'minigame_renda_play' };
    case 'START_RENDA_PLAY_ACTIVATE': return { ...state, rendaPlayState: state.rendaPlayState ? { ...state.rendaPlayState, isActive: true } : null };
    case 'CLICK_RENDA_PLAY': return { ...state, rendaPlayState: state.rendaPlayState?.isActive ? { ...state.rendaPlayState, clicks: state.rendaPlayState.clicks + 1 } : state.rendaPlayState };
    case 'TICK_RENDA_PLAY': return { ...state, rendaPlayState: state.rendaPlayState ? { ...state.rendaPlayState, timeLeft: state.rendaPlayState.timeLeft - 1 } : null };
    case 'FINISH_RENDA_PLAY': {
      let nextState = { ...state };
      if (!nextState.rendaPlayState || !nextState.pendingAction) return state;
      const activePiece = nextState.pendingAction.isDrop ? nextState.capturedPieces.find(p=>p.id===nextState.pendingAction!.pieceId) : nextState.pieces.find(p=>p.id===nextState.pendingAction!.pieceId);
      if (nextState.rendaPlayState.clicks >= nextState.rendaPlayState.required) {
        const newUseCount = (activePiece?.components.useCount || 0) + 1;
        nextState = executeMove(nextState, { pieceId: nextState.pendingAction.pieceId, to: nextState.pendingAction.to, isDrop: nextState.pendingAction.isDrop, newUseCount });
      } else {
        nextState = endCurrentTurn(nextState, nextState.pieces);
        nextState.phase = 'playing'; nextState.selectedPieceId = null;
      }
      nextState.rendaPlayState = null; nextState.pendingAction = null;
      return nextState;
    }

    case 'START_BULLET_MINIGAME': {
      const { pieceId } = action.payload;
      const enemies = state.pieces.filter(p => p.owner !== state.currentPlayer);
      let cAngle = 0;
      const absoluteTargets: any[] = [];
      enemies.forEach(enemy => {
        const hitW = Math.floor(Math.random() * 18) + 18; 
        const missW = (360 / enemies.length) - hitW;
        absoluteTargets.push({ label: PIECE_DEFINITIONS[enemy.definitionId]?.name || '?', pieceId: enemy.id, startAngle: cAngle, endAngle: cAngle + hitW, color: '#ef4444' });
        cAngle += hitW;
        absoluteTargets.push({ label: 'ハズレ', pieceId: null, startAngle: cAngle, endAngle: cAngle + missW, color: '#9ca3af' });
        cAngle += missW;
      });
      if (absoluteTargets.length > 0) absoluteTargets[absoluteTargets.length - 1].endAngle = 360;
      
      return { ...state, selectedPieceId: pieceId, bulletMinigameData: { targets: absoluteTargets, speed: Math.floor(Math.random() * 400) + 300, initialOffset: Math.random() * 360 }, phase: 'minigame_bullet' };
    }

    // --- UI層の直接State書き換え用 ---
    case 'SET_PHASE': return { ...state, phase: action.payload.phase };
    case 'SET_PENDING_ACTION': return { ...state, pendingAction: action.payload };
    case 'SET_SELECTED_PIECE': return { ...state, selectedPieceId: action.payload.pieceId };
    case 'SET_WOLF_DECLARATION': return { ...state, wolfDeclaration: action.payload };
    case 'SET_ACCUSE_STATE': return { ...state, accuseState: action.payload };
    case 'SET_CHOHAN_STATE': return { ...state, chohanState: action.payload };
    case 'SET_SWAP_ABILITY_STATE': return { ...state, swapAbilityState: action.payload };

    default:
      console.warn('Unhandled Action:', action);
      return state;
  }
};