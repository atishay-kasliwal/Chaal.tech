import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { MongoClient } from 'mongodb';
import { migrateAnalytics, readSealed, verifyStoredHands } from '../../server/analytics/store.mjs';
import { seedCharacters } from '../../server/bots/directory.mjs';
import { migrateMemory, rebuildMemory } from '../../server/bots/memory/store.mjs';
import { CHARACTER_SEEDS } from '../../server/bots/characters.mjs';
import { observedFixture } from '../server/helpers/bot-memory.mjs';
import { baseURL, origin, post, createSession, openPlayer, members, closeClub } from './club-helper.mjs';
const client=new MongoClient(process.env.CHAAL_CF_TEST_MONGO);
const db=client.db('chaal-cf-test');
test.after(async()=>{await client.close();await closeClub();});
const get=async(path,token)=>{const response=await fetch(`${baseURL}${path}`,{headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})}});return {response,body:await response.json()};};
async function until(check){for(let i=0;i<100;i++){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out awaiting memory/archive');}

test('adaptive bot memory works through owner API, real room alarms, persistence, frozen replay and member privacy', async(t)=>{
	await migrateAnalytics(db);await seedCharacters(db);await migrateMemory(db);
	const owner=await createSession({nickname:'Memory friend'});
	const guest=await createSession({nickname:'Memory guest'});
	await members.updateOne({email:owner.email},{$set:{role:'owner'}});
	assert.equal((await get('/admin/bots/memory')).response.status,401);
	assert.equal((await get('/admin/bots/memory',guest.clubToken)).response.status,403);
	assert.equal((await post('/admin/bots/memory',{token:guest.clubToken,body:{action:'rebuild',botId:'gg'}})).response.status,403);
	const botId='memory-qa';
	const manage=async body=>{const r=await post('/admin/bots',{token:owner.clubToken,body:{botId,...body}});assert.equal(r.response.status,200,JSON.stringify(r.body));return r.body;};
	const prior=(await get('/admin/bots',owner.clubToken)).body.enabledBotIds;
	t.after(async()=>{
		await post('/admin/bots',{token:owner.clubToken,body:{action:'availability',botIds:prior}});
		await manage({action:'status',status:'disabled'});
	});
	await manage({action:'create',identity:{name:'Memory QA',description:'Remembers the table.',personality:{title:'Patient friend',traits:['patient']},avatar:{mascotId:'bot-rohit-sharma'}}});
	await manage({action:'draft',config:CHARACTER_SEEDS[0].style});
	await manage({action:'validate',styleId:`${botId}@1`});
	await manage({action:'publish',styleId:`${botId}@1`});
	await manage({action:'adaptive-draft'});
	await manage({action:'validate',styleId:`${botId}@2`});
	await manage({action:'publish',styleId:`${botId}@2`});
	await manage({action:'status',status:'active'});
	await manage({action:'availability',botIds:[...prior,botId]});
	// Known, public-only historical observations in the throwaway test database.
	const at=Date.now()-86400000;
	for(let i=0;i<80;i++){
		let r=observedFixture(i,{botId,at:at+i*60000});
		r=JSON.parse(JSON.stringify(r).replaceAll('"a"',JSON.stringify(owner.playerId)));
		r._id=`cf-memory-fixture:${i}`;r.room='cf-memory-fixture';r.handId=`memory-${i}`;
		r.versions={engine:'test',recorder:2,game:'teen-patti',gameVersion:1,rulesVersion:'classic-1',variant:{id:'classic',version:1}};
		r.verified={replay:'exact',stepCount:3,botDecisions:'reproduced'};
		await db.collection('hand_records').insertOne(r);
	}
	await rebuildMemory(db,{botId});
	const profile=await get(`/bots/${botId}`,owner.clubToken);
	assert.equal(profile.body.bot.memory.hands,80);
	assert.equal((await get(`/bots/${botId}`,guest.clubToken)).body.bot.memory.hands,0);
	assert.doesNotMatch(JSON.stringify(profile.body),/confidence|opportunities|tendencies|memorySnapshot|finalProbabilities/);
	const made=await post('/rooms',{token:owner.token,body:{event:'createRoom',args:['',1000,'classic-1','teen-patti',{boot:10,autoReady:true,potLimit:64}],meta:{commandId:randomUUID()}}});
	assert.equal(made.body.ok,true,JSON.stringify(made.body));
	const host=openPlayer(owner,made.body.roomName);t.after(()=>host.ws.close());await host.open;
	await host.send('joinRoom',['Memory friend',made.body.roomName],false);
	await host.waitFor(p=>p.event==='roomData'&&p.args?.[0]?.usersList.length===1);
	assert.equal((await host.send('addBot',[botId])).ok,true);
	await host.waitFor(p=>p.event==='roomData'&&p.args?.[0]?.usersList.length===2);
	const start=await host.send('start',[made.body.roomName,0,3,'classic-1','selected']);assert.equal(start.ok,true,JSON.stringify(start));
	await host.waitFor(p=>p.event==='roomData'&&p.args?.[0]?.revision>=start.revision);
	for(let i=0;i<30 && host.view.isStarted && !host.view.gameShow;i++){
		const view=host.view;
		if(view.usersList[view.currentPlayer]?.id===owner.playerId){
			const played=await host.send('play',[false,view.legalActions.minBet]);
			assert.equal(played.ok,true,JSON.stringify(played));
			await host.waitFor(p=>p.event==='roomData'&&p.args?.[0]?.revision>=played.revision);
		}else await host.waitFor(p=>p.event==='roomData'&&p.args?.[0]?.revision>view.revision);
	}
	assert.ok(host.view.gameShow);
	const record=await until(()=>db.collection('hand_records').findOne({room:made.body.roomName}));
	const sealed=await readSealed(await db.collection('hand_sealed').findOne({_id:record._id}));
	assert.ok(sealed.botTrace.length>0);
	assert.ok(sealed.botTrace.every(t=>t.adaptive?.memoryStatus==='available'));
	assert.ok(sealed.botTrace.every(t=>t.verified==='reproduced'));
	assert.ok(sealed.steps.some(s=>s.bot?.memory?.models.some(m=>m.playerId===owner.playerId&&m.hands===80)));
	assert.doesNotMatch(JSON.stringify(record),/memorySnapshot|finalProbabilities|modelRefs/);
	await until(async()=> (await db.collection('bot_memory').findOne({botId}))?.hands===81);
	assert.equal((await verifyStoredHands(db,{filter:{_id:record._id}})).reproduced,1);
	const health=await until(async()=>{const h=(await get('/admin/bots/memory',owner.clubToken)).body;return h.bots.find(b=>b.botId===botId)?.analysis.hands ? h : null;});
	assert.equal(health.bots.find(b=>b.botId===botId).analysis.hands,1);
	assert.doesNotMatch(JSON.stringify(health),/cardsInHand|dealt|hiddenStacks|rngSeed|memorySnapshot/);
	const rebuilt=await post('/admin/bots/memory',{token:owner.clubToken,body:{action:'rebuild',botId}});
	assert.equal(rebuilt.response.status,200,JSON.stringify(rebuilt.body));

	// Exercise the rendered relationship and owner tools on both desktop and mobile.
	const onboard=await post('/me',{token:owner.clubToken,body:{profile:{nickname:'Memory friend',characterId:'owl'},onboard:true}});
	const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{channel:'chrome'})});t.after(()=>browser.close());
	const context=await browser.newContext({viewport:{width:1440,height:1000}});
	await context.addInitScript(({token,member})=>{localStorage.setItem('chaal-club-session-v1',token);localStorage.setItem('chaal-club-member-v1',JSON.stringify(member));},{token:owner.clubToken,member:onboard.body.member});
	const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
	const output=join(tmpdir(),'chaal-phase4-browser');await mkdir(output,{recursive:true});
	await page.goto(`${process.env.CHAAL_BROWSER_URL}/bots/${botId}`);
	await page.getByText(/remembers 81 hands with you/).waitFor();
	await page.screenshot({path:`${output}/relationship-desktop.png`,fullPage:true});
	await page.setViewportSize({width:390,height:844});
	assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
	await page.screenshot({path:`${output}/relationship-mobile.png`,fullPage:true});
	await page.goto(`${process.env.CHAAL_BROWSER_URL}/admin/bots`);
	await page.getByText('Memory & learning',{exact:false}).click();
	await page.getByText(`${botId}`,{exact:true}).waitFor();
	await page.screenshot({path:`${output}/memory-admin-mobile.png`,fullPage:true});
	assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
	assert.deepEqual(errors,[]);
});
