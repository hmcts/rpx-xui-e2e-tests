const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

function fixture(variant, options={}) {
  const files=new Map(),cases=new Map(),listeners=[],observerRequests=[],businessTransports=[];
  let current,cya=false,pending,ordinal=0;
  const inputNode=(field,index)=>current.nodes[index][field];
  function locator(field,index=0) {
    const node=()=>inputNode(field,index);
    return {
      nth:i=>locator(field,i),last:()=>locator(field,index),
      fill:async value=>{node().value=value;},check:async()=>{node().checked=true;},
      inputValue:async()=>node().value,getAttribute:async key=>node()[key]??null,
      isChecked:async()=>Boolean(node().checked),isVisible:async()=>!node().hidden,
      isHidden:async()=>Boolean(node().hidden),count:async()=>1,
      evaluate:async fn=>fn(node()),node,
    };
  }
  function nodes(index) {
    const result={};
    for(const [field,type,label] of [['emailName','text','Name'],['emailAddress',variant==='baseline'?'text':'email','Email address'],['postalName','text','Name'],['Email','radio','Email'],['Post','radio','Post']]) {
      result[field]={id:`recipient_${index}_${field}`,type,value:type==='radio'?'on':'',checked:false,hidden:field==='postalName',labels:[{textContent:label}],classList:[]};
    }
    return result;
  }
  const caseData=()=>({protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:current.nodes.map(n=>({id:null,value:{serveByPostOrEmail:'email',emailInformation:{emailName:n.emailName.value,emailAddress:n.emailAddress.value}}}))});
  const page={
    context:()=>({clearCookies:async()=>{},addCookies:async()=>{}}),
    request:{get:async()=>({status:()=>200,json:async()=>({userInfo:{id:'fixed-actor'}})})},
    on:(name,fn)=>{assert.equal(name,'request');listeners.push(fn);},
    locator:selector=>{const field=/_(\w+)"\]$/.exec(selector)?.[1];assert(field,selector);return locator(field);},
    getByLabel:label=>locator(label),
    getByText:()=>({isVisible:async()=>cya,visible:()=>cya}),
    waitForResponse:predicate=>new Promise(resolve=>{pending={predicate,resolve};}),
    getByRole:(role,{name})=>{
      const result={last:()=>result,first:()=>result,click:async()=>{
        if(name==='Add new') {
          current.nodes.push(nodes(current.nodes.length));
          const all=current.nodes.flatMap(n=>Object.values(n));
          for(const n of all)n.ownerDocument={querySelectorAll:()=>all};
          return;
        }
        if(role==='link'){cya=false;return;}
        const submit=name==='Submit',data=caseData();
        const rejected=!submit&&variant==='email-type'&&!data.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress.includes('@');
        const route=submit?`/data/cases/${current.id}/events`:'/data/case-types/HarnessNestedPRL/validate';
        const requestBody=structuredClone({data,event:{id:'update'},token:'DO-NOT-RETAIN'});
        const request={method:()=> 'POST',url:()=>`http://harness${route}`,postDataJSON:()=>structuredClone(requestBody)};
        for(const fn of listeners)fn(request);
        current.validations+=submit?0:1;
        const body=rejected?{details:{field_errors:[{id:'sodAdditionalRecipientsList.0.emailInformation.emailAddress',message:`${data.sodAdditionalRecipientsList[0].value.emailInformation.emailAddress} is not a valid Email address`}]}}:{sequence:current.validations};
        businessTransports.push({method:'POST',upstreamPath:route.replace(/^\/data/,''),path:route,body:JSON.stringify(requestBody),response:JSON.stringify(body),status:submit?201:rejected?422:200,actorId:'fixed-actor',ordinal:businessTransports.length+1});
        const response={request:()=>request,url:()=>request.url(),status:()=>submit?201:rejected?422:200,json:async()=>body};
        cya=!rejected;
        if(rejected)current.nodes[0].emailAddress.classList=['govuk-input--error'];
        if(submit) {
          current.state.case_data=data;
          current.state.case_data.sodAdditionalRecipientsList.forEach((row,i)=>{row.id=`11111111-2222-3333-4444-5555555555${current.id.slice(-1)}${i}`;});
          current.state.version++;
          current.history.push({id:'update',user_id:'fixed-actor',case_type_id:'HarnessNestedPRL'});
        }
        assert(pending.predicate(response));pending.resolve(response);pending=undefined;
      }};
      return result;
    },
  };
  const expect=value=>({
    toMatch:expected=>assert.match(value,expected),toBe:expected=>assert.equal(value,expected),toEqual:expected=>assert.deepEqual(JSON.parse(JSON.stringify(value)),JSON.parse(JSON.stringify(expected))),
    toHaveLength:expected=>assert.equal(value.length,expected),toContain:expected=>assert(value.includes(expected)),
    toBeHidden:async()=>assert.equal(value.visible?value.visible():await value.isVisible(),false),
    toBeVisible:async()=>assert.equal(value.visible?value.visible():await value.isVisible(),true),
    toHaveAccessibleName:async expected=>assert.equal(value.node().labels[0].textContent,expected),
    toHaveAttribute:async(key,expected)=>assert.equal(value.node()[key],expected),
    toHaveValue:async expected=>assert.equal(value.node().value,expected),
    toHaveClass:async expected=>assert.match(value.node().classList.join(' '),expected),
  });
  const personas=()=>({sessions:{allowed:'private-session'},credentials:{allowed:{userId:'fixed-actor'},observer:{userId:'fixed-observer',headers:{Authorization:'OBSERVER-SECRET-CANARY'}}}});
  const ccd={ccdPersonas:personas,ccdSessionRequest:async()=>({dispose:async()=>{}}),
    createSyntheticCase:async()=>{const id=String(1234567890000000+ordinal++);cases.set(id,{id,nodes:[],validations:0,state:{id,jurisdiction:'HARNESS',case_type_id:'HarnessNestedPRL',version:1,case_data:{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]},data_classification:{}},history:[]});
      businessTransports.push({method:'POST',upstreamPath:'/caseworkers/fixed-actor/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases',path:'/data/caseworkers/fixed-actor/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases',body:JSON.stringify({data:{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]},event:{id:'create'}}),response:JSON.stringify({id}),status:201,actorId:'fixed-actor',ordinal:businessTransports.length+1});return id;},
  };
  const helpers={openUpdate:async(_page,id)=>{current=cases.get(id);cya=false;},collectionRows:async()=>current.nodes.map(n=>`Name ${n.emailName.value} Email address ${n.emailAddress.value}`)};
  const filename=path.join(__dirname,'../../src/fixtures/harnessComplexEmail.ts');
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  const fetch=async(url,request)=>{
    const route=new URL(url);assert.equal(route.origin,'http://127.0.0.1:4452');
    assert.equal(request.method,'GET');assert.equal(request.redirect,'error');
    assert.equal(request.headers.Authorization,'OBSERVER-SECRET-CANARY');
    const match=/^\/caseworkers\/fixed-observer\/jurisdictions\/HARNESS\/case-types\/HarnessNestedPRL\/cases\/(\d{16})(\/events)?$/.exec(route.pathname);assert(match);
    const c=cases.get(match[1]);assert(c);const body=structuredClone(match[2]?c.history:c.state);
    const call={ordinal:observerRequests.length+1,url,path:route.pathname,body};observerRequests.push(call);
    const result=options.observerResponse?.(call)??{status:200,body};
    if(result.error)throw Error(result.error);
    return {status:result.status,json:async()=>{if(result.jsonError)throw Error(result.jsonError);return result.body;}};
  };
  vm.runInNewContext(compiled,{module,exports:module.exports,URL,fetch,process:{env:{EXUI_CCD_EVIDENCE:'/owned'}},require:name=>{
    if(name==='node:fs')return {writeFileSync:(file,data)=>files.set(file,String(data)),appendFileSync:(file,data)=>files.set(file,(files.get(file)??'')+String(data))};
    if(name==='@playwright/test')return {expect};
    if(name==='./harnessCcd')return ccd;
    if(name==='./harnessSharedNested')return helpers;
    if(name.endsWith('exui-complex-email-classification.mjs'))return {validateComplexEmailObserver:()=>{},validateComplexEmailRecipientIds:()=>{}};
    throw Error(name);
  }},{filename});
  return {run:()=>module.exports.runComplexEmailText({page,playwright:{},variant,step:async(_name,body)=>body()}),files,observerRequests,businessTransports,
    capture:()=>module.exports.captureComplexEmailControls(page,current.nodes.length),
    alter:()=>{current.nodes[0].Email.checked=false;current.nodes[0].Post.checked=true;current.nodes[0].postalName.hidden=false;
      current.nodes[0].emailAddress.type='email';current.nodes[0].emailAddress.value='observed-changed';current.nodes[0].emailName.value='Observed name';}};
}

module.exports={fixture};
