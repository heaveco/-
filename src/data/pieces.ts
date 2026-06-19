// src/data/pieces.ts
import type { PlayerId } from '../entities/types';

export interface MoveRule {
  generator: string;
  params: { dx: number; dy: number }[];
}

export interface PieceDefinition {
  id: string;
  name: string;
  size?: { width: number; height: number };
  tags?: string[];
  defaultComponents?: Record<string, any>;
  moveRules: MoveRule[];
  promotion?: { condition: 'in_enemy_zone'; promoteTo: string; };
}

export const PIECE_DEFINITIONS: Record<string, PieceDefinition> = {
  // --- 既存の標準将棋駒 ---
  king: { id: 'king', name: '王', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }] }] },
  pawn: { id: 'pawn', name: '歩', moveRules: [{ generator: 'relative', params: [{ dx: 0, dy: -1 }] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'tokin' } },
  tokin: { id: 'tokin', name: 'と', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }] }] },
  knight: { id: 'knight', name: '桂', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -2 }, { dx: 1, dy: -2 }] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'promoted_knight' } },
  promoted_knight: { id: 'promoted_knight', name: '成桂', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }] }] },
  silver: { id: 'silver', name: '銀', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'promoted_silver' } },
  promoted_silver: { id: 'promoted_silver', name: '成銀', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }] }] },
  gold: { id: 'gold', name: '金', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }] }] },
  lance: { id: 'lance', name: '香', moveRules: [{ generator: 'straight', params: [{ dx: 0, dy: -1 }] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'promoted_lance' } },
  promoted_lance: { id: 'promoted_lance', name: '成香', moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }] }] },
  rook: { id: 'rook', name: '飛', moveRules: [{ generator: 'straight', params: [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'promoted_rook' } },
  promoted_rook: { id: 'promoted_rook', name: '龍王', moveRules: [{ generator: 'straight', params: [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }] }, { generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }] }] },
  bishop: { id: 'bishop', name: '角', moveRules: [{ generator: 'straight', params: [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'promoted_bishop' } },
  promoted_bishop: { id: 'promoted_bishop', name: '龍馬', moveRules: [{ generator: 'straight', params: [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }] }, { generator: 'relative', params: [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }] }] },

  // --- 特殊駒（既存） ---
  troll: { id: 'troll', name: 'トロール', size: { width: 2, height: 2 }, tags: ['start_in_hand', 'boss_target'], defaultComponents: { hp: 2 }, moveRules: [{ generator: 'relative', params: [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }] }] },
  trickster: { id: 'trickster', name: 'ト⭐︎', tags: ['requires_gamble', 'start_in_hand'], moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }] }, { generator: 'edge_warp', params: [] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'promoted_trickster' } },
  promoted_trickster: { id: 'promoted_trickster', name: '⭐︎ト', tags: ['requires_gamble', 'can_spin_roulette'], moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }] }, { generator: 'edge_warp', params: [] }] },
  wolf: { id: 'wolf', name: '狼', tags: ['start_in_hand', 'is_wolf'], moveRules: [] },
  hero: { id: 'hero', name: '勇者', tags: ['requires_turn_5'], moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }] }, { generator: 'edge_warp', params: [] }] },
  nuisance: { id: 'nuisance', name: '迷惑', tags: ['force_drop_if_captured'], moveRules: [{ generator: 'relative', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }] }] },
  harm: { id: 'harm', name: '成害', tags: ['force_drop_if_captured'], moveRules: [{ generator: 'relative', params: [{ dx: 0, dy: 1 }] }] },
  bomb: { id: 'bomb', name: '爆弾', tags: ['activatable_bomb'], defaultComponents: { isActivated: false, bombTimer: 0 }, moveRules: [{ generator: 'relative', params: [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }] }] },
  landmine: { id: 'landmine', name: '地雷', tags: ['invisible_to_enemy', 'trap'], moveRules: [] },
  bullet: { id: 'bullet', name: '弾', tags: ['bullet_minigame', 'start_in_hand'], moveRules: [] },
  drunk: { id: 'drunk', name: '酔', tags: ['pusher', 'cannot_capture'], moveRules: [{ generator: 'straight', params: [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }] }], promotion: { condition: 'in_enemy_zone', promoteTo: 'promoted_drunk' } },
  promoted_drunk: { id: 'promoted_drunk', name: '成吐', tags: ['pusher', 'cannot_capture'], moveRules: [{ generator: 'straight', params: [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }] }, { generator: 'relative', params: [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }] }] },
  
  // --- ★新規追加：「連打」 ---
  renda: {
    id: 'renda',
    name: '連打',
    tags: ['renda_minigame'],
    defaultComponents: { useCount: 0 },
    moveRules: [
      { generator: 'straight', params: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }] }
    ]
  }
};