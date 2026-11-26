import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const react=moduleUrl(`export const useEffect=(...a)=>globalThis.__poll.effect(...a);export const useCallback=f=>f;export const useRef=v=>({current:v});export const useState=v=>[v,f=>globalThis.__poll.set(f)];`);
const api=moduleUrl(`export const loadExternalActivities=(...a)=>globalThis.__poll.load(...a);export const refreshFigmaPage=()=>{throw new Error('polling must never call Figma REST sync')};`);
const activity=moduleUrl(await readFile(new URL('../src/data/activity.ts',import.meta.url),'utf8'));
const source=(await readFile(new URL('../src/state/useFigmaActivities.ts',import.meta.url),'utf8')).replace("'react'",JSON.stringify(react)).replace("'../api/externalActivities'",JSON.stringify(api)).replace("'../data/activity'",JSON.stringify(activity));
const {useFigmaActivities}=await import(moduleUrl(source));
test('background DB polling updates Figma without refresh, skeleton flicker or changing Story/Notion/GitHub',async()=>{
 const effects=[],timers=new Map(),states=[];let id=0,loads=0;
 const project={id:'1',urls:{Figma:'https://figma.com/design/FILE'},stories:[{id:'story',sourceChangeIds:['figma:organized']}],changes:[{id:'notion:1',service:'Notion'},{id:'github:1',service:'GitHub'},{id:'figma:old',service:'Figma'}]};let projects=[project];
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 globalThis.window={setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)};
 globalThis.document={hidden:false};
 globalThis.__poll={effect:fn=>effects.push(fn),set:update=>{states.push(update({}));},load:async()=>{loads++;return [{id:'figma:new',service:'Figma'},{id:'figma:organized',service:'Figma'}];}};
 try{
  useFigmaActivities(1,project,update=>{projects=update(projects);});
  const cleanups=effects.map(fn=>fn());const timer=[...timers.values()][0];assert.equal(timer.ms,5000);
  timer.fn();for(let i=0;i<10;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,1);assert.deepEqual(projects[0].changes.map(c=>c.id),['notion:1','github:1','figma:new']);
  assert.equal(projects[0].stories,project.stories);
  assert.equal(JSON.stringify(states).includes('loading'),false);
  for(const cleanup of cleanups) cleanup?.();
 }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;delete globalThis.__poll;}
});
