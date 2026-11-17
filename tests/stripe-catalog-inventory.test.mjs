import test from 'node:test';
import assert from 'node:assert/strict';
import {inventory,matchesPlan,usablePrice} from '../scripts/stripe-catalog-inventory.mjs';
const env={STRIPE_SECRET_KEY:'sk_live_SYNTHETIC_SECRET',SALES_STRIPE_ACCOUNT_ID:'acct_SYNTHETIC'};
const valid={id:'price_regular',product:'prod_basic',active:true,livemode:true,currency:'usd',unit_amount:4999,type:'recurring',billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
test('inventory verifies the authorized account before reading catalog and never sends a write',async()=>{
 const paths=[];const result=await inventory(env,async(url,init)=>{assert.equal(init.method,'GET');const path=new URL(url);paths.push(path.pathname);if(path.pathname==='/v1/account')return Response.json({id:'acct_OTHER'});throw Error('Wrong account must stop inspection');});
 assert.equal(result.status,'account_mismatch');assert.deepEqual(paths,['/v1/account']);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET|acct_OTHER|acct_SYNTHETIC/);
});
test('inventory includes existing active and inactive candidates, filters unrelated names and redacts account data',async()=>{
 const result=await inventory(env,async(url,init)=>{assert.equal(init.method,'GET');const u=new URL(url),active=u.searchParams.get('active')==='true';if(u.pathname.endsWith('/account'))return Response.json({id:'acct_SYNTHETIC',email:'private@example.test',charges_enabled:true});if(u.pathname.endsWith('/products'))return Response.json({has_more:false,data:active?[{id:'prod_basic',name:'Basic',active:true,livemode:true},{id:'prod_unrelated',name:'Private unrelated product'}]:[{id:'prod_old',name:'OliverFee 360 Pro',active:false,livemode:true}]});return Response.json({has_more:false,data:active?[valid,{...valid,id:'price_intro',unit_amount:2500}]:[{...valid,id:'price_archived',active:false}]});});
 assert.equal(result.status,'inspected');assert.equal(result.plans[0].candidates[0].prices.length,3);assert.equal(result.plans[0].candidates[0].prices[0].regularMatch,true);assert.equal(result.plans[0].candidates[0].prices[1].introMatch,true);assert.equal(result.plans[1].candidates[0].active,false);assert.doesNotMatch(JSON.stringify(result),/private@example|Private unrelated|SYNTHETIC_SECRET|acct_SYNTHETIC/);assert.equal(result.chargesCreated,0);assert.equal(result.subscriptionsChanged,0);
});
test('candidate matching and price checks reject unrelated or incompatible existing objects',()=>{
 assert.equal(matchesPlan({name:'Basic Membership'},'Basic'),true);assert.equal(matchesPlan({name:'Basic unrelated private service'},'Basic'),false);
 for(const patch of [{active:false},{livemode:false},{currency:'eur'},{unit_amount:2500},{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}},{recurring:{interval:'month',interval_count:1,usage_type:'metered'}},{transform_quantity:{divide_by:10}},{recurring:{interval:'month',interval_count:1,usage_type:'licensed',trial_period_days:30}}])assert.equal(usablePrice({...valid,...patch},4999,true),false);
});
test('missing configuration and provider errors produce no secret-bearing output',async()=>{
 assert.equal((await inventory({},()=>{throw Error('No call');})).status,'missing_configuration');
 const failed=await inventory(env,async()=>{throw Error('SYNTHETIC_SECRET private payload');});assert.equal(failed.status,'inspection_failed');assert.doesNotMatch(JSON.stringify(failed),/SYNTHETIC_SECRET|private payload/);
});
test('invalid configuration identifies only the field/type, without revealing its value or making calls',async()=>{
 for(const [key,account,field,expected] of [['pk_live_PRIVATE','acct_VALID','STRIPE_SECRET_KEY','publishable_key_in_secret_key_setting'],['sk_live_PRIVATE','not_the_account','SALES_STRIPE_ACCOUNT_ID','expected_acct_account_id'],['"sk_live_PRIVATE"','acct_VALID','STRIPE_SECRET_KEY','value_has_quote_wrapper']]){
  const result=await inventory({STRIPE_SECRET_KEY:key,SALES_STRIPE_ACCOUNT_ID:account},()=>{throw Error('No call allowed');});assert.equal(result.status,'invalid_configuration_format');assert.equal(result.fields[field],expected);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|acct_VALID|not_the_account/);
 }
});
