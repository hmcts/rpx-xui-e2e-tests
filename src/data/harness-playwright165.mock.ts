export const INERT_ACTION_TIMEOUT_MS = 500;

export const inertInteractionHtml = `
  <section data-testid="interaction-gate" inert>
    <button data-testid="submit-canary" type="button">Submit canary</button>
  </section>
  <p role="status">Unchanged</p>
  <script>
    document.querySelector('[data-testid="submit-canary"]').addEventListener('click', () => {
      document.querySelector('[role="status"]').textContent = 'Clicked';
    });
  </script>
`;

export const cookieCanaries = [
  { name: "host_only", value: "synthetic-host", url: "https://compat.invalid/" },
  { name: "domain_wide", value: "synthetic-domain", domain: ".compat.invalid", path: "/" },
  { name: "api_path", value: "synthetic-path", domain: ".compat.invalid", path: "/api" },
];

export const queryCanary = {
  existingQuery: "/echo?existing=keep&duplicate=original",
  appendedQuery: "duplicate=added&encoded=a%2Bb&space=two+words",
  expectedEntries: [
    ["existing", "keep"],
    ["duplicate", "original"],
    ["duplicate", "added"],
    ["encoded", "a+b"],
    ["space", "two words"],
  ],
};
