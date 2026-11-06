import assert from 'node:assert/strict';
import { SHARED_NESTED_SCOPE } from './exui-shared-nested-scope.mjs';

// Select existing transport routes only; this does not select a proof policy.
export function feasibilityGatewaySelection(kind) {
  if (kind === 'complex-email-text-ui-feasibility') return {scope:SHARED_NESTED_SCOPE,options:{complexEmail:true}};
  assert(['result-columns-ui-feasibility','selector-event-row-ui-feasibility','recipient-callback-ui-feasibility'].includes(kind),'FEASIBILITY_GATEWAY_KIND');
  return {scope:'exui-ccd-event-capability-pilot',options:kind==='result-columns-ui-feasibility'?{resultColumns:true}:{recipientCallback:{invocationId:'recipient-callback-ui'}}};
}
