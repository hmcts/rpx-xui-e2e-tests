const test = require("node:test");
const assert = require("node:assert/strict");
test("serialization fault drops only nested email children without mutating its source", async () => {
  const { loseNestedChild } =
    await import("./lib/exui-ccd-browser-runtime.mjs");
  const input = {
    data: {
      protectedValue: "retained",
      sodAdditionalRecipientsList: [
        {
          id: "1",
          value: {
            serveByPostOrEmail: "email",
            emailInformation: {
              emailName: "Synthetic",
              emailAddress: "synthetic@example.com",
            },
            postalInformation: { postalName: "retained" },
          },
        },
      ],
    },
  };
  const result = loseNestedChild(input);
  assert.deepEqual(
    result.data.sodAdditionalRecipientsList[0].value.emailInformation,
    { emailName: "Synthetic" },
  );
  assert.equal(
    input.data.sodAdditionalRecipientsList[0].value.emailInformation.emailName,
    "Synthetic",
  );
  assert.equal(
    input.data.sodAdditionalRecipientsList[0].value.emailInformation
      .emailAddress,
    "synthetic@example.com",
  );
  assert.equal(result.data.protectedValue, "retained");
  assert.deepEqual(
    result.data.sodAdditionalRecipientsList[0].value.postalInformation,
    { postalName: "retained" },
  );
  assert.deepEqual(loseNestedChild({ data: {} }), { data: {} });
});
