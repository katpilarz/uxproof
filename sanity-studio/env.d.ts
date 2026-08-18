// Sanity's bundler statically replaces process.env.SANITY_STUDIO_* at
// build time; this shim types that access without pulling in @types/node.
declare const process: {
  env: {
    SANITY_STUDIO_PROJECT_ID?: string;
    SANITY_STUDIO_DATASET?: string;
  };
};
