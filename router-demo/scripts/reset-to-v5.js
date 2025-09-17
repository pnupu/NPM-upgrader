#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.dependencies = pkg.dependencies || {};
pkg.devDependencies = pkg.devDependencies || {};

// Set react-router-dom back to v5 line
pkg.dependencies['react-router-dom'] = '^5.3.4';

// Ensure v5 type packages present
pkg.devDependencies['@types/react-router-dom'] = '^5.3.3';
pkg.devDependencies['@types/history'] = '^4.7.11';

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Updated package.json: set react-router-dom to ^5.3.4 and restored v5 type packages.');

if (process.argv.includes('--install')) {
  console.log('Installing dependencies...');
  execSync('npm install', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
}


