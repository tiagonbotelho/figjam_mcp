import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

// Bundle code.ts → code.js
await esbuild.build({
  entryPoints: ['figma-plugin/code.ts'],
  bundle: true,
  outfile: 'figma-plugin/code.js',
  format: 'iife',
  target: 'es2015',
  minify: false,
});

console.log('Plugin built: figma-plugin/code.js');
