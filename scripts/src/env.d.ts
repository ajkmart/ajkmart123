interface ImportMetaEnv {
  DEV?: boolean;
  [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  env: ImportMetaEnv;
}
