import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { observeHand, observedEvent } from '../../server/bots/memory/observations.mjs';
import { accumulate, emptyMemory, estimate, familiarity } from '../../server/bots/memory/model.mjs';
import { MemoryProvider, StructuredEpisodicMemoryProvider, loadMemory, decisionScope, timedMemory } from '../../server/bots/memory/provider.mjs';
import { adaptiveDecision } from '../../server/bots/memory/adaptive.mjs';
import { migrateMemory, updateMemoryForHand, rebuildMemory, MEMORY_COLLECTION } from '../../server/bots/memory/store.mjs';
import { adaptationAnalysis, publicMemory, memoryHealth } from '../../server/bots/memory/diagnostics.mjs';
import { characterHash, configErrors } from '../../server/bots/config.mjs';
import { finishCapture } from '../../server/analytics/recorder.mjs';
import { readCorpus } from '../../scripts/replay-corpus.mjs';
import { seeded } from './helpers/table-sim.mjs';
import { teenPattiTable, dealTeenPatti, playTeenPatti } from './helpers/drivers.mjs';
import { observedFixture, learnedMemory, adaptiveStyle, T0, DAY } from './helpers/bot-memory.mjs';

const scope = (botId = 'rohit-sharma', asOf = T0+DAY) => ({ botId, game: 'teen-patti', variant: 'classic-1', handId: 'current', nightId: 'tonight', playerIds: ['a'], asOf, working: { actions: [] } });
function live(memory = learnedMemory(), style = adaptiveStyle()) {
	const sim = teenPattiTable({ humans: ['a'] });
	sim.now = T0+DAY;
	sim.act('a','addBot', { botId: 'bot-memorytest', name: 'Memory', level: 'normal', style });
	dealTeenPatti(sim);
	if (sim.room.currentPlayerId === 'a') sim.act('a','bet', { amount: sim.view('a').legalActions.maxBet });
	const view = sim.view('bot-memorytest');
	const spec = decisionScope(view, 'bot-memorytest', style.botId, sim.state, sim.now+1);
	return { sim, view, snapshot: new MemoryProvider(spec, memory).freeze(), spec };
}

test('historical ingress requires actual participation and observation; packed seats still observe', () => {
	const record = observedFixture(1);
	assert.equal(observeHand(record,'virat-kohli'),null);
	assert.ok(observeHand(record,'rohit-sharma'));
	record.observers.find(o=>o.p==='bot-seat').until=1;
	assert.equal(observeHand(record,'rohit-sharma').peers[0].decisions.length,0);
	assert.equal(observeHand(record,'rohit-sharma').peers[0].result,null);
	record.observers=[];
	assert.equal(observeHand(record,'rohit-sharma'),null);
});

test('disconnected and explicit observation boundaries fail closed; forced and automatic decisions are separate', () => {
	const r=observedFixture(1);
	const human=r.seats[0];
	assert.equal(observedEvent(r,human,r.events[0]),false);
	r.events[0].connected=['a'];
	assert.equal(observedEvent(r,human,r.events[0]),true);
	r.events[1].observedBy=[];
	assert.equal(observeHand(r,'rohit-sharma').peers[0].decisions.length,0);
	delete r.events[1].observedBy;
	r.events[1].kind='system'; r.events[1].a='timeout'; r.events[1].connected=[];
	const o=observeHand(r,'rohit-sharma');
	assert.equal(o.peers[0].decisions.length,0);
	assert.equal(o.peers[0].disconnectedTimeouts,1);
	assert.equal(o.peers[0].automatic,1);
});

test('private cards, deck, future actions, other bot/admin analytics and hidden stacks never enter memory', () => {
	const r=observedFixture(1); r.seats[0].hidden=true;
	const original=observeHand(r,'rohit-sharma');
	const changed=structuredClone(r);
	changed.private={cards:['secret']}; changed.deck=['future']; changed.botTrace=['sealed']; changed.adminAnalytics={fold:1};
	changed.seats[0].cards=['secret']; changed.seats[0].stack=99999;
	changed.events[1].decision.stackBefore=999999;
	changed.events[1].decision.legal.discard={secret:['cards']};
	changed.events[1].payload.secret='secret';
	assert.deepEqual(observeHand(changed,'rohit-sharma'),original);
	assert.doesNotMatch(JSON.stringify(original),/secret|deck|cards|botTrace|adminAnalytics|99999/);
	assert.equal(observeHand(r,'rohit-sharma',r.completedAt),null);
});

test('late reveals are remembered only with explicit presence and strict time boundaries; cards never copied', () => {
	const r=observedFixture(1);
	r.lateShown=[{p:'a',t:r.completedAt+100,observedBy:[],cards:['secret']}];
	assert.equal(observeHand(r,'rohit-sharma').episodes.filter(e=>e.tags.includes('public-reveal')).length,0);
	r.lateShown[0].observedBy=['bot-seat'];
	assert.equal(observeHand(r,'rohit-sharma',r.completedAt+50).episodes.filter(e=>e.tags.includes('public-reveal')).length,0);
	const remembered=observeHand(r,'rohit-sharma',r.completedAt+101);
	assert.equal(remembered.episodes.filter(e=>e.tags.includes('public-reveal')).length,1);
	assert.doesNotMatch(JSON.stringify(remembered),/secret|cards/);
});

test('legal opportunities, context, known results and voluntary choice denominators', () => {
	const r=observedFixture(1);
	let m=accumulate(emptyMemory('rohit-sharma','teen-patti','classic-1'),observeHand(r,'rohit-sharma'));
	assert.equal(m.models[0].metrics['pressure:fold'].n,1);
	assert.equal(m.models[0].metrics['large-pressure:fold'].n,1);
	assert.equal(m.models[0].metrics['all:check'],undefined);
	r._id+='next'; r.completedAt+=60000; r.startedAt+=60000; r.handNo++;
	r.events[1].decision.legal={pack:true};
	m=accumulate(m,observeHand(r,'rohit-sharma'));
	assert.equal(m.models[0].metrics['pressure:fold'].n,1);
	assert.equal(m.models[0].automatic,1);
});

test('small samples shrink to a prior, recency fades confidence without deleting lifetime evidence', () => {
	const small=learnedMemory({hands:3}).models[0];
	const large=learnedMemory({hands:263}).models[0];
	const s=estimate(small.metrics['pressure:fold'],T0+DAY);
	const l=estimate(large.metrics['pressure:fold'],T0+DAY);
	assert.ok(s.longTerm<.51 && s.confidence<.01);
	assert.ok(l.longTerm>.9 && l.confidence>.7);
	const older=estimate(large.metrics['pressure:fold'],T0+180*DAY);
	assert.equal(older.opportunities,l.opportunities);
	assert.ok(older.confidence<l.confidence/5);
	assert.ok(older.recentSamples<1);
	assert.equal(familiarity(small,T0+DAY),'Just met');
});

test('recent strategy changes alter estimates gradually; context and post-result history stay causal', () => {
	let m=learnedMemory({hands:200,start:T0-90*DAY});
	for(let i=200;i<260;i++) m=accumulate(m,observeHand(observedFixture(i,{action:'raise',at:T0+(i-200)*60000}),'rohit-sharma'));
	const e=estimate(m.models[0].metrics['pressure:fold'],T0+DAY);
	assert.ok(e.recent<e.longTerm-.25);
	assert.equal(e.changed,true);
	assert.ok(m.models[0].metrics['after-loss:raise']);
	assert.ok(m.models[0].metrics['loss-streak:raise']);
});

test('provider enforces bot, player, context and time; freezing is immutable and retrieved episodes cannot escape scope', () => {
	const m=learnedMemory();
	assert.throws(()=>new MemoryProvider(scope('gg'),m),/boundary/);
	assert.throws(()=>new MemoryProvider({...scope(),variant:'muflis-1'},m),/boundary/);
	assert.throws(()=>new MemoryProvider(scope('rohit-sharma',T0),m),/boundary/);
	const provider=new MemoryProvider(scope(),m);
	assert.throws(()=>provider.getPlayerModel('other'),/scope/);
	assert.throws(()=>provider.getPlayerModel({botId:'gg'}),/scope/);
	const frozen=provider.freeze();
	assert.throws(()=>{frozen.models[0].hands=900;},TypeError);
	m.models[0].hands=900;
	assert.equal(frozen.models[0].hands,200);
	const badBackend={findRelevantEpisodes:()=>[{id:'other-bot',playerId:'a',at:0}]};
	assert.deepEqual(new MemoryProvider(scope(),m,badBackend).findRelevantEpisodes('a'),[]);
	assert.ok(new StructuredEpisodicMemoryProvider(m.episodes).findRelevantEpisodes({playerIds:['a'],before:T0+DAY,limit:100}).length<=6);
});

test('adaptive policy requires new immutable style/hash and caps its maximum probability influence', () => {
	const style=adaptiveStyle();
	assert.deepEqual(configErrors(style),[]);
	const oldHash=style.configHash; style.memory.maxInfluence=.12;
	assert.notEqual(characterHash(style),oldHash);
	style.memory.maxInfluence=.13; style.configHash=characterHash(style);
	assert.match(configErrors(style).join(),/maxInfluence/);
	style.policy='tp-character@1'; style.configHash=characterHash(style);
	assert.match(configErrors(style).join(),/new adaptive policy/);
});

test('tiny histories produce no adaptation; strong histories bounded and character dependent', () => {
	const tiny=live(learnedMemory({hands:5}));
	const t=adaptiveDecision(tiny.view,'bot-memorytest',seeded(55),adaptiveStyle(),tiny.snapshot);
	assert.equal(t.adaptive.adaptations.length,0);
	const strong=live();
	let adaptations=0;
	for(let seed=1;seed<80;seed++) {
		const move=adaptiveDecision(strong.view,'bot-memorytest',seeded(seed),adaptiveStyle(),strong.snapshot);
		const probs=move.adaptive.finalProbabilities;
		assert.ok(Math.abs(Object.values(probs).reduce((a,b)=>a+b,0)-1)<1e-10);
		assert.ok(1-probs[move.adaptive.baseAction] <= .1+1e-10);
		adaptations+=move.adaptive.adaptations.length;
	}
	assert.ok(adaptations>20);
	const style=adaptiveStyle(); style.memory.pressureResponse=0; style.configHash=characterHash(style);
	const noPressure=adaptiveDecision(strong.view,'bot-memorytest',seeded(55),style,strong.snapshot);
	assert.equal(noPressure.adaptive.adaptations.length,0);
});

test('memory lookup failure and timeout fall back promptly and base decisions remain reproducible', async () => {
	const {view,spec}=live();
	const failure=await timedMemory(()=>Promise.reject(new Error('Mongo offline')),spec);
	assert.equal(failure.snapshot.status,'unavailable');
	const timeout=await timedMemory(()=>new Promise(()=>{}),spec,5);
	assert.equal(timeout.snapshot.reason,'lookup-timeout');
	assert.ok(timeout.lookupMs<200);
	const move=adaptiveDecision(view,'bot-memorytest',seeded(12),adaptiveStyle(),failure.snapshot);
	assert.equal(move.adaptive.adaptations.length,0);
	assert.ok(move.adaptive.reasonCodes.includes('memory-unavailable'));
});

test('hidden-card invariance, frozen future knowledge and exact adaptive replay through recorder', () => {
	const {sim,spec}=live();
	const m=learnedMemory();
	sim.memoryFor=id=>new MemoryProvider(decisionScope(sim.view(id),id,'rohit-sharma',sim.state,sim.now+1),m).freeze();
	const old=sim.view('bot-memorytest');
	const frozen=new MemoryProvider(spec,m).freeze();
	const a=adaptiveDecision(old,'bot-memorytest',seeded(42),adaptiveStyle(),frozen);
	for(const p of sim.room.players.filter(p=>!p.bot)) p.cards=p.cards.map((_,i)=>({rank:i+2,suit:'clubs'}));
	const b=adaptiveDecision(sim.view('bot-memorytest'),'bot-memorytest',seeded(42),adaptiveStyle(),frozen);
	assert.deepEqual(a,b);
	// Restore actual authoritative states before testing recorder replay.
	const clean=live();
	clean.sim.memoryFor=id=>new MemoryProvider(decisionScope(clean.sim.view(id),id,'rohit-sharma',clean.sim.state,clean.sim.now),m).freeze();
	playTeenPatti(clean.sim,{packBias:0});
	const capture=clean.sim.captures()[0];
	const result=finishCapture(capture);
	assert.ok(result.ok,JSON.stringify(result.failure));
	assert.ok(result.records.sealed.botTrace.some(t=>t.adaptive));
	assert.doesNotMatch(JSON.stringify(result.records.public),/memorySnapshot|finalProbabilities|player-model|opponent-fold-pressure/);
	m.models[0].metrics['pressure:fold'].k=0;
	assert.deepEqual(finishCapture(capture),result);
	const corrupt=structuredClone(capture);
	const step=corrupt.hand.steps.find(s=>s.bot?.memory);
	step.bot.memory.models[0].hands++;
	assert.equal(finishCapture(corrupt).ok,false);
});

const mongo=await MongoMemoryServer.create();
const client=await new MongoClient(mongo.getUri()).connect();
test.after(async()=>{await client.close(); await mongo.stop();});
let dbNo=0;
async function database(){const db=client.db(`memory-${++dbNo}`);await migrateMemory(db);return db;}
async function store(db,r){await db.collection('hand_records').replaceOne({_id:r._id},r,{upsert:true});return updateMemoryForHand(db,r._id);}

test('persistent updates survive new providers, duplicate delivery, out-of-order delivery and concurrent tables', async()=>{
	const db=await database();
	const records=Array.from({length:12},(_,i)=>observedFixture(i));
	await store(db,records[4]);
	for(const r of records) await db.collection('hand_records').replaceOne({_id:r._id},r,{upsert:true});
	await Promise.all([updateMemoryForHand(db,records[11]._id),updateMemoryForHand(db,records[0]._id)]);
	await updateMemoryForHand(db,records[11]._id);
	const before=await loadMemory(db,scope());
	assert.equal(before.models[0].hands,12);
	await rebuildMemory(db,{botId:'rohit-sharma'});
	const after=await loadMemory(db,scope());
	assert.deepEqual(after.models,before.models);
	assert.deepEqual(after.episodes,before.episodes);
	const human=await publicMemory(db,'rohit-sharma','a',T0+DAY);
	assert.equal(human.hands,12);
	assert.doesNotMatch(JSON.stringify(human),/confidence|metrics|fold|trace|opportunities|configHash/);
	assert.equal((await publicMemory(db,'gg','a')).hands,0);
	assert.equal((await memoryHealth(db,T0+DAY)).bots[0].playerModels,1);
});

test('memory reads never query analytics or another bot and failure never mutates history', async()=>{
	const db=await database(); const record=observedFixture(1);
	await store(db,record);
	const guarded={collection(name){assert.equal(name,MEMORY_COLLECTION);return {findOne(query){assert.equal(query._id,'rohit-sharma|teen-patti|classic-1');return db.collection(name).findOne(query);}};}};
	assert.equal((await loadMemory(guarded,scope())).models[0].hands,1);
	const authoritative = await db.collection('hand_records').findOne({_id:record._id});
	await rebuildMemory(db,{botId:'rohit-sharma'});
	assert.deepEqual(await db.collection('hand_records').findOne({_id:record._id}),authoritative);
});

test('late reveal update and rebuild agree without rewriting past snapshots',async()=>{
	const db=await database();const r=observedFixture(1);await store(db,r);
	const old=await loadMemory(db,scope());
	r.lateShown=[{p:'a',t:T0+DAY+100,observedBy:['bot-seat'],cards:['hidden-card-never-copied']}];
	await store(db,r);
	await assert.rejects(loadMemory(db,scope()),/boundary/);
	const next=await loadMemory(db,scope('rohit-sharma',T0+DAY+200));
	assert.ok(next.episodes.some(e=>e.tags.includes('public-reveal')));
	assert.ok(!old.episodes.some(e=>e.tags.includes('public-reveal')));
	assert.doesNotMatch(JSON.stringify(next),/hidden-card|cards/);
});

test('internal diagnostics use walk-forward prediction and label small/confounded samples honestly',()=>{
	const reports=Array.from({length:90},(_,i)=>({handId:`h${i}`,nightId:`n${Math.floor(i/10)}`,at:i,
		styleId:'bot@2',game:'teen-patti',variant:'classic-1',units:i%2?1:-1,won:i%2, fairShare:.5,
		decisions:[{action:'raise',baseAction:'call',context:{blind:true,live:1,pot:'small',price:'low',canRaise:true},reasonCodes:['pressure'],adapted:true,redirected:true,priorHands:i,memoryStatus:'available',changed:false}]}));
	assert.equal(adaptationAnalysis(reports.slice(0,5)).predictability.accuracy,null);
	const result=adaptationAnalysis(reports);
	assert.equal(result.predictability.samples,80);
	assert.equal(result.predictability.accuracy,1);
	assert.equal(result.exploitability.length,1);
	assert.match(result.causality,/Not established/);
});

test('all published v1 corpus decisions remain reproducible',()=>{
	for(const capture of readCorpus().hands){const r=finishCapture(capture);assert.ok(r.ok,JSON.stringify(r.failure));}
});
