export const BalanceType={Real:'real',Demo:'demo'};export const TurboOptionsDirection={Call:'call',Put:'put'};
const subs=[];let bal={id:9,type:'real',amount:100,currency:'USD',availableForOptionsAmount(){return this.amount},subscribeOnUpdate(cb){subs.push(cb)},unsubscribeOnUpdate(){}};
export const _push=(amt)=>{bal.amount=amt;subs.forEach(f=>f(bal))};
const inst=(s)=>({activeId:1,expirationSize:s,expiredAt:new Date(Date.now()+s*1000),profitPercent:()=>85});
export const _log=[];
export class OAuthMethod{constructor(o){_log.push(['oauth',o.clientId,o.scope,!!o.tokensStorage])}}
export class ClientSdk{static async create(ws,pid,auth){_log.push(['create',ws,pid]);return new ClientSdk()}
 constructor(){this.userProfile={userId:555001,firstName:'Ada'}}
 currentTime(){return new Date()} async wsConnectionState(){return{subscribeOnStateChanged(){}}}
 async balances(){return{getBalances:()=>[{type:'demo',amount:10000},bal]}}
 async turboOptions(){return{getActives:()=>[{ticker:'EURUSD-OTC',canBeBoughtAt:()=>true,instruments:async()=>({getAvailableForBuyAt:()=>[inst(300),inst(60)]})},{ticker:'EURUSD',canBeBoughtAt:()=>true,instruments:async()=>({getAvailableForBuyAt:()=>[inst(120),inst(60)]})},{ticker:'GBPUSD',canBeBoughtAt:()=>true,instruments:async()=>({getAvailableForBuyAt:()=>[inst(60)]})}],
   buy:async(i,d,p,b)=>{_log.push(['buy',i.expirationSize,d,p,b.id]);return{id:42,expiredAt:i.expiredAt,profitIncomePercent:85,openQuoteValue:1.1}}}}
 async positions(){return{subscribeOnUpdatePosition:(cb)=>{setTimeout(()=>{cb({status:'closed',externalId:42,closeProfit:18.5,invest:10});cb({status:'closed',externalId:42,closeProfit:18.5,invest:10})},50)}}}
 async shutdown(){}}
