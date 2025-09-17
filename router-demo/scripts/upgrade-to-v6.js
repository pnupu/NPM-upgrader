#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.dependencies = pkg.dependencies || {};
pkg.devDependencies = pkg.devDependencies || {};

// Set react-router-dom v6
pkg.dependencies['react-router-dom'] = '6.30.1';

// Remove v5-only type packages (v6 ships its own types)
delete pkg.devDependencies['@types/react-router-dom'];
delete pkg.devDependencies['@types/history'];

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Updated package.json: set react-router-dom to 6.30.1 and removed v5 type packages.');

if (process.argv.includes('--install')) {
  console.log('Installing dependencies...');
  execSync('npm install', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
}


