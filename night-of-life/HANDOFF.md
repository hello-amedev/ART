# HANDOFF - 生命の夜(進化する光の壁紙 / リポジトリ名は ART)

## 0. 次の Claude へ

このプロジェクトに入ったら、まずこのファイルを読むこと。
現状・設計判断・落とし穴をここに集約している。

**フォルダ構成(2026-06-13 変更)**: ART リポジトリは「ART 系プロジェクトの親」になった。
生命の夜の一式は `night-of-life/` サブフォルダに入っている(この HANDOFF も
`night-of-life/HANDOFF.md`)。ART 直下の `index.html` は作品一覧の入口ページ。
編集対象は基本 `night-of-life/` 配下。

## 1. プロジェクト概要

Lively Wallpaper 用の「遺伝的アルゴリズムで進化し続ける光の壁紙」。実験プロジェクト。

- ビジュアル(2026-06-17 に 3D 化): **3D 空間を循環する光の渦を内側から俯瞰**する。
  光は前後対称の短い針(2D 時代から継承)で、加算合成・大気遠近で奥行きを出す。
  コンセプトは「無機的なものが有機的に動く」(あめさんフィードバック反映済み。
  初版の彗星型シルエット + 蛇行 + 密集群れは「生き物っぽくて気持ち悪い」と NG だった。
  生物感を出さないことがこのプロジェクトの最重要デザイン制約)。
  (〜2026-06-14 は 2D のフローフィールド上を流れる光の筆致だった。3D 化の経緯は 2・3 章)
- 進化: 種族(粒子グループ)が遺伝子を持ち、「時刻」を選択圧として世代交代。
  選択基準そのものが 1 日で一周し続けるので進化が収束せず移ろい続ける
- 技術: 静的 HTML + Canvas 2D + vanilla JS のみ。ビルド不要、npm 不要、
  file:// で動く(ES modules を使っていないのは file:// の CORS 制約のため。
  index.html の script タグの読み込み順に依存しているので注意)
- リポジトリ: github.com/hello-amedev/ART(ブランチは main)。
  **2026-06-13 に public 化し GitHub Pages で公開**(下記 6 章)。
  公開 URL: https://hello-amedev.github.io/ART/night-of-life/
- 全体プラン(あめさん方針): Web ページ = 作品 + デモとして公開し、
  壁紙データ(Lively)は別途配布する。Web 版の進化は**実時間のみ**(早回し/demo は出さない)

## 2. 現在の状態(2026-06-20)

**2026-06-20: Step 2-3 完成 + ブルーム/色の波を常時 ON でオプション撤去**。本日のセッションで
WebGL2 化 Step 2-2(ブルーム本体・ON/OFF 化・既定 ON)→ Step 2-3(高密度化 + 色の波)を一気に進め、
**最終的に光のにじみ(ブルーム 50% 固定)と色の波(密集度ベースの位相速度ブースト + ±15° 色相波)を
常時 ON でユーザーオプションから撤去**(あめさん判断「最終的に固定でオプション無しに」)。**高密度化** =
particleCount max を 7000 → 15000 へ(`MAX = 30000` までバッファ確保済み)。
**ブルーム**: HDR FBO の明部のみを Rec.709 luminance で抽出 → 半解像度 1 段 9-tap 分離ガウシアン →
blit 加算合成。50% 固定(100% 超でちらちらする実機 FB)。オービット中(dragBoost=15)は実効強度を
1/15 に減衰させて「一様な呼吸」禁忌を構造的に回避。WebGL2 + HDR FBO が揃っていない環境では描画側で bypass。
`?bloom=0` キルスイッチと `?bloomDebug=1` 可視化は内部デバッグ用に残置。
**色の波**: species.js の omega を密集度(近傍同種数 / 8)で 1..1.6 倍にブースト + main/render-gl の
hue 振幅を ±8° → ±15° に拡大。密集している局所ほど位相が速く進み、画面全体で同期しない場所ごとの
色のうねりが出る。両 renderer 共通で動く。
**進化・物理(genome/evolution/species/field)は phaseWave 関連の常時化以外は無改修**。新遺伝子なし =
`art-evolution-v2` 据え置き。webui の Defaults snapshot から bloomStrength と phaseWaveEnabled が
無くなったので、旧 localStorage の値が残っていても loadSaved で no-op(case 削除のため)としてスキップ。
**見送り**: 案 2 被写界深度フェイク(halfW 膨らませ + AA 幅拡大)は加算合成と相性が悪く、奥粒子の
線幅を太くすると逆に背景が明るくなって DoF とは逆方向の効果になるため見送り(4 章で「本格 blur 系で
再検討」として残置)。詳細は 3 章、落とし穴は 5 章。

--- 以下は 2026-06-18 後段(オービット操作の追加)の記録 ---

**2026-06-18 後段: マウス/タッチのドラッグで視点を回せるオービット操作を追加**。
あめさん要望「中心点を中心に視点を回り込ませたい」を反映。
横ドラッグで方位、縦ドラッグで仰角、ダブルクリックで初期角度に戻る。保存なし(リロードで初期化)。
自動カメラを撤去した方針(動きは流れだけに集約)は維持。詳細は 3 章。
**進化・両 renderer・webui・設定 UI は無改修**(編集は `js/main.js` のみ)。
新遺伝子なし = `art-evolution-v2` 据え置き。

--- 以下は同日前段(オプション・計器表示の整理)の記録 ---

**2026-06-18 セッション前段: オプション・計器表示の整理が完成**。
あめさんの方針「主にオプションや表示系を整えたい」を反映して、設定パネルと計器(OBSERVATORIUM)
まわりの体験を一括で整えた:

- **設定パネルを歯車アイコン経由のクリック開閉に変更**。右上に SVG 歯車アイコン → クリックで直下にパネル展開 →
  × ボタン / アイコン再クリック / pointerleave で 2.6 秒後に自動 close。タッチ端末(`(hover: none)`)では
  auto-close を無効化し、明示操作のみで閉じる(MediaQueryList の change で動的追従、ハイブリッド端末対応)
- **ブラウザ既定言語による英語/日本語切替**(設定パネル内のみ。navigator.language が ja で始まらなければ英語)
- **カメラの動きオプション(cameraMotion)を完全撤去** → 常に固定カメラ運用に
- **色の同期(colorSync)を ON 固定化して設定から削除**(実機で違いが分からない判断・あめさん)
- 計器の **事象ログ(誕生 ↑ / 退場 ↓ / 突然変異 ✦ / 参入 +)を撤去** してメタ行 + 種族行だけのシンプル構成に
- 計器メタ行に **v2.0.0** を控えめに表示 + 世代と時刻を右揃え(種族行の state 列に揃う)
- 英訳ラベルのパネル幅オーバーを防ぐため、長い英訳を短縮 + `.lab` に overflow:ellipsis の保険
- 二段階の敵対的レビュー(多観点 workflow)で 9 件の問題を見つけて修正済み

進化(genome/evolution/species/field)・WebGL2 経路は無改修。新遺伝子なし = `art-evolution-v2` 据え置き
(進化データのリセット不要)。詳細は 3 章。**Step 2-2 (ブルーム + DoF + 高密度化)は次セッション以降**(4 章)。

--- 以下は 2026-06-17 セッション 2(WebGL2 化 Step 2-1)の記録 ---

**2026-06-17 セッション 2: WebGL2 化 Step 2-1(Canvas 等価描画の土俵作り)完成**。
あめさんの方針「Canvas 擬似3D(Step1)で方向性を握り、感触が固まれば WebGL2 へ」に従って Step 2-1 を実装。
**既定で WebGL2 経路が走り**、`?gl=0` を付けた時だけ従来の Canvas 2D 経路にフォールバックできる(WebGL2 未対応環境では自動で Canvas 2D に落ちる)。
**HDR FBO (RGBA16F) を標準採用**して 8-bit 量子化由来の残光固着を回避、距離ベース AA で MSAA 喪失を補償、
線幅最小値・粒子量範囲も実機目視に合わせて調整済み。**Step 2-2(WebGL ブルーム + 被写界深度 + 高密度化 +
位相同期の波)は次セッション以降**(下記 4 章)。詳細は 3 章。

--- 以下は 2026-06-17 セッション 1(3D 空間化 Step1)の記録 ---

**2026-06-17: 3D 空間化(Step1)に着手・完成し worktree のブランチにコミット済み**(コミット 58efd21)。
ビジュアルが「2D の光の筆致」から「**3D 空間を循環する光の渦を内側から俯瞰する**」へ大きく変わった
(あめさんの方針転換:「現状は気に入っているが"スクリーンセーバー"に見える → アート作品として
奥行きのある3次元空間へ大規模ブラッシュアップ」)。詳細は 3 章。**段階導入**で進めており、
**Step1 = Canvas 擬似3D を完成**、**Step2 = WebGL** へ進んだ(本セッションで Step 2-1 完成)。
動作確認はあめさんの実機目視で都度実施(あめさん満足の状態でコミット)。

--- 以下は 2D 時代(〜2026-06-14)の完成形の記録(進化ロジック genome/evolution はこの時代のまま流用中) ---

タイトルを「生命の夜 — A Night of Life」に決定。総合ブラッシュアップは
**段階1 + 段階2A をもって一つの完成形**とした(あめさん判断、2026-06-13)。
段階3(B案)はオフライン検証で設計の壁が判明したため見送り、将来課題とする。

- **2026-06-14 セッション = 入口ページ刷新 + 色の交叉「混色」化まで完了・公開済み**(詳細は 3 章)。
  作品本体は段階1 + 段階2A の完成形のまま。今回は色の遺伝(混色)と入口ページの作品提示を強化した
- **Web 公開フェーズ = 完了**(2026-06-13、本セッション):
  - ART を親フォルダ化し `night-of-life/` へ移動、ART 直下に入口 index.html を新設
  - **Web 版の設定 UI**(`js/webui.js`): マウス/タッチで淡く現れ、無操作で消えるパネル。
    Lively 壁紙では自動抑制(ホストが livelyPropertyListener を呼んだら teardown)。
    各操作は本来の livelyPropertyListener 経由で Settings に反映。値は web 専用
    localStorage キー `art-web-settings-v1` に保存(進化データとは別管理)
  - 「大変異」→「**突然変異**」に名称変更(ユーザー向け。内部コメントは通常 mutate と
    区別するため「大きな突然変異」表記)。観測パネルのメタ行から漢字の時間帯(夜・朝等)を削除
  - カスタマイズから**診断表示(diagMode)を削除**(診断詳細は開発用 ?debug 側に集約)
  - スマホ対応: 観測パネルをメディアクエリで縮小(はみ出し防止。文字は小さくて可・あめさん方針)、
    描画を 0.72 倍ズームアウトして流れを見やすく、高精細端末向けに描画解像度上限を 2.5 に。
    粒子は全体既定 1800・最小 1000・モバイル既定 1000。OGP/Twitter カード・favicon・theme-color 追加
  - **未了の後追い**: 共有カードは今は画像なしの `summary`。プレビュー画像
    `night-of-life/preview.png`(実機スクショ推奨)を置いたら、index.html に
    og:image / twitter:image を足し twitter:card を `summary_large_image` に戻す。
    twitter:creator(X ハンドル)も未設定 — あめさん確認待ち
  - レビュー(多観点ワークフロー)で反映済み: タッチ端末のヒント文言出し分け
    (hover:none)、入口リンクの :focus-visible、webui の Settings ガード、
    壊れた og:image を出さない方針
- **段階1 = 完了・コミット済み**(前セッション):
  - 大変異の演出を作り直し: 色の飛躍(leapHue)+ 新星の輝き(novaGlow の swell→fade bloom)
  - 多様性: 色のニッチ分化(hueCrowd 係数 0.6 / 60度)を選択圧に追加
  - 齢(ageSec)を導入・保存/復元、m:ss 表記
  - 観測パネルを **OBSERVATORIUM(計器台帳)** へ刷新: 右下のまま、デバッグ表示と同じ
    「素の数値の羅列」+ 事象ログ(誕生↑/退場↓/大変異✦/参入+)。装飾排除・高さ固定
- **段階2A = 完了・コミット済み**(前セッション): A案「系譜の夜」。淘汰の基準を
  時刻適応から「家系の勢い(vigor=子を残せているか)」へ。時刻は弱い味付け(0.2)。
  観測パネルに vig 列、誕生時の相続グロー。オフライン検証で安定性・多様性・
  勢いの起伏・家系交代を確認済み
- **段階3 = 見送り(将来課題)**: B案「レジームの風」。検証で「収束追従は5種GAでは
  タイムスケール的に不可能・合成気質は散らせない」と判明(下記4章)。
  やるならスポットライト方式+単一遺伝子 regimePref(v3・保存リセット)。要方針再確認
- 設計の意思決定はワークフロー(多観点提案→批判→統合)で実施。詳細は下記「設計の核心」

### 設計の核心(なぜ段階2/3が要るか)

**24h 時計を選択圧にしているが、鑑賞スケール(数分)では時計がほぼ静止する。**
デモは 1 世代で時計が約 1.87h 進むので適応の追走が見えるが、実機は約 0.05h しか進まず、
GA は数世代で「今の時刻型」に収束し以後は churn(同質な入れ替え)に見える。
→ **時間帯の色の移ろいは「アンビエンス」として残しつつ、進化を感じさせるための
別の選択圧(A: 系譜 / B: 分単位で動く気候)を足す**のが今回の設計方針。
(あめさん本人の問題提起。実機相当シミュレーションで裏付け済み)

## 3. 直近の変更

- 2026-06-20 (Step 2-3: 高密度化 + 色の波 + 常時 ON 化でオプション撤去): 本セッション
  - **案 1 (高密度化)**: `LivelyProperties.json` particleCount max を 7000 → **15000** へ。
    既定 5500 / isSmallScreen 既定 4000 は据え置き。`js/lively.js` のクランプにも 15000 上限を追加。
    `js/webui.js` のスライダー max を 15000 に同期。render-gl.js の MAX=30000 までバッファ確保済みなので
    シェーダー側は無改修で増やせる。あめさん FB「画面サイズが大きいと粒子密度が薄まってスカスカに見える」
    を受けて、大画面で密度を稼げるように上限を拡張
  - **案 3 (色の波: 密集度ベースの位相速度ブースト)**: `js/species.js` の位相同期に
    `dphase = this.omega * (1 + (p._density || 0) * 0.6)` を追加。p._density は近傍同種数 / 8 で 0..1。
    密集している局所ほど omega が 1..1.6 倍にブースト → 場所ごとに違うペースの位相 → 画面全体で同期しない。
    密集度キャッシュは parity 半数更新の合間も保持(初回 undefined は 0 として扱う)。
    `js/main.js` と `js/render-gl.js` の hue 振幅も ±8° → **±15°** に拡大して色の波として認識可能に。
    あめさん要望「画面全体で同期しないこと。種族内でぴったり同期するのではなく接近度や密集度によって変化する」
    を反映
  - **案 2 (DoF) は見送り**: 加算合成 (`blendFunc(ONE, ONE)`) では halfW を太くすると同じ場所に重なる
    回数が増えてしまい、結果として「広く薄い光が背景に広がる」状態になる(DoF とは逆方向)。
    軽量フェイクではなく半解像度 blur 系で再実装が必要。本セッションでロールバック(コミット履歴に残るが
    現在のコードには無い)。4 章に「将来再検討」として記録
  - **にじみ + 色の波を常時 ON 化 + オプション撤去**: あめさん判断「最終的に固定でオプション無しに」を
    実装。`Settings.bloomStrength` は 0.5 のまま残し常時 ON(WebGL2 拡張未対応環境では描画側で bypass)。
    `Settings.phaseWaveEnabled` は削除して常時 ON のロジックに。LP / webui の対応エントリと
    case 'bloomStrength' / case 'phaseWaveEnabled' / `App.isBloomReady()` / `readyCheck/unavailableMsg`
    汎用ロジックも dead code として削除。**internal デバッグ用の `?bloom=0` キルスイッチと
    `?bloomDebug=1` 可視化は残置**(Flags.killBloom / Flags.bloomDebug)。既存ユーザーの旧
    localStorage(bloomStrength / phaseWaveEnabled)は switch の default で no-op としてスキップ、
    クラッシュなし
  - **設定パネル(Web/Lively 共通)の最終構成**: 粒子の量 / カメラの距離 / 世代交代の間隔 / 明るさ /
    軌跡の長さ / 省電力モード / システム表示 / 突然変異 / カメラ・設定をリセット / 進化をリセット。
    Lively 側はこれに加えて下端の余白
  - **進化・物理(genome / evolution / field)は無改修**。`art-evolution-v2` 据え置き

- 2026-06-20 (ブルーム既定値を ON に変更 / 二段階デプロイ第 2 段階): 本セッション
  - **対応**: 二段階デプロイの第 2 段階。ON/OFF 化(コミット 1ee4892)で実機の体感を確認した上で、
    既定値を OFF → ON に動かす。`js/lively.js` Settings.bloomStrength: 0 → 0.5、
    `LivelyProperties.json` value: false → true の 2 ファイルを同期更新。
    `js/webui.js` の Defaults は `Settings.bloomStrength > 0.001` の式で評価しているので
    Settings 初期値の変更で自動連動(触らない)
  - **既存ユーザー(art-web-settings-v1 に false 保存済み)**: loadSaved で上書きされるので影響なし
  - **新規ユーザー / Lively で初めて壁紙追加した人 / localStorage クリア後の人**: ON で起動
  - **次の選択肢**: あめさん本人の意向で「オプション撤去 + 50% 固定」も検討対象(4 章参照)

- 2026-06-20 (ブルームを ON/OFF 二値化): 本セッション(コミット 1ee4892)
  - **きっかけ**: あめさんが Step 2-2 完成直後の実機 FB で「100% を超えると、にじみ同士が重なった時に
    ちらちらする。50 くらいが上限」と確認。100% 超のスライダー値で粒子クラスタが密集した瞬間に
    加算合成で輝度が容易に飽和してフリッカに見える現象(設計時の risk リスト「密集白飛びの拡大」の派生)。
    100% 超のレンジを排除して安全側に固定する判断
  - **対応**: スライダー(0..150)を **ON/OFF のチェックボックス** に変更。ON で内部値 0.5
    (=従来の 50% スライダー相当)を流し込み、OFF で 0。あめさんが「最終的に 50 固定でオプション無し」
    を検討するための中間段階として、まず ON/OFF で実機の感触を試す → 既定値を OFF → ON に動かす
    二段階デプロイ → オプション撤去まで段階導入する方針
  - `js/webui.js`: CONTROLS の bloomStrength を type 'slider' から 'checkbox' に。get() は
    `Settings.bloomStrength > 0.001` で boolean を返す。Defaults snapshot も boolean に変更。
    配置は「軌跡の長さ」(slider 群の末尾)と「省電力モード」(checkbox 群の先頭)の間で視覚効果系の
    checkbox を集約。bloomReady=false 時の disabled 処理(input.disabled + opacity 0.5 + tooltip)を
    slider 構築側から checkbox 構築側に移動
  - `js/lively.js`: case 'bloomStrength' を boolean / number 両対応に。
    `typeof val === 'boolean'` なら `val ? 0.5 : 0`、それ以外は旧クライアント数値(0..150)互換のため
    `Math.max(0, Math.min(1.5, n/100))` を維持(起動時の 1 回だけ古い値で動き、次の save() で boolean に
    書き換わる)
  - `LivelyProperties.json`: bloomStrength を slider (value=0/min=0/max=150/step=5) から
    **checkbox (value=false)** に変更。**Lively 配布版を更新する人は壁紙の入れ直しが必要**
    (LP 形式の type 変更のため、HANDOFF L702-703 既知)
  - **進化・render-gl.js・main.js は無改修**。`art-evolution-v2` 据え置き

- 2026-06-20 (WebGL2 化 Step 2-2: ブルーム): 本セッション
  - **採用案**: 設計案 4 案(王道分離ガウシアン / dual-Kawase / 軽量 Bright pass / UE 風多段帯域)を
    多観点 workflow で評価し、**「軽量 Bright pass + 半解像度 1 段の 9-tap 分離ガウシアン」(C 発展形)**
    を選定。理由: A/B/D は「一様な呼吸」禁忌・dragBoost=15 との致命的干渉・低スペック iGPU 性能破綻・
    色相位相同期との相乗を同時に抱えるが、C は追加 FBO 2 枚 + シェーダー 2 本でこれらのリスク面が
    構造的に小さい。あめさんの抑制美学(novaGlow 廃止・控えめな日本語)とも整合
  - **シェーダー構造**(`js/render-gl.js`): `BLOOM_BRIGHTBLURH_FRAG_SRC` が明部抽出と横 9-tap ガウシアン
    を 1 パスに統合(コスト節約)、`BLOOM_BLURV_FRAG_SRC` が縦 9-tap ガウシアン。重みは σ=2.0px の
    正規化値 `[0.20236, 0.17996, 0.12393, 0.06598, 0.02703]`(両側合計 ≒ 1.0)。
    `BLIT_FRAG_SRC` を拡張し `u_bloom` + `u_intensity` を追加して、blit 1 パスで HDR + bloom 加算統合
  - **明部抽出の式**: 輝度判定は Rec.709 luminance `dot(c, vec3(0.2126, 0.7152, 0.0722))`
    (`max(r,g,b)` は色相位相同期 ±8° で閾値直上を越境するため不採用)。閾値 `u_threshold = 1.0`
    (HDR の物理的飽和ライン)、`u_softKnee = 0.3`、Unity URP 互換の soft-knee 式
    `max(soft, (br - threshold) / max(br, 1e-5))`。先頭で `max(c, 0)` のサニタイズを入れて
    数値誤差由来の負値混入による黒い穴を防ぐ。`precision highp float` 明示(mediump だと
    smoothstep のバンドや Mali/Adreno での fp16 飽和が出る)
  - **dragBoost との分離**: `effectiveStrength = Settings.bloomStrength / Math.max(1, env.dragBoost)`
    を JS 側で計算してから `u_intensity` に渡す。オービット中(dragBoost=15)はブルーム実効強度が
    自動的に 1/15 に減衰し、操作トリガーの「画面全体が一斉に光る」一様呼吸禁忌に踏み込まない。
    閾値を上げるより強度側で割る方が静止時の見た目を変えずに済む
  - **既定値 0% で opt-in**: `Settings.bloomStrength` 初期値 0(完全 OFF)。
    LP value 0、webui Defaults 0、min 0 / max 150 / step 5。既存ユーザーの見た目を勝手に変えない安全側
    かつ、低スペック iGPU でも性能影響ゼロから始まる。あめさん視認確定後の二段階デプロイで
    既定値を 40-60 に動かす予定
  - **拡張サポートチェック**: 当初は `OES_texture_half_float_linear` の明示取得を必須条件にしていたが、
    あめさん実機で「光のにじみスライダーが disabled」と出たため緩和。
    Chrome/Firefox の WebGL2 では明示取得できなくても RGBA16F の LINEAR filter は動く実装がほとんどで、
    取得失敗で UI を切る方が実害が大きいと判断。現在は `EXT_color_buffer_half_float`(HDR 用)+
    ブルームシェーダー 2 本の linkProgram 成功 を bloomReady=true の条件にしている。
    OES は試すが結果はログ出力のみ(`(LINEAR filter explicitly granted)` / `(LINEAR filter relying on
    WebGL2 default; ...)`)
  - **半解像度 FBO 2 枚**: `_createBloomFBOs(physW, physH)` で `max(1, physW>>1) × max(1, physH>>1)`
    を RGBA16F / LINEAR / CLAMP_TO_EDGE で 2 枚確保(ping-pong 用)。前回サイズ一致なら再作成スキップ。
    failure 時(checkFramebufferStatus が COMPLETE でない)は `bloomReady = false` に倒して bypass。
    メモリコストは 1080p で +8MB、4K で +32MB
  - **draw() パス順序**: パーティクル描画後 / blit 前に `_renderBloom()` を挿入。
    (a) HDR FBO → fboBloomA に明部抽出 + 横 9-tap ガウシアン(`disable(BLEND)`)、
    (b) fboBloomA → fboBloomB に縦 9-tap ガウシアン(`disable(BLEND)`)、
    (c) `bindFramebuffer(null)` で screen 復帰、
    (d) **blit シェーダーを拡張**して `outColor = hdr + bloom * u_intensity` で 1 パス統合(`disable(BLEND)`)、
    (e) 出口で `enable(BLEND); blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA); activeTexture(TEXTURE0);`
    を明示復帰して state leak を断ち切る
  - **ブルーム無効時の blit パス**: bloomReady=false / effectiveStrength=0 のときは u_bloom にも
    fboTex(HDR)を再バインドし u_intensity=0 で渡す。数学的に `hdr + hdr*0 = hdr` で従来の素貼りと同等。
    分岐は GL 状態だけで吸収するので blit シェーダーは 1 つで済む
  - **設定 UI 接続**: `js/lively.js` Settings に `bloomStrength: 0` + listener case 追加
    (0..150 → 0..1.5 にマッピング)。`LivelyProperties.json` にスライダー追加(value 0)。
    `js/webui.js` STR(ja: 「光のにじみ」/ en: 'Bloom')+ Defaults + CONTROLS に追加。
    CONTROLS の位置は「明るさ」と「軌跡の長さ」の間(数値的に近い系統に配置)。
    `App.isBloomReady()` で bloomReady=false 時は input.disabled + opacity 0.5 + 
    `STR.bloomUnavailable` ツールチップ表示
  - **キルスイッチ**: `js/lively.js` の Flags に `killBloom: /[?&]bloom=0/` と
    `bloomDebug: /[?&]bloomDebug=1/` を追加。`js/main.js` で glRenderer 取得直後に反映。
    `?bloom=0` は webui.js の disabled 判定にも連動するので、UI 上も「使えない」ことが分かる
  - **動作確認**: あめさん実機で「光のにじみスライダーが操作可能」と OS 視認確定後にコミット。
    F12 コンソールに `[render-gl] WebGL2 path active` + `HDR FBO ... mode enabled` + 
    `bloom ... ready ...` の 3 行が出るか確認
  - **新遺伝子なし**: 進化データ(genome / evolution / species / field)は無改修。
    `art-evolution-v2` 据え置き = リセット不要

- 2026-06-18 (オービット操作の追加): 本セッション
  - **マウス/タッチのクリック&ドラッグで中心点まわりに視点を回せるようになった**(あめさん要望)。
    自動カメラ動き(cameraMotion)を撤去した方針はそのまま、ユーザー主導の操作だけ追加。
    実装場所は `js/main.js` のみ(env.cam.az / env.cam.el を直接書き換える。両 renderer は毎フレーム読むので apply 不要)。
  - **挙動**: 横ドラッグで方位、縦ドラッグで仰角。感度 0.005 rad/CSS px。仰角は ±1.4 rad で頭打ち(逆さ反転防止)。
    ダブルクリックで初期角度(az:0.6, el:0.34)へ復帰。回転方向は OrbitControls 慣習(ドラッグ右 = カメラが右にオービット、
    シーンが左に回って見える)。
  - **カーソルは既定のまま変えない**(あめさん明示要望)。grab/grabbing への切替はしない。
    多くのオービット UI はカーソルを切替るので「実装し忘れた?」と次の Claude が直したくなるかもしれないが、
    意図的な選択。
  - **ドラッグ中だけ paintFull() を毎フレーム掛ける**(`frame()` の draw 直前に `if (camDrag) paintFull()`)。
    背景フェードが 0.018〜0.13 程度しか効かないので残像が 8〜30 フレーム残り、カメラを動かすと過去角度の粒子と
    現在角度の粒子が重なって「カクついた・FPS が低い」絵に見えてしまうのを防ぐ(あめさん FB 「もっと滑らかに」の真因)。
    指を離せば camDrag が null になり、paintFull は呼ばれなくなって自然な軌跡余韻が戻る。
    GL / 2D どちらの経路でも paintFull は既に resize/resetEvolution で使われている安全な primitive。
  - **ドラッグ中だけ粒子の輝度を 15 倍に底上げ**(`env.dragBoost`、両 renderer の baseRaw に乗算)。
    paintFull で残像(=累積で見せていた明るさ)が消える結果、1 フレームぶんの粒子だけでは画面が暗くなる
    (あめさん FB「ドラッグしようとした瞬間、かなり暗くなって見えません」の真因)。
    通常運用の「光の渦」は過去 8〜30 フレームの粒子が累積した結果なので、1 フレームでそれに近い明るさを
    再現するには大きな α 倍率が必要。倍率は実機目視で 3→8→15 と段階確認し、15 倍で「ちょうど良い」と確定
    (あめさん)。`CAM_DRAG_BOOST` 定数 1 箇所、`env.dragBoost` を pointerdown で 15 / clearCamDrag で 1 に
    切替、両 renderer の baseRaw 計算で `* dragBoost` 乗算。離せば 1 に戻り通常運用の明るさ。
    「面積路線」(線幅・長さを増やす)も明るさを稼ぐ別軸として検討したが、定数 1 つで効く α 倍率で
    あめさん視認 OK が出たので採用見送り(将来「白飛びが気になる」なら面積路線へ切替候補・5 章参照)。
  - **保存しない**: localStorage に書かない(`art-web-settings-v1` も触らない)。リロード/Lively で初期角度に戻る。
    案 A としてあめさんに合意済みの仕様。
  - **設定 UI には項目を出さない**(マウス操作だけが入口)。LP / lively.js / webui.js / index.html は無改修。
  - **オーバーレイ除外**: HUD / #debug / 歯車アイコン / 設定パネルの bounding rect 内でドラッグ開始しない
    (`CAM_DRAG_BLOCKERS` 配列で id 列挙)。HUD と #debug は `pointer-events:none` なので canvas に
    pointerdown が素通りしてくる前提で、明示的に除外している。歯車・パネルは pointer-events:auto の時は
    そもそも canvas にイベントが来ないが、歯車が隠れている瞬間や閉じたパネル領域でも「設定の場所」を予約する。
  - **スタック対策**: setPointerCapture を使うが、効かない環境(古い WebView2 等)用に
    window の pointerup/pointercancel/blur + document.visibilitychange + canvas.lostpointercapture を
    全部保険として張る。さらに pointermove 内で `(e.buttons & 1) === 0`(マウスで主ボタン離している)を検出して
    迷子ドラッグを回収。Alt-Tab + ボタン離す + 戻ってきた時の「カーソルが grabbing のまま」を防ぐ。
  - **タッチ周辺**: `touch-action: pinch-zoom`(単指ドラッグはオービットに使う・二本指ピンチは HUD 文字 11px 拡大用に残す)、
    `user-select: none` + `-webkit-touch-callout: none`(モバイルの長押しコールアウト抑止)。
    button 判定は `pointerType==='mouse' && button!==0` でガード(スタイラス側ボタンや touch を誤って弾かない)。
  - **検証**: 多観点ワークフロー(correctness / UX / integration / mobile / visual-quality の 5 観点 → 各 finding を
    敵対的に refute、48 agent 投入)で 13 件の確定問題を発見・修正済み。スタック系・モバイル系・dead code を
    一括対応。残課題は「dblclick 誤爆で構図が消える」(案 A 合意通り保存しない方針なので、実機で気になれば
    後追いで undo or 永続化を相談)。
  - **進化・両 renderer・webui・保存スキーマ**は無改修。`art-evolution-v2` / `art-web-settings-v1` 据え置き。

- 2026-06-18 (オプション・計器表示の整理): 前段、コミット ad995e2
  - **設定パネルを歯車アイコン経由の開閉に変更**(右上の SVG 歯車 → クリックで直下にパネル展開・隙間 0)。
    閉じ方は (a) パネル右上の × ボタン (b) アイコン再クリック (c) pointerleave 後 2.6s で auto-close。
    タッチ端末(`(hover: none)`)では auto-close を構造的に無効化し、明示操作のみで閉じる。
    ハイブリッド端末(iPad + マウス / Surface)向けに MediaQueryList の change を購読して touchOnly を動的追従。
    open 直後の auto-close タイマーは起動しない(クリックで開けて触らず放置の罠を回避。pointer がパネル内に
    入って → 出た時にだけ schedulePanelClose 起動)。アイコンとパネル位置は top:14px / top:46px で隙間ゼロ
    にして、隙間越えで race することがそもそも無くなる構造に
  - **ブラウザ既定言語による英語/日本語切替**: `(navigator.language||...).toLowerCase().startsWith('ja')` が真で
    日本語、それ以外で英語。STR テーブルで設定パネル内のラベル・aria-label・確認ダイアログ(Reset evolution
    from generation 1. Are you sure?)を一括切替。OBSERVATORIUM の列名や入口ページは別系統で触らない
  - **英訳ラベルの幅対策**: 'Camera distance (100 = default)' → 'Camera distance' / 'System display (gen / species)'
    → 'System display' に短縮。CSS `.lab` に `flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis;` と `.val` に `flex:none` を追加して、想定外のラベル長でも 1 行省略表示で破綻しない保険
  - **カメラの動きオプション(cameraMotion)を完全撤去**: LP / lively.js Settings / listener case / main.js
    updateCamera 関数と呼び出し / render-gl.js / デバッグ表記 を一斉削除。env.cam は初期値(az:0.6, el:0.34)
    で固定。これまでの既定 OFF 挙動と同じなので実機の見た目は変わらない(HANDOFF 5 章「カメラの動き ON 時の
    錯視」問題は項目自体が消滅して解消)
  - **色の同期(colorSync)を ON 固定化して設定から削除**: 実機で違いが分からないというあめさん判断に基づく整理。
    LP / lively.js / webui.js / main.js / render-gl.js / species.js から settings 経由の参照を全削除し、
    内部的には `K = 1.5` と `hue += Math.sin(p.phase) * 8` を常時実行。rebuildGrid の早期 return も削除して
    近傍グリッドを常時構築(=位相同期は常時動作)
  - **計器の事象ログ(誕生 ↑ / 退場 ↓ / 突然変異 ✦ / 参入 +)を撤去**: index.html の `#hud .log` / `.ev` 関連
    CSS と DOM 要素を削除、evolution.js から `eventLog` / `pushEvent` を完全削除、main.js から `hudLogEl` と
    描画ロジックを削除。これで計器はメタ行 + 列見出し + 種族行 6 行のシンプル構成に
  - **計器メタ行を flex 分割 + v2.0.0 表記**: 左に `A NIGHT OF LIFE v2.0.0` / 右に `gen X · HH:MM (· demo)`。
    `.meta` を `display:flex; justify-content:space-between; gap:9px; padding-right:38px` に設定し、右端を
    種族行の state 列(`min-width:38px`)の左端と縦に揃える(右側の末尾が `·` / `in` / `↓out` と並ぶ)。
    v2.0.0 だけ `rgba(255,255,255,0.32)` で控えめに(タイトルは現状の 0.55 を維持し、視線が「タイトル → 数値の
    観察」に流れるように)
  - **二段階の敵対的レビュー**: 1 次(4 観点 = correctness / integration / UX / i18n)で 6 件確定、
    2 次(3 観点 = state-transitions / touch-device / teardown-and-i18n)で 3 件確定。
    高 severity の代表例: アイコン到達不能(panel z-index で覆われて click 届かず)、英訳ラベル幅オーバー、
    ハイブリッド端末で touchOnly が stale。すべて修正済み
  - **進化(genome/evolution/species/field)・WebGL2 経路は無改修**(species.js 内の位相同期 K のリテラル化のみ)。
    新遺伝子なし = 保存リセット不要(`art-evolution-v2` 据え置き)。web 設定の旧 localStorage キー
    `art-web-settings-v1` に cameraMotion / colorSync が残っていても listener case を落とせば switch で
    no-op として無視されるのでクラッシュなし

- 2026-06-17 (Step 2-1 後の調整 - 前セッション、コミット 70eb08c / ba0ec02):
  - **カメラ距離スライダー追加**(70-200%、step 5、既定 100): `LivelyProperties.json` / `js/lively.js` / `js/webui.js` /
    `js/main.js` を同期。resize() で `env.baseCamDist = base * 0.72` を保存し、毎回 `env.camDist = baseCamDist * Settings.cameraZoom`
    を反映。`App.applyCameraZoom()` でスライダー変更時に即座に新距離を計算(物理は触らない)。
    リサイズで粒子が中央集中する現象(FB-5)から派生したアイデア(あめさん発案)で、「全体俯瞰(200%)」と「没入寄り(70%)」を試せる遊び場。
  - **粒子の退場をウィンクアウト化**(あめさん「ぴたっと止まって消えるのが不自然 → 動きながら点々と消えたい」):
    1. `js/species.js` の 'out' 状態の特殊化(targetAct=0.1, followRate=0.08)を撤廃。退場中も時刻適合度ベースで動きを維持
       → 流れに乗ったまま消えていく。
    2. 粒子に `exitOffset: Math.random()` を追加(0..1、寿命中 immutable)。粒子ごとに消えるタイミングをずらす個別の番号。
    3. `js/main.js` / `js/render-gl.js` 両 renderer の α 計算を `baseRaw * pEnv` に分離。状態別の pEnv:
       - `'in'`: `pEnv = sp.opacity`(従来通り種族 opacity 一律で fade-in)
       - `'alive'`: `pEnv = 1`
       - `'out'`: `pEnv = clamp(1 - (fadeProgress - exitOffset * 0.7) / 0.3, 0, 1)` で per-particle ウィンクアウト
    係数 0.7/0.3 の意味は 5 章 (既知の落とし穴) を参照。
    新フィールド `exitOffset` は粒子寿命中 immutable で localStorage 非保存(粒子位置は元から保存していない)。
    保存スキーマ(genome/gen/parentGens/age)に変更なし=リセット不要。

- 2026-06-17 (WebGL2 化 Step 2-1): 本セッション
  - **新規 `js/render-gl.js`**: WebGL2 等価描画。シェーダーはインライン文字列・依存ゼロ・file:// 維持。
    インスタンシング(TRIANGLE_STRIP × 4 頂点クワッド)で前後対称の針を描画。投影式・色式・大気遠近・
    背景フェード・加算合成は 2D 版と同式。dn は粒子中心の vz で算出(vz は (x,y,z) のアフィン線形関数なので
    endpoint 中点と数学的に厳密に同値)。
  - **`?gl=0` で opt-out**: main.js は既定で WebGL2 取得を試み、成功時は glRenderer 経路。`?gl=0` 指定時または取得失敗時は
    従来 Canvas 2D 経路に自動フォールバック(paintFull/draw/sweepResidue/resize に glRenderer 早期 return を追加)。
    `index.html` で render-gl.js を main.js より前に load。**コミット b9bf48e で本番化(?gl=1 → ?gl=0)を反転**。
  - **HDR FBO (RGBA16F) 標準採用**: 描画は内部 16-bit float の FBO へ → 最終 blit パスで 1 度だけ 8-bit 量子化。
    背景フェードの 8-bit 累積丸めによる残光固着を回避し、軌跡が指数減衰しきって背景に戻る。
    `EXT_color_buffer_half_float` 未対応時は 8-bit 直描画(2D と同じ残光問題が残る)へ自動フォールバック、
    更に FRAMEBUFFER_COMPLETE チェックも失敗時は 8-bit に落ちる。
  - **HDR モード専用の fadeA 緩和**: `0.018 + 0.08 × (1 - trailLength)²`(8-bit パスは 2D 同係数 `0.03/0.1` を維持)。
    HDR で指数減衰が完遂すると軌跡が味気なくなったため、係数を下げて余韻を残す。
    あめさん目視で「もう少し短く」「もう少し長く」を 2 度繰り返した結果の値。微調整したい時はここ。
  - **距離ベース AA**: 頂点シェーダーで `v_perpNorm`(-1..+1)/`v_halfW` を varying として渡し、フラグメントで
    `1 - smoothstep(halfW-1, halfW, dist)` を α に掛ける。HDR FBO に MSAA が効かない問題の補償。
  - **線幅最小値 0.4 → 1.0**(2D / GL 両方): 1px 未満は AA が構造的に効かずジャギーが出るため、細線表現を
    犠牲にして輪郭の滑らかさを優先(あめさん視認で確定)。
  - **粒子量範囲を 4000-7000 / 既定 5500**(`LivelyProperties.json` / `js/lively.js` / `js/webui.js` 同期):
    あめさん「5000-5500 が適正、4000-7000 幅で検証できる方が良い」判断。3D 化以降の密度方針と整合。
    モバイル既定も 4000 に引き上げ(スライダー範囲との整合)。
  - **入口ページの作品リンクを explicit パス化**: 親 `index.html` の `href="night-of-life/"` →
    `href="night-of-life/index.html"`。file:// でフォルダ参照すると Chrome がディレクトリ一覧を出す問題の対策。
    HTTP / GitHub Pages では同じ動き。
  - **検証は多観点ワークフロー**: 4 観点(correctness / shader / GL API / integration)並列レビュー → 各 finding を
    2 体の独立検証者で敵対的に refute → 真の問題のみ修正というハーネスで品質保証。10 finding 中、実害ありは 2 件のみ
    (bg VAO バインドの明示化、dn 近似の説明訂正)。
  - **進化(genome/evolution/species/field)・OBSERVATORIUM・lively/webui 設定**はすべて無改修。
    新遺伝子なし=保存リセット不要(`art-evolution-v2` 据え置き)。

- 2026-06-17 (3D 空間化 Step1): 前セッション(大規模ブラッシュアップ・コミット 58efd21)
  - **きっかけ**: あめさん「現状は気に入っているが"スクリーンセーバー"に見える。アート作品として
    奥行きのある3次元空間へ」。多観点ワークフローで案A(Canvas擬似3D)/B(WebGL)/C(GPU)を設計・批判検証し、
    **段階導入**(まず Canvas で方向性を握る Step1 → 手応えが本物なら WebGL の Step2)に合意。鑑賞作品主体。
  - **field.js**: 2Dフローフィールドを **3Dトーラス渦**へ全面刷新。flowAt(x,y,z,out) が
    周回(toroidal=軸×p)+断面循環(poloidal)+揺らぎ(3Dノイズ curl)の合成を返す。配合(tor/pol/cur)・
    渦軸・渦中心は超低周波(mixT)で移ろう。砂時計状の立体化(flare/waist)で中心リング集中の白飛びを根治。
    渦イベント強度 this.vortex(2波合成・数分に一度・?eventで常時化)を公開。out[3..5] に最寄り渦輪上の点(通り抜けの中心狙い用)。
  - **species.js**: 粒子を3D化({x,y,z,vx,vy,vz(単位方向),phase,...})。flowAt 方向へ turn(agility由来)で旋回し
    単位速度を保つ。球(worldR)外は球内一様へ再投入(中心放出をやめ、一方向の単調さを解消)。3D SpatialGrid で
    近傍同種の位相同期 → 色相のゆらぎ(colorSync)。**渦の通り抜けイベント**: 渦が高まった時だけ低従順種族
    (flowObedience小)が最寄りの渦輪へ目標をブレンド(AIM_*)、前方ゲート+近接フェードで「手前で合流→中心近くを通過」。
    普段は穏やかな貫通(PIERCE_GAIN)+ イベント上乗せ(PIERCE_EVENT)。
  - **main.js**: 描画を3D化。カメラ固定俯瞰(camDist/focal/az/el)+透視投影。針は速度方向の前後対称線分(両端を個別投影)。
    z(カメラ距離 dn)で長さ・太さ・明るさ・彩度を一様スケール+奥ほど藍へ霞む大気遠近(新しい色は足さない)。
    加算合成は順序非依存なのでソートしない。背景フェード残像 + sweepResidue は2D画面にそのまま有効。env._tmp は長さ6。
  - **lively.js / webui.js / LivelyProperties.json**: colorSync・cameraMotion(既定OFF=固定)の比較トグル追加。
    粒子既定 1800→**4500**(3Dは密度が要る)、最大6000。Flags.event(?event)追加。
  - **進化(genome/evolution)は無改修**: GAの数値計算・選択圧・保存(art-evolution-v2)はそのまま。死蔵だった
    flowObedience 遺伝子を通り抜けに活用。**新遺伝子なし=保存リセット不要**。
  - あめさんの反復フィードバックで調整(1パラメータずつ目視確認): 一方向→循環、密集4500、俯瞰へ引く、細かい渦、
    速度up、立体化の開き具合、通り抜けは「渦中心を目がけるイベント」に(AIM は collapse=白飛びと紙一重で弱め確定=A案)。

- 2026-06-14 (色の遺伝の改善): 前セッション
  - **色相の交叉を常に中間ブレンドに**(genome.js crossover)。従来は全遺伝子 40/40/20 で
    色相も 8 割が親そのまま → 水色×桃色が「どちらかの色」になっていた(あめさんの実機観察)。
    色相 hueOffset だけ毎回 `a*(1-t)+b*t` で混ぜる。彩度・明度は混ぜず種族差を残す(混色が濁らない)
  - leapHue(突然変異の飛び色)は不変。遺伝子構成も不変 = 進化データの保存リセット不要
  - 設計判断はワークフロー + headless シミュレーション(node で GA 再現)で検証: 混色率 約20%→約92%、
    色のばらつきは約22%締まるが 3000 世代まで安定(崩壊なし)、むしろ色グループ数は増える(青↔桃の間を紫が埋める)
- 2026-06-14 (入口ページ刷新): 本セッション
  - リード文を新コンセプトへ日英で差し替え(index.html)。英訳は 3 案生成 → 判定で「平明で洗練」を採用
  - 作品カードに **Partner クレジット**(Claude Fable 5, Opus 4.8)をクレジット風フッターで追加(案B・金は足さない)
  - meta 説明・CONCEPT.md のキャンペーン趣旨文も新リード方針に同期
  - 作品 / README(日英)/ CONCEPT のコンセプト文を「15 種類の遺伝子を持つ光が…世代を重ね変化する」に統一、英文を自然な表現へ
- 2026-06-13 (Web 公開フェーズ): 本セッション
  - 構成: `git mv` で生命の夜一式を `night-of-life/` へ。ART 直下に入口 index.html を新設
  - js/webui.js 新規(Web 設定 UI)。index.html に webui.js 読み込み・OGP/favicon・
    スマホ用メディアクエリ(観測パネル縮小)を追加
  - lively.js: diagMode 削除 + 小画面の粒子初期値を 500 に。LivelyProperties.json: diagMode 削除
  - main.js: メタ行の漢字時間帯(dayPhaseWord)削除・関数も除去 / diagMode 参照を ?debug に統一 /
    「大変異」コメントを「大きな突然変異」へ
  - genome/species/evolution: コメントの「大変異」→「大きな突然変異」、ユーザー向けは「突然変異」
  - README: Web 公開 URL・実時間のみ・Web 設定パネル・突然変異・診断削除を反映
- 2026-06-13 (実機 FB 反映): あめさんが Lively 実機で確認して気付いた点
  - **突然変異の発光演出を全廃**: 強い発光で肝心の「新しい色」が飛んでインパクトが
    薄れていた。novaGlow と点火フェード(isNovaBirth)を削除し、変異は「親と違う冴えた色」
    そのもので見せる。species の nova は計器の ✦ 表示用タイマーだけ残す
  - 計器の state 表示を `✦nova` → `✦`(マークのみ。NOVA の文字を削除)
  - 大きな突然変異の確率を 5% → **15%** に引き上げ(genome.js mutate)
  - 入口ページのタイトルを **「AI for ART」** に。リード/作品説明を芸術作品の枠組みに改め、
    生命の夜のコンセプト文(日英併記)を金の罫で掲載。README 冒頭も同コンセプトに改稿
  - 入口ページを再設計: 作品カード + ステートメント + 「作品を見る →」を1つのまとまりに統合
    (バラバラに見える指摘の対処)。入口の挨拶は AI for ART の趣旨を一文で日英併記
    (当時のリード文。※2026-06-14 に新コンセプト文へ刷新済み — 3 章参照)。
    入口ページからは壁紙の記載を削除(将来、販売/配布ページが整えば作品ページ下部に購入リンク)
  - FB 投稿(AI for ART キャンペーンの趣旨)を受領し、ART 直下に [CONCEPT.md](../CONCEPT.md) を作成
- 2026-06-13 (公開): **ART を public 化し GitHub Pages を有効化(main / ルート)**。
  https://hello-amedev.github.io/ART/ と /ART/night-of-life/ がライブで HTTP 200 を確認済み
- 2026-06-13 (公開後の微調整): あめさんの実機フィードバックで連続調整(すべて push 済み)
  - 粒子の量: 全体既定 1200→**1800**、最小 300→**1000**、モバイル既定 500→**1000**(最小と整合)
  - スマホは描画を等倍 **0.72 倍ズームアウト**(論理世界 env.w/h を表示より広く取り s=zoom*dpr で縮小)。
    流れ場の渦が一画面に見えるように(resize() / main.js)
  - スマホの描画解像度上限(devicePixelRatio キャップ)を 1.5→2→**2.5**。iPhone(DPR3)でほぼ等倍。
    デスクトップは負荷を抑え 1.5 のまま(`dprCap = isSmallScreen ? 2.5 : 1.5`)
  - Lively 設定ラベルを Web 版に統一、README を購入者向けに端的にリライト + **README.en.md**(英語版)追加
- 2026-06-13 (生命の夜・段階1): 総合ブラッシュアップ(前セッション、1 コミット)
  - genome.js: `leapHue`(大変異の子の色を親から大きく飛ばす)、`mutate(g, forceBig)`
  - evolution.js: 大変異時に leapHue 適用 / 色ニッチ分化(hueCrowd 0.6・60度)/
    齢の保存・復元 / 事象ログ(eventLog リングバッファ + pushEvent)
  - species.js: nova(燃料)→ novaGlow(sin の swell→fade bloom)/ isNovaBirth で
    大変異誕生だけ fadeIn を速く(点火)/ ageSec を毎フレーム加算
  - main.js: 新星の輝きの描画ブースト(明るさ×1.5・lum+16・幅×1.7)/
    観測パネルを計器台帳へ全面書き換え(dec2・ageText=m:ss・列見出し・事象ログ描画・
    forceNova)/ dayPhaseWord はメタ行に残す
  - index.html: タイトル「生命の夜」/ OBSERVATORIUM の CSS(透明背景・transition 全廃・
    高さ固定予約・列見出し)
  - LivelyProperties.json / lively.js: 「大変異を 1 回起こす」ボタン(forceNova)
  - README.md: タイトル・観測パネル説明・大変異の見どころを更新
  - 観測パネルは試行錯誤あり: 当初ブロック文字の自作バー/グリフ(▃▄▅・███)にしたが
    あめさんに「気持ち悪い」と NG → デバッグ表示と同じ「素の数値の羅列」に戻して確定
- 2026-06-13 (3): HUD 切れの真因判明 → 「下端の余白」スライダー追加
  - 真因: Lively の壁紙はタスクバーの裏まで描画されるため、bottom 基準の
    HUD 下 2 行がタスクバーに隠れていた(診断表示で species/hud rows は正常と確認済み)
  - 対処: CSS 変数 --bottom-offset を導入し、LivelyProperties.json の
    bottomMargin(既定 60px)が livelyPropertyListener 経由で適用される。
    ブラウザで開いた時は通知が来ないので 0(下端ぴったり)のまま
- 2026-06-13 (2): Lively 実機で「HUD の種族行が 3 行しか出ない」報告 → 診断機能を実装
  - 原因は未確定(最有力: Lively のファイルコピーが古い版だった可能性。
    他候補: localStorage の旧データ、環境差)。あめさんの診断結果待ち
  - Lively 設定に「診断表示」checkbox を追加(species 数/hud rows/保存数/
    storage 可否/dpr/画面・canvas サイズ/設定値/エラーログを左下に表示)
  - window.onerror + unhandledrejection でエラー収集(ErrorLog、lively.js)
  - updateHud の行処理を行単位 try-catch に(1 行のエラーで全体が止まらない)
  - HUD 行の並びを「id, チップ, バー, peak, state」に変更(系譜なし初期世代で
    id 列の確保幅が空白になり間延びして見えた問題の対処)
- 2026-06-13 (1): 進化の可視化 + 細線化 + HUD 観測パネル化 + 明滅廃止(あめさんフィードバック)
  - 筆致を「細い光の線」へ(strokeLen 7-22px、線幅 0.55 倍、lineCap butt)。
    丸い線端と短い線分は「点=頭」に見えて生物感が出る、が知見
  - 新種族の粒子は親 2 種族の粒子の現在位置から湧き出す(交叉の可視化)。
    系譜 parentGens を保存・復元し HUD に表示(#42‹38×35)
  - 退場種族は activity が 0.1 へゆっくり落ちる(衰えながら消える演出)
  - HUD を観測パネル化: 種族行 = チップ/世代と系譜/活動バー/ピーク時刻/IN・OUT
  - 24 秒ごとの deep fade(明滅が見える)を廃止し、タイル単位の澱スナップへ:
    8x8 タイルを 4 フレームに 1 枚ずつ、背景との色差が極小のピクセルだけ背景値に
    スナップ(sweepResidue)。明滅ゼロで連続性を保ったまま澱が消える
  - 左下の ?debug 表示は ?debug 指定時のみに(demo では HUD のみ)
- 2026-06-12 (3): 右下に常設システム表示(HUD)を追加(あめさん要望)
  - GEN・時刻・種族カラーチップ(activity が明るさに反映)。1 秒間隔で DOM 更新
  - Lively 設定 showHud でオン/オフ(デフォルト ON)
  - ?debug の左下詳細表示は開発用としてそのまま別物
- 2026-06-12 (2): 「光の筆致」デザインへ全面変更(あめさんフィードバック反映)
  - 描画を「前位置→現位置の線」から「進行方向を向いた前後対称の針」に変更
    (彗星型の頭尾シルエットが生物感の主因だった)
  - 蛇行(waviness 遺伝子)を廃止、strokeLen(筆致の長さ)遺伝子を追加
  - 速度を約半分に、尾を短く(「ゆっくり + 短い尾が絵画的」という好みに合わせた)
  - 群れは「整列」主体に(寄り集まる系の係数を大幅減)
  - 粒子の「転生」を追加(平均 30 秒で別の場所へ。轍の刻み込みと渦中心への滞留対策)
  - 24 秒ごとの deep fade(澱の洗い流し)
  - localStorage キーを v2 に(遺伝子構成変更のため旧データ無効化)
- 2026-06-12 (1): 初回実装一式
  - プレビューでの見た目調整: フローフィールドをカールノイズ 80% + 直接角度 20% の
    ブレンドに(カールのみ=均一でのっぺり、直接のみ=吹き溜まりで白飛び)
  - 進化の多様性対策 3 点セット(下記「落とし穴」参照)
  - リサイズ時の粒子等比再配置、デモモードの保存禁止

## 4. 次回着手するなら

### WebGL2 化 Step 2-2 (ブルーム) + Step 2-3 (高密度化 + 色の波) = 完了(2026-06-20)

Step 2-2 ブルーム本体・常時 ON 化、Step 2-3 高密度化(粒子量 15000)+ 色の波(密集度ベース)を
実装・常時 ON 化・オプション撤去で確定。詳細は 3 章。

将来検討の候補(現在は全て保留・着手は別セッション):

- **被写界深度(DoF)を本格 blur 系で再実装**: 軽量フェイク(halfW 膨らませ + AA 幅拡大)は
  あめさん FB「背景も明るくなって逆方向」で見送り(コミット履歴には残るが現在のコードには無い)。
  加算合成 `blendFunc(ONE, ONE)` では halfW 拡大が必然的に「広く薄い光が背景に広がる」効果になるため、
  正しい DoF はブルームと同様の**半解像度 blur パス**で実装する必要がある。具体的には
  fboDofA / fboDofB の半解像度 RGBA16F を 2 枚追加し、奥(dn 大)の粒子だけ別 FBO に書き出して
  9-tap 分離ガウシアンを掛け、blit 統合で深度ベースに合成する。コストはブルーム並み(+0.5-0.8ms)。
  ただし「奥は元から大気遠近で藍に霞んでいるので DoF を入れる視覚効果が控えめ」という別の問題もあり、
  あめさんの優先度は低い
- **README.md / README.en.md の更新**: WebGL2 / ブルーム常時 ON / 色の波 / 高密度化(15000)の
  現状を反映。README はビューワー向けに最小サーフェスで保ち、深い技術解説は HANDOFF 側に閉じる方針は維持
- **既定値の最終調整**: brightness / trailLength の既定値が現状のままで光のにじみ常時 ON と整合しているか、
  しばらく実機で運用してから判断

### Step 2-1 で出た残課題

- **FB-5: ウィンドウ縮小 → 拡大で粒子が中央集中**: カメラズームスライダー(`cameraZoom` 70-200%)は実装済み(本セッション)。
  これでズーム自体は手元で調整できる。残課題は「resize 時の粒子座標を `oldBase / newBase` 比で再投入する」案 b(現状は数秒で広がる
  transient で許容)。気になるなら resize() で `for sp in evolution.species; for p in sp.particles: p.x *= ratio; p.y *= ratio; p.z *= ratio;` 程度。
- **FB-2: 細線の階段ジャギーは 2D 版でも残る**。GL 側は距離ベース AA で改善済みだが、2D 版は Canvas rasterizer 任せ。
  どうしても気になるようなら**線幅最小値を 1.2〜1.5 へ更に引き上げ**(あめさん判断)。または将来 GL を既定にする時に
  解消する。
- **README.md / README.en.md の更新**: WebGL2 は既定化済み(b9bf48e)。READMEはビューワー向けに最小サーフェスで保ち、深い技術解説は HANDOFF 側に閉じる方針。
  サポート上必要になれば「環境によっては WebGL2 で動く / `?gl=0` で Canvas 2D に強制可能」程度の 1-2 行を追記する。

### 通り抜けイベントの微調整(必要なら)

- species.js 冒頭の `AIM_MAX(0.20)` / `AIM_CORE(0.55)` / `PIERCE_GAIN(0.45)` / `PIERCE_EVENT(0.5)`、
  field.js update の vortex 2 波係数。確認は `?event` で常時イベント化(常時 = 最悪ケースで必ず collapse する点に
  注意、5 章)。

### 「条件が揃うと複雑な模様」= 将来送り

設計検証で、過去に見送った段階3「レジームの風」と同じ罠(調整の当たり幅が極端に狭い・魚群/一様呼吸に倒れる・
headless 不可)+ 場の数式と不整合 が判明。安全に作るには再設計が要る(点火条件を密度/局所性ベース or curl 優勢域に)。
Step 2-2 が落ち着いたら単独着手。要望は捨てない。

### 公開まわりの follow-up

- **共有カードのプレビュー画像**: `night-of-life/preview.png`(実機スクショ推奨)を置き、
  index.html に og:image / twitter:image を足して twitter:card を `summary_large_image` に戻す
- **twitter:creator(X ハンドル)** を `night-of-life/index.html` に追記(あめさん確認後)
- **壁紙の配布**: BOOTH / GitHub Releases の zip。配布物に開発メモ(HANDOFF.md・CONCEPT.md)は
  含めない。販売/配布ページが整ったら入口・作品ページ下部に購入リンクを置く
- **あめさんの Lively 実機の更新**: Lively はファイルをコピーするので、今セッションの変更を
  実機の壁紙に反映するには、Lively で壁紙を削除して `night-of-life/index.html` を入れ直す
  (Web 公開版は push で自動最新)

### 進化デザインの将来課題

段階1 + 段階2A(系譜の夜)は完成・公開済み。以下は将来の発展案。

- **段階3: B案「レジームの風」= 未確定(オフライン検証で設計の壁が判明、方針要再決定)**。
  field に「層流⇄渦」が数分周期で交代するレジームを入れ、種族がそれに適応する案。
  ハーネス検証で分かったこと:
  (1) **タイムスケールのジレンマ(24h問題の鏡像)**: 5種・1世代1体交代のGAは、
      鑑賞で見えるほど速い振動(20世代周期)を追えない(相関ほぼ0)。
      追える遅さ(40〜60世代周期)だと実時間では時計同様に静止して見えない。
  (2) **合成気質は散らせない**: agility/cohesion/flowObedience の合成で affinity を作ると
      平均(~0.5)へ回帰し、sharing を強めても気質レンジ 0.01〜0.03 のまま+色崩壊。
  → 結論: 「集団が収束してレジームを追う」案は破綻。実装するなら
     **スポットライト方式**(常に多様な気質が共存し、いまの流れに合う種が"即座に"輝く=
     activity をレジーム適合で駆動。選択でレジーム軸を強く引かない)+
     **気質は単一遺伝子**(新規 regimePref を追加し v3 へ。合成はNG)で作るのが筋。
     ただし新遺伝子追加=保存リセット。あめさんに方針確認してから着手すること
- 大変異の演出は段階1で実装済み。次は「鑑賞者がそれを物語として読めるか」を A/B で強化
- 実時間で数日運用した時の進化の偏りの観察(段階2/3でこの問題自体に手を入れる)
- 配布するなら: プレビュー画像、BOOTH 向け説明、配布用 README(非技術者向け)。
  タイトルは「生命の夜」、リポジトリ名は ART のまま

## 5. 既知の落とし穴

### WebGL2 化 Step 2-2(ブルーム)の落とし穴

- **`OES_texture_half_float_linear` のチェックは外してある**(実機 FB で disabled が出たため)。
  WebGL2 仕様では本来この拡張で「RGBA16F の LINEAR filter」が保証されるが、Chrome/Firefox の
  WebGL2 では明示 `getExtension` で取れなくても LINEAR が動く実装がほとんど。**取得失敗で
  UI を disabled にすると実害が大きい**(配布版でほぼ全ての Web ユーザーが触れなくなる)ため、
  ブルームシェーダー 2 本の linkProgram 成功だけを `bloomReady=true` の条件にしている。
  LINEAR が NEAREST に黙って落ちる環境ではブルームに格子状ブロックノイズが出るが、それは
  あめさん視認で気づける範囲(`?bloomDebug=1` で fboBloomB を可視化すれば即座に分かる)
- **`effectiveStrength = Settings.bloomStrength / Math.max(1, env.dragBoost)` の dragBoost 分離を外さない**:
  オービット中(dragBoost=15)はパーティクル baseRaw が 15 倍され、ほぼ全粒子が閾値超過してブルームが
  暴発する。HANDOFF L615 禁忌「規則的な明滅 / 一様な呼吸」の典型パターンに踏み込む。
  閾値を上げる対策もあるが、静止時のブルームの見た目が変わってしまうので強度側で割る方が安全
- **輝度判定は Rec.709 luminance 必須**(`max(r,g,b)` は NG): 位相同期(K=1.5・色相±8°)で
  クラスタが特定色相に偏った瞬間、max(r,g,b) なら 1 チャネルだけ閾値を越境して一斉ブルームになる。
  Rec.709 加重平均なら 1 チャネルの変動は 3 で割られて閾値越境が抑制される
- **URP 互換 soft-knee 式の正準形を守る**: `max(soft, (br - threshold) / max(br, 1e-5))` の
  `max(br, 1e-5)` を外すと br=0 で 0 除算、`(br - threshold) / br` を `(br - threshold)` だけにすると
  knee 直下が滑らかに減衰しない(閾値 1.0 ピッタリでカクッと落ちる)
- **シェーダー先頭の `max(c, 0)` サニタイズを外さない**: HDR FBO は半透明合成 / 加算合成の数値誤差で
  ごく稀に微小負値が出る。max なしだと luminance が負になり soft-knee の clamp(0, 1) で 0 に張り付き、
  局所的に「黒い穴」が出る。max(0) のコストは無視できる
- **9-tap 重みの合計は 0.99616 ≒ 1.0** だが厳密には 1 ではない。両側の 0.02703 までしか取らない σ=2.0 の
  正規化値で、視覚的には影響軽微(±0.4% 誤差)。完全 1.0 にしたいなら 11-tap に伸ばす(K_5=0.00922 を
  追加してコスト 2 サンプル増)が、目視差は出ない
- **`precision highp float` を mediump に戻さない**: Mali / Adreno 系の旧 GPU で fp16 飽和して
  ブルーム結果が「縞模様の階段(banding)」になる。highp のコストは半解像度 2 パスのみなので
  全体への影響は小さい
- **blit 出口の `enable(BLEND); blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA); activeTexture(TEXTURE0);`
  を省略しない**: ここで明示的に state を復帰しないと、次フレームの背景フェードや背景塗りが「ブルーム
  パスの disable(BLEND) を引き継いで」上書き挙動になる(背景一色に塗りつぶされる)。
  暗黙のフレーム間依存を断ち切るために、毎フレーム明示復帰を入れている
- **bloomReady=false / effectiveStrength=0 時の u_bloom 再バインド**: blit シェーダーは 1 つで
  `outColor = hdr + bloom * u_intensity` の式を持つので、bloom が要らない時は u_bloom にも fboTex を
  再バインドして u_intensity=0 で渡す(`hdr + hdr * 0 = hdr`)。分岐ロジックは GL 状態だけで吸収し、
  シェーダーは 2 種類に分けない。これを別シェーダー(blit と blitWithBloom)に分けたくなった場合も、
  useProgram の切替えで失うパフォーマンスより、分岐が増えるテスト負荷の方が大きい
- **半解像度 FBO の resize 連打リーク対策**: `_createBloomFBOs` で前回サイズ一致なら return している。
  これを外すと、ウィンドウサイズ変更のたびに 2 枚の FBO + texture が新規確保され、削除も走るが、
  WebGL のリソース管理は ref count なので削除タイミングがブラウザ任せ → メモリリーク
- **blit の二重 texture バインド(`?bloomDebug=1`)**: TEXTURE0 と TEXTURE1 の両方を同じ fboBloomBTex に
  バインドして u_intensity=1 で渡すと `outColor = fboBloomB * 2` になる。デバッグ目的の可視性優先で
  2 倍は許容しているが、本物の状態と差があることに注意。中身を「実値で」見たい場合は別の
  blit シェーダー(hdr のみ表示版)を一時的に作る方が正確
- **強度 100% 超のちらちら → 50% 固定の常時 ON 化(2026-06-20)**: あめさん実機 FB
  「100% を超えると、にじみ同士が重なった時にちらちらする」を受けて、当初のスライダー(0..150)を
  ON/OFF のチェックボックスに変更(ON で内部値 0.5)→ さらに「最終的に固定でオプション無しに」の
  あめさん判断で、`Settings.bloomStrength = 0.5` 固定の常時 ON 化 + UI 完全撤去(2026-06-20)。
  にじみ同士の重なりで加算合成が容易に飽和してフリッカに見える現象は、設計時の risk リスト
  「密集白飛びの拡大」の派生。**ブルーム強度を変えたくなったら触る場所**: `js/lively.js` の
  `Settings.bloomStrength` リテラル(0.5)を変更するだけ。0.5 を上げると再びちらつくリスクが
  上がるので、変更時は実機放置 2-3 分での視認確認が必須
- **常時 ON 化に合わせて削除した dead code**: case 'bloomStrength' / case 'phaseWaveEnabled' /
  `App.isBloomReady()` / webui.js の `readyCheck/unavailableMsg` 汎用ロジック /
  STR.bloomStrength / STR.bloomUnavailable / STR.phaseWaveEnabled。旧 localStorage に値が残っていても
  switch の default で no-op としてスキップされるのでクラッシュなし
- **`?bloom=0` キルスイッチと `?bloomDebug=1` の URL パターン**: 既存の `?gl=0` / `?debug` /
  `?demo` / `?event` の慣習に揃えて `[?&]` プレフィックスで判定。`Flags.killBloom` は main.js が
  glRenderer 取得直後に `glRenderer.bloomReady = false` に倒すので、UI 側も連動して disabled になる
  (App.isBloomReady() が false を返すため)
- **Canvas 2D 経路 (`?gl=0`) との視覚差**: 2D 経路はブルーム未実装(設計時点で意図的に WebGL2 限定機能)。
  webui の disabled で「使えません」のツールチップを出す。Lively の LP スライダーは disabled にできない
  ので、Lively 環境で `?gl=0` 相当のフォールバックが走った場合は値を動かしても効かない見た目になる
  (Lively の LP 経由で動かしても無反応)。将来 README に「環境によって光のにじみが異なります」の
  1 行を加筆検討
- **既存ユーザーの localStorage 互換**: case 'bloomStrength' を削除したので、旧 art-web-settings-v1 に
  bloomStrength=true / false / 60 等が残っていても switch の default で no-op としてスキップされる
  (クラッシュなし)。次回 save 時には bloomStrength キーは webui の Defaults snapshot から消えたので
  JSON にも書き出されない(自然に migrate)

### Step 2-3(高密度化 + 色の波)の落とし穴

- **粒子量 15000 まで上限拡張(2026-06-20)** だが、低スペック iGPU(Intel UHD 620 等)では
  15000 + ブルーム + 色の波で 60fps を割る可能性がある。ユーザーが下げて使える設計なので
  問題ないが、配布時の README に「画面が重い場合は粒子の量を下げてください」程度の案内があるとよい。
  `render-gl.js` の MAX=30000 まではバッファ確保済みなので更に max を上げることは可能
- **色の波の omega 密集度ブースト**(`p._density * 0.6`)を強くしすぎない。1.0 等にすると密集場所で
  位相が 2 倍速で進み、色相が ±15° の振幅で速く点滅して見え、生物感の禁じ手「規則的明滅」に
  踏み込む。0.6 は実機 OK ラインの上限近辺
- **hue 振幅 ±15°** を更に大きくしない。±20° 以上で色相が「青↔水色↔緑」程度に明確に変わり、
  当初のコンセプト「光の渦の色味は時刻で滑らかに変わる」とは別物の演出になる
- **`p._density` キャッシュは parity 半数更新で 2 フレームに 1 回しか書き換わらない**。残り半数の
  粒子は前フレームのキャッシュを使うので、急激な密集度変化は 1 フレーム遅れて反映される。視覚的には無視できる
- **色の波は両 renderer 共通で動く**(species.js の omega ブーストは renderer 非依存、
  main.js / render-gl.js の hue 振幅 15° も両方で同じ)。Canvas 2D fallback でも色のうねりは出る
- **常時 ON 化に伴って削除した dead code(色の波系)**: Settings.phaseWaveEnabled /
  case 'phaseWaveEnabled' / LP の phaseWaveEnabled / webui の STR/Defaults/CONTROLS。
  旧 localStorage に phaseWaveEnabled=true/false が残っていても switch default で no-op

### オービット操作(ドラッグでカメラ回転)の落とし穴

- **`env.cam` を書き換えるだけで両 renderer が次フレームで拾う**。GL / 2D どちらも毎フレーム
  `env.cam.az / env.cam.el` を読み直すので、apply 関数も paintFull も要らない。逆に「適用が要るのでは?」と
  考えて余計な呼び出しを入れると、HDR バッファや軌跡フェードと干渉するので避ける
- **stuck-state 対策は belt-and-suspenders**: setPointerCapture 一つに頼らず、
  canvas の pointerup/cancel/lostpointercapture + window の pointerup/cancel + blur + visibilitychange +
  pointermove 内の `(e.buttons & 1) === 0` まで全部張っている。どれか減らすと「Alt-Tab で離した手の
  pointerup を見失う」「WebView2 で setPointerCapture が no-op」等のニッチで grabbing カーソルが
  詰まる。古い WebView2 / Lively ホストを想定して全部残す
- **HUD / #debug は pointer-events:none なのでドラッグが素通りしてくる**。`CAM_DRAG_BLOCKERS` 配列で
  4 要素(`hud` / `debug` / `nol-webui-icon` / `nol-webui`)の bounding rect を pointerdown で
  明示除外している。HUD を「読むだけ」で済ませる視覚的な約束を守るため。新しいオーバーレイを足す時は
  ここの配列に id を追加する
- **`touch-action: pinch-zoom`(none じゃない)**: 単指オービットはこれで動く・二本指ピンチが
  HUD / パネル文字(11px / 10px)の拡大用に温存される。none に戻すと低視力ユーザーが拡大できなくなる
- **`pointerType === 'mouse' && button !== 0` で右/中ボタンだけ弾く**。タッチやペン(ペン側ボタンで
  `button=1` になり得る)を `button !== 0` で一律弾くとドラッグが起きなくなる
- **カーソルは既定のまま**(grab/grabbing に変えない)。あめさん要望の意図的選択。
  オービット実装に grab カーソルを足すのは一般的なので、整合性を上げようとして触らないこと
- **ドラッグ中の残像消去は `frame()` 内の `if (camDrag) paintFull();`** で実装している。
  これがないと「カメラを動かしているのに動きが読めない(カクつき・低 FPS に見える)」状態になる(あめさん FB)。
  paintFull 自体は 2D は full-opacity の fillRect、GL は HDR FBO をクリア、どちらも軽い操作。
  消すと体感が壊れるので減らさない。draw() の中で fadeAlpha を瞬間的に上げる方法もあるが、
  paintFull の方が GL/2D 両対応で実装が単純なのでこれで確定
- **ドラッグ中の輝度補強は `env.dragBoost = 15`** で粒子 α を底上げしている(pointerdown で 15、clearCamDrag で 1)。
  paintFull で残像が消える結果、1 フレームぶんの粒子だけでは画面が暗くなる(累積で明るく見えていた絵が
  消えるため)。3 倍では「全然暗い」、8 倍でも「まだ暗い」、15 倍で「ちょうど良い」とあめさん目視で確定。
  両 renderer の `baseRaw` に乗算しているので 2D / GL どちらでも同じ強度になる。
  この値は paintFull + 加算合成 + 累積背景フェードのバランスで決まっており、paintFull を外すなら
  この倍率も見直しが要る(残像が残るなら倍率は下げる)
- **倍率を更に上げると白飛び(密集部の色が抜けて白くなる)が出る**: 加算合成(lighter)は色チャネルが
  1.0 を超えるとクリップして白に飛ぶ。15 倍は密集部のごく一部で軽く飛ぶ程度の境目。20 倍以上に上げると
  「光の渦の色味」が崩れる。もし更なる明るさが必要なら、α 倍率ではなく**面積路線**(線幅を太く /
  ストロークを長く)に振った方が色味は保たれる。具体的には別途 `CAM_DRAG_WIDTH` / `CAM_DRAG_LEN` 倍率を
  両 renderer の `lineBase` / `strokeLen` 計算に入れる手がある(現状未採用)
- **dblclick で初期角度に戻す = 誤爆で構図が消える**。案 A の合意で「保存しない・undo なし」を
  選んでいるので、これは仕様。気になる場合は (a) localStorage 永続化 (b) 直前角度に戻す toggle
  のどちらかを足す。新しい設定 UI 項目を増やす方向は基本避ける(設定パネルは現状の項目で十分というあめさん方針)
- **感度は固定 0.005 rad/CSS px**。デスクトップ向けに調整。実機で「速い/遅い」と感じたら
  画面サイズ比でスケール(`sens = 0.005 * (1000 / max(600, min(vw,vh)))` 等)を検討。
  ただし変更時はあめさんに「今までの感度から変わるけど良いか」を確認

### 設定パネル(歯車アイコン化・英語化)の落とし穴

- **アイコンとパネルは縦に隣接(top:14px / top:46px・隙間 0)で配置**。隙間を開けると、デスクトップ
  でも pointer がアイコン → パネルへ移る間に pointerleave が走って auto-close タイマーが回ってしまう。
  ハイブリッド端末(iPad + マウス / Surface)では更に深刻なので隙間ゼロを死守。位置を動かす時もくっつけたまま
- **`touchOnly` は MediaQueryList の change を購読して動的更新**(`let touchOnly`)。
  module load 時に 1 度評価した const にすると、ハイブリッド端末でマウス接続/切断の後に判定が stale に
  なって auto-close が壊れる(2 次レビュー高 severity 指摘)。`mq.addEventListener('change', ...)` /
  Safari 13 以前向けに `mq.addListener` のフォールバックも残す
- **open 直後に schedulePanelClose を呼ばない**: openPanel から auto-close タイマー起動を外し、
  pointer が一度パネルに入って → 出た時にだけ起動する設計に。クリックで開けたのに触らず読みに行く間に
  勝手に閉じる罠を回避。タッチ端末では schedulePanelClose 自体が早期 return で no-op
- **パネル open 中もアイコンは `.show` のまま**(`pointer-events: auto` 維持)。アイコン再クリックで
  toggle close できるようにするため。`scheduleIconHide` は `panelOpen` ガードで no-op、`showIcon` は
  panelOpen 時もアイコンを表示状態のまま保つ(scheduleIconHide だけ呼ばない)
- **英訳ラベルは Consolas 11px Panel 244px 幅に収まる長さで作る**。`Camera distance (100 = default)` は
  幅オーバーで折り返し or 溢れる。CSS `.lab` に `flex:1 1 auto; min-width:0; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis;` + `.val` に `flex:none` の保険を入れているので最悪の場合は
  省略表示で破綻はしないが、保険に頼らない長さに揃える
- **ブラウザ言語の判定は `(navigator.language||navigator.userLanguage||'ja').toLowerCase().startsWith('ja')`**。
  navigator.userLanguage は IE 旧版向けフォールバック(MS 環境で稀に使われる)。`+''` で文字列化してから lowerCase
- **localStorage `art-web-settings-v1` の互換**: 旧 cameraMotion / colorSync が残っていても
  livelyPropertyListener の switch に case が無いので no-op として無視される(クラッシュなし)。
  キーバージョンは v1 据え置きで OK

### 計器(OBSERVATORIUM)のメタ行と削除済みオプションの落とし穴

- **メタ行の `padding-right: 38px` の意味**: 種族行の最終列 state(`·` / `in` / `↓out`)が `min-width:38px`
  で右端に予約されているので、その幅ぶんメタ行の右端をへこませて、`gen X · HH:MM` の末尾を `·` の位置に揃える。
  state 列幅を変える時はこの値も同期更新すること
- **v2.0.0 表記の薄さ(0.32)はタイトル(0.55)より一段暗い**。タイトルと並ぶ要素を最も薄く設定することで
  「数値の観察」が主役になる視線誘導を保つ(同じトーンにすると「v2 系の新作」感が強く出てしまう)
- **事象ログ(`pushEvent` / `eventLog`)は完全削除した**。将来必要になったら git 履歴(コミット
  ad995e2 の親まで遡る)から復元可能。evolution.js の `step()` での退場・誕生・参入の各タイミングは
  そのまま残っているので、後付けで観察フックを足すなら同じ位置を狙う
- **位相同期は常時動作(K = 1.5 固定・rebuildGrid 常時構築)**。colorSync オプション削除に伴って、
  species.js の K 係数を `1.5` 固定リテラル、main.js の rebuildGrid から早期 return を撤去。
  位相同期の負荷は species.js 内で 1 フレーム半数ずつ更新で分散しているので問題なし

### WebGL2 化(Step 2-1)の落とし穴

- **既定で WebGL2 有効。`?gl=0` で明示 opt-out**(本番化済み・b9bf48e)。既存の `?gl=1` ブックマークは no-op マッチで引き続き GL が出るので互換。
  Lively Properties に GL toggle は未実装(必要になったら `LivelyProperties.json` + `lively.js` リスナー追加で対応する)。
- **HDR FBO は `EXT_color_buffer_half_float` 拡張依存**。未対応環境(古い WebGL2 実装)では `useHDR=false` で
  8-bit 直描画にフォールバック → **その場合は 2D 版と同じ残光累積問題が起きうる**(sweepResidue 相当は GL 側にない)。
  実機(Chrome / Edge / WebView2)では拡張取得できる前提。`console.info` で `[render-gl] HDR FBO (RGBA16F) mode enabled`
  が出ているかで確認できる。
- **HDR モードと 8-bit モードで `fadeA` 係数が違う**(意図的)。HDR は指数減衰が完遂するので緩め(0.018/0.08)、
  8-bit は量子化耐性のために濃いめ(0.03/0.1 = 2D 版と同じ)。同じスライダー値でも見た目が違うことを承知。
- **HDR FBO に対しては `antialias: true` の MSAA が効かない**(WebGL 仕様の制約)。代わりにフラグメントで
  **距離ベース AA**(`smoothstep(halfW-1, halfW, dist)`)を入れて補償している。シェーダー変更時に外さない。
- **線幅最小値は 1.0 px**(2D / GL 両方)。1px 未満は AA が構造的に効かずジャギーが出る。
  細さ表現より輪郭の滑らかさを優先(あめさん視認で確定)。
- **2D 版とのスライダー値の解釈差**: HDR 経路では「軌跡の長さ」スライダーの効きが緩いので、同じ値でも視覚的に長く残る。
  あめさんが「もう少し短く」と感じる時は HDR 係数を再調整 or スライダー値を下げる。
- **入口ページの作品リンクは `night-of-life/index.html` を明示**(`night-of-life/` だけだと file:// で
  ディレクトリ一覧が出る)。HTTP / GitHub Pages では同じ動き。
- **bg VAO の vertexAttribPointer 前に bindBuffer を明示**(レビュー後の防御的修正)。VAO バインドは
  ARRAY_BUFFER の現在の binding を変えない仕様だが、依存しないコードにした。
- **`dn` 近似は数学的には厳密**: コメントで「中心点で代用」と書いていたが、vz は (x,y,z) のアフィン線形関数なので
  `(A.vz + B.vz)/2 = vz((A+B)/2) = vzc` が成立(レビューで指摘・コメント訂正済み)。
- **App.simulate は GL 経路でも動く**が、`gl.bufferData` + draw コールが N 回走るので 2D 経路より重い。
  パフォーマンス計測時に注意。

### 退場のウィンクアウトとカメラズーム(セッション 2 追加分)の落とし穴

- **ウィンクアウト式の係数 0.7 / 0.3 の意味**(`pEnv = 1 - (fadeProgress - exitOffset * 0.7) / 0.3`):
  - `0.7` = 粒子ごとの**消え始めタイミング**のずらし幅。`exitOffset` が小さい粒子から消え始め、`exitOffset = 1` の粒子は種族 fadeOut 70% 進んでから消え始める。
  - `0.3` = **各粒子が消えるまでにかかる種族時間の割合**(30% = ~12 秒 / fadeOutSec=40)。
  - `0.7 + 0.3 = 1.0` で「種族 opacity が 0 に達する時点で全粒子が消える」保証(`pEnv` が clamp 内に収まる)。
  - 0.7 を大きく(例:0.9)→ 消え始めの一斉感が増し、最後の方の粒子が急に消える
  - 0.3 を小さく(例:0.15)→ 各粒子の消滅が速くなり、より明確な「ウィンク」になる
- **退場でも targetAct を時刻適合度ベースに保つ**: 退場している種族は dayPhase が現時刻から離れている → fitness が低い → activity が自然に低くなる。
  人為的な 0.1 固定をやめても、結果として動きはやや穏やかになる(自然な振る舞い)。これを 'alive' 同様の 0.5 followRate で追従させているので、
  時間帯遷移にも反応する。
- **`exitOffset` は粒子のフィールドだが localStorage 非保存**: 粒子位置自体が保存対象外なので、ページリロードで全粒子が新規 `exitOffset` を持つ。
  進化データ(genome/gen/parentGens/age)は無関係。
- **カメラズーム(cameraZoom)の応答性**: スライダー変更時、`App.applyCameraZoom()` が `env.camDist` を更新 → 次フレームの描画に反映。
  resize() でも `env.baseCamDist` を再計算した上で `env.camDist` を再適用するので、リサイズと組み合わせても整合する。
- **cameraZoom の dn と worldR の関係**: 引いてカメラ距離が伸びる(`camDist` 大)と、`span = camDist + worldR - 1` が大きくなり、
  手前の粒子もある程度 dn を持ち始める(=軽く霞む)。物理的に正しい大気遠近の挙動だが、引きすぎると全体が藍に寄って色味が薄くなる。
  「200% で薄すぎる」と感じたら max を 180% 程度に下げる(LivelyProperties.json + webui.js + lively.js のクランプ)。

### 既知の現象(原因物理ではないので改修見送り)

- **ウィンドウ縮小 → 拡大時の粒子中央集中(FB-5)**: resize() で `worldR/camDist/focal` を base に応じて更新するが、
  既存粒子の `x/y/z` 座標は古いワールドサイズの値を保持している。新ワールドで「中心に小さく固まっている」状態に見える。
  数秒で粒子が広がる(transient)ので許容。気になるなら resize() で粒子座標を `oldBase / newBase` 比でスケール再投入も可能。

### 3D 化(Step1)の落とし穴

- **渦の通り抜けの中心狙い(AIM)は collapse=白飛びと紙一重**。狙いが累積すると低従順種族が渦輪(円筒面)に
  張り付いて密集白飛び。AIM_MAX を弱め(0.20)・AIM_CORE を大きめ(0.55)・aimEvent=vortex^3 でイベントを
  短く尖らせて緩和(あめさん A 案で確定)。強めると即 collapse。
- **`?event`(常時イベント)は「イベントが永遠に続く」最悪ケースで必ず collapse する** = 実運用評価には使わない。
  実運用はイベントが数十秒で収まるので collapse は育たない。常時化テスト専用のフラグ。
- **狙い先は「渦中心点(=トーラスの穴 cx/cy/cz)」でなく「最寄りの渦輪上の点(out[3..5])」**。穴を狙うと渦を
  素通りして"がらんどう"へ吸い込まれ、一点 collapse で白飛びシェルになる(設計検証で判明)。
- **加算合成(lighter)の白飛び・魚群・collapse・酔いは数値(getImageData)に出にくく実機目視が必須**。
  ms/frame は App.simulate で測れるが見た目はあめさんの目視前提。screenshot ツールはアニメ常時更新でタイムアウトしがち。
- **App.simulate で大量フレーム(×5 等)を一度に回すとプレビュー eval が30秒タイムアウト**。計測は simulate(4〜8)に分ける。
- **env._tmp は長さ6**(0..2=流れベクトル / 3..5=最寄りの渦輪点)。flowAt の戻り規約。短くすると通り抜けが壊れる。
- **カメラは自動では動かさない**(cameraMotion オプションは 2026-06-18 に撤去)。動きを全部「流れ」にして「カメラか流れか分からない」を回避(あめさん要望)。
  ただし **2026-06-18 後段にユーザー操作のオービット(クリック&ドラッグ)を追加**(下記 3 章参照)。
  user-initiated は本人が動かしている自覚があるので錯視は起きない、という整理(自動駆動 NG の制約自体は維持)。
- **3D は密度が命**: 粒子が少ない(〜2000)とパラパラ散って見える。既定4500・最大6000。
- **生物感の禁じ手に「規則的な明滅/一様な呼吸」を追加**(位相同期は色相のゆらぎのみ・明るさに使わない)。
  ただし「渦イベントの一瞬だけは目的を持って飛び込んで見えてOK」とあめさん明示(イベント時は許容)。

### 2D 時代から引き継ぐ落とし穴

- **観測パネルに自作のブロック文字バー/グリフ(▃▄▅ や ███▋)を使わない**。
  フォントで高さ・基準線がバラつき「気持ち悪い」見た目になる(あめさん NG 済み)。
  観測パネルの正解は「デバッグ表示と同じ素の数値の羅列(等幅・右揃え)」。
  あめさんが美しいと感じたのは左下デバッグの機械的な数値の並び、が出発点
- **OBSERVATORIUM は高さを固定予約している**(.rows min-height = 6 行 + 事象ログ常時 3 行)。
  種族数や事象数が変わってもパネルが上下しないため。列を足す時も高さ予約を崩さない
- **齢・事象ログ・nova・lineageVigor は localStorage に保存しない**(実行時状態)。
  save スキーマは v2 据え置き(genome/gen/parentGens/age のみ)。age だけは保存する
- **色ニッチ分化の係数は 0.6 / カーネル 60度**。スイープで決めた安定点で、
  0.8 まで上げると逆に単色へ崩壊する(非単調)。色相は常時 3〜4 グループに分散
- **色相の交叉は「常に中間ブレンド」**(genome.js crossover の hueOffset 分岐・2026-06-14 変更)。
  通常の 40/40/20 に戻すと交配が「どちらかの親色」に倒れて混色(紫)が出なくなる(あめさん要望で変更)。
  彩度・明度は 40/40/20 のまま(混ぜると混色が濁る)ので hueOffset だけ特別扱い。
  「混色を強める=平均回帰=単色化」の綱引きは headless シミュで検証済みで、多様性は hueCrowd 0.6 が支える
  (据え置きが安定点。混色しても色グループ数はむしろ増える=青↔桃の間を紫が埋める)
- **時計を選択圧から外す改修(段階3)は sharing の再設計が地雷**。係数を誤ると全種が
  単一型に崩壊。必ず headless スイープで「5 種が散らばり続けるか」を確認してから実装

- **澱(半透明合成の 8bit 丸めで消えきらない軌跡)は sweepResidue が掃除する**
  (js/main.js)。fade や背景色をいじる時は、スナップ判定の色差閾値
  (二乗和 ≤ 18)で拾える範囲に収まるか確認する。
  軌跡を長く見せたい時は fade を下げるのではなく粒子の速度を下げる方が安全
- **ヘッドレスプレビューでは rAF が約 1.5fps に絞られる**(オフスクリーン)。
  動作確認はコンソールから `App.simulate(秒数)` を使う(1 回 25 秒分まで
  がツールのタイムアウト安全圏)。スクリーンショットは画面合成が止まって
  古い絵を見せることがある → canvas.getImageData で実描画を確認できる
- **時刻→基調色相の補間は青↔橙の移行で必ず緑帯を通る**(色相環の構造上不可避)。
  js/main.js の HUE_KEYS はキーを細かく置いて緑の通過を速くしてある。
  キーを減らすと「藻色」の時間帯が長くなる
- **進化の多様性は 3 点セットで保っている**(js/genome.js, js/evolution.js):
  (1) fitness sharing(活動時間帯が被ると割引)
  (2) 選択は現在時刻でなく 1.5 時間先を基準にする
  (3) phaseWidth のトレードオフ(活動幅が狭いほどピークが高い)。
  どれかを外すと全種族が同質化する(デモ検証で確認済み)
- **localStorage は実行環境ごとに別**: ブラウザと Lively(WebView2)で進化は
  別々に育つ。Lively を入れ直すと進化はリセットされる
- **デモモード(?demo)は保存しない**仕様(本物の進化を上書きしないため)
- **Lively の壁紙はタスクバーの裏まで描画される**: 画面下端に置く UI は
  bottomMargin(--bottom-offset)で持ち上げる。新しい下端 UI を足す時も同様に
- **Web 設定 UI(webui.js)の Lively 抑制を壊さない**: webui.js は読み込み時に
  `window.livelyPropertyListener` をラップし、ホスト(Lively)が一度でも呼んだら
  「壁紙だ」と判断してパネルを撤去する。lively.js より後に読み込む順序が前提。
  Web UI からの設定変更は**ラップ前に保存した本来のリスナー**を呼ぶ(壁紙判定を踏まない)
- **Web 設定の保存キーは `art-web-settings-v1`**(進化データ `art-evolution-v2` とは別)。
  ここに保存するのは表示用の設定値だけ。進化データと混ぜない
- **GitHub Pages は ART リポジトリのルートから配信**(source: main / root)。
  生命の夜は `night-of-life/` 配下なので URL は `/ART/night-of-life/`。
  ART 直下の入口 index.html が `/ART/` の 404 を防いでいる。
  index.html の相対パス(js/... と LivelyProperties.json)は同じフォルダ前提なので、
  フォルダごと動かす分には壊れない(個別に動かさないこと)
- **粒子の転生(species.js)を外さない**: ゆっくり動く粒子は同じ渦を周回し続けて
  「轍」の網を刻み、渦中心に密集して白飛びする。転生はその根本対策
- **lumBase の下限(0.55)を下げない**: 暗い筆致は「光」でなく「汚れた溝」に見える
- **生物感の禁じ手リスト**: 蛇行、明るい頭+減衰する尾(彗星型)、強い cohesion での
  密集うねり。どれも「虫の群体」に見えてしまう(初版で確認済み)

## 6. ビルド / リリース手順

ビルドなし(静的ファイルのみ)。

### Web 公開(GitHub Pages)

- リポジトリ ART は public。Pages は **source: main ブランチ / ルート(/)** から配信。
- 公開 URL: https://hello-amedev.github.io/ART/night-of-life/(ART は大文字のまま)。
  入口は https://hello-amedev.github.io/ART/
- 更新の反映: main に push すれば数十秒〜数分で自動再ビルドされる(Lively と違いコピー不要)。
- 設定/有効化コマンド例(gh、要 repo 権限):
  - public 化: `gh repo edit hello-amedev/ART --visibility public --accept-visibility-change-consequences`
  - Pages 有効化: `gh api -X POST repos/hello-amedev/ART/pages -f 'source[branch]=main' -f 'source[path]=/'`
  - 状態確認: `gh api repos/hello-amedev/ART/pages`
- **後追い**: 共有カードのプレビュー画像。`night-of-life/preview.png`(実機スクショ推奨。
  ヘッドレスは描画が止まりがちなので実機が確実)を置き、index.html に og:image /
  twitter:image を足して twitter:card を `summary_large_image` に戻す。
  twitter:creator(X ハンドル)も追記する(あめさん確認後)

### Lively Wallpaper への取り込み(壁紙として使う / 配布)

Lively の「+」→ `night-of-life/index.html` を選択。
LivelyProperties.json は同じフォルダに置いてあれば自動で読まれる。

**重要**: Lively は壁紙追加時にファイル一式をコピーする
(ライブラリフォルダに取り込む)。開発フォルダを更新しても
Lively 側には反映されない。**更新のたびに壁紙を削除して入れ直す**こと。
LivelyProperties.json に項目を追加した場合も入れ直さないと設定画面に出ない。

壁紙データの別途配布(BOOTH / GitHub Releases の zip)は未着手。次フェーズの候補。
