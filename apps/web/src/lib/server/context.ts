import os from "node:os";
import {
  type PathEnv,
  ConfigStore,
  detectOpenCode,
  buildState,
  companionHome,
} from "@occ/adapter";
import {
  CompanionHome,
  BackupManager,
} from "@occ/core";

export function getPathEnv(): PathEnv {
  return {
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
  };
}

let cachedHome: CompanionHome | null = null;
export async function getCompanionHome(): Promise<CompanionHome> {
  if (!cachedHome) {
    const penv = getPathEnv();
    const dir = companionHome(penv);
    cachedHome = new CompanionHome(dir);
    await cachedHome.init();
  }
  return cachedHome;
}

export async function getStore(): Promise<ConfigStore> {
  const home = await getCompanionHome();
  const settings = await home.readSettings();
  const penv = getPathEnv();

  const configDirOverride = settings.configDirOverride || process.env.OPENCODE_CONFIG_DIR || null;
  const projectDir = settings.projectDir || process.env.OCC_PROJECT_DIR || null;

  return new ConfigStore(penv, {
    configDirOverride,
    projectDir,
  });
}

export async function getAppContext() {
  const penv = getPathEnv();
  const home = await getCompanionHome();
  const store = await getStore();
  const install = await detectOpenCode(penv);
  const files = await store.loadAll();
  const state = buildState(files);
  const backupManager = new BackupManager(home.backupsDir);

  return {
    penv,
    home,
    store,
    install,
    files,
    state,
    backupManager,
  };
}
