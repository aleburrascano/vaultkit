#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const cwd = path.resolve(__dirname, '..');
const result = spawnSync('bash', ['-l', 'vault-init.sh', ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(result.status || 0);
