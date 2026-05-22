/* Global ambient module declarations for packages installed via pnpm workspace
   that TypeScript's bundler resolver may not resolve from within a workspace
   sub-package.  These declarations let `tsc --noEmit` pass without errors
   while Vite (which uses its own resolver) handles the actual import at
   build/dev time.

   Do NOT add hand-rolled type stubs here; only declare the module so that
   dynamic `import("react-map-gl")` is not flagged as a missing module.
   Actual types are provided by the package's own bundled declarations when
   Vite resolves it. */
declare module "react-map-gl";
declare module "react-map-gl/mapbox";
declare module "mapbox-gl";
