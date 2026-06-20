// @ts-nocheck
// src/engine/useGameEngine.ts
import { useState } from 'react';
import type { Piece, PlayerId, Position } from '../entities/types';
import { calculateMovablePositions, checkPromotion, getOccupiedPositions, getEffectiveDefinition } from '../rules/movement';
import { resolveCombat } from '../rules/combat';
import { PIECE_DEFINITIONS } from '../data/pieces';
import { evaluateVictoryConditions, type VictoryResult } from '../rules/victory';

const INITIAL_KINGS: Piece[] = [
  { id: 'p1_king', definitionId: 'king', owner: 'player1', position: { x: 2, y: 4 }, components: {} },
  { id: 'p2_king', definitionId: 'king', owner: 'player2', position: { x: 2, y: 0 }, components: {} },
];

const PIECE_POOL = ['pawn', 'silver', 'gold', 'lance', 'rook', 'bishop', 'knight', 'troll', 'trickster', 'wolf', 'hero', 'nuisance', 'bomb', 'landmine', 'bullet', 'drunk', 'renda']; 
const DEMOTE_MAP: Record<string, string> = { 'tokin': 'pawn', 'promoted_silver': 'silver', 'promoted_lance': 'lance', 'promoted_rook': 'rook', 'promoted_bishop': 'bishop', 'promoted_knight': 'knight', 'promoted_trickster': 'trickster', 'promoted_drunk': 'drunk' };

export const WOLF_ROLES = ['pawn', 'silver', 'gold', 'lance', 'knight', 'rook', 'bishop'];

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

const initGame = () => {
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
  return { p1Q, p2Q, p1TrapQ, p2TrapQ, cap, initialPhase: initialData.phase, initialPlayer: initialData.player };
};

export const useGameEngine = () => {
  const [gameState] = useState(() => initGame());
  const [phase, setPhase] = useState<string>(gameState.initialPhase);
  
  const [p1Queue, setP1Queue] = useState<string[]>(gameState.p1Q);
  const [p2Queue, setP2Queue] = useState<string[]>(gameState.p2Q);
  const [p1TrapQueue, setP1TrapQueue] = useState<string[]>(gameState.p1TrapQ);
  const [p2TrapQueue, setP2TrapQueue] = useState<string[]>(gameState.p2TrapQ);
  
  const [capturedPieces, setCapturedPieces] = useState<Piece[]>(gameState.cap);
  const [pieces, setPieces] = useState<Piece[]>(INITIAL_KINGS);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerId>(gameState.initialPlayer as PlayerId);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ pieceId: string; promoteTo: string; skipTurnChange: boolean } | null>(null);
  const [winner, setWinner] = useState<VictoryResult | null>(null);
  
  const [turnCount, setTurnCount] = useState<number>(1);
  const [mustDropState, setMustDropState] = useState<{ playerId: PlayerId; pieceId: string } | null>(null);
  const [pendingBombActivation, setPendingBombActivation] = useState<{ pieceId: string } | null>(null);

  const [rendaQuotas, setRendaQuotas] = useState<{ player1: number, player2: number }>({ player1: 3, player2: 3 });
  const [rendaSettingState, setRendaSettingState] = useState<{ clicks: number, isActive: boolean, timeLeft: number } | null>(null);
  const [rendaPlayState, setRendaPlayState] = useState<{ clicks: number, required: number, isActive: boolean, timeLeft: number } | null>(null);

  const [bulletMinigameData, setBulletMinigameData] = useState<any>(null);

  const [pendingMineConfirmation, setPendingMineConfirmation] = useState<{ args: any[], mineIds: string[] } | null>(null);

  const [turnState, setTurnState] = useState<{ hasDoubledUp: boolean; isSecondMove: boolean }>({ hasDoubledUp: false, isSecondMove: false });
  const [turnSkipState, setTurnSkipState] = useState<{ player1: boolean, player2: boolean }>({ player1: false, player2: false });
  const [pendingAction, setPendingAction] = useState<{ pieceId: string; to: Position; isDrop: boolean } | null>(null);
  const [chohanState, setChohanState] = useState<any>(null);
  const [rouletteState, setRouletteState] = useState<any>(null);
  const [wolfDeclaration, setWolfDeclaration] = useState<any>(null);
  const [accuseState, setAccuseState] = useState<any>(null);

  const selectedBoardPiece = pieces.find(p => p.id === selectedPieceId);
  const selectedCapturedPiece = capturedPieces.find(p => p.id === selectedPieceId);

  let movablePositions: Position[] = [];
  if (phase === 'playing' && !pendingPromotion && !winner && !accuseState && !wolfDeclaration && !pendingBombActivation) {
    if (selectedBoardPiece) {
      movablePositions = calculateMovablePositions(selectedBoardPiece, pieces, turnCount);
    } else if (selectedCapturedPiece) {
      const def = getEffectiveDefinition(selectedCapturedPiece);
      const w = def?.size?.width || 1; const h = def?.size?.height || 1;
      for (let y = 0; y <= 5 - h; y++) {
        for (let x = 0; x <= 5 - w; x++) {
          if (def?.tags?.includes('trap')) {
            if (currentPlayer === 'player1' && y < 2) continue;
            if (currentPlayer === 'player2' && y > 2) continue;
          }
          const hypo = { ...selectedCapturedPiece, position: { x, y } };
          const area = getOccupiedPositions(hypo);
          const isOverlap = pieces.some(p => {
            if (PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap')) return false;
            return getOccupiedPositions(p).some(ep => area.some(pos => pos.x === ep.x && pos.y === ep.y));
          });
          if (!isOverlap) movablePositions.push({ x, y });
        }
      }
    }
  }

  const handleTurnStartEvents = (nextPlayer: PlayerId, currentBoard: Piece[]) => {
    let nextBoard = [...currentBoard];
    let newWinner: VictoryResult | null = null;
    
    const explodingBombs = nextBoard.filter(p => p.owner === nextPlayer && p.definitionId === 'bomb' && p.components?.isActivated && (p.components.bombTimer || 0) <= 1);
    
    nextBoard = nextBoard.map(p => {
      if (p.owner === nextPlayer && p.definitionId === 'bomb' && p.components?.isActivated) {
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
      nextBoard = nextBoard.filter(target => {
        const tArea = getOccupiedPositions(target);
        const isHit = tArea.some(tp => allExAreas.some(ep => tp.x === ep.x && tp.y === ep.y));
        if (isHit && target.definitionId === 'king') newWinner = { winner: target.owner === 'player1' ? 'player2' : 'player1', reason: '爆発により王が消滅しました！' };
        return !isHit; 
      });
    }
    if (newWinner) setWinner(newWinner);
    return nextBoard;
  };

  const endCurrentTurn = (tempPieces: Piece[] = pieces) => {
    const nextPlayer = currentPlayer === 'player1' ? 'player2' : 'player1';
    setTurnState({ hasDoubledUp: false, isSecondMove: false });
    setTurnCount(prev => prev + 1);
    const boardAfterEvents = handleTurnStartEvents(nextPlayer, tempPieces);
    setPieces(boardAfterEvents);
    if (turnSkipState[nextPlayer]) {
      setTurnSkipState(prev => ({ ...prev, [nextPlayer]: false }));
      setCurrentPlayer(currentPlayer); 
      setTurnCount(prev => prev + 1);
      setPieces(handleTurnStartEvents(currentPlayer, boardAfterEvents));
    } else {
      setCurrentPlayer(nextPlayer);
    }
  };

  const executeMove = (pieceId: string, to: Position, isDrop: boolean, skipTurnChange: boolean = false, wolfMimicRole?: string, newUseCount?: number, destroyedAllyMineIds?: string[]) => {
    let nextPieces = [...pieces];
    let lastActionData: any = null;
    const activePiece = isDrop ? capturedPieces.find(p => p.id === pieceId) : pieces.find(p => p.id === pieceId);
    if (!activePiece) return;

    const activeDef = getEffectiveDefinition(activePiece);
    const isPusher = activeDef?.tags?.includes('pusher');

    // ★修正：桂馬ジャンプや端ワープの時に無限ループしないように直線性チェック
    if (!destroyedAllyMineIds) {
      let allyMines: string[] = [];
      if (!isDrop) {
        const diffX = to.x - activePiece.position.x;
        const diffY = to.y - activePiece.position.y;
        const isLinearPath = (diffX === 0 || diffY === 0 || Math.abs(diffX) === Math.abs(diffY)) && 
                             activeDef?.id !== 'knight' && 
                             !(activeDef?.moveRules.some((r: any) => r.generator === 'edge_warp') && (Math.abs(diffX) === 4 || Math.abs(diffY) === 4));
                             
        if (isLinearPath) {
          const dx = Math.sign(diffX);
          const dy = Math.sign(diffY);
          let cx = activePiece.position.x + dx; let cy = activePiece.position.y + dy;
          if (dx !== 0 || dy !== 0) {
            while(cx !== to.x || cy !== to.y) {
              const mine = nextPieces.find(p => p.position.x === cx && p.position.y === cy && PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap'));
              if (mine && mine.owner === currentPlayer) allyMines.push(mine.id);
              cx += dx; cy += dy;
            }
          }
        }
      }
      const destMine = nextPieces.find(p => p.position.x === to.x && p.position.y === to.y && PIECE_DEFINITIONS[p.definitionId]?.tags?.includes('trap'));
      if (destMine && destMine.owner === currentPlayer && !allyMines.includes(destMine.id)) {
        allyMines.push(destMine.id);
      }

      if (allyMines.length > 0) {
        setPendingMineConfirmation({
          args: [pieceId, to, isDrop, skipTurnChange, wolfMimicRole, newUseCount, allyMines],
          mineIds: allyMines
        });
        setPhase('mine_confirm');
        return; 
      }
    } else {
      nextPieces = nextPieces.filter(p => !destroyedAllyMineIds.includes(p.id));
    }

    let finalTo = to;
    let hitMineId: string | null = null;

    if (!isDrop) {
      const diffX = to.x - activePiece.position.x;
      const diffY = to.y - activePiece.position.y;
      const isLinearPath = (diffX === 0 || diffY === 0 || Math.abs(diffX) === Math.abs(diffY)) && 
                           activeDef?.id !== 'knight' && 
                           !(activeDef?.moveRules.some((r: any) => r.generator === 'edge_warp') && (Math.abs(diffX) === 4 || Math.abs(diffY) === 4));

      if (isLinearPath) {
        const dx = Math.sign(diffX);
        const dy = Math.sign(diffY);
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
        setCapturedPieces(prev => prev.filter(p => p.id !== pieceId));
        nextPieces = nextPieces.filter(p => p.id !== hitMineId);
        if (activePiece.definitionId === 'king') setWinner({ winner: activePiece.owner === 'player1' ? 'player2' : 'player1', reason: '王が地雷の上に置かれて爆死しました！' });
        if (mustDropState?.pieceId === pieceId) setMustDropState(null);
        lastActionData = { type: 'drop', definitionId: activePiece.definitionId, x: finalTo.x };
      } else {
        nextPieces = nextPieces.filter(p => p.id !== activePiece.id && p.id !== hitMineId);
        if (activePiece.definitionId === 'king') setWinner({ winner: activePiece.owner === 'player1' ? 'player2' : 'player1', reason: '王が地雷を踏んで爆死しました！' });
        lastActionData = { type: 'move' };
      }
    } else if (isDrop) {
      setCapturedPieces(prev => prev.filter(p => p.id !== pieceId));
      const newPiece = { ...activePiece, position: finalTo };
      if (wolfMimicRole) newPiece.components.mimicRole = wolfMimicRole;
      if (newUseCount !== undefined) newPiece.components.useCount = newUseCount;
      nextPieces = [...nextPieces, newPiece];
      lastActionData = { type: 'drop', definitionId: newPiece.definitionId, x: finalTo.x };
      if (mustDropState?.pieceId === pieceId) setMustDropState(null); 
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
            if (steppingPiece?.definitionId === 'king') setWinner({ winner: O1 === 'player1' ? 'player2' : 'player1', reason: '玉突きで押し出された王が地雷を踏みました！' });
          } else {
            let captured = { ...target };
            if (captured.definitionId === 'wolf') delete captured.components.mimicRole;
            if (captured.definitionId === 'nuisance') captured.definitionId = 'harm';
            if (captured.definitionId === 'bomb') { captured.components.isActivated = false; captured.components.bombTimer = 0; }
            
            const capDef = captured.definitionId;
            const originalDefId = DEMOTE_MAP[capDef] || capDef;
            const newCapId = `cap_${Date.now()}_${Math.random()}`;
            setCapturedPieces(prev => [...prev, { ...captured, owner: O1, definitionId: originalDefId, id: newCapId, components: { ...captured.components, hp: 2 } }]);
            if (PIECE_DEFINITIONS[capDef]?.tags?.includes('force_drop_if_captured')) {
              setMustDropState({ playerId: O1, pieceId: newCapId }); skipTurnChange = false; 
            }
            nextPieces = nextPieces.filter(p => p.id !== target.id);
          }
        });
      }
      nextPieces = nextPieces.map(p => p.id === activePiece.id ? { ...p, position: finalTo } : p);
      lastActionData = { type: 'move' };
    } else {
      let targetPiece = undefined;
      for (const p of nextPieces) {
        if (p.owner !== currentPlayer) {
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
          setCapturedPieces(prev => [...prev, { ...combatResult.capturedPiece!, owner: currentPlayer, definitionId: originalDefId, id: newCapId }]);
          if (PIECE_DEFINITIONS[capDef]?.tags?.includes('force_drop_if_captured')) {
            setMustDropState({ playerId: currentPlayer, pieceId: newCapId }); skipTurnChange = false; 
          }
        }
        nextPieces = combatResult.nextBoard;
      } else {
        nextPieces = nextPieces.map(p => p.id === activePiece.id ? { ...p, position: finalTo, components: { ...p.components, useCount: newUseCount ?? p.components.useCount } } : p);
      }
      lastActionData = { type: 'move' };
    }

    setPieces(nextPieces);

    const victoryResult = evaluateVictoryConditions(nextPieces, currentPlayer, lastActionData);
    if (victoryResult) { setSelectedPieceId(null); setWinner(victoryResult); return; }

    const isBomb = activePiece.definitionId === 'bomb';
    const finalizeMove = () => {
      if (!isDrop) {
        const movedPieceNow = nextPieces.find(p => p.id === activePiece.id);
        if (movedPieceNow && checkPromotion(movedPieceNow, movedPieceNow.position)) {
          const effectiveDef = getEffectiveDefinition(movedPieceNow);
          setPendingPromotion({ pieceId: activePiece.id, promoteTo: effectiveDef.promotion!.promoteTo, skipTurnChange });
          setSelectedPieceId(null);
        } else {
          if (!skipTurnChange) { endCurrentTurn(nextPieces); setSelectedPieceId(null); }
          else { setSelectedPieceId(activePiece.id); setTurnState(prev => ({ ...prev, isSecondMove: true })); }
        }
      } else {
        if (!skipTurnChange) { endCurrentTurn(nextPieces); setSelectedPieceId(null); }
        else { setSelectedPieceId(activePiece.id); setTurnState(prev => ({ ...prev, isSecondMove: true })); }
      }
    };

    if (isBomb && !hitMineId) { 
      setPendingBombActivation({ pieceId: activePiece.id }); 
      setPhase('bomb_activation'); 
    } 
    else { 
      finalizeMove(); 
      setPhase('playing');
    }
  };

  const handleCellClick = (x: number, y: number) => {
    if (wolfDeclaration || accuseState || pendingPromotion || winner || pendingBombActivation || pendingMineConfirmation) return;
    if (phase.startsWith('placement') || phase.startsWith('trap_placement')) {
      const activePlayer = phase.includes('p1') ? 'player1' : 'player2';
      const isTrapPhase = phase.startsWith('trap');
      const currentQueue = isTrapPhase ? (activePlayer === 'player1' ? p1TrapQueue : p2TrapQueue) : (activePlayer === 'player1' ? p1Queue : p2Queue);
      const setQueue = isTrapPhase ? (activePlayer === 'player1' ? setP1TrapQueue : setP2TrapQueue) : (activePlayer === 'player1' ? setP1Queue : setP2Queue);

      let canPlace = false;
      if (isTrapPhase) { if (activePlayer === 'player1' && y >= 2) canPlace = true; if (activePlayer === 'player2' && y <= 2) canPlace = true; } 
      else { if (y === (activePlayer === 'player1' ? 4 : 0)) canPlace = true; }

      if (canPlace && !pieces.some(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y))) {
        if (currentQueue.length > 0) {
          const defId = currentQueue[0];
          if (defId === 'wolf') { setWolfDeclaration({ source: 'queue', owner: activePlayer, x, y }); return; }
          
          const newPieces = [...pieces, { id: `${activePlayer}_${defId}_${Date.now()}`, definitionId: defId, owner: activePlayer, position: { x, y }, components: { ...(PIECE_DEFINITIONS[defId]?.defaultComponents || {}) } }];
          setPieces(newPieces);
          setQueue(currentQueue.slice(1));
          
          if (currentQueue.length === 1) { 
             const np1 = activePlayer === 'player1' && !isTrapPhase ? p1Queue.slice(1) : p1Queue;
             const np2 = activePlayer === 'player2' && !isTrapPhase ? p2Queue.slice(1) : p2Queue;
             const nt1 = activePlayer === 'player1' && isTrapPhase ? p1TrapQueue.slice(1) : p1TrapQueue;
             const nt2 = activePlayer === 'player2' && isTrapPhase ? p2TrapQueue.slice(1) : p2TrapQueue;
             const nextData = resolveNextPlacementPhase(np1, np2, nt1, nt2, newPieces, capturedPieces);
             setPhase(nextData.phase as any);
             setCurrentPlayer(nextData.player as PlayerId);
          }
        }
      }
      return;
    }

    let chosenAnchor: Position | null = null;
    const activePiece = selectedBoardPiece || selectedCapturedPiece;
    if (activePiece) {
      for (const mPos of movablePositions) {
        if (getOccupiedPositions({ ...activePiece, position: mPos }).some(pos => pos.x === x && pos.y === y)) { chosenAnchor = mPos; break; }
      }
    }

    if (chosenAnchor && activePiece) {
      const activeDef = getEffectiveDefinition(activePiece);
      if (activePiece.definitionId === 'wolf' && !!selectedCapturedPiece) { setWolfDeclaration({ source: 'hand', owner: currentPlayer, x: chosenAnchor.x, y: chosenAnchor.y, pieceId: activePiece.id }); return; }
      
      if (activeDef?.tags?.includes('requires_gamble') && !turnState.isSecondMove) { setPendingAction({ pieceId: activePiece.id, to: chosenAnchor, isDrop: !!selectedCapturedPiece }); setChohanState(null); setPhase('minigame_chohan'); return; }
      
      if (activeDef?.tags?.includes('renda_minigame')) {
        const dist = !!selectedCapturedPiece ? 1 : Math.max(Math.abs(chosenAnchor.x - activePiece.position.x), Math.abs(chosenAnchor.y - activePiece.position.y));
        const req = dist * (rendaQuotas[currentPlayer] + (activePiece.components.useCount || 0));
        setPendingAction({ pieceId: activePiece.id, to: chosenAnchor, isDrop: !!selectedCapturedPiece });
        setRendaPlayState({ clicks: 0, required: req, isActive: false, timeLeft: 3 });
        setPhase('minigame_renda_play');
        return;
      }

      executeMove(activePiece.id, chosenAnchor, !!selectedCapturedPiece);
      return; 
    }

    const clickedPiece = pieces.find(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y));

    if (!activePiece && clickedPiece && clickedPiece.owner !== currentPlayer && clickedPiece.definitionId === 'wolf') {
      setAccuseState({ targetPieceId: clickedPiece.id, step: 'confirm' }); return;
    }

    if (clickedPiece && clickedPiece.owner === currentPlayer) {
      if (mustDropState?.playerId === currentPlayer) return;
      if (turnState.isSecondMove && clickedPiece.id !== selectedPieceId) return;
      setSelectedPieceId(clickedPiece.id);
    } else {
      if (!turnState.isSecondMove) setSelectedPieceId(null);
    }
  };

  const startBulletMinigame = (bulletPieceId: string) => {
    setSelectedPieceId(bulletPieceId);
    const enemies = pieces.filter(p => p.owner !== currentPlayer);
    
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

    setBulletMinigameData({
      targets: absoluteTargets,
      speed: Math.floor(Math.random() * 400) + 300, 
      initialOffset: Math.random() * 360
    });
    setPhase('minigame_bullet');
  };

  const handleCapturedClick = (pieceId: string) => {
    if (phase !== 'playing' || pendingPromotion || winner || turnState.isSecondMove || wolfDeclaration || accuseState || pendingBombActivation || pendingMineConfirmation) return;
    if (mustDropState?.playerId === currentPlayer && pieceId !== mustDropState.pieceId) return;

    const target = capturedPieces.find(p => p.id === pieceId);
    if (target && target.owner === currentPlayer) {
      if (PIECE_DEFINITIONS[target.definitionId]?.tags?.includes('bullet_minigame')) { startBulletMinigame(pieceId); return; }
      setSelectedPieceId(pieceId);
    }
  };

  const resolveMineConfirmation = (proceed: boolean) => {
    if (!pendingMineConfirmation) return;
    if (proceed) {
      executeMove(...(pendingMineConfirmation.args as any));
    } else {
      setPhase('playing');
      setSelectedPieceId(null);
    }
    setPendingMineConfirmation(null);
  };

  const startRendaSetting = () => setRendaSettingState({ clicks: 0, isActive: true, timeLeft: 5 });
  const clickRendaSetting = () => setRendaSettingState(prev => prev && prev.isActive ? { ...prev, clicks: prev.clicks + 1 } : null);
  const tickRendaSetting = () => setRendaSettingState(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null);
  const finishRendaSetting = () => {
    if (!rendaSettingState) return;
    const finalClicks = Math.max(1, rendaSettingState.clicks); 
    if (phase === 'renda_quota_p1') {
      setRendaQuotas(prev => ({ ...prev, player2: finalClicks }));
      const hasP1Renda = pieces.some(p => p.owner === 'player1' && p.definitionId === 'renda') || capturedPieces.some(p => p.owner === 'player1' && p.definitionId === 'renda');
      if (hasP1Renda) { setPhase('renda_quota_p2'); setCurrentPlayer('player2'); }
      else { setPhase('playing'); setCurrentPlayer('player1'); }
    } else if (phase === 'renda_quota_p2') {
      setRendaQuotas(prev => ({ ...prev, player1: finalClicks }));
      setPhase('playing'); setCurrentPlayer('player1');
    }
    setRendaSettingState(null);
  };

  const startRendaPlay = () => setRendaPlayState(prev => prev ? { ...prev, isActive: true } : null);
  const clickRendaPlay = () => setRendaPlayState(prev => prev && prev.isActive ? { ...prev, clicks: prev.clicks + 1 } : null);
  const tickRendaPlay = () => setRendaPlayState(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null);
  const finishRendaPlay = () => {
    if (!rendaPlayState || !pendingAction) return;
    const activePiece = pendingAction.isDrop ? capturedPieces.find(p=>p.id===pendingAction.pieceId) : pieces.find(p=>p.id===pendingAction.pieceId);
    if (rendaPlayState.clicks >= rendaPlayState.required) {
      const newUseCount = (activePiece?.components.useCount || 0) + 1;
      executeMove(pendingAction.pieceId, pendingAction.to, pendingAction.isDrop, false, undefined, newUseCount);
    } else {
      endCurrentTurn(pieces); setPhase('playing'); setSelectedPieceId(null);
    }
    setRendaPlayState(null); setPendingAction(null); 
  };

  const resolveBombActivation = (activate: boolean) => {
    if (!pendingBombActivation) return;
    let nextBoard = [...pieces];
    if (activate) { nextBoard = nextBoard.map(p => p.id === pendingBombActivation.pieceId ? { ...p, components: { ...p.components, isActivated: true, bombTimer: 2 } } : p); setPieces(nextBoard); }
    setPendingBombActivation(null); setPhase('playing'); endCurrentTurn(nextBoard); setSelectedPieceId(null);
  };

  const resolveBullet = (targetId: string | null) => {
    setCapturedPieces(prev => prev.filter(p => p.id !== selectedPieceId)); 
    let nextBoard = [...pieces];
    if (targetId) {
      const target = nextBoard.find(p => p.id === targetId);
      if (target) {
        nextBoard = nextBoard.filter(p => p.id !== targetId);
        setPieces(nextBoard);
        if (target.definitionId === 'king') setWinner({ winner: currentPlayer, reason: '弾が見事に敵の王を撃ち抜きました！' });
      }
    }
    setBulletMinigameData(null); setPhase('playing'); endCurrentTurn(nextBoard); setSelectedPieceId(null);
  };

  const resolvePromotion = (doPromote: boolean) => {
    if (!pendingPromotion) return;
    let nextBoard = [...pieces];
    if (doPromote) { nextBoard = nextBoard.map(p => p.id === pendingPromotion.pieceId ? (p.definitionId === 'wolf' ? { ...p, components: { ...p.components, mimicRole: pendingPromotion.promoteTo } } : { ...p, definitionId: pendingPromotion.promoteTo }) : p); setPieces(nextBoard); }
    if (!pendingPromotion.skipTurnChange) { endCurrentTurn(nextBoard); setSelectedPieceId(null); } else { setSelectedPieceId(pendingPromotion.pieceId); setTurnState(prev => ({ ...prev, isSecondMove: true })); }
    setPendingPromotion(null);
  };

  const resolveWolfDeclaration = (roleId: string) => {
    if (!wolfDeclaration) return;
    if (wolfDeclaration.source === 'queue') {
      const defId = 'wolf';
      const newPieces = [...pieces, { id: `${wolfDeclaration.owner}_${defId}_${Date.now()}`, definitionId: defId, owner: wolfDeclaration.owner, position: { x: wolfDeclaration.x, y: wolfDeclaration.y }, components: { mimicRole: roleId } }];
      setPieces(newPieces);
      const isP1 = wolfDeclaration.owner === 'player1'; const isTrap = phase.startsWith('trap');
      const setQ = isTrap ? (isP1 ? setP1TrapQueue : setP2TrapQueue) : (isP1 ? setP1Queue : setP2Queue);
      const curQ = isTrap ? (isP1 ? p1TrapQueue : p2TrapQueue) : (isP1 ? p1Queue : p2Queue);
      setQ(curQ.slice(1));
      if (curQ.length === 1) { 
         const np1 = isP1 && !isTrap ? p1Queue.slice(1) : p1Queue; const np2 = !isP1 && !isTrap ? p2Queue.slice(1) : p2Queue;
         const nt1 = isP1 && isTrap ? p1TrapQueue.slice(1) : p1TrapQueue; const nt2 = !isP1 && isTrap ? p2TrapQueue.slice(1) : p2TrapQueue;
         const nextData = resolveNextPlacementPhase(np1, np2, nt1, nt2, newPieces, capturedPieces);
         setPhase(nextData.phase as any); setCurrentPlayer(nextData.player as PlayerId);
      }
    } else { executeMove(wolfDeclaration.pieceId!, { x: wolfDeclaration.x, y: wolfDeclaration.y }, true, false, roleId); }
    setWolfDeclaration(null);
  };

  const proceedAccusation = (step: 'select'|'final', guessedRole?: string) => setAccuseState((prev:any) => prev ? { ...prev, step, guessedRole: guessedRole || prev.guessedRole } : null);
  const cancelAccusation = () => setAccuseState(null);
  const resolveAccusation = () => {
    if (!accuseState) return;
    const target = pieces.find(p => p.id === accuseState.targetPieceId);
    if (!target) return;
    const isMatch = target.components.mimicRole === accuseState.guessedRole || DEMOTE_MAP[target.components.mimicRole] === accuseState.guessedRole;
    if (isMatch) { setPieces(prev => prev.filter(p => p.id !== target.id)); setTurnSkipState(prev => ({ ...prev, [target.owner]: true })); setAccuseState(prev => prev ? { ...prev, step: 'result', isSuccess: true } : null); }
    else setAccuseState((prev:any) => prev ? { ...prev, step: 'result', isSuccess: false } : null);
  };
  const closeAccusationResult = () => { if (accuseState?.isSuccess === false) endCurrentTurn(pieces); setAccuseState(null); };

  const playChohan = (guess: 'cho'|'han', isD: boolean = false) => { const isWin = ((Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1) % 2 === 0) === (guess === 'cho'); setChohanState({ dice1: 1, dice2: 2, isWin, isDoubleUpAttempt: isD }); if (isD) setTurnState(prev => ({ ...prev, hasDoubledUp: true })); };
  
  const resolveChohan = (proceed: boolean) => {
    if (!pendingAction) return;
    if (proceed && chohanState?.isWin) { 
      executeMove(pendingAction.pieceId, pendingAction.to, pendingAction.isDrop, chohanState.isDoubleUpAttempt); 
      setPendingAction(null); 
    }
    else { endCurrentTurn(pieces); setPhase('playing'); setPendingAction(null); setSelectedPieceId(null); }
  };

  const startRoulette = () => { setRouletteState(Math.random() < 0.1 ? 'win' : Math.random() < 0.2 ? 'lose' : 'miss'); setPhase('minigame_roulette'); };
  const resolveRoulette = () => { if (rouletteState === 'win') setWinner({ winner: currentPlayer, reason: '特殊勝利！' }); else if (rouletteState === 'lose') setWinner({ winner: currentPlayer === 'player1' ? 'player2' : 'player1', reason: '特殊敗北...' }); else { endCurrentTurn(pieces); setSelectedPieceId(null); } setPhase('playing'); setRouletteState(null); };

  const resetGame = () => {
    const s = initGame(); setPieces(INITIAL_KINGS); setCapturedPieces(s.cap); setP1Queue(s.p1Q); setP2Queue(s.p2Q); setP1TrapQueue(s.p1TrapQ); setP2TrapQueue(s.p2TrapQ);
    setPhase(s.initialPhase as any); setCurrentPlayer('player1'); setSelectedPieceId(null); setWinner(null); setPendingPromotion(null); setTurnState({ hasDoubledUp: false, isSecondMove: false }); setTurnSkipState({ player1: false, player2: false }); setTurnCount(1); setMustDropState(null); setBulletMinigameData(null); setPendingMineConfirmation(null);
  };

  const visiblePieces = pieces.filter(p => phase === 'placement_p1' ? p.owner === 'player1' : phase === 'placement_p2' ? p.owner === 'player2' : true);

  return {
    phase, pieces: visiblePieces, capturedPieces, p1Queue, p2Queue, p1TrapQueue, p2TrapQueue, currentPlayer, selectedPieceId, movablePositions, pendingPromotion, winner,
    chohanState, rouletteState, turnState, turnSkipState, wolfDeclaration, accuseState, WOLF_ROLES, turnCount, mustDropState, pendingBombActivation, bulletMinigameData,
    rendaQuotas, rendaSettingState, rendaPlayState, pendingMineConfirmation,
    handleCellClick, handleCapturedClick, resolvePromotion, resolveWolfDeclaration, resetGame,
    proceedAccusation, cancelAccusation, resolveAccusation, closeAccusationResult, playChohan, resolveChohan, startRoulette, resolveRoulette, resolveBombActivation, resolveBullet,
    startRendaSetting, clickRendaSetting, tickRendaSetting, finishRendaSetting, startRendaPlay, clickRendaPlay, tickRendaPlay, finishRendaPlay, resolveMineConfirmation
  };
};