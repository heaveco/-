// src/rules/victory.ts
import type { Piece, PlayerId } from '../entities/types';

// 勝敗の結果を表す型
export interface VictoryResult {
  winner: PlayerId;
  reason: string;
}

// 1. 二歩（反則）の判定関数
// 指定した列(x)に、既に自分の歩が存在するかチェック
export const checkNifu = (pieces: Piece[], owner: PlayerId, x: number): boolean => {
  return pieces.some(p => p.owner === owner && p.definitionId === 'pawn' && p.position.x === x);
};

// 2. 毎ターンの行動後に呼ばれる「汎用・勝利判定エンジン」
export const evaluateVictoryConditions = (
  currentPieces: Piece[], 
  actionPlayer: PlayerId, 
  lastAction?: { type: 'drop'; definitionId: string; x: number }
): VictoryResult | null => {
  
  // 【敗北条件】二歩のチェック（歩を打った時だけ評価）
  if (lastAction?.type === 'drop' && lastAction.definitionId === 'pawn') {
    // もし打った列に既に自分の歩が「2つ」あれば反則負け（1つは今打った歩なので、2つ以上で二歩）
    const pawnCountInColumn = currentPieces.filter(
      p => p.owner === actionPlayer && p.definitionId === 'pawn' && p.position.x === lastAction.x
    ).length;
    
    if (pawnCountInColumn >= 2) {
      const winner = actionPlayer === 'player1' ? 'player2' : 'player1';
      return { winner, reason: `反則：二歩（${actionPlayer === 'player1' ? 'Player 1' : 'Player 2'} が同じ列に歩を打ちました）` };
    }
  }

  // 【勝利条件】王が盤面に存在するかチェック（従来の王手判定の一般化）
  // ※今後「偽装王」などが出た場合は、ここの検索条件を変えるだけで対応できます
  const p1KingExists = currentPieces.some(p => (p.owner === 'player1' || p.components?.originalOwner === 'player1') && p.definitionId === 'king');
  const p2KingExists = currentPieces.some(p => (p.owner === 'player2' || p.components?.originalOwner === 'player2') && p.definitionId === 'king');

  if (!p1KingExists) return { winner: 'player2', reason: '王将陥落（Player 1 の王が取られました）' };
  if (!p2KingExists) return { winner: 'player1', reason: '王将陥落（Player 2 の王が取られました）' };

  // 誰も勝っていない場合は null
  return null;
};