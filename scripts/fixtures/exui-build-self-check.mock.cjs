const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process"),
  { pathToFileURL } = require("node:url");
exports.buildSelfCheckFixture = async (t, { failed = false } = {}) => {
  const parent = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "build-self-check-fixture-"),
  );
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "repo");
  fs.mkdirSync(path.join(root, "scripts/fixtures"), { recursive: true });
  const source = path.resolve(__dirname, "../.."),
    argvPath = path.join(parent, "argv.json"),callsPath=path.join(parent,"spawn-calls.txt");
  const unitFiles = [
    "scripts/verify-playwright-pipeline.test.cjs",
    "scripts/tiny-self-check.test.cjs",
  ];
  for (const file of unitFiles)
    fs.writeFileSync(
      path.join(root, file),
      `const{test}=require('node:test');const assert=require('node:assert/strict');test('synthetic unit',()=>assert.equal(1,${failed && file.includes("tiny-") ? 2 : 1}));`,
    );
  fs.writeFileSync(
    path.join(root, "scripts/fixtures/harness-unit-files.json"),
    JSON.stringify(unitFiles),
  );
  fs.writeFileSync(
    path.join(root, ".gitignore"),
    "/.harness-build-self-check/\n",
  );
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: {
        "harness:unit": "node scripts/run-harness-self-check-evidence.mjs",
      },
    }),
  );
  fs.copyFileSync(
    path.join(source, "scripts/harness-self-check-reporter.mjs"),
    path.join(root, "scripts/harness-self-check-reporter.mjs"),
  );
  fs.copyFileSync(
    path.join(source, "scripts/fixtures/exui-self-check-fixed-port-lock.cjs"),
    path.join(root, "scripts/fixtures/exui-self-check-fixed-port-lock.cjs"),
  );
  const spy = path.join(parent, "child-process.mjs");
  fs.writeFileSync(
    spy,
    `import{spawn as actual,execFileSync}from'node:child_process';import fs from'node:fs';export{execFileSync};export function spawn(command,args,options){fs.appendFileSync(${JSON.stringify(callsPath)},"spawn\\n");fs.writeFileSync(${JSON.stringify(argvPath)},JSON.stringify({command,args}));return actual(command,args,options);}`,
  );
  // Only fixture-local import relocation/argv observation; production has no replacement oracle.
  let collector = fs.readFileSync(path.join(source,"scripts/run-harness-self-check-evidence.mjs"),"utf8")
    .replace('"node:child_process"', JSON.stringify(pathToFileURL(spy).href))
    .replace(
      '"./lib/exui-candidate-runtime.mjs"',
      JSON.stringify(
        pathToFileURL(
          path.join(source, "scripts/lib/exui-candidate-runtime.mjs"),
        ).href,
      ),
    );
  const modulePath = path.join(
    root,
    "scripts/run-harness-self-check-evidence.mjs",
  );
  fs.writeFileSync(modulePath, collector);
  const git = (args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git(["init", "-q"]);
  git(["add", "."]);
  git([
    "-c",
    "user.name=Synthetic Fixture",
    "-c",
    "user.email=fixture@harness.example.com",
    "commit",
    "-qm",
    "test: synthetic self-check fixture",
  ]);
  const api = await import(pathToFileURL(modulePath).href);
  return {
    parent,
    root,
    api,
    modulePath,
    argvPath,
    callsPath,
    unitFiles,
    privateRoot: path.join(root, ".harness-build-self-check"),
  };
};

// Full reporter body with fixture-local import relocation only. The actual held
// reader remains the collector copied above, rooted in this synthetic repository.
function assertControl(){if(process.env.SELF_CHECK_HELD_READBACK_TEST_CONTROL!=='skip-projection-match')throw Error('FIXED_HELD_READBACK_CONTROL');}
exports.fixturePublicReporter = f => {
  const {Module}=require('node:module'),source=path.resolve(__dirname,'..');
  const file=path.join(f.root,'scripts/harness-public-odhin-reporter.cjs');
  let text=fs.readFileSync(path.join(source,'harness-public-odhin-reporter.cjs'),'utf8');
  if(process.env.SELF_CHECK_HELD_READBACK_TEST_CONTROL!==undefined){assertControl();const guard="      if(!require('node:util').isDeepStrictEqual(actual,record.buildSelfChecks))throw failure();";if(text.split(guard).length!==2)throw Error('EXACT_HELD_COMPARISON_REQUIRED');text=text.replace(guard,'');}
  text=text.replace(/require\((["'])(\.\/[^"']+)\1\)/g,(_all,_quote,name)=>'require('+JSON.stringify(name==='./run-harness-self-check-evidence.mjs'?path.join(f.root,'scripts',name):path.resolve(source,name))+')');
  text=text.replace(/import\((["'])(\.\/[^"']+)\1\)/g,(_all,_quote,name)=>'import('+JSON.stringify(pathToFileURL(name==='./run-harness-self-check-evidence.mjs'?path.join(f.root,'scripts',name):path.resolve(source,name)).href)+')');
  text=text.replaceAll('__dirname',JSON.stringify(source));
  fs.writeFileSync(file,text);
  const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(source);loaded._compile(text,file);
  require.cache[file]=loaded;
  return {Reporter:loaded.exports,reporterFile:file,collection(){
    const target=path.join(f.root,'scripts/run-harness-local-aat.cjs');
    const body=fs.readFileSync(path.join(source,'run-harness-local-aat.cjs'),'utf8').replace(/require\((["'])(\.\/[^"']+)\1\)/g,(_all,_quote,name)=>'require('+JSON.stringify(name==='./harness-public-odhin-reporter.cjs'?file:path.resolve(source,name))+')');
    const mod=new Module(target,module);mod.filename=target;mod.paths=Module._nodeModulePaths(source);mod._compile(body,target);return mod.exports;
  }};
};
