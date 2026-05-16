import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig({
  ignoreFiles: ['.prettierrc.js', 'eslint.config.mjs', 'paradox.config.ts'],
});
