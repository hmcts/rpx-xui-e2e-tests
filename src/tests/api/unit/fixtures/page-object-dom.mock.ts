export const taskLocationSearchHtml = `
  <div role="listbox"><div role="option">Unrelated option outside the overlay</div></div>
  <div class="cdk-overlay-container">
    <div role="listbox" class="mat-mdc-autocomplete-panel" hidden>
      <mat-option role="option"><span>Hidden location</span></mat-option>
    </div>
    <div role="listbox" class="mat-mdc-autocomplete-panel">
      <mat-option role="option"><span class="mdc-list-item__primary-text">IA Court Centre 1</span></mat-option>
      <mat-option role="option"><span class="mdc-list-item__primary-text"><span>SSCS</span> Court Centre 1</span></mat-option>
    </div>
  </div>`;

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
