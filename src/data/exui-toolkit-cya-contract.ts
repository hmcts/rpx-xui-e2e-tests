import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

type ToolkitCaseField = {
  id: string;
  label?: string | null;
  value?: unknown;
  hidden?: boolean;
  display_context?: string;
  parent?: ToolkitCaseField;
  show_condition?: string | null;
  field_type: {
    id: string;
    type: string;
    complex_fields?: ToolkitCaseField[];
    collection_field_type?: {
      id: string;
      type: string;
      complex_fields?: ToolkitCaseField[];
    };
  };
};

export type ToolkitCyaRow = {
  fieldId: string;
  hidden: boolean;
  value: unknown;
};

export type Exui4493ToolkitContractEvidence = {
  toolkitAvailable: boolean;
  webappRoot: string;
  toolkitPackageVersion: string;
  toolkitBundlePath: string;
  unavailableReason?: string;
  requiredSourceMarkers: readonly string[];
  missingSourceMarkers: readonly string[];
  rows: readonly ToolkitCyaRow[];
  requiredVisibleFieldIds: readonly string[];
  missingVisibleFieldIds: readonly string[];
};

export type Exui4493ToolkitAvailability = {
  available: boolean;
  webappRoot: string;
  packagePath: string;
  reason?: string;
};

type ReadFieldsFilterPipeConstructor = new () => {
  transform(
    complexField: ToolkitCaseField,
    keepEmpty?: boolean,
    index?: number,
    setupHidden?: boolean,
    formGroup?: unknown,
    path?: string,
    idPrefix?: string
  ): ToolkitCaseField[];
};

const REQUIRED_TOOLKIT_SOURCE_MARKERS = [
  "findAncestorOfType",
  "getCollectionItemValue",
  "resolveCollectionConditionalShowContext"
] as const;

const REQUIRED_VISIBLE_FIELD_IDS = ["emailName", "emailAddress"] as const;

function resolveWebappRoot(): string {
  return resolve(process.env.XUI_WEBAPP_ROOT ?? join(process.cwd(), "..", "rpx-xui-webapp"));
}

export function resolveExui4493ToolkitAvailability(): Exui4493ToolkitAvailability {
  const webappRoot = resolveWebappRoot();
  const packagePath = join(webappRoot, "node_modules", "@hmcts", "ccd-case-ui-toolkit", "package.json");

  if (!existsSync(packagePath)) {
    return {
      available: false,
      webappRoot,
      packagePath,
      reason: `Cannot find installed @hmcts/ccd-case-ui-toolkit package at ${packagePath}. Run yarn install in rpx-xui-webapp or set XUI_WEBAPP_ROOT.`
    };
  }

  return {
    available: true,
    webappRoot,
    packagePath
  };
}

function loadToolkitPackage(webappRoot: string): { version: string; bundlePath: string; bundleSource: string } {
  const packagePath = join(webappRoot, "node_modules", "@hmcts", "ccd-case-ui-toolkit", "package.json");
  if (!existsSync(packagePath)) {
    throw new Error(
      `Cannot find installed @hmcts/ccd-case-ui-toolkit package at ${packagePath}. Run yarn install in rpx-xui-webapp or set XUI_WEBAPP_ROOT.`
    );
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string; module?: string };
  const bundlePath = resolve(dirname(packagePath), packageJson.module ?? "fesm2022/hmcts-ccd-case-ui-toolkit.mjs");
  if (!existsSync(bundlePath)) {
    throw new Error(`Cannot find @hmcts/ccd-case-ui-toolkit bundle at ${bundlePath}`);
  }

  return {
    version: packageJson.version ?? "unknown",
    bundlePath,
    bundleSource: readFileSync(bundlePath, "utf8")
  };
}

function extractReadFieldsFilterPipe(bundleSource: string): string {
  const start = bundleSource.indexOf("class ReadFieldsFilterPipe {");
  if (start < 0) {
    throw new Error("Cannot find ReadFieldsFilterPipe class in installed @hmcts/ccd-case-ui-toolkit bundle");
  }

  const angularStaticStart = bundleSource.indexOf("    static ɵfac", start);
  if (angularStaticStart < 0) {
    throw new Error("Cannot isolate ReadFieldsFilterPipe from Angular static metadata");
  }

  return `${bundleSource.slice(start, angularStaticStart)}\n}`;
}

function buildShowConditionShim(): { getInstance(condition: string): { match(fields: Record<string, unknown>): boolean } } {
  return {
    getInstance(condition: string) {
      return {
        match(fields: Record<string, unknown>): boolean {
          const [, rawFieldReference, expectedValue] = condition.match(/^\s*([^=!]+)\s*=\s*"([^"]*)"\s*$/) ?? [];
          if (!rawFieldReference) {
            return false;
          }

          const fieldReference = rawFieldReference.trim();
          const directValue = resolveFieldReference(fields, fieldReference);
          const tailValue = resolveFieldReference(fields, fieldReference.split(".").at(-1) ?? fieldReference);
          return directValue === expectedValue || tailValue === expectedValue;
        }
      };
    }
  };
}

function resolveFieldReference(fields: Record<string, unknown>, fieldReference: string): unknown {
  return fieldReference.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, fields);
}

function loadReadFieldsFilterPipe(bundleSource: string): ReadFieldsFilterPipeConstructor {
  const pipeSource = extractReadFieldsFilterPipe(bundleSource);
  const context = {
    CaseField: class CaseField {},
    FieldsUtils: {
      cloneObject(value: unknown): unknown {
        return structuredClone(value);
      },
      isValidDisplayContext(value: unknown): boolean {
        return typeof value === "string" && value.length > 0;
      }
    },
    ShowCondition: buildShowConditionShim(),
    plainToClassFromExist(instance: Record<string, unknown>, value: Record<string, unknown>): Record<string, unknown> {
      return Object.assign(instance, value);
    }
  };

  return vm.runInNewContext(`${pipeSource}\nReadFieldsFilterPipe;`, context) as ReadFieldsFilterPipeConstructor;
}

function buildTextField(id: string, showCondition: string, value: string): ToolkitCaseField {
  return {
    id,
    label: id,
    display_context: "MANDATORY",
    hidden: false,
    show_condition: showCondition,
    value,
    field_type: {
      id: "Text",
      type: "Text",
      complex_fields: []
    }
  };
}

function buildPrlServiceOfDocumentsNestedComplexFixture(): ToolkitCaseField {
  const showCondition = 'sodAdditionalRecipientsList.serveByPostOrEmail="email"';
  const emailName = buildTextField("emailName", showCondition, "Example organisation");
  const emailAddress = buildTextField("emailAddress", showCondition, "example.organisation@example.invalid");
  const nestedComplexField: ToolkitCaseField = {
    id: "emailInformation",
    label: "Email information",
    display_context: "COMPLEX",
    hidden: false,
    value: {
      emailName: emailName.value,
      emailAddress: emailAddress.value
    },
    field_type: {
      id: "EmailInformation",
      type: "Complex",
      complex_fields: [emailName, emailAddress]
    }
  };
  const collectionItem: ToolkitCaseField = {
    id: "0",
    value: {
      serveByPostOrEmail: "email",
      emailInformation: nestedComplexField.value
    },
    field_type: {
      id: "ServeOrgDetails",
      type: "Complex",
      complex_fields: []
    }
  };
  const collectionParent: ToolkitCaseField = {
    id: "sodAdditionalRecipientsList",
    value: [{ id: "0", value: collectionItem.value }],
    field_type: {
      id: "Collection",
      type: "Collection",
      collection_field_type: {
        id: "ServeOrgDetails",
        type: "Complex",
        complex_fields: []
      }
    }
  };

  nestedComplexField.parent = collectionItem;
  collectionItem.parent = collectionParent;
  emailName.parent = nestedComplexField;
  emailAddress.parent = nestedComplexField;

  return nestedComplexField;
}

function buildMockFormGroup(): { value: Record<string, unknown>; parent: { getRawValue(): { data: Record<string, unknown> } } } {
  return {
    value: {},
    parent: {
      getRawValue: () => ({ data: {} })
    }
  };
}

export function buildExui4493ToolkitContractEvidence(): Exui4493ToolkitContractEvidence {
  const toolkitAvailability = resolveExui4493ToolkitAvailability();
  const { webappRoot } = toolkitAvailability;

  if (!toolkitAvailability.available) {
    return {
      toolkitAvailable: false,
      webappRoot,
      toolkitPackageVersion: "unavailable",
      toolkitBundlePath: toolkitAvailability.packagePath,
      unavailableReason: toolkitAvailability.reason,
      requiredSourceMarkers: REQUIRED_TOOLKIT_SOURCE_MARKERS,
      missingSourceMarkers: [],
      rows: [],
      requiredVisibleFieldIds: REQUIRED_VISIBLE_FIELD_IDS,
      missingVisibleFieldIds: []
    };
  }

  const toolkitPackage = loadToolkitPackage(webappRoot);
  const missingSourceMarkers = REQUIRED_TOOLKIT_SOURCE_MARKERS.filter(
    (marker) => !toolkitPackage.bundleSource.includes(marker)
  );
  const ReadFieldsFilterPipe = loadReadFieldsFilterPipe(toolkitPackage.bundleSource);
  const pipe = new ReadFieldsFilterPipe();
  const transformedRows = pipe.transform(
    buildPrlServiceOfDocumentsNestedComplexFixture(),
    true,
    undefined,
    true,
    buildMockFormGroup(),
    "parent_value",
    ""
  );
  const rows = transformedRows.map((row) => ({
    fieldId: row.id,
    hidden: row.hidden === true,
    value: row.value
  }));
  const visibleFieldIds = new Set(rows.filter((row) => !row.hidden).map((row) => row.fieldId));

  return {
    toolkitAvailable: true,
    webappRoot,
    toolkitPackageVersion: toolkitPackage.version,
    toolkitBundlePath: toolkitPackage.bundlePath,
    requiredSourceMarkers: REQUIRED_TOOLKIT_SOURCE_MARKERS,
    missingSourceMarkers,
    rows,
    requiredVisibleFieldIds: REQUIRED_VISIBLE_FIELD_IDS,
    missingVisibleFieldIds: REQUIRED_VISIBLE_FIELD_IDS.filter((fieldId) => !visibleFieldIds.has(fieldId))
  };
}

export function assertExui4493ToolkitContract(evidence: Exui4493ToolkitContractEvidence): void {
  if (!evidence.toolkitAvailable) {
    return;
  }

  if (evidence.missingSourceMarkers.length > 0) {
    throw new Error(
      `Installed @hmcts/ccd-case-ui-toolkit ${evidence.toolkitPackageVersion} is missing EXUI-4493 CYA context markers: ${evidence.missingSourceMarkers.join(
        ", "
      )}. Webapp root: ${evidence.webappRoot}`
    );
  }

  if (evidence.missingVisibleFieldIds.length > 0) {
    throw new Error(
      `Installed @hmcts/ccd-case-ui-toolkit ${evidence.toolkitPackageVersion} does not render EXUI-4493 nested CYA fields: ${evidence.missingVisibleFieldIds.join(
        ", "
      )}. Webapp root: ${evidence.webappRoot}`
    );
  }
}
