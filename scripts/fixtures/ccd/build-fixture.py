import json, pathlib, hashlib, subprocess, sys
root=pathlib.Path(sys.argv[1])
out=pathlib.Path(__file__).resolve().parent
revision='694b9951e94369f1394380506960c4f04f25755d'
def load(p): return json.loads(subprocess.check_output(['git','-C',str(root),'show',revision+':definitions/private-law/json/'+p]))
ct='HarnessNestedPRL'; jur='HARNESS'; live='01/01/2020'; common={'LiveFrom':live,'CaseTypeID':ct}
complexes=[r for r in load('ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json') if r['ID'] in ['ServeOrgDetails','EmailInformation','PostalInformation']]
fields=[dict(r,CaseTypeID=ct) for r in load('CaseField/ServiceOfDocuments/CaseField.json') if r['ID']=='sodAdditionalRecipientsList']
fields += [dict(common,ID='protectedValue',Label='Protected value',FieldType='Text',SecurityClassification='Public')]
lists=[r for r in load('FixedLists.json') if r['ID']=='DeliveryByEnum']
elements=[dict(r,CaseTypeID=ct,CaseEventID='create') for r in load('CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json') if r['ID'] in ['ServeOrgDetails','EmailInformation','PostalInformation']]
sheets={'Jurisdiction':[{'LiveFrom':live,'ID':jur,'Name':'Disposable Harness','Description':'Synthetic isolated CCD'}], 'CaseType':[{'LiveFrom':live,'ID':ct,'Name':'Harness nested PRL','Description':'Source-backed nested configuration','JurisdictionID':jur,'SecurityClassification':'Public'}], 'CaseField':fields,'ComplexTypes':complexes,'FixedLists':lists,'State':[dict(common,ID='Created',Name='Created')], 'CaseEvent':[dict(common,ID='create',Name='Create synthetic case',PostConditionState='Created',SecurityClassification='Public',ShowSummary='Y'),dict(common,ID='update',Name='Update synthetic case',**{'PreConditionState(s)':'Created','PostConditionState':'Created','SecurityClassification':'Public','ShowSummary':'Y'})]}
sheets['CaseEventToFields']=[dict(common,CaseEventID=e,CaseFieldID=f['ID'],DisplayContext=('COMPLEX' if f['ID']=='sodAdditionalRecipientsList' else 'OPTIONAL'),PageID='recipient',PageLabel='Recipient details',PageDisplayOrder=1,PageColumnNumber=1,FieldDisplayOrder=i+1,ShowSummaryChangeOption='Y') for e in ['create','update'] for i,f in enumerate(fields)]
sheets['EventToComplexTypes']=elements+[dict(r,CaseEventID='update') for r in elements]
roles=['caseworker-harness-allowed','caseworker-harness-observer']
sheets['AuthorisationCaseType']=[dict(common,UserRole=r,CRUD='CRUD') for r in roles]
sheets['AuthorisationCaseState']=[dict(common,CaseStateID='Created',UserRole=r,CRUD='CRUD') for r in roles]
sheets['AuthorisationCaseEvent']=[dict(common,CaseEventID=e,UserRole=r,CRUD='CRU') for r in roles for e in ['create','update']]
sheets['AuthorisationComplexType']=[dict(common,CaseFieldID='sodAdditionalRecipientsList',ListElementCode=(('emailInformation.' if c['ID']=='EmailInformation' else 'postalInformation.' if c['ID']=='PostalInformation' else '')+c['ListElementCode']),UserRole=r,CRUD='CRUD') for r in roles for c in complexes]
sheets['AuthorisationCaseField']=[dict(common,CaseFieldID=f['ID'],UserRole=r,CRUD='CRUD') for r in roles for f in fields]
sheets['CaseTypeTab']=[dict(common,TabID='details',TabLabel='Details',TabDisplayOrder=1,CaseFieldID=f['ID'],TabFieldDisplayOrder=i+1) for i,f in enumerate(fields)]

for sheet in ['SearchInputFields','SearchResultFields','WorkBasketInputFields','WorkBasketResultFields']:
 sheets[sheet]=[dict(common,CaseFieldID='protectedValue',Label='Protected value',DisplayOrder=1)]
sheets['UserProfile']=[{'UserIDAMId':'observer@harness.example.com','WorkBasketDefaultJurisdiction':jur,'WorkBasketDefaultCaseType':ct,'WorkBasketDefaultState':'Created'}]
provenance={'sourceRevision':revision,'sourceRepository':'hmcts/prl-ccd-definitions','sourcePaths':['definitions/private-law/json/'+p for p in ['ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json','CaseField/ServiceOfDocuments/CaseField.json','FixedLists.json','CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json']],'adaptations':['Dedicated HARNESS jurisdiction and HarnessNestedPRL case type','Synthetic create/update events with real CCD RBAC allowed and observer ACLs; denied persona has no ACL','Source ServeOrgDetails, EmailInformation, PostalInformation and DeliveryByEnum preserved','No business callbacks imported; protectedValue added for integrity witness','Synthetic collection ACL permits CRUD for allowInsert/allowUpdate/allowDelete; no PRL auth-policy equivalence claim'],'featureSignature':'Collection<ServeOrgDetails{serveByPostOrEmail:FixedRadioList,emailInformation:EmailInformation{emailName:Text,emailAddress:Text},postalInformation:PostalInformation}>; conditional email/postal; nested-complex CYA'}
(out/'nested-prl.json').write_text(json.dumps({'provenance':provenance,'sheets':sheets},indent=2)+'\n')
# Same OOXML serialization, extracted for additive source-bound fixtures.
from workbook import write_workbook
write_workbook(sheets,out/'nested-prl.xlsx')
print(len(complexes),len(lists),len(elements))

binding={'schemaVersion':1,'sourceDigest':'sha256:'+hashlib.sha256((out/'nested-prl.json').read_bytes()).hexdigest(),'workbookDigest':'sha256:'+hashlib.sha256((out/'nested-prl.xlsx').read_bytes()).hexdigest()}
(out/'nested-prl.binding.json').write_text(json.dumps(binding,indent=2)+'\n')
