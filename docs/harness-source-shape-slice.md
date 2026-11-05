# Recipient event shapes

This slice extends the source-bound `serviceOfDocuments` fixture with three distinct event override rows. It does not turn role-matrix evidence into shape coverage.

| Source context (`ServeOrgDetails`, `sodAdditionalRecipientsList`) | Runtime proof | Single changed fault facet |
| --- | --- | --- |
| `serveByPostOrEmail` | Required radio, `Served by` label, order 1, then independent CCD persistence | `DisplayContext`: `MANDATORY` → `OPTIONAL` |
| `emailInformation` | Email-only complex branch, normalized blank override label, order 2, toggling and persisted values | Condition: email → post |
| `postalInformation.postalAddress.AddressLine2` | Post-only optional child, normalized blank override label, order 9, blank then filled writes retaining the recipient ID and siblings | `DisplayContext`: `OPTIONAL` → `MANDATORY` |

All three source rows retain `LiveFrom=01/09/2024`, the exact event/collection/type/reference context, and their unchanged source facets. Only `CaseTypeID` is normalized from PRLAPPS to the disposable HarnessNestedPRL case type. Existing source role ACLs and bootstrap rows are unchanged by these faults.

The pinned definition-store revision `c37c9b84e556f22086f1eed7b94468302870eb9e` provides the consumer contract:

- `EventCaseFieldComplexTypeParser` reads LiveFrom through `DefinitionDataItem.getLocalDate`, storing it on `EventComplexTypeEntity`.
- `DefinitionDataItem.getDate` accepts a typed workbook date and rejects a non-date value. The Harness serializer writes source dates as Excel numeric date cells.
- `EntityToResponseDTOMapper.EventComplexTypeEntityToCaseEventFieldComplexListMapper` emits reference, label, order, display context and show condition, but does not emit LiveFrom. No temporal UI behavior is claimed.
- `DefinitionDataItem.getString` trims a source blank label to the empty string. Candidate override handling must retain the underlying field label for an empty override; an invented blank rendered label is not the contract.

Actual imported definition assertions bind the selected row's reference, normalized label, order, context and condition before execution. Canonical fixture bytes and importer success bind the import-only date. Candidate proofs use the courtadmin's own session, verify its identity and role vector, and read persisted state/history independently. Faults must demonstrate their effect and a successful write before reaching their named failing oracle. A failed applicability check cannot earn mutation credit.

Static tests and generated fixtures do not establish runtime acceptance. All three baseline proofs and their exact effective faults must execute against the same sealed candidate and independently captured CCD imports before catalogue evidence can be accepted. These synthetic source shapes do not establish deployed PRL behavior, business callback semantics, search behavior or full release approval.
