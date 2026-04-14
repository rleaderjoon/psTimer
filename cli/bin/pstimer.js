#!/usr/bin/env node
import('../dist/index.js').catch((err) => {
  console.error('Failed to start pstimer:', err);
  process.exit(1);
});
