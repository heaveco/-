import type { Piece, PlayerId, Position } from '../entities/types';
import type { VictoryResult } from '../rules/victory';

export interface GameState {
  phase: string;
  pieces: Piece[];
  capturedPieces: Piece[];
  p1Queue: string[];
  p2Queue: string[];
  p1TrapQueue: string[];
  p2TrapQueue: string[];
  currentPlayer: PlayerId;
  selectedPieceId: string | null;
  pendingPromotion: { pieceId: string; promoteTo: string; skipTurnChange: boolean } | null;
  winner: VictoryResult | null;
  turnCount: number;
  mustDropState: { playerId: PlayerId; pieceId: string } | null;
  pendingBombActivation: { pieceId: string } | null;
  rendaQuotas: { player1: number; player2: number };
  rendaSettingState: { clicks: number; isActive: boolean; timeLeft: number } | null;
  rendaPlayState: { clicks: number; required: number; isActive: boolean; timeLeft: number } | null;
  bulletMinigameData: any | null;
  pendingMineConfirmation: { args: any[]; mineIds: string[] } | null;
  turnState: { hasDoubledUp: boolean; isSecondMove: boolean };
  turnSkipState: { player1: boolean; player2: boolean };
  pendingAction: { pieceId: string; to: Position; isDrop: boolean } | null;
  chohanState: any | null;
  rouletteState: any | null;
  wolfDeclaration: any | null;
  accuseState: any | null;
  swapAbilityState: { pieceId: string; step: 'ask' | 'selecting_target' | 'confirm'; targetPieceId?: string } | null;
  ruleSettings?: { useTurnTimer: boolean };
  explosions?: Position[]; // ★新規追加：爆発エフェクトの座標リスト
  // ▼ 新規追加：操と洗脳の状態管理
  manipulateState: { pieceId: string; step: 'ask' | 'select_target' | 'select_dest'; targetPieceId?: string } | null;
  hypnosisState: { pieceId: string; step: 'ask' | 'select_target' } | null;
}

export type GameAction = 
  | { type: 'SYSTEM_RESET_GAME' }
  | { type: 'PLACE_INITIAL_PIECE'; payload: { activePlayer: PlayerId; defId: string; x: number; y: number; isTrapPhase: boolean; wolfMimicRole?: string } }
  | { type: 'MOVE_PIECE'; payload: { pieceId: string; to: Position; isDrop: boolean; skipTurnChange?: boolean; wolfMimicRole?: string; newUseCount?: number; destroyedAllyMineIds?: string[] } }
  | { type: 'RESOLVE_MINE_CONFIRMATION'; payload: { proceed: boolean } }
  | { type: 'RESOLVE_BOMB_ACTIVATION'; payload: { activate: boolean } }
  | { type: 'RESOLVE_BULLET'; payload: { targetId: string | null } }
  | { type: 'RESOLVE_PROMOTION'; payload: { doPromote: boolean } }
  | { type: 'RESOLVE_WOLF_DECLARATION'; payload: { roleId: string } }
  | { type: 'PROCEED_ACCUSATION'; payload: { step: 'select' | 'final'; guessedRole?: string } }
  | { type: 'CANCEL_ACCUSATION' }
  | { type: 'RESOLVE_ACCUSATION' }
  | { type: 'CLOSE_ACCUSATION_RESULT' }
  | { type: 'PLAY_CHOHAN'; payload: { guess: 'cho' | 'han'; isDoubleUp: boolean } }
  | { type: 'RESOLVE_CHOHAN'; payload: { proceed: boolean } }
  | { type: 'START_ROULETTE' }
  | { type: 'RESOLVE_ROULETTE' }
  | { type: 'RESOLVE_SWAP_ABILITY'; payload: { answer: string } }
  | { type: 'RESOLVE_GAMBLE_JUMP'; payload: { x: number; y: number } }
  | { type: 'CANCEL_GAMBLE_JUMP' }
  | { type: 'START_RENDA_SETTING' }
  | { type: 'CLICK_RENDA_SETTING' }
  | { type: 'TICK_RENDA_SETTING' }
  | { type: 'FINISH_RENDA_SETTING' }
  | { type: 'START_RENDA_PLAY'; payload: { required: number } }
  | { type: 'START_RENDA_PLAY_ACTIVATE' }
  | { type: 'CLICK_RENDA_PLAY' }
  | { type: 'TICK_RENDA_PLAY' }
  | { type: 'FINISH_RENDA_PLAY' }
  | { type: 'SET_PHASE'; payload: { phase: string } }
  | { type: 'SET_PENDING_ACTION'; payload: { pieceId: string; to: Position; isDrop: boolean } | null }
  | { type: 'SET_SELECTED_PIECE'; payload: { pieceId: string | null } }
  | { type: 'SET_WOLF_DECLARATION'; payload: any | null }
  | { type: 'SET_ACCUSE_STATE'; payload: any | null }
  | { type: 'SET_CHOHAN_STATE'; payload: any | null }
  | { type: 'SET_SWAP_ABILITY_STATE'; payload: any | null }
  | { type: 'START_BULLET_MINIGAME'; payload: { pieceId: string } }
  | { type: 'RESIGN'; payload: { playerId: PlayerId } }
  | { type: 'SKIP_TURN'; payload: { playerId: PlayerId } }
  | { type: 'CLEAR_EXPLOSIONS' } // ★新規追加：エフェクト消去
  // ▼ 新規追加：操と洗脳のアクション
  | { type: 'SET_MANIPULATE_STATE'; payload: any | null }
  | { type: 'SET_HYPNOSIS_STATE'; payload: any | null }
  | { type: 'RESOLVE_MANIPULATE_ABILITY'; payload: { answer: string; targetId?: string; to?: Position } }
  | { type: 'RESOLVE_HYPNOSIS_ABILITY'; payload: { answer: string; targetId?: string } };