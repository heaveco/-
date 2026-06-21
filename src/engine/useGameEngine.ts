// @ts-nocheck
// src/engine/useGameEngine.ts
import { useState, useEffect } from 'react'; 
import type { PlayerId, Position } from '../entities/types';
import { calculateMovablePositions, getOccupiedPositions, getEffectiveDefinition } from '../rules/movement';
import { PIECE_DEFINITIONS } from '../data/pieces';
import { gameReducer, getInitialGameState } from './gameReducer';
import { socket } from '../network/socket';

export const WOLF_ROLES = ['pawn', 'silver', 'gold', 'lance', 'knight', 'rook', 'bishop'];

export const useGameEngine = (appState: string, roomId: string, myPlayerId: PlayerId | null) => {
  const isOnline = appState === 'online_playing';
  const [state, setState] = useState(getInitialGameState());

  useEffect(() => {
    const handleUpdateState = (newState: any) => {
      setState(newState);
    };
    socket.on('game_start', (data) => setState(data.state));
    socket.on('update_state', handleUpdateState);

    return () => {
      socket.off('game_start');
      socket.off('update_state', handleUpdateState);
    };
  }, []);

  const {
    phase, pieces, capturedPieces, p1Queue, p2Queue, p1TrapQueue, p2TrapQueue, currentPlayer, selectedPieceId, pendingPromotion, winner,
    chohanState, rouletteState, turnState, turnSkipState, wolfDeclaration, accuseState, turnCount, mustDropState, pendingBombActivation, bulletMinigameData,
    rendaQuotas, rendaSettingState, rendaPlayState, pendingMineConfirmation, swapAbilityState, pendingAction, ruleSettings // ★追加
  } = state;

  const selectedBoardPiece = pieces.find(p => p.id === selectedPieceId);
  const selectedCapturedPiece = capturedPieces.find(p => p.id === selectedPieceId);

  let movablePositions: Position[] = [];
  if (phase === 'playing' && !pendingPromotion && !winner && !accuseState && !wolfDeclaration && !pendingBombActivation) {
    if (swapAbilityState?.step === 'selecting_target') {
      movablePositions = [];
      const isP1 = currentPlayer === 'player1';
      pieces.forEach(p => {
        if (p.id === swapAbilityState.pieceId) return;
        const def = getEffectiveDefinition(p);
        const w = def?.size?.width || 1;
        const h = def?.size?.height || 1;
        if (w > 1 || h > 1) return; 
        
        const inOwnZone = isP1 ? (p.position.y >= 2) : (p.position.y <= 2);
        if (inOwnZone) movablePositions.push(p.position);
      });
    } else if (selectedBoardPiece) {
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
            if (def?.tags?.includes('ghost_possession') && p.owner !== currentPlayer) return false;
            return getOccupiedPositions(p).some(ep => area.some(pos => pos.x === ep.x && pos.y === ep.y));
          });
          if (!isOverlap) movablePositions.push({ x, y });
        }
      }
    }
  }

  // =========================================================
  // ★最強の dispatch 関数：オンラインならサーバーへ、ローカルなら自分の画面で計算
  // =========================================================
  const dispatch = (action: any) => {
    if (isOnline) {
      // オンライン対戦：サーバーに「注文票」を送るだけ！
      socket.emit('send_action', { roomId, action });
    } else {
      // ローカル対戦：今まで通り自分の画面内で即座に計算する
      setState(prevState => gameReducer(prevState, action));
    }
  };

  const handleCellClick = (x: number, y: number) => {
    // ★追加：オンライン対戦時、自分のターンじゃない時は一切の操作を無効化する防御壁
    if (isOnline && myPlayerId !== currentPlayer) return;

    if (wolfDeclaration || accuseState || pendingPromotion || winner || pendingBombActivation || pendingMineConfirmation || swapAbilityState?.step === 'ask' || swapAbilityState?.step === 'confirm') return;

    if (phase.startsWith('placement') || phase.startsWith('trap_placement')) {
      const activePlayer = phase.includes('p1') ? 'player1' : 'player2';
      const isTrapPhase = phase.startsWith('trap');
      const currentQueue = isTrapPhase ? (activePlayer === 'player1' ? p1TrapQueue : p2TrapQueue) : (activePlayer === 'player1' ? p1Queue : p2Queue);

      let canPlace = false;
      if (isTrapPhase) { if (activePlayer === 'player1' && y >= 2) canPlace = true; if (activePlayer === 'player2' && y <= 2) canPlace = true; } 
      else { if (y === (activePlayer === 'player1' ? 4 : 0)) canPlace = true; }

      if (canPlace && !pieces.some(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y))) {
        if (currentQueue.length > 0) {
          const defId = currentQueue[0];
          if (defId === 'wolf') { 
            dispatch({ type: 'SET_WOLF_DECLARATION', payload: { source: 'queue', owner: activePlayer, x, y } }); 
            return; 
          }
          dispatch({ type: 'PLACE_INITIAL_PIECE', payload: { activePlayer, defId, x, y, isTrapPhase } });
        }
      }
      return;
    }

    if (swapAbilityState?.step === 'selecting_target') {
      const clickedPiece = pieces.find(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y));
      if (clickedPiece && clickedPiece.id !== swapAbilityState.pieceId) {
        const def = getEffectiveDefinition(clickedPiece);
        const w = def?.size?.width || 1; const h = def?.size?.height || 1;
        if (w > 1 || h > 1) return; 
        
        const isP1 = currentPlayer === 'player1';
        const inOwnZone = isP1 ? (clickedPiece.position.y >= 2) : (clickedPiece.position.y <= 2);
        if (inOwnZone) {
          dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: { ...swapAbilityState, step: 'confirm', targetPieceId: clickedPiece.id } });
        }
      } else {
        dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: null });
        dispatch({ type: 'SET_SELECTED_PIECE', payload: { pieceId: null } });
      }
      return; 
    }

    const activePiece = selectedBoardPiece || selectedCapturedPiece;

    let chosenAnchor: Position | null = null;
    if (activePiece) {
      for (const mPos of movablePositions) {
        if (getOccupiedPositions({ ...activePiece, position: mPos }).some(pos => pos.x === x && pos.y === y)) { chosenAnchor = mPos; break; }
      }
    }

    if (chosenAnchor && activePiece) {
      const activeDef = getEffectiveDefinition(activePiece);
      if (activePiece.definitionId === 'wolf' && !!selectedCapturedPiece) { 
        dispatch({ type: 'SET_WOLF_DECLARATION', payload: { source: 'hand', owner: currentPlayer, x: chosenAnchor.x, y: chosenAnchor.y, pieceId: activePiece.id } }); 
        return; 
      }
      if (activeDef?.tags?.includes('requires_gamble') && !turnState.isSecondMove) { 
        dispatch({ type: 'SET_PENDING_ACTION', payload: { pieceId: activePiece.id, to: chosenAnchor, isDrop: !!selectedCapturedPiece } }); 
        dispatch({ type: 'SET_CHOHAN_STATE', payload: null });
        dispatch({ type: 'SET_PHASE', payload: { phase: 'minigame_chohan' } });
        return; 
      }
      if (activeDef?.tags?.includes('renda_minigame')) {
        const dist = !!selectedCapturedPiece ? 1 : Math.max(Math.abs(chosenAnchor.x - activePiece.position.x), Math.abs(chosenAnchor.y - activePiece.position.y));
        const req = dist * (rendaQuotas[currentPlayer] + (activePiece.components.useCount || 0));
        dispatch({ type: 'SET_PENDING_ACTION', payload: { pieceId: activePiece.id, to: chosenAnchor, isDrop: !!selectedCapturedPiece } });
        dispatch({ type: 'START_RENDA_PLAY', payload: { required: req } });
        return;
      }

      dispatch({ type: 'MOVE_PIECE', payload: { pieceId: activePiece.id, to: chosenAnchor, isDrop: !!selectedCapturedPiece } });
      return; 
    }

    const clickedPiece = pieces.find(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y));

    if (!activePiece && clickedPiece && clickedPiece.owner !== currentPlayer && clickedPiece.definitionId === 'wolf') {
      dispatch({ type: 'SET_ACCUSE_STATE', payload: { targetPieceId: clickedPiece.id, step: 'confirm' } }); 
      return;
    }

    if (clickedPiece && clickedPiece.owner === currentPlayer) {
      if (mustDropState?.playerId === currentPlayer) return;
      if (turnState.isSecondMove && clickedPiece.id !== selectedPieceId) return;
      
      dispatch({ type: 'SET_SELECTED_PIECE', payload: { pieceId: clickedPiece.id } });

      const def = getEffectiveDefinition(clickedPiece);
      if (def?.id === 'white_sage' && !clickedPiece.components?.isExhausted) {
        dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: { pieceId: clickedPiece.id, step: 'ask' } });
      } else if (def?.tags?.includes('gamble_jump')) {
        dispatch({ type: 'SET_PENDING_ACTION', payload: { pieceId: clickedPiece.id, to: { x: 0, y: 0 }, isDrop: false } });
        dispatch({ type: 'SET_PHASE', payload: { phase: 'minigame_gamble_jump' } });
      } else {
        dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: null });
      }
    } else {
      if (!turnState.isSecondMove) dispatch({ type: 'SET_SELECTED_PIECE', payload: { pieceId: null } });
      dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: null });
    }
  };

  const handleCapturedClick = (pieceId: string) => {
    // ★追加：オンライン対戦時、自分のターンじゃない時は一切の操作を無効化する防御壁
    if (isOnline && myPlayerId !== currentPlayer) return;

    if (phase !== 'playing' || pendingPromotion || winner || turnState.isSecondMove || wolfDeclaration || accuseState || pendingBombActivation || pendingMineConfirmation || swapAbilityState?.step === 'ask' || swapAbilityState?.step === 'confirm') return;
    if (mustDropState?.playerId === currentPlayer && pieceId !== mustDropState.pieceId) return;

    const target = capturedPieces.find(p => p.id === pieceId);
    if (target && target.owner === currentPlayer) {
      if (PIECE_DEFINITIONS[target.definitionId]?.tags?.includes('bullet_minigame')) { 
        dispatch({ type: 'START_BULLET_MINIGAME', payload: { pieceId } }); 
        return; 
      }
      
      dispatch({ type: 'SET_SELECTED_PIECE', payload: { pieceId } });
      dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: null });

      if (PIECE_DEFINITIONS[target.definitionId]?.tags?.includes('gamble_jump')) {
        dispatch({ type: 'SET_PENDING_ACTION', payload: { pieceId: pieceId, to: { x: 0, y: 0 }, isDrop: true } });
        dispatch({ type: 'SET_PHASE', payload: { phase: 'minigame_gamble_jump' } });
      }
    }
  };

  const resolvePromotion = (doPromote: boolean) => dispatch({ type: 'RESOLVE_PROMOTION', payload: { doPromote } });
  const resolveWolfDeclaration = (roleId: string) => dispatch({ type: 'RESOLVE_WOLF_DECLARATION', payload: { roleId } });
  const resetGame = () => dispatch({ type: 'SYSTEM_RESET_GAME' });
  const proceedAccusation = (step: 'select'|'final', guessedRole?: string) => dispatch({ type: 'PROCEED_ACCUSATION', payload: { step, guessedRole } });
  const cancelAccusation = () => dispatch({ type: 'CANCEL_ACCUSATION' });
  const resolveAccusation = () => dispatch({ type: 'RESOLVE_ACCUSATION' });
  const closeAccusationResult = () => dispatch({ type: 'CLOSE_ACCUSATION_RESULT' });
  const playChohan = (guess: 'cho'|'han', isDoubleUp: boolean = false) => dispatch({ type: 'PLAY_CHOHAN', payload: { guess, isDoubleUp } });
  const resolveChohan = (proceed: boolean) => dispatch({ type: 'RESOLVE_CHOHAN', payload: { proceed } });
  const startRoulette = () => dispatch({ type: 'START_ROULETTE' });
  const resolveRoulette = () => dispatch({ type: 'RESOLVE_ROULETTE' });
  const resolveBombActivation = (activate: boolean) => dispatch({ type: 'RESOLVE_BOMB_ACTIVATION', payload: { activate } });
  const resolveBullet = (targetId: string | null) => dispatch({ type: 'RESOLVE_BULLET', payload: { targetId } });
  const startRendaSetting = () => dispatch({ type: 'START_RENDA_SETTING' });
  const clickRendaSetting = () => dispatch({ type: 'CLICK_RENDA_SETTING' });
  const tickRendaSetting = () => dispatch({ type: 'TICK_RENDA_SETTING' });
  const finishRendaSetting = () => dispatch({ type: 'FINISH_RENDA_SETTING' });
  const startRendaPlay = () => { if (rendaPlayState) dispatch({ type: 'START_RENDA_PLAY_ACTIVATE' }); };
  const clickRendaPlay = () => dispatch({ type: 'CLICK_RENDA_PLAY' });
  const tickRendaPlay = () => dispatch({ type: 'TICK_RENDA_PLAY' });
  const finishRendaPlay = () => dispatch({ type: 'FINISH_RENDA_PLAY' });
  const resolveMineConfirmation = (proceed: boolean) => dispatch({ type: 'RESOLVE_MINE_CONFIRMATION', payload: { proceed } });
  const resolveSwapAbility = (answer: string) => dispatch({ type: 'RESOLVE_SWAP_ABILITY', payload: { answer } });
  const resolveGambleJump = (x: number, y: number) => dispatch({ type: 'RESOLVE_GAMBLE_JUMP', payload: { x, y } });
  const cancelGambleJump = () => dispatch({ type: 'CANCEL_GAMBLE_JUMP' });

  const visiblePieces = pieces.filter(p => phase === 'placement_p1' ? p.owner === 'player1' : phase === 'placement_p2' ? p.owner === 'player2' : true);

return {
    phase, pieces: visiblePieces, capturedPieces, p1Queue, p2Queue, p1TrapQueue, p2TrapQueue, currentPlayer, selectedPieceId, movablePositions, pendingPromotion, winner,
    chohanState, rouletteState, turnState, turnSkipState, wolfDeclaration, accuseState, WOLF_ROLES, turnCount, mustDropState, pendingBombActivation, bulletMinigameData,
    rendaQuotas, rendaSettingState, rendaPlayState, pendingMineConfirmation, swapAbilityState,
    ruleSettings, // ★追加
    dispatch, 
    handleCellClick, handleCapturedClick, resolvePromotion, resolveWolfDeclaration, resetGame,
    proceedAccusation, cancelAccusation, resolveAccusation, closeAccusationResult, playChohan, resolveChohan, startRoulette, resolveRoulette, resolveBombActivation, resolveBullet,
    startRendaSetting, clickRendaSetting, tickRendaSetting, finishRendaSetting, startRendaPlay, clickRendaPlay, tickRendaPlay, finishRendaPlay, resolveMineConfirmation, resolveSwapAbility, resolveGambleJump, cancelGambleJump
  };
};