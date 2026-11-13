// Fake DOM only. Values deliberately differ from source expectations to prove measurement.
exports.capturePage = () => {
  const model = {inputs:[],groups:[],complexes:[],legends:[],buttons:[],markers:[],errors:[],tables:[],calls:[]};
  const node = (properties={}) => ({id:'',type:'text',value:'',checked:false,textContent:'',children:[],labels:[],visible:true,
    closest(){return this.fieldScope ?? null;},
    getAttribute(name){return this.attributes?.[name] ?? null;},
    getClientRects(){return this.visible ? [{width:20,height:10}] : [];},
    querySelectorAll(selector){return this.select?.[selector] ?? [];},...properties});
  const document = {getElementById:id=>model.markers.find(row=>row.id===id) ?? null,defaultView:{getComputedStyle:element=>({visibility:element.visibility ?? 'visible'})},querySelectorAll(selector){
    if(selector==='input')return model.inputs;
    if(selector==='button')return model.buttons;
    if(selector==='.error-summary, .govuk-error-summary')return model.errors;
    if(selector==='table.collection-field-table')return model.tables;
    if(selector.startsWith('[id="sodAdditionalRecipients"]'))return model.groups;
    if(selector==='div.form-group[id$="_emailInformation"]')return model.complexes;
    if(selector.startsWith('div.form-group'))return model.legends;
    if(selector.startsWith('input'))return model.inputs.filter(element=>{
      if(selector.includes('checkbox'))return element.id.startsWith('sodAdditionalRecipients') && !element.id.includes('sodAdditionalRecipientsList');
      if(selector.includes('serveByPostOrEmail')){
        const suffix=selector.match(/id\$="([^"]+)"/);if(suffix)return element.type==='radio'&&element.id.endsWith(suffix[1]);
        return element.id.includes('serveByPostOrEmail') && element.attributes?.value===(selector.includes('"email"')?'email':'post');
      }
      const suffix=selector.match(/id\$="([^"]+)"/)[1];return element.id.endsWith(suffix);
    });
    throw Error('unhandled fake selector');
  }};
  const body=node({ownerDocument:document,querySelectorAll:selector=>{if(selector!=='*')throw Error('unhandled body selector');return model.markers;}});
  const page={locator(selector){
    if(selector==='body')return{async evaluate(fn){const result=fn(body);model.afterBody?.();return result;}};
    const match=selector.match(/^input\[id="([a-zA-Z0-9_-]+)"\]$/);if(!match)throw Error('unhandled page selector');
    return{async count(){model.calls.push({method:'count',id:match[1]});return model.inputs.filter(row=>row.id===match[1]).length;},async ariaSnapshotJSON(options){model.calls.push({method:'ariaSnapshotJSON',id:match[1],options});model.beforeAria?.();const rows=model.inputs.filter(row=>row.id===match[1]);if(rows.length!==1)throw Error('missing nonwaiting target');return rows[0].ariaSnapshot??[{role:'textbox',name:'Synthetic recorded name',text:'private-canary',ref:'private-canary'}];}};
  }};
  return{model,node,page};
};
