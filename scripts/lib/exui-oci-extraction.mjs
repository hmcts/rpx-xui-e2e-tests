import assert from "node:assert/strict";
import path from "node:path";
import {
  extractionContainerArguments,
  assertOwnedContainer,
} from "./exui-oci-runtime.mjs";
import {
  hostDocker,
  inspectHostContainer,
  removeHostResource,
} from "./exui-host-invocation.mjs";
import { writeJsonAtomic } from "./exui-evidence-io.mjs";

// A planned name is recorded before Docker may create anything; no image code is executed for extraction.
export async function withOwnedImageExtraction(
  { descriptor, observedImageId, owner, output, resources },
  copy,
  { docker = hostDocker, inspect = inspectHostContainer } = {},
) {
  const name = `${owner}-payload`,
    resource = {
      kind: "container",
      name,
      owner,
      service: "payload-extraction",
      image: observedImageId,
      mounts: [],
      id: null,
      removed: false,
    };
  const record = () =>
    writeJsonAtomic(path.join(output, "extraction-recovery.json"), resource);
  resources.set(name, resource);
  record();
  try {
    resource.id = docker(extractionContainerArguments({ descriptor, owner }));
    assert(/^[a-f0-9]{64}$/.test(resource.id), "OCI_EXTRACTION_CID_REQUIRED");
    record();
    assertOwnedContainer(inspect(resource.id), { ...resource, running: false });
    return await copy(resource.id);
  } finally {
    try {
      await removeHostResource(resources, name, output, { docker, inspect });
    } finally {
      record();
    }
  }
}
