/** Actual engine/recorder/policy simulation. Only observer-filtered public records train models.
 * No Mongo, credentials, migrations, LLM or deployment. */
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { teenPattiTable, dealTeenPatti } from '../tests/server/helpers/drivers.mjs';
import { seeded } from '../tests/server/helpers/table-sim.mjs';
import { adaptiveStyle, T0 } from '../tests/server/helpers/bot-memory.mjs';
import { MemoryProvider, decisionScope } from '../server/bots/memory/provider.mjs';
import { observeHand } from '../server/bots/memory/observations.mjs';
import { accumulate, emptyMemory, estimate } from '../server/bots/memory/model.mjs';
import { finishCapture } from '../server/analytics/recorder.mjs';
import { handFacts } from '../server/analytics/compute/facts.mjs';

export const SCENARIOS=['fixed','changing','aggressive','conservative','unpredictable','bot'];
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(a.length*p)-1)] ?? null;
export function simulateMemory({hands=120,scenario='changing',character=0,offset=0}={}) {
	if(!SCENARIOS.includes(scenario)) throw new Error('Unknown simulation');
	const style=adaptiveStyle(character);
	let memory=emptyMemory(style.botId,'teen-patti','classic-1');
	let adapted=0,redirected=0,decisions=0,failures=0,net=0,wins=0,fair=0;
	const decisionMs=[], episodeMs=[], trajectory=[];
	for(let n=0;n<hands;n++) {
		const sim=teenPattiTable({seed:50000+offset+n,humans:['a'],bots:scenario==='bot'?['normal']:[],options:{potLimit:64},table:5000});
		sim.now=T0+n*120000;
		sim.room.name=`memory-sim-${scenario}-${n}`;
		sim.state.night.id=`sim-night-${Math.floor(n/10)}`;
		sim.state.night.handNo=n%10;
		sim.act('a','addBot',{botId:'bot-learning',name:'Learning',level:'normal',style});
		dealTeenPatti(sim);
		// Bot-vs-bot case uses a real second bot seat. Host is packed before learning starts.
		const random=seeded(70000+offset+n);
		sim.memoryFor=id=>{
			const metrics={};
			const snapshot=new MemoryProvider(decisionScope(sim.view(id),id,style.botId,sim.state,sim.now),memory).freeze(metrics);
			episodeMs.push(metrics.episodeMs);return snapshot;
		};
		for(let turn=0;turn<140 && sim.playing();turn++) {
			sim.tick(500);
			const start=performance.now();
			const bot=sim.botMove();
			if(bot) {
				if(bot.adaptive) {decisionMs.push(performance.now()-start);decisions++;
				adapted+=Number(!!bot.adaptive.adaptations.length);redirected+=Number(!!bot.adaptive.redirected);}
				continue;
			}
			const id=sim.room.currentPlayerId;
			const view=sim.view(id), legal=view.legalActions;
			const mode=scenario==='changing' ? n<hands/2?'conservative':'aggressive' : scenario;
			let action='bet', payload={amount:legal.minBet};
			if(mode==='bot') {
				action='pack';payload={};
			} else if(legal.see) { action='see';payload={}; }
			else if(mode==='conservative' && view.maxStake>view.boot && random()<.92) {action='pack';payload={};}
			else if(legal.show && (turn>14 || random()<.12)) {action='show';payload={};}
			else if(!legal.bet) {action='pack';payload={};}
			else if(mode==='aggressive' || (mode==='unpredictable' && random()<.5)) payload={amount:legal.maxBet};
			else if(mode==='unpredictable' && random()<.3) {action='pack';payload={};}
			sim.act(id,action,payload);
		}
		while(sim.playing())sim.timeout();
		const result=finishCapture(sim.captures()[0]);
		if(!result.ok){failures++;continue;}
		const record=result.records.public;
		memory=accumulate(memory,observeHand(record,style.botId));
		const fact=handFacts(record).get('bot-learning');
		net+=fact.units;wins+=fact.won;fair+=fact.fairShare;
		const model=memory.models.find(m=>m.playerId===(scenario==='bot'?'bot:legacy-normal':'a'));
		if((n+1)%20===0) trajectory.push({hands:n+1,pressureFold:estimate(model?.metrics['pressure:fold'],sim.now)?.longTerm ?? null,
			recentPressureFold:estimate(model?.metrics['pressure:fold'],sim.now)?.recent ?? null});
	}
	return {scenario,botId:style.botId,hands,failures,decisions,adapted,redirected,boots:net,wins,fairShare:fair,
		modelHands:memory.models.find(m=>m.playerId===(scenario==='bot'?'bot:legacy-normal':'a'))?.hands ?? 0,trajectory,
		latency:{decision:{mean:decisionMs.reduce((a,b)=>a+b,0)/Math.max(1,decisionMs.length),p95:percentile(decisionMs,.95)},episodes:{p95:percentile(episodeMs,.95)}},
		inference:'Seeded simulation, not a causal estimate of improvement or measured production difficulty.'};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
	const arg=process.argv.find(a=>a.startsWith('--hands='));
	const hands=arg?Number(arg.split('=')[1]):120;
	if(!Number.isSafeInteger(hands)||hands<20||hands>5000)throw new Error('Use --hands=20..5000');
	const results=SCENARIOS.map((scenario,index)=>simulateMemory({hands,scenario,offset:index*10000}));
	const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
	if(output)writeFileSync(output,JSON.stringify({results},null,2)+'\n');
	console.log(JSON.stringify({results},null,2));
	if(results.some(r=>r.failures))process.exitCode=1;
}
