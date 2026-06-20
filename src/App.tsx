// @ts-nocheck
// src/App.tsx
import { useState, useEffect } from 'react';
import { Board } from './components/Board';
import { Piece as PieceComponent } from './components/Piece';
import { useGameEngine, WOLF_ROLES } from './engine/useGameEngine';
import { PIECE_DEFINITIONS } from './data/pieces';

function App() {
  const { 
    phase, pieces, capturedPieces, p1Queue, p2Queue, p1TrapQueue, p2TrapQueue, currentPlayer, selectedPieceId, movablePositions, 
    handleCellClick, handleCapturedClick, pendingPromotion, winner, resetGame,
    chohanState, rouletteState, turnState, turnSkipState, wolfDeclaration, accuseState, turnCount, mustDropState, pendingBombActivation, bulletMinigameData,
    rendaQuotas, rendaSettingState, rendaPlayState, pendingMineConfirmation, swapAbilityState,
    resolvePromotion, resolveWolfDeclaration, proceedAccusation, cancelAccusation, resolveAccusation, closeAccusationResult, 
    playChohan, resolveChohan, startRoulette, resolveRoulette, resolveBombActivation, resolveBullet,
    startRendaSetting, clickRendaSetting, tickRendaSetting, finishRendaSetting, startRendaPlay, clickRendaPlay, tickRendaPlay, finishRendaPlay, resolveMineConfirmation, resolveSwapAbility
  } = useGameEngine();

  const [rotationAngle, setRotationAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bulletResult, setBulletResult] = useState<{ targetId: string | null, label: string } | null>(null);

  useEffect(() => {
    if (phase === 'minigame_bullet' && bulletMinigameData) {
      setRotationAngle(0);
      setIsSpinning(true);
      setBulletResult(null);
    }
  }, [phase, bulletMinigameData]);

  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();
    const animate = (time: number) => {
      if (phase === 'minigame_bullet' && isSpinning && bulletMinigameData) {
        const delta = time - lastTime;
        lastTime = time;
        setRotationAngle(prev => (prev + (bulletMinigameData.speed * delta / 1000)) % 360);
        animFrame = requestAnimationFrame(animate);
      }
    };
    if (phase === 'minigame_bullet' && isSpinning && bulletMinigameData) {
      animFrame = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animFrame);
  }, [phase, isSpinning, bulletMinigameData]);

  const handleStopBullet = () => {
    setIsSpinning(false);
    if (bulletMinigameData) {
      const currentDiskAngle = (rotationAngle + bulletMinigameData.initialOffset) % 360;
      const needleAngleOnDisk = (360 - currentDiskAngle) % 360;
      const hitTarget = bulletMinigameData.targets.find(t => needleAngleOnDisk >= t.startAngle && needleAngleOnDisk < t.endAngle);
      setBulletResult({ targetId: hitTarget?.pieceId || null, label: hitTarget?.label || 'ハズレ' });
    }
  };

  useEffect(() => {
    let timerId: any;
    if (phase === 'renda_quota_p1' || phase === 'renda_quota_p2') {
      if (rendaSettingState?.isActive && rendaSettingState.timeLeft > 0) timerId = setInterval(tickRendaSetting, 1000);
      else if (rendaSettingState?.timeLeft === 0) finishRendaSetting();
    } else if (phase === 'minigame_renda_play') {
      if (rendaPlayState?.isActive && rendaPlayState.timeLeft > 0) timerId = setInterval(tickRendaPlay, 1000);
      else if (rendaPlayState?.timeLeft === 0) finishRendaPlay();
    }
    return () => clearInterval(timerId);
  }, [phase, rendaSettingState?.isActive, rendaSettingState?.timeLeft, rendaPlayState?.isActive, rendaPlayState?.timeLeft]);

  let statusText = '';
  if (winner) statusText = 'ゲーム終了！';
  else if (phase === 'placement_p1') statusText = '【配置】Player 1 (青) : 一番手前の列に駒を置いてください';
  else if (phase === 'placement_p2') statusText = '【配置】Player 2 (赤) : 一番奥の列に駒を置いてください';
  else if (phase === 'trap_placement_p1') statusText = '【地雷配置】Player 1 (青) : 自陣から3列以内の空きマスに配置してください';
  else if (phase === 'trap_placement_p2') statusText = '【地雷配置】Player 2 (赤) : 自陣から3列以内の空きマスに配置してください';
  else if (phase === 'renda_quota_p1') statusText = '【連打妨害】Player 1 (青) : 相手の連打ノルマを決めてください！';
  else if (phase === 'renda_quota_p2') statusText = '【連打妨害】Player 2 (赤) : 相手の連打ノルマを決めてください！';
  else if (swapAbilityState?.step === 'selecting_target') statusText = '【能力】入れ替える自陣の駒を選択してください';
  else statusText = `Turn ${turnCount}: ${currentPlayer === 'player1' ? 'Player 1 (青)' : 'Player 2 (赤)'}`;

  const activeQueue = phase === 'placement_p1' ? p1Queue : phase === 'placement_p2' ? p2Queue : phase === 'trap_placement_p1' ? p1TrapQueue : phase === 'trap_placement_p2' ? p2TrapQueue : [];
  const nextPieceId = activeQueue[0];
  const nextPieceName = nextPieceId ? PIECE_DEFINITIONS[nextPieceId]?.name : '';

  const p1Cap = capturedPieces.filter(p => p.owner === 'player1');
  const p2Cap = capturedPieces.filter(p => p.owner === 'player2');
  const selectedPieceObj = pieces.find(p => p.id === selectedPieceId);
  const canSpinRoulette = selectedPieceObj && PIECE_DEFINITIONS[selectedPieceObj.definitionId]?.tags?.includes('can_spin_roulette');
  const isMyPenaltyTurn = mustDropState?.playerId === currentPlayer;

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans relative pb-10 overflow-hidden">
      <div className="text-center pt-8">
        <h1 className="text-3xl font-bold mb-2">Custom Board Game</h1>
        {/* ★ここに確実に見える注意書きを追加★ */}
        <div className="max-w-xl mx-auto mb-4 px-4 py-2 bg-gray-800 border border-yellow-600 rounded-lg text-xs text-yellow-400 text-left">
          <p className="font-bold mb-1">⚠️ 二次創作に関するガイドラインへの配慮</p>
          <p>本ゲームは、オモコロチャンネル様(https://www.youtube.com/@omocorochannel)の動画企画「将棋の新弾」を元にした、ファンによる非公式の二次創作（開発途中版）です。公式（株式会社バーグハンバーグバーグ様）とは一切関係ありません。完全非営利で運営されており、権利所有者様からの取り下げ要請があった場合は速やかに公開を停止します。</p>
          <p>"双子"のコマ二種につきましては、@MADOguchimoto様の投稿(X:旧Twitter)https://x.gd/fzSC4が本家になります。</p>
          <p>"白の賢人"につきましては、同投稿者様の投稿https://x.gd/srSvcが本家になります。</p>
          <p>上記原作者様達へのリスペクトは前提ですが、コードを弄れる方は、ぜひ自由に改造して遊んだり、より良いものに進化させたりしてください。よろしくお願いいたします。</p>
        </div>
        <div className={`inline-block px-6 py-2 rounded-full font-bold shadow-lg mb-2 ${winner ? 'bg-yellow-500' : swapAbilityState ? 'bg-indigo-600' : phase === 'playing' ? (currentPlayer === 'player1' ? 'bg-blue-600' : 'bg-red-600') : 'bg-gray-600'}`}>{statusText}</div>
        {mustDropState && <div className="text-red-400 font-bold animate-bounce mt-2">⚠️ 迷惑をかけられています！指定の駒を必ず手持ちから出してください！</div>}
        {turnSkipState[currentPlayer === 'player1' ? 'player2' : 'player1'] && <div className="text-yellow-400 font-bold mb-2 animate-pulse">※相手はペナルティで1回休みです！</div>}
        {phase.startsWith('placement') || phase.startsWith('trap_placement') ? (
          nextPieceId && (
            <div className="block mt-2">
              <div className="inline-block bg-gray-800 p-3 rounded-lg border border-gray-600 shadow-md">
                <span className="text-gray-400 text-sm">次に置く駒: </span>
                <span className="text-2xl font-bold ml-2 text-white bg-gray-700 px-4 py-1 rounded">{nextPieceName}</span>
                <span className="text-gray-500 text-sm ml-4">残り {activeQueue.length}個</span>
              </div>
            </div>
          )
        ) : null}
        {canSpinRoulette && phase === 'playing' && !turnState.isSecondMove && (
          <div className="mt-4"><button onClick={startRoulette} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-full font-bold shadow-lg animate-bounce border-2 border-purple-300">🎲 運命のルーレットを回す</button></div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 flex flex-col items-center gap-4 mt-4">
        <div className="w-full bg-red-900 bg-opacity-30 p-4 rounded-lg min-h-[80px] border border-red-900">
          <p className="text-sm font-bold text-red-300 mb-2">Player 2 の持ち駒</p>
          <div className="flex flex-wrap gap-2">
            {p2Cap.map(piece => (
              <div key={piece.id} className={`scale-75 origin-top-left -mr-3 -mb-3 cursor-pointer ${selectedPieceId === piece.id ? 'ring-4 ring-yellow-400 rounded-full z-10 relative' : ''} ${isMyPenaltyTurn && mustDropState.pieceId !== piece.id ? 'opacity-30' : ''}`} onClick={() => handleCapturedClick(piece.id)}>
                <PieceComponent piece={piece} inHand={true} currentPlayer={currentPlayer} />
              </div>
            ))}
          </div>
        </div>

        <div className="w-full flex justify-center">
          <Board pieces={pieces} selectedPieceId={selectedPieceId} selectedCapturedPiece={capturedPieces.find(p => p.id === selectedPieceId)} movablePositions={movablePositions} onCellClick={handleCellClick} currentPlayer={currentPlayer} />
        </div>

        <div className="w-full bg-blue-900 bg-opacity-30 p-4 rounded-lg min-h-[80px] border border-blue-900 mt-4">
          <p className="text-sm font-bold text-blue-300 mb-2">Player 1 の持ち駒</p>
          <div className="flex flex-wrap gap-2">
            {p1Cap.map(piece => (
              <div key={piece.id} className={`scale-75 origin-top-left -mr-3 -mb-3 cursor-pointer ${selectedPieceId === piece.id ? 'ring-4 ring-yellow-400 rounded-full z-10 relative' : ''} ${isMyPenaltyTurn && mustDropState.pieceId !== piece.id ? 'opacity-30' : ''}`} onClick={() => handleCapturedClick(piece.id)}>
                <PieceComponent piece={piece} inHand={true} currentPlayer={currentPlayer} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- ★新規：白賢の入れ替え能力ダイアログ --- */}
      {swapAbilityState?.step === 'ask' && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-white max-w-md w-full">
            <h2 className="text-3xl font-bold mb-4 text-white">白の賢人</h2>
            <p className="mb-6 text-gray-300 text-lg">自陣の駒と位置を入れ替える能力を使いますか？</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => resolveSwapAbility('yes')} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold text-lg">はい（能力を使う）</button>
              <button onClick={() => resolveSwapAbility('no')} className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded font-bold text-lg">いいえ（通常移動）</button>
            </div>
          </div>
        </div>
      )}

      {swapAbilityState?.step === 'confirm' && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-white max-w-md w-full">
            <h2 className="text-3xl font-bold mb-4 text-white">入れ替え確認</h2>
            <p className="mb-6 text-gray-300 text-lg">
              「{PIECE_DEFINITIONS[pieces.find(p => p.id === swapAbilityState.targetPieceId)?.definitionId || '']?.name}」と本当に入れ替えますか？<br/>
              <span className="text-sm text-gray-400 mt-2 block">入れ替え後、白の賢人は行動不能になります。</span>
            </p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => resolveSwapAbility('confirm_yes')} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded font-bold text-lg">はい</button>
              <button onClick={() => resolveSwapAbility('confirm_no')} className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded font-bold text-lg">やめる</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'mine_confirm' && pendingMineConfirmation && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-yellow-500 max-w-md w-full">
            <h2 className="text-3xl font-bold mb-4 text-yellow-400">⚠️ 味方の地雷</h2>
            <p className="mb-6 text-gray-300 text-lg">進行方向に味方の地雷があります。<br/>通過・配置すると地雷は破壊されますが、よろしいですか？</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => resolveMineConfirmation(true)} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded font-bold text-lg">はい（破壊して進む）</button>
              <button onClick={() => resolveMineConfirmation(false)} className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded font-bold text-lg">やめる</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'minigame_roulette' && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-purple-500 max-w-md w-full">
            <h2 className="text-3xl font-bold mb-6 text-purple-400">運命のルーレット</h2>
            <div className="mb-8">
              {rouletteState === 'win' && <div className="text-4xl animate-bounce">🎊 特殊勝利 🎊</div>}
              {rouletteState === 'lose' && <div className="text-4xl text-red-500 animate-pulse">💀 特殊敗北 💀</div>}
              {rouletteState === 'miss' && <div className="text-4xl text-gray-400">💨 はずれ（ターン終了）</div>}
            </div>
            <button onClick={resolveRoulette} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold w-full">結果を受け入れる</button>
          </div>
        </div>
      )}

      {(phase === 'renda_quota_p1' || phase === 'renda_quota_p2') && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-4 border-purple-500 max-w-md w-full">
            <h2 className={`text-3xl font-bold mb-4 ${phase==='renda_quota_p1' ? 'text-blue-400' : 'text-red-400'}`}>連打妨害！</h2>
            <p className="mb-4 text-gray-300">相手の「連打コマ」の必要ノルマを決めることができます。<br/>5秒間で連打した回数が、1マスあたりの必要回数になります！</p>
            {!rendaSettingState ? (
              <button onClick={startRendaSetting} className="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded font-bold text-2xl animate-pulse">準備完了 (5秒スタート)</button>
            ) : (
              <>
                <div className="text-6xl font-black mb-6 text-yellow-400">{rendaSettingState.clicks} 回</div>
                <div className="text-xl mb-4">残り: <span className="font-bold text-2xl text-red-400">{rendaSettingState.timeLeft}</span> 秒</div>
                {rendaSettingState.isActive ? (
                  <button onClick={clickRendaSetting} className="w-full py-10 bg-red-600 active:bg-red-800 rounded-xl font-black text-4xl shadow-inner select-none">ここを連打しろ！</button>
                ) : (
                  <div className="text-2xl text-green-400 font-bold">終了！</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'minigame_renda_play' && rendaPlayState && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-4 border-yellow-500 max-w-md w-full">
            <h2 className="text-3xl font-bold mb-4 text-yellow-400">🔥 連打アタック 🔥</h2>
            <p className="mb-4 text-gray-300">相手が設定したノルマと使用回数から要求が計算された！<br/>3秒以内に要求回数を叩き出せ！</p>
            <div className="flex justify-around items-center mb-6">
              <div className="text-center">
                <div className="text-sm text-gray-400">現在</div>
                <div className="text-5xl font-black text-blue-400">{rendaPlayState.clicks}</div>
              </div>
              <div className="text-3xl">/</div>
              <div className="text-center">
                <div className="text-sm text-gray-400">要求ノルマ</div>
                <div className="text-5xl font-black text-red-400">{rendaPlayState.required}</div>
              </div>
            </div>
            {!rendaPlayState.isActive && rendaPlayState.timeLeft === 3 ? (
              <button onClick={startRendaPlay} className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 rounded font-bold text-2xl animate-pulse">スタート！</button>
            ) : (
              <>
                <div className="text-xl mb-4">残り: <span className="font-bold text-2xl text-red-400">{rendaPlayState.timeLeft}</span> 秒</div>
                {rendaPlayState.isActive ? (
                  <button onClick={clickRendaPlay} className="w-full py-10 bg-red-600 active:bg-red-800 rounded-xl font-black text-4xl shadow-inner select-none">連打！連打！</button>
                ) : (
                  <div className={`text-2xl font-bold ${rendaPlayState.clicks >= rendaPlayState.required ? 'text-green-400' : 'text-gray-500'}`}>
                    {rendaPlayState.clicks >= rendaPlayState.required ? '成功！' : '失敗...'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'minigame_bullet' && bulletMinigameData && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-blue-500 max-w-md w-full">
            <h2 className="text-3xl font-bold mb-4 text-blue-400">🔫 スナイプ・ダーツ</h2>
            <p className="mb-4 text-gray-300">タイミングを合わせて敵を撃ち抜け！</p>
            
            <div className="mb-8 flex flex-col items-center justify-center relative">
               <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[20px] border-l-transparent border-r-transparent border-t-red-500 z-20" />
               <div 
                 className="w-48 h-48 rounded-full border-4 border-gray-600 shadow-[0_0_20px_rgba(0,0,0,1)] relative overflow-hidden"
                 style={{ 
                   background: `conic-gradient(${bulletMinigameData.targets.map(t => `${t.color} ${t.startAngle}deg, ${t.color} ${t.endAngle}deg`).join(', ')})`,
                   transform: `rotate(${rotationAngle + bulletMinigameData.initialOffset}deg)` 
                 }}
               >
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-gray-800 rounded-full z-10" />
               </div>
               
               <div className="h-10 mt-6 flex items-center justify-center">
                 {bulletResult ? (
                    <span className={bulletResult.targetId ? 'text-green-400 font-bold text-2xl animate-pulse' : 'text-gray-500 font-bold text-xl'}>
                      {bulletResult.label}
                    </span>
                 ) : (
                    <span className="text-gray-400 text-sm">（回転中...）</span>
                 )}
               </div>
            </div>
            
            {isSpinning ? (
              <button onClick={handleStopBullet} className="w-full py-4 bg-red-600 hover:bg-red-500 rounded font-bold text-2xl animate-pulse">STOP!</button>
            ) : (
              <>
                <div className="mb-4">
                  {bulletResult?.targetId ? (
                    <div className="text-green-400 text-xl font-bold">命中！！ 敵の「{bulletResult.label}」を撃ち抜いた！</div>
                  ) : (
                    <div className="text-red-400 text-xl font-bold">ハズレ... 弾は外れた</div>
                  )}
                </div>
                <button onClick={() => resolveBullet(bulletResult?.targetId || null)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold text-lg">結果を確定</button>
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'bomb_activation' && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-yellow-500 max-w-md w-full">
            <h2 className="text-3xl font-bold mb-4 text-yellow-400">💣 爆弾起動</h2>
            <p className="mb-6 text-gray-300">2ターン後に自分と周囲8マスを吹き飛ばす時限爆弾を起動しますか？</p>
            <div className="flex gap-4 justify-center"><button onClick={() => resolveBombActivation(true)} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded font-bold text-lg">起動する</button><button onClick={() => resolveBombActivation(false)} className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded font-bold text-lg">しない</button></div>
          </div>
        </div>
      )}

      {wolfDeclaration && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-gray-500 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">狼の能力を選択</h2>
            <div className="grid grid-cols-3 gap-4">{WOLF_ROLES.map(role => <button key={role} onClick={() => resolveWolfDeclaration(role)} className="py-3 bg-gray-600 hover:bg-gray-500 rounded font-bold text-xl">{PIECE_DEFINITIONS[role].name}</button>)}</div>
          </div>
        </div>
      )}

      {accuseState && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-red-500 max-w-md w-full">
            {accuseState.step === 'confirm' && (<><h2 className="text-2xl font-bold mb-4 text-red-400">敵の正体を指摘しますか？</h2><div className="flex gap-4 justify-center"><button onClick={cancelAccusation} className="px-6 py-2 bg-gray-600 rounded">やめる</button><button onClick={() => proceedAccusation('select')} className="px-6 py-2 bg-red-600 rounded">はい</button></div></>)}
            {accuseState.step === 'select' && (<><div className="grid grid-cols-3 gap-4 mb-6">{WOLF_ROLES.map(role => <button key={role} onClick={() => proceedAccusation('final', role)} className="py-3 bg-gray-600 rounded">{PIECE_DEFINITIONS[role].name}</button>)}</div></>)}
            {accuseState.step === 'final' && (<><h2 className="text-2xl font-bold mb-4 text-yellow-400">最終確認：{PIECE_DEFINITIONS[accuseState.guessedRole!].name}</h2><div className="flex flex-col gap-3"><button onClick={resolveAccusation} className="py-3 bg-red-600 rounded font-bold text-lg">覚悟を決めて指摘する</button><button onClick={() => proceedAccusation('select')} className="py-2 bg-gray-600 rounded">考え直す</button></div></>)}
            {accuseState.step === 'result' && (<><h2 className={`text-3xl font-bold mb-6 ${accuseState.isSuccess ? 'text-green-400' : 'text-red-500'}`}>{accuseState.isSuccess ? '成功！' : '失敗...'}</h2><button onClick={closeAccusationResult} className="w-full py-3 bg-blue-600 rounded font-bold">確認</button></>)}
          </div>
        </div>
      )}

      {phase === 'minigame_chohan' && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center border-2 border-purple-500 max-w-md w-full">
            <h2 className="text-3xl font-bold mb-6 text-purple-400">{turnState.isSecondMove ? '2回目の行動：丁半' : '丁半博打'}</h2>
            {!chohanState ? (
              <div className="flex justify-around"><button onClick={() => playChohan('cho')} className="px-8 py-4 bg-blue-600 rounded text-xl font-bold">丁 (偶数)</button><button onClick={() => playChohan('han')} className="px-8 py-4 bg-red-600 rounded text-xl font-bold">半 (奇数)</button></div>
            ) : (
              <>
                {chohanState.isWin ? <div className="text-green-400 font-bold text-2xl mb-6">勝ち！</div> : <div className="text-red-400 font-bold text-2xl mb-6">負け...（行動失敗）</div>}
                {chohanState.isWin ? (
                  <div className="flex flex-col gap-4">
                    <button onClick={() => resolveChohan(true)} className="px-6 py-3 bg-green-600 rounded font-bold">移動する</button>
                    {!capturedPieces.some(p => p.id === selectedPieceId) && !turnState.hasDoubledUp && !chohanState.isDoubleUpAttempt && (<><button onClick={() => playChohan('cho', true)} className="py-2 bg-yellow-600 rounded">ダブルアップ (丁)</button><button onClick={() => playChohan('han', true)} className="py-2 bg-yellow-600 rounded">ダブルアップ (半)</button></>)}
                  </div>
                ) : ( <button onClick={() => resolveChohan(false)} className="w-full py-3 bg-gray-600 rounded font-bold">ターン終了</button> )}
              </>
            )}
          </div>
        </div>
      )}
      {pendingPromotion && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg text-center"><h2 className="text-xl mb-4">成りますか？</h2><button onClick={() => resolvePromotion(true)} className="px-6 py-2 bg-blue-600 mr-4">はい</button><button onClick={() => resolvePromotion(false)} className="px-6 py-2 bg-gray-600">いいえ</button></div>
        </div>
      )}
      {winner && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-xl text-center"><h2 className="text-6xl text-yellow-400 mb-4">{winner.winner === 'player1' ? 'BLUE WIN!' : 'RED WIN!'}</h2><p className="mb-4">{winner.reason}</p><button onClick={resetGame} className="w-full py-3 bg-green-600 rounded text-xl">初めから</button></div>
        </div>
      )}
    </div>
  );
}

export default App;