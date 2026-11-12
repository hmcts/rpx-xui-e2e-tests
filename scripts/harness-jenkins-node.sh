#!/usr/bin/env bash
set -e
export NVM_DIR='/home/jenkinsssh/.nvm'
source /opt/nvm/nvm.sh
nvm install
nvm use
node -e 'const expected = require("node:fs").readFileSync(".nvmrc", "utf8").trim(); if (process.versions.node !== expected) { console.error("Node version does not match .nvmrc"); process.exit(1); }'
node "$@"
