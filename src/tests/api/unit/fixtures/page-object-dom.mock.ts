export const caseFileFolderHtml = `
  <div id="case-file-view"><div class="document-tree-container"><cdk-tree role="tree">
    <cdk-nested-tree-node class="document-tree-container__folder" role="treeitem">
      <button class="node" aria-expanded="false" onclick="this.setAttribute('aria-expanded', 'true'); this.nextElementSibling.hidden = false">
        <span class="node__name--folder">Orders</span>
      </button>
      <div role="group" hidden>
        <cdk-nested-tree-node class="document-tree-container__folder" role="treeitem">
          <button class="node" aria-expanded="false" onclick="this.setAttribute('aria-expanded', 'true')">
            <span class="node__name--folder">Evidence</span>
          </button>
        </cdk-nested-tree-node>
      </div>
    </cdk-nested-tree-node>
    <cdk-nested-tree-node class="document-tree-container__folder" role="treeitem">
      <button class="node" aria-expanded="false"><span class="node__name--folder">Evidence</span></button>
    </cdk-nested-tree-node>
  </cdk-tree></div></div>`;

export const checkYourAnswersHtml = `
  <style>.govuk-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }</style>
  <table id="answers"><tbody>
    <tr><th>Text Field 0</th><td>Example</td><td class="case-field-change">Change</td></tr>
    <tr><th>Choose divorce reasons</th><td>
      <table class="multi-select-list-field-table">
        <caption class="govuk-visually-hidden">Multi selection table</caption>
        <thead><tr><th class="govuk-visually-hidden" scope="col">Value</th></tr></thead>
        <tbody><tr><td><span>Adultery</span></td></tr><tr><td><span>Desertion</span></td></tr></tbody>
      </table>
    </td><td class="case-field-change">Change</td></tr>
    <tr><th>Person</th><td><table id="person"><tbody><tr><th>First Name</th><td>Alice</td></tr></tbody></table></td></tr>
    <tr hidden><th>Hidden field</th><td>Hidden value</td></tr>
    <tr><th>Text Field 0</th><td>Later duplicate</td></tr>
  </tbody></table>
  <table id="empty"><tbody></tbody></table>`;
