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
    rendaQuotas, rendaSettingState, rendaPlayState, pendingMineConfirmation, swapAbilityState, pendingAction, ruleSettings, explosions,
    manipulateState, hypnosisState // ▼追加
  } = state;

  const selectedBoardPiece = pieces.find(p => p.id === selectedPieceId);
  const selectedCapturedPiece = capturedPieces.find(p => p.id === selectedPieceId);

// 2. movablePositions の計算ロジックに特殊状態を割り込ませる
  let movablePositions: Position[] = [];
  if (phase === 'playing' && !pendingPromotion && !winner && !accuseState && !wolfDeclaration && !pendingBombActivation) {
    // ▼ 新規追加：操と洗脳のハイライトロジック
    if (manipulateState?.step === 'select_target') {
      const manipulator = pieces.find(p => p.id === manipulateState.pieceId);
      if (manipulator) {
        const mArea = getOccupiedPositions(manipulator);
        pieces.forEach(p => {
          if (p.id === manipulator.id) return;
          const pArea = getOccupiedPositions(p);
          const isAdj = mArea.some(ma => pArea.some(pa => Math.abs(ma.x - pa.x) <= 1 && Math.abs(ma.y - pa.y) <= 1));
          if (isAdj) pArea.forEach(pa => movablePositions.push(pa));
        });
      }
    } else if (manipulateState?.step === 'select_dest') {
      const targetPiece = pieces.find(p => p.id === manipulateState.targetPieceId);
      if (targetPiece) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const newAnchor = { x: targetPiece.position.x + dx, y: targetPiece.position.y + dy };
            const shiftedHypo = { ...targetPiece, position: newAnchor };
            const shiftedArea = getOccupiedPositions(shiftedHypo);
            const isAllOnBoard = shiftedArea.every(pos => pos.x >= 0 && pos.x <= 4 && pos.y >= 0 && pos.y <= 4);
            if (isAllOnBoard) {
               // 移動先が完全に空きマスである場合のみ許可
               const isOccupiedByOther = pieces.some(p => {
                 if (p.id === targetPiece.id) return false;
                 const pArea = getOccupiedPositions(p);
                 return shiftedArea.some(sa => pArea.some(pa => pa.x === sa.x && pa.y === sa.y));
               });
               if (!isOccupiedByOther) movablePositions.push(newAnchor);
            }
          }
        }
      }
    } else if (hypnosisState?.step === 'select_target') {
      const hypnotist = pieces.find(p => p.id === hypnosisState.pieceId);
      if (hypnotist) {
        const hArea = getOccupiedPositions(hypnotist);
        pieces.forEach(p => {
          // 敵コマであり、かつボス・王以外のコマのみ選択可能にする
          if (p.owner !== currentPlayer) {
            const def = getEffectiveDefinition(p);
            if (def?.tags?.includes('boss_target') || p.definitionId === 'king') return; 
            const pArea = getOccupiedPositions(p);
            const isAdj = hArea.some(ha => pArea.some(pa => Math.abs(ha.x - pa.x) <= 1 && Math.abs(ha.y - pa.y) <= 1));
            if (isAdj) pArea.forEach(pa => movablePositions.push(pa));
          }
        });
      }
    }else if (swapAbilityState?.step === 'selecting_target') {
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
    }  else if (selectedBoardPiece) {
      movablePositions = calculateMovablePositions(selectedBoardPiece, pieces, turnCount, currentPlayer);

      if (selectedBoardPiece.definitionId === 'trickster') {
        movablePositions = movablePositions.filter(pos => Math.abs(pos.y - selectedBoardPiece.position.y) !== 4);
      }

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

  const dispatch = (action: any) => {
    if (isOnline) {
      socket.emit('send_action', { roomId, action });
    } else {
      setState(prevState => gameReducer(prevState, action));
    }
  };

// 3. handleCellClick でクリックイベントをインターセプトする
  const handleCellClick = (x: number, y: number) => {
    if (isOnline && myPlayerId !== currentPlayer) return;
    // ▼ モーダル展開中は盤面クリックを弾くよう追加
    if (wolfDeclaration || accuseState || pendingPromotion || winner || pendingBombActivation || pendingMineConfirmation || swapAbilityState?.step === 'ask' || swapAbilityState?.step === 'confirm' || manipulateState?.step === 'ask' || hypnosisState?.step === 'ask') return;

    // 【1】配置フェーズの処理
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

    // 【2】操・洗脳の能力対象の選択確定・キャンセル処理
    if (manipulateState?.step === 'select_target') {
      if (movablePositions.some(m => m.x === x && m.y === y)) {
        const clickedPiece = pieces.find(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y));
        if (clickedPiece) {
          dispatch({ type: 'RESOLVE_MANIPULATE_ABILITY', payload: { answer: 'select_target', targetId: clickedPiece.id } });
          return;
        }
      }
      // ハイライト外をクリックした場合はキャンセルして処理を下に流す
      dispatch({ type: 'SET_MANIPULATE_STATE', payload: null });
    }
    
    if (manipulateState?.step === 'select_dest') {
      if (movablePositions.some(m => m.x === x && m.y === y)) {
         dispatch({ type: 'RESOLVE_MANIPULATE_ABILITY', payload: { answer: 'select_dest', to: { x, y } } });
         return;
      }
      // ハイライト外をクリックした場合はキャンセル
      dispatch({ type: 'SET_MANIPULATE_STATE', payload: null });
    }
    
    if (hypnosisState?.step === 'select_target') {
      if (movablePositions.some(m => m.x === x && m.y === y)) {
        const clickedPiece = pieces.find(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y));
        if (clickedPiece) {
          dispatch({ type: 'RESOLVE_HYPNOSIS_ABILITY', payload: { answer: 'select_target', targetId: clickedPiece.id } });
          return;
        }
      }
      // ハイライト外をクリックした場合はキャンセル
      dispatch({ type: 'SET_HYPNOSIS_STATE', payload: null });
    }

    // 【3】白の賢人の能力対象選択・キャンセル処理
    if (swapAbilityState?.step === 'selecting_target') {
      const clickedPiece = pieces.find(p => getOccupiedPositions(p).some(pos => pos.x === x && pos.y === y));
      const isMyPieceOrMyGhost = clickedPiece && (clickedPiece.owner === currentPlayer || clickedPiece.components?.ghostAttached === currentPlayer);

      if (isMyPieceOrMyGhost) {
        if (mustDropState?.playerId === currentPlayer) return;
        if (turnState.isSecondMove && clickedPiece.id !== selectedPieceId) return;
        
        dispatch({ type: 'SET_SELECTED_PIECE', payload: { pieceId: clickedPiece.id } });

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

    // 【4】通常の移動・アクション処理
    const activePiece = selectedBoardPiece || selectedCapturedPiece;
    let chosenAnchor: Position | null = null;
    
    if (activePiece) {
      const isGhostDetachment = !selectedCapturedPiece && activePiece.components?.ghostAttached === currentPlayer;
      for (const mPos of movablePositions) {
        if (isGhostDetachment) {
          if (mPos.x === x && mPos.y === y) { chosenAnchor = mPos; break; }
        } else {
          if (getOccupiedPositions({ ...activePiece, position: mPos }).some(pos => pos.x === x && pos.y === y)) { chosenAnchor = mPos; break; }
        }
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

    // 【5】盤面上の駒を選択する処理（および能力モーダルのトリガー）
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
      } else if (def?.id === 'manipulator') {  
        dispatch({ type: 'SET_MANIPULATE_STATE', payload: { pieceId: clickedPiece.id, step: 'ask' } });
      } else if (def?.id === 'hypnotist') {    
        dispatch({ type: 'SET_HYPNOSIS_STATE', payload: { pieceId: clickedPiece.id, step: 'ask' } });
      } else if (def?.tags?.includes('gamble_jump')) {
        dispatch({ type: 'SET_PENDING_ACTION', payload: { pieceId: clickedPiece.id, to: { x: 0, y: 0 }, isDrop: false } });
        dispatch({ type: 'SET_PHASE', payload: { phase: 'minigame_gamble_jump' } });
      } else {
        dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: null });
        dispatch({ type: 'SET_MANIPULATE_STATE', payload: null }); 
        dispatch({ type: 'SET_HYPNOSIS_STATE', payload: null });   
      }
    } else {
      if (!turnState.isSecondMove) dispatch({ type: 'SET_SELECTED_PIECE', payload: { pieceId: null } });
      dispatch({ type: 'SET_SWAP_ABILITY_STATE', payload: null });
    }
  };

  const handleCapturedClick = (pieceId: string) => {
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

  // ============================================================================
  // ★ 消えてしまっていたアクション関数群を復元しました！
  // ============================================================================
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
  
  const clearExplosions = () => dispatch({ type: 'CLEAR_EXPLOSIONS' });

  const visiblePieces = pieces;

  const resolveManipulateAbility = (answer: string, targetId?: string, to?: Position) => dispatch({ type: 'RESOLVE_MANIPULATE_ABILITY', payload: { answer, targetId, to } });
  const resolveHypnosisAbility = (answer: string, targetId?: string) => dispatch({ type: 'RESOLVE_HYPNOSIS_ABILITY', payload: { answer, targetId } });

  return {
    phase, pieces: visiblePieces, capturedPieces, p1Queue, p2Queue, p1TrapQueue, p2TrapQueue, currentPlayer, selectedPieceId, movablePositions, pendingPromotion, winner,
    chohanState, rouletteState, turnState, turnSkipState, wolfDeclaration, accuseState, WOLF_ROLES, turnCount, mustDropState, pendingBombActivation, bulletMinigameData,
    rendaQuotas, rendaSettingState, rendaPlayState, pendingMineConfirmation, swapAbilityState, ruleSettings, explosions, dispatch, clearExplosions, 
    handleCellClick, handleCapturedClick, resolvePromotion, resolveWolfDeclaration, resetGame,
    proceedAccusation, cancelAccusation, resolveAccusation, closeAccusationResult, playChohan, resolveChohan, startRoulette, resolveRoulette, resolveBombActivation, resolveBullet,
    startRendaSetting, clickRendaSetting, tickRendaSetting, finishRendaSetting, startRendaPlay, clickRendaPlay, tickRendaPlay, finishRendaPlay, resolveMineConfirmation, resolveSwapAbility, resolveGambleJump, cancelGambleJump,
    manipulateState, hypnosisState, // ▼追加
    resolveManipulateAbility, resolveHypnosisAbility// ▼追加
  };
};