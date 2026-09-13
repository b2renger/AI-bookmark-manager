import type { ComponentType } from 'react';
import {
  AskIcon,
  CogIcon,
  EgressIcon,
  ImportIcon,
  LibraryIcon,
  MapIcon,
  MoonIcon,
  ReviewIcon,
  ShareIcon,
  SunIcon,
  Toast,
  TreeIcon,
  type IconProps,
} from '@cairn/ui';
import { IMPLEMENTED, SCREENS, useNavStore, useSettingsStore, useToastStore, type Screen } from '../state';
import { useT } from '../i18n/useT';
import { LibraryScreen } from './LibraryScreen';
import { ImportScreen } from './ImportScreen';
import { SettingsScreen } from './SettingsScreen';
import { EgressScreen } from './EgressScreen';
import { PlaceholderScreen } from './PlaceholderScreen';

const NAV_ICON: Record<Screen, ComponentType<IconProps>> = {
  library: LibraryIcon,
  import: ImportIcon,
  map: MapIcon,
  tree: TreeIcon,
  review: ReviewIcon,
  ask: AskIcon,
  sharing: ShareIcon,
  egress: EgressIcon,
  settings: CogIcon,
};

function ScreenBody({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'library':
      return <LibraryScreen />;
    case 'import':
      return <ImportScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'egress':
      return <EgressScreen />;
    default:
      return <PlaceholderScreen screen={screen} />;
  }
}

export function AppShell() {
  const t = useT('common');
  const screen = useNavStore((s) => s.screen);
  const setScreen = useNavStore((s) => s.setScreen);
  const settings = useSettingsStore((s) => s.settings);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="flex h-screen min-h-0 bg-surface-0 font-sans text-fg-1">
      <nav
        aria-label={t('nav.label')}
        className="flex w-52 shrink-0 flex-col border-r border-line-1 bg-surface-1"
      >
        <div className="flex items-center gap-2 px-4 py-3 text-base font-semibold tracking-tight">
          {t('app.name')}
        </div>

        <ul className="flex-1 space-y-0.5 px-2">
          {SCREENS.map((s) => {
            const Icon = NAV_ICON[s];
            const active = screen === s;
            return (
              <li key={s}>
                <button
                  type="button"
                  data-testid={`nav-${s}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setScreen(s)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active ? 'bg-surface-3 text-fg-1' : 'text-fg-2 hover:bg-surface-2 hover:text-fg-1'
                  } ${IMPLEMENTED.has(s) ? '' : 'opacity-60'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(`nav.${s}`)}</span>
                  {IMPLEMENTED.has(s) ? null : (
                    <span className="ml-auto rounded-full border border-line-2 px-1.5 text-[10px] text-fg-3">
                      {t('nav.later')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-1 border-t border-line-1 px-2 py-2">
          <div role="group" aria-label={t('locale.label')} className="flex gap-1">
            <button
              type="button"
              onClick={() => void setLocale('fr')}
              aria-pressed={settings.locale === 'fr'}
              className={`rounded px-2 py-1 text-xs font-medium ${
                settings.locale === 'fr' ? 'bg-surface-3 text-fg-1' : 'text-fg-3 hover:bg-surface-2'
              }`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => void setLocale('en')}
              aria-pressed={settings.locale === 'en'}
              className={`rounded px-2 py-1 text-xs font-medium ${
                settings.locale === 'en' ? 'bg-surface-3 text-fg-1' : 'text-fg-3 hover:bg-surface-2'
              }`}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            onClick={() => void toggleTheme()}
            aria-label={t('theme.toggle')}
            title={t(settings.theme === 'dark' ? 'theme.light' : 'theme.dark')}
            className="ml-auto rounded p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg-1"
          >
            {settings.theme === 'dark' ? (
              <SunIcon className="h-4 w-4" />
            ) : (
              <MoonIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </nav>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScreenBody screen={screen} />
      </main>

      <Toast t={t} toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
