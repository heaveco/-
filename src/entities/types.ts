// src/entities/types.ts

// 座標 (x, y)
export type Position = { x: number; y: number };

// プレイヤーID
export type PlayerId = 'player1' | 'player2';

// 駒の基本構造（コンポーネント指向）
export interface Piece {
  id: string; // 盤面上のユニークID
  definitionId: string; // JSONで定義された駒の種類ID (例: "phantom_mimic")
  owner: PlayerId;
  position: Position;
  components: Record<string, any>; // hp, isVisible などの動的データ
}

// ゲームの文脈（アクションやフィルターに渡す現在の状態）
export interface GameContext {
  board: Piece[];
  currentPlayer: PlayerId;
  targetPiece?: Piece;
  targetPosition?: Position;
}

// レジストリに登録するフィルターのインターフェース
export interface IMoveFilter {
  evaluate(context: GameContext): boolean;
}

// レジストリに登録するアクションのインターフェース
export interface IGameAction {
  // UIの待機などが発生し得るため Promise を返す
  execute(context: GameContext, params: any): Promise<void>;
}