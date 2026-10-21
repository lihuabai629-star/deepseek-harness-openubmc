/** Private configuration links on the bundle's existing Plugins settings page. @module */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

const en = {
  description: 'Accounts stay on this DSH host. Saving activates a private revision; device checks run only when requested.',
  targets: 'Device accounts', kb: 'Knowledge base', conan: 'Conan',
  diagnostics: 'Local diagnostics and dependency repair are available in each configuration page.',
}
const zh: Record<keyof typeof en, string> = {
  description: '账号保存在此 DSH 主机。保存后激活私有配置版本；设备连接检查需显式执行。',
  targets: '设备账号', kb: '知识库', conan: 'Conan',
  diagnostics: '各配置页均可检查本地状态和修复依赖。',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Private openUBMC settings navigation. */
    openubmcSettings: keyof typeof en
  }
}

/** Required browser registries. */
export const inject = ['slots', 'locale']

/**
 * Add configuration to the owned bundle without registering conversation presentation.
 * @param ctx - Browser plugin fiber.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('openubmcSettings', { en, zh }))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: 'dsh-openubmc', locale: 'openubmcSettings',
  }, Settings))
}

function Settings({ t }: PropsLocale<'openubmcSettings'>) {
  return <div>
    <p>{t('description')}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {(['targets', 'kb', 'conan'] as const).map(kind => <Button key={kind} variant="outline"
        onClick={() => { window.open(new URL(`./openubmc?kind=${kind}`, document.baseURI), '_blank', 'noopener,noreferrer') }}>
        {t(kind)}
      </Button>)}
    </div>
    <p>{t('diagnostics')}</p>
  </div>
}
