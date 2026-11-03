import json, pathlib, zipfile, xml.sax.saxutils as xml, hashlib, subprocess, datetime, re, sys
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
# Minimal OOXML workbook uses string cells: no dependency or external-link parts.
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
with zipfile.ZipFile(out/'nested-prl.xlsx','w',zipfile.ZIP_DEFLATED) as z:
 names=[n for n,r in sheets.items() if r]
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+''.join('<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'%i for i in range(1,len(names)+1))+'</Types>')
 z.writestr('xl/styles.xml','<styleSheet xmlns="'+ns+'"><fonts count="1"><font/></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
 z.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join('<sheet name="%s" sheetId="%d" r:id="rId%d"/>'%(n,i,i) for i,n in enumerate(names,1))+'</sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+''.join('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>'%(i,i) for i in range(1,len(names)+1))+'</Relationships>')
 for i,n in enumerate(names,1):
  rows=sheets[n]; headers=list(dict.fromkeys(k for r in rows for k in r)); data=[[n],["Source-backed synthetic Harness definition"],headers]+[[r.get(k,'') for k in headers] for r in rows]
  z.writestr('xl/worksheets/sheet%d.xml'%i,'<worksheet xmlns="'+ns+'"><sheetData>'+''.join('<row r="%d">'%ri+''.join(('<c r="'+chr(65+ci)+str(ri)+'" s="1" t="n"><v>'+str((datetime.datetime.strptime(c,'%d/%m/%Y')-datetime.datetime(1899,12,30)).days)+'</v></c>' if re.fullmatch(r'\d{2}/\d{2}/\d{4}',str(c)) else '<c r="'+chr(65+ci)+str(ri)+'" t="str"><v>'+xml.escape(str(c))+'</v></c>') for ci,c in enumerate(row) if c!='')+'</row>' for ri,row in enumerate(data,1))+'</sheetData></worksheet>')
print(len(complexes),len(lists),len(elements))

binding={'schemaVersion':1,'sourceDigest':'sha256:'+hashlib.sha256((out/'nested-prl.json').read_bytes()).hexdigest(),'workbookDigest':'sha256:'+hashlib.sha256((out/'nested-prl.xlsx').read_bytes()).hexdigest()}
(out/'nested-prl.binding.json').write_text(json.dumps(binding,indent=2)+'\n')
