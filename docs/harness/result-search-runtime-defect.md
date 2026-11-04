# CCD result-search runtime gap

The controlled native search probe is blocked by a defect in the retained CCD datastore image. This is not catalogue satisfaction or a candidate browser failure.

## Observed boundary

- Image: `sha256:230af88ec4791950396e7a78f2dc330018d1a259242e317f4374ec5a384d30c0`.
- Application build commit: `5c5ff0b941dcbc7e661e8aa9e38dc51d7c30ffb3`, build 1118, read from the actual application JAR.
- Real definition import, generated Elasticsearch mapping/alias, three CCD case creations, persisted-row indexing and direct index readback succeed.
- The real `POST /internal/searchCases` with a configured use case returns HTTP 500 / `NumberFormatException`.
- Sanitized runtime frames locate the failure in `RoleBasedCaseDataAccessControl.generateAccessProfilesByCaseDetails`, line 82, through `AuthorisedCaseSearchOperation.getAccessProfiles`, line 227.
- Actual runtime bytecode confirms the default source projection omits internal `id`. The mapper copies that missing ID; role lookup then attempts to parse it.

## Required correction

Retain the internal case ID in the mandatory Elasticsearch projection, with a regression proving RBAC search works while preserving configured result columns and default ordering. Verify the correction against the actual image revision before rebuilding a pinned dependency.

An explicit query `_source` is unsuitable for this proof: the controller then disables the configured use case, losing the layout and sorting behaviour under test. Disabling access control or substituting legacy SQL search is also unsuitable.

A corrected dependency must have a separately recorded source revision, immutable image identity, validation and owner review. A locally patched dependency does not establish that the deployed CCD service is corrected.

## Acceptance still required

After the dependency correction, repeat actual CCD search/workbasket POSTs, then candidate browser table assertions and effective omission/binding/order faults. Observe metadata renderer types and resolve all material row facets before awarding any of the fourteen result-column requirements. Keep the original failing runtime outcome available alongside later evidence.
