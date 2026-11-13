import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

const shapes = ['recipient-collection', 'case-field-recipient-selector', 'required-delivery-radio', 'conditional-email-complex', 'postal-recipient-name', 'optional-postal-line-two'] as const;
type Shape = typeof shapes[number];
const stages = ['case-opened','event-opened','singular-form','singular-cya','collection-cya','collection-reopened','radio-unselected','first-continue','email-selected','post-selected','email-returned','email-filled','post-filled','cya','selector-reopened','line2-reopened','line2-filled','second-cya'] as const;
type Stage = typeof stages[number];
const responses = ['bootstrap','user-details','case-opened','event-opened','submit','collection-reopened','selector-reopened','line2-case-reopened','line2-event-reopened','second-submit'] as const;
type ResponseId = typeof responses[number];
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
function requireCapture(value: unknown): asserts value {
  if (!value) throw new Error('SOURCE_SHAPE_CAPTURE_INVALID');
}
// Bound private JSON without silently dropping undefined, prototypes or non-finite values.
function safeJson(value: unknown, depth = 0): asserts value is Json {
  requireCapture(depth <= 24);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { requireCapture(value.length <= 4096); return; }
  if (typeof value === 'number') { requireCapture(Number.isFinite(value)); return; }
  requireCapture(typeof value === 'object');
  if (Array.isArray(value)) { requireCapture(value.length <= 256); requireCapture(Object.keys(value).length === value.length);
    for (let index=0;index<value.length;index++) { requireCapture(Object.hasOwn(value,index)); safeJson(value[index],depth+1); }
    return; }
  requireCapture(Object.getPrototypeOf(value) === Object.prototype);
  requireCapture(Object.keys(value).length <= 64);
  for (const [key,row] of Object.entries(value)) {
    requireCapture(!['__proto__','constructor','prototype'].includes(key)); safeJson(row,depth+1);
  }
}

// Executed in the page. Read only fixed source fields; no errors, headers or user-info text.
export function measureSourceShapeDom(body: HTMLElement) {
  const document = body.ownerDocument;
  const visible = (element: Element) => {
    const style = document.defaultView!.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && Array.from(element.getClientRects()).some(rect=>rect.width > 0 && rect.height > 0);
  };
  const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g,' ').trim();
  const selectors = {
    selector: 'input[type="checkbox"][id*="sodAdditionalRecipients"]:not([id*="sodAdditionalRecipientsList"])',
    email: 'input[type="radio"][id$="_serveByPostOrEmail-email"]',
    post: 'input[type="radio"][id$="_serveByPostOrEmail-post"]',
    emailName: 'input[id$="_emailName"]', emailAddress: 'input[id$="_emailAddress"]',
    postalName: 'input[id$="_postalName"]', AddressLine1: 'input[id$="AddressLine1"]',
    AddressLine2: 'input[id$="AddressLine2"]', AddressLine3: 'input[id$="AddressLine3"]',
    PostTown: 'input[id$="PostTown"]', County: 'input[id$="County"]', Country: 'input[id$="Country"]', PostCode: 'input[id$="PostCode"]',
  };
  const selected = new Map<Element,string>();
  const fields = Object.fromEntries(Object.entries(selectors).map(([field,selector]) => {
    const nodes = Array.from(document.querySelectorAll<HTMLInputElement>(selector)).filter(element=>{
      if (field === 'email' || field === 'post') return /^sodAdditionalRecipientsList(?:_\d+)?_serveByPostOrEmail-(?:email|post)$/.test(element.id);
      return field === 'selector' ? element.id.startsWith('sodAdditionalRecipients') && !element.id.includes('sodAdditionalRecipientsList') : element.id.startsWith('sodAdditionalRecipientsList');
    });
    return [field,nodes.map(element => {
      selected.set(element,field);
      return {id:element.id,type:element.type,visible:visible(element),checked:element.checked,value:element.value,
        accessibleRole:null as 'textbox' | 'radio' | null,accessibleName:null as string | null,
        labels:Array.from(element.labels ?? []).map(text),ariaLabel:element.getAttribute('aria-label'),
        labelledBy:(element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).map(id=>({id,text:document.getElementById(id)?.textContent ?? null}))};
    })];
  }));
  const fieldGroups = Array.from(document.querySelectorAll('[id="sodAdditionalRecipients"],[id$="_serveByPostOrEmail"]')).map(element => ({
    id:element.id, labels:Array.from(element.querySelectorAll('label,legend,h1,h2,h3')).map(label=>({text:text(label),visible:visible(label)})),
  }));
  const markers = (value: string, exact = true) => {
    const matches = (element: Element) => exact ? text(element) === value : text(element).includes(value);
    return Array.from(body.querySelectorAll('*')).filter(element => matches(element) && !Array.from(element.children).some(matches)).map(element=>({visible:visible(element)}));
  };
  return {
    fields, fieldGroups,
    order:Array.from(document.querySelectorAll('input')).filter(element=>selected.has(element)).map(element=>({field:selected.get(element)!,id:element.id})),
    emailComplexes:Array.from(document.querySelectorAll('div.form-group[id$="_emailInformation"]')).map(element=>({id:element.id,visible:visible(element),legends:Array.from(element.querySelectorAll(':scope > fieldset > legend')).map(legend=>({text:text(legend),visible:visible(legend)}))})),
    emailLegends:Array.from(document.querySelectorAll('div.form-group[id$="_emailInformation"] > fieldset > legend')).map(element=>({text:text(element),visible:visible(element)})),
    addNew:Array.from(document.querySelectorAll('button')).filter(element=>text(element)==='Add new').map(element=>({visible:visible(element)})),
    cya:markers('Check your answers',false), control:markers('synthetic-source-shape-control'),
    sourceText:Array.from(body.querySelectorAll('*')).filter(element => [
      'Synthetic singular recipient','singular-recipient@harness.example.com',
      'Select additional recipients who needs to be served','Harness changed recipient selector',
      'Served by','Served by (Optional)',
    ].includes(text(element)) && !Array.from(element.children).some(child=>text(child)===text(element))).map(element=>({text:text(element),visible:visible(element),id:element.id,
      fieldId:element.closest('[id="sodAdditionalRecipients"],[id^="sodAdditionalRecipients_"],[id^="sodAdditionalRecipientsList"]')?.id ?? null})),
    errors:Array.from(document.querySelectorAll('.error-summary, .govuk-error-summary')).map(element=>({visible:visible(element)})),
    collections:Array.from(document.querySelectorAll('table.collection-field-table')).map(table=>({visible:visible(table),rows:Array.from(table.querySelectorAll(':scope > tbody > tr')).map(row=>({text:text(row),visible:visible(row),leaves:[row,...Array.from(row.querySelectorAll('*'))].filter(element=>text(element)!==''&&!Array.from(element.children).some(child=>text(child)===text(element))).map(element=>({text:text(element),visible:visible(element)})),cells:Array.from(row.querySelectorAll(':scope > td')).map(cell=>({text:text(cell),visible:visible(cell)}))}))})),
  };
}

export function sourceShapeCapture(shape: Shape, userInfo: unknown, caseId: string, mutation?: string) {
  requireCapture(shapes.includes(shape) && /^\d{16}$/.test(caseId));
  requireCapture(mutation === undefined || mutation === `ccd-shape-${shape}`);
  const common: Stage[] = ['case-opened','event-opened'];
  const flow: Record<Shape,Stage[]> = {
    'recipient-collection':mutation ? ['singular-form','singular-cya'] : ['collection-cya','collection-reopened'],
    'case-field-recipient-selector':['email-filled','cya','selector-reopened'],
    'required-delivery-radio':['radio-unselected','first-continue',...(!mutation ? ['email-filled' as const] : []),'cya'],
    'conditional-email-complex':['email-selected','post-selected',...(mutation ? ['post-filled' as const] : ['email-returned' as const,'email-filled' as const]),'cya'],
    'postal-recipient-name':['email-selected','post-selected','post-filled','cya'],
    'optional-postal-line-two':['email-selected','post-selected','post-filled','cya','line2-reopened','line2-filled','second-cya'],
  };
  const expectedStages = [...common,...flow[shape]];
  const expectedResponses: ResponseId[] = ['bootstrap','user-details','case-opened','event-opened','submit',
    ...(shape === 'recipient-collection' && !mutation ? ['collection-reopened' as const] : []),
    ...(shape === 'case-field-recipient-selector' ? ['selector-reopened' as const] : []),
    ...(shape === 'optional-postal-line-two' ? ['line2-case-reopened' as const,'line2-event-reopened' as const,'second-submit' as const] : []),
  ];
  requireCapture(userInfo && typeof userInfo === 'object');
  const user = userInfo as {id?:unknown;uid?:unknown;roles?:unknown};
  requireCapture(user.id === undefined || user.uid === undefined || user.id === user.uid);
  const id = user.id ?? user.uid;
  requireCapture(typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id));
  const roles = user.roles;
  requireCapture(Array.isArray(roles) && JSON.stringify([...roles].sort()) === JSON.stringify(['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin']));
  const value = {schemaVersion:3,kind:'source-shape-ui-observation',shape,actor:{id,roles:[...roles] as string[]},caseId,
    stages:[] as {id:Stage;dom:ReturnType<typeof measureSourceShapeDom>}[],responses:[] as {id:ResponseId;status:number}[],readbacks:[] as {id:'collection-reopened';observation:Json}[]};
  const snapshot = () => { safeJson(value); requireCapture(Buffer.byteLength(JSON.stringify(value)) <= 512 * 1024); return structuredClone(value); };
  return {
    async stage(stage: Stage, page: Page) {
      requireCapture(stages.includes(stage) && expectedStages[value.stages.length] === stage);
      const dom = await page.locator('body').evaluate(measureSourceShapeDom);
      safeJson(dom);
      requireCapture(Object.keys(dom).sort().join(',') === 'addNew,collections,control,cya,emailComplexes,emailLegends,errors,fieldGroups,fields,order,sourceText');
      // Finite source-asserted textboxes and radio channels; preserve raw DOM values.
      // AI JSON mode resolves locally and throws immediately if an element disappeared.
      for (const field of ['emailName','postalName','AddressLine2','email','post'] as const) {
        for (const row of dom.fields[field]) {
          if (!row.visible) continue;
          requireCapture(/^[a-zA-Z0-9_-]+$/.test(row.id));
          const target = page.locator(`input[id="${row.id}"]`);
          requireCapture(await target.count() === 1);
          const observed: unknown = await target.ariaSnapshotJSON({mode:'ai',depth:1});
          requireCapture(Array.isArray(observed) && observed.length === 1);
          const node = observed[0] as Record<string,unknown>;
          requireCapture(node && typeof node === 'object' && node.role === (field === 'email' || field === 'post' ? 'radio' : 'textbox'));
          requireCapture(Object.keys(node).every(key=>['role','name','checked','text','disabled','active','invalid','placeholder','ref','cursor','ariaHidden','children'].includes(key)));
          requireCapture(node.ariaHidden !== true && (node.children === undefined || Array.isArray(node.children) && node.children.length === 0));
          requireCapture(node.name === undefined || typeof node.name === 'string' && node.name.length <= 4096);
          if (field === 'email' || field === 'post') {
            requireCapture(node.checked === undefined || typeof node.checked === 'boolean');
            requireCapture((node.checked === true) === row.checked);
          }
          row.accessibleRole = node.role as 'textbox' | 'radio';
          row.accessibleName = node.name as string | undefined ?? '';
        }
      }
      value.stages.push({id:stage,dom}); snapshot();
    },
    response<T extends {status():number}>(responseId: ResponseId, response: T): T {
      requireCapture(responses.includes(responseId) && expectedResponses[value.responses.length] === responseId);
      const status = response.status(); requireCapture(Number.isInteger(status) && status >= 100 && status <= 599);
      value.responses.push({id:responseId,status}); return response;
    },
    readback(readbackId: 'collection-reopened', observation: unknown) {
      requireCapture(shape === 'recipient-collection' && readbackId === 'collection-reopened' && value.readbacks.length === 0);
      safeJson(observation); value.readbacks.push({id:readbackId,observation:structuredClone(observation)}); snapshot();
    },
    snapshot,
    save(directory: string) {
      requireCapture(path.isAbsolute(directory) && fs.realpathSync(directory) === directory);
      requireCapture(value.stages.length === expectedStages.length && value.responses.length === expectedResponses.length);
      requireCapture(value.readbacks.length === (shape === 'recipient-collection' && !mutation ? 1 : 0));
      const bytes = JSON.stringify(snapshot(),null,2);
      fs.writeFileSync(path.join(directory,`source-shape-${shape}-ui-observation.json`),bytes,{flag:'wx',mode:0o600});
    },
  };
}
export type SourceShapeCapture = ReturnType<typeof sourceShapeCapture>;
