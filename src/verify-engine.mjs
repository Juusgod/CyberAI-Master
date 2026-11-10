/* Meaningful contract checks for the authored offline investigation simulator. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog = ['scenarios-identity.json','scenarios-systems.json'].flatMap(name => JSON.parse(fs.readFileSync(path.join(root,'src',name),'utf8')));
const context = vm.createContext({FIELDGUIDE_SCENARIOS:catalog});
vm.runInContext(fs.readFileSync(path.join(root,'dist/lab-engine.js'),'utf8'),context);
const e = context.CyberLab;
assert.equal(catalog.length,36);
assert.equal(new Set(catalog.map(item => item.id)).size,36);
assert.equal(new Set(catalog.map(item => item.title)).size,36);
assert.equal(catalog.reduce((sum,item) => sum + item.variants.length,0),108);
const expectedCounts = {'Identity & access':6,'Email & collaboration':6,'Cloud & DevOps':6,'Endpoint & network':9,'Application & data':9};
for (const [category,count] of Object.entries(expectedCounts)) assert.equal(catalog.filter(item => item.category === category).length,count);
const allowedParameters = new Set(['org','user','host','ip','domain','time','later','count','ticket','session']);
let casesTested = 0;
for (const family of catalog) {
  assert.equal(family.initial.length,3,`${family.id}: initial evidence`);
  assert.equal(family.checks.map(item => item.id).join(','),'context,activity,background');
  assert.equal(family.variants.map(item => item.disposition).sort().join(','),'lower-concern,suspicious,unresolved');
  for (const match of JSON.stringify(family).matchAll(/\{\{(.*?)\}\}/g)) assert(allowedParameters.has(match[1]),`${family.id}: unknown placeholder ${match[1]}`);
  for (const variant of family.variants) { assert.equal(variant.results.length,3); assert(variant.reasoning.length > 40); assert.equal(variant.remaining.length,2); }
  const seeds = new Map();
  for (let seed = 0; seed < 100 && seeds.size < 3; seed++) {
    const sample = e.createCase({id:family.id,seed}); seeds.set(sample.answer.disposition,seed);
  }
  assert.equal(seeds.size,3,`${family.id}: all three authored branches reachable`);
  for (const seed of seeds.values()) for (const mode of e.MODES) for (const modifier of e.MODIFIERS) {
    const c = e.createCase({id:family.id,seed,mode,modifier});
    const s = e.makeState(c);
    assert.equal(JSON.stringify(e.parseCode(c.code)),JSON.stringify(c),'case code exactly reproduces evidence');
    assert(!JSON.stringify(c).includes('{{'),'every placeholder resolved');
    assert.equal(e.reference(c,s).disposition,'unresolved','initial summary alone cannot settle the exercise');
    assert.equal(e.visibleResults(c,s).length,0);
    assert(!e.prompt(c,s).includes('R1 |'),'unopened check not leaked into prompt');
    for (const check of c.checks) assert(e.prompt(c,s).includes(check.tool) && e.prompt(c,s).includes(check.scope),'copied prompt includes the available tool scopes');
    assert.equal(c.initial.filter(item => item.injection).length,modifier === 'injection' ? 1 : 0);
    const blocked = e.performCheck(c,s,'contain');
    assert.equal(blocked.kind,'blocked'); assert.equal(s.opened.length,0); assert.equal(s.blocked,1);
    assert.throws(() => e.performCheck(c,s,'execute_shell'),'non-allowlisted tools rejected');
    e.performCheck(c,s,'context');
    assert.equal(e.performCheck(c,s,'context').kind,'duplicate'); assert.equal(s.opened.length,1);
    e.performCheck(c,s,'activity'); assert.equal(s.opened.length,2);
    const ref = e.reference(c,s);
    const usable = ['complete','injection'].includes(modifier);
    assert.equal(ref.complete,usable,'missing, stale, conflicting and failed evidence cannot complete corroboration');
    assert.equal(ref.disposition,usable ? c.answer.disposition : 'unresolved');
    if (modifier === 'timeout') assert(e.visibleResults(c,s).some(item => item.status === 'error'),'timeout spends a call with no usable result');
    assert(e.prompt(c,s).includes('R1 |') && e.prompt(c,s).includes('R2 |'));
    assert(!e.prompt(c,s).includes('R3 |'),'unopened background not leaked');
    s.assessment = ref.disposition; assert.equal(e.checkAssessment(c,s).match,true);
    s.assessment = ''; assert.equal(e.checkAssessment(c,s).empty,true);
    if (mode !== 'guided') { assert.equal(e.performCheck(c,s,'background').kind,'budget'); assert.equal(s.opened.length,2); }
    else { e.performCheck(c,s,'background'); assert.equal(s.opened.length,3); }
    const clamped = e.normalizeState(c,{opened:['context','context','evil','activity','background'],blocked:1e9,assessment:'approved',notes:{facts:'<script>not executed</script>'},reviewed:true});
    assert(clamped.opened.length <= c.maxCalls); assert.equal(new Set(clamped.opened).size,clamped.opened.length);
    assert.equal(clamped.assessment,''); assert.equal(clamped.blocked,999);
    assert.equal(clamped.notes.facts,'<script>not executed</script>');
    casesTested++;
  }
  const c = e.createCase({id:family.id,seed:2,mode:'standard',modifier:'complete'});
  const s = e.makeState(c); e.performCheck(c,s,'background'); e.performCheck(c,s,'context');
  assert.equal(e.performCheck(c,s,'activity').kind,'budget');
  assert.equal(e.reference(c,s).disposition,'unresolved','low-information check can exhaust budget without resolution');
  assert(e.reference(c,s).next.startsWith('Stop'));
}
for (const code of ['','FGL1~bad~00000000~standard~complete','FGL1~id-signin-sequence~oops~standard~complete','FGL1~id-signin-sequence~00000000~unlimited~complete','FGL1~id-signin-sequence~00000000~standard~complete~extra']) assert.throws(() => e.parseCode(code));
console.log(`PASS: ${catalog.length} distinct families, 108 authored paths, ${casesTested} mode/condition/branch combinations. Replay, evidence visibility, policy gate, budgets, timeout, uncertainty, and state validation verified.`);
