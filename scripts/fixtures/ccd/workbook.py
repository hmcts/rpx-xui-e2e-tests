"""Existing minimal OOXML serialization; new fixtures can opt into fixed ZIP metadata."""
import datetime
import json
import pathlib
import re
import sys
import zipfile
import xml.sax.saxutils as xml

def write_workbook(sheets, destination, deterministic=False):
 ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
 with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as z:
  def write(name, data):
   if deterministic:
    entry=zipfile.ZipInfo(name,(2020,1,1,0,0,0)); entry.compress_type=zipfile.ZIP_DEFLATED; entry.external_attr=0o600<<16
    z.writestr(entry,data)
   else: z.writestr(name,data)
  empty_headers={
  'AuthorisationComplexType':['LiveFrom','CaseTypeID','CaseFieldID','ListElementCode','UserRole','CRUD'],
  'ComplexTypes':['LiveFrom','ID','ListElementCode','FieldType','FieldTypeParameter','ElementLabel','SecurityClassification'],
  'FixedLists':['LiveFrom','ID','ListElementCode','ListElement'],
  'EventToComplexTypes':['LiveFrom','CaseTypeID','CaseEventID','CaseFieldID','ListElementCode','DisplayContext'],
  'SearchInputFields':['LiveFrom','CaseTypeID','CaseFieldID','Label','DisplayOrder'],
  'WorkBasketInputFields':['LiveFrom','CaseTypeID','CaseFieldID','Label','DisplayOrder'],
  }
  names=[n for n,r in sheets.items() if r or (n in empty_headers and r==[])]
  write('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+''.join('<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'%i for i in range(1,len(names)+1))+'</Types>')
  write('xl/styles.xml','<styleSheet xmlns="'+ns+'"><fonts count="1"><font/></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>')
  write('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  write('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join('<sheet name="%s" sheetId="%d" r:id="rId%d"/>'%(n,i,i) for i,n in enumerate(names,1))+'</sheets></workbook>')
  write('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+''.join('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>'%(i,i) for i in range(1,len(names)+1))+'</Relationships>')
  for i,n in enumerate(names,1):
   rows=sheets[n]; headers=(list(dict.fromkeys(k for r in rows for k in r)) if rows else empty_headers[n]); data=[[n],["Source-backed synthetic Harness definition"],headers]+[[r.get(k,'') for k in headers] for r in rows]
   write('xl/worksheets/sheet%d.xml'%i,'<worksheet xmlns="'+ns+'"><sheetData>'+''.join('<row r="%d">'%ri+''.join(('<c r="'+chr(65+ci)+str(ri)+'" s="1" t="n"><v>'+str((datetime.datetime.strptime(c,'%d/%m/%Y')-datetime.datetime(1899,12,30)).days)+'</v></c>' if re.fullmatch(r'\d{2}/\d{2}/\d{4}',str(c)) else '<c r="'+chr(65+ci)+str(ri)+'" t="str"><v>'+xml.escape(str(c))+'</v></c>') for ci,c in enumerate(row) if c!='')+'</row>' for ri,row in enumerate(data,1))+'</sheetData></worksheet>')

if __name__ == '__main__':
 if len(sys.argv) != 3: raise SystemExit(2)
 write_workbook(json.loads(pathlib.Path(sys.argv[1]).read_text())['sheets'], pathlib.Path(sys.argv[2]), deterministic=True)
