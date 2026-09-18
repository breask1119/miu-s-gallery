// test/distribution.test.mjs
import assert from 'node:assert/strict';
import {
  getDistributionByRating,
  getEligibleImagesForPlatform,
  BASE_RULES,
  DEFAULT_HOLD_RULE,
} from '../src/lib/distribution.ts';

console.log('🧪 Running Distribution Logic Tests...\n');

// 1. 各 rating 単体の期待値テスト
console.log('--- Test 1: getDistributionByRating 单体テスト ---');

// safe
const safeDist = getDistributionByRating('safe');
assert.deepEqual(safeDist, {
  instagram: true,
  threads: true,
  x: true,
  patreon: 'public',
}, 'safe の判定が一致しません');
console.log('✓ safe: OK');

// mild
const mildDist = getDistributionByRating('mild');
assert.deepEqual(mildDist, {
  instagram: true,
  threads: false,
  x: true,
  patreon: 'public',
}, 'mild の判定が一致しません');
console.log('✓ mild: OK');

// sensitive
const sensitiveDist = getDistributionByRating('sensitive');
assert.deepEqual(sensitiveDist, {
  instagram: false,
  threads: false,
  x: false,
  patreon: 'free',
}, 'sensitive の判定が一致しません');
console.log('✓ sensitive: OK');

// explicit
const explicitDist = getDistributionByRating('explicit');
assert.deepEqual(explicitDist, {
  instagram: false,
  threads: false,
  x: false,
  patreon: 'paid',
}, 'explicit の判定が一致しません');
console.log('✓ explicit: OK');

// review
const reviewDist = getDistributionByRating('review');
assert.deepEqual(reviewDist, {
  instagram: false,
  threads: false,
  x: false,
  patreon: 'hold',
}, 'review の判定が一致しません');
console.log('✓ review: OK');

// 未設定 / undefined / null / unknown
const undefinedDist = getDistributionByRating(undefined);
assert.deepEqual(undefinedDist, DEFAULT_HOLD_RULE, 'undefined は hold に倒れる必要があります');
console.log('✓ undefined -> hold: OK');

const nullDist = getDistributionByRating(null);
assert.deepEqual(nullDist, DEFAULT_HOLD_RULE, 'null は hold に倒れる必要があります');
console.log('✓ null -> hold: OK');

const emptyDist = getDistributionByRating('');
assert.deepEqual(emptyDist, DEFAULT_HOLD_RULE, '空文字は hold に倒れる必要があります');
console.log('✓ empty string -> hold: OK');

const unknownDist = getDistributionByRating('unknown_rating_xyz');
assert.deepEqual(unknownDist, DEFAULT_HOLD_RULE, '不明なratingは hold に倒れる必要があります');
console.log('✓ unknown -> hold: OK');

// 配列形式 (WordPress REST APIのPodsフィールド対応: ['safe'])
const arrayDist = getDistributionByRating(['safe']);
assert.deepEqual(arrayDist, safeDist, '配列形式のratingが正しく解釈されていません');
console.log('✓ array ["safe"]: OK');


// 2. override (上書き指定) のテスト
console.log('\n--- Test 2: override の下地テスト ---');
// safe だが instagram を個別除外
const overrideSafe = getDistributionByRating('safe', { instagram: false });
assert.equal(overrideSafe.instagram, false, 'instagram が false に override されていません');
assert.equal(overrideSafe.threads, true, 'threads が維持されていません');
assert.equal(overrideSafe.x, true, 'x が維持されていません');
assert.equal(overrideSafe.patreon, 'public', 'patreon が維持されていません');
console.log('✓ override (safe + instagram:false): OK');

// sensitive だが patreon を paid に指定
const overrideSensitive = getDistributionByRating('sensitive', { patreon: 'paid' });
assert.equal(overrideSensitive.patreon, 'paid', 'patreon が paid に override されていません');
assert.equal(overrideSensitive.instagram, false, 'instagram が維持されていません');
console.log('✓ override (sensitive + patreon:paid): OK');


// 3. getEligibleImagesForPlatform の抽出テスト
console.log('\n--- Test 3: getEligibleImagesForPlatform 抽出テスト ---');
const sampleImages = [
  { id: 1, title: 'Safe画像', content_rating: 'safe', gallery_visible: true },
  { id: 2, title: 'Mild画像', content_rating: 'mild', gallery_visible: true },
  { id: 3, title: 'Sensitive画像', content_rating: 'sensitive', gallery_visible: true },
  { id: 4, title: 'Explicit画像', content_rating: 'explicit', gallery_visible: false },
  { id: 5, title: 'Review画像', content_rating: 'review', gallery_visible: true },
  { id: 6, title: 'Undefined画像', content_rating: undefined, gallery_visible: true },
  { id: 7, title: 'Unknown画像', content_rating: 'weird_value', gallery_visible: true },
  { id: 8, title: 'Safe非公開画像', content_rating: 'safe', gallery_visible: false },
];

// Instagram: safe, mild (id: 1, 2, 8)
const igImages = getEligibleImagesForPlatform(sampleImages, 'instagram');
assert.deepEqual(igImages.map(i => i.id), [1, 2, 8], 'Instagram 抽出が一致しません');
console.log('✓ Instagram (safe, mild):', igImages.map(i => `${i.id}:${i.title}`));

// Threads: safe (id: 1, 8)
const threadsImages = getEligibleImagesForPlatform(sampleImages, 'threads');
assert.deepEqual(threadsImages.map(i => i.id), [1, 8], 'Threads 抽出が一致しません');
console.log('✓ Threads (safe のみ):', threadsImages.map(i => `${i.id}:${i.title}`));

// X: safe, mild (id: 1, 2, 8)
const xImages = getEligibleImagesForPlatform(sampleImages, 'x');
assert.deepEqual(xImages.map(i => i.id), [1, 2, 8], 'X 抽出が一致しません');
console.log('✓ X (safe, mild):', xImages.map(i => `${i.id}:${i.title}`));

// Patreon Public: safe, mild (id: 1, 2, 8)
const patreonPublicImages = getEligibleImagesForPlatform(sampleImages, 'patreon_public');
assert.deepEqual(patreonPublicImages.map(i => i.id), [1, 2, 8], 'Patreon Public 抽出が一致しません');
console.log('✓ Patreon Public (safe, mild):', patreonPublicImages.map(i => `${i.id}:${i.title}`));

// Patreon Free: safe, mild, sensitive (id: 1, 2, 3, 8)
const patreonFreeImages = getEligibleImagesForPlatform(sampleImages, 'patreon_free');
assert.deepEqual(patreonFreeImages.map(i => i.id), [1, 2, 3, 8], 'Patreon Free 抽出が一致しません');
console.log('✓ Patreon Free (safe, mild, sensitive):', patreonFreeImages.map(i => `${i.id}:${i.title}`));

// Patreon Paid: safe, mild, sensitive, explicit (id: 1, 2, 3, 4, 8)
const patreonPaidImages = getEligibleImagesForPlatform(sampleImages, 'patreon_paid');
assert.deepEqual(patreonPaidImages.map(i => i.id), [1, 2, 3, 4, 8], 'Patreon Paid 抽出が一致しません');
console.log('✓ Patreon Paid (safe, mild, sensitive, explicit):', patreonPaidImages.map(i => `${i.id}:${i.title}`));

// review, undefined, unknown はどのプラットフォームにも一切含まれないことの確認
for (const plat of ['instagram', 'threads', 'x', 'patreon_public', 'patreon_free', 'patreon_paid']) {
  const result = getEligibleImagesForPlatform(sampleImages, plat);
  const excludedIds = [5, 6, 7]; // review, undefined, unknown
  for (const id of excludedIds) {
    assert.equal(result.some(i => i.id === id), false, `Platform ${plat} に hold 対象 (id: ${id}) が含まれてしまっています`);
  }
}
console.log('✓ review / undefined / unknown は全プラットフォームから完全除外: OK');


// 4. gallery_visible との独立性テスト
console.log('\n--- Test 4: gallery_visible との独立性テスト ---');
// id: 8 (safe, gallery_visible: false) は Instagram / Threads / X に選出される
assert.equal(igImages.some(i => i.id === 8), true, 'gallery_visible: false でも safe なら Instagram に選出される必要があります');
// id: 4 (explicit, gallery_visible: true の場合をシミュレート)
const explicitVisible = [{ id: 99, title: 'ExplicitVisible', content_rating: 'explicit', gallery_visible: true }];
assert.equal(getEligibleImagesForPlatform(explicitVisible, 'instagram').length, 0, 'gallery_visible: true でも explicit なら Instagram に選出されてはいけません');
assert.equal(getEligibleImagesForPlatform(explicitVisible, 'patreon_paid').length, 1, 'explicit は patreon_paid に選出される必要があります');
console.log('✓ gallery_visible はSNS判定に影響しない (完全独立): OK');


// 5. WordPress REST API 実データ（凛ちゃん1〜4）でのシミュレーション
console.log('\n--- Test 5: 実データ（凛ちゃん1〜4）でのシミュレーション ---');
const rinChanData = [
  { id: 1084, title: '凛ちゃん1', content_rating: ['safe'], gallery_visible: '1' },
  { id: 1086, title: '凛ちゃん2', content_rating: ['mild'], gallery_visible: '1' },
  { id: 1087, title: '凛ちゃん3', content_rating: ['sensitive'], gallery_visible: '1' },
  { id: 1088, title: '凛ちゃん4', content_rating: ['explicit'], gallery_visible: '0' },
];

console.log('Instagram 配信対象:', getEligibleImagesForPlatform(rinChanData, 'instagram').map(i => i.title));
console.log('Threads 配信対象:  ', getEligibleImagesForPlatform(rinChanData, 'threads').map(i => i.title));
console.log('X 配信対象:        ', getEligibleImagesForPlatform(rinChanData, 'x').map(i => i.title));
console.log('Patreon Public:    ', getEligibleImagesForPlatform(rinChanData, 'patreon_public').map(i => i.title));
console.log('Patreon Free:      ', getEligibleImagesForPlatform(rinChanData, 'patreon_free').map(i => i.title));
console.log('Patreon Paid:      ', getEligibleImagesForPlatform(rinChanData, 'patreon_paid').map(i => i.title));

console.log('\n🎉 All 5 Test Suites PASSED Successfully!');
