import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

/** Once added, an upgrade script can never be removed. */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = []
